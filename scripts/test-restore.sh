#!/bin/bash
# Weekly backup restore test
# This script validates backup integrity by:
# 1. Finding the latest backup
# 2. Starting a temporary PostgreSQL instance
# 3. Calling the restore script to restore to the temp database
# 4. Reporting success/failure

set -eo pipefail

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
echo "Current user: $(whoami)"
echo "Starting temporary PostgreSQL instance..."
mkdir -p "$PGDATA"
rm -rf "$PGDATA"/* # Ensure it's empty

# If we are root, we must run postgres as the postgres user
if [ "$(id -u)" = "0" ]; then
  echo "Running as root, switching to postgres user for DB operations..."
  chown -R postgres:postgres "$PGDATA"

  # Initialize the database as postgres user
  su postgres -c "initdb -D \"$PGDATA\" --auth=trust --username=postgres"

  # Start PostgreSQL as postgres user
  su postgres -c "pg_ctl -D \"$PGDATA\" -l /tmp/pg.log -o \"-p $PGPORT\" start"
else
  # Initialize the database
  initdb -D "$PGDATA" --auth=trust --username=postgres

  # Start PostgreSQL in the background
  pg_ctl -D "$PGDATA" -l /tmp/pg.log -o "-p $PGPORT" start
fi

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready on port ${PGPORT}..."
for i in {1..30}; do
  if pg_isready -p $PGPORT -q; then
    break
  fi
  echo -n "."
  sleep 1
done
echo ""

if ! pg_isready -p $PGPORT -q; then
  echo "❌ ERROR: PostgreSQL failed to start (port ${PGPORT})"
  [ -f /tmp/pg.log ] && cat /tmp/pg.log
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
if [ "$(id -u)" = "0" ]; then
  su postgres -c "pg_ctl -D \"$PGDATA\" stop" || true
else
  pg_ctl -D "$PGDATA" stop || true
fi
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
