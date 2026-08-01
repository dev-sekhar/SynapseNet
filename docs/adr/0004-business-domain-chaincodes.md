# ADR 0004: Business-domain chaincode boundaries

## Status

Accepted.

## Decision

SynapseNet deploys two chaincodes: `skill-manager` for the credential domain and `trust-manager` for the trust-governance domain. Each chaincode contains multiple smart contracts that divide its callable surface by responsibility.

Each chaincode owns its lifecycle version, sequence, channel selection, endorsement policy, CCaaS service, and peer world-state namespace. Contracts within a chaincode share those properties.

Application services explicitly select both chaincode and smart-contract namespace. Cross-domain workflows are coordinated at the application layer; direct cross-chaincode invocation is not used.

## Rationale

Credential identity, issuance, wallet projections, token accounting, and selective sharing are tightly coupled and normally change under one governance model. Trust policy, wallet-bound participants, misconduct incidents, and reputation are similarly cohesive but require an independent governance and upgrade boundary.

Splitting every responsibility into a separate chaincode would add packaging, installation, approval, commit, monitoring, and upgrade overhead. Combining both domains would prevent independent endorsement and lifecycle evolution.

## Consequences

- The two domains can use the same channel or separate channels.
- Each domain may adopt a different endorsement policy without repackaging the other.
- A new smart contract in an existing domain requires a chaincode upgrade because contracts share one package.
- Cross-domain operations must handle retries and partial completion in application services.
- A new chaincode requires evidence of a distinct domain, governance requirement, upgrade cadence, or isolation need.
