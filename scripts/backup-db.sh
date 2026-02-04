#!/bin/bash
# Database backup script for Supabase PostgreSQL
# This script creates an encrypted pg_dump backup and uploads it to GCS

set -eo pipefail

# Load environment variables from mounted secrets (Cloud Run) or local .env
if [ -f /secrets/.env ]; then
  export $(grep -E '^(DATABASE_URL|DIRECT_URL|BACKUP_ENCRYPTION_KEY)=' /secrets/.env | xargs)
elif [ -f .env ]; then
  export $(grep -E '^(DATABASE_URL|DIRECT_URL|BACKUP_ENCRYPTION_KEY)=' .env | xargs)
fi

# Use DIRECT_URL for backups (bypasses connection pooling)
DB_URL="${DIRECT_URL:-$DATABASE_URL}"

if [ -z "$DB_URL" ]; then
  echo "Error: DATABASE_URL or DIRECT_URL not set"
  exit 1
fi

if [ -z "$BACKUP_BUCKET" ]; then
  echo "Error: BACKUP_BUCKET not set"
  exit 1
fi

if [ -z "$BACKUP_ENCRYPTION_KEY" ]; then
  echo "Error: BACKUP_ENCRYPTION_KEY not set"
  exit 1
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
HOUR=$(date -u +"%H")
DAY_OF_WEEK=$(date -u +"%u")  # 1=Monday, 7=Sunday
DAY_OF_MONTH=$(date -u +"%d")
MONTH=$(date -u +"%m")

BACKUP_FILE="backup-${TIMESTAMP}.sql.gz.gpg"
BACKUP_PATH="/tmp/${BACKUP_FILE}"
HOURLY_BACKUP_PATH="gs://${BACKUP_BUCKET}/hourly/${BACKUP_FILE}"
WEEKLY_BACKUP_PATH="gs://${BACKUP_BUCKET}/weekly/${BACKUP_FILE}"

echo "Starting encrypted database backup at ${TIMESTAMP}..."

# Create the backup using pg_dump, compress with gzip, and encrypt with GPG
pg_dump "$DB_URL" --schema=public --no-owner --no-acl | gzip | gpg --symmetric --batch --passphrase "$BACKUP_ENCRYPTION_KEY" --cipher-algo AES256 > "${BACKUP_PATH}"

BACKUP_SIZE=$(ls -lh "${BACKUP_PATH}" | awk '{print $5}')
echo "Encrypted backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"


# Upload to hourly folder (kept for 3 days via lifecycle rule)
echo "Uploading to ${HOURLY_BACKUP_PATH}..."
gcloud storage cp "${BACKUP_PATH}" "${HOURLY_BACKUP_PATH}"

# On Sundays, also save to weekly folder (robust to timing/skips)
if [ "$DAY_OF_WEEK" = "7" ]; then
  echo "Copying to ${WEEKLY_BACKUP_PATH}..."
  # Use a date-only filename for the weekly folder so multiple runs on Sunday
  # simply overwrite/update the same file, ensuring we always have a backup for the week.
  WEEKLY_DATE_FILE="backup-$(date -u +"%Y-%m-%d").sql.gz.gpg"
  gcloud storage cp "${BACKUP_PATH}" "${WEEKLY_BACKUP_PATH}"
fi

# Clean up
rm "${BACKUP_PATH}"

echo "Encrypted backup completed successfully!"
