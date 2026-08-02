# Sprint 005: Consortium governance and production policies

## Outcome

Organization onboarding now leads to an auditable governance decision and deterministic
Fabric provisioning manifest. Production topology generation consumes approved manifests
only and separates credential issuance from trust governance.

## Delivered

- Wallet-authenticated organization applications collect legal and Fabric domain identity.
- Token-protected governance APIs list, approve, reject, and idempotently replay decisions.
- Approval records its reason, resolution reference, reviewers, time, and channel role.
- Fabric CA enrollment creates organization, peer, admin, and attributed reviewer MSPs.
- Generated Compose and configtx definitions include approved organizations only.
- Credential and trust domains use distinct channels and independently generated policies.
- Approved peers can be joined automatically only to their authorized channels.
- Issuer-owned credential state uses issuer-MSP state-based endorsement.
- `skill-manager` advances to version 2.0, lifecycle sequence 10.

## Operational boundary

The software validates structure and enforces the recorded decision. Consortium governors
remain responsible for external legal checks, DNS ownership, secret exchange, CA custody,
and collecting each member's chaincode lifecycle approval. Private data collections for
restricted evidence metadata remain a later production-hardening item.
