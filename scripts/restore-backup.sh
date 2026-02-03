#!/bin/bash
# Restore a database backup from GCS
# Usage: ./scripts/restore-backup.sh <backup-file-path>
# Example: ./scripts/restore-backup.sh gs://PROJECT-db-backups/daily/backup-2026-02-01T00-00-00Z.sql.gz.gpg

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <gcs-backup-path>"
  echo "Example: $0 gs://myproject-db-backups/daily/backup-2026-02-01T00-00-00Z.sql.gz.gpg"
  exit 1
fi

BACKUP_PATH="$1"
BACKUP_FILENAME=$(basename "$BACKUP_PATH")

# Load encryption key from .env
if [ -f .env ]; then
  export $(grep -E '^BACKUP_ENCRYPTION_KEY=' .env | xargs)
fi

if [ -z "$BACKUP_ENCRYPTION_KEY" ]; then
  echo "Error: BACKUP_ENCRYPTION_KEY not found in .env"
  exit 1
fi

echo "Downloading backup from $BACKUP_PATH..."
gcloud storage cp "$BACKUP_PATH" "/tmp/${BACKUP_FILENAME}"

echo "Decrypting and decompressing backup..."
gpg --decrypt --batch --passphrase "$BACKUP_ENCRYPTION_KEY" "/tmp/${BACKUP_FILENAME}" | gunzip > "/tmp/restored.sql"

echo "Backup restored to /tmp/restored.sql"
echo ""
echo "To apply this backup to a database, run:"
echo "  psql \"\$DATABASE_URL\" < /tmp/restored.sql"

# Clean up encrypted file
rm "/tmp/${BACKUP_FILENAME}"
