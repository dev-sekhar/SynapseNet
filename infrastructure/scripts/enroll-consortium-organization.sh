#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

MANIFEST="${1:?Usage: $0 <approved-manifest.json>}"
DOMAIN="$(jq -r '.fabric.domain' "${MANIFEST}")"
MSP_ID="$(jq -r '.fabric.mspId' "${MANIFEST}")"
CA_SECRET_NAME="CA_BOOTSTRAP_$(tr '[:lower:]-.' '[:upper:]__' <<<"${MSP_ID}")"
PEER_SECRET_NAME="PEER_ENROLLMENT_$(tr '[:lower:]-.' '[:upper:]__' <<<"${MSP_ID}")"
REVIEWER_SECRET_NAME="REVIEWER_ENROLLMENT_$(tr '[:lower:]-.' '[:upper:]__' <<<"${MSP_ID}")"
CA_PASSWORD="${!CA_SECRET_NAME:-${FABRIC_CA_BOOTSTRAP_PASSWORD:-}}"
PEER_SECRET="${!PEER_SECRET_NAME:-${PEER_ENROLLMENT_SECRET:-}}"
REVIEWER_SECRET="${!REVIEWER_SECRET_NAME:-${REVIEWER_ENROLLMENT_SECRET:-}}"
[[ -n "${CA_PASSWORD}" ]] || { echo "Set ${CA_SECRET_NAME} in the deployment secret environment" >&2; exit 2; }
[[ -n "${PEER_SECRET}" ]] || { echo "Set ${PEER_SECRET_NAME} in the deployment secret environment" >&2; exit 2; }
[[ -n "${REVIEWER_SECRET}" ]] || { echo "Set ${REVIEWER_SECRET_NAME} in the deployment secret environment" >&2; exit 2; }
PEER="$(jq -r '.fabric.peer' "${MANIFEST}")"
CA="$(jq -r '.fabric.ca' "${MANIFEST}")"
REVIEWERS="$(jq -r '.fabric.enrollment.reviewerIds | join(",")' "${MANIFEST}")"
[[ "${MSP_ID}" =~ ^[A-Za-z][A-Za-z0-9]{2,63}MSP$ && -n "${REVIEWERS}" ]] || {
    echo "Manifest MSP ID or reviewer enrollment list is invalid." >&2; exit 1;
}

network_compose up -d "${CA}"
mkdir -p "${NETWORK_CONFIG}/crypto-config/peerOrganizations/${DOMAIN}"
for _attempt in $(seq 1 30); do
    if docker exec "${CA}" fabric-ca-client getcainfo -u https://localhost:7054 \
        --tls.certfiles /etc/hyperledger/fabric-ca-server/tls-cert.pem >/dev/null 2>&1; then
        break
    fi
    sleep 1
done
docker exec "${CA}" fabric-ca-client getcainfo -u https://localhost:7054 \
    --tls.certfiles /etc/hyperledger/fabric-ca-server/tls-cert.pem >/dev/null
docker run --rm --network synapsenet_test \
    -e FABRIC_CA_CLIENT_HOME=/tmp/client \
    -e CA_PASSWORD="${CA_PASSWORD}" -e PEER_SECRET="${PEER_SECRET}" \
    -e REVIEWER_SECRET="${REVIEWER_SECRET}" -e REVIEWERS="${REVIEWERS}" \
    -e DOMAIN="${DOMAIN}" -e MSP_ID="${MSP_ID}" -e PEER="${PEER}" -e CA="${CA}" \
    -v "${NETWORK_CONFIG}/crypto-config/peerOrganizations/${DOMAIN}:/org" \
    -v "${NETWORK_CONFIG}/ca-data/${DOMAIN}:/ca:ro" \
    hyperledger/fabric-ca-tools:${FABRIC_CA_VERSION:-1.5.15} sh -ceu '
      tls=/ca/tls-cert.pem
      fabric-ca-client enroll -u "https://admin:${CA_PASSWORD}@${CA}:7054" --tls.certfiles "$tls" -M "/org/users/Admin@${DOMAIN}/msp"
      fabric-ca-client register --id.name peer0 --id.secret "$PEER_SECRET" --id.type peer --tls.certfiles "$tls" || true
      fabric-ca-client enroll -u "https://peer0:${PEER_SECRET}@${CA}:7054" --tls.certfiles "$tls" -M "/org/peers/${PEER}/msp"
      fabric-ca-client enroll -u "https://peer0:${PEER_SECRET}@${CA}:7054" --enrollment.profile tls --csr.hosts "$PEER" --tls.certfiles "$tls" -M "/org/peers/${PEER}/tls"
      cp /org/peers/${PEER}/tls/signcerts/* /org/peers/${PEER}/tls/server.crt
      cp /org/peers/${PEER}/tls/keystore/* /org/peers/${PEER}/tls/server.key
      cp /org/peers/${PEER}/tls/tlscacerts/* /org/peers/${PEER}/tls/ca.crt
      mkdir -p /org/msp/cacerts /org/msp/tlscacerts
      cp /org/users/Admin@${DOMAIN}/msp/cacerts/* /org/msp/cacerts/
      cp "$tls" /org/msp/tlscacerts/tls-ca-cert.pem
      ca_name=$(basename /org/msp/cacerts/*)
      for msp in /org/msp /org/peers/${PEER}/msp /org/users/Admin@${DOMAIN}/msp; do
        printf "NodeOUs:\n  Enable: true\n  ClientOUIdentifier:\n    Certificate: cacerts/%s\n    OrganizationalUnitIdentifier: client\n  PeerOUIdentifier:\n    Certificate: cacerts/%s\n    OrganizationalUnitIdentifier: peer\n  AdminOUIdentifier:\n    Certificate: cacerts/%s\n    OrganizationalUnitIdentifier: admin\n  OrdererOUIdentifier:\n    Certificate: cacerts/%s\n    OrganizationalUnitIdentifier: orderer\n" "$ca_name" "$ca_name" "$ca_name" "$ca_name" > "$msp/config.yaml"
      done
      for reviewer in $(echo "$REVIEWERS" | tr "," " "); do
        fabric-ca-client register --id.name "$reviewer" --id.secret "$REVIEWER_SECRET" --id.type client --id.attrs "synapsenet.role=reviewer:ecert,synapsenet.actorId=${reviewer}:ecert" --tls.certfiles "$tls" || true
        fabric-ca-client enroll -u "https://${reviewer}:${REVIEWER_SECRET}@${CA}:7054" --tls.certfiles "$tls" -M "/org/users/${reviewer}@${DOMAIN}/msp"
        cp /org/msp/config.yaml "/org/users/${reviewer}@${DOMAIN}/msp/config.yaml"
      done
    '
echo "Enrolled ${MSP_ID} peer, admin, and reviewer identities under ${DOMAIN}."
