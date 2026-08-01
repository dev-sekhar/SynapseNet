#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

require_docker
if [[ ! -f "${NETWORK_CONFIG}/channel-artifacts/genesis.block" ]]; then
    "${PROJECT_ROOT}/infrastructure/scripts/generate-network.sh"
fi

compose up -d orderer.synapsenet.com couchdb0.org1.synapsenet.com peer0.org1.synapsenet.com cli
echo "Fabric containers started. Run 'yarn network:create-channel' next."
