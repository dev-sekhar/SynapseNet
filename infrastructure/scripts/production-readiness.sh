#!/usr/bin/env bash
set -euo pipefail
export CONSORTIUM_MODE=true
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

MODE="${1:-config}"
APPROVED_DIR="${CONSORTIUM_APPROVED_DIR:-${PROJECT_ROOT}/blockchain/consortium/approved}"
failures=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*" >&2; failures=$((failures + 1)); }

secret() {
    local name="$1" value="${!1:-}"
    if [[ ${#value} -lt 24 || "${value}" =~ (local|change-me|replace|password) ]]; then
        fail "${name} must be a non-placeholder secret of at least 24 characters"
    else
        pass "${name} is configured"
    fi
}

[[ "${CREDENTIAL_CHANNEL_NAME}" != "${TRUST_CHANNEL_NAME}" ]] && pass "domain channels are distinct" || fail "domain channels must be distinct"
[[ "${REQUIRE_CALLER_IDENTITY:-}" == true ]] && pass "caller certificates are required" || fail "set REQUIRE_CALLER_IDENTITY=true"
[[ "${REQUIRE_WALLET_FOR_CREDENTIALS:-}" == true ]] && pass "wallet verification is required" || fail "set REQUIRE_WALLET_FOR_CREDENTIALS=true"
[[ "${ALLOW_LEGACY_BUSINESS_SESSIONS:-}" == false ]] && pass "legacy password sessions are disabled" || fail "set ALLOW_LEGACY_BUSINESS_SESSIONS=false"
[[ "${SYNAPSENET_COOKIE_SECURE:-}" == true ]] && pass "secure cookies are enabled" || fail "set SYNAPSENET_COOKIE_SECURE=true"
for name in FABRIC_ADAPTER_TOKEN SESSION_SECRET SYNAPSENET_ENCRYPTION_KEY PENALTY_EXECUTOR_TOKEN GOVERNANCE_TOKEN OPERATIONS_TOKEN ACTOR_ENROLLMENT_SECRET COUCHDB_PASSWORD; do secret "${name}"; done
if python3 -c 'import base64,os; assert len(base64.urlsafe_b64decode(os.environ["SYNAPSENET_ENCRYPTION_KEY"])) == 32' 2>/dev/null; then
    pass "SYNAPSENET_ENCRYPTION_KEY encodes exactly 32 bytes"
else
    fail "SYNAPSENET_ENCRYPTION_KEY must be URL-safe base64 for exactly 32 bytes"
fi

shopt -s nullglob
manifests=("${APPROVED_DIR}"/*.json)
msp_domains="${FABRIC_MSP_DOMAINS_JSON:-}"
[[ -n "${msp_domains}" ]] || msp_domains='{}'
if ((${#manifests[@]} >= 1)); then pass "at least one external consortium organization is approved"; else fail "approve at least one external organization"; fi
for manifest in "${manifests[@]}"; do
    if jq -e '.schemaVersion == "1" and .fabric.mspId and .fabric.domain and (.fabric.enrollment.reviewerIds | length > 0)' "${manifest}" >/dev/null; then
        pass "$(basename "${manifest}") has required governed identity fields"
    else
        fail "$(basename "${manifest}") is incomplete"
    fi
    msp="$(jq -r '.fabric.mspId' "${manifest}")"
    ca_secret="CA_BOOTSTRAP_$(tr '[:lower:]-.' '[:upper:]__' <<<"${msp}")"
    secret "${ca_secret}"
    secret "PEER_ENROLLMENT_$(tr '[:lower:]-.' '[:upper:]__' <<<"${msp}")"
    secret "REVIEWER_ENROLLMENT_$(tr '[:lower:]-.' '[:upper:]__' <<<"${msp}")"
    if jq -e --arg msp "${msp}" 'has($msp)' <<<"${msp_domains}" >/dev/null 2>&1; then
        pass "adapter domain mapping contains ${msp}"
    else
        fail "FABRIC_MSP_DOMAINS_JSON is missing ${msp}"
    fi
done

READINESS_OUTPUT="${TMPDIR:-/tmp}/synapsenet-phase4-readiness"
mkdir -p "${READINESS_OUTPUT}"
python3 "${PROJECT_ROOT}/infrastructure/scripts/render-consortium-config.py" \
  --approved-dir "${APPROVED_DIR}" --output-dir "${READINESS_OUTPUT}" >/dev/null
grep -q 'orderer3.synapsenet.com' "${READINESS_OUTPUT}/configtx.yaml" && pass "three-node Raft consenters rendered" || fail "three-node Raft topology was not rendered"

if [[ "${MODE}" == live ]]; then
    for service in orderer.synapsenet.com orderer2.synapsenet.com orderer3.synapsenet.com peer0.org1.synapsenet.com fabric-adapter application-api operations-worker; do
        if network_compose ps --services --filter status=running | grep -qx "${service}"; then pass "${service} is running"; else fail "${service} is not running"; fi
    done
    curl --fail --silent --output /dev/null http://localhost:8000/docs && pass "application API is reachable" || fail "application API is unavailable"
    if network_compose exec -T fabric-adapter node -e "fetch('http://127.0.0.1:3010/health',{headers:{Authorization:'Bearer '+process.env.FABRIC_ADAPTER_TOKEN}}).then(r=>process.exit(r.ok?0:1))"; then
        pass "durable Fabric event streams are healthy"
    else
        fail "Fabric audit/event streams are unhealthy"
    fi
    cli peer lifecycle chaincode querycommitted -C "${CREDENTIAL_CHANNEL_NAME}" -n "${CHAINCODE_NAME}" >/dev/null \
      && pass "credential chaincode is committed" || fail "credential chaincode is not committed"
    cli peer lifecycle chaincode querycommitted -C "${TRUST_CHANNEL_NAME}" -n "${TRUST_CHAINCODE_NAME:-trust-manager}" >/dev/null \
      && pass "trust chaincode is committed" || fail "trust chaincode is not committed"
    if [[ -n "${RESTORE_DRILL_BACKUP:-}" ]] && "${PROJECT_ROOT}/infrastructure/scripts/restore-drill.sh" "${RESTORE_DRILL_BACKUP}" >/dev/null; then
        pass "backup restore drill passed"
    else
        fail "set RESTORE_DRILL_BACKUP to a checksummed backup that passes the restore drill"
    fi
fi

if ((failures)); then echo "Phase 4 readiness failed with ${failures} issue(s)." >&2; exit 1; fi
echo "Phase 4 ${MODE} readiness passed."
