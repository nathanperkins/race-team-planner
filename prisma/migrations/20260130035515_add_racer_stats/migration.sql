-- AlterTable
ALTER TABLE "User" ADD COLUMN     "iracingCustomerId" TEXT;

-- CreateTable
CREATE TABLE "RacerStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "irating" INTEGER NOT NULL,
    "licenseLevel" INTEGER NOT NULL,
    "licenseGroup" INTEGER NOT NULL,
    "safetyRating" DOUBLE PRECISION NOT NULL,
    "cpi" DOUBLE PRECISION NOT NULL,
    "ttRating" INTEGER NOT NULL,
    "mprNumRaces" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RacerStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RacerStats_userId_categoryId_key" ON "RacerStats"("userId", "categoryId");

-- AddForeignKey
ALTER TABLE "RacerStats" ADD CONSTRAINT "RacerStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
