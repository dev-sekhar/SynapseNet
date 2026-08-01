# Chaincode API

Lifecycle versions, endorsement rules, channel routing, payload limits, CouchDB indexes,
and migration constraints are documented in `SMART_CONTRACT_ENGINEERING.md`.

## Credential domain (`skill-manager`)

Chaincode name: `skill-manager`

Contract routing:

- `SynapseNet.IdentityContract`: identity and issuer registry commands.
- `SynapseNet.CredentialContract`: credential lifecycle commands and views.
- `SynapseNet.WalletContract`: wallet and token accounting commands.
- `SynapseNet.SharingContract`: selective disclosure commands.

### Commands

- `registerUser(userId, displayName)` binds a new holder to the submitter MSP.
- `registerEnterprise(enterpriseId, name, initialReviewerId)` binds a new issuer to the
  submitter MSP.
- `addEnterpriseReviewer(enterpriseId, reviewerId)` updates the reviewer set.
- `submitCredentialRequest(payloadJson)` accepts at most 32 KiB; evidence content stays
  off-ledger and is represented by SHA-256 proofs. Skill requests require proficiency level
  and practical application, and validate optional experience, tools, last-used month, and
  attestations as defined in `DOMAIN_MODEL.md`.
- `reviewCredentialRequest(requestId, reviewerId, decision, notes)` checks the issuer MSP
  and atomically writes the outcome plus an approved credential.
- `createShareGrant(payloadJson)` and `revokeShareGrant(shareId, ownerId)` manage selective
  disclosure grants.

### Queries

- `getCredentialRequests()`
- `getWallet(userId)`
- `getIssuedCredentials(enterpriseId)`
- `getWalletAccount(ownerId)`
- `getTokenTransactions(ownerId)`
- `getShareGrant(shareId)`
- `getSharedCredentials(recipient)`

## Credential transaction events

Credential submission and review transactions emitted by `skill-manager` publish a
`CredentialTransaction` event. Its payload contains the action, request and credential
identifiers, credential type, title, holder, issuer, business status, and ledger timestamp.
The Fabric adapter combines that payload with the committed event's transaction ID and
block number. Only valid, committed transactions enter the application transaction index.

The authenticated application endpoint is:

`GET /api/v2/transactions?status=approved&method=skill&page=1&pageSize=25`

It returns transactions visible to the signed-in holder or issuing enterprise. The response
contains `items`, `page`, `pageSize`, `total`, and the peer event index state. Browser login
attempts and read-only chaincode evaluations are intentionally excluded because neither is a
ledger state transition.

## Trust domain (`trust-manager`)

Chaincode name: `trust-manager`

Contract routing:

- `SynapseNet.TrustPolicyContract`: policy initialization, activation, and query.
- `SynapseNet.ParticipantTrustContract`: participant registration and query.
- `SynapseNet.IncidentContract`: incident lifecycle and credential trust query.
- `SynapseNet.ReputationContract`: reputation awards.

### `initializePolicy(policyJson)`

Bootstraps the first policy. The submitting MSP must be listed in the supplied
governance set. Lifecycle endorsement must restrict the bootstrap transaction.

### `activatePolicy(policyJson)`

Creates and activates a new immutable policy version. Requires an MSP listed in
the currently active governance policy.

### `registerParticipant(actorId, actorType, walletAddress, authoritativeMspId, intentJson, signature)`

Links one MetaMask address to an actor. The submitting Fabric identity must
belong to the authoritative MSP. The canonical intent signs the complete
parameter hash and its nonce can be used only once.

### `reportIncident(incidentJson, intentJson, signature)`

Records a misconduct allegation. The reporter must authorize the complete
incident parameter hash using its linked MetaMask wallet. Reporting does not
apply a penalty.

### `decideIncident(incidentId, decision, reasonHash)`

Requires governance MSP authorization. A confirmed decision opens the
policy-defined appeal period; it does not apply an irreversible penalty yet.

### `respondToIncident(incidentId, responseHash)`

Allows only the accused participant's authoritative MSP to respond before the
policy-defined deadline.

### `appealIncident(incidentId, intentJson, signature)`

Allows the accused participant to submit one wallet-signed appeal before the
appeal deadline.

### `finalizeIncident(incidentId, finalDecision)`

Requires governance authorization. Applies penalties only after appeal
finality. An unanswered report becomes `issuer_unresponsive`. Credential trust
projection becomes `trusted`, `issuer_unresponsive`, or `invalidated`.

### `awardReputation(actorId, performanceType, referenceId)`

Awards non-transferable REP using the active policy. The reference ID makes the
award idempotent and prevents volume farming through duplicate awards.

### Queries

- `getParticipant(actorId)`
- `getIncident(incidentId)`
- `getActivePolicy()`
- `getCredentialTrustStatus(credentialId)`
