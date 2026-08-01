#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

compose down --volumes --remove-orphans
echo "Removed local Fabric containers and ledger volumes."
echo "Generated certificates remain on disk; delete fabric-network-config/{crypto-config,channel-artifacts} to regenerate them."
