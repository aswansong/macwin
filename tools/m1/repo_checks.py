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


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


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
    features = data["features"]
    ids = [x["id"] for x in features]
    check(len(ids) == len(set(ids)), "duplicate feature IDs")
    known = set(ids)
    acceptance: set[str] = set()
    graph: dict[str, list[str]] = {}
    for feature in features:
        check(feature["priority"] == "P0", f"non-P0 feature: {feature['id']}")
        check(feature["status"] in data["status_definitions"], f"unknown status: {feature['id']}")
        check(isinstance(feature["dependencies"], list), f"missing dependencies: {feature['id']}")
        check(feature["risks"], f"missing risks: {feature['id']}")
        check(feature["decision_refs"], f"missing decision refs: {feature['id']}")
        check(feature["acceptance_criteria"], f"missing acceptance: {feature['id']}")
        graph[feature["id"]] = feature["dependencies"]
        check(set(feature["dependencies"]) <= known, f"unknown dependency: {feature['id']}")
        for criterion in feature["acceptance_criteria"]:
            check(criterion["id"] not in acceptance, f"duplicate acceptance ID: {criterion['id']}")
            check(criterion["statement"] and criterion["verification"], f"empty acceptance: {criterion['id']}")
            acceptance.add(criterion["id"])
    visiting: set[str] = set(); done: set[str] = set()
    def visit(node: str) -> None:
        check(node not in visiting, f"dependency cycle at {node}")
        if node in done: return
        visiting.add(node)
        for dep in graph[node]: visit(dep)
        visiting.remove(node); done.add(node)
    for node in graph: visit(node)
    check(data["current_milestone"] == "M2-wave0-research-only", "current milestone mismatch")
    check("milestone_status" in data, "milestone_status is required")
    check(data["milestone_status"] == "research_only_wave0_active", "unexpected milestone status")
    check(data.get("last_updated") == "2026-08-01", "last_updated mismatch")
    check(data.get("prototype_authorized") is True, "prototype authorization history must remain true")
    check(data["production_implementation_authorized"] is False, "production implementation must remain unauthorized")
    check(data["system_changes_authorized"] is False, "system changes must remain unauthorized")
    check(all(feature["status"] == "specified" for feature in features), "Wave0 evidence must not advance real P0 status")
    check("wave0_authorization" in data and isinstance(data["wave0_authorization"], dict), "wave0_authorization is required")
    authorization = data["wave0_authorization"]
    for field, expected in WAVE0_AUTHORIZATION.items():
        check(field in authorization, f"wave0 authorization field is required: {field}")
        check(type(authorization[field]) is bool, f"wave0 authorization field must be boolean: {field}")
        check(authorization[field] is expected, f"wave0 authorization mismatch: {field}")
    check("milestone_evidence" in data and isinstance(data["milestone_evidence"], dict), "milestone_evidence is required")
    evidence = data["milestone_evidence"]
    check(isinstance(evidence.get("prototype"), dict), "prototype milestone evidence is required")
    check(re.fullmatch(r"[0-9a-f]{40}", evidence["prototype"].get("commit", "")) is not None, "prototype evidence commit mismatch")
    check(evidence["prototype"].get("scope") == "fictional_browser_interaction_only", "prototype evidence scope mismatch")
    check(isinstance(evidence.get("format"), dict), "format milestone evidence is required")
    check(evidence["format"].get("schema_version") == "1.0.0", "format evidence schema version mismatch")
    check(evidence["format"].get("scope") == "schema_container_and_fictional_fixture_validation_only", "format evidence scope mismatch")
    check(evidence["format"].get("command") == "./scripts/validate-m1", "format evidence command mismatch")
    check(isinstance(evidence.get("wave0"), dict), "wave0 milestone evidence is required")
    check(evidence["wave0"].get("scope") == "research_only_no_production_or_system_changes", "wave0 evidence scope mismatch")
    check(evidence["wave0"].get("decision_ref") == "D-029", "wave0 decision evidence mismatch")
    check(evidence["wave0"].get("evidence_ref") == "E-018", "wave0 evidence reference mismatch")
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
