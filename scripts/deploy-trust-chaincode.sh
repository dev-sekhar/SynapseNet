#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

TRUST_NAME="${TRUST_CHAINCODE_NAME:-trust-manager}"
TRUST_VERSION="${TRUST_CHAINCODE_VERSION:-1.0}"
TRUST_SEQUENCE="${TRUST_CHAINCODE_SEQUENCE:-1}"
LABEL="${TRUST_NAME}_${TRUST_VERSION}"
PACKAGE="/channel-artifacts/${TRUST_NAME}.tar.gz"
ORDERER_CA_PATH="/organizations/ordererOrganizations/synapsenet.com/orderers/orderer.synapsenet.com/tls/ca.crt"

yarn workspace trust-manager build

cli bash -ceu "
    work=/tmp/synapsenet-trust-ccaas
    mkdir -p \"\${work}\"
    printf \"%s\" '{\"address\":\"trust-manager:9998\",\"dial_timeout\":\"10s\",\"tls_required\":false}' > \"\${work}/connection.json\"
    cp -R /chaincode/trust-manager/META-INF \"\${work}/META-INF\"
    tar -C \"\${work}\" -czf \"\${work}/code.tar.gz\" connection.json META-INF
    printf \"%s\" '{\"type\":\"ccaas\",\"label\":\"${LABEL}\"}' > \"\${work}/metadata.json\"
    tar -C \"\${work}\" -czf \"${PACKAGE}\" metadata.json code.tar.gz
"

INSTALL_OUTPUT="$(cli peer lifecycle chaincode install "${PACKAGE}" 2>&1 || true)"
if [[ "${INSTALL_OUTPUT}" != *"already successfully installed"* ]]; then
    echo "${INSTALL_OUTPUT}"
fi
PACKAGE_ID="$(cli peer lifecycle chaincode queryinstalled |
    sed -n "s/^Package ID: \\([^,]*\\), Label: ${LABEL}$/\\1/p" | head -n 1)"
if [[ -z "${PACKAGE_ID}" ]]; then
    echo "Unable to determine trust-manager package ID." >&2
    exit 1
fi

export TRUST_CHAINCODE_ID="${PACKAGE_ID}"
export TRUST_CHAINCODE_VERSION="${TRUST_VERSION}"
compose rm -sf trust-manager
compose up -d --build trust-manager

cli peer lifecycle chaincode approveformyorg \
    -o orderer.synapsenet.com:7050 --tls \
    --cafile "${ORDERER_CA_PATH}" --channelID "${CHANNEL_NAME}" \
    --name "${TRUST_NAME}" --version "${TRUST_VERSION}" \
    --package-id "${PACKAGE_ID}" --sequence "${TRUST_SEQUENCE}" \
    --signature-policy "${ENDORSEMENT_POLICY}"

cli peer lifecycle chaincode commit \
    -o orderer.synapsenet.com:7050 --tls \
    --cafile "${ORDERER_CA_PATH}" --channelID "${CHANNEL_NAME}" \
    --name "${TRUST_NAME}" --version "${TRUST_VERSION}" \
    --sequence "${TRUST_SEQUENCE}" \
    --signature-policy "${ENDORSEMENT_POLICY}" \
    --peerAddresses peer0.org1.synapsenet.com:7051 \
    --tlsRootCertFiles /organizations/peerOrganizations/org1.synapsenet.com/peers/peer0.org1.synapsenet.com/tls/ca.crt

echo "Committed ${TRUST_NAME} to ${CHANNEL_NAME}."
