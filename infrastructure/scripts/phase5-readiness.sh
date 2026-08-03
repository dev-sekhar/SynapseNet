#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${PROJECT_ROOT}"

failures=0
check_file() {
    local variable="$1" label="$2"
    local value="${!variable:-}"
    if [[ -n "${value}" && -f "${value}" && -s "${value}" ]]; then
        echo "PASS: ${label}"
    else
        echo "FAIL: ${label}" >&2
        failures=$((failures + 1))
    fi
}

check_value() {
    local variable="$1" label="$2"
    if [[ -n "${!variable:-}" ]]; then
        echo "PASS: ${label}"
    else
        echo "FAIL: ${label}" >&2
        failures=$((failures + 1))
    fi
}

check_file FABRIC_ADAPTER_TOKEN_FILE "adapter scrape token is supplied as a non-empty file"
check_file ALERT_WEBHOOK_URL_FILE "alert destination is supplied as a non-empty file"
check_value INCIDENT_COMMANDER "an incident commander is assigned"
check_value INCIDENT_CONTACT "an incident escalation contact is configured"
check_value RELEASE_ID "the release has an immutable identifier"

if [[ "${failures}" -ne 0 ]]; then
    echo "Phase 5 readiness failed with ${failures} unmet requirement(s)." >&2
    exit 1
fi

echo "Phase 5 continuous-assurance readiness passed for ${RELEASE_ID}."
