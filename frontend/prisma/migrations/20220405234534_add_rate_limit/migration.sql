/*
  Warnings:

  - You are about to drop the column `ipAdress` on the `RateLimit` table. All the data in the column will be lost.
  - Added the required column `ipAddress` to the `RateLimit` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RateLimit" DROP COLUMN "ipAdress",
ADD COLUMN     "ipAddress" TEXT NOT NULL;
