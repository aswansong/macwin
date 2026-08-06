#!/usr/bin/env python3
"""Validate the public, unsigned v1.0.1 release staging directory.

This validator intentionally knows only the public release contract.  It is
kept separate from the signed-release validator so an unsigned public build
cannot accidentally inherit an updater manifest or an old rc asset.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any


EXPECTED_TAG = "v1.0.1"
EXPECTED_VERSION = "1.0.1"
EXPECTED_SCHEMA = "1.0.0"
EXPECTED_ASSETS = {
    "MacWin_1.0.1_x64-setup.exe",
    "MacWin_1.0.1_aarch64.dmg",
    "BUILD-INFO.json",
    "README-FIRST.md",
    "SHA256SUMS.txt",
    "BUILD_COMMIT-windows.txt",
    "BUILD_COMMIT-macos.txt",
}
EXPECTED_PLATFORMS = {"windows-x64", "macos-arm64"}
COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")


class ValidationError(ValueError):
    """A release staging contract violation."""


def _fail(message: str) -> None:
    raise ValidationError(message)


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        _fail(f"invalid JSON: {path.name}: {exc}")
    if not isinstance(value, dict):
        _fail(f"BUILD-INFO must be a JSON object: {path.name}")
    return value


def _file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _validate_build_info(info: dict[str, Any], expected_commit: str) -> None:
    if info.get("tag") != EXPECTED_TAG:
        _fail(f"BUILD-INFO tag must be {EXPECTED_TAG}")
    if info.get("commit") != expected_commit:
        _fail("BUILD-INFO commit does not match the checked-out commit")
    if info.get("version") != EXPECTED_VERSION:
        _fail("BUILD-INFO still contains an rc or another version")
    if info.get("schema_version") != EXPECTED_SCHEMA:
        _fail("BUILD-INFO schema_version changed")
    if info.get("unsigned") is not True:
        _fail("public BUILD-INFO must set unsigned=true")
    platforms = info.get("platforms")
    if not isinstance(platforms, list):
        _fail("BUILD-INFO platforms must be a list")
    names = set()
    for platform in platforms:
        if not isinstance(platform, dict) or not isinstance(platform.get("platform"), str):
            _fail("BUILD-INFO contains an invalid platform entry")
        names.add(platform["platform"])
        if platform.get("build_commit") != expected_commit:
            _fail("a platform BUILD_COMMIT does not match the checked-out commit")
    if names != EXPECTED_PLATFORMS:
        _fail(f"BUILD-INFO platforms must be {sorted(EXPECTED_PLATFORMS)}")


def _validate_checksums(root: Path) -> None:
    checksum_path = root / "SHA256SUMS.txt"
    lines = checksum_path.read_text(encoding="utf-8").splitlines()
    entries: dict[str, str] = {}
    for line in lines:
        if not line.strip():
            continue
        parts = line.split(maxsplit=1)
        if len(parts) != 2 or not re.fullmatch(r"[0-9a-f]{64}", parts[0]):
            _fail(f"invalid SHA256SUMS line: {line!r}")
        name = parts[1].lstrip("*")
        if name in entries:
            _fail(f"duplicate checksum entry: {name}")
        if Path(name).name != name or name == "SHA256SUMS.txt":
            _fail(f"invalid checksum path: {name}")
        entries[name] = parts[0]

    required = EXPECTED_ASSETS - {"SHA256SUMS.txt"}
    if set(entries) != required:
        _fail("SHA256SUMS must contain every non-checksum release asset exactly once")
    for name, expected in entries.items():
        path = root / name
        if not path.is_file():
            _fail(f"checksum refers to a missing asset: {name}")
        actual = _file_hash(path)
        if actual != expected:
            _fail(f"checksum mismatch: {name}")


def validate_public_assets(root: Path, tag: str, expected_commit: str) -> None:
    if tag != EXPECTED_TAG:
        _fail(f"public release tag must be {EXPECTED_TAG}, got {tag}")
    if not COMMIT_RE.fullmatch(expected_commit):
        _fail("expected commit must be a full 40-character SHA-1")
    if not root.is_dir():
        _fail(f"asset directory does not exist: {root}")

    names = {path.name for path in root.iterdir() if path.is_file()}
    if names != EXPECTED_ASSETS:
        _fail(f"release asset set mismatch; expected {sorted(EXPECTED_ASSETS)}, got {sorted(names)}")
    if any(re.search(r"(^|[-_.])rc(?:[-_.]|$)", name.lower()) for name in names):
        _fail("public release assets must not contain rc names")

    for marker_name in ("BUILD_COMMIT-windows.txt", "BUILD_COMMIT-macos.txt"):
        marker = (root / marker_name).read_text(encoding="utf-8").strip()
        if marker != expected_commit:
            _fail(f"{marker_name} does not match the checked-out commit")

    _validate_build_info(_read_json(root / "BUILD-INFO.json"), expected_commit)
    _validate_checksums(root)


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        print(f"usage: {argv[0]} TAG COMMIT ASSET_DIR", file=sys.stderr)
        return 2
    try:
        validate_public_assets(Path(argv[3]), argv[1], argv[2])
    except ValidationError as exc:
        print(f"PUBLIC_RELEASE_INVALID: {exc}", file=sys.stderr)
        return 1
    print(f"PUBLIC_RELEASE_VALID: {argv[1]} {argv[2]} assets={len(EXPECTED_ASSETS)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
