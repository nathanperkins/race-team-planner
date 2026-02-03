# iracing-team-planner

A team planner for endurance races in iRacing, designed to make it easy for community members to express interest in specific races so admins can plan teams.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Prerequisites

Before running the project, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (Project uses v18+)
- [Docker](https://www.docker.com/) & Docker Compose (for the local database)

## Quick Start

1. **Start the Database**

   ```bash
   docker-compose up -d
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

   > **Important**: This must be run _before_ setting up the environment. It also initializes Git hooks via Husky.

3. **Initialize Environment**
   Run the setup script to create your `.env` file and generate secure keys automatically:

   ```bash
   npm run setup-env
   ```

4. **Initialize Database**
   Run migrations to set up the schema and seed data:

   ```bash
   npx prisma migrate dev
   ```

5. **Start the Application**
   Run the development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) with your browser.

## Configuration

### Third-Party Services

Third-party services are optional and are configured via environment
variables. When the environment variables are not provided, the application
will use a mock data set suitable for local development.

- **Discord OAuth**:
  - Create an application at the [Discord Developer Portal](https://discord.com/developers/applications).
  - Add a Redirect URI: `http://localhost:3000/api/auth/callback/discord`.
  - Copy the Client ID and Client Secret to `AUTH_DISCORD_ID` and `AUTH_DISCORD_SECRET` in the `.env` file.
  - **Discord Membership Check** (Required to restrict access to community members):
    - In your Discord Application, go to the **Bot** tab.
    - Click **Build-A-Bot** if you haven't already.
    - Copy the **Token** and set `DISCORD_BOT_TOKEN`.
    - Set `DISCORD_GUILD_ID` to your Server ID (Enable Developer Mode in Discord to copy this).
    - **Important**: In the **Bot** tab, scroll down to "Privileged Gateway Intents" and enable **Server Members Intent**. This is required to check guild membership.
    - **Important**: Invite the bot to your server using the OAuth2 URL Generator in the OAuth2 tab and include scope: `bot`.
    - Set `DISCORD_ADMIN_ROLE_IDS` to a comma-separated list of Role IDs that should have Administrative access in the app.
  - **Discord Notifications** (Optional - for race registration and event notifications):
    - Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode).
    - Right-click the channel where you want notifications sent and select "Copy ID".
    - Set `DISCORD_NOTIFICATIONS_CHANNEL_ID` to this channel ID.
    - **Note**: The bot must have permission to send messages in this channel.

- **iRacing Data API**:
  - Follow the setup guide: [iRacing Data API Documentation](https://forums.iracing.com/discussion/15068/general-availability-of-data-api).
  - Obtain your Client ID and Client Secret and copy them to the `.env` file.
  - **Cron Secret**:
    - The `CRON_SECRET` variable is used to secure the `/api/cron/sync` endpoint from unauthorized calls.
    - It is automatically generated when you run `npm run setup-env`.
    - If setting up manually, you can generate one with `openssl rand -base64 32`.

### Database Backups

Automated encrypted backups are configured in production via Cloud Run Jobs and Cloud Scheduler.

- **Backup Encryption Key**:
  - The `BACKUP_ENCRYPTION_KEY` is used to encrypt database backups with AES-256 via GPG.
  - It is automatically generated when you run `npm run setup-env`.
  - If setting up manually, generate one with `openssl rand -hex 32`.
  - **Important**: Store this key securely! Without it, backups cannot be decrypted.

- **Backup Retention**:
  | Type | Retention |
  |------|-----------|
  | Hourly | 24 hours |
  | Daily | 7 days |
  | Weekly | 4 weeks |
  | Monthly | 12 months |
  | Yearly | Unlimited |

- **Restoring a Backup**:
  ```bash
  ./scripts/restore-backup.sh gs://PROJECT-db-backups/daily/backup-2026-02-01T00-00-00Z.sql.gz.gpg
  ```
  This will decrypt the backup to `/tmp/restored.sql` which can then be applied with `psql`.

## Development Workflow

### Database Schema Changes

If you modify `prisma/schema.prisma`, you MUST create a migration to apply the changes:

```bash
npx prisma migrate dev --name <descriptive_migration_name>
```

> **Note**: This command automatically regenerates the Prisma Client. You may need to restart your development server (`npm run dev`) for the changes to take effect.

### Database Management Tools

- **Reset Database**: Wipes the DB and re-applies migrations/seeds.
  ```bash
  npx prisma migrate reset
  ```
- **View Data**: Opens the Prisma Studio GUI.
  ```bash
  npx prisma studio
  ```

### Pre-Submission Testing

Before submitting changes, run the following to ensure code quality. **Note**: These checks run automatically via a Git pre-commit hook.

- **Formatting**:
  ```bash
  npm run format
  ```
- **Linting**:
  ```bash
  npm run lint
  ```
- **Build Check**:
  ```bash
  npm run build
  ```

## Deployment

For instructions on how to deploy this application to Google Cloud Platform, please see [DEPLOYMENT.md](DEPLOYMENT.md).
