#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

APPROVED_DIR="${PROJECT_ROOT}/blockchain/consortium/approved"
ORDERER_CA="${NETWORK_CONFIG}/crypto-config/ordererOrganizations/synapsenet.com/orderers/orderer.synapsenet.com/tls/ca.crt"

join_peer() {
    local manifest="$1" channel="$2"
    local domain msp_id peer block
    domain="$(jq -r '.fabric.domain' "${manifest}")"
    msp_id="$(jq -r '.fabric.mspId' "${manifest}")"
    peer="$(jq -r '.fabric.peer' "${manifest}")"
    block="${NETWORK_CONFIG}/channel-artifacts/${channel}.block"
    [[ -f "${block}" ]] || { echo "Missing channel block: ${block}" >&2; return 1; }

    docker run --rm --network synapsenet_test \
        -e CORE_PEER_LOCALMSPID="${msp_id}" \
        -e CORE_PEER_MSPCONFIGPATH="/organizations/peerOrganizations/${domain}/users/Admin@${domain}/msp" \
        -e CORE_PEER_ADDRESS="${peer}:7051" \
        -e CORE_PEER_TLS_ENABLED=true \
        -e CORE_PEER_TLS_ROOTCERT_FILE="/organizations/peerOrganizations/${domain}/peers/${peer}/tls/ca.crt" \
        -v "${NETWORK_CONFIG}/crypto-config:/organizations:ro" \
        -v "${NETWORK_CONFIG}/channel-artifacts:/channel-artifacts:ro" \
        hyperledger/fabric-tools:${FABRIC_VERSION:-2.5.15} \
        peer channel join -b "/channel-artifacts/${channel}.block"
    echo "Joined ${peer} (${msp_id}) to ${channel}."
}

shopt -s nullglob
manifests=("${APPROVED_DIR}"/*.json)
for manifest in "${manifests[@]}"; do
    join_peer "${manifest}" "${CREDENTIAL_CHANNEL_NAME}"
    if [[ "$(jq -r '.fabric.channels.trust // empty' "${manifest}")" == "${TRUST_CHANNEL_NAME}" ]]; then
        join_peer "${manifest}" "${TRUST_CHANNEL_NAME}"
    fi
done
echo "Joined all approved consortium peers to their governed domain channels."
