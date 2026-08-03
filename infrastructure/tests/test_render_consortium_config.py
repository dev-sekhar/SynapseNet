import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).parents[1] / "scripts" / "render-consortium-config.py"
SPEC = importlib.util.spec_from_file_location("render_consortium_config", MODULE_PATH)
renderer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(renderer)


def manifest(msp: str, domain: str, trust: bool) -> dict:
    return {
        "schemaVersion": "1",
        "applicationId": f"application-{msp}",
        "fabric": {
            "mspId": msp,
            "domain": domain,
            "peer": f"peer0.{domain}",
            "ca": f"ca.{domain}",
            "channels": {"credentials": "credentials", "trust": "trust-governance" if trust else None},
            "roles": {"credentialIssuer": True, "trustGovernor": trust},
            "enrollment": {"reviewerIds": [f"reviewer-{msp.lower()}"]},
        },
    }


class ConsortiumRendererTests(unittest.TestCase):
    def test_renders_raft_isolation_and_domain_policies(self):
        values = [
            manifest("IssuerOneMSP", "issuer-one.example.edu", True),
            manifest("IssuerTwoMSP", "issuer-two.example.edu", False),
        ]
        config = renderer.render_configtx(values)
        compose = renderer.render_compose(values)
        self.assertEqual(config.count("Host: orderer2.synapsenet.com"), 1)
        self.assertEqual(config.count("Host: orderer3.synapsenet.com"), 1)
        trust_profile = config.split("SynapseNetTrustChannel:", 1)[1]
        self.assertIn("*ConsortiumOrg2", trust_profile)
        self.assertNotIn("*ConsortiumOrg3", trust_profile)
        self.assertIn("orderer2.synapsenet.com:", compose)
        self.assertIn("orderer3.synapsenet.com:", compose)
        self.assertEqual(
            renderer.signature_policy(["Org1MSP", "IssuerOneMSP"], True),
            "OutOf(2,'Org1MSP.peer','IssuerOneMSP.peer')",
        )

    def test_rejects_duplicate_msp_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for index, domain in enumerate(("one.example.edu", "two.example.edu")):
                (root / f"{index}.json").write_text(
                    json.dumps(manifest("RepeatedMSP", domain, False)), encoding="utf-8"
                )
            with self.assertRaisesRegex(ValueError, "must be unique"):
                renderer.manifests(root)


if __name__ == "__main__":
    unittest.main()
