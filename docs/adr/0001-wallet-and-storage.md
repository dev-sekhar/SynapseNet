# ADR 0001: MetaMask authorization and SQLite storage

Status: Accepted

## Decision

Use MetaMask for holder-controlled challenge and intent signatures. Retain
Fabric X.509/MSP identities for consortium authorization and endorsement. Use
FastAPI, SQLAlchemy 2, Alembic, and SQLite for encrypted off-chain metadata.

## Consequences

MetaMask cannot directly replace Fabric's default X.509 MSP. The application
must bind wallet addresses to actors and chaincode must verify canonical signed
intent. Encryption keys must be supplied through deployment secrets and never
committed. Express business sessions remain available only behind the development
compatibility flag. Production provisions wallet/MSP bindings in FastAPI and signs writes
with the enrolled actor certificate.
