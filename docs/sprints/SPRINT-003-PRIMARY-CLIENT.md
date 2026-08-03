# Sprint 003: Primary client and incident finality

## Implemented

- React Web3 client is now the primary UI served on port 3001.
- Enterprise applications capture legal identity at registration.
- Enterprise MSP creation is represented as governed provisioning, not an
  unchecked browser mutation.
- Dedicated allow-listed Fabric infrastructure adapter replaces Express for
  FastAPI trust-manager submissions.
- Incident issuer-response deadlines.
- Wallet-signed appeals.
- Penalties delayed until final decision.
- Unresponsive-issuer status.
- Credential trust projection for challenged, trusted, unresponsive, and
  invalidated credentials.
- Versioned `trust-policy-dev-2` with 14-day response and appeal periods.

## Deployment

- `trust-manager` version 1.3, sequence 4.
- FastAPI running on port 8000.
- Fabric adapter running internally on port 3010.
- React build served from port 3001.

## Resolved in Sprint 004

- Credential CRUD, wallet aggregation, and sharing now use FastAPI and the allow-listed adapter.
- Final penalty directives now execute and reconcile idempotently through `TokenContract`.

## Resolved after Sprint 003

- Governed organization approval now renders and provisions production infrastructure.
- Production privacy, actor certificates, durable audit indexing, and operations automation
  are delivered in Sprint 006; onboarding actual legal entities remains an operator action.
