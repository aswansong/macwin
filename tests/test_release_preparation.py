from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts/prepare-release.py"
SPEC = importlib.util.spec_from_file_location("prepare_release", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ReleasePreparationTests(unittest.TestCase):
    def make_root(self, cargo_version: str = "1.0.0") -> Path:
        directory = Path(tempfile.mkdtemp(prefix="macwin-release-"))
        (directory / "src-tauri").mkdir()
        (directory / "src-tauri/Cargo.toml").write_text(
            f"[package]\nname = \"macwin\"\nversion = \"{cargo_version}\"\n\n[dependencies]\nfoo = \"1\"\n",
            encoding="utf-8",
        )
        (directory / "src-tauri/tauri.conf.json").write_text('{"version":"1.0.0-rc.1"}\n', encoding="utf-8")
        (directory / "package.json").write_text('{"name":"macwin","version":"1.0.0-rc.1"}\n', encoding="utf-8")
        (directory / "package-lock.json").write_text(
            '{"name":"macwin","version":"1.0.0-rc.1","lockfileVersion":3,"packages":{"":{"name":"macwin","version":"1.0.0-rc.1"}}}\n',
            encoding="utf-8",
        )
        return directory

    def test_aligns_all_release_manifests(self) -> None:
        root = self.make_root()
        self.assertEqual(MODULE.prepare_release(root, "v1.0.0"), "1.0.0")
        self.assertEqual(json.loads((root / "src-tauri/tauri.conf.json").read_text())["version"], "1.0.0")
        self.assertEqual(json.loads((root / "package.json").read_text())["version"], "1.0.0")
        lock = json.loads((root / "package-lock.json").read_text())
        self.assertEqual(lock["packages"][""]["version"], "1.0.0")

    def test_rejects_non_tag_or_mismatched_version(self) -> None:
        root = self.make_root()
        with self.assertRaises(ValueError):
            MODULE.prepare_release(root, "1.0.0")
        with self.assertRaises(ValueError):
            MODULE.prepare_release(root, "v1.0.1")
