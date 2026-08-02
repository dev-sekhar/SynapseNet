#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

require_docker

invoke_open_wallet() {
    local owner_id="$1"
    local owner_type="$2"
    cli peer chaincode invoke \
        -o orderer.synapsenet.com:7050 --tls \
        --cafile /organizations/ordererOrganizations/synapsenet.com/orderers/orderer.synapsenet.com/tls/ca.crt \
        -C "${CHANNEL_NAME}" -n "${CHAINCODE_NAME}" \
        --peerAddresses peer0.org1.synapsenet.com:7051 \
        --tlsRootCertFiles /organizations/peerOrganizations/org1.synapsenet.com/peers/peer0.org1.synapsenet.com/tls/ca.crt \
        -c "{\"function\":\"SynapseNet.WalletContract:openWallet\",\"Args\":[\"${owner_id}\",\"${owner_type}\"]}" \
        >/dev/null
    echo "Initialized ${owner_type} wallet: ${owner_id}"
}

USERS_JSON="$(cli peer chaincode query -C "${CHANNEL_NAME}" -n "${CHAINCODE_NAME}" \
    -c '{"function":"SynapseNet.IdentityContract:getUsers","Args":[]}')"
ENTERPRISES_JSON="$(cli peer chaincode query -C "${CHANNEL_NAME}" -n "${CHAINCODE_NAME}" \
    -c '{"function":"SynapseNet.IdentityContract:getEnterprises","Args":[]}')"

mapfile -t USER_IDS < <(jq -r '.[].userId' <<<"${USERS_JSON}")
for user_id in "${USER_IDS[@]}"; do
    invoke_open_wallet "${user_id}" user
done

mapfile -t ENTERPRISE_IDS < <(jq -r '.[].enterpriseId' <<<"${ENTERPRISES_JSON}")
for enterprise_id in "${ENTERPRISE_IDS[@]}"; do
    invoke_open_wallet "${enterprise_id}" enterprise
done

echo "All registered participant wallets are initialized."
