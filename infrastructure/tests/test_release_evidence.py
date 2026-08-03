import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "build-release-evidence.py"
SPEC = importlib.util.spec_from_file_location("release_evidence", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
VERIFY_SCRIPT = Path(__file__).parents[1] / "scripts" / "verify-release-evidence.py"
VERIFY_SPEC = importlib.util.spec_from_file_location("verify_release_evidence", VERIFY_SCRIPT)
VERIFY_MODULE = importlib.util.module_from_spec(VERIFY_SPEC)
VERIFY_SPEC.loader.exec_module(VERIFY_MODULE)


class ReleaseEvidenceTests(unittest.TestCase):
    def test_artifacts_are_sorted_and_hashed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            second, first = root / "b.txt", root / "a.txt"
            second.write_text("second", encoding="utf-8")
            first.write_text("first", encoding="utf-8")
            result = MODULE.build("release-1", [second, first], SCRIPT.parents[2])
            self.assertEqual(result["releaseId"], "release-1")
            self.assertEqual([Path(item["path"]).name for item in result["artifacts"]], ["a.txt", "b.txt"])
            self.assertTrue(all(len(item["sha256"]) == 64 for item in result["artifacts"]))

    def test_empty_evidence_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            empty = Path(directory) / "empty.txt"
            empty.touch()
            with self.assertRaisesRegex(ValueError, "missing or empty evidence"):
                MODULE.build("release-1", [empty], SCRIPT.parents[2])

    def test_modified_evidence_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifact = root / "phase4-readiness.txt"
            artifact.write_text("passed", encoding="utf-8")
            manifest = root / "manifest.json"
            import json
            manifest.write_text(json.dumps(MODULE.build("release-1", [artifact], SCRIPT.parents[2])))
            VERIFY_MODULE.verify(manifest, "release-1")
            artifact.write_text("changed", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "digest changed"):
                VERIFY_MODULE.verify(manifest, "release-1")


if __name__ == "__main__":
    unittest.main()
