from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts/validate-public-release-assets.py"
SPEC = importlib.util.spec_from_file_location("validate_public_release_assets", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


COMMIT = "0123456789abcdef0123456789abcdef01234567"


def make_release(root: Path, commit: str = COMMIT) -> None:
    (root / "MacWin_1.0.1_x64-setup.exe").write_bytes(b"windows installer")
    (root / "MacWin_1.0.1_aarch64.dmg").write_bytes(b"mac installer")
    (root / "README-FIRST.md").write_text("未签名公开版\n", encoding="utf-8")
    (root / "BUILD_COMMIT-windows.txt").write_text(commit, encoding="utf-8")
    (root / "BUILD_COMMIT-macos.txt").write_text(commit, encoding="utf-8")
    (root / "BUILD-INFO.json").write_text(
        json.dumps(
            {
                "tag": "v1.0.1",
                "commit": commit,
                "version": "1.0.1",
                "schema_version": "1.0.0",
                "unsigned": True,
                "platforms": [
                    {"platform": "windows-x64", "build_commit": commit},
                    {"platform": "macos-arm64", "build_commit": commit},
                ],
            }
        ),
        encoding="utf-8",
    )
    payloads = sorted(path for path in root.iterdir() if path.name != "SHA256SUMS.txt")
    lines = [f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}" for path in payloads]
    (root / "SHA256SUMS.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


class PublicReleaseAssetTests(unittest.TestCase):
    def test_valid_public_asset_set(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            make_release(root)
            MODULE.validate_public_assets(root, "v1.0.1", COMMIT)

    def test_commit_mismatch_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            make_release(root)
            (root / "BUILD_COMMIT-macos.txt").write_text("f" * 40, encoding="utf-8")
            with self.assertRaisesRegex(MODULE.ValidationError, "BUILD_COMMIT-macos"):
                MODULE.validate_public_assets(root, "v1.0.1", COMMIT)

    def test_asset_count_mismatch_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            make_release(root)
            (root / "unexpected-extra.bin").write_bytes(b"extra")
            with self.assertRaisesRegex(MODULE.ValidationError, "asset set mismatch"):
                MODULE.validate_public_assets(root, "v1.0.1", COMMIT)

    def test_hash_mismatch_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            make_release(root)
            (root / "README-FIRST.md").write_text("tampered\n", encoding="utf-8")
            with self.assertRaisesRegex(MODULE.ValidationError, "checksum mismatch"):
                MODULE.validate_public_assets(root, "v1.0.1", COMMIT)

    def test_rc_tag_or_version_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            make_release(root)
            with self.assertRaisesRegex(MODULE.ValidationError, "tag must be"):
                MODULE.validate_public_assets(root, "v1.0.1-rc.2", COMMIT)


if __name__ == "__main__":
    unittest.main()
