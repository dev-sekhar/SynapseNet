#!/usr/bin/env bash
set -uo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPORT_PATH="${COMPREHENSIVE_TEST_REPORT:-${PROJECT_ROOT}/reports/comprehensive-test.log}"
MODE="${1:-static}"
if [[ "${MODE}" != "static" && "${MODE}" != "running" ]]; then
    echo "Usage: $0 [static|running]" >&2
    exit 2
fi

mkdir -p "$(dirname "${REPORT_PATH}")"
: > "${REPORT_PATH}"
failures=0
passed=0

record() { printf '%s\n' "$*" | tee -a "${REPORT_PATH}"; }
run_check() {
    local name="$1"
    shift
    record ""
    record "=== ${name} ==="
    if "$@" >> "${REPORT_PATH}" 2>&1; then
        record "PASS: ${name}"
        passed=$((passed + 1))
    else
        record "FAIL: ${name}"
        record "Last output from failed check:"
        tail -20 "${REPORT_PATH}"
        failures=$((failures + 1))
    fi
}

record "SynapseNet comprehensive test"
record "Mode: ${MODE}"
record "Commit: $(git -C "${PROJECT_ROOT}" rev-parse HEAD)"
record "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

cd "${PROJECT_ROOT}"
run_check "Docker Compose configuration" docker-compose config --quiet
run_check "Operational shell syntax" bash -n infrastructure/scripts/*.sh
run_check "Frontend production build" yarn web3:build
run_check "Credential chaincode tests" yarn chaincode:test
run_check "Trust chaincode tests" yarn trust:test
run_check "Identity API migrations and tests" bash -lc \
    'cd services/identity-api && mkdir -p data && alembic upgrade head && pytest -q tests'
run_check "Infrastructure and release-control tests" yarn final-phases:test
run_check "Three-orderer Fabric topology" yarn phase4:validate-topology
run_check "Prometheus and Alertmanager configuration" yarn phase5:validate-observability
run_check "Capacity scenario syntax" yarn phase6:validate-load

if [[ "${MODE}" == "running" ]]; then
    run_check "Running container health" bash -lc \
        'unhealthy=$(docker-compose ps --format json | jq -sr '\''[.[] | select(.Health != "" and .Health != "healthy")] | length'\''); test "$unhealthy" -eq 0'
    run_check "Application ledger health" curl --fail --silent --show-error http://localhost:3001/api/health
    run_check "Project documentation health" curl --fail --silent --show-error --output /dev/null http://localhost:8000/docs
    run_check "Swagger documentation health" curl --fail --silent --show-error --output /dev/null http://localhost:8000/api/docs
    run_check "ReDoc documentation health" curl --fail --silent --show-error --output /dev/null http://localhost:8000/api/redoc
    run_check "Fabric event-stream health" docker-compose exec -T fabric-adapter node -e \
        "fetch('http://127.0.0.1:3010/health',{headers:{Authorization:'Bearer '+process.env.FABRIC_ADAPTER_TOKEN}}).then(async r=>{console.log(await r.text());process.exit(r.ok?0:1)})"
fi

record ""
record "Completed: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
record "Passed checks: ${passed}"
record "Failed checks: ${failures}"
record "Report: ${REPORT_PATH}"
if ((failures > 0)); then
    record "COMPREHENSIVE TEST: FAILED"
    exit 1
fi
record "COMPREHENSIVE TEST: PASSED"
