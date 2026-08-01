from __future__ import annotations

import json
import re
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import unquote

from jsonschema import Draft202012Validator

from .fixtures import MATRIX, build_fixture
from .validator import HabitpackError, strict_json, validate_habitpack

ROOT = Path(__file__).resolve().parents[2]

WAVE0_AUTHORIZATION = {
    "local_fixture": True,
    "parser": True,
    "mock": True,
    "synthetic_snapshot": True,
    "offline_signature": True,
    "supply_chain_fixture": True,
    "research_branch_push": True,
    "official_docs_https": True,
    "locked_dev_dependencies_in_isolated_env": True,
    "real_devices": False,
    "real_secrets": False,
    "permissions": False,
    "system_writes": False,
    "third_party_installation": False,
    "production_dependencies": False,
    "production_skeleton": False,
    "pr_merge": False,
    "release": False,
}

ALPHA_AUTHORIZATION = {
    "windows_scan": True,
    "habitpack_export_import": True,
    "macos_declarative_apply": True,
    "snapshot_restore": True,
    "report_guide": True,
    "wifi": False,
    "passwords": False,
    "ctrl_compatibility": True,
    "third_party_installation": False,
    "software_auto_install": False,
    "permissions": False,
    "real_secrets": False,
    "personal_files": False,
    "merge_main": False,
    "release": False,
}

FEATURE_LIST_KEYS = frozenset(
    {
        "schema_version",
        "product",
        "direction",
        "current_milestone",
        "milestone_status",
        "prototype_authorized",
        "production_implementation_authorized",
        "system_changes_authorized",
        "last_updated",
        "wave0_authorization",
        "alpha_authorization",
        "milestone_evidence",
        "status_definitions",
        "features",
    }
)
WAVE0_AUTHORIZATION_KEYS = frozenset(WAVE0_AUTHORIZATION)
ALPHA_AUTHORIZATION_KEYS = frozenset(ALPHA_AUTHORIZATION)
MILESTONE_EVIDENCE_KEYS = frozenset({"prototype", "format", "wave0", "alpha"})
MILESTONE_EVIDENCE_CHILD_KEYS = {
    "prototype": frozenset({"commit", "scope"}),
    "format": frozenset({"schema_version", "scope", "command"}),
    "wave0": frozenset({"scope", "decision_ref", "evidence_ref"}),
    "alpha": frozenset({"branch", "scope", "decision_ref", "evidence_ref"}),
}
P0_FEATURE_IDS = frozenset(f"P0-{index:03d}" for index in range(1, 16))
STATUS_DEFINITIONS = frozenset({"specified", "prototyped", "implemented", "verified", "blocked"})
FEATURE_KEYS = frozenset(
    {
        "id",
        "name",
        "priority",
        "status",
        "owner",
        "decision_refs",
        "evidence_refs",
        "dependencies",
        "human_decisions_required",
        "acceptance_criteria",
        "non_goals",
        "risks",
    }
)
ACCEPTANCE_CRITERION_KEYS = frozenset({"id", "statement", "verification"})
FEATURE_ID_RE = re.compile(r"P0-\d{3}")
ACCEPTANCE_ID_RE = re.compile(r"P0-\d{3}-AC\d+")
DECISION_REF_RE = re.compile(r"D-\d{3}")
EVIDENCE_REF_RE = re.compile(r"E-\d{3}")
OPEN_DECISION_REF_RE = re.compile(r"OD-\d{3}")


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _check_closed_keys(actual: dict[str, object], expected: set[str] | frozenset[str], label: str) -> None:
    unknown = sorted(set(actual) - expected)
    missing = sorted(expected - set(actual))
    check(not unknown, f"{label} has unknown keys: {unknown}")
    check(not missing, f"{label} has missing keys: {missing}")


def _check_non_empty_string(value: object, label: str) -> None:
    check(isinstance(value, str), f"{label} must be a string")
    check(bool(value.strip()), f"{label} must be a non-empty string")


def _check_string_list(value: object, label: str, *, allow_empty: bool = True) -> list[str]:
    check(isinstance(value, list), f"{label} must be a list")
    if not allow_empty:
        check(bool(value), f"{label} must not be empty")
    for index, item in enumerate(value):
        check(isinstance(item, str), f"{label}[{index}] must be a string")
        check(bool(item.strip()), f"{label}[{index}] must be a non-empty string")
    check(len(value) == len(set(value)), f"{label} must not contain duplicates")
    return value


def _reference_definitions(root: Path) -> tuple[set[str], set[str]]:
    decisions_path = root / "docs/product/decisions.md"
    evidence_path = root / "docs/product/evidence.md"
    check(decisions_path.is_file(), "decision definitions are required")
    check(evidence_path.is_file(), "evidence definitions are required")
    decisions = decisions_path.read_text()
    evidence = evidence_path.read_text()
    decision_refs = set(re.findall(r"^### ((?:D|OD)-\d{3})：", decisions, re.M))
    evidence_refs = set(re.findall(r"^### (E-\d{3})：", evidence, re.M))
    check(decision_refs, "decision definitions must not be empty")
    check(evidence_refs, "evidence definitions must not be empty")
    return decision_refs, evidence_refs


def _ignored(path: Path, root: Path) -> bool:
    return any(part.startswith(".") or part in {"node_modules", "dist", "__pycache__", ".m1-validation-venv"} for part in path.relative_to(root).parts)


def json_checks(root: Path = ROOT) -> int:
    count = 0
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() != ".json" or _ignored(path, root):
            continue
        strict_json(path.read_bytes(), str(path.relative_to(root)))
        count += 1
    return count


def schema_checks() -> int:
    count = 0
    for path in (ROOT / "schemas").rglob("*.schema.json"):
        schema = strict_json(path.read_bytes(), str(path))
        Draft202012Validator.check_schema(schema)
        count += 1
    root = ROOT / "schemas/habitpack/1.0.0"
    catalog_schema = strict_json((root / "rule-catalog.schema.json").read_bytes(), "rule-catalog.schema.json")
    catalog = strict_json((root / "rule-catalog.m1.json").read_bytes(), "rule-catalog.m1.json")
    error = next(iter(Draft202012Validator(catalog_schema).iter_errors(catalog)), None)
    check(error is None, f"invalid rule catalog: {error}")
    return count


def fixture_checks() -> tuple[int, int]:
    valid = invalid = 0
    with tempfile.TemporaryDirectory(prefix="macwin-m1-") as directory:
        root = Path(directory)
        for descriptor in MATRIX["valid"]:
            path = root / f"{descriptor['name']}.habitpack"
            build_fixture(descriptor, path)
            validate_habitpack(path, descriptor["name"])
            valid += 1
        for descriptor in MATRIX["invalid"]:
            path = root / f"{descriptor['name']}.habitpack"
            build_fixture(descriptor, path)
            try:
                validate_habitpack(path, descriptor["name"])
            except HabitpackError as error:
                check(error.code == descriptor["expected_error"], f"{descriptor['name']}: expected {descriptor['expected_error']}, got {error}")
            else:
                raise AssertionError(f"{descriptor['name']}: invalid fixture was accepted")
            invalid += 1
    return valid, invalid


def slug(text: str) -> str:
    text = re.sub(r"[*_`~]", "", text.strip().lower())
    text = re.sub(r"[^\w\-\u4e00-\u9fff ]", "", text)
    return re.sub(r"[ _]+", "-", text).strip("-")


def markdown_checks(root: Path = ROOT) -> int:
    count = 0
    link_re = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() != ".md" or _ignored(path, root):
            continue
        text = path.read_text()
        for raw in link_re.findall(text):
            target = raw.split()[0].strip("<>")
            if target.startswith(("http://", "https://", "mailto:")):
                continue
            file_part, _, fragment = target.partition("#")
            destination = (path.parent / unquote(file_part)).resolve() if file_part else path.resolve()
            check(destination.is_relative_to(root.resolve()), f"link escapes repo: {path}:{target}")
            check(destination.exists(), f"broken link: {path.relative_to(root)} -> {target}")
            if fragment and destination.suffix.lower() == ".md":
                headings = {slug(line.lstrip("# ")) for line in destination.read_text().splitlines() if line.startswith("#")}
                check(unquote(fragment).lower() in headings, f"broken fragment: {path.relative_to(root)} -> {target}")
            count += 1
    return count


def traceability_checks(root: Path = ROOT) -> dict[str, int]:
    decisions = (root / "docs/product/decisions.md").read_text()
    evidence = (root / "docs/product/evidence.md").read_text()
    d_defs = re.findall(r"^### (D-\d{3})：", decisions, re.M)
    od_defs = re.findall(r"^### (OD-\d{3})：", decisions, re.M)
    e_defs = re.findall(r"^### (E-\d{3})：", evidence, re.M)
    for label, values in (("D", d_defs), ("OD", od_defs), ("E", e_defs)):
        check(len(values) == len(set(values)), f"duplicate {label} definitions")
    known = set(d_defs + od_defs + e_defs)
    referenced: set[str] = set()
    managed = [path for path in (root / "docs").rglob("*") if path.is_file() and path.suffix.lower() in {".md", ".json"}]
    managed.extend(path for path in (root / "README.md", root / "AGENTS.md", root / "SECURITY.md") if path.exists())
    for path in managed:
        if _ignored(path, root):
            continue
        referenced.update(re.findall(r"(?<![A-Z-])(?:OD|D|E)-\d{3}(?!\d)", path.read_text()))
    check(referenced <= known, f"unknown references: {sorted(referenced-known)}")
    return {"D": len(d_defs), "OD": len(od_defs), "E": len(e_defs)}


def feature_checks(root: Path = ROOT) -> int:
    data = strict_json((root / "docs/execution/feature-list.json").read_bytes(), "feature-list.json")
    check(isinstance(data, dict), "feature-list must be an object")
    check("milestone_status" in data, "milestone_status is required")
    check("milestone_evidence" in data, "milestone_evidence is required")
    _check_closed_keys(data, FEATURE_LIST_KEYS, "feature-list")
    features = data["features"]
    check(isinstance(features, list), "features must be a list")
    check(len(features) == len(P0_FEATURE_IDS), "features must contain exactly 15 items")
    for index, feature in enumerate(features):
        check(isinstance(feature, dict), f"feature {index} must be an object")
        check(isinstance(feature.get("id"), str), f"feature {index} id must be a string")
        _check_closed_keys(feature, FEATURE_KEYS, f"feature {index}")
    ids = [feature["id"] for feature in features]
    check(len(ids) == len(set(ids)), "duplicate feature IDs")
    check(set(ids) == P0_FEATURE_IDS, "feature IDs must be exactly P0-001 through P0-015")
    check(all(FEATURE_ID_RE.fullmatch(feature_id) for feature_id in ids), "feature IDs must match P0-###")
    status_definitions = data["status_definitions"]
    check(isinstance(status_definitions, dict), "status_definitions must be an object")
    _check_closed_keys(status_definitions, STATUS_DEFINITIONS, "status_definitions")
    for status, description in status_definitions.items():
        check(isinstance(description, str) and description, f"status definition must be a non-empty string: {status}")
    known_decisions, known_evidence = _reference_definitions(root)
    known = set(ids)
    acceptance: set[str] = set()
    graph: dict[str, list[str]] = {}
    for feature in features:
        feature_id = feature["id"]
        _check_non_empty_string(feature["name"], f"feature {feature_id} name")
        _check_non_empty_string(feature["owner"], f"feature {feature_id} owner")
        check(isinstance(feature["priority"], str), f"feature {feature_id} priority must be a string")
        check(isinstance(feature["status"], str), f"feature {feature_id} status must be a string")
        check(feature["priority"] == "P0", f"non-P0 feature: {feature_id}")
        check(feature["status"] in {"specified", "implemented"}, f"invalid feature status: {feature_id}")

        decision_refs = _check_string_list(feature["decision_refs"], f"decision refs: {feature_id}", allow_empty=False)
        for ref in decision_refs:
            check(DECISION_REF_RE.fullmatch(ref) is not None, f"invalid decision ref: {feature_id}: {ref}")
            check(ref in known_decisions, f"unknown decision ref: {feature_id}: {ref}")
        evidence_refs = _check_string_list(feature["evidence_refs"], f"evidence refs: {feature_id}", allow_empty=False)
        for ref in evidence_refs:
            check(EVIDENCE_REF_RE.fullmatch(ref) is not None, f"invalid evidence ref: {feature_id}: {ref}")
            check(ref in known_evidence, f"unknown evidence ref: {feature_id}: {ref}")
        human_decisions = _check_string_list(feature["human_decisions_required"], f"human decisions required: {feature_id}")
        for ref in human_decisions:
            check(OPEN_DECISION_REF_RE.fullmatch(ref) is not None, f"invalid human decision ref: {feature_id}: {ref}")
            check(ref in known_decisions, f"unknown human decision ref: {feature_id}: {ref}")

        dependencies = _check_string_list(feature["dependencies"], f"dependencies: {feature_id}")
        check(feature_id not in dependencies, f"feature cannot depend on itself: {feature_id}")
        check(set(dependencies) <= known, f"unknown dependency: {feature_id}")
        graph[feature_id] = dependencies

        criteria = feature["acceptance_criteria"]
        check(isinstance(criteria, list), f"acceptance criteria must be a list: {feature_id}")
        check(bool(criteria), f"acceptance criteria must not be empty: {feature_id}")
        for criterion_index, criterion in enumerate(criteria):
            check(isinstance(criterion, dict), f"acceptance criterion must be an object: {feature_id}[{criterion_index}]")
            check(isinstance(criterion.get("id"), str), f"acceptance ID must be a string: {feature_id}[{criterion_index}]")
            _check_closed_keys(criterion, ACCEPTANCE_CRITERION_KEYS, f"acceptance criterion {feature_id}[{criterion_index}]")
            criterion_id = criterion["id"]
            _check_non_empty_string(criterion_id, f"acceptance ID: {feature_id}")
            check(ACCEPTANCE_ID_RE.fullmatch(criterion_id) is not None and criterion_id.startswith(f"{feature_id}-"), f"acceptance ID has wrong feature prefix: {criterion_id}")
            _check_non_empty_string(criterion["statement"], f"acceptance statement: {criterion_id}")
            _check_non_empty_string(criterion["verification"], f"acceptance verification: {criterion_id}")
            check(criterion_id not in acceptance, f"duplicate acceptance ID: {criterion_id}")
            acceptance.add(criterion_id)

        for field in ("non_goals", "risks"):
            values = _check_string_list(feature[field], f"{field}: {feature_id}", allow_empty=False)
            check(all(value.strip() for value in values), f"{field} must contain non-empty strings: {feature_id}")
    visiting: set[str] = set(); done: set[str] = set()
    def visit(node: str) -> None:
        check(node not in visiting, f"dependency cycle at {node}")
        if node in done: return
        visiting.add(node)
        for dep in graph[node]: visit(dep)
        visiting.remove(node); done.add(node)
    for node in graph: visit(node)
    check(data["current_milestone"] == "Alpha-0.2-keyboard-compatibility", "current milestone mismatch")
    check(data["milestone_status"] == "alpha_local_validation_active", "unexpected milestone status")
    check(data.get("last_updated") == "2026-08-02", "last_updated mismatch")
    check(data.get("prototype_authorized") is True, "prototype authorization history must remain true")
    check(data["production_implementation_authorized"] is False, "production implementation must remain unauthorized")
    check(data["system_changes_authorized"] is True, "Alpha system-change authorization is required")
    check("wave0_authorization" in data and isinstance(data["wave0_authorization"], dict), "wave0_authorization is required")
    authorization = data["wave0_authorization"]
    check(isinstance(authorization, dict), "wave0_authorization must be an object")
    for field, expected in WAVE0_AUTHORIZATION.items():
        check(field in authorization, f"wave0 authorization field is required: {field}")
        check(type(authorization[field]) is bool, f"wave0 authorization field must be boolean: {field}")
        check(authorization[field] is expected, f"wave0 authorization mismatch: {field}")
    _check_closed_keys(authorization, WAVE0_AUTHORIZATION_KEYS, "wave0 authorization")
    alpha_authorization = data.get("alpha_authorization")
    check(isinstance(alpha_authorization, dict), "alpha_authorization is required")
    for field, expected in ALPHA_AUTHORIZATION.items():
        check(field in alpha_authorization, f"alpha authorization field is required: {field}")
        check(type(alpha_authorization[field]) is bool, f"alpha authorization field must be boolean: {field}")
        check(alpha_authorization[field] is expected, f"alpha authorization mismatch: {field}")
    _check_closed_keys(alpha_authorization, ALPHA_AUTHORIZATION_KEYS, "alpha authorization")
    check(isinstance(data["milestone_evidence"], dict), "milestone_evidence is required")
    evidence = data["milestone_evidence"]
    check(isinstance(evidence.get("prototype"), dict), "prototype milestone evidence is required")
    check(isinstance(evidence.get("format"), dict), "format milestone evidence is required")
    check(isinstance(evidence.get("wave0"), dict), "wave0 milestone evidence is required")
    _check_closed_keys(evidence, MILESTONE_EVIDENCE_KEYS, "milestone evidence")
    for name, expected_keys in MILESTONE_EVIDENCE_CHILD_KEYS.items():
        _check_closed_keys(evidence[name], expected_keys, f"milestone evidence {name}")
    check(re.fullmatch(r"[0-9a-f]{40}", evidence["prototype"].get("commit", "")) is not None, "prototype evidence commit mismatch")
    check(evidence["prototype"].get("scope") == "fictional_browser_interaction_only", "prototype evidence scope mismatch")
    check(evidence["format"].get("schema_version") == "1.0.0", "format evidence schema version mismatch")
    check(evidence["format"].get("scope") == "schema_container_and_fictional_fixture_validation_only", "format evidence scope mismatch")
    check(evidence["format"].get("command") == "./scripts/validate-m1", "format evidence command mismatch")
    check(evidence["wave0"].get("scope") == "research_only_no_production_or_system_changes", "wave0 evidence scope mismatch")
    check(evidence["wave0"].get("decision_ref") == "D-029", "wave0 decision evidence mismatch")
    check(evidence["wave0"].get("evidence_ref") == "E-018", "wave0 evidence reference mismatch")
    check(evidence["alpha"].get("branch") == "alpha/v0.2-keyboard-compatibility", "alpha evidence branch mismatch")
    check(evidence["alpha"].get("scope") == "real_mac_keyboard_compatibility_without_wifi_secrets_or_installers", "alpha evidence scope mismatch")
    check(evidence["alpha"].get("decision_ref") == "D-031", "alpha decision evidence mismatch")
    check(evidence["alpha"].get("evidence_ref") == "E-020", "alpha evidence reference mismatch")
    return len(features)


def whitespace_checks() -> None:
    for args in (("git", "diff", "--check"), ("git", "diff", "--cached", "--check")):
        result = subprocess.run(args, cwd=ROOT, text=True, capture_output=True)
        check(result.returncode == 0, result.stdout + result.stderr)


def main() -> None:
    schemas = schema_checks()
    valid, invalid = fixture_checks()
    json_count = json_checks()
    links = markdown_checks()
    refs = traceability_checks()
    features = feature_checks()
    whitespace_checks()
    print(f"M1 validation passed: {schemas} schemas; {valid} valid + {invalid} invalid fixtures; {json_count} JSON files; {links} relative links; {features} P0 features; refs D={refs['D']} OD={refs['OD']} E={refs['E']}")


if __name__ == "__main__":
    main()
