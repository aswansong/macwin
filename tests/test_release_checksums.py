from __future__ import annotations

import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts/build-release-checksums.py"
SPEC = importlib.util.spec_from_file_location("build_release_checksums", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ReleaseChecksumTests(unittest.TestCase):
    def test_includes_all_files_and_is_deterministic(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="macwin-checksums-"))
        (root / "z.bin").write_bytes(b"z")
        (root / "a.json").write_bytes(b"a")
        path = MODULE.build_checksums(root)
        self.assertEqual(
            path.read_text(encoding="utf-8"),
            f"{hashlib.sha256(b'a').hexdigest()}  a.json\n{hashlib.sha256(b'z').hexdigest()}  z.bin\n",
        )
        before = path.read_text(encoding="utf-8")
        MODULE.build_checksums(root)
        self.assertEqual(path.read_text(encoding="utf-8"), before)

    def test_rejects_empty_directory(self) -> None:
        with self.assertRaises(ValueError):
            MODULE.build_checksums(Path(tempfile.mkdtemp(prefix="macwin-checksums-empty-")))
