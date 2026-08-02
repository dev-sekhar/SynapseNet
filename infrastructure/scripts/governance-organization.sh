#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

ACTION="${1:-}"
APPLICATION_ID="${2:-}"
API_URL="${SYNAPSENET_API_URL:-http://localhost:8000}"
TOKEN="${GOVERNANCE_TOKEN:?Set GOVERNANCE_TOKEN to the governance API secret}"
APPROVED_DIR="${PROJECT_ROOT}/blockchain/consortium/approved"

case "${ACTION}" in
    list)
        curl --fail --silent --show-error \
            -H "X-Governance-Token: ${TOKEN}" \
            "${API_URL}/api/v2/internal/organizations/applications?status=pending_governance" | jq .
        ;;
    approve|reject)
        [[ -n "${APPLICATION_ID}" ]] || { echo "Application ID is required." >&2; exit 2; }
        REASON="${GOVERNANCE_REASON:?Set GOVERNANCE_REASON to the recorded decision reason}"
        REFERENCE="${GOVERNANCE_REFERENCE:?Set GOVERNANCE_REFERENCE to the resolution identifier}"
        JOIN_TRUST="${JOIN_TRUST_CHANNEL:-false}"
        REVIEWERS="${REVIEWER_IDS:-}"
        [[ "${ACTION}" == "reject" || -n "${REVIEWERS}" ]] || {
            echo "Set REVIEWER_IDS to a comma-separated reviewer identity list." >&2; exit 2;
        }
        RESPONSE="$(curl --fail --silent --show-error -X POST \
            -H "Content-Type: application/json" -H "X-Governance-Token: ${TOKEN}" \
            "${API_URL}/api/v2/internal/organizations/applications/${APPLICATION_ID}/decision" \
            -d "$(jq -cn --arg decision "${ACTION/approve/approve}" --arg reason "${REASON}" \
                --arg reference "${REFERENCE}" --argjson joinTrust "${JOIN_TRUST}" \
                --arg reviewers "${REVIEWERS}" \
                '{decision:$decision,reason:$reason,governanceReference:$reference,joinTrustChannel:$joinTrust,reviewerIds:($reviewers|split(",")|map(select(length>0)))}')")"
        jq . <<<"${RESPONSE}"
        if [[ "${ACTION}" == "approve" ]]; then
            mkdir -p "${APPROVED_DIR}"
            MSP_ID="$(jq -r '.provisioningManifest.fabric.mspId' <<<"${RESPONSE}")"
            [[ "${MSP_ID}" =~ ^[A-Za-z][A-Za-z0-9]{2,63}MSP$ ]] || {
                echo "Approval response contained an invalid MSP ID." >&2; exit 1;
            }
            jq '.provisioningManifest' <<<"${RESPONSE}" > "${APPROVED_DIR}/${MSP_ID}.json"
            echo "Saved approved manifest to blockchain/consortium/approved/${MSP_ID}.json"
        fi
        ;;
    render)
        python3 "${PROJECT_ROOT}/infrastructure/scripts/render-consortium-config.py" \
            --approved-dir "${APPROVED_DIR}" \
            --output-dir "${PROJECT_ROOT}/blockchain/network/generated"
        ;;
    *)
        echo "Usage: $0 list | approve <application-id> | reject <application-id> | render" >&2
        exit 2
        ;;
esac
