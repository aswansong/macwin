#!/usr/bin/env python3
"""Build the deterministic Tauri updater manifest from downloaded artifacts."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Iterable


TARGET_MAC = "darwin-aarch64"
TARGET_WINDOWS = "windows-x86_64"
TAG_RE = re.compile(r"^v[0-9]+\.[0-9]+\.[0-9]+$")


def _signed_candidates(root: Path) -> dict[str, list[tuple[Path, Path]]]:
    candidates: dict[str, list[tuple[Path, Path]]] = {TARGET_MAC: [], TARGET_WINDOWS: []}
    for signature in root.rglob("*.sig"):
        artifact = signature.with_suffix("")
        if not artifact.is_file():
            continue
        parent = signature.parent.name
        if "aarch64-apple-darwin" in parent and artifact.name.endswith(".app.tar.gz"):
            candidates[TARGET_MAC].append((artifact, signature))
        elif "x86_64-pc-windows-msvc" in parent and artifact.name.endswith((".msi.zip", ".nsis.zip")):
            candidates[TARGET_WINDOWS].append((artifact, signature))
    return candidates


def _one(items: Iterable[tuple[Path, Path]], label: str) -> tuple[Path, Path]:
    values = list(items)
    if len(values) != 1:
        raise ValueError(f"exactly one signed {label} updater artifact is required (found {len(values)})")
    return values[0]


def select_updater_artifacts(root: Path) -> dict[str, tuple[Path, Path]]:
    candidates = _signed_candidates(root)
    selected = {TARGET_MAC: _one(candidates[TARGET_MAC], "macOS")}
    windows = candidates[TARGET_WINDOWS]
    # Tauri can emit both MSI and NSIS updater archives when bundle targets
    # are "all". Prefer MSI deterministically; fall back to NSIS.
    for suffix in (".msi.zip", ".nsis.zip"):
        matches = [item for item in windows if item[0].name.endswith(suffix)]
        if len(matches) > 1:
            raise ValueError(f"ambiguous signed Windows {suffix} updater artifacts (found {len(matches)})")
        if len(matches) == 1:
            selected[TARGET_WINDOWS] = matches[0]
            break
    if TARGET_WINDOWS not in selected:
        raise ValueError(f"exactly one signed MSI or NSIS updater artifact is required (found {len(windows)})")
    return selected


def build_manifest(root: Path, tag: str) -> Path:
    if TAG_RE.fullmatch(tag) is None:
        raise ValueError(f"release tag must be vMAJOR.MINOR.PATCH: {tag}")
    selected = select_updater_artifacts(root)
    platforms = {}
    for target, (artifact, signature) in selected.items():
        value = signature.read_text(encoding="utf-8").strip()
        if not value:
            raise ValueError(f"signed {target} updater artifact has an empty signature")
        platforms[target] = {
            "signature": value,
            "url": f"https://github.com/aswansong/macwin/releases/download/{tag}/{artifact.name}",
        }
    manifest = {"version": tag.removeprefix("v"), "notes": "MacWin v1 release", "platforms": platforms}
    destination = root / "latest.json"
    destination.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return destination


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(f"usage: {argv[0]} vMAJOR.MINOR.PATCH release-assets", file=sys.stderr)
        return 2
    try:
        destination = build_manifest(Path(argv[2]), argv[1])
    except (OSError, ValueError, UnicodeError) as error:
        print(f"release manifest failed: {error}", file=sys.stderr)
        return 1
    print(f"wrote {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
