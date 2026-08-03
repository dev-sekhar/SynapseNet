#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${PROJECT_ROOT}"

action="${1:-up}"
compose_files=(-f docker-compose.yml)
if [[ -f blockchain/network/generated/docker-compose.organizations.yaml ]]; then
    compose_files+=(-f blockchain/network/generated/docker-compose.organizations.yaml)
fi
compose_files+=(-f docker-compose.monitoring.yml)

if docker compose version >/dev/null 2>&1; then
    compose_command=(docker compose)
else
    compose_command=(docker-compose)
fi

case "${action}" in
    up) "${compose_command[@]}" "${compose_files[@]}" --profile web3 up -d prometheus alertmanager ;;
    down) "${compose_command[@]}" "${compose_files[@]}" stop prometheus alertmanager ;;
    *) echo "Usage: $0 [up|down]" >&2; exit 2 ;;
esac
