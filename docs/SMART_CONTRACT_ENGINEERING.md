# Smart contract engineering controls

## Bounded contexts and versions

`skill-manager` owns professional profiles, credential requests, credentials, shares, and
the compatibility token wallet. `trust-manager` owns wallet identity binding, versioned
governance policy, incidents, appeals, reputation, and penalty directives. Cross-context
coordination belongs in the application layer; neither contract imports the other.

Audited source versions and Fabric lifecycle sequences are held in
`config/chaincode-versions.env`. A deployment must increment both the semantic version and
the lifecycle sequence. The current audited targets are skill-manager 1.7/sequence 8 and
trust-manager 1.4/sequence 5.

## Channels and privacy

The adapter routes the two contracts independently using `SKILL_CHANNEL_NAME` and
`TRUST_CHANNEL_NAME`. Development defaults both to `synapsenet` so existing local ledger
state remains available. Production must provision separate credential and trust channels,
set the two variables accordingly, and grant channel membership only to organizations that
need that bounded context. Channel separation does not replace private data collections for
fields hidden from some members of the same channel.

## Transactions and invalid attempts

Fabric peers append both valid and invalid submitted transactions to the channel blockchain.
Only valid transactions update CouchDB world state. Invalid transactions retain their
transaction ID, block number, and validation code and are read from filtered/full block
events; chaincode must not create a second invalid-transaction world-state record. Read-only
evaluations and web login attempts are not submitted Fabric transactions.

The user transaction scanner projects valid committed credential events. Administrative
monitoring must retain filtered block events as well so invalid validation codes can be
audited without exposing attempted payloads to end users.

## Endorsement and MSP access control

Deployment scripts pass the explicit, version-controlled `ENDORSEMENT_POLICY` to approval
and commit. Development uses `OR('Org1MSP.peer')`. Production policy changes require
consortium governance review and a new lifecycle sequence; multi-organization policies
should use `AND` where platform and issuer endorsement are both required.

Trust-manager validates submitter MSPs against versioned governance policy and participant
authority. Skill-manager binds newly registered users and enterprises to the submitter MSP
and checks that binding during submission/review. Pre-1.6 records have no binding and remain
in compatibility mode until migrated; API session authorization remains mandatory then.

## Performance and payload controls

- JSON transaction payloads are capped at 32 KiB before parsing in both contracts.
- Evidence documents stay off-ledger; transactions contain SHA-256 hashes and bounded
  storage references only.
- Approval writes the request and credential atomically. Wallet credential-ID arrays are
  projected on reads instead of rewritten on every approval.
- Related key changes use one Fabric transaction, batching them into one atomic read/write
  set. Unbounded application-level batch arrays are prohibited.
- CouchDB indexes ship in each CCAAS package for credential owner/issuer/request and
  incident/participant access patterns.
- New channel configuration targets 256 KiB preferred blocks, 10 MiB absolute blocks, and
  up to 20 messages per block. Existing channels need a governed config update before these
  values take effect.

## Remaining production gates

Before adding consortium organizations: migrate legacy skill records to authoritative MSPs,
provision separate channels, choose multi-party endorsement policies, and add private data
collections for member-restricted evidence references.
