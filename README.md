# iracing-team-planner

A team planner for endurance races in iRacing, designed to make it easy for community members to express interest in specific races so admins can plan teams.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Prerequisites

Before running the project, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (Project uses v18+)
- [Docker](https://www.docker.com/) & Docker Compose (for the local database)

## Environment Setup

1. **Initialize Environment**
   Run the setup script to create your `.env` file and generate secure keys automatically:

   ```bash
   npm run setup-env
   ```

3. **Configure Third-Party Services**

Third-party services are optional and are configured via environment
variables. When the environment variables are not provided, the application
will use a mock data set suitable for local development.

- **Discord OAuth**:
  - Create an application at the [Discord Developer Portal](https://discord.com/developers/applications).
  - Add a Redirect URI: `http://localhost:3000/api/auth/callback/discord`.
  - Copy the Client ID and Client Secret to `AUTH_DISCORD_ID` and `AUTH_DISCORD_SECRET` in the `.env` file.

- **iRacing Data API**:
  - Follow the setup guide: [iRacing Data API Documentation](https://forums.iracing.com/discussion/15068/general-availability-of-data-api).
  - Obtain your Client ID and Client Secret and copy them to the `.env` file.

## Running Locally

1. **Start the Database**
   Start the PostgreSQL container:

   ```bash
   docker-compose up -d
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Initialize Database**
   Run migrations to set up the schema and seed data:

   ```bash
   npx prisma migrate dev
   ```

4. **Start the Application**
   Run the development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) with your browser.

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

Before submitting changes, run the following to ensure code quality:

- **Linting**:
  ```bash
  npm run lint
  ```
- **Build Check** (Type Checking):
  ```bash
  npm run build
  ```

## Deployment

For instructions on how to deploy this application to Google Cloud Platform, please see [DEPLOYMENT.md](DEPLOYMENT.md).
