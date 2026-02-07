/*
  Warnings:

  - A unique constraint covering the columns `[manualDriverId,raceId]` on the table `Registration` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "manualDriverId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ManualDriver" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "irating" INTEGER NOT NULL DEFAULT 1350,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualDriver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Registration_manualDriverId_raceId_key" ON "Registration"("manualDriverId", "raceId");

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_manualDriverId_fkey" FOREIGN KEY ("manualDriverId") REFERENCES "ManualDriver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
