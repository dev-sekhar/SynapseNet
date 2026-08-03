#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${PROJECT_ROOT}"

temporary_dir="$(mktemp -d)"
trap 'rm -rf "${temporary_dir}"' EXIT
printf '%s' 'validation-token-at-least-32-characters' > "${temporary_dir}/adapter-token"
printf '%s' 'https://alerts.invalid/synapsenet' > "${temporary_dir}/webhook-url"

export FABRIC_ADAPTER_TOKEN_FILE="${temporary_dir}/adapter-token"
export ALERT_WEBHOOK_URL_FILE="${temporary_dir}/webhook-url"

if docker compose version >/dev/null 2>&1; then
    docker compose -f docker-compose.yml -f docker-compose.monitoring.yml config --quiet
else
    docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml config --quiet
fi

docker run --rm --entrypoint promtool \
    -v "${PROJECT_ROOT}/infrastructure/monitoring:/monitoring:ro" \
    -v "${temporary_dir}/adapter-token:/run/secrets/fabric_adapter_token:ro" \
    "prom/prometheus:${PROMETHEUS_VERSION:-v3.5.0}" \
    check config /monitoring/prometheus.yml
docker run --rm --entrypoint promtool \
    -v "${PROJECT_ROOT}/infrastructure/monitoring:/monitoring:ro" \
    -v "${temporary_dir}/adapter-token:/run/secrets/fabric_adapter_token:ro" \
    "prom/prometheus:${PROMETHEUS_VERSION:-v3.5.0}" \
    check rules /monitoring/alerts.yml
docker run --rm --entrypoint amtool \
    -v "${PROJECT_ROOT}/infrastructure/monitoring:/monitoring:ro" \
    -v "${temporary_dir}/webhook-url:/run/secrets/alert_webhook_url:ro" \
    "prom/alertmanager:${ALERTMANAGER_VERSION:-v0.28.1}" \
    check-config /monitoring/alertmanager.yml

echo "Phase 5 observability configuration is valid."
