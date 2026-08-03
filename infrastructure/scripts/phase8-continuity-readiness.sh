#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_ID:?Set RELEASE_ID}"
: "${RESTORE_DRILL_BACKUP:?Set RESTORE_DRILL_BACKUP}"
: "${FABRIC_SNAPSHOT_EVIDENCE:?Set FABRIC_SNAPSHOT_EVIDENCE}"
: "${KEY_RECOVERY_EVIDENCE:?Set KEY_RECOVERY_EVIDENCE}"
: "${DR_SECONDARY_SITE:?Set DR_SECONDARY_SITE}"
: "${DR_OWNER:?Set DR_OWNER}"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
maximum_age="${DR_RPO_SECONDS:-86400}"
recovery_target="${DR_RTO_SECONDS:-14400}"
[[ "${maximum_age}" =~ ^[1-9][0-9]*$ ]] || { echo "DR_RPO_SECONDS must be positive." >&2; exit 2; }
[[ "${recovery_target}" =~ ^[1-9][0-9]*$ ]] || { echo "DR_RTO_SECONDS must be positive." >&2; exit 2; }

for evidence in "${RESTORE_DRILL_BACKUP}" "${RESTORE_DRILL_BACKUP}.sha256" \
    "${FABRIC_SNAPSHOT_EVIDENCE}" "${KEY_RECOVERY_EVIDENCE}"; do
    [[ -s "${evidence}" ]] || { echo "Missing continuity evidence: ${evidence}" >&2; exit 1; }
done

now="$(date +%s)"
modified="$(stat -c %Y "${RESTORE_DRILL_BACKUP}")"
age=$((now - modified))
if ((age > maximum_age)); then
    echo "Application backup is ${age}s old, exceeding the ${maximum_age}s RPO." >&2
    exit 1
fi

"${PROJECT_ROOT}/infrastructure/scripts/restore-drill.sh" "${RESTORE_DRILL_BACKUP}"
echo "Phase 8 continuity readiness passed for ${RELEASE_ID}; RPO=${maximum_age}s, RTO=${recovery_target}s, secondary=${DR_SECONDARY_SITE}, owner=${DR_OWNER}."
