#!/bin/bash
# Database backup script for Supabase PostgreSQL
# This script creates an encrypted pg_dump backup and uploads it to GCS

set -e

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

echo "Starting encrypted database backup at ${TIMESTAMP}..."

# Create the backup using pg_dump, compress with gzip, and encrypt with GPG
pg_dump "$DB_URL" --no-owner --no-acl | gzip | gpg --symmetric --batch --passphrase "$BACKUP_ENCRYPTION_KEY" --cipher-algo AES256 > "/tmp/${BACKUP_FILE}"

BACKUP_SIZE=$(ls -lh "/tmp/${BACKUP_FILE}" | awk '{print $5}')
echo "Encrypted backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Upload to hourly folder (kept for 3 days via lifecycle rule)
echo "Uploading to hourly/..."
gcloud storage cp "/tmp/${BACKUP_FILE}" "gs://${BACKUP_BUCKET}/hourly/${BACKUP_FILE}"

# On Sundays at midnight UTC (or the first backup of the day), also save to weekly folder
# Since it runs every 4 hours, checking for HOUR=00 is correct for the midnight run.
if [ "$HOUR" = "00" ] && [ "$DAY_OF_WEEK" = "7" ]; then
  echo "Uploading to weekly/..."
  gcloud storage cp "/tmp/${BACKUP_FILE}" "gs://${BACKUP_BUCKET}/weekly/${BACKUP_FILE}"
fi

# Clean up
rm "/tmp/${BACKUP_FILE}"

echo "Encrypted backup completed successfully!"
