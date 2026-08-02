from fastapi.testclient import TestClient

from app import main
from app.database import database_session
from app.models import OrganizationApplication


class FakeSession:
    def __init__(self, application):
        self.application = application
        self.commits = 0

    async def get(self, _model, application_id):
        return self.application if application_id == self.application.application_id else None

    async def commit(self):
        self.commits += 1


def test_governance_approval_emits_idempotent_provisioning_manifest():
    application = OrganizationApplication(
        application_id="org-application-1",
        legal_name="Example University Ltd",
        display_name="Example University",
        jurisdiction="GB",
        registration_number="12345678",
        requested_msp_id="ExampleUniversityMSP",
        requested_domain="credentials.example.edu",
        applicant_wallet="0x" + "a" * 40,
        status="pending_governance",
    )
    session = FakeSession(application)

    async def override_session():
        yield session

    main.app.dependency_overrides[database_session] = override_session
    original_token = main.settings().governance_token
    main.settings().governance_token = "test-governance-token"
    payload = {
        "decision": "approve",
        "reason": "Legal identity and operating controls verified",
        "governanceReference": "resolution-2026-08-02",
        "joinTrustChannel": True,
        "reviewerIds": ["reviewer-example"],
    }
    client = TestClient(main.app)
    response = client.post(
        "/api/v2/internal/organizations/applications/org-application-1/decision",
        headers={"X-Governance-Token": "test-governance-token"},
        json=payload,
    )
    replay = client.post(
        "/api/v2/internal/organizations/applications/org-application-1/decision",
        headers={"X-Governance-Token": "test-governance-token"},
        json=payload,
    )
    main.app.dependency_overrides.clear()
    main.settings().governance_token = original_token

    assert response.status_code == 200
    manifest = response.json()["provisioningManifest"]
    assert manifest["fabric"]["mspId"] == "ExampleUniversityMSP"
    assert manifest["fabric"]["channels"]["credentials"] == "credentials"
    assert manifest["fabric"]["channels"]["trust"] == "trust-governance"
    assert replay.json()["provisioningManifest"] == manifest
    assert session.commits == 1


def test_governance_decision_requires_secret():
    response = TestClient(main.app).post(
        "/api/v2/internal/organizations/applications/missing/decision",
        json={
            "decision": "reject",
            "reason": "Legal evidence was incomplete",
            "governanceReference": "resolution-rejected",
        },
    )
    assert response.status_code == 401
