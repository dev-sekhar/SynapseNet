#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

SUFFIX="$(date +%s)"
USER_ID="smoke-user-${SUFFIX}"
ENTERPRISE_ID="smoke-enterprise-${SUFFIX}"
REVIEWER_ID="smoke-reviewer-${SUFFIX}"
REQUEST_ID="smoke-request-${SUFFIX}"
TITLE="Fabric Credential ${SUFFIX}"
HASH="$(printf 'a%.0s' {1..64})"

invoke() {
    cli peer chaincode invoke \
        -o orderer.synapsenet.com:7050 --tls \
        --cafile /organizations/ordererOrganizations/synapsenet.com/orderers/orderer.synapsenet.com/tls/ca.crt \
        -C "${CHANNEL_NAME}" -n "${CHAINCODE_NAME}" \
        --peerAddresses peer0.org1.synapsenet.com:7051 \
        --tlsRootCertFiles /organizations/peerOrganizations/org1.synapsenet.com/peers/peer0.org1.synapsenet.com/tls/ca.crt \
        --waitForEvent --waitForEventTimeout 30s \
        -c "$1"
}

invoke "{\"function\":\"SynapseNet.IdentityContract:registerUser\",\"Args\":[\"${USER_ID}\",\"Smoke Test User\"]}"
invoke "{\"function\":\"SynapseNet.IdentityContract:registerEnterprise\",\"Args\":[\"${ENTERPRISE_ID}\",\"Smoke Test Enterprise\",\"${REVIEWER_ID}\"]}"

PAYLOAD="{\"requestId\":\"${REQUEST_ID}\",\"userId\":\"${USER_ID}\",\"enterpriseId\":\"${ENTERPRISE_ID}\",\"credentialType\":\"skill\",\"title\":\"${TITLE}\",\"details\":{\"proficiencyLevel\":\"Advanced\",\"yearsExperience\":3.5,\"practicalApplication\":\"Validated the end-to-end credential workflow.\",\"tools\":[\"Hyperledger Fabric\"],\"lastUsed\":\"2026-08\",\"attestations\":[]},\"evidence\":[{\"evidenceId\":\"evidence-${SUFFIX}\",\"documentType\":\"Certificate\",\"fileName\":\"smoke.pdf\",\"contentHash\":\"sha256:${HASH}\",\"storageProvider\":\"test\"}]}"
invoke "{\"function\":\"SynapseNet.CredentialContract:submitCredentialRequest\",\"Args\":[$(printf '%s' "${PAYLOAD}" | jq -Rs .)]}"
invoke "{\"function\":\"SynapseNet.CredentialContract:reviewCredentialRequest\",\"Args\":[\"${REQUEST_ID}\",\"${REVIEWER_ID}\",\"approve\",\"Smoke test evidence verified\"]}"

RESULT="$(cli peer chaincode query -C "${CHANNEL_NAME}" -n "${CHAINCODE_NAME}" \
    -c "{\"function\":\"SynapseNet.CredentialContract:getWallet\",\"Args\":[\"${USER_ID}\"]}")"
grep -q "${TITLE}" <<<"${RESULT}"
echo "Credential workflow smoke test passed: ${RESULT}"
