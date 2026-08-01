# SynapseNet Product Requirements

## Objective

SynapseNet is a privacy-first consortium credential network. A person submits a
skill, role, education record, certificate, or other structured claim to the
single legal entity authoritative for that claim. The issuer validates and
issues the credential. The holder controls subsequent disclosure.

## Actors

- Credential holder: controls a MetaMask key and authorizes submissions/shares.
- Authoritative issuer: the only entity permitted to approve, correct, suspend,
  revoke, or invalidate a credential it issued.
- Reviewer: an X.509-authorized member of the issuer organization.
- Challenger: reports suspected misconduct and locks an SNT challenge bond.
- Consortium governor: applies network-level sanctions after due process.

## Required outcomes

- Wallet intent is signed in MetaMask; private keys never reach SynapseNet.
- Fabric records issuer, holder, status, hashes, policy version, and audit events.
- Sensitive metadata is encrypted off-ledger in SQLite.
- Sharing is credential-, recipient-, purpose-, and time-specific.
- SNT is a utility/staking token; REP is non-transferable reputation.
- Confirmed malicious incidents burn 10%, 25%, and 100% of compliance stake for
  the first, second, and third incidents.
- A report alone never triggers punishment.

## Non-goals for the current migration sprint

- Public cryptocurrency trading.
- Treating MetaMask addresses as Fabric MSP certificates.
- Allowing one institution to determine the factual validity of another
  institution's credential.
