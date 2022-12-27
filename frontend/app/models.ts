import { Match, MatchStatus } from "@prisma/client";
import { db } from "~/db.server";

export async function getMatch(matchId: string) {
  return await db.match.findUnique({
    where: {
      id: matchId,
    },
    include: {
      map: true,
      players: {
        include: {
          civilization: true,
        },
      },
    },
  });
}

export async function updateMatchStatus(matchId: string, status: MatchStatus) {
  return await db.match.update({
    where: {
      id: matchId,
    },
    data: {
      status,
    },
  });
}

interface ParsedMatch {
  match_id: string;
  started?: string;
  finished?: string;
  server?: string;
  duration_real?: number;
  duration_in_game?: number;
  rating_type?: number;
  game_type?: number;
  leaderboard_id?: number;
  map: ParsedMap;
  players: ParsedPlayer[];
}

interface ParsedMap {
  id: number;
  name: string;
}

interface ParsedPlayer {
  profile_id: string;
  color: number;
  team: number;
  winner?: boolean;
  rating?: number;
  rating_change?: number;
  name?: string;
  country?: string;
  civilization: ParsedCivilization;
}

interface ParsedCivilization {
  id: number;
  name: string;
}

export async function createMatch(match: ParsedMatch) {
  let map = null;
  if (match.map.id) {
    map = await db.map.upsert({
      where: {
        id: match.map.id,
      },
      update: {},
      create: {
        id: match.map.id,
        name: match.map.name,
      },
    });
  }
  const createMatchData: Match = {
    id: match.match_id,
    server: match.server,
    durationReal: match.duration_real,
    durationInGame: match.duration_in_game,
    ratingType: match.rating_type,
    gameType: match.game_type,
    leaderboardType: match.leaderboard_id,
  };

  if (match.started) {
    createMatchData.startedAt = new Date(match.started);
  }
  if (match.finished) {
    createMatchData.finishedAt = new Date(match.finished);
  }
  if (map) {
    createMatchData.map = {
      connect: { id: map.id },
    };
  }

  const output = await db.match.upsert({
    where: {
      id: createMatchData.id,
    },
    update: createMatchData,
    create: createMatchData,
  });

  for (let i = 0; i < Object.keys(match.players).length; i += 1) {
    const player = Object.values(match.players)[i];
    const profile_id = `${player.profile_id}`;
    const matchId = `${match.match_id}`;
    await db.player.upsert({
      where: {
        id: profile_id,
      },
      update: {
        name: player.name,
        country: player.country,
      },
      create: {
        id: profile_id,
        name: player.name,
        country: player.country,
      },
    });
    const civilization = await db.civilization.findFirst({
      where: { id: player.civilization.id },
    });
    if (!civilization || !civilization.name) {
      await db.civilization.upsert({
        where: { id: player.civilization.id },
        update: { name: player.civilization.name },
        create: { id: player.civilization.id, name: player.civilization.name },
      });
    }
    await db.playersOnMatches.upsert({
      where: {
        playerId_matchId: {
          playerId: profile_id,
          matchId,
        },
      },
      update: {},
      create: {
        color: player.color,
        team: player.team,
        winner: player.winner,
        rating: player.rating,
        ratingChange: player.rating_change,
        civilization: { connect: { id: player.civilization.id } },
        player: { connect: { id: profile_id } },
        match: { connect: { id: matchId } },
      },
    });
  }

  return output;
}
