#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REQUESTED_CHAINCODE_VERSION="${CHAINCODE_VERSION:-}"
REQUESTED_CHAINCODE_SEQUENCE="${CHAINCODE_SEQUENCE:-}"
REQUESTED_TRUST_VERSION="${TRUST_CHAINCODE_VERSION:-}"
REQUESTED_TRUST_SEQUENCE="${TRUST_CHAINCODE_SEQUENCE:-}"
REQUESTED_CREDENTIAL_CHANNEL="${CREDENTIAL_CHANNEL_NAME:-${CHANNEL_NAME:-}}"
REQUESTED_TRUST_CHANNEL="${TRUST_CHANNEL_NAME:-}"
REQUESTED_CREDENTIAL_POLICY="${CREDENTIAL_ENDORSEMENT_POLICY:-${ENDORSEMENT_POLICY:-}}"
REQUESTED_TRUST_POLICY="${TRUST_ENDORSEMENT_POLICY:-}"
if [[ -f "${PROJECT_ROOT}/blockchain/config/chaincode-versions.env" ]]; then
    # shellcheck disable=SC1091
    source "${PROJECT_ROOT}/blockchain/config/chaincode-versions.env"
fi
if [[ "${CONSORTIUM_MODE:-false}" == "true" && \
      -f "${PROJECT_ROOT}/blockchain/network/generated/chaincode-policies.env" ]]; then
    # shellcheck disable=SC1091
    source "${PROJECT_ROOT}/blockchain/network/generated/chaincode-policies.env"
fi
[[ -n "${REQUESTED_CHAINCODE_VERSION}" ]] && CHAINCODE_VERSION="${REQUESTED_CHAINCODE_VERSION}"
[[ -n "${REQUESTED_CHAINCODE_SEQUENCE}" ]] && CHAINCODE_SEQUENCE="${REQUESTED_CHAINCODE_SEQUENCE}"
[[ -n "${REQUESTED_TRUST_VERSION}" ]] && TRUST_CHAINCODE_VERSION="${REQUESTED_TRUST_VERSION}"
[[ -n "${REQUESTED_TRUST_SEQUENCE}" ]] && TRUST_CHAINCODE_SEQUENCE="${REQUESTED_TRUST_SEQUENCE}"
[[ -n "${REQUESTED_CREDENTIAL_CHANNEL}" ]] && CREDENTIAL_CHANNEL_NAME="${REQUESTED_CREDENTIAL_CHANNEL}"
[[ -n "${REQUESTED_TRUST_CHANNEL}" ]] && TRUST_CHANNEL_NAME="${REQUESTED_TRUST_CHANNEL}"
[[ -n "${REQUESTED_CREDENTIAL_POLICY}" ]] && CREDENTIAL_ENDORSEMENT_POLICY="${REQUESTED_CREDENTIAL_POLICY}"
[[ -n "${REQUESTED_TRUST_POLICY}" ]] && TRUST_ENDORSEMENT_POLICY="${REQUESTED_TRUST_POLICY}"
NETWORK_CONFIG="${PROJECT_ROOT}/blockchain/network"
CREDENTIAL_CHANNEL_NAME="${CREDENTIAL_CHANNEL_NAME:-synapsenet}"
TRUST_CHANNEL_NAME="${TRUST_CHANNEL_NAME:-${CREDENTIAL_CHANNEL_NAME}}"
# Backward-compatible alias used by channel bootstrap and credential-domain scripts.
CHANNEL_NAME="${CREDENTIAL_CHANNEL_NAME}"
CHAINCODE_NAME="${CHAINCODE_NAME:-skill-manager}"
CHAINCODE_VERSION="${CHAINCODE_VERSION:-1.0}"
CHAINCODE_SEQUENCE="${CHAINCODE_SEQUENCE:-1}"
CREDENTIAL_ENDORSEMENT_POLICY="${CREDENTIAL_ENDORSEMENT_POLICY:-OR('Org1MSP.peer')}"
TRUST_ENDORSEMENT_POLICY="${TRUST_ENDORSEMENT_POLICY:-OR('Org1MSP.peer')}"

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

network_compose() {
    if [[ "${CONSORTIUM_MODE:-false}" == "true" && \
          -f "${NETWORK_CONFIG}/generated/docker-compose.organizations.yaml" ]]; then
        compose -f docker-compose.yml \
            -f blockchain/network/generated/docker-compose.organizations.yaml "$@"
    else
        compose "$@"
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
