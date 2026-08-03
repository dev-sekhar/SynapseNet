import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / "scripts" / "finalize-go-live.py"
SPEC = importlib.util.spec_from_file_location("finalize_go_live", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FinalizeGoLiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.evidence = {}
        for phase in MODULE.REQUIRED_PHASES:
            path = self.root / f"{phase}.txt"
            path.write_text("passed", encoding="utf-8")
            self.evidence[phase] = path
        self.approvals = self.root / "approvals.json"
        self.approvals.write_text(json.dumps({
            "releaseId": "release-1", "commit": "abc123", "approvals": {
                role: {"approved": True, "name": f"{role}-owner", "approvedAt": "2026-08-03T00:00:00Z"}
                for role in MODULE.REQUIRED_APPROVALS
            }
        }), encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def test_complete_release_is_certified(self):
        result = MODULE.finalize("release-1", "abc123", self.evidence, self.approvals)
        self.assertEqual(result["status"], "approved-for-go-live")
        self.assertEqual(len(result["evidence"]), 5)

    def test_missing_phase_is_rejected(self):
        del self.evidence["phase8"]
        with self.assertRaisesRegex(ValueError, "phase evidence mismatch"):
            MODULE.finalize("release-1", "abc123", self.evidence, self.approvals)

    def test_commit_mismatch_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "does not match"):
            MODULE.finalize("release-1", "different", self.evidence, self.approvals)

    def test_duplicate_approver_is_rejected(self):
        document = json.loads(self.approvals.read_text(encoding="utf-8"))
        document["approvals"]["security"]["name"] = document["approvals"]["governance"]["name"]
        self.approvals.write_text(json.dumps(document), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "independent named approvers"):
            MODULE.finalize("release-1", "abc123", self.evidence, self.approvals)
