#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/synapsenet-phase4.XXXXXX")"
trap 'rm -rf "${WORK}"' EXIT
mkdir -p "${WORK}/approved" "${WORK}/generated"
cp "${PROJECT_ROOT}/blockchain/consortium/examples/example-university.json" \
  "${WORK}/approved/ExampleUniversityMSP.json"
python3 "${PROJECT_ROOT}/infrastructure/scripts/render-consortium-config.py" \
  --approved-dir "${WORK}/approved" --output-dir "${WORK}/generated"

TOOLS="hyperledger/fabric-tools:${FABRIC_VERSION:-2.5.15}"
docker run --rm --user "$(id -u):$(id -g)" -v "${WORK}:/work" "${TOOLS}" \
  cryptogen generate --config=/work/generated/crypto-config.yaml --output=/work/crypto-config
mkdir -p "${WORK}/crypto-config/peerOrganizations/credentials.example.edu"
cp -R "${WORK}/crypto-config/peerOrganizations/org1.synapsenet.com/msp" \
  "${WORK}/crypto-config/peerOrganizations/credentials.example.edu/msp"

for definition in \
  "SynapseNetConsortiumGenesis:system-channel:genesis.block:block" \
  "SynapseNetCredentialsChannel:credentials:credentials.tx:channel" \
  "SynapseNetTrustChannel:trust-governance:trust.tx:channel"; do
    IFS=: read -r profile channel output kind <<<"${definition}"
    args=(-profile "${profile}" -channelID "${channel}")
    if [[ "${kind}" == block ]]; then args+=(-outputBlock "/work/${output}"); else args+=(-outputCreateChannelTx "/work/${output}"); fi
    docker run --rm --user "$(id -u):$(id -g)" -v "${WORK}:/work" \
      -e FABRIC_CFG_PATH=/work/generated "${TOOLS}" configtxgen "${args[@]}"
done

CA_BOOTSTRAP_EXAMPLEUNIVERSITYMSP=topology-validation-secret compose \
  -f "${PROJECT_ROOT}/docker-compose.yml" \
  -f "${WORK}/generated/docker-compose.organizations.yaml" config --quiet
echo "Phase 4 topology validated: three Raft consenters, two isolated channels, and merged services."
