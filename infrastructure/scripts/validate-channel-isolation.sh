#!/usr/bin/env bash
set -euo pipefail
export CONSORTIUM_MODE=true
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

check_peer() {
    local manifest="$1" domain msp peer channels expects_trust
    domain="$(jq -r '.fabric.domain' "${manifest}")"
    msp="$(jq -r '.fabric.mspId' "${manifest}")"
    peer="$(jq -r '.fabric.peer' "${manifest}")"
    channels="$(docker run --rm --network synapsenet_test \
      -e CORE_PEER_LOCALMSPID="${msp}" \
      -e CORE_PEER_MSPCONFIGPATH="/organizations/peerOrganizations/${domain}/users/Admin@${domain}/msp" \
      -e CORE_PEER_ADDRESS="${peer}:7051" -e CORE_PEER_TLS_ENABLED=true \
      -e CORE_PEER_TLS_ROOTCERT_FILE="/organizations/peerOrganizations/${domain}/peers/${peer}/tls/ca.crt" \
      -v "${NETWORK_CONFIG}/crypto-config:/organizations:ro" \
      hyperledger/fabric-tools:${FABRIC_VERSION:-2.5.15} peer channel list)"
    grep -qx "${CREDENTIAL_CHANNEL_NAME}" <<<"${channels}" || { echo "${msp} is missing credential channel" >&2; exit 1; }
    expects_trust="$(jq -r '.fabric.channels.trust // empty' "${manifest}")"
    if [[ "${expects_trust}" == "${TRUST_CHANNEL_NAME}" ]]; then
        grep -qx "${TRUST_CHANNEL_NAME}" <<<"${channels}" || { echo "${msp} is missing trust channel" >&2; exit 1; }
    elif grep -qx "${TRUST_CHANNEL_NAME}" <<<"${channels}"; then
        echo "${msp} joined trust channel without governance approval" >&2; exit 1
    fi
    echo "Validated channel isolation for ${msp}."
}

shopt -s nullglob
manifests=("${PROJECT_ROOT}"/blockchain/consortium/approved/*.json)
((${#manifests[@]} > 0)) || { echo "No approved external organizations to validate" >&2; exit 1; }
for manifest in "${manifests[@]}"; do check_peer "${manifest}"; done
