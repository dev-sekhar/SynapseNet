# Sprint 001: Web3 foundation

## Implemented

- React 19/TypeScript wallet client with Material UI and TanStack Query.
- MetaMask challenge signing without private-key custody.
- FastAPI application boundary.
- SQLAlchemy/SQLite wallet binding and encrypted metadata models.
- Alembic initial migration.
- Progressive penalty domain policy and tests.
- Architecture, domain, PRD, and ADR documentation.

## Compatibility

The existing Express gateway and its APIs remain intact. The FastAPI wallet
route currently delegates ledger reads to that gateway while identity migration
is in progress.

## Known limitations

- Wallet-to-ledger actor linking is not exposed yet.
- Canonical MetaMask intent verification is not yet implemented in chaincode.
- The multi-organization CA/MSP network has not replaced the existing Org1
  development network.
- Reputation and incident state transitions are specified but not yet deployed
  as modular chaincode.
- Exact founding legal-entity metadata remains to be supplied.

## Recommended next sprint

Implement wallet/actor linking, Fabric CA enrollment, issuer-specific MSP
authorization, canonical intent verification, and state-based endorsement.
