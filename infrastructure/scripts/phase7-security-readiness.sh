#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_ID:?Set RELEASE_ID}"
: "${PHASE7_SBOM:?Set PHASE7_SBOM to the CycloneDX JSON report}"
: "${PHASE7_VULNERABILITY_REPORT:?Set PHASE7_VULNERABILITY_REPORT}"
: "${PHASE7_CODEQL_REPORT:?Set PHASE7_CODEQL_REPORT}"
: "${PHASE7_SECRET_SCAN_REPORT:?Set PHASE7_SECRET_SCAN_REPORT}"

for report in "${PHASE7_SBOM}" "${PHASE7_VULNERABILITY_REPORT}" "${PHASE7_CODEQL_REPORT}" "${PHASE7_SECRET_SCAN_REPORT}"; do
    [[ -s "${report}" ]] || { echo "Missing or empty security evidence: ${report}" >&2; exit 1; }
done

jq -e '.bomFormat == "CycloneDX" and (.components | type == "array")' "${PHASE7_SBOM}" >/dev/null || {
    echo "The SBOM is not valid CycloneDX JSON." >&2
    exit 1
}

if jq -e '[.Results[]?.Vulnerabilities[]? | select(.Severity == "HIGH" or .Severity == "CRITICAL")] | length > 0' \
    "${PHASE7_VULNERABILITY_REPORT}" >/dev/null; then
    echo "Unresolved high or critical vulnerabilities remain." >&2
    exit 1
fi

echo "Phase 7 security evidence passed for ${RELEASE_ID}."
