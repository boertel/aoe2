/*
  Warnings:

  - A unique constraint covering the columns `[ipAddress]` on the table `RateLimit` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_ipAddress_key" ON "RateLimit"("ipAddress");
