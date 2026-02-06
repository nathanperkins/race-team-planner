/*
  Warnings:

  - A unique constraint covering the columns `[iracingTeamId]` on the table `Team` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[iracingId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `iracingTeamId` to the `Team` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Team" ADD COLUMN "iracingTeamId" INTEGER;

-- Update existing teams with temporary negative IDs to satisfy NOT NULL and UNIQUE constraints
UPDATE "Team" SET "iracingTeamId" = -(row_number) FROM (SELECT id, row_number() OVER (ORDER BY "createdAt") as row_number FROM "Team") as sub WHERE "Team".id = sub.id;

-- Make it NOT NULL
ALTER TABLE "Team" ALTER COLUMN "iracingTeamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "iracingId" INTEGER;

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "custId" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMemberRole" (
    "id" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMemberRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_UserTeams" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_UserTeams_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_TeamToTeamMember" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TeamToTeamMember_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_custId_key" ON "TeamMember"("custId");

-- CreateIndex
CREATE INDEX "TeamMember_custId_idx" ON "TeamMember"("custId");

-- CreateIndex
CREATE INDEX "TeamMemberRole_teamId_idx" ON "TeamMemberRole"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMemberRole_teamMemberId_teamId_key" ON "TeamMemberRole"("teamMemberId", "teamId");

-- CreateIndex
CREATE INDEX "_UserTeams_B_index" ON "_UserTeams"("B");

-- CreateIndex
CREATE INDEX "_TeamToTeamMember_B_index" ON "_TeamToTeamMember"("B");

-- CreateIndex
CREATE UNIQUE INDEX "Team_iracingTeamId_key" ON "Team"("iracingTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "User_iracingId_key" ON "User"("iracingId");

-- AddForeignKey
ALTER TABLE "TeamMemberRole" ADD CONSTRAINT "TeamMemberRole_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMemberRole" ADD CONSTRAINT "TeamMemberRole_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserTeams" ADD CONSTRAINT "_UserTeams_A_fkey" FOREIGN KEY ("A") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserTeams" ADD CONSTRAINT "_UserTeams_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TeamToTeamMember" ADD CONSTRAINT "_TeamToTeamMember_A_fkey" FOREIGN KEY ("A") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TeamToTeamMember" ADD CONSTRAINT "_TeamToTeamMember_B_fkey" FOREIGN KEY ("B") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
