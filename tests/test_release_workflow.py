from __future__ import annotations

import unittest
from pathlib import Path


WORKFLOW = Path(__file__).parents[1] / ".github/workflows/release.yml"


class ReleaseWorkflowTests(unittest.TestCase):
    def test_updater_keeps_downgrade_protection(self) -> None:
        source = (WORKFLOW.parents[2] / "src-tauri/src/lib.rs").read_text(encoding="utf-8")
        self.assertIn("Builder::new()", source)
        self.assertNotIn(".version_comparator", source)
        self.assertNotIn("allow_downgrades:", source)

    def test_windows_code_signing_happens_before_updater_artifact_generation(self) -> None:
        text = WORKFLOW.read_text(encoding="utf-8")
        import_step = text.index("Import Windows code-signing certificate")
        build_step = text.index("Build signed Windows installer and updater artifact")
        verify_step = text.index("Verify Windows installer signatures")
        checksums_step = text.index("Create checksums and dependency manifests")
        self.assertLess(import_step, build_step)
        self.assertLess(build_step, verify_step)
        self.assertLess(verify_step, checksums_step)
        self.assertIn("signCommand", text)
        self.assertIn("signtool sign /fd SHA256 /a", text)
        self.assertIn("--config $config", text)
        self.assertNotIn("- name: Sign Windows installer", text)
        self.assertNotIn("& signtool sign", text)

    def test_release_workflow_keeps_updater_key_and_certificate_gates(self) -> None:
        text = WORKFLOW.read_text(encoding="utf-8")
        for variable in (
            "TAURI_SIGNING_PRIVATE_KEY",
            "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
            "MACWIN_UPDATER_PUBKEY",
            "WINDOWS_CERTIFICATE_BASE64",
            "WINDOWS_CERTIFICATE_PASSWORD",
        ):
            self.assertIn(variable, text)

    def test_signed_workflow_is_manual_only(self) -> None:
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("workflow_dispatch:", text)
        self.assertNotIn("  push:\n    tags:", text)
