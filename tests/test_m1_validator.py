from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from tools.m1.fixtures import MATRIX, build_fixture
from tools.m1.validator import HabitpackError, strict_json, validate_habitpack


class M1ValidatorTests(unittest.TestCase):
    def test_all_valid_fixtures(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            for descriptor in MATRIX["valid"]:
                with self.subTest(descriptor["name"]):
                    path = Path(directory) / f"{descriptor['name']}.habitpack"
                    build_fixture(descriptor, path)
                    validate_habitpack(path, descriptor["name"])

    def test_each_invalid_fixture_has_expected_first_error(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            for descriptor in MATRIX["invalid"]:
                with self.subTest(descriptor["name"]):
                    path = Path(directory) / f"{descriptor['name']}.habitpack"
                    build_fixture(descriptor, path)
                    with self.assertRaises(HabitpackError) as caught:
                        validate_habitpack(path, descriptor["name"])
                    self.assertEqual(descriptor["expected_error"], caught.exception.code, str(caught.exception))

    def test_duplicate_json_key_is_strictly_rejected(self) -> None:
        with self.assertRaises(HabitpackError) as caught:
            strict_json(b'{"a":1,"a":2}', "fixture.json")
        self.assertEqual("HP_JSON_DUPLICATE_KEY", caught.exception.code)

    def test_secret_error_never_contains_secret_bytes(self) -> None:
        probe = "NEVER-LOG-THIS-FICTIONAL-SECRET"
        with tempfile.TemporaryDirectory() as directory:
            descriptor = {"name": "secret-orphan-probe", "base": "minimal-keyboard", "mutation": "secret_orphan", "expected_error": "HP_SECRET_ORPHAN"}
            path = Path(directory) / "probe.habitpack"
            build_fixture(descriptor, path)
            try:
                validate_habitpack(path, descriptor["name"])
            except HabitpackError as error:
                self.assertNotIn(probe, str(error))


if __name__ == "__main__":
    unittest.main()
