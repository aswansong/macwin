from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts/validate-release-assets.py"
SPEC = importlib.util.spec_from_file_location("validate_release_assets", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ReleaseAssetTests(unittest.TestCase):
    def make_root(self) -> Path:
        return Path(tempfile.mkdtemp(prefix="macwin-release-assets-"))

    def make_bundle(self, root: Path, target: str, platform: str) -> str:
        bundle = root / f"macwin-v1-{target}"
        bundle.mkdir()
        if platform == "darwin-aarch64":
            names = [
                "MacWin_1.0.0_aarch64.app.tar.gz",
                "MacWin_1.0.0_aarch64.app.tar.gz.sig",
                "MacWin_v1.0.0_aarch64.dmg",
            ]
        else:
            names = [
                "MacWin_1.0.0_x64-setup.exe",
                "MacWin_1.0.0_x64.msi.zip",
                "MacWin_1.0.0_x64.msi.zip.sig",
            ]
        payloads = {name: b"fictional release asset" for name in names}
        payloads["sbom-cargo.json"] = b'{"packages": []}\n'
        payloads["sbom-npm.json"] = b'{"dependencies": {}}\n'
        for name, content in payloads.items():
            (bundle / name).write_bytes(content)
        lines = []
        for name in sorted(payloads):
            lines.append(f"{hashlib.sha256(payloads[name]).hexdigest()}  {name}")
        (bundle / "SHA256SUMS.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
        return names[0] if platform == "darwin-aarch64" else names[1]

    def write_manifest(self, root: Path, mac_updater: str, windows_updater: str) -> None:
        (root / "latest.json").write_text(
            json.dumps(
                {
                    "version": "1.0.0",
                    "notes": "MacWin v1 release",
                    "platforms": {
                        "darwin-aarch64": {
                            "signature": "mac-sig",
                            "url": f"https://github.com/aswansong/macwin/releases/download/v1.0.0/{mac_updater}",
                        },
                        "windows-x86_64": {
                            "signature": "win-sig",
                            "url": f"https://github.com/aswansong/macwin/releases/download/v1.0.0/{windows_updater}",
                        },
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )

    def test_validates_both_platform_bundles_and_manifest(self) -> None:
        root = self.make_root()
        mac = self.make_bundle(root, "aarch64-apple-darwin", "darwin-aarch64")
        windows = self.make_bundle(root, "x86_64-pc-windows-msvc", "windows-x86_64")
        self.write_manifest(root, mac, windows)
        evidence = MODULE.validate_release_assets(root, "v1.0.0")
        self.assertEqual(set(evidence), {"darwin-aarch64", "windows-x86_64"})

    def test_allows_nsis_fallback_alongside_preferred_msi(self) -> None:
        root = self.make_root()
        mac = self.make_bundle(root, "aarch64-apple-darwin", "darwin-aarch64")
        windows = root / "macwin-v1-x86_64-pc-windows-msvc"
        self.make_bundle(root, "x86_64-pc-windows-msvc", "windows-x86_64")
        nsis = windows / "MacWin_1.0.0_x64.nsis.zip"
        nsis_sig = windows / "MacWin_1.0.0_x64.nsis.zip.sig"
        nsis.write_bytes(b"fictional NSIS updater")
        nsis_sig.write_text("nsis-sig\n", encoding="utf-8")
        entries = []
        for path in sorted(windows.iterdir()):
            if path.name == "SHA256SUMS.txt":
                continue
            entries.append(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}")
        (windows / "SHA256SUMS.txt").write_text("\n".join(entries) + "\n", encoding="utf-8")
        self.write_manifest(root, mac, "MacWin_1.0.0_x64.msi.zip")
        evidence = MODULE.validate_release_assets(root, "v1.0.0")
        self.assertEqual(evidence["windows-x86_64"]["updater"], "MacWin_1.0.0_x64.msi.zip")

    def test_rejects_checksum_tampering(self) -> None:
        root = self.make_root()
        mac = self.make_bundle(root, "aarch64-apple-darwin", "darwin-aarch64")
        windows = self.make_bundle(root, "x86_64-pc-windows-msvc", "windows-x86_64")
        self.write_manifest(root, mac, windows)
        (root / "macwin-v1-aarch64-apple-darwin/MacWin_v1.0.0_aarch64.dmg").write_bytes(b"tampered")
        with self.assertRaises(ValueError):
            MODULE.validate_release_assets(root, "v1.0.0")

    def test_rejects_missing_installer_or_manifest_target(self) -> None:
        root = self.make_root()
        mac = self.make_bundle(root, "aarch64-apple-darwin", "darwin-aarch64")
        windows = self.make_bundle(root, "x86_64-pc-windows-msvc", "windows-x86_64")
        (root / "macwin-v1-x86_64-pc-windows-msvc/MacWin_1.0.0_x64-setup.exe").unlink()
        self.write_manifest(root, mac, windows)
        with self.assertRaises(ValueError):
            MODULE.validate_release_assets(root, "v1.0.0")
