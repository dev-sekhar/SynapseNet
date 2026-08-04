#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

BACKUP="${1:?Usage: $0 <synapsenet-backup.db>}"
BACKUP_DIR="$(cd "$(dirname "${BACKUP}")" && pwd -P)"
BACKUP_NAME="$(basename "${BACKUP}")"
CHECKSUM="${BACKUP}.sha256"
[[ -f "${BACKUP}" && -f "${CHECKSUM}" ]] || { echo "Backup and checksum are required" >&2; exit 2; }
(cd "${BACKUP_DIR}" && sha256sum -c "$(basename "${CHECKSUM}")")
docker run --rm --user 0:0 -v "${BACKUP_DIR}:/backup:ro" \
  -e BACKUP_FILE="/backup/${BACKUP_NAME}" synapsenet_application-api \
  python -c 'import os,sqlite3; uri="file:"+os.environ["BACKUP_FILE"]+"?mode=ro"; db=sqlite3.connect(uri,uri=True); assert db.execute("PRAGMA integrity_check").fetchone()[0]=="ok"; revision=db.execute("SELECT version_num FROM alembic_version").fetchone()[0]; assert revision=="0006", revision; print("Restore drill passed: integrity=ok, migration=0006"); db.close()'
