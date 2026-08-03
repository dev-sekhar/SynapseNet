#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

BACKUP_DIR="${SYNAPSENET_BACKUP_DIR:-${PROJECT_ROOT}/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
CONTAINER="synapsenet-application-api"
mkdir -p "${BACKUP_DIR}"
docker exec "${CONTAINER}" python -c \
  'import sqlite3; source=sqlite3.connect("/app/data/synapsenet.db"); target=sqlite3.connect("/app/data/synapsenet-backup.db"); source.backup(target); target.close(); source.close()'
docker cp "${CONTAINER}:/app/data/synapsenet-backup.db" "${BACKUP_DIR}/synapsenet-${STAMP}.db"
docker exec "${CONTAINER}" python -c 'from pathlib import Path; Path("/app/data/synapsenet-backup.db").unlink(missing_ok=True)'
sha256sum "${BACKUP_DIR}/synapsenet-${STAMP}.db" > "${BACKUP_DIR}/synapsenet-${STAMP}.db.sha256"
echo "Created consistent application backup ${BACKUP_DIR}/synapsenet-${STAMP}.db"
