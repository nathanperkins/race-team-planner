#!/bin/bash
# Weekly backup restore test
# This script validates backup integrity by:
# 1. Finding the latest backup
# 2. Starting a temporary PostgreSQL instance
# 3. Calling the restore script to restore to the temp database
# 4. Reporting success/failure

set -e

# Load environment variables from mounted secrets (Cloud Run) or local .env
if [ -f /secrets/.env ]; then
  export $(grep -E '^BACKUP_ENCRYPTION_KEY=' /secrets/.env | xargs)
elif [ -f .env ]; then
  export $(grep -E '^BACKUP_ENCRYPTION_KEY=' .env | xargs)
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
PGDATA="/tmp/pgdata"
PGPORT=5433
SCRIPT_DIR="$(dirname "$0")"

echo "============================================"
echo "Weekly Backup Restore Test - ${TIMESTAMP}"
echo "============================================"
echo ""

# 1. Find the latest backup
echo "Finding latest backup..."
LATEST_BACKUP=$(gcloud storage ls "gs://${BACKUP_BUCKET}/hourly/" | sort | tail -1)

if [ -z "$LATEST_BACKUP" ]; then
  echo "❌ ERROR: No backups found in gs://${BACKUP_BUCKET}/hourly/"
  exit 1
fi

echo "Latest backup: $(basename "$LATEST_BACKUP")"

# 2. Initialize and start temporary PostgreSQL
echo ""
echo "Starting temporary PostgreSQL instance..."
mkdir -p "$PGDATA"
chmod 700 "$PGDATA"

# Initialize the database
initdb -D "$PGDATA" --auth=trust --username=postgres > /dev/null 2>&1

# Start PostgreSQL in the background
pg_ctl -D "$PGDATA" -l /tmp/pg.log -o "-p $PGPORT" start > /dev/null 2>&1

# Wait for PostgreSQL to be ready
for i in {1..30}; do
  if pg_isready -p $PGPORT -q; then
    break
  fi
  sleep 1
done

if ! pg_isready -p $PGPORT -q; then
  echo "❌ ERROR: PostgreSQL failed to start"
  cat /tmp/pg.log
  exit 1
fi

echo "PostgreSQL started on port ${PGPORT}"

# Create test database
createdb -p $PGPORT -U postgres restore_test

# 3. Call the restore script with temp database connection
echo ""

# Set environment for restore script
export BACKUP_PATH="$LATEST_BACKUP"
export DIRECT_URL="postgresql://postgres@localhost:${PGPORT}/restore_test"

# Call the restore script
if "${SCRIPT_DIR}/restore-db.sh"; then
  RESTORE_SUCCESS=true
else
  RESTORE_SUCCESS=false
fi

# 4. Cleanup
echo ""
echo "Stopping test database..."
pg_ctl -D "$PGDATA" stop > /dev/null 2>&1 || true
rm -rf "$PGDATA" /tmp/pg.log

# Report result
echo ""
if [ "$RESTORE_SUCCESS" = true ]; then
  echo "============================================"
  echo "✅ BACKUP RESTORE TEST PASSED"
  echo "============================================"
else
  echo "============================================"
  echo "❌ BACKUP RESTORE TEST FAILED"
  echo "============================================"
  exit 1
fi
