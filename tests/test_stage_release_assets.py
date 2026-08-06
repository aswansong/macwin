from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts/stage-release-assets.py"
SPEC = importlib.util.spec_from_file_location("stage_release_assets", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ReleaseStagingTests(unittest.TestCase):
    def make_bundle(self, root: Path, target: str, updater: str) -> None:
        bundle = root / f"macwin-v1-{target}"
        bundle.mkdir()
        for name in (updater, "sbom-cargo.json", "sbom-npm.json"):
            (bundle / name).write_bytes(name.encode())
        (bundle / "SHA256SUMS.txt").write_text(
            "".join(
                f"{hashlib.sha256((bundle / name).read_bytes()).hexdigest()}  {name}\n"
                for name in sorted((updater, "sbom-cargo.json", "sbom-npm.json"))
            ),
            encoding="utf-8",
        )

    def test_stages_unique_names_and_public_checksum(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="macwin-stage-"))
        self.make_bundle(root, "aarch64-apple-darwin", "MacWin.app.tar.gz")
        self.make_bundle(root, "x86_64-pc-windows-msvc", "MacWin.msi.zip")
        (root / "latest.json").write_text(json.dumps({"version": "1.0.0"}) + "\n", encoding="utf-8")
        notes = root / "notes.md"
        notes.write_text("# MacWin\n", encoding="utf-8")
        destination = root / "release-upload"
        MODULE.stage_release_assets(root, destination, notes)
        names = {path.name for path in destination.iterdir()}
        self.assertIn("SHA256SUMS-darwin-aarch64.txt", names)
        self.assertIn("SHA256SUMS-windows-x86_64.txt", names)
        self.assertIn("sbom-cargo-darwin-aarch64.json", names)
        self.assertIn("sbom-cargo-windows-x86_64.json", names)
        self.assertIn("RELEASE-NOTES.md", names)
        public = destination / "SHA256SUMS.txt"
        for line in public.read_text(encoding="utf-8").splitlines():
            digest, name = line.split("  ", 1)
            self.assertEqual(digest, hashlib.sha256((destination / name).read_bytes()).hexdigest())

    def test_rejects_duplicate_staging_directory(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="macwin-stage-duplicate-"))
        destination = root / "release-upload"
        destination.mkdir()
        with self.assertRaises(ValueError):
            MODULE.stage_release_assets(root, destination)
