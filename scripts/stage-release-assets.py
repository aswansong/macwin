#!/usr/bin/env python3
"""Flatten platform build artifacts into uniquely named public Release assets."""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
from pathlib import Path


TARGETS = {
    "aarch64-apple-darwin": "darwin-aarch64",
    "x86_64-pc-windows-msvc": "windows-x86_64",
}
COMMON_NAMES = {
    "SHA256SUMS.txt": "SHA256SUMS-{target}.txt",
    "sbom-cargo.json": "sbom-cargo-{target}.json",
    "sbom-npm.json": "sbom-npm-{target}.json",
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _bundle_dirs(source: Path) -> dict[str, Path]:
    bundles: dict[str, Path] = {}
    for checksum in source.rglob("SHA256SUMS.txt"):
        bundle = checksum.parent
        target = next((value for needle, value in TARGETS.items() if needle in bundle.name), None)
        if target is None:
            raise ValueError(f"cannot identify release target from bundle directory: {bundle}")
        if target in bundles:
            raise ValueError(f"duplicate release bundle: {target}")
        bundles[target] = bundle
    if set(bundles) != set(TARGETS.values()):
        raise ValueError("release assets must contain exactly macOS Apple Silicon and Windows x64 bundles")
    return bundles


def _copy_unique(source: Path, destination: Path, name: str) -> None:
    target = destination / name
    if target.exists():
        raise ValueError(f"duplicate public release asset: {name}")
    shutil.copy2(source, target)


def stage_release_assets(source: Path, destination: Path, notes: Path | None = None) -> Path:
    if not source.is_dir():
        raise ValueError(f"downloaded release asset directory does not exist: {source}")
    if destination.exists():
        raise ValueError(f"public release staging directory already exists: {destination}")
    destination.mkdir(parents=True)
    bundles = _bundle_dirs(source)
    for target, bundle in bundles.items():
        for path in sorted(bundle.iterdir()):
            if not path.is_file():
                continue
            name = COMMON_NAMES.get(path.name, path.name)
            if "{target}" in name:
                name = name.format(target=target)
            _copy_unique(path, destination, name)

    manifest = source / "latest.json"
    if not manifest.is_file():
        raise ValueError("missing generated latest.json")
    _copy_unique(manifest, destination, "latest.json")
    if notes is not None:
        if not notes.is_file():
            raise ValueError(f"release notes file does not exist: {notes}")
        _copy_unique(notes, destination, "RELEASE-NOTES.md")

    public_checksum = destination / "SHA256SUMS.txt"
    files = sorted(path for path in destination.iterdir() if path.is_file())
    public_checksum.write_text(
        "".join(f"{_sha256(path)}  {path.name}\n" for path in files),
        encoding="utf-8",
    )
    return destination


def main(argv: list[str]) -> int:
    if len(argv) not in (3, 4):
        print(f"usage: {argv[0]} downloaded-assets release-upload [release-notes]", file=sys.stderr)
        return 2
    try:
        destination = stage_release_assets(
            Path(argv[1]),
            Path(argv[2]),
            Path(argv[3]) if len(argv) == 4 else None,
        )
    except (OSError, ValueError, UnicodeError) as error:
        print(f"release staging failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps({"staged": str(destination), "files": sorted(path.name for path in destination.iterdir())}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
