/*
  Warnings:

  - You are about to drop the column `eventId` on the `Registration` table. All the data in the column will be lost.
  - You are about to drop the column `preferredTimeslot` on the `Registration` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,raceId]` on the table `Registration` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `raceId` to the `Registration` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Registration" DROP CONSTRAINT "Registration_eventId_fkey";

-- DropIndex
DROP INDEX "Registration_userId_eventId_key";

-- AlterTable
ALTER TABLE "Registration" DROP COLUMN "eventId",
DROP COLUMN "preferredTimeslot",
ADD COLUMN     "raceId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Race" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Race_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Race_externalId_key" ON "Race"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Race_eventId_startTime_key" ON "Race"("eventId", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_userId_raceId_key" ON "Registration"("userId", "raceId");

-- AddForeignKey
ALTER TABLE "Race" ADD CONSTRAINT "Race_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "Race"("id") ON DELETE CASCADE ON UPDATE CASCADE;
