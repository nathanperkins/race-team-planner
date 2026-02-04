#!/bin/bash
# Database restore script for Supabase PostgreSQL
# This script downloads and decrypts a backup, then restores it to the database
#
# Required environment variables:
#   BACKUP_PATH - GCS path to the backup file (e.g., gs://bucket/daily/backup-xxx.sql.gz.gpg)
#   BACKUP_ENCRYPTION_KEY - GPG passphrase for decryption
#   DATABASE_URL or DIRECT_URL - Database connection string

set -eo pipefail

# Load environment variables from mounted secrets (Cloud Run) or local .env
if [ -f /secrets/.env ]; then
  export $(grep -E '^(DATABASE_URL|DIRECT_URL|BACKUP_ENCRYPTION_KEY)=' /secrets/.env | xargs)
elif [ -f .env ]; then
  export $(grep -E '^(DATABASE_URL|DIRECT_URL|BACKUP_ENCRYPTION_KEY)=' .env | xargs)
fi

# Use DIRECT_URL for restores (bypasses connection pooling)
DB_URL="${DIRECT_URL:-$DATABASE_URL}"

if [ -z "$DB_URL" ]; then
  echo "Error: DATABASE_URL or DIRECT_URL not set"
  exit 1
fi

if [ -z "$BACKUP_PATH" ]; then
  echo "Error: BACKUP_PATH not set"
  echo "Usage: Set BACKUP_PATH environment variable to the GCS path of the backup"
  echo "Example: BACKUP_PATH=gs://myproject-db-backups/daily/backup-2026-02-01T00-00-00Z.sql.gz.gpg"
  exit 1
fi

if [ -z "$BACKUP_ENCRYPTION_KEY" ]; then
  echo "Error: BACKUP_ENCRYPTION_KEY not set"
  exit 1
fi

BACKUP_FILENAME=$(basename "$BACKUP_PATH")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")

echo "============================================"
echo "Database Restore - ${TIMESTAMP}"
echo "============================================"
echo "Backup file: ${BACKUP_PATH}"
echo "Database: ${DB_URL%%@*}@..."
echo ""

# Download the backup
echo "Downloading backup from GCS..."
gcloud storage cp "$BACKUP_PATH" "/tmp/${BACKUP_FILENAME}"

# Decrypt and decompress
echo "Decrypting and decompressing backup..."
gpg --decrypt --batch --passphrase "$BACKUP_ENCRYPTION_KEY" "/tmp/${BACKUP_FILENAME}" | gunzip > "/tmp/restore.sql"

RESTORE_SIZE=$(ls -lh "/tmp/restore.sql" | awk '{print $5}')
echo "Restore file ready: ${RESTORE_SIZE}"

# Restore to database
echo ""
echo "⚠️  Starting database restore..."
echo "   This will OVERWRITE existing data!"
echo ""

psql "$DB_URL" < "/tmp/restore.sql"

# Show restored data counts for all tables
echo ""
echo "Restored data summary:"

# Get all table names in public schema
TABLES=$(psql "$DB_URL" -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" | tr -d ' ' | grep -v '^$')

TABLE_COUNT=$(echo "$TABLES" | wc -l | tr -d ' ')
echo "  Tables: ${TABLE_COUNT}"
echo ""

# Show row count for each table
for TABLE in $TABLES; do
  COUNT=$(psql "$DB_URL" -t -c "SELECT count(*) FROM \"${TABLE}\";" 2>/dev/null | tr -d ' ' || echo "error")
  printf "  %-30s %s\n" "${TABLE}:" "${COUNT}"
done

# Clean up
rm "/tmp/${BACKUP_FILENAME}" "/tmp/restore.sql"

echo ""
echo "✅ Database restore completed successfully!"
echo "============================================"
