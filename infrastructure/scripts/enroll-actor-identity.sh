#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

MANIFEST="${1:?Usage: $0 <approved-manifest.json> <actor-id> <user|reviewer>}"
ACTOR_ID="${2:?Actor ID is required}"
ACTOR_ROLE="${3:?Actor role is required}"
ACTOR_SECRET="${ACTOR_ENROLLMENT_SECRET:?Set ACTOR_ENROLLMENT_SECRET}"
[[ "${ACTOR_ID}" =~ ^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$ ]] || { echo "Invalid actor ID" >&2; exit 2; }
[[ "${ACTOR_ROLE}" == "user" || "${ACTOR_ROLE}" == "reviewer" ]] || { echo "Role must be user or reviewer" >&2; exit 2; }
DOMAIN="$(jq -r '.fabric.domain' "${MANIFEST}")"
CA="$(jq -r '.fabric.ca' "${MANIFEST}")"
MSP_ID="$(jq -r '.fabric.mspId' "${MANIFEST}")"
CA_SECRET_NAME="CA_BOOTSTRAP_$(tr '[:lower:]-.' '[:upper:]__' <<<"${MSP_ID}")"
CA_PASSWORD="${!CA_SECRET_NAME:-${FABRIC_CA_BOOTSTRAP_PASSWORD:-}}"
[[ -n "${CA_PASSWORD}" ]] || { echo "Set ${CA_SECRET_NAME} in the deployment secret environment" >&2; exit 2; }

docker run --rm --network synapsenet_test \
  -e FABRIC_CA_CLIENT_HOME=/tmp/client -e ACTOR_ID -e ACTOR_ROLE -e ACTOR_SECRET -e FABRIC_CA_BOOTSTRAP_PASSWORD="${CA_PASSWORD}" \
  -e DOMAIN -e CA \
  -v "${NETWORK_CONFIG}/crypto-config/peerOrganizations/${DOMAIN}:/org" \
  -v "${NETWORK_CONFIG}/ca-data/${DOMAIN}:/ca:ro" \
  hyperledger/fabric-ca-tools:${FABRIC_CA_VERSION:-1.5.15} sh -ceu '
    tls=/ca/tls-cert.pem
    fabric-ca-client enroll -u "https://admin:${FABRIC_CA_BOOTSTRAP_PASSWORD}@${CA}:7054" --tls.certfiles "$tls"
    fabric-ca-client register --id.name "$ACTOR_ID" --id.secret "$ACTOR_SECRET" --id.type client \
      --id.attrs "synapsenet.role=${ACTOR_ROLE}:ecert,synapsenet.actorId=${ACTOR_ID}:ecert" --tls.certfiles "$tls"
    fabric-ca-client enroll -u "https://${ACTOR_ID}:${ACTOR_SECRET}@${CA}:7054" --tls.certfiles "$tls" \
      -M "/org/users/${ACTOR_ID}@${DOMAIN}/msp"
    cp /org/msp/config.yaml "/org/users/${ACTOR_ID}@${DOMAIN}/msp/config.yaml"
  '
