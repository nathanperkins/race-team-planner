-- Clear previously persisted encrypted Discord OAuth tokens from Account.
-- Neither the app nor Auth.js reads these tokens (sessions use JWT cookies and
-- guild/role revalidation uses DISCORD_BOT_TOKEN + Account.providerAccountId).
-- Prep for removing prisma-field-encryption and upgrading to Prisma 7 (#237 / #217).
UPDATE "Account"
SET "access_token" = NULL,
    "refresh_token" = NULL,
    "id_token" = NULL
WHERE "access_token" IS NOT NULL
   OR "refresh_token" IS NOT NULL
   OR "id_token" IS NOT NULL;
