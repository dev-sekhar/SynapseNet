#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

create_and_join() {
    local channel="$1"
    local block="/channel-artifacts/${channel}.block"
    if cli peer channel list | grep -qx "${channel}"; then
        echo "Local platform peer is already joined to ${channel}."
        return
    fi
    cli peer channel create \
        -o orderer.synapsenet.com:7050 -c "${channel}" \
        -f "/channel-artifacts/${channel}.tx" --outputBlock "${block}" \
        --tls --cafile /organizations/ordererOrganizations/synapsenet.com/orderers/orderer.synapsenet.com/tls/ca.crt
    cli peer channel join -b "${block}"
}

[[ "${CREDENTIAL_CHANNEL_NAME}" != "${TRUST_CHANNEL_NAME}" ]] || {
    echo "Production credential and trust channels must have distinct names." >&2
    exit 1
}
create_and_join "${CREDENTIAL_CHANNEL_NAME}"
create_and_join "${TRUST_CHANNEL_NAME}"
echo "Created and joined the platform peer to both domain channels."
