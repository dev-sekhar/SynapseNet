#!/usr/bin/env bash
set -euo pipefail
export CONSORTIUM_MODE=true
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

APPROVED_DIR="${PROJECT_ROOT}/blockchain/consortium/approved"
ORDERER_CA="/organizations/ordererOrganizations/synapsenet.com/orderers/orderer.synapsenet.com/tls/ca.crt"
TOOLS="hyperledger/fabric-tools:${FABRIC_VERSION:-2.5.15}"
shopt -s nullglob
ALL_MANIFESTS=("${APPROVED_DIR}"/*.json)

run_org_peer() {
    local manifest="$1" channel="$2"; shift 2
    local domain msp peer channel_args=()
    domain="$(jq -r '.fabric.domain' "${manifest}")"
    msp="$(jq -r '.fabric.mspId' "${manifest}")"
    peer="$(jq -r '.fabric.peer' "${manifest}")"
    [[ -n "${channel}" ]] && channel_args=(--channelID "${channel}")
    docker run --rm --network synapsenet_test \
      -e CORE_PEER_LOCALMSPID="${msp}" \
      -e CORE_PEER_MSPCONFIGPATH="/organizations/peerOrganizations/${domain}/users/Admin@${domain}/msp" \
      -e CORE_PEER_ADDRESS="${peer}:7051" -e CORE_PEER_TLS_ENABLED=true \
      -e CORE_PEER_TLS_ROOTCERT_FILE="/organizations/peerOrganizations/${domain}/peers/${peer}/tls/ca.crt" \
      -v "${NETWORK_CONFIG}/crypto-config:/organizations:ro" \
      -v "${NETWORK_CONFIG}/channel-artifacts:/channel-artifacts" \
      "${TOOLS}" peer lifecycle chaincode "$@" "${channel_args[@]}"
}

package_ccaas() {
    local name="$1" version="$2" service="$3" source="$4"
    local label="${name}_${version}"
    cli bash -ceu "
      work=/tmp/${name}-consortium-ccaas
      mkdir -p \"\${work}\"
      printf '%s' '{\"address\":\"${service}\",\"dial_timeout\":\"10s\",\"tls_required\":false}' > \"\${work}/connection.json\"
      cp -R /chaincode/${source}/META-INF \"\${work}/META-INF\"
      tar -C \"\${work}\" -czf \"\${work}/code.tar.gz\" connection.json META-INF
      printf '%s' '{\"type\":\"ccaas\",\"label\":\"${label}\"}' > \"\${work}/metadata.json\"
      tar -C \"\${work}\" -czf /channel-artifacts/${name}.tar.gz metadata.json code.tar.gz
    "
}

deploy_domain() {
    local name="$1" version="$2" sequence="$3" channel="$4" policy="$5" service="$6" source="$7" trust_only="$8"
    local package="/channel-artifacts/${name}.tar.gz" package_id readiness msp
    local manifests=() peer_args=() expected_msps=(Org1MSP)
    package_ccaas "${name}" "${version}" "${service}" "${source}"
    package_id="$(cli peer lifecycle chaincode calculatepackageid "${package}")"
    cli peer lifecycle chaincode install "${package}" >/dev/null 2>&1 || true
    if ! cli peer lifecycle chaincode queryinstalled | grep -Fq "Package ID: ${package_id},"; then
        echo "Package ${package_id} was not installed on the platform peer" >&2
        exit 1
    fi
    peer_args+=(--peerAddresses peer0.org1.synapsenet.com:7051 --tlsRootCertFiles /organizations/peerOrganizations/org1.synapsenet.com/peers/peer0.org1.synapsenet.com/tls/ca.crt)
    for manifest in "${ALL_MANIFESTS[@]}"; do
        if [[ "${trust_only}" == true && "$(jq -r '.fabric.channels.trust // empty' "${manifest}")" != "${channel}" ]]; then
            continue
        fi
        manifests+=("${manifest}")
        msp="$(jq -r '.fabric.mspId' "${manifest}")"
        expected_msps+=("${msp}")
        run_org_peer "${manifest}" "" install "${package}" >/dev/null 2>&1 || true
        if ! run_org_peer "${manifest}" "" queryinstalled | grep -Fq "Package ID: ${package_id},"; then
            echo "Package ${package_id} was not installed on $(jq -r '.fabric.peer' "${manifest}")" >&2
            exit 1
        fi
        domain="$(jq -r '.fabric.domain' "${manifest}")"
        peer="$(jq -r '.fabric.peer' "${manifest}")"
        peer_args+=(--peerAddresses "${peer}:7051" --tlsRootCertFiles "/organizations/peerOrganizations/${domain}/peers/${peer}/tls/ca.crt")
    done

    if [[ "${name}" == "${CHAINCODE_NAME}" ]]; then
        export CHAINCODE_ID="${package_id}" CHAINCODE_VERSION="${version}"
        network_compose rm -sf skill-manager
        network_compose up -d --build skill-manager
    else
        export TRUST_CHAINCODE_ID="${package_id}" TRUST_CHAINCODE_VERSION="${version}"
        network_compose rm -sf trust-manager
        network_compose up -d --build trust-manager
    fi

    cli peer lifecycle chaincode approveformyorg -o orderer.synapsenet.com:7050 --tls \
      --cafile "${ORDERER_CA}" --channelID "${channel}" --name "${name}" \
      --version "${version}" --package-id "${package_id}" --sequence "${sequence}" \
      --signature-policy "${policy}"
    for manifest in "${manifests[@]}"; do
        run_org_peer "${manifest}" "${channel}" approveformyorg \
          -o orderer.synapsenet.com:7050 --tls --cafile "${ORDERER_CA}" \
          --name "${name}" --version "${version}" --package-id "${package_id}" \
          --sequence "${sequence}" --signature-policy "${policy}"
    done
    readiness="$(cli peer lifecycle chaincode checkcommitreadiness --channelID "${channel}" \
      --name "${name}" --version "${version}" --sequence "${sequence}" \
      --signature-policy "${policy}" --output json)"
    echo "${readiness}" | jq .
    for msp in "${expected_msps[@]}"; do
        jq -e --arg msp "${msp}" '.approvals[$msp] == true' <<<"${readiness}" >/dev/null || {
            echo "${msp} has not approved ${name} on ${channel}" >&2; exit 1;
        }
    done
    cli peer lifecycle chaincode commit -o orderer.synapsenet.com:7050 --tls \
      --cafile "${ORDERER_CA}" --channelID "${channel}" --name "${name}" \
      --version "${version}" --sequence "${sequence}" --signature-policy "${policy}" \
      "${peer_args[@]}"
}

[[ "${CREDENTIAL_CHANNEL_NAME}" != "${TRUST_CHANNEL_NAME}" ]] || { echo "Consortium channels must be distinct" >&2; exit 1; }
deploy_domain "${CHAINCODE_NAME}" "${CHAINCODE_VERSION}" "${CHAINCODE_SEQUENCE}" \
  "${CREDENTIAL_CHANNEL_NAME}" "${CREDENTIAL_ENDORSEMENT_POLICY}" "skill-manager:9999" "skill-manager" false
deploy_domain "${TRUST_CHAINCODE_NAME:-trust-manager}" "${TRUST_CHAINCODE_VERSION}" "${TRUST_CHAINCODE_SEQUENCE}" \
  "${TRUST_CHANNEL_NAME}" "${TRUST_ENDORSEMENT_POLICY}" "trust-manager:9998" "trust-manager" true
echo "Committed both domain chaincodes after all authorized organizations approved them."
