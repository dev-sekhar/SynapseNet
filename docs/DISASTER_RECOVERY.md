# Disaster recovery plan

## Recovery objectives

Production owners set `DR_RPO_SECONDS` and `DR_RTO_SECONDS` explicitly. Defaults are a 24-hour
recovery point and four-hour recovery time, but consortium policy may require stricter values.

## Protected assets

- Checksummed identity API SQLite backups and every referenced encryption-key version.
- Fabric peer snapshots for both credential and trust-governance channels.
- Ordering and channel configuration, approved organization manifests, lifecycle definitions,
  and externally escrowed CA material.
- Phase 4 through Phase 9 evidence and governance resolutions.

## Recovery order

1. Establish the secondary site and restore secret-manager/CA access under dual control.
2. Recover ordering quorum and verify channel configuration hashes.
3. Restore authorized peers from verified snapshots and allow them to catch up.
4. Restore the application database into isolation and pass integrity/migration checks.
5. Start the adapter and confirm both durable event projections catch up to ledger height.
6. Start APIs without public writes, reconcile pending directives, then run readiness gates.
7. Execute cross-MSP credential and sharing probes before reopening traffic.

Never restore an application database without its encryption-key versions, replace live ledger
data during a drill, or use development cryptographic material in recovery.
