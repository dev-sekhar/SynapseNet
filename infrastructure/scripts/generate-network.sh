#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

require_docker
mkdir -p "${NETWORK_CONFIG}/channel-artifacts"

FABRIC_TOOLS_IMAGE="hyperledger/fabric-tools:${FABRIC_VERSION:-2.5.15}"
CRYPTO_CONFIG="crypto-config.yaml"
CONFIGTX_PATH="/work"
GENESIS_PROFILE="SynapseNetOrdererGenesis"
if [[ "${CONSORTIUM_MODE:-false}" == "true" ]]; then
    python3 "${PROJECT_ROOT}/infrastructure/scripts/render-consortium-config.py" \
        --approved-dir "${PROJECT_ROOT}/blockchain/consortium/approved" \
        --output-dir "${NETWORK_CONFIG}/generated"
    CRYPTO_CONFIG="generated/crypto-config.yaml"
    CONFIGTX_PATH="/work/generated"
    GENESIS_PROFILE="SynapseNetConsortiumGenesis"
fi
docker run --rm \
    --user "$(id -u):$(id -g)" \
    --volume "${NETWORK_CONFIG}:/work" \
    --workdir /work \
    "${FABRIC_TOOLS_IMAGE}" \
    cryptogen generate --config="${CRYPTO_CONFIG}" --output=crypto-config

if [[ "${CONSORTIUM_MODE:-false}" == "true" ]]; then
    shopt -s nullglob
    for manifest in "${PROJECT_ROOT}"/blockchain/consortium/approved/*.json; do
        "${PROJECT_ROOT}/infrastructure/scripts/enroll-consortium-organization.sh" "${manifest}"
    done
fi

docker run --rm \
    --user "$(id -u):$(id -g)" \
    --volume "${NETWORK_CONFIG}:/work" \
    --workdir /work \
    -e FABRIC_CFG_PATH="${CONFIGTX_PATH}" \
    "${FABRIC_TOOLS_IMAGE}" \
    configtxgen -profile "${GENESIS_PROFILE}" -channelID system-channel \
        -outputBlock channel-artifacts/genesis.block

if [[ "${CONSORTIUM_MODE:-false}" == "true" ]]; then
    for definition in \
        "SynapseNetCredentialsChannel:${CREDENTIAL_CHANNEL_NAME}" \
        "SynapseNetTrustChannel:${TRUST_CHANNEL_NAME}"; do
        profile="${definition%%:*}"
        channel="${definition#*:}"
        docker run --rm --user "$(id -u):$(id -g)" \
            --volume "${NETWORK_CONFIG}:/work" --workdir /work \
            -e FABRIC_CFG_PATH="${CONFIGTX_PATH}" "${FABRIC_TOOLS_IMAGE}" \
            configtxgen -profile "${profile}" -channelID "${channel}" \
                -outputCreateChannelTx "channel-artifacts/${channel}.tx"
    done
else
    docker run --rm \
        --user "$(id -u):$(id -g)" \
        --volume "${NETWORK_CONFIG}:/work" \
        --workdir /work \
        -e FABRIC_CFG_PATH=/work \
        "${FABRIC_TOOLS_IMAGE}" \
        configtxgen -profile SynapseNetChannel -channelID "${CHANNEL_NAME}" \
            -outputCreateChannelTx "channel-artifacts/${CHANNEL_NAME}.tx"
fi

echo "Generated Fabric material in ${NETWORK_CONFIG}."
