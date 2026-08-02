//! The production boundary for MacWin's frozen `.habitpack` 1.0.0 profile.
//!
//! The container is deliberately implemented here instead of delegated to a
//! command line archive tool. Only the canonical M1 ZIP subset is accepted and
//! package values are converted into fixed, typed evidence before the platform
//! adapters see them.

use crc32fast::Hasher as Crc32;
use flate2::{Decompress, FlushDecompress, Status};
use serde::de::{self, Deserialize, Deserializer, MapAccess, SeqAccess, Visitor};
use serde::{Deserialize as DeriveDeserialize, Serialize};
use serde_json::{Map, Number, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};
use std::fmt;
use std::path::Path;
use time::{format_description, OffsetDateTime};

pub const SCHEMA_VERSION: &str = "1.0.0";
const MAX_ARCHIVE: usize = 8 * 1024 * 1024;
const MAX_TOTAL: u64 = 16 * 1024 * 1024;
const MAX_ENTRIES: usize = 128;
const MAX_MANIFEST: u64 = 64 * 1024;
const MAX_JSON: u64 = 1024 * 1024;
const MAX_SECRET: u64 = 64 * 1024;
const MAX_NESTING: usize = 64;
const MAX_INTEGER_DIGITS: usize = 64;
const MAX_RATIO: u64 = 100;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{code}")]
pub struct HabitpackError {
    pub code: &'static str,
}

fn error(code: &'static str) -> HabitpackError {
    HabitpackError { code }
}
type Result<T> = std::result::Result<T, HabitpackError>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, DeriveDeserialize)]
pub struct KeyboardEvidence {
    pub speed: u8,
    pub delay: u8,
    pub layouts: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, DeriveDeserialize)]
pub struct PointerEvidence {
    pub mouse_direction: Option<String>,
    pub trackpad_direction: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, DeriveDeserialize)]
pub struct SoftwareEvidence {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub is_default_browser: bool,
    pub official_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportedPackage {
    pub created_at: String,
    pub source_os: String,
    pub keyboard: Option<KeyboardEvidence>,
    pub pointer: Option<PointerEvidence>,
    pub software: Vec<SoftwareEvidence>,
    pub guide_requested: bool,
    pub contains_secrets: bool,
    pub entries: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PackageReceipt {
    pub package_bytes: usize,
    pub modules: Vec<String>,
    pub contains_secrets: bool,
}

#[derive(Debug, Clone, Copy)]
struct CentralMeta {
    made_by: u16,
    version_needed: u16,
    flags: u16,
    method: u16,
    dos_time: u16,
    dos_date: u16,
    crc: u32,
    compressed_size: u64,
    file_size: u64,
    internal_attr: u16,
    external_attr: u32,
    local_offset: u64,
}

fn u16_at(data: &[u8], at: usize) -> Result<u16> {
    let bytes = data
        .get(at..at + 2)
        .ok_or_else(|| error("HP_ZIP_INVALID"))?;
    Ok(u16::from_le_bytes([bytes[0], bytes[1]]))
}

fn u32_at(data: &[u8], at: usize) -> Result<u32> {
    let bytes = data
        .get(at..at + 4)
        .ok_or_else(|| error("HP_ZIP_INVALID"))?;
    Ok(u32::from_le_bytes(
        bytes.try_into().map_err(|_| error("HP_ZIP_INVALID"))?,
    ))
}

fn checked_end(start: usize, len: u64, total: usize) -> Result<usize> {
    let end = (start as u64)
        .checked_add(len)
        .ok_or_else(|| error("HP_ZIP_INVALID"))?;
    let end = usize::try_from(end).map_err(|_| error("HP_ZIP_INVALID"))?;
    if end > total {
        return Err(error("HP_ZIP_INVALID"));
    }
    Ok(end)
}

fn resource_limit(name: &[u8]) -> (u64, &'static str) {
    if name == b"manifest.json" {
        (MAX_MANIFEST, "HP_MANIFEST_TOO_LARGE")
    } else if name.starts_with(b"secrets/") {
        (MAX_SECRET, "HP_SECRET_TOO_LARGE")
    } else {
        (MAX_JSON, "HP_JSON_TOO_LARGE")
    }
}

fn has_zip64_extra(extra: &[u8]) -> bool {
    let mut at = 0;
    while at + 4 <= extra.len() {
        let kind = u16::from_le_bytes([extra[at], extra[at + 1]]);
        let len = u16::from_le_bytes([extra[at + 2], extra[at + 3]]) as usize;
        if kind == 1 {
            return true;
        }
        at = match at.checked_add(4 + len) {
            Some(next) if next <= extra.len() => next,
            _ => return false,
        };
    }
    false
}

fn allowed_path(path: &str) -> bool {
    matches!(
        path,
        "selections.json"
            | "modules/keyboard.json"
            | "modules/pointer.json"
            | "modules/software.json"
            | "modules/developer.json"
            | "modules/wifi.json"
    ) || path.strip_prefix("secrets/wifi/").is_some_and(|name| {
        name.len() >= 5
            && name.len() <= 68
            && name.ends_with(".bin")
            && name[..name.len() - 4]
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_' || b == b'-')
    })
}

fn decode_deflate(input: &[u8], expected: u64, hard_limit: u64) -> Result<Vec<u8>> {
    if expected > hard_limit {
        return Err(error("HP_RESOURCE_LIMIT"));
    }
    let capacity = usize::try_from(
        expected
            .checked_add(1)
            .ok_or_else(|| error("HP_RESOURCE_LIMIT"))?,
    )
    .map_err(|_| error("HP_RESOURCE_LIMIT"))?;
    let mut output = Vec::with_capacity(capacity);
    let mut decoder = Decompress::new(true);
    let status = decoder
        .decompress_vec(input, &mut output, FlushDecompress::Finish)
        .map_err(|_| error("HP_ZIP_STREAM"))?;
    if status != Status::StreamEnd
        || decoder.total_in() as usize != input.len()
        || output.len() as u64 != expected
        || output.len() as u64 > hard_limit
    {
        return Err(error("HP_ZIP_STREAM"));
    }
    Ok(output)
}

fn parse_zip(data: &[u8]) -> Result<BTreeMap<String, Vec<u8>>> {
    if data.len() > MAX_ARCHIVE {
        return Err(error("HP_ARCHIVE_TOO_LARGE"));
    }
    if data.len() < 22
        || data.get(..4) != Some(b"PK\x03\x04")
        || data.get(data.len() - 22..data.len() - 18) != Some(b"PK\x05\x06")
    {
        return Err(error("HP_ZIP_LAYOUT"));
    }
    let eocd = data.len() - 22;
    let disk = u16_at(data, eocd + 4)?;
    let central_disk = u16_at(data, eocd + 6)?;
    let disk_entries = u16_at(data, eocd + 8)?;
    let total_entries = u16_at(data, eocd + 10)?;
    let central_size = u32_at(data, eocd + 12)? as u64;
    let central_offset = u32_at(data, eocd + 16)? as u64;
    if u16_at(data, eocd + 20)? != 0 {
        return Err(error("HP_ZIP_COMMENT"));
    }
    if disk == u16::MAX
        || central_disk == u16::MAX
        || disk_entries == u16::MAX
        || total_entries == u16::MAX
        || central_size == u32::MAX as u64
        || central_offset == u32::MAX as u64
    {
        return Err(error("HP_ZIP64_ENTRY"));
    }
    if disk != 0 || central_disk != 0 || disk_entries != total_entries {
        return Err(error("HP_ZIP_MULTIDISK"));
    }
    let central_start = usize::try_from(central_offset).map_err(|_| error("HP_ZIP_LAYOUT"))?;
    let central_len = usize::try_from(central_size).map_err(|_| error("HP_ZIP_LAYOUT"))?;
    if central_start == 0 || central_start.checked_add(central_len) != Some(eocd) {
        return Err(error("HP_ZIP_LAYOUT"));
    }
    if eocd >= 20 && data.get(eocd - 20..eocd - 16) == Some(b"PK\x06\x07") {
        return Err(error("HP_ZIP64_ENTRY"));
    }

    let mut central: Vec<(Vec<u8>, CentralMeta)> = Vec::new();
    let mut at = central_start;
    while at < eocd {
        if data.get(at..at + 4) != Some(b"PK\x01\x02") || at + 46 > eocd {
            return Err(error("HP_ZIP_LAYOUT"));
        }
        let meta = CentralMeta {
            made_by: u16_at(data, at + 4)?,
            version_needed: u16_at(data, at + 6)?,
            flags: u16_at(data, at + 8)?,
            method: u16_at(data, at + 10)?,
            dos_time: u16_at(data, at + 12)?,
            dos_date: u16_at(data, at + 14)?,
            crc: u32_at(data, at + 16)?,
            compressed_size: u32_at(data, at + 20)? as u64,
            file_size: u32_at(data, at + 24)? as u64,
            internal_attr: u16_at(data, at + 36)?,
            external_attr: u32_at(data, at + 38)?,
            local_offset: u32_at(data, at + 42)? as u64,
        };
        let name_len = u16_at(data, at + 28)? as usize;
        let extra_len = u16_at(data, at + 30)? as usize;
        let comment_len = u16_at(data, at + 32)? as usize;
        let end = at
            .checked_add(46 + name_len + extra_len + comment_len)
            .ok_or_else(|| error("HP_ZIP_LAYOUT"))?;
        if end > eocd || comment_len != 0 {
            return Err(error("HP_ZIP_LAYOUT"));
        }
        if meta.local_offset == u32::MAX as u64
            || meta.compressed_size == u32::MAX as u64
            || meta.file_size == u32::MAX as u64
            || u16_at(data, at + 34)? == u16::MAX
        {
            return Err(error("HP_ZIP64_ENTRY"));
        }
        if u16_at(data, at + 34)? != 0 {
            return Err(error("HP_ZIP_MULTIDISK"));
        }
        let name = data[at + 46..at + 46 + name_len].to_vec();
        let _ = std::str::from_utf8(&name).map_err(|_| error("HP_ZIP_INVALID"))?;
        let extra = &data[at + 46 + name_len..at + 46 + name_len + extra_len];
        if has_zip64_extra(extra) {
            return Err(error("HP_ZIP64_ENTRY"));
        }
        if extra_len != 0 {
            return Err(error("HP_ZIP_EXTRA"));
        }
        central.push((name, meta));
        at = end;
    }
    if at != eocd || central.len() != total_entries as usize {
        return Err(error("HP_ZIP_LAYOUT"));
    }
    if central.len() > MAX_ENTRIES {
        return Err(error("HP_TOO_MANY_ENTRIES"));
    }
    let mut names = HashSet::new();
    for (name, _) in &central {
        if !names.insert(name.clone()) {
            return Err(error("HP_ZIP_DUPLICATE_ENTRY"));
        }
    }
    let mut expected_names: Vec<Vec<u8>> = central.iter().map(|(name, _)| name.clone()).collect();
    expected_names.sort();
    if expected_names.first().map(Vec::as_slice) != Some(b"manifest.json") {
        return Err(error("HP_MANIFEST_MISSING"));
    }
    let central_names: Vec<Vec<u8>> = central.iter().map(|(name, _)| name.clone()).collect();
    if central_names != expected_names {
        return Err(error("HP_ZIP_ORDER"));
    }

    let mut ordered = central.clone();
    ordered.sort_by_key(|(_, meta)| meta.local_offset);
    let mut payloads = BTreeMap::new();
    let mut expected_offset = 0u64;
    let mut total = 0u64;
    for (name_bytes, meta) in ordered {
        let local = usize::try_from(meta.local_offset).map_err(|_| error("HP_ZIP_LAYOUT"))?;
        if local + 30 > central_start || data.get(local..local + 4) != Some(b"PK\x03\x04") {
            return Err(error("HP_ZIP_LAYOUT"));
        }
        if meta.local_offset != expected_offset {
            return Err(error("HP_ZIP_LAYOUT"));
        }
        let local_version = u16_at(data, local + 4)?;
        let local_flags = u16_at(data, local + 6)?;
        let local_method = u16_at(data, local + 8)?;
        let local_time = u16_at(data, local + 10)?;
        let local_date = u16_at(data, local + 12)?;
        let local_crc = u32_at(data, local + 14)?;
        let local_compressed = u32_at(data, local + 18)? as u64;
        let local_file = u32_at(data, local + 22)? as u64;
        let name_len = u16_at(data, local + 26)? as usize;
        let extra_len = u16_at(data, local + 28)? as usize;
        if local_compressed == u32::MAX as u64 || local_file == u32::MAX as u64 {
            return Err(error("HP_ZIP64_ENTRY"));
        }
        let name_end = local
            .checked_add(30 + name_len)
            .ok_or_else(|| error("HP_ZIP_LAYOUT"))?;
        let data_start = name_end
            .checked_add(extra_len)
            .ok_or_else(|| error("HP_ZIP_LAYOUT"))?;
        if data_start > central_start {
            return Err(error("HP_ZIP_LAYOUT"));
        }
        let local_name = data[local + 30..name_end].to_vec();
        if local_name != name_bytes
            || (
                local_flags,
                local_method,
                local_crc,
                local_compressed,
                local_file,
            ) != (
                meta.flags,
                meta.method,
                meta.crc,
                meta.compressed_size,
                meta.file_size,
            )
            || local_version != meta.version_needed
            || local_time != meta.dos_time
            || local_date != meta.dos_date
        {
            return Err(error("HP_ZIP_LAYOUT"));
        }
        if std::str::from_utf8(&local_name).is_err() {
            return Err(error("HP_ZIP_INVALID"));
        }
        if extra_len != 0 {
            return Err(error("HP_ZIP_EXTRA"));
        }
        let profile_error = if meta.flags & 1 != 0 {
            Some("HP_ENCRYPTED_ENTRY")
        } else if meta.flags & 8 != 0 {
            Some("HP_ZIP_LAYOUT")
        } else if meta.flags != 0 {
            Some("HP_ZIP_FLAGS")
        } else if !matches!(meta.method, 0 | 8) {
            Some("HP_ZIP_COMPRESSION")
        } else if meta.made_by != 0x0314
            || meta.version_needed != if meta.method == 0 { 10 } else { 20 }
        {
            Some("HP_ZIP_VERSION")
        } else if (meta.dos_time, meta.dos_date) != (0, 0x0021) {
            Some("HP_ZIP_TIMESTAMP")
        } else if meta.internal_attr != 0 || meta.external_attr != ((0o100000 | 0o600) << 16) {
            Some("HP_ZIP_ATTRIBUTES")
        } else {
            None
        };
        if let Some(code) = profile_error {
            return Err(error(code));
        }
        let (limit, limit_code) = resource_limit(&name_bytes);
        if meta.file_size > limit {
            return Err(error(limit_code));
        }
        if meta.compressed_size > 0
            && meta.file_size > meta.compressed_size.saturating_mul(MAX_RATIO)
        {
            return Err(error("HP_COMPRESSION_RATIO"));
        }
        let compressed_end = checked_end(data_start, meta.compressed_size, data.len())?;
        let compressed = &data[data_start..compressed_end];
        let decoded = if meta.method == 0 {
            if meta.compressed_size != meta.file_size {
                return Err(error("HP_ZIP_STREAM"));
            }
            compressed.to_vec()
        } else {
            decode_deflate(compressed, meta.file_size, limit)?
        };
        if decoded.len() as u64 != meta.file_size {
            return Err(error("HP_ZIP_STREAM"));
        }
        let mut crc = Crc32::new();
        crc.update(&decoded);
        if crc.finalize() != meta.crc {
            return Err(error("HP_ZIP_INVALID"));
        }
        total = total
            .checked_add(meta.file_size)
            .ok_or_else(|| error("HP_TOTAL_TOO_LARGE"))?;
        if total > MAX_TOTAL {
            return Err(error("HP_TOTAL_TOO_LARGE"));
        }
        expected_offset = compressed_end as u64;
        let name = String::from_utf8(name_bytes).map_err(|_| error("HP_ZIP_INVALID"))?;
        if !allowed_path(&name) && name != "manifest.json" {
            return Err(error("HP_PATH_NOT_ALLOWED"));
        }
        payloads.insert(name, decoded);
    }
    if expected_offset != central_offset {
        return Err(error("HP_ZIP_LAYOUT"));
    }
    Ok(payloads)
}

#[derive(Debug)]
enum StrictValue {
    Null,
    Bool(bool),
    Number(Number),
    String(String),
    Array(Vec<StrictValue>),
    Object(Vec<(String, StrictValue)>),
}

impl<'de> Deserialize<'de> for StrictValue {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct ValueVisitor;
        impl<'de> Visitor<'de> for ValueVisitor {
            type Value = StrictValue;
            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("strict JSON value")
            }
            fn visit_unit<E>(self) -> std::result::Result<Self::Value, E> {
                Ok(StrictValue::Null)
            }
            fn visit_bool<E>(self, value: bool) -> std::result::Result<Self::Value, E> {
                Ok(StrictValue::Bool(value))
            }
            fn visit_i64<E>(self, value: i64) -> std::result::Result<Self::Value, E> {
                Ok(StrictValue::Number(Number::from(value)))
            }
            fn visit_u64<E>(self, value: u64) -> std::result::Result<Self::Value, E> {
                Ok(StrictValue::Number(Number::from(value)))
            }
            fn visit_f64<E>(self, value: f64) -> std::result::Result<Self::Value, E>
            where
                E: de::Error,
            {
                Number::from_f64(value)
                    .map(StrictValue::Number)
                    .ok_or_else(|| E::custom("nonfinite"))
            }
            fn visit_str<E>(self, value: &str) -> std::result::Result<Self::Value, E> {
                Ok(StrictValue::String(value.to_owned()))
            }
            fn visit_string<E>(self, value: String) -> std::result::Result<Self::Value, E> {
                Ok(StrictValue::String(value))
            }
            fn visit_seq<A>(self, mut seq: A) -> std::result::Result<Self::Value, A::Error>
            where
                A: SeqAccess<'de>,
            {
                let mut values = Vec::new();
                while let Some(value) = seq.next_element()? {
                    values.push(value);
                }
                Ok(StrictValue::Array(values))
            }
            fn visit_map<A>(self, mut map: A) -> std::result::Result<Self::Value, A::Error>
            where
                A: MapAccess<'de>,
            {
                let mut values = Vec::new();
                let mut keys = HashSet::new();
                while let Some((key, value)) = map.next_entry::<String, StrictValue>()? {
                    if !keys.insert(key.clone()) {
                        return Err(de::Error::custom("duplicate"));
                    }
                    values.push((key, value));
                }
                Ok(StrictValue::Object(values))
            }
        }
        deserializer.deserialize_any(ValueVisitor)
    }
}

fn strict_to_value(value: StrictValue) -> Value {
    match value {
        StrictValue::Null => Value::Null,
        StrictValue::Bool(v) => Value::Bool(v),
        StrictValue::Number(v) => Value::Number(v),
        StrictValue::String(v) => Value::String(v),
        StrictValue::Array(v) => Value::Array(v.into_iter().map(strict_to_value).collect()),
        StrictValue::Object(v) => Value::Object(
            v.into_iter()
                .map(|(key, value)| (key, strict_to_value(value)))
                .collect(),
        ),
    }
}

fn scan_json(text: &str) -> Result<()> {
    let bytes = text.as_bytes();
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    let mut index = 0usize;
    while index < bytes.len() {
        let ch = bytes[index] as char;
        if in_string {
            if escaped {
                if ch == 'u' && index + 4 < bytes.len() {
                    let escaped_hex = &text[index + 1..index + 5];
                    if escaped_hex.chars().all(|value| value.is_ascii_hexdigit()) {
                        let code = u16::from_str_radix(escaped_hex, 16).unwrap_or(0);
                        if (0xd800..=0xdfff).contains(&code) {
                            return Err(error("HP_JSON_INVALID"));
                        }
                    }
                }
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            index += 1;
            continue;
        }
        if ch == '"' {
            in_string = true;
            index += 1;
            continue;
        }
        if ch == '{' || ch == '[' {
            depth += 1;
            if depth > MAX_NESTING {
                return Err(error("HP_JSON_LIMIT"));
            }
        }
        if ch == '}' || ch == ']' {
            depth = depth
                .checked_sub(1)
                .ok_or_else(|| error("HP_JSON_INVALID"))?;
        }
        if (ch == 'N' && text[index..].starts_with("NaN"))
            || (ch == 'I' && text[index..].starts_with("Infinity"))
            || (ch == '-' && text[index..].starts_with("-Infinity"))
        {
            return Err(error("HP_JSON_NONFINITE"));
        }
        if ch == '-' || ch.is_ascii_digit() {
            let start = index;
            let mut end = index + 1;
            while end < bytes.len()
                && (bytes[end].is_ascii_digit() || b".eE+-".contains(&bytes[end]))
            {
                end += 1;
            }
            let token = &text[start..end];
            let digits = token.chars().filter(char::is_ascii_digit).count();
            if !token.contains('.')
                && !token.contains('e')
                && !token.contains('E')
                && digits > MAX_INTEGER_DIGITS
            {
                return Err(error("HP_JSON_LIMIT"));
            }
            if (token.contains('.') || token.contains('e') || token.contains('E'))
                && token
                    .parse::<f64>()
                    .map(|value| !value.is_finite())
                    .unwrap_or(true)
            {
                return Err(error("HP_JSON_NONFINITE"));
            }
            index = end;
            continue;
        }
        index += 1;
    }
    Ok(())
}

fn strict_json(bytes: &[u8]) -> Result<Value> {
    let text = std::str::from_utf8(bytes).map_err(|_| error("HP_JSON_INVALID"))?;
    if text.starts_with('\u{feff}') {
        return Err(error("HP_JSON_INVALID"));
    }
    scan_json(text)?;
    let mut deserializer = serde_json::Deserializer::from_str(text);
    let value = StrictValue::deserialize(&mut deserializer).map_err(|parse_error| {
        if parse_error.to_string().contains("duplicate") {
            error("HP_JSON_DUPLICATE_KEY")
        } else if parse_error.to_string().contains("nonfinite") {
            error("HP_JSON_NONFINITE")
        } else {
            error("HP_JSON_INVALID")
        }
    })?;
    deserializer.end().map_err(|_| error("HP_JSON_INVALID"))?;
    Ok(strict_to_value(value))
}

fn object(value: &Value) -> Result<&Map<String, Value>> {
    value.as_object().ok_or_else(|| error("HP_SCHEMA"))
}
fn array(value: &Value) -> Result<&Vec<Value>> {
    value.as_array().ok_or_else(|| error("HP_SCHEMA"))
}
fn string(value: &Value) -> Result<&str> {
    value.as_str().ok_or_else(|| error("HP_SCHEMA"))
}
fn required<'a>(value: &'a Map<String, Value>, key: &str) -> Result<&'a Value> {
    value.get(key).ok_or_else(|| error("HP_SCHEMA"))
}
fn closed(value: &Map<String, Value>, allowed: &[&str]) -> Result<()> {
    if value.keys().any(|key| !allowed.contains(&key.as_str())) {
        Err(error("HP_SCHEMA"))
    } else {
        Ok(())
    }
}
fn exact(value: &Value, expected: &str) -> Result<()> {
    if value.as_str() == Some(expected) {
        Ok(())
    } else {
        Err(error("HP_SCHEMA"))
    }
}
fn nonempty_string(value: &Value, max: usize) -> Result<String> {
    let text = string(value)?;
    if text.is_empty() || text.chars().count() > max {
        return Err(error("HP_SCHEMA"));
    }
    Ok(text.to_owned())
}
fn bool_value(value: &Value) -> Result<bool> {
    value.as_bool().ok_or_else(|| error("HP_SCHEMA"))
}

fn valid_datetime(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 20
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes[10] != b'T'
        || bytes[13] != b':'
        || bytes[16] != b':'
        || bytes[19] != b'Z'
    {
        return false;
    }
    for range in [0..4, 5..7, 8..10, 11..13, 14..16, 17..19] {
        if !bytes[range].iter().all(u8::is_ascii_digit) {
            return false;
        }
    }
    let number = |start: usize, end: usize| value[start..end].parse::<u32>().unwrap_or(999);
    let (year, month, day, hour, minute, second) = (
        number(0, 4),
        number(5, 7),
        number(8, 10),
        number(11, 13),
        number(14, 16),
        number(17, 19),
    );
    if month == 0 || month > 12 || day == 0 || hour > 23 || minute > 59 || second > 59 {
        return false;
    }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    day <= days[(month - 1) as usize]
}

fn parse_keyboard_label(label: &str) -> Option<KeyboardEvidence> {
    let rest = label.strip_prefix("alpha.keyboard.repeat:")?;
    let mut speed = None;
    let mut delay = None;
    let mut layouts = Vec::new();
    for part in rest.split(';') {
        let (key, value) = part.split_once('=')?;
        match key {
            "speed" => speed = value.parse::<u8>().ok(),
            "delay" => delay = value.parse::<u8>().ok(),
            "layouts" => {
                layouts = value
                    .split(',')
                    .filter(|item| {
                        item.len() == 8 && item.bytes().all(|byte| byte.is_ascii_hexdigit())
                    })
                    .map(str::to_owned)
                    .collect()
            }
            _ => {}
        }
    }
    let speed = speed.filter(|value| *value <= 31)?;
    let delay = delay.filter(|value| *value <= 3)?;
    Some(KeyboardEvidence {
        speed,
        delay,
        layouts,
    })
}

fn parse_pointer_parameters(parameters: &Map<String, Value>) -> Result<(String, String)> {
    closed(parameters, &["device", "scroll_direction"])?;
    let device = string(required(parameters, "device")?)?;
    let direction = string(required(parameters, "scroll_direction")?)?;
    if !["mouse", "trackpad"].contains(&device) || !["natural", "windows_style"].contains(&direction) {
        return Err(error("HP_SCHEMA"));
    }
    Ok((device.to_owned(), direction.to_owned()))
}

fn parse_software_label(label: &str, fallback_id: &str) -> SoftwareEvidence {
    let mut id = fallback_id.to_owned();
    let mut name = fallback_id.to_owned();
    let mut version = None;
    let mut is_default_browser = false;
    if let Some(rest) = label
        .strip_prefix("v1.software:")
        .or_else(|| label.strip_prefix("alpha.software:"))
    {
        for part in rest.split(';') {
            if let Some((key, value)) = part.split_once('=') {
                match key {
                    "id" => id = value.to_owned(),
                    "name" => name = value.to_owned(),
                    "version" => {
                        if !value.is_empty() {
                            version = Some(value.to_owned())
                        }
                    }
                    "default" => is_default_browser = value == "1",
                    _ => {}
                }
            }
        }
    }
    let official_url = match id.as_str() {
        "edge" => "https://www.microsoft.com/edge",
        "chrome" => "https://www.google.com/chrome/",
        "firefox" => "https://www.mozilla.org/firefox/",
        "microsoft365" => "https://www.microsoft.com/microsoft-365",
        "wps" => "https://www.wps.com/",
        "vscode" => "https://code.visualstudio.com/",
        "git" => "https://git-scm.com/",
        "node" => "https://nodejs.org/",
        "python" => "https://www.python.org/",
        "codex-cli" => "https://github.com/openai/codex",
        "claude-code" => "https://docs.anthropic.com/en/docs/claude-code",
        _ => "",
    };
    SoftwareEvidence {
        id,
        name,
        version,
        is_default_browser,
        official_url: official_url.to_owned(),
    }
}

fn semantic_check(payloads: &BTreeMap<String, Vec<u8>>) -> Result<ImportedPackage> {
    let manifest = strict_json(
        payloads
            .get("manifest.json")
            .ok_or_else(|| error("HP_MANIFEST_MISSING"))?,
    )?;
    let manifest_object = object(&manifest)?;
    closed(
        manifest_object,
        &[
            "format",
            "schema_version",
            "created_at",
            "created_by",
            "source",
            "target",
            "contains_secrets",
            "files",
        ],
    )?;
    exact(required(manifest_object, "format")?, "macwin-habitpack")?;
    exact(required(manifest_object, "schema_version")?, SCHEMA_VERSION)?;
    let created_at = nonempty_string(required(manifest_object, "created_at")?, 20)?;
    if !valid_datetime(&created_at) {
        return Err(error("HP_SCHEMA"));
    }
    let created_by = object(required(manifest_object, "created_by")?)?;
    closed(created_by, &["app_version", "ruleset_version"])?;
    nonempty_string(required(created_by, "app_version")?, 64)?;
    nonempty_string(required(created_by, "ruleset_version")?, 64)?;
    let source = object(required(manifest_object, "source")?)?;
    closed(source, &["os_family", "os_release", "architecture"])?;
    exact(required(source, "os_family")?, "windows")?;
    let source_os = nonempty_string(required(source, "os_release")?, 8)?;
    if source_os != "10" && source_os != "11" {
        return Err(error("HP_SCHEMA"));
    }
    exact(required(source, "architecture")?, "x86_64")?;
    let target = object(required(manifest_object, "target")?)?;
    closed(target, &["os_family", "architecture"])?;
    exact(required(target, "os_family")?, "macos")?;
    exact(required(target, "architecture")?, "arm64")?;
    let contains_secrets = bool_value(required(manifest_object, "contains_secrets")?)?;
    let files = array(required(manifest_object, "files")?)?;
    let mut declared = HashSet::new();
    for file in files {
        let file = object(file)?;
        closed(file, &["path", "media_type", "size", "sha256"])?;
        let path = nonempty_string(required(file, "path")?, 240)?;
        let size = required(file, "size")?
            .as_u64()
            .ok_or_else(|| error("HP_SCHEMA"))?;
        let hash = string(required(file, "sha256")?)?;
        if hash.len() != 64
            || !hash
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        {
            return Err(error("HP_SCHEMA"));
        }
        if !declared.insert((path.clone(), size, hash.to_owned())) {
            return Err(error("HP_MANIFEST_DUPLICATE_PATH"));
        }
    }
    let actual: HashSet<&String> = payloads
        .keys()
        .filter(|path| path.as_str() != "manifest.json")
        .collect();
    let declared_paths: HashSet<String> = files
        .iter()
        .map(|file| object(file).and_then(|object| nonempty_string(required(object, "path")?, 240)))
        .collect::<Result<_>>()?;
    if actual.len() != declared_paths.len()
        || actual.iter().any(|path| !declared_paths.contains(*path))
    {
        return Err(error("HP_MANIFEST_FILE_MISMATCH"));
    }
    if payloads
        .keys()
        .any(|path| path == "modules/wifi.json" || path.starts_with("secrets/"))
    {
        return Err(error("HP_MODULE_UNSUPPORTED_ALPHA"));
    }
    for file in files {
        let file = object(file)?;
        let path = string(required(file, "path")?)?;
        let bytes = payloads
            .get(path)
            .ok_or_else(|| error("HP_MANIFEST_FILE_MISMATCH"))?;
        let size = required(file, "size")?
            .as_u64()
            .ok_or_else(|| error("HP_SCHEMA"))?;
        if size != bytes.len() as u64 {
            return Err(error("HP_SIZE_MISMATCH"));
        }
        let mut hash = Sha256::new();
        hash.update(bytes);
        if format!("{:x}", hash.finalize()) != string(required(file, "sha256")?)? {
            return Err(error("HP_HASH_MISMATCH"));
        }
        let expected_media = if path.starts_with("secrets/") {
            "application/vnd.macwin.fixture-wifi-secret"
        } else {
            "application/json"
        };
        if string(required(file, "media_type")?)? != expected_media {
            return Err(error("HP_MEDIA_TYPE"));
        }
    }

    let selections = strict_json(
        payloads
            .get("selections.json")
            .ok_or_else(|| error("HP_SELECTIONS_MISSING"))?,
    )?;
    let selections = object(&selections)?;
    closed(
        selections,
        &[
            "schema_version",
            "guide_requested",
            "selected_candidate_ids",
        ],
    )?;
    exact(required(selections, "schema_version")?, SCHEMA_VERSION)?;
    let guide_requested = bool_value(required(selections, "guide_requested")?)?;
    let selected = array(required(selections, "selected_candidate_ids")?)?;
    let mut selected_ids = HashSet::new();
    for id in selected {
        let id = nonempty_string(id, 80)?;
        if !selected_ids.insert(id) {
            return Err(error("HP_SCHEMA"));
        }
    }
    let mut candidates = HashSet::new();
    let mut keyboard = None;
    let mut pointer_mouse = None;
    let mut pointer_trackpad = None;
    let mut software = Vec::new();
    for module in ["keyboard", "pointer", "software", "developer", "wifi"] {
        let path = format!("modules/{module}.json");
        let Some(bytes) = payloads.get(&path) else {
            continue;
        };
        let document = strict_json(bytes)?;
        let document = object(&document)?;
        closed(document, &["schema_version", "module", "candidates"])?;
        exact(required(document, "schema_version")?, SCHEMA_VERSION)?;
        exact(required(document, "module")?, module)?;
        let list = array(required(document, "candidates")?)?;
        for candidate in list {
            let candidate = object(candidate)?;
            closed(
                candidate,
                &[
                    "candidate_id",
                    "rule_id",
                    "rule_version",
                    "source",
                    "status",
                    "exclusion_reason",
                    "parameters",
                ],
            )?;
            let id = nonempty_string(required(candidate, "candidate_id")?, 80)?;
            if !candidates.insert(id.clone()) {
                return Err(error("HP_CANDIDATE_DUPLICATE"));
            }
            let rule = string(required(candidate, "rule_id")?)?;
            let rule_ok = matches!(
                (module, rule),
                ("keyboard", "fixture.keyboard.ctrl_editing")
                    | ("keyboard", "fixture.keyboard.external_windows")
                    | ("pointer", "fixture.pointer.scroll")
                    | ("software", "fixture.software.browser")
                    | ("software", "fixture.software.application")
                    | ("developer", "fixture.developer.lightweight")
                    | ("wifi", "fixture.wifi.personal")
            );
            if !rule_ok {
                return Err(error("HP_RULE_UNKNOWN"));
            }
            exact(required(candidate, "rule_version")?, SCHEMA_VERSION)?;
            let source = object(required(candidate, "source")?)?;
            closed(source, &["kind", "label"])?;
            let label = nonempty_string(required(source, "label")?, 120)?;
            let params = object(required(candidate, "parameters")?)?;
            match module {
                "keyboard" => {
                    if !params.keys().all(|key| key == "profile")
                        || string(required(params, "profile")?)? != "ctrl_editing_compat"
                    {
                        return Err(error("HP_SCHEMA"));
                    }
                    if let Some(evidence) = parse_keyboard_label(&label) {
                        keyboard = Some(evidence);
                    }
                }
                "pointer" => {
                    let (device, direction) = parse_pointer_parameters(params)?;
                    if device == "mouse" {
                        pointer_mouse = Some(direction);
                    } else {
                        pointer_trackpad = Some(direction);
                    }
                }
                "software" => {
                    if !params
                        .keys()
                        .all(|key| key == "software_id" || key == "confirmation_stage")
                        || string(required(params, "confirmation_stage")?)? != "mac_plan"
                    {
                        return Err(error("HP_SCHEMA"));
                    }
                    let id = string(required(params, "software_id")?)?;
                    if ![
                        "edge", "chrome", "firefox", "microsoft365", "wps",
                        "vscode", "git", "node", "python", "codex-cli", "claude-code",
                    ]
                    .contains(&id)
                    {
                        return Err(error("HP_SCHEMA"));
                    }
                    let evidence = parse_software_label(&label, id);
                    if evidence.id != id || evidence.official_url.is_empty() {
                        return Err(error("HP_SCHEMA"));
                    }
                    software.push(evidence);
                }
                "developer" => {
                    if !params.keys().all(|key| key == "tool_id" || key == "install_homebrew")
                        || bool_value(required(params, "install_homebrew")?)?
                    {
                        return Err(error("HP_SCHEMA"));
                    }
                    let id = string(required(params, "tool_id")?)?;
                    if ![
                        "vscode", "git", "node", "python", "codex-cli", "claude-code",
                    ]
                    .contains(&id)
                    {
                        return Err(error("HP_SCHEMA"));
                    }
                    let evidence = parse_software_label(&label, id);
                    if evidence.id != id || evidence.official_url.is_empty() {
                        return Err(error("HP_SCHEMA"));
                    }
                    software.push(evidence);
                }
                _ => {}
            }
        }
    }
    if selected_ids.iter().any(|id| !candidates.contains(id)) {
        return Err(error("HP_SELECTION_UNKNOWN"));
    }
    if contains_secrets || payloads.keys().any(|path| path.starts_with("secrets/")) {
        return Err(error("HP_SECRETS_UNSUPPORTED_ALPHA"));
    }
    for (path, bytes) in payloads {
        if path.ends_with(".json") {
            let text = std::str::from_utf8(bytes).map_err(|_| error("HP_JSON_INVALID"))?;
            if ["command", "shell", "powershell", "script"]
                .iter()
                .any(|field| text.contains(&format!("\"{field}\"")))
            {
                return Err(error("HP_FORBIDDEN_FIELD"));
            }
        }
    }
    Ok(ImportedPackage {
        created_at,
        source_os,
        keyboard,
        pointer: if pointer_mouse.is_some() || pointer_trackpad.is_some() {
            Some(PointerEvidence { mouse_direction: pointer_mouse, trackpad_direction: pointer_trackpad })
        } else {
            None
        },
        software,
        guide_requested,
        contains_secrets,
        entries: payloads.len(),
    })
}

pub fn parse_bytes(bytes: &[u8]) -> Result<ImportedPackage> {
    parse_zip(bytes).and_then(|payloads| semantic_check(&payloads))
}

pub fn parse_file(path: impl AsRef<Path>) -> Result<ImportedPackage> {
    let bytes = std::fs::read(path).map_err(|_| error("HP_ZIP_INVALID"))?;
    parse_bytes(&bytes)
}

#[derive(Debug, Clone)]
pub struct PackageInput {
    pub source_os: String,
    pub keyboard: Option<KeyboardEvidence>,
    pub pointer: Option<PointerEvidence>,
    pub software: Vec<SoftwareEvidence>,
    pub guide_requested: bool,
}

fn json_bytes<T: Serialize>(value: &T) -> Result<Vec<u8>> {
    let mut bytes = serde_json::to_vec(value).map_err(|_| error("HP_SCHEMA"))?;
    bytes.push(b'\n');
    Ok(bytes)
}
fn sha256(bytes: &[u8]) -> String {
    let mut hash = Sha256::new();
    hash.update(bytes);
    format!("{:x}", hash.finalize())
}

#[derive(Serialize)]
struct Manifest<'a> {
    format: &'a str,
    schema_version: &'a str,
    created_at: &'a str,
    created_by: CreatedBy<'a>,
    source: Source<'a>,
    target: Target,
    contains_secrets: bool,
    files: Vec<FileEntry>,
}
#[derive(Serialize)]
struct CreatedBy<'a> {
    app_version: &'a str,
    ruleset_version: &'a str,
}
#[derive(Serialize)]
struct Source<'a> {
    os_family: &'a str,
    os_release: &'a str,
    architecture: &'a str,
}
#[derive(Serialize)]
struct Target {
    os_family: &'static str,
    architecture: &'static str,
}
#[derive(Serialize)]
struct FileEntry {
    path: String,
    media_type: &'static str,
    size: usize,
    sha256: String,
}
#[derive(Serialize)]
struct Selections {
    schema_version: &'static str,
    guide_requested: bool,
    selected_candidate_ids: Vec<String>,
}
#[derive(Serialize)]
struct Module<'a> {
    schema_version: &'static str,
    module: &'a str,
    candidates: Vec<Candidate<'a>>,
}
#[derive(Serialize)]
struct Candidate<'a> {
    candidate_id: String,
    rule_id: &'a str,
    rule_version: &'static str,
    source: CandidateSource,
    status: &'static str,
    exclusion_reason: Option<&'static str>,
    parameters: Value,
}
#[derive(Serialize)]
struct CandidateSource {
    kind: &'static str,
    label: String,
}

type PackageEntries = (BTreeMap<String, Vec<u8>>, Vec<String>);

fn now_utc() -> Result<String> {
    let format =
        format_description::parse_borrowed::<1>("[year]-[month]-[day]T[hour]:[minute]:[second]Z")
            .map_err(|_| error("HP_SCHEMA"))?;
    OffsetDateTime::now_utc()
        .format(&format)
        .map_err(|_| error("HP_SCHEMA"))
}

fn build_entries(input: &PackageInput) -> Result<PackageEntries> {
    let mut entries = BTreeMap::new();
    let mut selected = Vec::new();
    if let Some(keyboard) = &input.keyboard {
        let layouts = keyboard.layouts.join(",");
        let label = format!(
            "alpha.keyboard.repeat:speed={};delay={};layouts={}",
            keyboard.speed, keyboard.delay, layouts
        );
        let candidate = Candidate {
            candidate_id: "keyboard.1".to_owned(),
            rule_id: "fixture.keyboard.ctrl_editing",
            rule_version: SCHEMA_VERSION,
            source: CandidateSource {
                kind: "fixture_detected",
                label,
            },
            status: "detected",
            exclusion_reason: None,
            parameters: serde_json::json!({"profile":"ctrl_editing_compat"}),
        };
        entries.insert(
            "modules/keyboard.json".to_owned(),
            json_bytes(&Module {
                schema_version: SCHEMA_VERSION,
                module: "keyboard",
                candidates: vec![candidate],
            })?,
        );
        selected.push("keyboard.1".to_owned());
    }
    if let Some(pointer) = &input.pointer {
        let mut candidates = Vec::new();
        for (index, (device, direction)) in [
            ("mouse", pointer.mouse_direction.as_deref()),
            ("trackpad", pointer.trackpad_direction.as_deref()),
        ]
        .into_iter()
        .enumerate()
        {
            let Some(direction) = direction else { continue };
            let label = format!("v1.pointer:device={device};direction={direction}");
            candidates.push(Candidate {
                candidate_id: format!("pointer.{}", index + 1),
                rule_id: "fixture.pointer.scroll",
                rule_version: SCHEMA_VERSION,
                source: CandidateSource { kind: "fixture_detected", label },
                status: "detected",
                exclusion_reason: None,
                parameters: serde_json::json!({"device": device, "scroll_direction": direction}),
            });
            selected.push(format!("pointer.{}", index + 1));
        }
        if !candidates.is_empty() {
            entries.insert(
                "modules/pointer.json".to_owned(),
                json_bytes(&Module { schema_version: SCHEMA_VERSION, module: "pointer", candidates })?,
            );
        }
    }
    let (software_candidates, developer_candidates) = input
        .software
        .iter()
        .enumerate()
        .filter(|(_, software)| {
            [
                "edge", "chrome", "firefox", "microsoft365", "wps", "vscode", "git", "node",
                "python", "codex-cli", "claude-code",
            ]
            .contains(&software.id.as_str())
        })
        .partition::<Vec<_>, _>(|(_index, software)| {
            ![
                "vscode", "git", "node", "python", "codex-cli", "claude-code",
            ]
            .contains(&software.id.as_str())
        });
    let software_candidates = software_candidates
        .into_iter()
        .map(|(index, software)| {
            let label = format!(
                "v1.software:id={};name={};version={};default={}",
                software.id,
                software.name,
                software.version.clone().unwrap_or_default(),
                if software.is_default_browser { 1 } else { 0 }
            );
            let candidate_id = format!("software.{}", index + 1);
            selected.push(candidate_id.clone());
            Candidate {
                candidate_id,
                rule_id: "fixture.software.browser",
                rule_version: SCHEMA_VERSION,
                source: CandidateSource { kind: "fixture_detected", label },
                status: "detected",
                exclusion_reason: None,
                parameters: serde_json::json!({"software_id":software.id,"confirmation_stage":"mac_plan"}),
            }
        })
        .collect::<Vec<_>>();
    if !software_candidates.is_empty() {
        let document = Module {
            schema_version: SCHEMA_VERSION,
            module: "software",
            candidates: software_candidates,
        };
        entries.insert("modules/software.json".to_owned(), json_bytes(&document)?);
    }
    let developer_candidates = developer_candidates
        .into_iter()
        .map(|(index, software)| {
            let label = format!(
                "v1.software:id={};name={};version={};default={}",
                software.id,
                software.name,
                software.version.clone().unwrap_or_default(),
                if software.is_default_browser { 1 } else { 0 }
            );
            let candidate_id = format!("developer.{}", index + 1);
            selected.push(candidate_id.clone());
            Candidate {
                candidate_id,
                rule_id: "fixture.developer.lightweight",
                rule_version: SCHEMA_VERSION,
                source: CandidateSource { kind: "fixture_detected", label },
                status: "detected",
                exclusion_reason: None,
                parameters: serde_json::json!({"tool_id":software.id,"install_homebrew":false}),
            }
        })
        .collect::<Vec<_>>();
    if !developer_candidates.is_empty() {
        let document = Module {
            schema_version: SCHEMA_VERSION,
            module: "developer",
            candidates: developer_candidates,
        };
        entries.insert("modules/developer.json".to_owned(), json_bytes(&document)?);
    }
    entries.insert(
        "selections.json".to_owned(),
        json_bytes(&Selections {
            schema_version: SCHEMA_VERSION,
            guide_requested: input.guide_requested,
            selected_candidate_ids: selected.clone(),
        })?,
    );
    Ok((entries, selected))
}

fn write_u16(output: &mut Vec<u8>, value: u16) {
    output.extend_from_slice(&value.to_le_bytes());
}
fn write_u32(output: &mut Vec<u8>, value: u32) {
    output.extend_from_slice(&value.to_le_bytes());
}

fn write_stored_zip(entries: BTreeMap<String, Vec<u8>>, manifest: Vec<u8>) -> Result<Vec<u8>> {
    let mut output = Vec::new();
    let mut records: Vec<(String, Vec<u8>)> = vec![("manifest.json".to_owned(), manifest)];
    records.extend(entries);
    records[1..].sort_by(|left, right| left.0.as_bytes().cmp(right.0.as_bytes()));
    let mut central = Vec::new();
    for (name, bytes) in records {
        let offset = output.len() as u32;
        let mut crc = Crc32::new();
        crc.update(&bytes);
        let crc = crc.finalize();
        let name_bytes = name.as_bytes();
        output.extend_from_slice(b"PK\x03\x04");
        write_u16(&mut output, 10);
        write_u16(&mut output, 0);
        write_u16(&mut output, 0);
        write_u16(&mut output, 0);
        write_u16(&mut output, 0x0021);
        write_u32(&mut output, crc);
        write_u32(&mut output, bytes.len() as u32);
        write_u32(&mut output, bytes.len() as u32);
        write_u16(&mut output, name_bytes.len() as u16);
        write_u16(&mut output, 0);
        output.extend_from_slice(name_bytes);
        output.extend_from_slice(&bytes);
        central.extend_from_slice(b"PK\x01\x02");
        write_u16(&mut central, 0x0314);
        write_u16(&mut central, 10);
        write_u16(&mut central, 0);
        write_u16(&mut central, 0);
        write_u16(&mut central, 0);
        write_u16(&mut central, 0x0021);
        write_u32(&mut central, crc);
        write_u32(&mut central, bytes.len() as u32);
        write_u32(&mut central, bytes.len() as u32);
        write_u16(&mut central, name_bytes.len() as u16);
        write_u16(&mut central, 0);
        write_u16(&mut central, 0);
        write_u16(&mut central, 0);
        write_u16(&mut central, 0);
        write_u32(&mut central, ((0o100000 | 0o600) << 16) as u32);
        write_u32(&mut central, offset);
        central.extend_from_slice(name_bytes);
    }
    let central_offset = output.len() as u32;
    output.extend_from_slice(&central);
    output.extend_from_slice(b"PK\x05\x06");
    write_u16(&mut output, 0);
    write_u16(&mut output, 0);
    let count = records_count_from_central(&central).ok_or_else(|| error("HP_ZIP_LAYOUT"))?;
    write_u16(&mut output, count);
    write_u16(&mut output, count);
    write_u32(&mut output, central.len() as u32);
    write_u32(&mut output, central_offset);
    write_u16(&mut output, 0);
    Ok(output)
}

fn records_count_from_central(central: &[u8]) -> Option<u16> {
    let mut at = 0usize;
    let mut count = 0u16;
    while at < central.len() {
        if central.get(at..at + 4) != Some(b"PK\x01\x02") || at + 46 > central.len() {
            return None;
        }
        let name_len = u16::from_le_bytes([central[at + 28], central[at + 29]]) as usize;
        let extra_len = u16::from_le_bytes([central[at + 30], central[at + 31]]) as usize;
        let comment_len = u16::from_le_bytes([central[at + 32], central[at + 33]]) as usize;
        at = at.checked_add(46 + name_len + extra_len + comment_len)?;
        count = count.checked_add(1)?;
    }
    Some(count)
}

pub fn build_package(input: PackageInput) -> Result<(Vec<u8>, PackageReceipt)> {
    let (entries, _) = build_entries(&input)?;
    let created_at = now_utc()?;
    let mut files = Vec::new();
    for (path, bytes) in &entries {
        files.push(FileEntry {
            path: path.clone(),
            media_type: "application/json",
            size: bytes.len(),
            sha256: sha256(bytes),
        });
    }
    let manifest = Manifest {
        format: "macwin-habitpack",
        schema_version: SCHEMA_VERSION,
        created_at: &created_at,
        created_by: CreatedBy {
            app_version: env!("CARGO_PKG_VERSION"),
            ruleset_version: "macwin.v1.0.0",
        },
        source: Source {
            os_family: "windows",
            os_release: &input.source_os,
            architecture: "x86_64",
        },
        target: Target {
            os_family: "macos",
            architecture: "arm64",
        },
        contains_secrets: false,
        files,
    };
    let manifest_bytes = json_bytes(&manifest)?;
    let module_paths = entries.keys().cloned().collect::<Vec<_>>();
    let bytes = write_stored_zip(entries, manifest_bytes)?;
    let parsed = parse_bytes(&bytes)?;
    let mut modules = Vec::new();
    if parsed.keyboard.is_some() {
        modules.push("keyboard".to_owned());
    }
    if !parsed.software.is_empty() {
        modules.push("software".to_owned());
    }
    if parsed.pointer.is_some() {
        modules.push("pointer".to_owned());
    }
    if module_paths.iter().any(|path| path == "modules/developer.json") {
        modules.push("developer".to_owned());
    }
    Ok((
        bytes.clone(),
        PackageReceipt {
            package_bytes: bytes.len(),
            modules,
            contains_secrets: false,
        },
    ))
}

pub fn write_package(path: impl AsRef<Path>, input: PackageInput) -> Result<PackageReceipt> {
    let (bytes, receipt) = build_package(input)?;
    let path = path.as_ref();
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    std::fs::create_dir_all(parent).map_err(|_| error("HP_EXPORT_WRITE"))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| error("HP_EXPORT_WRITE"))?;
    let temp_path = parent.join(format!(".{file_name}.{}.tmp", std::process::id()));
    let write_result = (|| {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp_path)
            .map_err(|_| error("HP_EXPORT_WRITE"))?;
        file.write_all(&bytes).map_err(|_| error("HP_EXPORT_WRITE"))?;
        file.sync_all().map_err(|_| error("HP_EXPORT_WRITE"))?;
        drop(file);
        let on_disk = std::fs::read(&temp_path).map_err(|_| error("HP_EXPORT_WRITE"))?;
        parse_bytes(&on_disk)?;
        std::fs::rename(&temp_path, path).map_err(|_| error("HP_EXPORT_WRITE"))?;
        Ok::<(), HabitpackError>(())
    })();
    if let Err(error) = write_result {
        let _ = std::fs::remove_file(&temp_path);
        return Err(error);
    }
    Ok(receipt)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrip_package_is_canonical() {
        let (bytes, receipt) = build_package(PackageInput {
            source_os: "11".to_owned(),
            keyboard: Some(KeyboardEvidence {
                speed: 24,
                delay: 1,
                layouts: vec!["00000804".to_owned()],
            }),
            pointer: None,
            software: vec![],
            guide_requested: true,
        })
        .expect("package");
        assert!(receipt.package_bytes > 200);
        let parsed = parse_bytes(&bytes).expect("parse");
        assert_eq!(parsed.keyboard.unwrap().speed, 24);
        assert!(!parsed.contains_secrets);
    }
    #[test]
    fn pointer_roundtrip_is_explicit_and_atomic() {
        let directory = tempfile::tempdir().expect("temp");
        let path = directory.path().join("move.habitpack");
        let receipt = write_package(
            &path,
            PackageInput {
                source_os: "11".to_owned(),
                keyboard: None,
                pointer: Some(PointerEvidence {
                    mouse_direction: Some("windows_style".to_owned()),
                    trackpad_direction: Some("natural".to_owned()),
                }),
                software: vec![],
                guide_requested: false,
            },
        )
        .expect("write");
        assert!(receipt.modules.iter().any(|module| module == "pointer"));
        let parsed = parse_file(&path).expect("parse on disk");
        assert_eq!(parsed.pointer.unwrap().trackpad_direction.as_deref(), Some("natural"));
        assert!(!directory.path().join(".move.habitpack.tmp").exists());
    }
    #[test]
    fn developer_tools_use_the_separate_module_and_no_homebrew_flag() {
        let (bytes, receipt) = build_package(PackageInput {
            source_os: "11".to_owned(),
            keyboard: None,
            pointer: None,
            software: vec![SoftwareEvidence {
                id: "vscode".to_owned(),
                name: "Visual Studio Code".to_owned(),
                version: Some("1.0".to_owned()),
                is_default_browser: false,
                official_url: "https://code.visualstudio.com/".to_owned(),
            }],
            guide_requested: false,
        })
        .expect("package");
        assert!(receipt.modules.iter().any(|module| module == "developer"));
        let parsed = parse_bytes(&bytes).expect("parse");
        assert_eq!(parsed.software[0].id, "vscode");
    }
    #[test]
    fn rejects_command_fields_and_trailing_bytes() {
        let (bytes, _) = build_package(PackageInput {
            source_os: "10".to_owned(),
            keyboard: None,
            pointer: None,
            software: vec![],
            guide_requested: false,
        })
        .expect("package");
        let mut trailing = bytes;
        trailing.extend_from_slice(b"tail");
        assert_eq!(parse_bytes(&trailing).unwrap_err().code, "HP_ZIP_LAYOUT");
    }
    #[test]
    fn strict_json_rejects_duplicates_and_limits() {
        assert_eq!(
            strict_json(br#"{"a":1,"a":2}"#).unwrap_err().code,
            "HP_JSON_DUPLICATE_KEY"
        );
        assert_eq!(
            strict_json(format!("[{}0{}]", "[".repeat(65), "]".repeat(65)).as_bytes())
                .unwrap_err()
                .code,
            "HP_JSON_LIMIT"
        );
    }
}
