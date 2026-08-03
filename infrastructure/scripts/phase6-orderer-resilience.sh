#!/usr/bin/env bash
set -euo pipefail
export CONSORTIUM_MODE=true
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

if [[ "${CONFIRM_RESILIENCE_DRILL:-}" != "orderer2.synapsenet.com" ]]; then
    echo "Set CONFIRM_RESILIENCE_DRILL=orderer2.synapsenet.com to run the controlled drill." >&2
    exit 2
fi

target=orderer2.synapsenet.com
restore_orderer() {
    network_compose start "${target}" >/dev/null 2>&1 || true
}
trap restore_orderer EXIT INT TERM

network_compose ps --services --filter status=running | grep -qx "${target}" || {
    echo "${target} must be running before the drill." >&2
    exit 1
}

network_compose stop -t 20 "${target}"
running_orderers="$(network_compose ps --services --filter status=running | grep -Ec '^orderer(2|3)?\.synapsenet\.com$' || true)"
if [[ "${running_orderers}" -lt 2 ]]; then
    echo "Raft quorum was not preserved; restoring ${target}." >&2
    exit 1
fi

cli peer channel getinfo -c "${CREDENTIAL_CHANNEL_NAME}" >/dev/null
cli peer channel getinfo -c "${TRUST_CHANNEL_NAME}" >/dev/null
restore_orderer
trap - EXIT INT TERM

for attempt in {1..12}; do
    if network_compose ps --services --filter status=running | grep -qx "${target}"; then
        echo "Phase 6 resilience drill passed: quorum survived and ${target} recovered."
        exit 0
    fi
    sleep 5
done
echo "${target} did not recover within 60 seconds." >&2
exit 1
