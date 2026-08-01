from __future__ import annotations

import json
import math
import shutil
import stat
import struct
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from tools.m1.fixtures import MATRIX, _json, _manifest, _write_zip, build_fixture, package_source
from tools.m1.repo_checks import WAVE0_AUTHORIZATION, ROOT, feature_checks, json_checks, markdown_checks, traceability_checks
from tools.m1.validator import MAX_JSON, MAX_JSON_INTEGER_DIGITS, MAX_JSON_NESTING, MAX_MANIFEST, MAX_SECRET, HabitpackError, _load_schemas, _schema_validate, _validate_deflate_stream, strict_json, validate_habitpack


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

    def test_nonfinite_bom_and_non_utf8_json_are_rejected(self) -> None:
        for token in (b"NaN", b"Infinity", b"-Infinity"):
            with self.subTest(token), self.assertRaises(HabitpackError) as caught:
                strict_json(b'{"nested":{"value":' + token + b"}}", "fixture.json")
            self.assertEqual("HP_JSON_NONFINITE", caught.exception.code)
        for payload in (b"\xef\xbb\xbf{}", b'{"value":"\xff"}'):
            with self.subTest(payload), self.assertRaises(HabitpackError) as caught:
                strict_json(payload, "fixture.json")
            self.assertEqual("HP_JSON_INVALID", caught.exception.code)

    def test_float_tokens_are_finite_and_preserve_float_negative_zero(self) -> None:
        value = strict_json(
            b'{"positive":1e2,"negative":-1.25e-2,"large":1.7976931348623157e308,"negative_zero":-0.0}',
            "fixture.json",
        )
        self.assertEqual(100.0, value["positive"])
        self.assertEqual(-0.0125, value["negative"])
        self.assertTrue(math.isfinite(value["large"]))
        self.assertEqual(-1.0, math.copysign(1.0, value["negative_zero"]))
        self.assertEqual(0, strict_json(b'{"negative_zero":-0}', "fixture.json")["negative_zero"])
        for token in (b"1e999999", b"-1e999999"):
            with self.subTest(token=token), self.assertRaises(HabitpackError) as caught:
                strict_json(b'{"nested":{"value":' + token + b"}}", "fixture.json")
            self.assertEqual("HP_JSON_NONFINITE", caught.exception.code)

    def test_json_strings_and_keys_reject_all_surrogate_code_units_iteratively(self) -> None:
        rejected = (
            br'{"nested":{"value":"\ud800"}}',
            br'{"nested":{"value":"\udc00"}}',
            br'{"nested":{"value":"\ud83d\ude00"}}',
            br'{"nested":{"\ud800":0}}',
        )
        for payload in rejected:
            with self.subTest(payload=payload), self.assertRaises(HabitpackError) as caught:
                strict_json(payload, "fixture.json")
            self.assertEqual("HP_JSON_INVALID", caught.exception.code)

        valid = strict_json('{"nested":[{"中文":"emoji 😀"}]}'.encode(), "fixture.json")
        self.assertEqual("emoji 😀", valid["nested"][0]["中文"])

        deeply_nested = "[" * MAX_JSON_NESTING + r'"\ud800"' + "]" * MAX_JSON_NESTING
        with self.assertRaises(HabitpackError) as caught:
            strict_json(deeply_nested.encode(), "fixture.json")
        self.assertEqual("HP_JSON_INVALID", caught.exception.code)

    def test_json_nesting_scanner_ignores_string_brackets_and_enforces_boundary(self) -> None:
        payload = ("[" * MAX_JSON_NESTING + r'"brackets ] } [ and escaped quote \" plus slash \\"' + "]" * MAX_JSON_NESTING).encode()
        self.assertIsInstance(strict_json(payload, "fixture.json"), list)
        with self.assertRaises(HabitpackError) as caught:
            strict_json(("[" * (MAX_JSON_NESTING + 1) + "0" + "]" * (MAX_JSON_NESTING + 1)).encode(), "fixture.json")
        self.assertEqual("HP_JSON_LIMIT", caught.exception.code)

    def test_json_integer_limit_handles_negative_tokens_and_legacy_large_tokens(self) -> None:
        for sign in ("", "-"):
            with self.subTest(sign=sign):
                value = strict_json(f'{{"value":{sign}{"7" * MAX_JSON_INTEGER_DIGITS}}}'.encode(), "fixture.json")
                self.assertEqual(len(str(abs(value["value"]))), MAX_JSON_INTEGER_DIGITS)
        for digits in (MAX_JSON_INTEGER_DIGITS + 1, 4300, 4301):
            with self.subTest(digits=digits), self.assertRaises(HabitpackError) as caught:
                strict_json(f'{{"value":{"7" * digits}}}'.encode(), "fixture.json")
            self.assertEqual("HP_JSON_LIMIT", caught.exception.code)

    def test_legacy_large_integer_is_stable_at_complete_entry(self) -> None:
        entries, manifest = package_source("keyboard")
        with tempfile.TemporaryDirectory() as directory:
            for digits in (4300, 4301):
                with self.subTest(digits=digits):
                    entries["selections.json"] = (b'{"schema_version":"1.0.0","guide_requested":false,"selected_candidate_ids":[],"large":' + b"7" * digits + b"}")
                    manifest = _manifest(entries)
                    path = Path(directory) / f"integer-{digits}.habitpack"
                    _write_zip(path, entries, _json(manifest), None, {})
                    with self.assertRaises(HabitpackError) as caught:
                        validate_habitpack(path, f"integer-{digits}")
                    self.assertEqual("HP_JSON_LIMIT", caught.exception.code)

    def test_invalid_utf8_zip_name_is_stable_at_raw_and_zipfile_boundaries(self) -> None:
        descriptor = next(x for x in MATRIX["invalid"] if x["name"] == "zip-invalid-utf8-name")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invalid-utf8.habitpack"
            build_fixture(descriptor, path)
            self.assertIn(b"modules/\xffeyboard.json", path.read_bytes())
            with self.assertRaises(HabitpackError) as caught:
                validate_habitpack(path, descriptor["name"])
            self.assertEqual("HP_ZIP_INVALID", caught.exception.code)
            valid_path = Path(directory) / "valid.habitpack"
            build_fixture(next(x for x in MATRIX["valid"] if x["name"] == "minimal-keyboard"), valid_path)
            with patch("tools.m1.validator.zipfile.ZipFile", side_effect=UnicodeDecodeError("utf-8", b"\xff", 0, 1, "invalid filename")):
                with self.assertRaises(HabitpackError) as caught:
                    validate_habitpack(valid_path, "mocked-invalid-utf8")
            self.assertEqual("HP_ZIP_INVALID", caught.exception.code)

    def test_outer_boundary_maps_common_parser_resource_errors(self) -> None:
        cases = ((RecursionError(), "HP_JSON_LIMIT"), (OverflowError(), "HP_JSON_LIMIT"), (ValueError(), "HP_SCHEMA"), (MemoryError(), "HP_RESOURCE_LIMIT"))
        for exception, code in cases:
            with self.subTest(code=code), patch("tools.m1.validator._validate_habitpack", side_effect=exception):
                with self.assertRaises(HabitpackError) as caught:
                    validate_habitpack(Path("mocked.habitpack"), "mocked")
            self.assertEqual(code, caught.exception.code)

    def test_canonical_utc_datetime_checker_accepts_only_exact_profile(self) -> None:
        schemas, _ = _load_schemas()
        _, manifest = package_source("keyboard")
        _schema_validate(manifest, "manifest.schema.json", schemas)
        for value in (
            "2026-07-31t00:00:00z",
            "2026-07-31T08:00:00+08:00",
            "2026-12-31T23:59:60Z",
            "2026-07-31T00:00:00.001Z",
            "2026-07-31",
            "2026-02-30T00:00:00Z",
        ):
            with self.subTest(value):
                invalid = dict(manifest)
                invalid["created_at"] = value
                with self.assertRaises(HabitpackError) as caught:
                    _schema_validate(invalid, "manifest.schema.json", schemas)
                self.assertEqual("HP_SCHEMA", caught.exception.code)

    def test_declared_resource_limits_reject_before_deflate_starts(self) -> None:
        expected = {
            "manifest-over-limit": "HP_MANIFEST_TOO_LARGE",
            "entry-json-over-limit": "HP_JSON_TOO_LARGE",
            "secret-over-limit": "HP_SECRET_TOO_LARGE",
            "total-over-limit": "HP_TOTAL_TOO_LARGE",
            "compression-ratio": "HP_COMPRESSION_RATIO",
        }
        with tempfile.TemporaryDirectory() as directory:
            for name, code in expected.items():
                with self.subTest(name):
                    descriptor = next(x for x in MATRIX["invalid"] if x["name"] == name)
                    path = Path(directory) / f"{name}.habitpack"
                    build_fixture(descriptor, path)
                    with patch("tools.m1.validator.zlib.decompressobj") as decompressor:
                        with self.assertRaises(HabitpackError) as caught:
                            validate_habitpack(path, name)
                    self.assertEqual(code, caught.exception.code)
                    decompressor.assert_not_called()

    def test_near_zip64_declared_size_is_bounded_before_stream_work(self) -> None:
        entries, manifest = package_source("keyboard")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "near-zip64-size.habitpack"
            _write_zip(path, entries, _json(manifest), None, {})
            data = bytearray(path.read_bytes())
            eocd = data.rfind(b"PK\x05\x06")
            central = struct.unpack_from("<L", data, eocd + 16)[0]
            self.assertLess(struct.unpack_from("<L", data, 18)[0], 1024)
            struct.pack_into("<L", data, 22, 0xFFFFFFFE)
            struct.pack_into("<L", data, central + 24, 0xFFFFFFFE)
            path.write_bytes(data)
            with patch("tools.m1.validator.zlib.decompressobj") as decompressor:
                with self.assertRaises(HabitpackError) as caught:
                    validate_habitpack(path, "near-zip64-size")
            self.assertEqual("HP_MANIFEST_TOO_LARGE", caught.exception.code)
            decompressor.assert_not_called()

    def test_deflate_helper_enforces_its_own_hard_limit(self) -> None:
        with patch("tools.m1.validator.zlib.decompressobj") as decompressor:
            with self.assertRaises(HabitpackError) as caught:
                _validate_deflate_stream(b"tiny", MAX_JSON + 1, MAX_JSON, "HP_JSON_TOO_LARGE")
        self.assertEqual("HP_JSON_TOO_LARGE", caught.exception.code)
        decompressor.assert_not_called()

    def test_exact_entry_size_boundaries_are_valid(self) -> None:
        entries, _ = package_source("wifi_secret")
        module = entries["modules/wifi.json"]
        entries["modules/wifi.json"] = module + b" " * (MAX_JSON - len(module))
        entries["secrets/wifi/fixture-one.bin"] = b"S" * MAX_SECRET
        manifest = _manifest(entries, True)
        manifest_bytes = _json(manifest)
        manifest_bytes += b" " * (MAX_MANIFEST - len(manifest_bytes))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "exact-entry-boundaries.habitpack"
            _write_zip(path, entries, manifest_bytes, None, {"force_stored": True})
            validate_habitpack(path, "exact-entry-boundaries")

    def test_stream_and_zip64_size_errors_are_stable(self) -> None:
        expected = {
            "zip-deflate-post-stream-marker": "HP_ZIP_STREAM",
            "zip-deflate-second-stream": "HP_ZIP_STREAM",
            "zip-deflate-zero-padding": "HP_ZIP_STREAM",
            "zip-stored-size-mismatch": "HP_ZIP_STREAM",
            "zip-local-compressed-size-sentinel": "HP_ZIP64_ENTRY",
            "zip-local-file-size-sentinel": "HP_ZIP64_ENTRY",
            "zip-central-compressed-size-sentinel": "HP_ZIP64_ENTRY",
            "zip-central-file-size-sentinel": "HP_ZIP64_ENTRY",
        }
        with tempfile.TemporaryDirectory() as directory:
            for name, code in expected.items():
                with self.subTest(name):
                    descriptor = next(x for x in MATRIX["invalid"] if x["name"] == name)
                    path = Path(directory) / f"{name}.habitpack"
                    build_fixture(descriptor, path)
                    with self.assertRaises(HabitpackError) as caught:
                        validate_habitpack(path, name)
                    self.assertEqual(code, caught.exception.code)

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

    def test_stored_and_deflate_are_the_only_valid_fixture_methods(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            expected = {
                "minimal-keyboard": zipfile.ZIP_DEFLATED,
                "wifi-secret-with-zip-signatures": zipfile.ZIP_STORED,
            }
            for name, method in expected.items():
                with self.subTest(name):
                    descriptor = next(x for x in MATRIX["valid"] if x["name"] == name)
                    path = root / f"{name}.habitpack"
                    build_fixture(descriptor, path)
                    with zipfile.ZipFile(path) as archive:
                        self.assertTrue(archive.infolist())
                        self.assertEqual({method}, {item.compress_type for item in archive.infolist()})
                    validate_habitpack(path, name)

    def test_canonical_headers_and_utf8_byte_order(self) -> None:
        descriptor = next(x for x in MATRIX["valid"] if x["name"] == "all-modules-no-secret")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "canonical.habitpack"
            build_fixture(descriptor, path)
            raw = path.read_bytes()
            with zipfile.ZipFile(path) as archive:
                infos = archive.infolist()
                names = [item.filename for item in infos]
                self.assertEqual(["manifest.json", *sorted(names[1:], key=lambda name: name.encode("utf-8"))], names)
                for info in infos:
                    self.assertEqual(3, info.create_system)
                    self.assertEqual(20, info.create_version)
                    self.assertEqual(20, info.extract_version)
                    self.assertEqual((1980, 1, 1, 0, 0, 0), info.date_time)
                    self.assertEqual(0, info.internal_attr)
                    self.assertEqual((stat.S_IFREG | 0o600) << 16, info.external_attr)
                    self.assertEqual(0, info.flag_bits)
                    self.assertEqual(b"", info.extra)
                    local_version, local_flags, local_method, local_time, local_date = struct.unpack_from("<5H", raw, info.header_offset + 4)
                    self.assertEqual((20, 0, zipfile.ZIP_DEFLATED, 0, 0x21), (local_version, local_flags, local_method, local_time, local_date))
            validate_habitpack(path, "canonical-headers")

    def test_different_deflate_levels_remain_valid(self) -> None:
        entries, manifest = package_source("keyboard")
        with tempfile.TemporaryDirectory() as directory:
            for level in (1, 6, 9):
                with self.subTest(level):
                    path = Path(directory) / f"level-{level}.habitpack"
                    _write_zip(path, entries, _json(manifest), None, {"compresslevel": level})
                    validate_habitpack(path, f"deflate-level-{level}")

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

    def test_feature_registry_requires_complete_p0_closed_set(self) -> None:
        cases = {
            "empty": (lambda data: data.__setitem__("features", []), "exactly 15"),
            "object": (lambda data: data.__setitem__("features", {}), "must be a list"),
            "null": (lambda data: data.__setitem__("features", None), "must be a list"),
            "string": (lambda data: data.__setitem__("features", "P0-001"), "must be a list"),
            "fourteen": (lambda data: data.__setitem__("features", data["features"][:14]), "exactly 15"),
            "sixteen": (lambda data: data["features"].append(dict(data["features"][0])), "exactly 15"),
            "duplicate": (lambda data: data["features"][1].__setitem__("id", "P0-001"), "duplicate feature IDs"),
            "missing_id": (lambda data: data["features"][0].pop("id"), "id must be a string"),
            "unknown_id": (lambda data: data["features"][0].__setitem__("id", "P0-999"), "exactly P0-001 through P0-015"),
            "nonobject": (lambda data: data["features"].__setitem__(0, None), "must be an object"),
        }
        for name, (mutate, message) in cases.items():
            with self.subTest(name):
                self._assert_feature_policy_rejected(mutate, message)

    def test_feature_registry_accepts_complete_p0_set_in_any_order(self) -> None:
        def reverse_features(data):
            data["features"].reverse()

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "docs/execution"
            target.mkdir(parents=True)
            shutil.copytree(ROOT / "docs/product", root / "docs/product")
            data = json.loads((ROOT / "docs/execution/feature-list.json").read_text())
            reverse_features(data)
            (target / "feature-list.json").write_text(json.dumps(data))
            self.assertEqual(15, feature_checks(root))

    def test_feature_records_have_a_closed_typed_key_set(self) -> None:
        cases = {
            "unknown": lambda data: data["features"][0].__setitem__("production_implementation_authorized", True),
            "missing": lambda data: data["features"][0].pop("owner"),
        }
        for name, mutate in cases.items():
            with self.subTest(name=name):
                self._assert_feature_policy_rejected(mutate, "feature")

    def test_acceptance_criteria_have_a_closed_typed_key_set(self) -> None:
        cases = {
            "unknown": lambda data: data["features"][0]["acceptance_criteria"][0].__setitem__("severity", "P0"),
            "missing": lambda data: data["features"][0]["acceptance_criteria"][0].pop("verification"),
        }
        for name, mutate in cases.items():
            with self.subTest(name=name):
                self._assert_feature_policy_rejected(mutate, "acceptance criterion")

    def test_reference_arrays_reject_bad_types_unknown_refs_and_duplicates(self) -> None:
        cases = {
            "decision_object": ("decision_refs", [{"id": "D-002"}], "must be a string"),
            "evidence_null": ("evidence_refs", None, "must be a list"),
            "human_object": ("human_decisions_required", [{"id": "OD-003"}], "must be a string"),
            "decision_unknown": ("decision_refs", ["D-999"], "unknown decision ref"),
            "evidence_unknown": ("evidence_refs", ["E-999"], "unknown evidence ref"),
            "human_unknown": ("human_decisions_required", ["OD-999"], "unknown human decision ref"),
            "decision_duplicate": ("decision_refs", ["D-002", "D-002"], "must not contain duplicates"),
            "evidence_duplicate": ("evidence_refs", ["E-015", "E-015"], "must not contain duplicates"),
            "human_duplicate": ("human_decisions_required", ["OD-003", "OD-003"], "must not contain duplicates"),
        }
        for name, (field, value, message) in cases.items():
            with self.subTest(name=name):
                self._assert_feature_policy_rejected(
                    lambda data, field=field, value=value: data["features"][0].__setitem__(field, value),
                    message,
                )

    def test_dependencies_reject_unknown_self_dependency_and_cycles(self) -> None:
        cases = {
            "unknown": lambda data: data["features"][0].__setitem__("dependencies", ["P0-999"]),
            "self": lambda data: data["features"][0].__setitem__("dependencies", ["P0-001"]),
            "cycle": lambda data: data["features"][0].__setitem__("dependencies", ["P0-002"]),
        }
        for name, mutate in cases.items():
            with self.subTest(name=name):
                message = "dependency cycle" if name == "cycle" else ("unknown dependency" if name == "unknown" else "cannot depend on itself")
                self._assert_feature_policy_rejected(mutate, message)

    def test_acceptance_criteria_reject_duplicate_wrong_prefix_and_empty_text(self) -> None:
        cases = {
            "duplicate": lambda data: data["features"][0]["acceptance_criteria"][1].__setitem__("id", "P0-001-AC01"),
            "wrong_prefix": lambda data: data["features"][0]["acceptance_criteria"][0].__setitem__("id", "P0-002-AC01"),
            "empty_statement": lambda data: data["features"][0]["acceptance_criteria"][0].__setitem__("statement", "  "),
            "empty_verification": lambda data: data["features"][0]["acceptance_criteria"][0].__setitem__("verification", ""),
        }
        for name, mutate in cases.items():
            with self.subTest(name=name):
                message = "duplicate acceptance ID" if name == "duplicate" else ("wrong feature prefix" if name == "wrong_prefix" else "non-empty string")
                self._assert_feature_policy_rejected(mutate, message)

    def test_non_goals_and_risks_reject_bad_types_empty_items_and_duplicates(self) -> None:
        cases = {
            "non_goals_type": lambda data: data["features"][0].__setitem__("non_goals", None),
            "risks_type": lambda data: data["features"][0].__setitem__("risks", {"risk": "value"}),
            "non_goals_empty": lambda data: data["features"][0].__setitem__("non_goals", [""]),
            "risks_empty": lambda data: data["features"][0].__setitem__("risks", [" "]),
            "non_goals_duplicate": lambda data: data["features"][0].__setitem__("non_goals", ["same", "same"]),
            "risks_duplicate": lambda data: data["features"][0].__setitem__("risks", ["same", "same"]),
        }
        for name, mutate in cases.items():
            with self.subTest(name=name):
                message = "must be a list" if name.endswith("type") else ("must not contain duplicates" if name.endswith("duplicate") else "non-empty string")
                self._assert_feature_policy_rejected(mutate, message)

    def test_status_definitions_are_a_typed_closed_set(self) -> None:
        cases = {
            "unknown": lambda data: data["status_definitions"].__setitem__("future", "not approved"),
            "missing": lambda data: data["status_definitions"].pop("blocked"),
            "not_object": lambda data: data.__setitem__("status_definitions", None),
            "non_string_description": lambda data: data["status_definitions"].__setitem__("specified", None),
        }
        for name, mutate in cases.items():
            with self.subTest(name):
                message = "status definition" if name == "non_string_description" else "status_definitions"
                self._assert_feature_policy_rejected(mutate, message)

    def _assert_feature_policy_rejected(self, mutate, message: str) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "docs/execution"
            target.mkdir(parents=True)
            shutil.copytree(ROOT / "docs/product", root / "docs/product")
            data = json.loads((ROOT / "docs/execution/feature-list.json").read_text())
            mutate(data)
            (target / "feature-list.json").write_text(json.dumps(data))
            with self.assertRaisesRegex(AssertionError, message):
                feature_checks(root)

    def test_alpha_governance_rejects_invalid_authorization_combinations(self) -> None:
        self._assert_feature_policy_rejected(
            lambda data: data.__setitem__("production_implementation_authorized", True),
            "production implementation must remain unauthorized",
        )
        self._assert_feature_policy_rejected(
            lambda data: data.__setitem__("system_changes_authorized", False),
            "Alpha system-change authorization is required",
        )
        self._assert_feature_policy_rejected(
            lambda data: data["features"][0].__setitem__("status", "verified"),
            "invalid feature status",
        )
        for field in ("real_devices", "real_secrets", "permissions", "system_writes", "third_party_installation", "production_dependencies", "production_skeleton", "pr_merge", "release"):
            with self.subTest(forbidden=field):
                self._assert_feature_policy_rejected(
                    lambda data, field=field: data["wave0_authorization"].__setitem__(field, True),
                    f"wave0 authorization mismatch: {field}",
                )
        for field in (name for name, expected in WAVE0_AUTHORIZATION.items() if expected):
            with self.subTest(missing=field):
                self._assert_feature_policy_rejected(
                    lambda data, field=field: data["wave0_authorization"].__setitem__(field, False),
                    f"wave0 authorization mismatch: {field}",
                )
                self._assert_feature_policy_rejected(
                    lambda data, field=field: data["wave0_authorization"].pop(field),
                    f"wave0 authorization field is required: {field}",
                )
        self._assert_feature_policy_rejected(
            lambda data: data.__setitem__("milestone_status", "completed_waiting_for_next_authorization"),
            "unexpected milestone status",
        )
        for field in ("wifi", "passwords", "ctrl_compatibility", "third_party_installation", "software_auto_install", "permissions", "real_secrets", "personal_files", "merge_main", "release"):
            with self.subTest(alpha_forbidden=field):
                self._assert_feature_policy_rejected(
                    lambda data, field=field: data["alpha_authorization"].__setitem__(field, True),
                    f"alpha authorization mismatch: {field}",
                )

    def test_governance_rejects_unknown_closed_set_keys(self) -> None:
        for value in (True, False):
            with self.subTest(location="wave0_authorization", value=value):
                self._assert_feature_policy_rejected(
                    lambda data, value=value: data["wave0_authorization"].__setitem__("unknown", value),
                    "wave0 authorization has unknown keys",
                )
            with self.subTest(location="feature-list", value=value):
                self._assert_feature_policy_rejected(
                    lambda data, value=value: data.__setitem__("unknown", value),
                    "feature-list has unknown keys",
                )
            with self.subTest(location="milestone_evidence", value=value):
                self._assert_feature_policy_rejected(
                    lambda data, value=value: data["milestone_evidence"].__setitem__("unknown", value),
                    "milestone evidence has unknown keys",
                )
        for child in ("prototype", "format", "wave0"):
            with self.subTest(location=f"milestone_evidence.{child}"):
                self._assert_feature_policy_rejected(
                    lambda data, child=child: data["milestone_evidence"][child].__setitem__("unknown", True),
                    f"milestone evidence {child} has unknown keys",
                )

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
