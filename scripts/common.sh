#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REQUESTED_CHAINCODE_VERSION="${CHAINCODE_VERSION:-}"
REQUESTED_CHAINCODE_SEQUENCE="${CHAINCODE_SEQUENCE:-}"
REQUESTED_TRUST_VERSION="${TRUST_CHAINCODE_VERSION:-}"
REQUESTED_TRUST_SEQUENCE="${TRUST_CHAINCODE_SEQUENCE:-}"
if [[ -f "${PROJECT_ROOT}/config/chaincode-versions.env" ]]; then
    # shellcheck disable=SC1091
    source "${PROJECT_ROOT}/config/chaincode-versions.env"
fi
[[ -n "${REQUESTED_CHAINCODE_VERSION}" ]] && CHAINCODE_VERSION="${REQUESTED_CHAINCODE_VERSION}"
[[ -n "${REQUESTED_CHAINCODE_SEQUENCE}" ]] && CHAINCODE_SEQUENCE="${REQUESTED_CHAINCODE_SEQUENCE}"
[[ -n "${REQUESTED_TRUST_VERSION}" ]] && TRUST_CHAINCODE_VERSION="${REQUESTED_TRUST_VERSION}"
[[ -n "${REQUESTED_TRUST_SEQUENCE}" ]] && TRUST_CHAINCODE_SEQUENCE="${REQUESTED_TRUST_SEQUENCE}"
NETWORK_CONFIG="${PROJECT_ROOT}/fabric-network-config"
CHANNEL_NAME="${CHANNEL_NAME:-synapsenet}"
CHAINCODE_NAME="${CHAINCODE_NAME:-skill-manager}"
CHAINCODE_VERSION="${CHAINCODE_VERSION:-1.0}"
CHAINCODE_SEQUENCE="${CHAINCODE_SEQUENCE:-1}"
ENDORSEMENT_POLICY="${ENDORSEMENT_POLICY:-OR('Org1MSP.peer')}"

cd "${PROJECT_ROOT}"

compose() {
    if docker compose version >/dev/null 2>&1; then
        docker compose "$@"
    elif command -v docker-compose >/dev/null 2>&1; then
        docker-compose "$@"
    else
        echo "Docker Compose is required (docker compose or docker-compose)." >&2
        return 1
    fi
}

require_docker() {
    docker info >/dev/null 2>&1 || {
        echo "Docker is not running or the current user cannot access it." >&2
        return 1
    }
}

cli() {
    compose exec -T cli "$@"
}
