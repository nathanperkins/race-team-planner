# iracing-team-planner

## Summary

We are creating a simple team planner for endurance races in iRacing. The goal
is to make it easy for members of our community to express their interest in
specific races so that the admins can plan teams.

## Existing Work

One of our community members used ChatGPT to vibe code a simple app so far:

- Data is stored in Google Sheets.
- Views are implemented using Apps Script.
- The Team View shows details on upcoming races, and the drivers that have registered by car/class and timeslot.
- The Registration View allows a driver to register with Name, Weekend, Event, and Car/Class.
  - Weekend, Event and Car/Class are auto-filled based on existing data.
- Clicking on a timeslot to open a registration view that is already auto-filled.
- iRacing data is synchronized using an API.

## Enhancement

We aim to professionalize the application to ensure longevity and maintainability.

- **Modern Architecture**: Move from Apps Script/Sheets to a Next.js web application. This provides a better user experience, faster load times, and more UI flexibility.
- **Robust Data Layer**: Replace Google Sheets with PostgreSQL. This ensures data integrity, supports concurrent writes, and enables relational queries (e.g., "all races for user X").
- **Security**: Implement real authentication via Discord OAuth, ensuring that signups are tied to verified Discord identities rather than free-text names.
- **Developer Experience**: A Docker-based local development environment allows any team member to spin up the full stack (App + DB) locally without conflicting with production.

With support from one of the community's experienced software engineers, we would like to reimplement the app with the following improvements:

- Use a flexible backend and frontend stack.
- Keep the stack simple enough for a developer with limited experience and vibecode and test small changes locally.
- Support authentication and authorization using Discord OAuth.
- Deploy the app publicly with a dedicated domain (slight preference for GCP, but open to other options for simplicity and cost).
- Automate deployment of the infrastructure and app with GitHub Actions.

## Tech Stack Decisions

- **App - Next.js**: The industry standard for React applications. specific choice for its file-based routing and API routes which simplifies the architecture (no separate backend repo needed).
- **Prod Database - Postgresql on Supabase**: Managed Postgres provides reliability and backups without manual maintenance. Supabase offers a great free tier.
- **Test/Local Database - Postgresql**: We will use a local Docker container running the same Postgres version as production to ensure 100% compatibility and consistency between environments.
- **ORM - Prisma**: Typed database access makes it easy for developers to safely interact with the DB without writing raw SQL.
- **Repo - GitHub**: Standard source control.
- **App Deployment - Google Cloud Run**: Serverless container setups are perfect for low-traffic community apps. distinct advantage: scales to zero (costs $0) when not in use.
- **Infra Deployment - Terraform**: Infrastructure as Code ensures we can recreate the environment if needed and tracks changes to cloud resources.
- **Local development - Docker Compose**: Orchestrates the local Postgres container and the Next.js app for a one-command startup.

## Resources

### User

Represents a community member who logs in via Discord.

- `id`: UUID
- `discordId`: String (Unique)
- `name`: String (Display name)
- `avatarUrl`: String

### Event

Represents a scheduled race weekend or special event.

- `id`: UUID
- `name`: String (e.g., "Sebring 12hr")

### Race

A scheduled session within an event.

- `id`: UUID
- `eventId`: FK -> Event
- `startTime`: DateTime
- `endTime`: DateTime

### Registration

A user's expression of interest for a specific race.

- `id`: UUID
- `userId`: FK -> User
- `raceId`: FK -> Race
- `carClass`: String (e.g., "GT3", "GTP")
- `notes`: String

## Implementation Plan

### Phase 1: Foundation

- [x] Initialize Next.js project with TypeScript.
- [x] Set up Docker Compose for local PostgreSQL.
- [x] Configure Prisma and connect to local DB.
- [x] Create "Hello World" API endpoint verifying DB connection.

### Phase 2a: User & Auth

- [x] Define `User` schema in Prisma.
- [x] Configure NextAuth.js with Discord Provider.
- [x] Create Login Page.

### Phase 2b: Event Data

- [x] Define `Event` and `Registration` schemas in Prisma.
- [x] Create database migration scripts.
- [x] Create seed script.

### Phase 3a: Core Features

- [x] **Event List**: View upcoming events (Home Page).
- [x] **Event Detail**: View details and existing registrations for an event.
- [x] **Registration Flow**: Authenticated users can register for an event (pick car/time).
- [x] **My Registrations**: View a list of races I have registered for.
- [x] **Separate Styles from Logic**: Move styles to a separate file.
- [x] **Support dropping registrations**: Allow users to drop registrations from the details page or from "My Registrations".
- [x] **Navigation**: Add a navigation sidebar to the left of the page.
- [x] **Fix undefined user issue**: The user ID is undefined when accessing the registration page.
- [x] **Fix unauthorized issue**: Registrations fail with unauthorized.
- [x] **Sync Events from iRacing**: Use the iRacing API to sync events to the database.
- [x] Use icons to denote synced vs manual events.
- [x] Add filters for events.
- [x] Encrypt sensitive fields like tokens in the database using the `prisma-field-encryption` extension
- [x] Fix issue where user and signout are shown in the middle of the sidebar when scrolled down. They should not be affected by scrolling.
- [x] Fix prisma-field-encryption warnings.
- [x] Add a badge to events in the list to show the number of registrations.
- [x] Add a filter looking for specific racers.
- [x] Add a roster page.
- [x] Don't allow user to register for completed races.
- [x] Don't allow the user to drop from completed races.
- [x] Add sync support for events with multiple timeslots.
- [x] Remove revoke agreement button.
- [x] **Refactor Sync to use Upsert**: Individual race upserts to prevent wiping registrations.
- [x] Add iRacing sync vars.
- [x] Enable features like Discord and iRacing based on whether environment variables are provided.
- [x] Always use local timezone.
- [x] Add a name filter for events.
- [x] Ensure that app fails fast when critical environment variables are missing.
- [x] Show sync status and messages in a pop-up instead of alongside the button.
- [x] Add sync support for car classes.
- [x] Sync weather data and display in events list and details.
- [x] Display registration numbers per car class in the events list view.
- [x] Add sync support for racer info.
- [x] Sync and display race duration.
- [x] Fix syncing fails with success message.
- [x] **Check Membership in SRG Discord**: Use the Discord API to check if a user is a member of the SRG Discord.
- [x] **Implement roles**: Admins can modify all registrations, users can only modify their own registrations.
- [x] **Automated iRacing Sync**: Background synchronization for events and driver stats.

### Phase 3c: Onboarding & User Flow

- [x] **Force iRacing Customer ID**: Require new users to provide their iRacing Customer ID.
- [x] **Team Expectations**: Users must read and agree to team expectations.
- [x] **Gate Access**: Restrict access to the dashboard until onboarding is complete.

### Phase 3b: Improve local dev

- [x] Add a mock auth provider.
- [x] Add a mock iRacing API server.
- [x] Add husky pre-commit git hooks for formatting, linting, and build verification.

### Phase 4: Production Readiness

- [x] Set up GitHub Actions for CI (Linting, Build Check).
- [x] Create Terraform configuration for GCP (Cloud Run, Artifact Registry).
- [x] Deploy to Staging.
- [x] Pass `DISCORD_ADMIN_ROLE_IDS` through deployment automation (Terraform/CI).
- [x] Deploy to Production.

### Phase 5: Low Priority Features

- [x] **Add "Live" Badge**: Visual indicator in `RaceDetails` for ongoing races.
- [ ] **Registration Overlap Warning**: Prevent or warn about double-booking same-time races.
- [ ] **Race Driver Limits**: Optional capacity limits for sessions.
- [ ] **Add tests**: Add tests for important CUJs.
- [ ] **Improve registration flow**: Refine UI/UX for signing up for races.
- [ ] **Registration Notes**: Allow users to add notes and display them on event details.
