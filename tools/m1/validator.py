from __future__ import annotations

import hashlib
import io
import json
import re
import stat
import struct
import unicodedata
import zipfile
import zlib
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker

SCHEMA_VERSION = "1.0.0"
MAX_ARCHIVE = 8 * 1024 * 1024
MAX_TOTAL = 16 * 1024 * 1024
MAX_ENTRIES = 128
MAX_MANIFEST = 64 * 1024
MAX_JSON = 1024 * 1024
MAX_JSON_NESTING = 64
MAX_JSON_INTEGER_DIGITS = 64
MAX_SECRET = 64 * 1024
MAX_PATH = 240
MAX_RATIO = 100
CANONICAL_MADE_BY = 0x0314
CANONICAL_DOS_TIME = 0
CANONICAL_DOS_DATE = 0x0021
CANONICAL_EXTERNAL_ATTR = (stat.S_IFREG | 0o600) << 16
MODULES = ("keyboard", "pointer", "software", "developer", "wifi")
JSON_MEDIA = "application/json"
SECRET_MEDIA = "application/vnd.macwin.fixture-wifi-secret"
EXEC_EXTENSIONS = {".exe", ".dll", ".msi", ".ps1", ".bat", ".cmd", ".sh", ".com", ".app", ".dylib"}
NESTED_EXTENSIONS = {".zip", ".7z", ".rar", ".tar", ".gz", ".bz2", ".xz", ".habitpack"}


@dataclass
class HabitpackError(Exception):
    code: str
    detail: str

    def __str__(self) -> str:
        return f"ERROR [{self.code}] {self.detail}"


def fail(code: str, detail: str) -> None:
    raise HabitpackError(code, detail)


def strict_json(data: bytes, path: str) -> Any:
    def pairs(items: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in items:
            if key in result:
                fail("HP_JSON_DUPLICATE_KEY", path)
            result[key] = value
        return result

    def bounded_integer(token: str) -> int:
        if len(token.lstrip("-")) > MAX_JSON_INTEGER_DIGITS:
            fail("HP_JSON_LIMIT", path)
        try:
            return int(token)
        except (ValueError, OverflowError):
            fail("HP_JSON_LIMIT", path)

    def scan_limits(text: str) -> None:
        depth = 0
        in_string = False
        escaped = False
        for character in text:
            if in_string:
                if escaped:
                    escaped = False
                elif character == "\\":
                    escaped = True
                elif character == '"':
                    in_string = False
                continue
            if character == '"':
                in_string = True
            elif character in "[{":
                depth += 1
                if depth > MAX_JSON_NESTING:
                    fail("HP_JSON_LIMIT", path)
            elif character in "]}":
                depth -= 1

    try:
        text = data.decode("utf-8")
        scan_limits(text)

        def nonfinite(value: str) -> None:
            fail("HP_JSON_NONFINITE", f"{path}:{value}")

        return json.loads(text, object_pairs_hook=pairs, parse_constant=nonfinite, parse_int=bounded_integer)
    except HabitpackError:
        raise
    except RecursionError:
        fail("HP_JSON_LIMIT", path)
    except UnicodeError:
        fail("HP_JSON_INVALID", path)
    except OverflowError:
        fail("HP_JSON_LIMIT", path)
    except (ValueError, json.JSONDecodeError):
        fail("HP_JSON_INVALID", path)


def _schema_root() -> Path:
    return Path(__file__).resolve().parents[2] / "schemas" / "habitpack" / SCHEMA_VERSION


def _load_schemas() -> tuple[dict[str, Any], dict[str, Any]]:
    root = _schema_root()
    schemas = {p.name: strict_json(p.read_bytes(), str(p)) for p in root.glob("*.json")}
    catalog = schemas.pop("rule-catalog.m1.json")
    return schemas, catalog


CANONICAL_UTC_DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


def _is_canonical_utc_datetime(value: object) -> bool:
    if not isinstance(value, str):
        return True
    if not CANONICAL_UTC_DATETIME_RE.fullmatch(value):
        return False
    try:
        datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        return False
    return True


PROJECT_FORMAT_CHECKER = FormatChecker()
PROJECT_FORMAT_CHECKER.checks("macwin-canonical-utc-date-time")(_is_canonical_utc_datetime)


def _schema_validate(instance: Any, name: str, schemas: dict[str, Any]) -> None:
    from referencing import Registry, Resource

    registry = Registry()
    for filename, schema in schemas.items():
        uri = schema.get("$id", f"https://macwin.example/schemas/habitpack/{SCHEMA_VERSION}/{filename}")
        registry = registry.with_resource(uri, Resource.from_contents(schema))
    try:
        validator = Draft202012Validator(schemas[name], registry=registry, format_checker=PROJECT_FORMAT_CHECKER)
        error = next(iter(validator.iter_errors(instance)), None)
    except RecursionError:
        fail("HP_JSON_LIMIT", name)
    except (ValueError, OverflowError, UnicodeError):
        fail("HP_SCHEMA", name)
    if error:
        location = "/".join(str(x) for x in error.absolute_path) or "$"
        fail("HP_SCHEMA", f"{name}:{location}")


def _path_code(name: str) -> str | None:
    if name.startswith("/"):
        return "HP_PATH_ABSOLUTE_POSIX"
    if PureWindowsPath(name).is_absolute() or re.match(r"^[A-Za-z]:", name) or name.startswith("\\\\"):
        return "HP_PATH_ABSOLUTE_WINDOWS"
    if "\\" in name or any(part == ".." for part in PurePosixPath(name).parts):
        return "HP_PATH_TRAVERSAL"
    if len(name.encode("utf-8")) > MAX_PATH:
        return "HP_PATH_TOO_LONG"
    return None


def _extra_has_zip64(extra: bytes) -> bool:
    pos = 0
    while pos + 4 <= len(extra):
        header, size = struct.unpack_from("<HH", extra, pos)
        if header == 0x0001:
            return True
        pos += 4 + size
    return False


def _local_extra(data: bytes, info: zipfile.ZipInfo) -> bytes:
    offset = info.header_offset
    if offset < 0 or offset + 30 > len(data) or data[offset : offset + 4] != b"PK\x03\x04":
        fail("HP_ZIP_INVALID", info.filename)
    filename_length, extra_length = struct.unpack_from("<HH", data, offset + 26)
    start = offset + 30 + filename_length
    end = start + extra_length
    if end > len(data):
        fail("HP_ZIP_INVALID", info.filename)
    return data[start:end]


def _validate_zip_name(raw_name: bytes) -> None:
    try:
        raw_name.decode("utf-8")
    except UnicodeDecodeError:
        fail("HP_ZIP_INVALID", "archive")


def _classify_missing_final_eocd(data: bytes) -> None:
    """Classify an invalid tail without treating signatures inside valid payloads as records."""
    position = data.rfind(b"PK\x05\x06", 0, max(0, len(data) - 21))
    while position >= 0:
        if position + 22 <= len(data):
            comment_length = struct.unpack_from("<H", data, position + 20)[0]
            record_end = position + 22 + comment_length
            if record_end == len(data) and comment_length:
                fail("HP_ZIP_COMMENT", "archive")
            if position + 22 < len(data) and comment_length == 0:
                fail("HP_ZIP_TRAILING_DATA", "archive")
        position = data.rfind(b"PK\x05\x06", 0, position)
    fail("HP_ZIP_LAYOUT", "archive")


def _resource_policy(name: bytes) -> tuple[int, str]:
    if name == b"manifest.json":
        return MAX_MANIFEST, "HP_MANIFEST_TOO_LARGE"
    if name.startswith(b"secrets/"):
        return MAX_SECRET, "HP_SECRET_TOO_LARGE"
    return MAX_JSON, "HP_JSON_TOO_LARGE"


def _validate_declared_resources(entries: list[dict[str, Any]]) -> None:
    total = 0
    for entry in entries:
        limit, size_code = _resource_policy(entry["name"])
        file_size = entry["file_size"]
        compressed_size = entry["compressed_size"]
        if file_size > limit:
            fail(size_code, "archive")
        if file_size > compressed_size * MAX_RATIO:
            fail("HP_COMPRESSION_RATIO", "archive")
        total += file_size
    if total > MAX_TOTAL:
        fail("HP_TOTAL_TOO_LARGE", "archive")


def _validate_deflate_stream(compressed: bytes, expected_size: int, hard_limit: int, size_code: str) -> None:
    """Validate one raw Deflate stream without trusting its declared output size."""
    if expected_size > hard_limit:
        fail(size_code, "archive")
    decoder = zlib.decompressobj(-zlib.MAX_WBITS)
    max_output = min(expected_size, hard_limit) + 1
    try:
        decoded = decoder.decompress(compressed, max_output)
        if len(decoded) < max_output:
            decoded += decoder.flush(max_output - len(decoded))
    except zlib.error:
        fail("HP_ZIP_STREAM", "archive")
    if len(decoded) != expected_size or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:
        fail("HP_ZIP_STREAM", "archive")


def _validate_zip_layout(data: bytes) -> str | None:
    """Validate the deliberately narrow, contiguous, single-volume M1 ZIP profile."""
    profile_error: str | None = None
    if len(data) > MAX_ARCHIVE:
        fail("HP_ARCHIVE_TOO_LARGE", "archive")
    if len(data) < 22 or data[-22:-18] != b"PK\x05\x06":
        _classify_missing_final_eocd(data)
    eocd_offset = len(data) - 22
    _, disk, cd_disk, disk_entries, total_entries, cd_size, cd_offset, comment_length = struct.unpack_from("<4s4H2LH", data, eocd_offset)
    if comment_length != 0:
        fail("HP_ZIP_COMMENT", "archive")
    if disk in {0xFFFF} or cd_disk in {0xFFFF} or disk_entries == 0xFFFF or total_entries == 0xFFFF or cd_size == 0xFFFFFFFF or cd_offset == 0xFFFFFFFF:
        fail("HP_ZIP64_ENTRY", "archive")
    if disk != 0 or cd_disk != 0 or disk_entries != total_entries:
        fail("HP_ZIP_MULTIDISK", "archive")
    if not data.startswith(b"PK\x03\x04"):
        fail("HP_ZIP_PREFIX", "archive")
    if cd_offset + cd_size != eocd_offset or cd_offset <= 0:
        fail("HP_ZIP_LAYOUT", "archive")
    if eocd_offset >= 20 and data[eocd_offset - 20 : eocd_offset - 16] == b"PK\x06\x07":
        fail("HP_ZIP64_ENTRY", "archive")

    central_entries: list[dict[str, Any]] = []
    position = cd_offset
    while position < eocd_offset:
        if position + 46 > eocd_offset or data[position : position + 4] != b"PK\x01\x02":
            fail("HP_ZIP_LAYOUT", "archive")
        fields = struct.unpack_from("<4s6H3L5H2L", data, position)
        (_, made_by, version_needed, flags, method, dos_time, dos_date, crc, compressed_size, file_size, name_length, extra_length, entry_comment_length, disk_start, internal_attr, external_attr, local_offset) = fields
        end = position + 46 + name_length + extra_length + entry_comment_length
        if end > eocd_offset or entry_comment_length:
            fail("HP_ZIP_LAYOUT", "archive")
        if disk_start == 0xFFFF or compressed_size == 0xFFFFFFFF or file_size == 0xFFFFFFFF or local_offset == 0xFFFFFFFF:
            fail("HP_ZIP64_ENTRY", "archive")
        if disk_start != 0:
            fail("HP_ZIP_MULTIDISK", "archive")
        extra_start = position + 46 + name_length
        central_extra = data[extra_start : extra_start + extra_length]
        _validate_zip_name(data[position + 46 : position + 46 + name_length])
        if _extra_has_zip64(central_extra):
            fail("HP_ZIP64_ENTRY", "archive")
        if extra_length:
            fail("HP_ZIP_EXTRA", "archive")
        central_entries.append({"made_by": made_by, "version_needed": version_needed, "flags": flags, "method": method, "dos_time": dos_time, "dos_date": dos_date, "crc": crc, "compressed_size": compressed_size, "file_size": file_size, "name": data[position + 46 : position + 46 + name_length], "internal_attr": internal_attr, "external_attr": external_attr, "local_offset": local_offset})
        position = end
    if position != eocd_offset or len(central_entries) != total_entries:
        fail("HP_ZIP_LAYOUT", "archive")
    if len(central_entries) > MAX_ENTRIES:
        fail("HP_TOO_MANY_ENTRIES", "archive")
    central_names = [entry["name"] for entry in central_entries]
    expected_names = [b"manifest.json", *sorted((name for name in central_names if name != b"manifest.json"))]
    if central_names != expected_names or central_names.count(b"manifest.json") != 1:
        profile_error = profile_error or "HP_ZIP_ORDER"

    local_entries: list[dict[str, Any]] = []
    local_names: list[bytes] = []
    ordered_entries = sorted(central_entries, key=lambda item: item["local_offset"])
    for entry in ordered_entries:
        local_offset = entry["local_offset"]
        if local_offset + 30 > cd_offset or data[local_offset : local_offset + 4] != b"PK\x03\x04":
            fail("HP_ZIP_LAYOUT", "archive")
        local = struct.unpack_from("<4s5H3L2H", data, local_offset)
        _, version_needed, flags, method, dos_time, dos_date, crc, compressed_size, file_size, name_length, extra_length = local
        if compressed_size == 0xFFFFFFFF or file_size == 0xFFFFFFFF:
            fail("HP_ZIP64_ENTRY", "archive")
        name_start = local_offset + 30
        extra_start = name_start + name_length
        data_start = extra_start + extra_length
        local_name = data[name_start:extra_start]
        _validate_zip_name(local_name)
        local_names.append(local_name)
        if data_start > cd_offset or local_name != entry["name"]:
            fail("HP_ZIP_LAYOUT", "archive")
        if (flags, method, crc, compressed_size, file_size) != (entry["flags"], entry["method"], entry["crc"], entry["compressed_size"], entry["file_size"]):
            fail("HP_ZIP_LAYOUT", "archive")
        if version_needed != entry["version_needed"] or (dos_time, dos_date) != (entry["dos_time"], entry["dos_date"]):
            fail("HP_ZIP_LAYOUT", "archive")
        local_extra = data[extra_start:data_start]
        if _extra_has_zip64(local_extra):
            fail("HP_ZIP64_ENTRY", "archive")
        if extra_length:
            fail("HP_ZIP_EXTRA", "archive")
        if flags & 0x01:
            profile_error = profile_error or "HP_ENCRYPTED_ENTRY"
        elif flags & 0x08:
            profile_error = profile_error or "HP_ZIP_LAYOUT"
        elif method not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}:
            profile_error = profile_error or "HP_ZIP_COMPRESSION"
        elif flags != 0:
            profile_error = profile_error or "HP_ZIP_FLAGS"
        else:
            expected_version = 10 if method == zipfile.ZIP_STORED else 20
            if version_needed != expected_version or entry["made_by"] != CANONICAL_MADE_BY:
                profile_error = profile_error or "HP_ZIP_VERSION"
            elif (dos_time, dos_date) != (CANONICAL_DOS_TIME, CANONICAL_DOS_DATE):
                profile_error = profile_error or "HP_ZIP_TIMESTAMP"
            elif entry["internal_attr"] != 0 or entry["external_attr"] != CANONICAL_EXTERNAL_ATTR:
                profile_error = profile_error or "HP_ZIP_ATTRIBUTES"
        local_entries.append({**entry, "data_start": data_start})

    # Every ZIP64 sentinel and all local/central metadata are parsed before any
    # size-policy rejection, Stored payload copy, or Deflate invocation.
    _validate_declared_resources(local_entries)

    expected_local_offset = 0
    for entry in local_entries:
        local_offset = entry["local_offset"]
        data_start = entry["data_start"]
        compressed_size = entry["compressed_size"]
        file_size = entry["file_size"]
        method = entry["method"]
        data_end = data_start + compressed_size
        if local_offset != expected_local_offset or data_end > cd_offset:
            fail("HP_ZIP_LAYOUT", "archive")
        limit, size_code = _resource_policy(entry["name"])
        compressed = data[data_start:data_end]
        if method == zipfile.ZIP_STORED:
            if compressed_size != file_size:
                fail("HP_ZIP_STREAM", "archive")
        elif method == zipfile.ZIP_DEFLATED:
            _validate_deflate_stream(compressed, file_size, limit, size_code)
        expected_local_offset = data_end
    if expected_local_offset != cd_offset:
        fail("HP_ZIP_LAYOUT", "archive")
    if local_names != expected_names:
        profile_error = profile_error or "HP_ZIP_ORDER"
    return profile_error


def _entry_type(info: zipfile.ZipInfo) -> str:
    mode = info.external_attr >> 16
    kind = stat.S_IFMT(mode)
    if info.is_dir() or info.filename.endswith("/"):
        return "directory"
    if kind == stat.S_IFLNK:
        return "symlink"
    if kind not in (0, stat.S_IFREG):
        return "special"
    return "file"


def _magic_code(data: bytes) -> str | None:
    if data.startswith(b"MZ"):
        return "HP_EXECUTABLE_MZ"
    if data.startswith(b"\x7fELF"):
        return "HP_EXECUTABLE_ELF"
    if data[:4] in {b"\xfe\xed\xfa\xce", b"\xce\xfa\xed\xfe", b"\xfe\xed\xfa\xcf", b"\xcf\xfa\xed\xfe", b"\xca\xfe\xba\xbe"}:
        return "HP_EXECUTABLE_MACHO"
    if data.startswith(b"#!"):
        return "HP_EXECUTABLE_SHEBANG"
    if data.startswith((b"PK\x03\x04", b"7z\xbc\xaf\x27\x1c", b"Rar!")):
        return "HP_NESTED_ARCHIVE"
    return None


def _allowed_path(path: str) -> bool:
    return path in {"selections.json", *(f"modules/{m}.json" for m in MODULES)} or bool(re.fullmatch(r"secrets/wifi/[a-z0-9][a-z0-9_-]{0,63}\.bin", path))


def validate_habitpack(path: Path, fixture: str = "package") -> dict[str, int]:
    try:
        return _validate_habitpack(path, fixture)
    except HabitpackError:
        raise
    except RecursionError:
        fail("HP_JSON_LIMIT", fixture)
    except MemoryError:
        fail("HP_RESOURCE_LIMIT", fixture)
    except UnicodeError:
        fail("HP_ZIP_INVALID", fixture)
    except OverflowError:
        fail("HP_JSON_LIMIT", fixture)
    except ValueError:
        fail("HP_SCHEMA", fixture)


def _validate_habitpack(path: Path, fixture: str = "package") -> dict[str, int]:
    if path.stat().st_size > MAX_ARCHIVE:
        fail("HP_ARCHIVE_TOO_LARGE", fixture)
    raw_archive = path.read_bytes()
    try:
        zip_profile_error = _validate_zip_layout(raw_archive)
    except HabitpackError as error:
        fail(error.code, fixture)
    except (ValueError, OverflowError, UnicodeError, zipfile.BadZipFile):
        fail("HP_ZIP_INVALID", fixture)
    try:
        archive = zipfile.ZipFile(path)
    except (zipfile.BadZipFile, OSError, ValueError, UnicodeError):
        fail("HP_ZIP_INVALID", fixture)
    with archive:
        try:
            infos = archive.infolist()
        except (zipfile.BadZipFile, OSError, ValueError, UnicodeError):
            fail("HP_ZIP_INVALID", fixture)
        if len(infos) > MAX_ENTRIES:
            fail("HP_TOO_MANY_ENTRIES", fixture)
        names: set[str] = set()
        normalized: dict[str, str] = {}
        total = 0
        for info in infos:
            name = info.filename
            if name in names:
                fail("HP_ZIP_DUPLICATE_ENTRY", f"{fixture}:{name}")
            names.add(name)
            code = _path_code(name)
            if code:
                fail(code, f"{fixture}:{name}")
            norm = unicodedata.normalize("NFC", name).casefold()
            if norm in normalized and normalized[norm] != name:
                kind = "HP_PATH_NFC_COLLISION" if unicodedata.normalize("NFC", normalized[norm]) == unicodedata.normalize("NFC", name) else "HP_PATH_CASEFOLD_COLLISION"
                fail(kind, f"{fixture}:{name}")
            normalized[norm] = name
            kind = _entry_type(info)
            if kind == "directory":
                fail("HP_DIRECTORY_ENTRY", f"{fixture}:{name}")
            if kind == "symlink":
                fail("HP_SYMLINK_ENTRY", f"{fixture}:{name}")
            if kind == "special":
                fail("HP_SPECIAL_ENTRY", f"{fixture}:{name}")
            if info.flag_bits & 1:
                fail("HP_ENCRYPTED_ENTRY", f"{fixture}:{name}")
            if _extra_has_zip64(info.extra) or _extra_has_zip64(_local_extra(raw_archive, info)) or info.file_size > 0xFFFFFFFF or info.compress_size > 0xFFFFFFFF:
                fail("HP_ZIP64_ENTRY", f"{fixture}:{name}")
            suffix = PurePosixPath(name).suffix.lower()
            if suffix in EXEC_EXTENSIONS:
                fail("HP_EXECUTABLE_EXTENSION", f"{fixture}:{name}")
            if suffix in NESTED_EXTENSIONS:
                fail("HP_NESTED_ARCHIVE", f"{fixture}:{name}")
            limit = MAX_MANIFEST if name == "manifest.json" else MAX_SECRET if name.startswith("secrets/") else MAX_JSON
            if info.file_size > limit:
                code = "HP_MANIFEST_TOO_LARGE" if name == "manifest.json" else "HP_SECRET_TOO_LARGE" if name.startswith("secrets/") else "HP_JSON_TOO_LARGE"
                fail(code, f"{fixture}:{name}")
            if info.compress_size and info.file_size / info.compress_size > MAX_RATIO:
                fail("HP_COMPRESSION_RATIO", f"{fixture}:{name}")
            total += info.file_size
        if total > MAX_TOTAL:
            fail("HP_TOTAL_TOO_LARGE", fixture)
        if names != set(normalized.values()):
            fail("HP_PATH_COLLISION", fixture)
        if zip_profile_error:
            fail(zip_profile_error, fixture)
        if "manifest.json" not in names:
            fail("HP_MANIFEST_MISSING", fixture)

        payloads: dict[str, bytes] = {}
        for info in infos:
            try:
                data = archive.read(info)
            except (zipfile.BadZipFile, OSError, ValueError, UnicodeError):
                fail("HP_ZIP_INVALID", f"{fixture}:{info.filename}")
            except RuntimeError:
                fail("HP_ZIP_READ", f"{fixture}:{info.filename}")
            magic = _magic_code(data[:16])
            if magic:
                fail(magic, f"{fixture}:{info.filename}")
            payloads[info.filename] = data

    manifest = strict_json(payloads["manifest.json"], "manifest.json")
    version = manifest.get("schema_version") if isinstance(manifest, dict) else None
    if not isinstance(version, str) or not re.fullmatch(r"\d+\.\d+\.\d+", version):
        fail("HP_VERSION_MALFORMED", fixture)
    if version != SCHEMA_VERSION:
        part = next((p for p, a, b in zip(("MAJOR", "MINOR", "PATCH"), version.split("."), SCHEMA_VERSION.split(".")) if a != b), "PATCH")
        fail(f"HP_VERSION_UNSUPPORTED_{part}", fixture)
    schemas, catalog = _load_schemas()
    _schema_validate(manifest, "manifest.schema.json", schemas)
    declared = manifest["files"]
    declared_paths = [item["path"] for item in declared]
    if len(declared_paths) != len(set(declared_paths)):
        fail("HP_MANIFEST_DUPLICATE_PATH", fixture)
    actual = names - {"manifest.json"}
    missing = set(declared_paths) - actual
    undeclared = actual - set(declared_paths)
    if missing:
        fail("HP_DECLARED_FILE_MISSING", f"{fixture}:{sorted(missing)[0]}")
    if undeclared:
        fail("HP_UNDECLARED_FILE", f"{fixture}:{sorted(undeclared)[0]}")
    for item in declared:
        name = item["path"]
        if not _allowed_path(name):
            fail("HP_PATH_NOT_ALLOWED", f"{fixture}:{name}")
        expected_media = SECRET_MEDIA if name.startswith("secrets/") else JSON_MEDIA
        if item["media_type"] != expected_media:
            fail("HP_MEDIA_TYPE", f"{fixture}:{name}")
        data = payloads[name]
        if item["size"] != len(data):
            fail("HP_SIZE_MISMATCH", f"{fixture}:{name}")
        if item["sha256"] != hashlib.sha256(data).hexdigest():
            fail("HP_HASH_MISMATCH", f"{fixture}:{name}")

    if "selections.json" not in payloads:
        fail("HP_SELECTIONS_MISSING", fixture)
    json_docs: dict[str, Any] = {}
    forbidden = re.compile(r'"(?:command|shell|powershell|script)"\s*:')
    for name, data in payloads.items():
        if name.endswith(".json"):
            if forbidden.search(data.decode("utf-8", "ignore")):
                fail("HP_FORBIDDEN_FIELD", f"{fixture}:{name}")
            json_docs[name] = strict_json(data, name)
    _schema_validate(json_docs["selections.json"], "selections.schema.json", schemas)

    catalog_map = {(r["rule_id"], r["rule_version"]): r for r in catalog["rules"]}
    candidates: dict[str, tuple[str, dict[str, Any]]] = {}
    wifi_refs: list[tuple[str, str]] = []
    for module in MODULES:
        name = f"modules/{module}.json"
        if name not in json_docs:
            continue
        doc = json_docs[name]
        _schema_validate(doc, f"{module}.schema.json", schemas)
        for candidate in doc["candidates"]:
            cid = candidate["candidate_id"]
            if cid in candidates:
                fail("HP_CANDIDATE_DUPLICATE", f"{fixture}:{cid}")
            candidates[cid] = (module, candidate)
            rule = catalog_map.get((candidate["rule_id"], candidate["rule_version"]))
            if not rule:
                known_id = any(r["rule_id"] == candidate["rule_id"] for r in catalog["rules"])
                fail("HP_RULE_VERSION_UNKNOWN" if known_id else "HP_RULE_UNKNOWN", f"{fixture}:{candidate['rule_id']}")
            if rule["module"] != module:
                fail("HP_RULE_MODULE", f"{fixture}:{candidate['rule_id']}")
            _schema_validate(candidate["parameters"], rule["parameters_schema"], schemas)
            if module == "wifi":
                params = candidate["parameters"]
                status, ref = params["credential_status"], params.get("credential_ref")
                if status == "available" and not ref:
                    fail("HP_SECRET_REF_REQUIRED", f"{fixture}:{cid}")
                if status != "available" and ref:
                    fail("HP_SECRET_REF_FORBIDDEN", f"{fixture}:{cid}")
                if ref:
                    wifi_refs.append((cid, ref))

    selected_ids = set(json_docs["selections.json"]["selected_candidate_ids"])
    for selected in selected_ids:
        if selected not in candidates:
            fail("HP_SELECTION_UNKNOWN", f"{fixture}:{selected}")
    for candidate_id, _ in wifi_refs:
        if candidate_id not in selected_ids:
            fail("HP_SECRET_UNSELECTED", f"{fixture}:{candidate_id}")
    ref_paths = [ref for _, ref in wifi_refs]
    if len(ref_paths) != len(set(ref_paths)):
        fail("HP_SECRET_SHARED", fixture)
    secret_paths = {n for n in payloads if n.startswith("secrets/")}
    missing_refs = set(ref_paths) - secret_paths
    orphan = secret_paths - set(ref_paths)
    if missing_refs:
        fail("HP_SECRET_MISSING", f"{fixture}:{sorted(missing_refs)[0]}")
    if orphan:
        fail("HP_SECRET_ORPHAN", f"{fixture}:{sorted(orphan)[0]}")
    has_secrets = bool(secret_paths)
    if manifest["contains_secrets"] != has_secrets:
        fail("HP_CONTAINS_SECRETS_FALSE" if has_secrets else "HP_CONTAINS_SECRETS_TRUE", fixture)
    return {"entries": len(payloads), "candidates": len(candidates), "secrets": len(secret_paths)}
