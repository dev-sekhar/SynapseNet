#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RESULT_PATH="${PHASE6_LOAD_RESULT:-${PROJECT_ROOT}/reports/phase6-load.json}"
mkdir -p "$(dirname "${RESULT_PATH}")"

docker run --rm --add-host host.docker.internal:host-gateway \
    -e SYNAPSENET_PUBLIC_URL="${SYNAPSENET_PUBLIC_URL:-http://host.docker.internal:3001}" \
    -e PHASE6_REQUEST_RATE="${PHASE6_REQUEST_RATE:-20}" \
    -e PHASE6_DURATION="${PHASE6_DURATION:-2m}" \
    -v "${PROJECT_ROOT}/infrastructure/performance:/scripts:ro" \
    -v "$(dirname "${RESULT_PATH}"):/results" \
    grafana/k6:${K6_VERSION:-0.57.0} run \
    --summary-export "/results/$(basename "${RESULT_PATH}")" /scripts/health-load.js

echo "Phase 6 load evidence written to ${RESULT_PATH}."
