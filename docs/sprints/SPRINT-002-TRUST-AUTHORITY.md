# Sprint 002: Trust and authority

## Implemented

- Separate trust-manager bounded-context chaincode.
- MetaMask signature recovery and canonical intent validation.
- Complete transaction-parameter hash binding.
- Ledger nonce consumption and replay prevention.
- One wallet per participant binding.
- Authoritative MSP registration checks.
- Versioned governance policy activation.
- Ledger misconduct reports and governance decisions.
- Progressive 10%, 25%, and 100% penalty directives.
- Non-transferable REP awards and deductions.
- Automatic probation and third-incident suspension.
- Express compatibility endpoints and FastAPI linking orchestration.
- React automatic linking for users with an existing compatibility session.

## Deployment

`trust-manager` version 1.2, sequence 3, is committed on the local `synapsenet`
channel. Active development policy: `trust-policy-dev-1`.

## Known limitations

- The token context does not yet execute pending burn directives.
- Consortium organizations still share `Org1MSP` in the development network.
- Exact founding legal names have not been provided, so production MSP
  generation remains parameterized rather than invented.
- FastAPI temporarily delegates Fabric submission to the Node Gateway adapter.
- Appeals, issuer response deadlines, and credential status projection are the
  next incident-workflow increment.
