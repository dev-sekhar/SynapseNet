# Smart contract engineering controls

## Bounded contexts and versions

`skill-manager` owns professional profiles, credential requests, credentials, shares, and
the SNT token wallet and idempotent penalty execution. `trust-manager` owns wallet identity binding, versioned
governance policy, incidents, appeals, reputation, and penalty directives. Cross-context
coordination belongs in the application layer; neither contract imports the other.

Audited source versions and Fabric lifecycle sequences are held in
`blockchain/config/chaincode-versions.env`. A deployment must increment both the semantic version and
the lifecycle sequence. The current audited targets are skill-manager 2.1/sequence 11 and
trust-manager 1.6/sequence 6.

## Channels and privacy

The adapter routes the two contracts independently using `SKILL_CHANNEL_NAME` and
`TRUST_CHANNEL_NAME`. Development defaults both to `synapsenet` so existing local ledger
state remains available. Consortium mode renders and creates distinct `credentials` and
`trust-governance` channels. All approved issuers join the credential channel; only
organizations explicitly approved as trust governors join the trust channel. Channel
separation does not replace private data collections for fields hidden from some members of
the same channel.

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

Deployment scripts pass explicit, version-controlled policies to approval and commit.
Development uses `OR('Org1MSP.peer')`. Consortium rendering derives credential endorsement
from every approved issuer and requires a majority of approved trust governors for the trust
domain. Policy changes require consortium review and a new lifecycle sequence.

`skill-manager` 2.0 additionally installs state-based endorsement on issuer-controlled
records. Enterprise records, requests submitted to that enterprise, and credentials it
approves require a peer from the issuer's MSP. This prevents the broad chaincode policy from
allowing another consortium member to mutate issuer-owned state on its own.

Trust-manager validates submitter MSPs against versioned governance policy and participant
authority. Skill-manager binds newly registered users and enterprises to the submitter MSP
and checks that binding during submission/review. Pre-1.6 records have no binding and remain
in compatibility mode until migrated; API session authorization remains mandatory then.

## Penalty execution and recovery

Final misconduct creates a `pending_token_execution` directive in `trust-manager`. The
internal FastAPI reconciler resolves the actor's credential-domain wallet, invokes
`TokenContract.executePenaltyDirective`, and acknowledges the immutable execution details
with `ReputationContract.completePenaltyDirective`. Both writes are idempotent. If the
process stops after the burn but before acknowledgement, the next reconciliation receives
the existing execution and completes the trust record without a second burn.

Invoke `POST /api/v2/internal/penalties/reconcile` with `X-Penalty-Executor-Token` from a
protected scheduler. Production must replace the development token and restrict network
access to this endpoint.

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

## Production evidence and identity controls

Evidence content and storage references are not placed in a Fabric private-data collection:
they are removed from transaction payloads entirely. Fabric stores the content hash and an
opaque application metadata ID; the application encrypts the reference with AES-256-GCM.
This provides stronger channel privacy than distributing the sensitive value to peer private
state. Private collections remain appropriate only if a future workflow requires peers to
execute deterministic logic over sensitive values.

Production disables legacy business sessions and admin-certificate fallback. Actor
certificates carry `synapsenet.actorId` and `synapsenet.role`; chaincode checks these values in
addition to MSP binding and state-based endorsement. Legal checks, DNS ownership, CA custody,
and lifecycle approvals remain recorded human governance controls.
