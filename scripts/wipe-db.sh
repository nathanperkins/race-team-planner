#!/bin/bash
# Script to wipe the public schema in Supabase PostgreSQL
# This is useful before performing a clean restore

set -eo pipefail

# Load environment variables from mounted secrets (Cloud Run) or local .env
if [ -f /secrets/.env ]; then
  export $(grep -E '^(DATABASE_URL|DIRECT_URL)=' /secrets/.env | xargs)
elif [ -f .env ]; then
  export $(grep -E '^(DATABASE_URL|DIRECT_URL)=' .env | xargs)
fi

# Use DIRECT_URL (bypasses connection pooling)
DB_URL="${DIRECT_URL:-$DATABASE_URL}"

if [ -z "$DB_URL" ]; then
  echo "Error: DATABASE_URL or DIRECT_URL not set"
  exit 1
fi

echo "⚠️  WARNING: This will DESTRUCTIVELY WIPE the 'public' schema in your database!"
echo "Database: ${DB_URL%%@*}@..."
echo ""

if [ "$FORCE" != "true" ]; then
    read -p "Are you sure you want to proceed? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Operation cancelled."
        exit 1
    fi
else
    echo "FORCE=true set, proceeding without confirmation..."
fi

echo "Wiping public schema..."
psql "$DB_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

echo "✅ Database 'public' schema wiped successfully!"
