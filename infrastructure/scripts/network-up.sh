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
# Compose 1.29 cannot inspect newer Docker image metadata while recreating a container and fails
# with KeyError: ContainerConfig. The CLI contains no ledger state, so removing only that service
# before recreation is safe and preserves orderer, peer, CouchDB, certificates, and volumes.
if compose_is_legacy; then
    compose rm -sf cli >/dev/null 2>&1 || true
fi
network_compose up -d "${services[@]}"
echo "Fabric containers started. Create the configured domain channel(s) next."
