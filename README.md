This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Database Management

This project uses **Prisma** with **PostgreSQL**.

### Start Database (Docker)

Ensure your local database is running:
```bash
docker-compose up -d
```

### Setup a Fresh Database

To set up your database for the first time or after a schema change (and seed it with default data):
```bash
npx prisma migrate dev
```

### Update Schema

After making changes to `prisma/schema.prisma`, generate a new migration:
```bash
npx prisma migrate dev --name <migration_name>
```

### Reset Database

To completely wipe the database and re-apply all migrations and seeds (useful for resetting to a clean state):
```bash
npx prisma migrate reset
```

### Seed Data

To manually re-run the seed script (restores default Events):
```bash
npx prisma db seed
```

### View Database

Run the Prism Studio GUI to inspect data:
```bash
npx prisma studio
```
