"""Offline, synthetic software-install policy evaluator for M2 Wave 0.

This is research code. It deliberately accepts metadata instead of URLs or
installer bytes, so it cannot download, execute, or install anything.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Decision:
    outcome: str
    reasons: tuple[str, ...]


ALLOWED_SOURCES = {"official_site", "official_github_release"}


def evaluate(candidate: dict[str, Any]) -> Decision:
    """Map synthetic metadata to a user-visible action.

    The evaluator is intentionally conservative: missing or unverifiable
    evidence never becomes an automatic install. A Gatekeeper/SmartScreen
    bypass is a hard stop rather than an official-entry fallback.
    """

    if not isinstance(candidate.get("id"), str) or not candidate["id"]:
        return Decision("invalid_fixture", ("missing_id",))
    if not candidate.get("selected", False):
        return Decision("not_selected", ("user_did_not_select",))
    if candidate.get("gatekeeper_bypass", False):
        return Decision("blocked", ("security_bypass_required",))
    if candidate.get("network") == "offline":
        return Decision("retry_when_online", ("network_unavailable",))

    reasons: list[str] = []
    if candidate.get("source") not in ALLOWED_SOURCES:
        reasons.append("source_not_official")
    if candidate.get("https") is not True:
        reasons.append("https_not_verified")
    if candidate.get("publisher_verified") is not True:
        reasons.append("publisher_not_verified")
    if candidate.get("signature") != "trusted":
        reasons.append("platform_signature_not_trusted")
    if candidate.get("hash_verified") is not True:
        reasons.append("hash_not_verified")
    if candidate.get("license") != "automation_allowed":
        reasons.append("license_requires_manual_flow")

    if reasons:
        return Decision("official_entry", tuple(reasons))
    return Decision("auto_install_after_confirmation", ("all_synthetic_checks_passed",))


def evaluate_all(candidates: list[dict[str, Any]]) -> dict[str, Decision]:
    return {candidate["id"]: evaluate(candidate) for candidate in candidates}
