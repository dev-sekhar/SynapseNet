#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

CHANNEL_BLOCK="/channel-artifacts/${CHANNEL_NAME}.block"
if cli peer channel list | grep -q "${CHANNEL_NAME}"; then
    echo "Peer is already joined to channel ${CHANNEL_NAME}."
    exit 0
fi

cli peer channel create \
    -o orderer.synapsenet.com:7050 \
    -c "${CHANNEL_NAME}" \
    -f "/channel-artifacts/${CHANNEL_NAME}.tx" \
    --outputBlock "${CHANNEL_BLOCK}" \
    --tls --cafile /organizations/ordererOrganizations/synapsenet.com/orderers/orderer.synapsenet.com/tls/ca.crt

cli peer channel join -b "${CHANNEL_BLOCK}"
echo "Created ${CHANNEL_NAME} and joined peer0.org1."
