# Sprint 006: Production privacy, identity, and operations

## Outcome

The final three roadmap items are implemented: encrypted evidence metadata, actor-specific
Fabric identity, and durable operational auditing/reconciliation.

## Delivered

- AES-256-GCM evidence metadata with holder/assigned-issuer access checks and key versioning.
- Public ledger evidence reduced to content hashes and opaque private-metadata identifiers.
- Fabric CA actor enrollment with `synapsenet.actorId` and `synapsenet.role` attributes.
- Identity-aware adapter signing and production rejection of missing caller certificates.
- Wallet/MSP provisioning that removes the password gateway from the production auth path.
- Chaincode certificate-attribute verification and skill-manager 2.1/sequence 11.
- Durable valid-event projections and sanitized invalid-transaction auditing.
- Protected audit API, adapter health and Prometheus metrics.
- Continuously retryable penalty reconciliation worker.
- Consistent SQLite backup with SHA-256 checksum and documented recovery controls.

## Deployment gates

Operators must provide real secrets, enroll actor certificates, bind wallets, disable both
legacy compatibility flags, collect lifecycle approvals, schedule tested off-site backups,
and configure alerts for unhealthy event streams or reconciliation failures.
