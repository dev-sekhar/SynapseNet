# Sprint 004: Credential API and token execution

## Implemented

- Credential bootstrap, submission, review, wallet aggregation, and selective sharing moved
  from Express to FastAPI.
- The React client uses FastAPI for every credential-domain operation.
- The Fabric adapter allow-list explicitly maps each credential transaction to its smart
  contract namespace.
- Obsolete Express credential routes and the vanilla credential client were removed.
- `TokenContract` executes finalized progressive SNT burns and writes immutable token
  transactions.
- Penalty directive IDs provide ledger-level idempotency and parameter-conflict detection.
- `trust-manager` exposes pending directives and records completed execution proofs.
- An authenticated FastAPI reconciliation endpoint resumes partial cross-chaincode workflows
  without double-burning SNT.

## Operations

Set a strong `SYNAPSENET_PENALTY_EXECUTOR_TOKEN` and invoke:

```text
POST /api/v2/internal/penalties/reconcile
X-Penalty-Executor-Token: <secret>
```

The response separates `completed` and `failed` directives. Scheduling and alerting belong
in deployment automation; the endpoint is safe to retry.

## Remaining boundary

At Sprint 004, Express still owned password-backed business login and initial registration. The
final wallet-only flow supersedes that boundary: Express retains migration/recovery compatibility,
while normal login uses the FastAPI wallet challenge and provisioned actor mapping documented in
`docs/AUTHENTICATION.md`.
