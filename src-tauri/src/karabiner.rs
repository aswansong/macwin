//! Selective Ctrl compatibility for MacWin v1.
//!
//! This module deliberately owns a tiny, fixed rule set.  It never accepts
//! commands, paths, conditions, or arbitrary JSON from a migration package.
//! Existing Karabiner rules are parsed and preserved; only rules carrying one
//! of the stable MacWin descriptions are replaced or removed.

#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use crate::platform::{PlatformError, TargetPreferences};
use serde::Serialize;
use serde_json::{json, Map, Value};
#[cfg(target_os = "macos")]
use sha2::{Digest, Sha256};
#[cfg(target_os = "macos")]
use std::collections::HashSet;
#[cfg(target_os = "macos")]
use std::path::{Path, PathBuf};

pub const SHORTCUTS: &[&str] = &[
    "c", "v", "x", "z", "y", "a", "s", "f", "p", "n", "o", "w", "t", "l", "r",
];

pub const EXCEPTION_BUNDLES: &[&str] = &[
    "com.apple.Terminal",
    "com.googlecode.iterm2",
    "dev.warp.Warp-Stable",
    "com.microsoft.rdc.macos",
    "com.microsoft.rdc.macosx",
    "com.microsoft.WindowsApp",
    "com.parallels.desktop.console",
    "com.vmware.fusion",
    "com.utmapp.UTM",
    // VS Code is excluded as a whole in v1: the integrated terminal is
    // not exposed as a separate frontmost bundle by Karabiner.
    "com.microsoft.VSCode",
];

const INTERNAL_DESCRIPTION: &str = "MacWin v1 · Ctrl 兼容 · 内置键盘";
const EXTERNAL_DESCRIPTION: &str = "MacWin v1 · Ctrl 兼容 · 外接键盘";

#[derive(Debug, Clone, Serialize)]
pub struct KeyboardDevice {
    pub name: String,
    pub kind: String,
    pub recognized: bool,
    pub redacted_id: String,
    #[serde(skip_serializing)]
    pub vendor_id: Option<u64>,
    #[serde(skip_serializing)]
    pub product_id: Option<u64>,
    #[serde(skip_serializing)]
    pub location_id: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct KarabinerStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub config_present: bool,
    pub permission: String,
    pub official_url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct KeyboardCompatibilityPlan {
    pub built_in_enabled: bool,
    pub external_enabled: bool,
    pub devices: Vec<KeyboardDevice>,
    pub shortcuts: Vec<String>,
    pub exceptions: Vec<String>,
    pub karabiner: KarabinerStatus,
    pub recovery: String,
}

#[derive(Debug, Clone)]
pub struct KeyboardCompatibilityRequest {
    pub built_in_enabled: bool,
    pub external_enabled: bool,
    pub devices: Vec<KeyboardDevice>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ApplyReport {
    pub status: String,
    pub detail: String,
}

pub fn plan_for_target() -> KeyboardCompatibilityPlan {
    let devices = detect_devices();
    let has_external = devices.iter().any(|device| device.kind == "external" && device.recognized);
    KeyboardCompatibilityPlan {
        built_in_enabled: devices.iter().any(|device| device.kind == "built_in" && device.recognized),
        external_enabled: has_external,
        devices,
        shortcuts: SHORTCUTS.iter().map(|value| format!("Ctrl+{} → Command+{}", value.to_uppercase(), value.to_uppercase())).collect(),
        exceptions: EXCEPTION_BUNDLES.iter().map(|value| (*value).to_owned()).collect(),
        karabiner: detect_status(),
        recovery: "恢复时只移除 MacWin v1 自己的规则，不覆盖你的其他 Karabiner 规则".to_owned(),
    }
}

pub fn request_from_plan(plan: &KeyboardCompatibilityPlan) -> KeyboardCompatibilityRequest {
    KeyboardCompatibilityRequest {
        built_in_enabled: plan.built_in_enabled,
        external_enabled: plan.external_enabled,
        devices: plan.devices.clone(),
    }
}

pub fn apply(request: &KeyboardCompatibilityRequest) -> Result<ApplyReport, PlatformError> {
    #[cfg(target_os = "macos")]
    {
        let Some(path) = config_path() else {
            return Ok(ApplyReport { status: "manual_action_required".to_owned(), detail: "未找到 Karabiner-Elements 配置；请从官方入口安装后重试".to_owned() });
        };
        if !path.exists() {
            return Ok(ApplyReport { status: "manual_action_required".to_owned(), detail: "Karabiner-Elements 已安装，但配置尚未生成；请打开一次官方应用并授予所需权限".to_owned() });
        }
        let bytes = std::fs::read(&path).map_err(|_| PlatformError::Read("KARABINER_READ"))?;
        let mut value: Value = serde_json::from_slice(&bytes).map_err(|_| PlatformError::Read("KARABINER_JSON"))?;
        let rules = rules_for_request(request);
        if rules.is_empty() {
            return Ok(ApplyReport { status: "manual_action_required".to_owned(), detail: "没有可安全匹配的内置或外接键盘；MacWin 不会猜测设备".to_owned() });
        }
        let changed = merge_managed_rules(&mut value, &rules).map_err(|_| PlatformError::Write("KARABINER_STRUCTURE"))?;
        if changed {
            write_config_atomically(&path, &bytes, &value)?;
        }
        let verified_bytes = std::fs::read(&path).map_err(|_| PlatformError::Read("KARABINER_VERIFY"))?;
        let verified: Value = serde_json::from_slice(&verified_bytes).map_err(|_| PlatformError::Read("KARABINER_VERIFY"))?;
        if !rules.iter().all(|rule| rule.get("description").and_then(Value::as_str).is_some_and(|description| has_managed_description(&verified, description))) {
            return Err(PlatformError::Read("KARABINER_VERIFY"));
        }
        Ok(ApplyReport { status: "applied_verified".to_owned(), detail: "选择性 Ctrl 规则已写入，终端/远程桌面/虚拟机例外保留真实 Ctrl".to_owned() })
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = request;
        Err(PlatformError::Unsupported)
    }
}

pub fn remove(_preferences: &TargetPreferences) -> Result<ApplyReport, PlatformError> {
    #[cfg(target_os = "macos")]
    {
        let Some(path) = config_path() else {
            return Ok(ApplyReport { status: "rolled_back_verified".to_owned(), detail: "没有可移除的 MacWin 规则".to_owned() });
        };
        if !path.exists() {
            return Ok(ApplyReport { status: "rolled_back_verified".to_owned(), detail: "没有可移除的 MacWin 规则".to_owned() });
        }
        let bytes = std::fs::read(&path).map_err(|_| PlatformError::Read("KARABINER_READ"))?;
        let mut value: Value = serde_json::from_slice(&bytes).map_err(|_| PlatformError::Read("KARABINER_JSON"))?;
        if remove_managed_rules(&mut value).map_err(|_| PlatformError::Write("KARABINER_STRUCTURE"))? {
            write_config_atomically(&path, &bytes, &value)?;
        }
        let verified_bytes = std::fs::read(&path).map_err(|_| PlatformError::Read("KARABINER_VERIFY"))?;
        let verified: Value = serde_json::from_slice(&verified_bytes).map_err(|_| PlatformError::Read("KARABINER_VERIFY"))?;
        if managed_descriptions().iter().any(|description| has_managed_description(&verified, description)) {
            return Err(PlatformError::Read("KARABINER_VERIFY"));
        }
        Ok(ApplyReport { status: "rolled_back_verified".to_owned(), detail: "只移除了 MacWin v1 规则".to_owned() })
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(PlatformError::Unsupported)
    }
}

fn managed_descriptions() -> [&'static str; 2] {
    [INTERNAL_DESCRIPTION, EXTERNAL_DESCRIPTION]
}

#[cfg(target_os = "macos")]
fn has_managed_description(config: &Value, description: &str) -> bool {
    config.get("profiles").and_then(Value::as_array).into_iter().flatten().any(|profile| {
        profile.get("complex_modifications").and_then(|value| value.get("rules")).and_then(Value::as_array).into_iter().flatten().any(|rule| rule.get("description").and_then(Value::as_str) == Some(description))
    })
}

fn rules_for_request(request: &KeyboardCompatibilityRequest) -> Vec<Value> {
    let mut rules = Vec::new();
    if request.built_in_enabled {
        let identifiers = request.devices.iter().filter(|device| device.kind == "built_in" && device.recognized).map(device_identifier).collect::<Vec<_>>();
        if !identifiers.is_empty() { rules.push(make_rule(INTERNAL_DESCRIPTION, identifiers)); }
    }
    if request.external_enabled {
        let identifiers = request.devices.iter().filter(|device| device.kind == "external" && device.recognized).map(device_identifier).collect::<Vec<_>>();
        if !identifiers.is_empty() { rules.push(make_rule(EXTERNAL_DESCRIPTION, identifiers)); }
    }
    rules
}

fn make_rule(description: &str, identifiers: Vec<Value>) -> Value {
    let manipulators = SHORTCUTS.iter().map(|key| json!({
        "type": "basic",
        "from": { "key_code": key, "modifiers": { "mandatory": ["control"], "optional": ["any"] } },
        "to": [{ "key_code": key, "modifiers": ["command"] }]
    })).collect::<Vec<_>>();
    json!({
        "description": description,
        "conditions": [
            { "type": "device_if", "identifiers": identifiers },
            { "type": "frontmost_application_unless", "bundle_identifiers": EXCEPTION_BUNDLES }
        ],
        "manipulators": manipulators
    })
}

fn device_identifier(device: &KeyboardDevice) -> Value {
    let mut identifier = Map::new();
    identifier.insert("is_keyboard".to_owned(), Value::Bool(true));
    if let Some(vendor_id) = device.vendor_id { identifier.insert("vendor_id".to_owned(), Value::from(vendor_id)); }
    if let Some(product_id) = device.product_id { identifier.insert("product_id".to_owned(), Value::from(product_id)); }
    if let Some(location_id) = device.location_id { identifier.insert("location_id".to_owned(), Value::from(location_id)); }
    Value::Object(identifier)
}

/// Replace only the two stable MacWin rule descriptions in the selected profile.
/// This function is pure and is used by tests before any real file operation.
pub fn merge_managed_rules(config: &mut Value, managed: &[Value]) -> Result<bool, ()> {
    let profiles = config.get_mut("profiles").and_then(Value::as_array_mut).ok_or(())?;
    let index = profiles.iter().position(|profile| profile.get("selected").and_then(Value::as_bool) == Some(true)).unwrap_or(0);
    let profile = profiles.get_mut(index).ok_or(())?;
    let complex = profile.as_object_mut().ok_or(())?.entry("complex_modifications").or_insert_with(|| json!({"rules": []}));
    let rules = complex.as_object_mut().ok_or(())?.entry("rules").or_insert_with(|| Value::Array(Vec::new()));
    let array = rules.as_array_mut().ok_or(())?;
    let before = array.len();
    array.retain(|rule| !managed_descriptions().contains(&rule.get("description").and_then(Value::as_str).unwrap_or("")));
    let removed = before != array.len();
    array.extend(managed.iter().cloned());
    Ok(removed || !managed.is_empty())
}

pub fn remove_managed_rules(config: &mut Value) -> Result<bool, ()> {
    let profiles = config.get_mut("profiles").and_then(Value::as_array_mut).ok_or(())?;
    let mut changed = false;
    for profile in profiles {
        let Some(rules) = profile.get_mut("complex_modifications").and_then(|value| value.get_mut("rules")).and_then(Value::as_array_mut) else { continue; };
        let before = rules.len();
        rules.retain(|rule| !managed_descriptions().contains(&rule.get("description").and_then(Value::as_str).unwrap_or("")));
        changed |= before != rules.len();
    }
    Ok(changed)
}

#[cfg(target_os = "macos")]
fn home_dir() -> Option<PathBuf> { std::env::var_os("HOME").map(PathBuf::from) }

#[cfg(target_os = "macos")]
fn config_path() -> Option<PathBuf> { home_dir().map(|home| home.join(".config/karabiner/karabiner.json")) }

#[cfg(target_os = "macos")]
fn write_config_atomically(path: &Path, original: &[u8], value: &Value) -> Result<(), PlatformError> {
    let backup = path.with_file_name("karabiner.json.macwin-backup");
    if !backup.exists() { std::fs::write(&backup, original).map_err(|_| PlatformError::Write("KARABINER_BACKUP"))?; }
    let temp = path.with_file_name("karabiner.json.macwin.tmp");
    let encoded = serde_json::to_vec_pretty(value).map_err(|_| PlatformError::Write("KARABINER_ENCODE"))?;
    let file = std::fs::OpenOptions::new().write(true).create_new(true).open(&temp).map_err(|_| PlatformError::Write("KARABINER_TEMP"))?;
    use std::io::Write;
    let mut file = file;
    file.write_all(&encoded).map_err(|_| PlatformError::Write("KARABINER_TEMP"))?;
    file.sync_all().map_err(|_| PlatformError::Write("KARABINER_SYNC"))?;
    std::fs::rename(&temp, path).map_err(|_| PlatformError::Write("KARABINER_RENAME"))
}

#[cfg(target_os = "macos")]
fn detect_status() -> KarabinerStatus {
    let candidates = [PathBuf::from("/Applications/Karabiner-Elements.app"), home_dir().map(|home| home.join("Applications/Karabiner-Elements.app")).unwrap_or_default()];
    let app = candidates.iter().find(|path| path.exists());
    let version = app.and_then(|path| std::process::Command::new("/usr/bin/defaults").arg("read").arg(format!("{}/Contents/Info.plist", path.display())).arg("CFBundleShortVersionString").output().ok()).and_then(|out| if out.status.success() { String::from_utf8(out.stdout).ok().map(|value| value.trim().to_owned()) } else { None });
    KarabinerStatus { installed: app.is_some(), version, config_present: config_path().is_some_and(|path| path.exists()), permission: "未自动探测；首次应用请按系统提示授权".to_owned(), official_url: "https://karabiner-elements.pqrs.org/".to_owned() }
}

#[cfg(not(target_os = "macos"))]
fn detect_status() -> KarabinerStatus {
    KarabinerStatus { installed: false, version: None, config_present: false, permission: "目标 Mac 上检查".to_owned(), official_url: "https://karabiner-elements.pqrs.org/".to_owned() }
}

#[cfg(target_os = "macos")]
fn detect_devices() -> Vec<KeyboardDevice> {
    let output = std::process::Command::new("/usr/bin/hidutil").arg("list").output().ok();
    let Some(output) = output.and_then(|out| if out.status.success() { String::from_utf8(out.stdout).ok() } else { None }) else { return Vec::new(); };
    let mut seen = HashSet::new();
    output.lines().enumerate().skip(2).filter_map(|(index, line)| {
        let lower = line.to_ascii_lowercase();
        if lower.contains("virtualhidkeyboard") { return None; }
        let columns = line.split_whitespace().collect::<Vec<_>>();
        if columns.len() < 6 { return None; }
        // hidutil lists every HID endpoint. Only usage page 1 / usage 6 is a
        // keyboard; filtering here avoids treating the trackpad's endpoints
        // as multiple copies of the built-in keyboard.
        if parse_number(columns[3]) != Some(1) || parse_number(columns[4]) != Some(6) { return None; }
        let vendor_id = parse_number(columns[0]);
        let product_id = parse_number(columns[1]);
        let location_id = parse_number(columns[2]);
        let built_in = columns.last().is_some_and(|value| *value == "1") || lower.contains("internal keyboard");
        let kind = if built_in { "built_in" } else { "external" };
        let name = if built_in { "MacBook 内置键盘".to_owned() } else { "外接键盘".to_owned() };
        let recognized = (built_in && location_id.is_some_and(|value| value != 0)) || (vendor_id.is_some_and(|value| value != 0) && product_id.is_some_and(|value| value != 0));
        let raw = format!("{}:{}:{}:{}", vendor_id.unwrap_or_default(), product_id.unwrap_or_default(), location_id.unwrap_or(index as u64), kind);
        if !seen.insert(raw.clone()) { return None; }
        let mut hash = Sha256::new(); hash.update(raw.as_bytes()); let digest = hash.finalize();
        let redacted_id = format!("kb-{}", digest[..6].iter().map(|byte| format!("{byte:02x}")).collect::<String>());
        Some(KeyboardDevice { name, kind: kind.to_owned(), recognized, redacted_id, vendor_id, product_id, location_id })
    }).collect()
}

#[cfg(not(target_os = "macos"))]
fn detect_devices() -> Vec<KeyboardDevice> { Vec::new() }

#[cfg(target_os = "macos")]
fn parse_number(value: &str) -> Option<u64> {
    if let Some(hex) = value.strip_prefix("0x") { u64::from_str_radix(hex, 16).ok() } else { value.parse().ok() }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> Value {
        json!({"profiles": [{"name": "Default", "selected": true, "complex_modifications": {"rules": [{"description": "User rule", "manipulators": []}, {"description": INTERNAL_DESCRIPTION, "manipulators": []}]}}]})
    }

    #[test]
    fn merge_preserves_user_rules_and_fixed_exceptions() {
        let device = KeyboardDevice { name: "Apple Internal".into(), kind: "built_in".into(), recognized: true, redacted_id: "kb-test".into(), vendor_id: Some(1), product_id: Some(2), location_id: Some(3) };
        let request = KeyboardCompatibilityRequest { built_in_enabled: true, external_enabled: false, devices: vec![device] };
        let rules = rules_for_request(&request);
        let mut value = config();
        merge_managed_rules(&mut value, &rules).expect("merge");
        let rules = &value["profiles"][0]["complex_modifications"]["rules"];
        assert!(rules.as_array().unwrap().iter().any(|rule| rule["description"] == "User rule"));
        assert_eq!(rules.as_array().unwrap().iter().filter(|rule| rule["description"] == INTERNAL_DESCRIPTION).count(), 1);
        assert_eq!(rules[1]["conditions"][1]["type"], "frontmost_application_unless");
        assert_eq!(rules[1]["manipulators"].as_array().unwrap().len(), SHORTCUTS.len());
    }

    #[test]
    fn rollback_removes_only_macwin_rules() {
        let mut value = config();
        assert!(remove_managed_rules(&mut value).expect("remove"));
        let rules = &value["profiles"][0]["complex_modifications"]["rules"];
        assert_eq!(rules.as_array().unwrap().len(), 1);
        assert_eq!(rules[0]["description"], "User rule");
    }

    #[test]
    fn malformed_profiles_are_rejected_without_guessing() {
        let mut value = json!({"profiles": "not-an-array"});
        assert!(merge_managed_rules(&mut value, &[]).is_err());
    }

    #[test]
    fn device_serialization_exposes_only_redacted_identifier() {
        let device = KeyboardDevice { name: "MacBook 内置键盘".into(), kind: "built_in".into(), recognized: true, redacted_id: "kb-test".into(), vendor_id: Some(123), product_id: Some(456), location_id: Some(789) };
        let value = serde_json::to_value(device).expect("device json");
        assert_eq!(value["redacted_id"], "kb-test");
        assert!(value.get("vendor_id").is_none());
        assert!(value.get("product_id").is_none());
        assert!(value.get("location_id").is_none());
    }
}
