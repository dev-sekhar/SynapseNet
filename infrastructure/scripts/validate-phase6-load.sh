#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
docker run --rm \
    -v "${PROJECT_ROOT}/infrastructure/performance:/scripts:ro" \
    grafana/k6:${K6_VERSION:-0.57.0} inspect /scripts/health-load.js >/dev/null
echo "Phase 6 k6 scenario is valid."
