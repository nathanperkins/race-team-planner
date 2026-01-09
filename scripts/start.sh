#!/bin/sh
set -e

# Load secrets from mounted file if it exists
if [ -f /secrets/.env ]; then
  echo "Loading secrets from /secrets/.env"
  # Export variables from the .env file
  # Use set -a to automatically export variables defined
  set -a
  . /secrets/.env
  set +a
fi

# Execute the main container command
exec "$@"
