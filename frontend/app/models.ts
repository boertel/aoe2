import { db } from "~/db.server";

export async function getMatch(matchId) {
  return await db.match.findUnique({
    where: {
      id: matchId,
    },
  });
}

export async function createMatch(match) {
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
  const createMatchData = {
    id: match.match_id,
    startedAt: new Date(match.started),
    finishedAt: new Date(match.finished),
    server: match.server,
    durationReal: match.duration_real,
    durationInGame: match.duration_in_game,
    ratingType: match.rating_type,
    gameType: match.game_type,
    leaderboardType: match.leaderboard_id,
  };
  if (map) {
    createMatchData.map = {
      connect: { id: map.id },
    };
  }

  await db.match.create({
    data: createMatchData,
  });

  for (let i = 0; i < Object.keys(match.players).length; i += 1) {
    const player = Object.values(match.players)[i];
    const profile_id = `${player.profile_id}`;
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
    await db.playersOnMatches.create({
      data: {
        colorId: player.color_id,
        team: player.team,
        winner: player.winner,
        civilization: { connect: { id: player.civilization.id } },
        player: { connect: { id: profile_id } },
        match: { connect: { id: `${match.match_id}` } },
      },
    });
  }
}
