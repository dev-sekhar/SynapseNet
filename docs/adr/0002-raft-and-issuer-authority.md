# ADR 0002: Raft and authoritative issuers

Status: Accepted

## Decision

Use Raft ordering. Each credential has one authoritative legal-entity issuer.
Only that issuer may approve, correct, suspend, revoke, or invalidate it.
Consortium governance may sanction an issuer but may not rewrite its claims.

## Consequences

Raft protects availability from crash failures but not Byzantine operators.
Credential integrity therefore relies on MSP identity, certificate attributes,
issuer endorsement policies, challenge due process, staking, and reputation.
