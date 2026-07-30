from __future__ import annotations

import json
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path

from tools.m1.fixtures import MATRIX, _json, _manifest, _write_zip, build_fixture, package_source
from tools.m1.repo_checks import ROOT, feature_checks, json_checks, markdown_checks, traceability_checks
from tools.m1.validator import HabitpackError, _load_schemas, _schema_validate, strict_json, validate_habitpack


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

    def test_unselected_secret_is_rejected_without_leaking_content(self) -> None:
        probe = b"NEVER-LOG-THIS-FICTIONAL-SECRET"
        with tempfile.TemporaryDirectory() as directory:
            entries, manifest = package_source("wifi_secret")
            entries["secrets/wifi/fixture-one.bin"] = probe
            selections = json.loads(entries["selections.json"])
            selections["selected_candidate_ids"] = []
            entries["selections.json"] = _json(selections)
            manifest = _manifest(entries, True)
            path = Path(directory) / "probe.habitpack"
            _write_zip(path, entries, _json(manifest), None, {})
            try:
                validate_habitpack(path, "secret-unselected-probe")
            except HabitpackError as error:
                self.assertEqual("HP_SECRET_UNSELECTED", error.code)
                self.assertNotIn(probe.decode(), str(error))
            else:
                self.fail("unselected secret was accepted")

    def test_opaque_secret_zip_signatures_are_data_not_zip64(self) -> None:
        descriptor = next(x for x in MATRIX["valid"] if x["name"] == "wifi-secret-with-zip-signatures")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "signatures.habitpack"
            build_fixture(descriptor, path)
            with zipfile.ZipFile(path) as archive:
                info = archive.getinfo("secrets/wifi/fixture-one.bin")
                self.assertEqual(zipfile.ZIP_STORED, info.compress_type)
                payload = archive.read(info)
                self.assertIn(b"PK\x05\x06", payload)
                self.assertIn(b"PK\x06\x06", payload)
                self.assertIn(b"PK\x06\x07", payload)
            validate_habitpack(path, "zip-signature-payload")

    def test_numeric_rule_version_fails_module_schema(self) -> None:
        schemas, _ = _load_schemas()
        candidate = json.loads(package_source("keyboard")[0]["modules/keyboard.json"])
        candidate["candidates"][0]["rule_version"] = 1
        with self.assertRaises(HabitpackError) as caught:
            _schema_validate(candidate, "keyboard.schema.json", schemas)
        self.assertEqual("HP_SCHEMA", caught.exception.code)

    def test_milestone_fields_are_required(self) -> None:
        for field in ("milestone_status", "milestone_evidence"):
            with self.subTest(field), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                target = root / "docs/execution"
                target.mkdir(parents=True)
                data = json.loads((ROOT / "docs/execution/feature-list.json").read_text())
                data.pop(field)
                (target / "feature-list.json").write_text(json.dumps(data))
                with self.assertRaisesRegex(AssertionError, f"{field} is required"):
                    feature_checks(root)

    def test_root_readme_references_are_checked(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "docs/product").mkdir(parents=True)
            shutil.copy2(ROOT / "docs/product/decisions.md", root / "docs/product/decisions.md")
            shutil.copy2(ROOT / "docs/product/evidence.md", root / "docs/product/evidence.md")
            (root / "README.md").write_text("unknown decision [D-999]\n")
            with self.assertRaisesRegex(AssertionError, "D-999"):
                traceability_checks(root)

    def test_uppercase_markdown_references_and_links_are_checked(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "docs/product").mkdir(parents=True)
            shutil.copy2(ROOT / "docs/product/decisions.md", root / "docs/product/decisions.md")
            shutil.copy2(ROOT / "docs/product/evidence.md", root / "docs/product/evidence.md")
            (root / "docs/extra.MD").write_text("unknown [D-999]\n")
            with self.assertRaisesRegex(AssertionError, "D-999"):
                traceability_checks(root)
            (root / "docs/extra.MD").write_text("[jump](target.MD#标题)\n")
            (root / "docs/target.MD").write_text("# 标题\n")
            self.assertEqual(1, markdown_checks(root))

    def test_uppercase_json_is_strictly_checked(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "extra.JSON").write_text('{"duplicate":1,"duplicate":2}')
            with self.assertRaises(HabitpackError) as caught:
                json_checks(root)
            self.assertEqual("HP_JSON_DUPLICATE_KEY", caught.exception.code)


if __name__ == "__main__":
    unittest.main()
