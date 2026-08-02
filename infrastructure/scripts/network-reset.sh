#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

network_compose down --volumes --remove-orphans
echo "Removed local Fabric containers and ledger volumes."
echo "Generated certificates remain on disk; delete blockchain/network/{crypto-config,channel-artifacts} to regenerate them."
