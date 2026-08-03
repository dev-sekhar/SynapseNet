# Phase 5: Continuous assurance and incident readiness

## Objective

Turn the Phase 4 production gate into a continuously observed service with actionable alerts,
explicit ownership, and repeatable incident response. Monitoring is internal-only and reads
the Fabric adapter with a bearer token supplied as a file; secrets are never stored in images.

## Delivered

- Prometheus scraping for the adapter, three Raft orderers, and the local organization peer.
- Critical alerts for target loss, event-stream failure, and loss of Raft quorum.
- Alertmanager routing through an externally supplied webhook URL file.
- Persistent metrics retention with loopback-only monitoring ports.
- Static validation of Compose, Prometheus rules, and Alertmanager configuration.
- A fail-closed gate requiring secret files, a release ID, an incident commander, and contact.
- An incident runbook covering triage, containment, recovery, and evidence retention.

## Release procedure

1. Complete `yarn phase4:readiness` using the release backup.
2. Mount files containing the adapter token and alert webhook URL outside the repository.
3. Set `RELEASE_ID`, `INCIDENT_COMMANDER`, and `INCIDENT_CONTACT` from the release record.
4. Run `yarn phase5:validate-observability` and `yarn phase5:readiness`.
5. Start monitoring with `yarn phase5:monitoring:up`.
6. Confirm every target is up and exercise a test alert, including its resolved notification.
7. Archive validation output with the governance resolution and restore evidence.

## Acceptance boundary

The repository supplies and validates the monitoring control plane. Production completion
still requires an operator-owned notification destination, named on-call personnel, a real
multi-organization deployment, and evidence from a test alert. These values are not defaulted.
