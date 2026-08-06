from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts/build-release-manifest.py"
SPEC = importlib.util.spec_from_file_location("build_release_manifest", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ReleaseManifestTests(unittest.TestCase):
    def make_root(self) -> Path:
        return Path(tempfile.mkdtemp(prefix="macwin-manifest-"))

    def add(self, root: Path, target: str, name: str, signature: str = "sig") -> None:
        directory = root / f"macwin-v1-{target}"
        directory.mkdir(exist_ok=True)
        (directory / name).write_bytes(b"fictional updater")
        (directory / f"{name}.sig").write_text(signature + "\n", encoding="utf-8")

    def add_required(self, root: Path, windows_suffix: str = ".msi.zip") -> None:
        self.add(root, "aarch64-apple-darwin", "MacWin_1.0.0_aarch64.app.tar.gz", "mac-sig")
        self.add(root, "x86_64-pc-windows-msvc", f"MacWin_1.0.0_x64{windows_suffix}", "win-sig")

    def test_prefers_msi_and_writes_manifest(self) -> None:
        root = self.make_root()
        self.add_required(root)
        self.add(root, "x86_64-pc-windows-msvc", "MacWin_1.0.0_x64.nsis.zip", "nsis-sig")
        path = MODULE.build_manifest(root, "v1.0.0")
        manifest = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(manifest["version"], "1.0.0")
        self.assertIn("MacWin_1.0.0_x64.msi.zip", manifest["platforms"]["windows-x86_64"]["url"])

    def test_falls_back_to_nsis(self) -> None:
        root = self.make_root()
        self.add_required(root, ".nsis.zip")
        selected = MODULE.select_updater_artifacts(root)
        self.assertTrue(selected["windows-x86_64"][0].name.endswith(".nsis.zip"))

    def test_rejects_missing_or_ambiguous_artifacts(self) -> None:
        root = self.make_root()
        with self.assertRaises(ValueError):
            MODULE.build_manifest(root, "v1.0.0")
        self.add_required(root)
        self.add(root, "aarch64-apple-darwin", "MacWin_1.0.0_second.app.tar.gz", "second")
        with self.assertRaises(ValueError):
            MODULE.build_manifest(root, "v1.0.0")

        windows_root = self.make_root()
        self.add_required(windows_root)
        self.add(windows_root, "x86_64-pc-windows-msvc", "MacWin_1.0.0_second_x64.msi.zip", "second")
        with self.assertRaises(ValueError):
            MODULE.build_manifest(windows_root, "v1.0.0")

    def test_rejects_empty_signature_and_invalid_tag(self) -> None:
        root = self.make_root()
        self.add_required(root)
        (root / "macwin-v1-aarch64-apple-darwin/MacWin_1.0.0_aarch64.app.tar.gz.sig").write_text("\n", encoding="utf-8")
        with self.assertRaises(ValueError):
            MODULE.build_manifest(root, "v1.0.0")
        with self.assertRaises(ValueError):
            MODULE.build_manifest(root, "v1.0")
