---
name: iracing-api
description: Integration with the iRacing Data API for fetching series, seasons, car classes, and member information.
---

# iRacing API Skill

This skill provides instructions and tools for interacting with the iRacing Data API. It is primarily used to fetch the latest race data, car classes, and tracks to keep the local database in sync.

## Prerequisites

- **Credentials**: You must have `IRACING_USERNAME` and `IRACING_PASSWORD` (or `IRACING_CLIENT_ID` and `IRACING_CLIENT_SECRET` for OAuth) set in your `.env` file.

## Core Script: `pull-iracing-data.ts`

The project includes a self-contained script to fetch raw data from iRacing and save it to `raw_data/*.json`.

### How to use:

1.  **Ensure environment variables are set** in `.env`.
2.  **Run the script** using `ts-node`:
    ```bash
    npx ts-node scripts/pull-iracing-data.ts
    ```

This script will:

- Authenticate via OAuth2.
- Fetch `seasons`, `car_classes`, `cars`, `tracks`, `series`, and `member_info`.
- Save the results as JSON files in the `raw_data` directory.

## Common Tasks

### Inspecting Raw Data

If you need to understand the structure of the iRacing API responses (e.g., when adding support for new car classes or event types), check the files in `raw_data/` after running the pull script.

### Updating Sync Logic

When modifying the synchronization logic in `lib/iracing.ts` or `app/actions/sync-events.ts`, use the raw data fetched by this script as a reference for the API's schema.

### Debugging Authentication

If the script fails with "Auth failed," verify that your credentials in `.env` are correct and that the `IRACING_CLIENT_ID` matches the one provided by iRacing (if using OAuth).

## API Reference (Endpoints covered)

- `/data/series/seasons`
- `/data/carclass/get`
- `/data/car/get`
- `/data/track/get`
- `/data/series/get`
- `/data/member/info`
