-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_mapId_fkey";

-- AlterTable
ALTER TABLE "Match" ALTER COLUMN "mapId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PlayersOnMatches" ALTER COLUMN "winner" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "Map"("id") ON DELETE SET NULL ON UPDATE CASCADE;
