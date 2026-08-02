#!/usr/bin/env python3
"""Validate the downloaded, signed release bundles before publishing them.

The build jobs remain responsible for invoking platform signing tools. This
script validates the resulting, non-secret evidence after GitHub Actions has
downloaded both artifacts: per-platform checksums, SBOM JSON, installer and
updater presence, and the generated updater manifest. It never signs,
downloads, or installs anything.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse


TAG_RE = re.compile(r"^v[0-9]+\.[0-9]+\.[0-9]+$")
PLATFORMS = {
    "darwin-aarch64": "macOS Apple Silicon",
    "windows-x86_64": "Windows x64",
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _parse_checksums(path: Path) -> list[tuple[str, Path]]:
    entries: list[tuple[str, Path]] = []
    seen: set[str] = set()
    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line:
            continue
        parts = line.split(maxsplit=1)
        if len(parts) != 2 or len(parts[0]) != 64 or not re.fullmatch(r"[0-9a-f]{64}", parts[0]):
            raise ValueError(f"invalid checksum line {path}:{line_number}")
        name = parts[1].removeprefix("*")
        candidate = Path(name)
        if candidate.is_absolute() or ".." in candidate.parts or candidate.name != name:
            raise ValueError(f"checksum path must be a local filename: {path}:{line_number}")
        if name in seen:
            raise ValueError(f"duplicate checksum entry in {path}: {name}")
        seen.add(name)
        entries.append((parts[0], path.parent / name))
    if not entries:
        raise ValueError(f"checksum file is empty: {path}")
    return entries


def _validate_bundle(bundle: Path) -> dict[str, object]:
    checksums = bundle / "SHA256SUMS.txt"
    if not checksums.is_file():
        raise ValueError(f"missing per-platform SHA256SUMS.txt: {bundle}")
    entries = _parse_checksums(checksums)
    files = {path.name: path for _, path in entries}
    for expected, path in entries:
        if not path.is_file():
            raise ValueError(f"checksum references missing file: {path}")
        if _sha256(path) != expected:
            raise ValueError(f"checksum mismatch: {path}")
    for name in ("sbom-cargo.json", "sbom-npm.json"):
        path = files.get(name)
        if path is None:
            raise ValueError(f"missing {name}: {bundle}")
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            raise ValueError(f"invalid {name}: {bundle}") from error
        if not isinstance(value, dict):
            raise ValueError(f"{name} must be a JSON object: {bundle}")

    mac_updaters = [path for path in files.values() if path.name.endswith(".app.tar.gz")]
    mac_signatures = [path for path in files.values() if path.name.endswith(".app.tar.gz.sig")]
    mac_dmgs = [path for path in files.values() if path.suffix == ".dmg"]
    windows_installers = [path for path in files.values() if path.suffix in {".msi", ".exe"}]
    windows_updaters = [
        path
        for path in files.values()
        if path.name.endswith(".msi.zip") or path.name.endswith(".nsis.zip")
    ]

    if mac_updaters or mac_dmgs:
        if len(mac_updaters) != 1 or len(mac_signatures) != 1 or len(mac_dmgs) != 1:
            raise ValueError(f"macOS bundle must contain one DMG, updater archive and signature: {bundle}")
        if not mac_signatures[0].read_text(encoding="utf-8").strip():
            raise ValueError(f"empty macOS updater signature: {mac_signatures[0]}")
        return {"platform": "darwin-aarch64", "updater": mac_updaters[0].name}

    if windows_installers or windows_updaters:
        if not windows_installers:
            raise ValueError(f"Windows bundle must contain an installer: {bundle}")
        msi = [path for path in windows_updaters if path.name.endswith(".msi.zip")]
        nsis = [path for path in windows_updaters if path.name.endswith(".nsis.zip")]
        if len(msi) > 1 or len(nsis) > 1 or not (msi or nsis):
            raise ValueError(f"Windows bundle must contain at most one MSI and one NSIS updater: {bundle}")
        for updater in [*msi, *nsis]:
            signature = updater.with_name(updater.name + ".sig")
            if signature not in files.values():
                raise ValueError(f"missing Windows updater signature: {signature}")
            if not signature.read_text(encoding="utf-8").strip():
                raise ValueError(f"empty Windows updater signature: {signature}")
        # Match build-release-manifest.py: MSI is the deterministic preference.
        selected = msi[0] if msi else nsis[0]
        return {"platform": "windows-x86_64", "updater": selected.name}

    raise ValueError(f"cannot classify release bundle: {bundle}")


def _validate_manifest(root: Path, tag: str, expected: dict[str, dict[str, object]]) -> None:
    manifest_path = root / "latest.json"
    if not manifest_path.is_file():
        raise ValueError("missing generated latest.json")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError("latest.json is not valid JSON") from error
    if not isinstance(manifest, dict) or manifest.get("version") != tag.removeprefix("v"):
        raise ValueError("latest.json version does not match release tag")
    platforms = manifest.get("platforms")
    if not isinstance(platforms, dict) or set(platforms) != set(PLATFORMS):
        raise ValueError("latest.json must contain exactly macOS and Windows updater platforms")
    for platform, metadata in platforms.items():
        if not isinstance(metadata, dict):
            raise ValueError(f"latest.json platform is not an object: {platform}")
        url = metadata.get("url")
        signature = metadata.get("signature")
        if not isinstance(url, str) or not isinstance(signature, str) or not signature.strip():
            raise ValueError(f"latest.json has incomplete updater metadata: {platform}")
        name = Path(urlparse(url).path).name
        if name != expected[platform]["updater"]:
            raise ValueError(f"latest.json points to an unexpected {platform} updater")
        matches = list(root.rglob(name))
        if len(matches) != 1:
            raise ValueError(f"latest.json updater is missing or ambiguous: {name}")


def validate_release_assets(root: Path, tag: str) -> dict[str, dict[str, object]]:
    if TAG_RE.fullmatch(tag) is None:
        raise ValueError(f"release tag must be vMAJOR.MINOR.PATCH: {tag}")
    bundles = sorted(path.parent for path in root.rglob("SHA256SUMS.txt"))
    if len(bundles) != len(PLATFORMS):
        raise ValueError(f"expected one bundle per platform, found {len(bundles)}")
    evidence: dict[str, dict[str, object]] = {}
    for bundle in bundles:
        item = _validate_bundle(bundle)
        platform = str(item["platform"])
        if platform in evidence:
            raise ValueError(f"duplicate release bundle: {PLATFORMS[platform]}")
        evidence[platform] = item
    if set(evidence) != set(PLATFORMS):
        raise ValueError("release bundles do not cover macOS Apple Silicon and Windows x64")
    _validate_manifest(root, tag, evidence)
    return evidence


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(f"usage: {argv[0]} vMAJOR.MINOR.PATCH release-assets", file=sys.stderr)
        return 2
    try:
        evidence = validate_release_assets(Path(argv[2]), argv[1])
    except (OSError, ValueError, UnicodeError) as error:
        print(f"release asset validation failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps(evidence, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
