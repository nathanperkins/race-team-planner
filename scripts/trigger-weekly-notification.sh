#!/bin/bash
# Trigger the weekly notification endpoint on localhost for testing

set -e

# Load CRON_SECRET from .env file
if [ -f .env ]; then
  export $(grep -E '^CRON_SECRET=' .env | xargs)
fi

if [ -z "$CRON_SECRET" ]; then
  echo "Error: CRON_SECRET not found in .env"
  exit 1
fi

echo "Triggering weekly notification..."
curl -s -X GET "http://localhost:3000/api/cron/weekly-notification" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" | jq .

echo "Done!"
