-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('SUCCESS', 'FAILURE', 'IN_PROGRESS');

-- CreateEnum
CREATE TYPE "SyncSource" AS ENUM ('MANUAL', 'CRON');

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "status" "SyncStatus" NOT NULL,
    "error" TEXT,
    "source" "SyncSource" NOT NULL DEFAULT 'MANUAL',
    "count" INTEGER,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);
