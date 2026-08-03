# Phase 4: Production rollout and multi-organization validation

## Objective

Move the hardened SynapseNet implementation from a single-organization development network
to a governed, fault-tolerant consortium deployment without weakening identity, channel, or
endorsement boundaries.

## Acceptance criteria

- At least one external legal organization has an approved provisioning manifest.
- Ordering uses three TLS-authenticated Raft consenters.
- Every approved issuer joins `credentials`; only trust governors join `trust-governance`.
- Each authorized member installs and approves the exact chaincode package and definition.
- Production rejects admin fallback, password sessions, insecure cookies, placeholder
  secrets, missing actor certificates, and invalid encryption keys.
- Valid credential events and sanitized invalid transactions remain durable across restart.
- Penalty reconciliation, health/metrics, online backup, checksum, and isolated restore drill
  are operational.

## Delivered automation

| Command | Purpose |
|---|---|
| `yarn phase4:preflight` | Fail-closed validation of manifests, identity flags, channel separation, secrets, encryption key, MSP mapping, and Raft rendering. |
| `yarn phase4:validate-topology` | Generates disposable certificates and asks Fabric `configtxgen` to validate the genesis block and both channel transactions. |
| `yarn phase4:deploy-chaincodes` | Installs packages, collects each authorized MSP approval, checks readiness, and commits both domain definitions. |
| `yarn phase4:validate-isolation` | Verifies every issuer is on the credential channel and only approved governors are on the trust channel. |
| `yarn operations:restore-drill <backup>` | Verifies checksum, SQLite integrity, and expected migration revision without replacing live data. |

The topology validator uses the fictitious example manifest and disposable `/tmp` material.
It proves configuration correctness but is not evidence that a real legal entity has been
onboarded. Live rollout must consume only manifests produced by a recorded governance vote.

## Release sequence

1. Populate the deployment secret manager and MSP-to-domain JSON mapping. Give every
   organization its own `CA_BOOTSTRAP_<NORMALIZED_MSP_ID>` value; CA bootstrap secrets must
   never be shared between members.
2. Run `phase4:preflight`; do not waive failures.
3. Render and generate the governed topology, then start all three orderers and member peers.
4. Create both channels and join approved peers.
5. Run the consortium lifecycle command and inspect every readiness approval.
6. Validate channel isolation and actor-certificate authorization.
7. Start APIs and operations worker, confirm both audit streams and metrics, then exercise a
   holder submission and issuer approval across different MSPs.
8. Create an encrypted off-site backup and pass the isolated restore drill.
9. Set `RESTORE_DRILL_BACKUP` to the release backup, run `phase4:readiness`, and archive its
   output with the governance resolution. The live gate also checks event-stream health and
   both committed chaincode definitions.

## Current environment boundary

The checked-out local network remains the non-destructive Org1 development environment.
Phase 4 production automation is complete and Fabric-native topology validation passes. A
live multi-organization rollout remains intentionally gated on real approved organization
manifests, externally managed secrets, DNS, and CA custody.
