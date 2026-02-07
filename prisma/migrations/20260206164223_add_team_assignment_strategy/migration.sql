-- CreateEnum
CREATE TYPE "TeamAssignmentStrategy" AS ENUM ('BALANCED_IRATING');

-- AlterTable
ALTER TABLE "Race" ADD COLUMN     "teamAssignmentStrategy" "TeamAssignmentStrategy" NOT NULL DEFAULT 'BALANCED_IRATING';
