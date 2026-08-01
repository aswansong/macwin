from __future__ import annotations

import hashlib
import json
import os
import random
import stat
import struct
import warnings
import zipfile
import zlib
from copy import deepcopy
from pathlib import Path
from typing import Any

from .validator import JSON_MEDIA, SECRET_MEDIA

ROOT = Path(__file__).resolve().parents[2]
MATRIX = json.loads((ROOT / "fixtures/m1/fixture-matrix.json").read_text())


def _candidate(module: str, number: int = 1) -> dict[str, Any]:
    params: dict[str, Any]
    rule = {
        "keyboard": "fixture.keyboard.ctrl_editing",
        "pointer": "fixture.pointer.scroll",
        "software": "fixture.software.browser",
        "developer": "fixture.developer.lightweight",
        "wifi": "fixture.wifi.personal",
    }[module]
    if module == "keyboard": params = {"profile": "ctrl_editing_compat"}
    elif module == "pointer": params = {"device": "mouse", "scroll_direction": "windows_style"}
    elif module == "software": params = {"software_id": "chrome", "confirmation_stage": "mac_plan"}
    elif module == "developer": params = {"tool_id": "vscode", "install_homebrew": False}
    else: params = {"network_label": f"虚构网络 {number}", "security": "wpa2-personal", "credential_status": "not_selected"}
    return {"candidate_id": f"{module}.{number}", "rule_id": rule, "rule_version": "1.0.0", "source": {"kind": "fixture_detected", "label": "虚构检测结果"}, "status": "detected", "exclusion_reason": None, "parameters": params}


def package_source(profile: str) -> tuple[dict[str, bytes], dict[str, Any]]:
    modules: dict[str, list[dict[str, Any]]] = {}
    guide = False
    if profile == "keyboard": modules["keyboard"] = [_candidate("keyboard")]
    elif profile == "all":
        for name in ("keyboard", "pointer", "software", "developer", "wifi"): modules[name] = [_candidate(name)]
    elif profile == "software":
        candidate = _candidate("software"); candidate["status"] = "proposed_on_mac"; candidate["source"]["kind"] = "fixture_proposed"; modules["software"] = [candidate]
    elif profile in {"wifi_name", "wifi_unavailable", "wifi_secret", "wifi_secret_zip_signatures"}:
        candidate = _candidate("wifi")
        if profile == "wifi_unavailable": candidate["parameters"]["credential_status"] = "unavailable"
        if profile in {"wifi_secret", "wifi_secret_zip_signatures"}:
            candidate["parameters"].update({"credential_status": "available", "credential_ref": "secrets/wifi/fixture-one.bin"})
        modules["wifi"] = [candidate]
    elif profile == "guide": guide = True
    entries: dict[str, bytes] = {}
    selected: list[str] = []
    for module, candidates in modules.items():
        entries[f"modules/{module}.json"] = _json({"schema_version": "1.0.0", "module": module, "candidates": candidates})
        selected.extend(c["candidate_id"] for c in candidates)
    if profile == "wifi_secret": entries["secrets/wifi/fixture-one.bin"] = b"FICTIONAL-WIFI-OPAQUE-BYTES-v1"
    if profile == "wifi_secret_zip_signatures": entries["secrets/wifi/fixture-one.bin"] = b"OPAQUE-PK\x05\x06-EOCD-PK\x06\x06-ZIP64-PK\x06\x07-LOCATOR-EXTRA-\xfe\xca\x00\x00-FLAGS-\x04\x00\x00\x80-METHODS-0-8-12-14-99-END"
    entries["selections.json"] = _json({"schema_version": "1.0.0", "guide_requested": guide, "selected_candidate_ids": selected})
    manifest = _manifest(entries, profile in {"wifi_secret", "wifi_secret_zip_signatures"})
    return entries, manifest


def _json(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def _manifest(entries: dict[str, bytes], contains: bool = False) -> dict[str, Any]:
    files = []
    for path, data in sorted(entries.items()):
        files.append({"path": path, "media_type": SECRET_MEDIA if path.startswith("secrets/") else JSON_MEDIA, "size": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    return {"format": "macwin-habitpack", "schema_version": "1.0.0", "created_at": "2026-07-31T00:00:00Z", "created_by": {"app_version": "0.0.0-fixture", "ruleset_version": "fixture.m1"}, "source": {"os_family": "windows", "os_release": "11", "architecture": "x86_64"}, "target": {"os_family": "macos", "architecture": "arm64"}, "contains_secrets": contains, "files": files}


def _refresh(manifest: dict[str, Any], entries: dict[str, bytes]) -> None:
    manifest["files"] = _manifest(entries, manifest.get("contains_secrets", False))["files"]


def _rewrite_json(entries: dict[str, bytes], name: str, fn) -> None:
    value = json.loads(entries[name]); fn(value); entries[name] = _json(value)


def build_fixture(descriptor: dict[str, Any], destination: Path) -> None:
    profile = descriptor.get("profile", "keyboard")
    if descriptor.get("base"):
        profile = next(x["profile"] for x in MATRIX["valid"] if x["name"] == descriptor["base"])
    entries, manifest = package_source(profile)
    mutation = descriptor.get("mutation")
    meta: dict[str, Any] = {}
    if descriptor.get("stored"): meta["force_stored"] = True
    if mutation: _mutate(mutation, entries, manifest, meta)
    if mutation not in {"hash", "size", "missing", "undeclared", "secret_wrong_media", "manifest_over", "malformed", "major", "minor", "patch"}:
        _refresh(manifest, entries)
    manifest_bytes = meta.get("manifest_bytes", _json(manifest))
    if mutation == "archive_over":
        entries = {"oversize.dat": os.urandom(8 * 1024 * 1024 + 64)}; manifest_bytes = _json(manifest)
    if mutation == "total_over":
        rng = random.Random(7); seed = rng.randbytes(256 * 1024); raw = b"".join(bytes((byte,)) * 4 for byte in seed); entries = {f"bulk/{i}.json": raw for i in range(17)}
    _write_zip(destination, entries, manifest_bytes, mutation, meta)


def _mutate(m: str, e: dict[str, bytes], mf: dict[str, Any], meta: dict[str, Any]) -> None:
    keyboard = "modules/keyboard.json"
    if m in {"path_traversal","posix_absolute","windows_absolute","path_over","exec_ext","nested"}:
        name = {"path_traversal":"../evil.json","posix_absolute":"/evil.json","windows_absolute":"C:/evil.json","path_over":"x"*241,"exec_ext":"evil.exe","nested":"evil.zip"}[m]; e[name]=b"x"
    elif m == "undeclared": e["modules/pointer.json"] = _json({})
    elif m == "missing": mf["files"].append({"path":"modules/pointer.json","media_type":JSON_MEDIA,"size":3,"sha256":"0"*64})
    elif m == "casefold": e["Modules/keyboard.json"] = e[keyboard]
    elif m == "nfc": e["modules/cafe\u0301.json"] = b"{}"; e["modules/caf\u00e9.json"] = b"{}"
    elif m == "duplicate": meta["duplicate"] = "selections.json"
    elif m == "json_over": e[keyboard] = b" " * (1024*1024+1)
    elif m == "manifest_over": meta["manifest_bytes"] = b" "*(64*1024+1)
    elif m == "secret_over": e["secrets/wifi/too-big.bin"] = b"x"*(64*1024+1)
    elif m == "ratio": e[keyboard] = b"0"*(512*1024)
    elif m == "entry_count":
        for i in range(129): e[f"many/{i}.json"] = b"{}"
    elif m == "hash": mf["files"][0]["sha256"] = "0"*64
    elif m == "size": mf["files"][0]["size"] += 1
    elif m == "unknown_rule": _rewrite_json(e, keyboard, lambda d: d["candidates"][0].update(rule_id="fixture.unknown"))
    elif m == "unknown_rule_version": _rewrite_json(e, keyboard, lambda d: d["candidates"][0].update(rule_version="2.0.0"))
    elif m == "unknown_selection": _rewrite_json(e, "selections.json", lambda d: d["selected_candidate_ids"].append("missing.1"))
    elif m == "duplicate_candidate":
        cand = json.loads(e[keyboard])["candidates"][0]; e["modules/pointer.json"] = _json({"schema_version":"1.0.0","module":"pointer","candidates":[{**cand,"rule_id":"fixture.pointer.scroll","parameters":{"device":"mouse","scroll_direction":"natural"}}]})
    elif m.startswith("secret_") or m.startswith("contains_"):
        c=_candidate("wifi"); c["parameters"].update({"credential_status":"available","credential_ref":"secrets/wifi/fixture-one.bin"}); e.clear(); e["modules/wifi.json"]=_json({"schema_version":"1.0.0","module":"wifi","candidates":[c]}); e["selections.json"]=_json({"schema_version":"1.0.0","guide_requested":False,"selected_candidate_ids":["wifi.1"]})
        if m not in {"secret_missing","contains_true"}: e["secrets/wifi/fixture-one.bin"]=b"FICTIONAL"
        mf.update(_manifest(e, True))
        if m=="secret_wrong_dir": e["secrets/other/fixture-one.bin"]=e.pop("secrets/wifi/fixture-one.bin")
        elif m=="secret_wrong_media": next(x for x in mf["files"] if x["path"].startswith("secrets/"))["media_type"]=JSON_MEDIA
        elif m=="secret_orphan": e["secrets/wifi/orphan.bin"]=b"FICTIONAL"
        elif m=="secret_shared":
            d=json.loads(e["modules/wifi.json"]); c2=deepcopy(c); c2["candidate_id"]="wifi.2"; d["candidates"].append(c2); e["modules/wifi.json"]=_json(d); e["selections.json"]=_json({"schema_version":"1.0.0","guide_requested":False,"selected_candidate_ids":["wifi.1","wifi.2"]})
        elif m=="secret_unselected":
            e["selections.json"]=_json({"schema_version":"1.0.0","guide_requested":False,"selected_candidate_ids":[]})
        elif m=="contains_false": mf["contains_secrets"]=False
        elif m=="contains_true": mf["contains_secrets"]=True; c["parameters"].pop("credential_ref"); c["parameters"]["credential_status"]="not_selected"; e["modules/wifi.json"]=_json({"schema_version":"1.0.0","module":"wifi","candidates":[c]})
    elif m in {"mz","elf","macho","shebang"}: e[keyboard]={"mz":b"MZxx","elf":b"\x7fELFxx","macho":b"\xfe\xed\xfa\xcfx","shebang":b"#!/bin/sh"}[m]
    elif m in {"command","shell"}: _rewrite_json(e, keyboard, lambda d: d.update({m:"do bad"}))
    elif m == "extra_prop": _rewrite_json(e, keyboard, lambda d: d.update(extra=True))
    elif m == "duplicate_key": e[keyboard]=b'{"schema_version":"1.0.0","schema_version":"1.0.0"}'
    elif m == "invalid_json": e[keyboard]=b"{"
    elif m in {"json_nan","json_infinity","json_negative_infinity"}:
        constant = {"json_nan":"NaN","json_infinity":"Infinity","json_negative_infinity":"-Infinity"}[m]
        e["selections.json"] = ('{"schema_version":"1.0.0","guide_requested":false,"selected_candidate_ids":[],"nested":{"value":' + constant + '}}').encode()
    elif m in {"major","minor","patch","malformed"}: mf["schema_version"]={"major":"2.0.0","minor":"1.1.0","patch":"1.0.1","malformed":"one"}[m]
    elif m.startswith("created_at_"):
        mf["created_at"] = {
            "created_at_text": "not-a-time",
            "created_at_date": "2026-07-31",
            "created_at_invalid": "2026-02-30T25:61:61Z",
            "created_at_lowercase": "2026-07-31t00:00:00z",
            "created_at_offset": "2026-07-31T08:00:00+08:00",
            "created_at_leap_second": "2026-12-31T23:59:60Z",
            "created_at_fractional": "2026-07-31T00:00:00.001Z",
        }[m]
    elif m in {"directory","symlink","special","encrypted","zip64","sfx_prefix","trailing_data","archive_comment","comment_mismatch","multidisk","central_multidisk","central_offset","central_size","local_gap","double_eocd","fake_tail_eocd","data_descriptor","local_extra","central_extra","matching_extra","zero_extra","zip64_extra","flag_low","flag_high","flag_mismatch","bzip2","lzma","method_unknown","method_mismatch","local_version","central_version","both_version","made_by","internal_attr","external_attr_high","external_attr_low","local_timestamp","central_timestamp","both_timestamp","central_reverse","local_only_reverse","local_reverse","manifest_last","deflate_marker","deflate_second_stream","deflate_zero_padding","stored_size_mismatch","local_compressed_sentinel","local_file_sentinel","central_compressed_sentinel","central_file_sentinel"}: meta[m]=True
    if m == "stored_size_mismatch": meta["force_stored"] = True


def _insert_local_extra(data: bytearray, extra: bytes) -> bytearray:
    eocd = data.rfind(b"PK\x05\x06")
    cd_offset = struct.unpack_from("<L", data, eocd + 16)[0]
    position = cd_offset
    local_offsets: list[int] = []
    while position < eocd:
        name_length, extra_length, comment_length = struct.unpack_from("<HHH", data, position + 28)
        local_offsets.append(struct.unpack_from("<L", data, position + 42)[0])
        position += 46 + name_length + extra_length + comment_length
    local_offset = max(local_offsets)
    name_length, old_extra_length = struct.unpack_from("<HH", data, local_offset + 26)
    insertion = local_offset + 30 + name_length + old_extra_length
    data = data[:insertion] + extra + data[insertion:]
    struct.pack_into("<H", data, local_offset + 28, old_extra_length + len(extra))
    eocd += len(extra)
    struct.pack_into("<L", data, eocd + 16, cd_offset + len(extra))
    return bytearray(data)


def _insert_central_extra(data: bytearray, extra: bytes) -> bytearray:
    eocd = data.rfind(b"PK\x05\x06")
    cd_offset = struct.unpack_from("<L", data, eocd + 16)[0]
    position = cd_offset
    records: list[int] = []
    while position < eocd:
        records.append(position)
        name_length, extra_length, comment_length = struct.unpack_from("<HHH", data, position + 28)
        position += 46 + name_length + extra_length + comment_length
    central = records[-1]
    name_length, old_extra_length = struct.unpack_from("<HH", data, central + 28)
    insertion = central + 46 + name_length + old_extra_length
    data = data[:insertion] + extra + data[insertion:]
    struct.pack_into("<H", data, central + 30, old_extra_length + len(extra))
    eocd += len(extra)
    struct.pack_into("<L", data, eocd + 12, struct.unpack_from("<L", data, eocd + 12)[0] + len(extra))
    return bytearray(data)


def _canonical_info(name: str, compression: int) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
    info.create_system = 3
    info.create_version = 20
    info.extract_version = 10 if compression == zipfile.ZIP_STORED else 20
    info.internal_attr = 0
    info.external_attr = (stat.S_IFREG | 0o600) << 16
    info.flag_bits = 0
    info.compress_type = compression
    return info


def _append_compressed_suffix(data: bytearray, suffix: bytes, target_index: int) -> bytearray:
    eocd = data.rfind(b"PK\x05\x06"); cd_offset = struct.unpack_from("<L", data, eocd + 16)[0]
    central: list[tuple[int, int, int]] = []; position = cd_offset
    while position < eocd:
        name_length, extra_length, comment_length = struct.unpack_from("<HHH", data, position + 28)
        central.append((position, struct.unpack_from("<L", data, position + 42)[0], struct.unpack_from("<L", data, position + 20)[0]))
        position += 46 + name_length + extra_length + comment_length
    ordered = sorted(central, key=lambda item: item[1]); target = ordered[target_index]
    central_position, local_offset, compressed_size = target
    name_length, extra_length = struct.unpack_from("<HH", data, local_offset + 26)
    data_end = local_offset + 30 + name_length + extra_length + compressed_size
    delta = len(suffix); data = data[:data_end] + suffix + data[data_end:]
    struct.pack_into("<L", data, local_offset + 18, compressed_size + delta)
    new_eocd = eocd + delta; struct.pack_into("<L", data, new_eocd + 16, cd_offset + delta)
    for position, offset, size in central:
        shifted = position + delta
        if position == central_position: struct.pack_into("<L", data, shifted + 20, size + delta)
        if offset > local_offset: struct.pack_into("<L", data, shifted + 42, offset + delta)
    return bytearray(data)


def _write_zip(path: Path, entries: dict[str, bytes], manifest: bytes, mutation: str|None, meta: dict[str, Any]) -> None:
    if meta.get("bzip2"): compression = zipfile.ZIP_BZIP2
    elif meta.get("lzma"): compression = zipfile.ZIP_LZMA
    else: compression = zipfile.ZIP_STORED if mutation in {"archive_over"} or meta.get("force_stored") else zipfile.ZIP_DEFLATED
    with zipfile.ZipFile(path,"w",compression=compression,compresslevel=meta.get("compresslevel"),allowZip64=True) as z:
        if meta.get("directory"): z.writestr("bad/",b""); return
        if meta.get("symlink") or meta.get("special"):
            i=zipfile.ZipInfo("bad"); i.create_system=3; i.external_attr=((stat.S_IFLNK if meta.get("symlink") else stat.S_IFIFO)|0o644)<<16; z.writestr(i,b"target"); return
        records = [("manifest.json", manifest), *sorted(entries.items(), key=lambda item: item[0].encode("utf-8"))]
        if meta.get("local_reverse"): records.reverse()
        elif meta.get("manifest_last"): records = [*records[1:], records[0]]
        for name, data in records:
            z.writestr(_canonical_info(name, compression), data)
        if meta.get("duplicate"):
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                z.writestr(meta["duplicate"], entries[meta["duplicate"]])
        if meta.get("archive_comment"):
            z.comment = b"M1-comments-are-forbidden"
    if meta.get("zip64"):
        data = path.read_bytes()
        eocd = data.rfind(b"PK\x05\x06")
        signature, disk, cd_disk, disk_entries, total_entries, cd_size, cd_offset, comment_length = struct.unpack_from("<4s4H2LH", data, eocd)
        assert signature == b"PK\x05\x06" and comment_length == 0
        zip64_eocd = struct.pack("<4sQ2H2L4Q", b"PK\x06\x06", 44, 45, 45, disk, cd_disk, disk_entries, total_entries, cd_size, cd_offset)
        locator = struct.pack("<4sLQL", b"PK\x06\x07", 0, eocd, 1)
        sentinel_eocd = struct.pack("<4s4H2LH", b"PK\x05\x06", 0, 0, 0xFFFF, 0xFFFF, 0xFFFFFFFF, 0xFFFFFFFF, 0)
        path.write_bytes(data[:eocd] + zip64_eocd + locator + sentinel_eocd)
    if any(meta.get(name) for name in ("sfx_prefix","trailing_data","comment_mismatch","multidisk","central_multidisk","central_offset","central_size","local_gap","double_eocd","fake_tail_eocd","data_descriptor")):
        data = bytearray(path.read_bytes())
        eocd = data.rfind(b"PK\x05\x06")
        if meta.get("sfx_prefix"): data = bytearray(b"MZ-SFX-PREFIX" + data)
        elif meta.get("trailing_data"): data.extend(b"TRAILING-DATA")
        elif meta.get("comment_mismatch"): struct.pack_into("<H", data, eocd + 20, 7)
        elif meta.get("multidisk"): struct.pack_into("<H", data, eocd + 4, 1)
        elif meta.get("central_multidisk"):
            cd_offset = struct.unpack_from("<L", data, eocd + 16)[0]
            struct.pack_into("<H", data, cd_offset + 34, 1)
        elif meta.get("central_offset"): struct.pack_into("<L", data, eocd + 16, struct.unpack_from("<L", data, eocd + 16)[0] + 1)
        elif meta.get("central_size"): struct.pack_into("<L", data, eocd + 12, struct.unpack_from("<L", data, eocd + 12)[0] - 1)
        elif meta.get("local_gap"):
            cd_offset = struct.unpack_from("<L", data, eocd + 16)[0]
            data = data[:cd_offset] + b"\x00" + data[cd_offset:]
            eocd += 1
            struct.pack_into("<L", data, eocd + 16, cd_offset + 1)
        elif meta.get("double_eocd"): data.extend(data[eocd:eocd + 22])
        elif meta.get("fake_tail_eocd"): data.extend(struct.pack("<4s4H2LH", b"PK\x05\x06", 0, 0, 0, 0, 0, 0, 0))
        elif meta.get("data_descriptor"):
            struct.pack_into("<H", data, 6, struct.unpack_from("<H", data, 6)[0] | 0x08)
            cd_offset = struct.unpack_from("<L", data, eocd + 16)[0]
            struct.pack_into("<H", data, cd_offset + 8, struct.unpack_from("<H", data, cd_offset + 8)[0] | 0x08)
        path.write_bytes(data)
    if any(meta.get(name) for name in ("local_extra","central_extra","matching_extra","zero_extra","zip64_extra","flag_low","flag_high","flag_mismatch","method_unknown","method_mismatch")):
        data = bytearray(path.read_bytes())
        generic_extra = struct.pack("<HH", 0xCAFE, 0)
        if meta.get("local_extra"): data = _insert_local_extra(data, generic_extra)
        elif meta.get("central_extra"): data = _insert_central_extra(data, generic_extra)
        elif meta.get("matching_extra") or meta.get("zero_extra"):
            data = _insert_local_extra(data, generic_extra); data = _insert_central_extra(data, generic_extra)
        elif meta.get("zip64_extra"):
            data = _insert_local_extra(data, struct.pack("<HH", 0x0001, 0)); data = _insert_central_extra(data, struct.pack("<HH", 0x0001, 0))
        else:
            eocd = data.rfind(b"PK\x05\x06"); cd_offset = struct.unpack_from("<L", data, eocd + 16)[0]
            if meta.get("flag_low"):
                struct.pack_into("<H", data, 6, 0x0004); struct.pack_into("<H", data, cd_offset + 8, 0x0004)
            elif meta.get("flag_high"):
                struct.pack_into("<H", data, 6, 0x8000); struct.pack_into("<H", data, cd_offset + 8, 0x8000)
            elif meta.get("flag_mismatch"): struct.pack_into("<H", data, cd_offset + 8, 0x0010)
            elif meta.get("method_unknown"):
                struct.pack_into("<H", data, 8, 99); struct.pack_into("<H", data, cd_offset + 10, 99)
            elif meta.get("method_mismatch"): struct.pack_into("<H", data, cd_offset + 10, 99)
        path.write_bytes(data)
    if any(meta.get(name) for name in ("local_version","central_version","both_version","made_by","internal_attr","external_attr_high","external_attr_low","local_timestamp","central_timestamp","both_timestamp","central_reverse","local_only_reverse")):
        data = bytearray(path.read_bytes())
        eocd = data.rfind(b"PK\x05\x06"); cd_offset = struct.unpack_from("<L", data, eocd + 16)[0]
        if meta.get("local_version") or meta.get("both_version"): struct.pack_into("<H", data, 4, 45)
        if meta.get("central_version") or meta.get("both_version"): struct.pack_into("<H", data, cd_offset + 6, 45)
        if meta.get("made_by"): struct.pack_into("<H", data, cd_offset + 4, 0x0014)
        if meta.get("internal_attr"): struct.pack_into("<H", data, cd_offset + 36, 0x0042)
        if meta.get("external_attr_high"): struct.pack_into("<L", data, cd_offset + 38, (stat.S_IFREG | 0o644) << 16)
        if meta.get("external_attr_low"): struct.pack_into("<L", data, cd_offset + 38, ((stat.S_IFREG | 0o600) << 16) | 0xBEEF)
        if meta.get("local_timestamp") or meta.get("both_timestamp"):
            struct.pack_into("<HH", data, 10, 0x1000, 0x0022)
        if meta.get("central_timestamp") or meta.get("both_timestamp"):
            struct.pack_into("<HH", data, cd_offset + 12, 0x1000, 0x0022)
        if meta.get("central_reverse"):
            records: list[bytes] = []; position = cd_offset
            while position < eocd:
                name_length, extra_length, comment_length = struct.unpack_from("<HHH", data, position + 28)
                end = position + 46 + name_length + extra_length + comment_length
                records.append(bytes(data[position:end])); position = end
            data[cd_offset:eocd] = b"".join(reversed(records))
        if meta.get("local_only_reverse"):
            central: list[tuple[int, bytes, int]] = []; position = cd_offset
            while position < eocd:
                name_length, extra_length, comment_length = struct.unpack_from("<HHH", data, position + 28)
                name = bytes(data[position + 46:position + 46 + name_length])
                central.append((position, name, struct.unpack_from("<L", data, position + 42)[0]))
                position += 46 + name_length + extra_length + comment_length
            ordered = sorted(central, key=lambda item: item[2])
            blobs: dict[bytes, bytes] = {}
            for index, (_, name, offset) in enumerate(ordered):
                end = ordered[index + 1][2] if index + 1 < len(ordered) else cd_offset
                blobs[name] = bytes(data[offset:end])
            new_order = [name for _, name, _ in reversed(ordered)]
            cursor = 0; offsets: dict[bytes, int] = {}
            for name in new_order:
                offsets[name] = cursor; cursor += len(blobs[name])
            data[:cd_offset] = b"".join(blobs[name] for name in new_order)
            for position, name, _ in central:
                struct.pack_into("<L", data, position + 42, offsets[name])
        path.write_bytes(data)
    if any(meta.get(name) for name in ("deflate_marker","deflate_second_stream","deflate_zero_padding","stored_size_mismatch")):
        data = bytearray(path.read_bytes())
        if meta.get("deflate_marker"):
            data = _append_compressed_suffix(data, b"POST-STREAM-MARKER", 0)
        elif meta.get("deflate_second_stream"):
            encoder = zlib.compressobj(level=6, wbits=-zlib.MAX_WBITS)
            second = encoder.compress(b"SECOND-RAW-DEFLATE") + encoder.flush()
            data = _append_compressed_suffix(data, second, -1)
        elif meta.get("deflate_zero_padding"):
            data = _append_compressed_suffix(data, b"\x00\x00\x00\x00", 1)
        elif meta.get("stored_size_mismatch"):
            data = _append_compressed_suffix(data, b"X", -1)
        path.write_bytes(data)
    if any(meta.get(name) for name in ("local_compressed_sentinel","local_file_sentinel","central_compressed_sentinel","central_file_sentinel")):
        data = bytearray(path.read_bytes()); eocd = data.rfind(b"PK\x05\x06"); cd_offset = struct.unpack_from("<L", data, eocd + 16)[0]
        if meta.get("local_compressed_sentinel"): struct.pack_into("<L", data, 18, 0xFFFFFFFF)
        elif meta.get("local_file_sentinel"): struct.pack_into("<L", data, 22, 0xFFFFFFFF)
        elif meta.get("central_compressed_sentinel"): struct.pack_into("<L", data, cd_offset + 20, 0xFFFFFFFF)
        elif meta.get("central_file_sentinel"): struct.pack_into("<L", data, cd_offset + 24, 0xFFFFFFFF)
        path.write_bytes(data)
    if meta.get("encrypted"):
        data=bytearray(path.read_bytes())
        for sig,off in ((b"PK\x03\x04",6),(b"PK\x01\x02",8)):
            pos=0
            while True:
                pos=data.find(sig,pos)
                if pos<0: break
                flags=struct.unpack_from("<H",data,pos+off)[0]|1; struct.pack_into("<H",data,pos+off,flags); pos+=4
        path.write_bytes(data)
