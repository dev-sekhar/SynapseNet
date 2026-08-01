#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

require_docker
mkdir -p "${NETWORK_CONFIG}/channel-artifacts"

FABRIC_TOOLS_IMAGE="hyperledger/fabric-tools:${FABRIC_VERSION:-2.5.15}"
docker run --rm \
    --user "$(id -u):$(id -g)" \
    --volume "${NETWORK_CONFIG}:/work" \
    --workdir /work \
    "${FABRIC_TOOLS_IMAGE}" \
    cryptogen generate --config=crypto-config.yaml --output=crypto-config

docker run --rm \
    --user "$(id -u):$(id -g)" \
    --volume "${NETWORK_CONFIG}:/work" \
    --workdir /work \
    -e FABRIC_CFG_PATH=/work \
    "${FABRIC_TOOLS_IMAGE}" \
    configtxgen -profile SynapseNetOrdererGenesis -channelID system-channel \
        -outputBlock channel-artifacts/genesis.block

docker run --rm \
    --user "$(id -u):$(id -g)" \
    --volume "${NETWORK_CONFIG}:/work" \
    --workdir /work \
    -e FABRIC_CFG_PATH=/work \
    "${FABRIC_TOOLS_IMAGE}" \
    configtxgen -profile SynapseNetChannel -channelID "${CHANNEL_NAME}" \
        -outputCreateChannelTx "channel-artifacts/${CHANNEL_NAME}.tx"

echo "Generated Fabric material in ${NETWORK_CONFIG}."
