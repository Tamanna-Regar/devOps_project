#!/usr/bin/env bash
# ==============================================================================
# One-Command MongoDB Disaster Recovery Restore from AWS S3
# Usage: ./scripts/restore_mongodb.sh [optional_specific_backup_filename.tar.gz]
# ==============================================================================

set -euo pipefail

RESTORE_DIR="/tmp/mongodb_restore"
S3_BUCKET="${BACKUP_S3_BUCKET:-devops-taskmanager-backups}"
MONGO_URI="${MONGO_URL:-mongodb://127.0.0.1:27017/devops_task_manager}"

mkdir -p "${RESTORE_DIR}"

if [[ -n "${1:-}" ]]; then
    BACKUP_FILE="$1"
else
    echo "[INFO] Finding latest backup in s3://${S3_BUCKET}/mongodb/..."
    BACKUP_FILE=$(aws s3 ls "s3://${S3_BUCKET}/mongodb/" | sort | tail -n 1 | awk '{print $4}')
fi

if [[ -z "${BACKUP_FILE}" ]]; then
    echo "[ERROR] No backup file found in s3://${S3_BUCKET}/mongodb/"
    exit 1
fi

LOCAL_PATH="${RESTORE_DIR}/${BACKUP_FILE}"

echo "[INFO] Downloading ${BACKUP_FILE} from S3..."
aws s3 cp "s3://${S3_BUCKET}/mongodb/${BACKUP_FILE}" "${LOCAL_PATH}"

echo "[INFO] Restoring database from ${LOCAL_PATH}..."
mongorestore --uri="${MONGO_URI}" --archive="${LOCAL_PATH}" --gzip --drop

rm -f "${LOCAL_PATH}"

echo "[SUCCESS] $(date) MongoDB restore completed successfully from ${BACKUP_FILE}!"
