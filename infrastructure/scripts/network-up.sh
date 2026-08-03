#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

require_docker
if [[ ! -f "${NETWORK_CONFIG}/channel-artifacts/genesis.block" ]]; then
    "${PROJECT_ROOT}/infrastructure/scripts/generate-network.sh"
fi

services=(orderer.synapsenet.com couchdb0.org1.synapsenet.com peer0.org1.synapsenet.com cli)
if [[ "${CONSORTIUM_MODE:-false}" == "true" ]]; then
    services+=(orderer2.synapsenet.com orderer3.synapsenet.com)
    shopt -s nullglob
    for manifest in "${PROJECT_ROOT}"/blockchain/consortium/approved/*.json; do
        services+=(
            "$(jq -r '.fabric.ca' "${manifest}")"
            "couchdb0.$(jq -r '.fabric.domain' "${manifest}")"
            "$(jq -r '.fabric.peer' "${manifest}")"
        )
    done
fi
network_compose up -d "${services[@]}"
echo "Fabric containers started. Create the configured domain channel(s) next."
