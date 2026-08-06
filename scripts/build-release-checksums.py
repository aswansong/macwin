#!/usr/bin/env python3
"""Create a deterministic SHA-256 list for one platform's release assets."""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_checksums(root: Path, filename: str = "SHA256SUMS.txt") -> Path:
    if not root.is_dir():
        raise ValueError(f"release asset directory does not exist: {root}")
    output = root / filename
    files = sorted(path for path in root.iterdir() if path.is_file() and path.name != filename)
    if not files:
        raise ValueError(f"release asset directory is empty: {root}")
    if any(path.name != path.name.strip() or "\n" in path.name for path in files):
        raise ValueError("release asset filename contains whitespace or a newline")
    output.write_text(
        "".join(f"{sha256(path)}  {path.name}\n" for path in files),
        encoding="utf-8",
    )
    return output


def main(argv: list[str]) -> int:
    if len(argv) not in (2, 3):
        print(f"usage: {argv[0]} release-assets [checksum-filename]", file=sys.stderr)
        return 2
    try:
        output = build_checksums(Path(argv[1]), argv[2] if len(argv) == 3 else "SHA256SUMS.txt")
    except (OSError, ValueError) as error:
        print(f"release checksum failed: {error}", file=sys.stderr)
        return 1
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
