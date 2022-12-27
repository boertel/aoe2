/*
  Warnings:

  - You are about to drop the `Civilization` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Map` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Match` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Player` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PlayersOnMatches` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RateLimit` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('Fetched', 'DownloadStarted', 'DownloadEnded', 'DownloadFailed', 'ParseStarted', 'ParseEnded', 'ParseFailed');

-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_mapId_fkey";

-- DropForeignKey
ALTER TABLE "PlayersOnMatches" DROP CONSTRAINT "PlayersOnMatches_civilizationId_fkey";

-- DropForeignKey
ALTER TABLE "PlayersOnMatches" DROP CONSTRAINT "PlayersOnMatches_matchId_fkey";

-- DropForeignKey
ALTER TABLE "PlayersOnMatches" DROP CONSTRAINT "PlayersOnMatches_playerId_fkey";

-- DropTable
DROP TABLE "Civilization";

-- DropTable
DROP TABLE "Map";

-- DropTable
DROP TABLE "Match";

-- DropTable
DROP TABLE "Player";

-- DropTable
DROP TABLE "PlayersOnMatches";

-- DropTable
DROP TABLE "RateLimit";

-- CreateTable
CREATE TABLE "match" (
    "id" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT E'Fetched',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "server" TEXT,
    "duration_in_game" INTEGER,
    "duration_real" INTEGER,
    "rating_type" INTEGER,
    "leaderboard_type" INTEGER,
    "game_type" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "map_id" INTEGER,

    CONSTRAINT "match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players_on_matches" (
    "id" TEXT NOT NULL,
    "color" INTEGER NOT NULL,
    "team" INTEGER NOT NULL,
    "winner" BOOLEAN,
    "rating" INTEGER,
    "rating_change" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "civilization_id" INTEGER NOT NULL,
    "player_id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,

    CONSTRAINT "players_on_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "civilization" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "civilization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "map" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "country" TEXT,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit" (
    "id" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_on_matches_player_id_match_id_key" ON "players_on_matches"("player_id", "match_id");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_ip_address_key" ON "rate_limit"("ip_address");

-- AddForeignKey
ALTER TABLE "match" ADD CONSTRAINT "match_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "map"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players_on_matches" ADD CONSTRAINT "players_on_matches_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players_on_matches" ADD CONSTRAINT "players_on_matches_civilization_id_fkey" FOREIGN KEY ("civilization_id") REFERENCES "civilization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players_on_matches" ADD CONSTRAINT "players_on_matches_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
