/*
  Warnings:

  - You are about to drop the column `iracingId` on the `User` table. All the data in the column will be lost.
  - The `iracingCustomerId` column on the `User` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[iracingCustomerId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- 1. Transfer data from iracingCustomerId (String) to iracingId (Int) if iracingId is null
-- Only transfer if it looks like a number
UPDATE "User"
SET "iracingId" = CAST("iracingCustomerId" AS INTEGER)
WHERE "iracingId" IS NULL AND "iracingCustomerId" IS NOT NULL AND "iracingCustomerId" ~ '^[0-9]+$';

-- 2. Drop the old string column
ALTER TABLE "User" DROP COLUMN "iracingCustomerId";

-- 3. Rename iracingId to iracingCustomerId
ALTER TABLE "User" RENAME COLUMN "iracingId" TO "iracingCustomerId";

-- 4. Create the unique index on the new column name
-- Note: User_iracingId_key was dropped automatically if we used DROP INDEX but let's be explicit
-- Actually, renaming the column might keep the index but with the same name.
-- To be safe, we'll recreate it with the desired name.
DROP INDEX IF EXISTS "User_iracingId_key";
CREATE UNIQUE INDEX "User_iracingCustomerId_key" ON "User"("iracingCustomerId");
