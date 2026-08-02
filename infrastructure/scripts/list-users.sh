#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

require_docker

USERS_JSON="$(cli peer chaincode query \
    -C "${CHANNEL_NAME}" \
    -n "${CHAINCODE_NAME}" \
    -c '{"function":"SynapseNet.IdentityContract:getUsers","Args":[]}')"

ENTERPRISES_JSON="$(cli peer chaincode query \
    -C "${CHANNEL_NAME}" \
    -n "${CHAINCODE_NAME}" \
    -c '{"function":"SynapseNet.IdentityContract:getEnterprises","Args":[]}')"

if [[ "$(jq 'length' <<<"${USERS_JSON}")" -eq 0 \
    && "$(jq 'length' <<<"${ENTERPRISES_JSON}")" -eq 0 ]]; then
    echo "No users or enterprise reviewers are registered on the SynapseNet ledger."
    exit 0
fi

AUTH_FILE="${PROJECT_ROOT}/services/api-gateway/data/auth.json"
if [[ -f "${AUTH_FILE}" ]]; then
    AUTH_JSON="$(<"${AUTH_FILE}")"
else
    AUTH_JSON='{}'
fi

TABLE="$(
jq -nr \
    --argjson users "${USERS_JSON}" \
    --argjson enterprises "${ENTERPRISES_JSON}" \
    --argjson auth "${AUTH_JSON}" '
    ["LOGIN ID", "ACCOUNT TYPE", "DISPLAY NAME", "ENTERPRISE", "LOGIN STATUS", "REGISTERED AT"],
    (
        $users[] | [
            .userId,
            "User",
            .displayName,
            "—",
            (if $auth[.userId].passwordHash then "Password configured" else "Login not configured" end),
            (.createdAt | tonumber | strftime("%Y-%m-%d %H:%M:%S UTC"))
        ]
    ),
    (
        $enterprises[] as $enterprise
        | $enterprise.reviewers[]
        | . as $reviewerId
        | [
            $reviewerId,
            "Enterprise reviewer",
            ($auth[$reviewerId].displayName // $reviewerId),
            $enterprise.name,
            (if $auth[$reviewerId].passwordHash then "Password configured" else "Login not configured" end),
            ($enterprise.createdAt | tonumber | strftime("%Y-%m-%d %H:%M:%S UTC"))
        ]
    )
    | @tsv
'
)"

if command -v column >/dev/null 2>&1; then
    column -t -s $'\t' <<<"${TABLE}"
else
    printf '%s\n' "${TABLE}"
fi
