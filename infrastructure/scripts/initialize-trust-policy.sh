#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

POLICY_FILE="${1:-blockchain/config/trust-policy.dev.json}"
if [[ ! -f "${POLICY_FILE}" ]]; then
    echo "Trust policy file not found: ${POLICY_FILE}" >&2
    exit 1
fi
POLICY="$(tr -d '\n' < "${POLICY_FILE}")"
TRUST_NAME="${TRUST_CHAINCODE_NAME:-trust-manager}"
ORDERER_CA_PATH="/organizations/ordererOrganizations/synapsenet.com/orderers/orderer.synapsenet.com/tls/ca.crt"
FUNCTION="initializePolicy"
if cli peer chaincode query -C "${TRUST_CHANNEL_NAME}" -n "${TRUST_NAME}" \
    -c '{"Args":["SynapseNet.TrustPolicyContract:getActivePolicy"]}' >/dev/null 2>&1; then
    FUNCTION="activatePolicy"
fi

cli peer chaincode invoke \
    -o orderer.synapsenet.com:7050 --tls --cafile "${ORDERER_CA_PATH}" \
    -C "${TRUST_CHANNEL_NAME}" -n "${TRUST_NAME}" \
    -c "$(jq -cn --arg function "SynapseNet.TrustPolicyContract:${FUNCTION}" --arg policy "${POLICY}" \
        '{Args:[$function,$policy]}')" \
    --waitForEvent
