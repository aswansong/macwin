from __future__ import annotations

import hashlib
import json
import os
import random
import stat
import struct
import warnings
import zipfile
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
    elif profile in {"wifi_name", "wifi_unavailable", "wifi_secret"}:
        candidate = _candidate("wifi")
        if profile == "wifi_unavailable": candidate["parameters"]["credential_status"] = "unavailable"
        if profile == "wifi_secret":
            candidate["parameters"].update({"credential_status": "available", "credential_ref": "secrets/wifi/fixture-one.bin"})
        modules["wifi"] = [candidate]
    elif profile == "guide": guide = True
    entries: dict[str, bytes] = {}
    selected: list[str] = []
    for module, candidates in modules.items():
        entries[f"modules/{module}.json"] = _json({"schema_version": "1.0.0", "module": module, "candidates": candidates})
        selected.extend(c["candidate_id"] for c in candidates)
    if profile == "wifi_secret": entries["secrets/wifi/fixture-one.bin"] = b"FICTIONAL-WIFI-OPAQUE-BYTES-v1"
    entries["selections.json"] = _json({"schema_version": "1.0.0", "guide_requested": guide, "selected_candidate_ids": selected})
    manifest = _manifest(entries, bool(profile == "wifi_secret"))
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
            d=json.loads(e["modules/wifi.json"]); c2=deepcopy(c); c2["candidate_id"]="wifi.2"; d["candidates"].append(c2); e["modules/wifi.json"]=_json(d)
        elif m=="contains_false": mf["contains_secrets"]=False
        elif m=="contains_true": mf["contains_secrets"]=True; c["parameters"].pop("credential_ref"); c["parameters"]["credential_status"]="not_selected"; e["modules/wifi.json"]=_json({"schema_version":"1.0.0","module":"wifi","candidates":[c]})
    elif m in {"mz","elf","macho","shebang"}: e[keyboard]={"mz":b"MZxx","elf":b"\x7fELFxx","macho":b"\xfe\xed\xfa\xcfx","shebang":b"#!/bin/sh"}[m]
    elif m in {"command","shell"}: _rewrite_json(e, keyboard, lambda d: d.update({m:"do bad"}))
    elif m == "extra_prop": _rewrite_json(e, keyboard, lambda d: d.update(extra=True))
    elif m == "duplicate_key": e[keyboard]=b'{"schema_version":"1.0.0","schema_version":"1.0.0"}'
    elif m == "invalid_json": e[keyboard]=b"{"
    elif m in {"major","minor","patch","malformed"}: mf["schema_version"]={"major":"2.0.0","minor":"1.1.0","patch":"1.0.1","malformed":"one"}[m]
    elif m in {"directory","symlink","special","encrypted","zip64"}: meta[m]=True


def _write_zip(path: Path, entries: dict[str, bytes], manifest: bytes, mutation: str|None, meta: dict[str, Any]) -> None:
    compression = zipfile.ZIP_STORED if mutation in {"archive_over"} else zipfile.ZIP_DEFLATED
    with zipfile.ZipFile(path,"w",compression=compression,allowZip64=True) as z:
        if meta.get("directory"): z.writestr("bad/",b""); return
        if meta.get("symlink") or meta.get("special"):
            i=zipfile.ZipInfo("bad"); i.create_system=3; i.external_attr=((stat.S_IFLNK if meta.get("symlink") else stat.S_IFIFO)|0o644)<<16; z.writestr(i,b"target"); return
        info=zipfile.ZipInfo("manifest.json"); info.compress_type=compression
        if meta.get("zip64"): info.extra=struct.pack("<HHQ",1,8,len(manifest))
        z.writestr(info,manifest)
        for name,data in entries.items(): z.writestr(name,data)
        if meta.get("duplicate"):
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                z.writestr(meta["duplicate"], entries[meta["duplicate"]])
    if meta.get("encrypted"):
        data=bytearray(path.read_bytes())
        for sig,off in ((b"PK\x03\x04",6),(b"PK\x01\x02",8)):
            pos=0
            while True:
                pos=data.find(sig,pos)
                if pos<0: break
                flags=struct.unpack_from("<H",data,pos+off)[0]|1; struct.pack_into("<H",data,pos+off,flags); pos+=4
        path.write_bytes(data)
