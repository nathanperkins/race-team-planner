/*
  Warnings:

  - You are about to drop the column `carClass` on the `Registration` table. All the data in the column will be lost.
  - Added the required column `carClassId` to the `Registration` table without a default value. This is not possible if the table is not empty.

*/
-- Clean up old registrations that don't satisfy the new schema
DELETE FROM "Registration";

-- AlterTable
ALTER TABLE "Registration" DROP COLUMN "carClass",
ADD COLUMN     "carClassId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "CarClass" (
    "id" TEXT NOT NULL,
    "externalId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CarClassToEvent" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CarClassToEvent_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "CarClass_externalId_key" ON "CarClass"("externalId");

-- CreateIndex
CREATE INDEX "_CarClassToEvent_B_index" ON "_CarClassToEvent"("B");

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_carClassId_fkey" FOREIGN KEY ("carClassId") REFERENCES "CarClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CarClassToEvent" ADD CONSTRAINT "_CarClassToEvent_A_fkey" FOREIGN KEY ("A") REFERENCES "CarClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CarClassToEvent" ADD CONSTRAINT "_CarClassToEvent_B_fkey" FOREIGN KEY ("B") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
