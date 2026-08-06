from __future__ import annotations

import unittest
from pathlib import Path


WORKFLOW = Path(__file__).parents[1] / ".github/workflows/public-release.yml"


class PublicReleaseWorkflowTests(unittest.TestCase):
    def test_public_workflow_is_tag_limited_and_dispatch_is_dry_run(self) -> None:
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("workflow_dispatch:", text)
        self.assertIn('tags: ["v1.0.1"]', text)
        self.assertIn("publish=false", text)
        self.assertIn("publish=true", text)
        self.assertIn("make_latest: true", text)
        self.assertIn("prerelease: false", text)

    def test_public_workflow_has_exact_unsigned_platform_contract(self) -> None:
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("--bundles nsis --no-sign", text)
        self.assertIn("--bundles app --no-sign", text)
        for asset in ("SHA256SUMS.txt", "BUILD-INFO.json", "README-FIRST.md", "BUILD_COMMIT-windows.txt", "BUILD_COMMIT-macos.txt"):
            self.assertIn(asset, text)
        self.assertIn("validate-public-release-assets.py", text)
        self.assertNotIn("latest.json", text)
        self.assertNotIn("prerelease: true", text)
        self.assertNotIn(".app.tar.gz", text)

    def test_signed_workflow_cannot_be_started_by_a_tag_push(self) -> None:
        text = (WORKFLOW.parent / "release.yml").read_text(encoding="utf-8")
        self.assertNotIn("  push:\n    tags:", text)


if __name__ == "__main__":
    unittest.main()
