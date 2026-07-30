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


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def json_checks() -> int:
    count = 0
    for path in ROOT.rglob("*.json"):
        if any(part.startswith(".") or part in {"node_modules", "dist"} for part in path.relative_to(ROOT).parts):
            continue
        strict_json(path.read_bytes(), str(path.relative_to(ROOT)))
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


def markdown_checks() -> int:
    count = 0
    link_re = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")
    for path in ROOT.rglob("*.md"):
        if any(part.startswith(".") or part in {"node_modules", "dist"} for part in path.relative_to(ROOT).parts):
            continue
        text = path.read_text()
        for raw in link_re.findall(text):
            target = raw.split()[0].strip("<>")
            if target.startswith(("http://", "https://", "mailto:")):
                continue
            file_part, _, fragment = target.partition("#")
            destination = (path.parent / unquote(file_part)).resolve() if file_part else path.resolve()
            check(destination.is_relative_to(ROOT.resolve()), f"link escapes repo: {path}:{target}")
            check(destination.exists(), f"broken link: {path.relative_to(ROOT)} -> {target}")
            if fragment and destination.suffix.lower() == ".md":
                headings = {slug(line.lstrip("# ")) for line in destination.read_text().splitlines() if line.startswith("#")}
                check(unquote(fragment).lower() in headings, f"broken fragment: {path.relative_to(ROOT)} -> {target}")
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
    managed = [path for path in (root / "docs").rglob("*") if path.suffix in {".md", ".json"}]
    managed.extend(path for path in (root / "README.md", root / "AGENTS.md", root / "SECURITY.md") if path.exists())
    for path in managed:
        if any(part.startswith(".") or part in {"node_modules", "dist", "__pycache__"} for part in path.relative_to(root).parts):
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
        check(feature["priority"] == "P0", f"non-P0 in M1 list: {feature['id']}")
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
    check(data["current_milestone"] == "M1-clickable-prototype-and-format", "current milestone mismatch")
    check(data["production_implementation_authorized"] is False, "production implementation must remain unauthorized")
    check(data["system_changes_authorized"] is False, "system changes must remain unauthorized")
    check(all(feature["status"] == "specified" for feature in features), "M1 evidence must not advance real P0 status")
    check("milestone_status" in data, "milestone_status is required")
    check(data["milestone_status"] == "completed_waiting_for_next_authorization", "unexpected milestone status")
    check("milestone_evidence" in data and isinstance(data["milestone_evidence"], dict), "milestone_evidence is required")
    evidence = data["milestone_evidence"]
    check(isinstance(evidence.get("prototype"), dict), "prototype milestone evidence is required")
    check(re.fullmatch(r"[0-9a-f]{40}", evidence["prototype"].get("commit", "")) is not None, "prototype evidence commit mismatch")
    check(evidence["prototype"].get("scope") == "fictional_browser_interaction_only", "prototype evidence scope mismatch")
    check(isinstance(evidence.get("format"), dict), "format milestone evidence is required")
    check(evidence["format"].get("schema_version") == "1.0.0", "format evidence schema version mismatch")
    check(evidence["format"].get("scope") == "schema_container_and_fictional_fixture_validation_only", "format evidence scope mismatch")
    check(evidence["format"].get("command") == "./scripts/validate-m1", "format evidence command mismatch")
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
