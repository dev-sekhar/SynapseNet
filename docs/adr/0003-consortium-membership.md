# ADR 0003: Enterprise organizations and user identities

Status: Accepted

## Decision

An enterprise first submits its exact legal name, jurisdiction, legal
registration number, display name, and requested stable MSP ID. Governance
approval triggers infrastructure provisioning and a channel configuration
update. Browser registration never adds an organization directly.

Individual users do not receive a peer organization. They receive client
identities under a user-member MSP and retain authorization control through
their linked MetaMask key. This prevents a peer, CA, MSP, and channel member
from being required for every person.

## Rationale

Fabric organizations are administrative and endorsement domains, not user
accounts. Dynamic organization membership requires CA/peer provisioning,
configuration signatures, channel updates, lifecycle approvals, monitoring,
and offboarding. Treating every user as an organization would be operationally
and economically unsustainable.
