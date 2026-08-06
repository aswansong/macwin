#!/usr/bin/env python3
"""Align release-facing manifests with an existing vMAJOR.MINOR.PATCH tag.

The script only edits files in the supplied repository root. It deliberately
requires the tag version to match the Rust package version so the application,
updater manifest and runtime `CARGO_PKG_VERSION` cannot drift apart.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


TAG_RE = re.compile(r"^v(?P<version>[0-9]+\.[0-9]+\.[0-9]+)$")


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def _cargo_package_version(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    package = re.search(r"(?ms)^\[package\]\s*(.*?)(?=^\[|\Z)", text)
    if package is None:
        raise ValueError("src-tauri/Cargo.toml has no [package] section")
    version = re.search(r'^version\s*=\s*"([^"]+)"\s*$', package.group(1), re.MULTILINE)
    if version is None:
        raise ValueError("src-tauri/Cargo.toml has no package version")
    return version.group(1)


def prepare_release(root: Path, tag: str) -> str:
    match = TAG_RE.fullmatch(tag)
    if match is None:
        raise ValueError(f"release tag must be vMAJOR.MINOR.PATCH: {tag}")
    version = match.group("version")
    cargo_version = _cargo_package_version(root / "src-tauri/Cargo.toml")
    if version != cargo_version:
        raise ValueError(f"release tag {version} does not match Cargo package version {cargo_version}")

    tauri_path = root / "src-tauri/tauri.conf.json"
    package_path = root / "package.json"
    lock_path = root / "package-lock.json"
    tauri = _read_json(tauri_path)
    package = _read_json(package_path)
    lockfile = _read_json(lock_path)
    packages = lockfile.get("packages")
    if not isinstance(packages, dict) or not isinstance(packages.get(""), dict):
        raise ValueError("package-lock.json has no root package record")

    tauri["version"] = version
    package["version"] = version
    lockfile["version"] = version
    packages[""]["version"] = version
    tauri_path.write_text(json.dumps(tauri, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lock_path.write_text(json.dumps(lockfile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return version


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(f"usage: {argv[0]} vMAJOR.MINOR.PATCH", file=sys.stderr)
        return 2
    try:
        version = prepare_release(Path.cwd(), argv[1])
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"release preparation failed: {error}", file=sys.stderr)
        return 1
    print(f"prepared MacWin release {version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
