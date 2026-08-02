from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

# Keep this research directory self-contained when unittest is invoked from
# the repository root (the directory name intentionally is not a Python package).
sys.path.insert(0, str(Path(__file__).parent))

from policy import evaluate


ROOT = Path(__file__).parent


def fixture(name: str) -> dict[str, object]:
    candidates = json.loads((ROOT / "fixtures.json").read_text(encoding="utf-8"))
    return next(candidate for candidate in candidates if candidate["id"] == name)


class SupplyChainPolicyTests(unittest.TestCase):
    def test_only_fully_verified_synthetic_candidates_can_auto_install(self) -> None:
        self.assertEqual(evaluate(fixture("fixture-vscode")).outcome, "auto_install_after_confirmation")
        self.assertEqual(evaluate(fixture("fixture-karabiner")).outcome, "auto_install_after_confirmation")

    def test_manual_license_or_missing_evidence_only_gets_official_entry(self) -> None:
        for name in ("fixture-m365", "fixture-unsigned", "fixture-unknown-source"):
            decision = evaluate(fixture(name))
            self.assertEqual(decision.outcome, "official_entry")
            self.assertTrue(decision.reasons)

    def test_security_bypass_is_blocked(self) -> None:
        self.assertEqual(evaluate(fixture("fixture-bypass")).outcome, "blocked")

    def test_offline_is_retryable_and_unselected_is_inert(self) -> None:
        self.assertEqual(evaluate(fixture("fixture-offline")).outcome, "retry_when_online")
        self.assertEqual(evaluate(fixture("fixture-not-selected")).outcome, "not_selected")

    def test_missing_evidence_never_defaults_to_auto_install(self) -> None:
        candidate = fixture("fixture-vscode")
        for field, value in {
            "https": False,
            "publisher_verified": False,
            "signature": "missing",
            "hash_verified": False,
            "license": "unknown",
        }.items():
            mutated = {**candidate, field: value}
            self.assertNotEqual(evaluate(mutated).outcome, "auto_install_after_confirmation")


if __name__ == "__main__":
    unittest.main()
