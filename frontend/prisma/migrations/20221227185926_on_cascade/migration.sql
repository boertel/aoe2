-- DropForeignKey
ALTER TABLE "players_on_matches" DROP CONSTRAINT "players_on_matches_match_id_fkey";

-- DropForeignKey
ALTER TABLE "players_on_matches" DROP CONSTRAINT "players_on_matches_player_id_fkey";

-- AddForeignKey
ALTER TABLE "players_on_matches" ADD CONSTRAINT "players_on_matches_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players_on_matches" ADD CONSTRAINT "players_on_matches_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
