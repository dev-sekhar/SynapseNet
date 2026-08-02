#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

PACKAGE="/channel-artifacts/${CHAINCODE_NAME}.tar.gz"
LABEL="${CHAINCODE_NAME}_${CHAINCODE_VERSION}"

# Package Chaincode-as-a-Service metadata. This avoids the legacy peer-side
# Docker builder and works with current Docker Engine releases.
cli bash -ceu "
    work=/tmp/synapsenet-ccaas
    mkdir -p \"\${work}\"
    printf \"%s\" \"{\\\"address\\\":\\\"skill-manager:9999\\\",\\\"dial_timeout\\\":\\\"10s\\\",\\\"tls_required\\\":false}\" > \"\${work}/connection.json\"
    cp -R /chaincode/skill-manager/META-INF \"\${work}/META-INF\"
    tar -C \"\${work}\" -czf \"\${work}/code.tar.gz\" connection.json META-INF
    printf \"%s\" \"{\\\"type\\\":\\\"ccaas\\\",\\\"label\\\":\\\"${LABEL}\\\"}\" > \"\${work}/metadata.json\"
    tar -C \"\${work}\" -czf \"${PACKAGE}\" metadata.json code.tar.gz
"

INSTALL_OUTPUT="$(cli peer lifecycle chaincode install "${PACKAGE}" 2>&1 || true)"
if [[ "${INSTALL_OUTPUT}" != *"already successfully installed"* ]]; then
    echo "${INSTALL_OUTPUT}"
fi

PACKAGE_ID="$(cli peer lifecycle chaincode queryinstalled |
    sed -n "s/^Package ID: \\([^,]*\\), Label: ${LABEL}$/\\1/p" | head -n 1)"
if [[ -z "${PACKAGE_ID}" ]]; then
    echo "Unable to determine installed chaincode package ID." >&2
    exit 1
fi

export CHAINCODE_ID="${PACKAGE_ID}"
export CHAINCODE_VERSION
compose rm -sf skill-manager
compose up -d --build skill-manager

cli peer lifecycle chaincode approveformyorg \
    -o orderer.synapsenet.com:7050 --tls \
    --cafile /organizations/ordererOrganizations/synapsenet.com/orderers/orderer.synapsenet.com/tls/ca.crt \
    --channelID "${CREDENTIAL_CHANNEL_NAME}" --name "${CHAINCODE_NAME}" \
    --version "${CHAINCODE_VERSION}" --package-id "${PACKAGE_ID}" \
    --sequence "${CHAINCODE_SEQUENCE}" \
    --signature-policy "${CREDENTIAL_ENDORSEMENT_POLICY}"

cli peer lifecycle chaincode commit \
    -o orderer.synapsenet.com:7050 --tls \
    --cafile /organizations/ordererOrganizations/synapsenet.com/orderers/orderer.synapsenet.com/tls/ca.crt \
    --channelID "${CREDENTIAL_CHANNEL_NAME}" --name "${CHAINCODE_NAME}" \
    --version "${CHAINCODE_VERSION}" --sequence "${CHAINCODE_SEQUENCE}" \
    --signature-policy "${CREDENTIAL_ENDORSEMENT_POLICY}" \
    --peerAddresses peer0.org1.synapsenet.com:7051 \
    --tlsRootCertFiles /organizations/peerOrganizations/org1.synapsenet.com/peers/peer0.org1.synapsenet.com/tls/ca.crt

echo "Committed ${CHAINCODE_NAME} to channel ${CREDENTIAL_CHANNEL_NAME}."
