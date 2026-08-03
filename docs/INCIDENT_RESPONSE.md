# Incident response runbook

## Severity and ownership

- **Critical:** Raft quorum loss, event-stream failure, suspected key compromise, or unauthorized
  credential mutation. Page the incident commander immediately.
- **High:** one orderer or peer unavailable, reconciliation repeatedly failing, or restore evidence
  stale. Investigate within the agreed operational response window.
- **Advisory:** a capacity or maintenance condition without current correctness impact.

Every record must name the commander, UTC start/end times, affected MSPs and channels, release
ID, transaction IDs where applicable, decisions, and retained evidence.

## Triage

1. Acknowledge the alert and establish an incident channel.
2. Inspect target health and the alert expression; do not infer ledger failure from a UI symptom.
3. Capture container status and bounded logs for affected services.
4. Query adapter health with its bearer token and compare both event streams.
5. Determine whether Fabric finality is intact before accepting new writes.

## Containment

- For identity compromise, revoke the affected CA identity and stop traffic signed by it.
- For loss of audit visibility, pause credential-changing traffic until projections recover.
- For one failed orderer, preserve the remaining quorum and repair only the failed member.
- Never delete volumes, regenerate production crypto, or lower endorsement policies as a shortcut.

## Recovery and closure

1. Restore the smallest affected component from approved configuration or a checked backup.
2. Verify all orderer targets, authorized peers, and both event streams.
3. Re-run `yarn phase4:readiness` and `yarn phase5:readiness`.
4. Reconcile penalties and compare ledger transactions with the durable audit projection.
5. Exercise a credential flow across two MSPs before reopening writes.
6. Retain the alert timeline, sanitized logs, transaction IDs, configuration hashes, readiness
   output, and recovery proof. Record corrective actions and rotate possibly exposed secrets.
