import os

os.environ.setdefault("SYNAPSENET_FABRIC_ADAPTER_TOKEN", "test-adapter-token")
os.environ.setdefault("SYNAPSENET_SESSION_SECRET", "test-session-secret")
os.environ["SYNAPSENET_ENCRYPTION_KEY"] = "eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHg="
os.environ.setdefault("SYNAPSENET_PENALTY_EXECUTOR_TOKEN", "test-penalty-token")

from fastapi.testclient import TestClient

from app import main


def test_credential_submission_uses_allow_listed_fabric_boundary(monkeypatch):
    calls = []

    async def actor(_request):
        return {"actorId": "user-a", "role": "user"}

    async def fabric(contract, transaction, args, *, submit, identity=None):
        calls.append((contract, transaction, args, submit))
        return "request-ledger-1"

    monkeypatch.setattr(main, "authenticated_business_actor", actor)
    async def fabric_identity(_actor):
        return {"mspId": "Org1MSP", "enrollmentId": "user-a", "role": "user"}
    monkeypatch.setattr(main, "actor_fabric_identity", fabric_identity)
    monkeypatch.setattr(main, "fabric_transaction", fabric)
    response = TestClient(main.app).post("/api/v2/credential-requests", json={
        "enterpriseId": "issuer-a",
        "credentialType": "certificate",
        "title": "Fabric Operator",
        "details": {},
        "evidence": [{
            "evidenceId": "evidence-a",
            "documentType": "Certificate",
            "fileName": "certificate.pdf",
            "contentHash": f"sha256:{'a' * 64}",
            "storageProvider": "encrypted-store",
        }],
    })
    assert response.status_code == 201
    assert response.json() == {"requestId": "request-ledger-1"}
    assert calls[0][0:2] == ("skill-manager", "submitCredentialRequest")
    assert calls[0][3] is True
    ledger_evidence = __import__("json").loads(calls[0][2][0])["evidence"][0]
    assert ledger_evidence["fileName"] == "encrypted"
    assert ledger_evidence["storageProvider"] == "synapsenet-private-metadata"
    assert ledger_evidence["storageReference"].startswith("evidence-metadata-")


def test_penalty_reconciliation_executes_then_acknowledges(monkeypatch):
    transactions = []

    async def fabric(contract, transaction, args, *, submit, identity=None):
        transactions.append((contract, transaction, submit))
        if transaction == "getPendingPenaltyDirectives":
            return [{
                "directiveId": "penalty-1", "actorId": "user-a",
                "burnBasisPoints": 1000,
            }]
        if transaction == "getUsers":
            return [{"userId": "user-a"}]
        if transaction == "getEnterprises":
            return []
        if transaction == "executePenaltyDirective":
            return {
                "ownerId": "user-a", "amount": 100, "balanceAfter": 900,
                "tokenTransactionId": "penalty-penalty-1",
            }
        if transaction == "completePenaltyDirective":
            return {"directiveId": "penalty-1", "status": "executed"}
        raise AssertionError(transaction)

    monkeypatch.setattr(main, "fabric_transaction", fabric)
    response = TestClient(main.app).post(
        "/api/v2/internal/penalties/reconcile",
        headers={"X-Penalty-Executor-Token": "test-penalty-token"},
    )
    assert response.status_code == 200
    assert response.json()["completed"][0]["status"] == "executed"
    assert ("skill-manager", "executePenaltyDirective", True) in transactions
    assert transactions[-1] == ("trust-manager", "completePenaltyDirective", True)


def test_penalty_reconciliation_rejects_missing_executor_token():
    response = TestClient(main.app).post("/api/v2/internal/penalties/reconcile")
    assert response.status_code == 401
