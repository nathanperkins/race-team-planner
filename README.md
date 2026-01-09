This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Prerequisites

Before running the project, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (Project uses v18+)
- [Docker](https://www.docker.com/) & Docker Compose (for the local database)

## Environment Setup

1. **Create Environment File**
   Copy the example environment file to `.env`:
   ```bash
   cp .env.example .env
   ```

2. **Generate Secure Keys**
   Run the following commands to generate secrets for your `.env` file:

   - **Auth Secret** (for NextAuth.js):
     ```bash
     openssl rand -base64 32
     ```

   - **Encryption Key** (for Prisma Field Encryption):
     ```bash
     npx cloak generate
     ```
     *Note: Copy the CLOAK_MASTER_KEY*

3. **Configure Third-Party Services**
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
