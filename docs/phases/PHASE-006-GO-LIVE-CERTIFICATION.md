# Phase 6: Performance, resilience, and go-live certification

## Objective

Demonstrate that a release meets its response-time objective, preserves Fabric availability
during one ordering-node failure, and has a tamper-evident evidence set before go-live.

## Delivered

- A k6 constant-arrival-rate test against the read-only application health endpoint.
- Default thresholds of less than 1% failed requests, p95 below 500 ms, p99 below one second,
  and more than 99% successful checks. Rate and duration are configurable.
- A deliberately guarded drill that stops only `orderer2`, verifies two-node Raft quorum and
  both channels, and restores the node through normal exit and signal traps.
- A release evidence builder that records the Git commit, UTC creation time, file size, and
  SHA-256 digest for every approval and test artifact.
- A verifier that detects missing, changed, empty, or release-ID-mismatched evidence.
- A final gate requiring Phase 4 readiness, Phase 5 readiness, load-test, and resilience artifacts.

## Certification procedure

```bash
export RELEASE_ID=release-2026-08-03.1
PHASE6_DURATION=10m PHASE6_REQUEST_RATE=50 yarn phase6:load-test
CONFIRM_RESILIENCE_DRILL=orderer2.synapsenet.com \
  yarn phase6:resilience-drill | tee reports/phase6-resilience.txt
yarn phase6:evidence --release-id "$RELEASE_ID" \
  --output reports/phase6-release-evidence.json \
  reports/phase4-readiness.txt reports/phase5-readiness.txt \
  reports/phase6-load.json reports/phase6-resilience.txt
PHASE6_EVIDENCE_MANIFEST=reports/phase6-release-evidence.json yarn phase6:readiness
```

Run the resilience drill only in an approved maintenance or pre-production window. The
confirmation value is intentionally exact, and the script refuses to proceed unless the target
starts healthy. Do not broaden the drill to simultaneous orderer failures.

## Acceptance boundary

The tooling and automated tests are complete. Final certification requires running against the
real consortium under representative traffic, executing the approved controlled-failure drill,
and obtaining release authority approval for the resulting evidence manifest.
