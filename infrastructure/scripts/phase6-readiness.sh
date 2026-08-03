#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_ID:?Set RELEASE_ID to the immutable release identifier}"
: "${PHASE6_EVIDENCE_MANIFEST:?Set PHASE6_EVIDENCE_MANIFEST to the release evidence JSON}"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
python3 "${PROJECT_ROOT}/infrastructure/scripts/verify-release-evidence.py" \
    --release-id "${RELEASE_ID}" "${PHASE6_EVIDENCE_MANIFEST}"

required_names=(phase4-readiness phase5-readiness phase6-load phase6-resilience)
for required in "${required_names[@]}"; do
    if ! jq -e --arg required "${required}" \
        '.artifacts | any(.path | contains($required))' "${PHASE6_EVIDENCE_MANIFEST}" >/dev/null; then
        echo "Release evidence is missing ${required}." >&2
        exit 1
    fi
done

echo "Phase 6 go-live evidence is complete for ${RELEASE_ID}."
