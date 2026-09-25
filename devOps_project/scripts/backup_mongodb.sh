#!/usr/bin/env bash
# ==============================================================================
# Automated MongoDB Backup to AWS S3
# Designed to run via daily Cron: 0 2 * * * /home/ubuntu/devops_project/scripts/backup_mongodb.sh
# ==============================================================================

set -euo pipefail

# Configuration
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/tmp/mongodb_backups"
BACKUP_NAME="devops_taskmanager_backup_${TIMESTAMP}.tar.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"
S3_BUCKET="${BACKUP_S3_BUCKET:-devops-taskmanager-backups}"
S3_PATH="s3://${S3_BUCKET}/mongodb/${BACKUP_NAME}"
RETENTION_DAYS=7

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

echo "[INFO] $(date) Starting MongoDB backup..."

# Extract connection string from env or use default
MONGO_URI="${MONGO_URL:-mongodb://127.0.0.1:27017/devops_task_manager}"

# Dump database to compressed archive
mongodump --uri="${MONGO_URI}" --archive="${BACKUP_PATH}" --gzip

FILE_SIZE=$(du -h "${BACKUP_PATH}" | cut -f1)
echo "[INFO] Backup created successfully: ${BACKUP_PATH} (Size: ${FILE_SIZE})"

# Upload to AWS S3
if command -v aws >/dev/null 2>&1; then
    echo "[INFO] Uploading backup to ${S3_PATH}..."
    aws s3 cp "${BACKUP_PATH}" "${S3_PATH}" --storage-class STANDARD_IA
    echo "[INFO] Upload complete!"

    # Retention policy: remove backups older than RETENTION_DAYS from S3
    echo "[INFO] Applying ${RETENTION_DAYS}-day retention cleanup in S3..."
    CUTOFF_DATE=$(date -d "${RETENTION_DAYS} days ago" +"%Y-%m-%d" 2>/dev/null || date -v-${RETENTION_DAYS}d +"%Y-%m-%d")
    aws s3 ls "s3://${S3_BUCKET}/mongodb/" | while read -r line; do
        FILE_DATE=$(echo "$line" | awk '{print $1}')
        FILE_NAME=$(echo "$line" | awk '{print $4}')
        if [[ "${FILE_DATE}" < "${CUTOFF_DATE}" ]] && [[ -n "${FILE_NAME}" ]]; then
            echo "[INFO] Deleting expired backup from S3: ${FILE_NAME}"
            aws s3 rm "s3://${S3_BUCKET}/mongodb/${FILE_NAME}"
        fi
    done
else
    echo "[WARNING] AWS CLI not found. Backup preserved locally at ${BACKUP_PATH}"
fi

# Clean up local archive
rm -f "${BACKUP_PATH}"

echo "[SUCCESS] $(date) MongoDB backup pipeline finished successfully!"
