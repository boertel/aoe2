import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

import matches from "./2918752.json";

async function createMatch(match) {
  const map = await db.map.upsert({
    where: {
      id: match.map.id,
    },
    update: {},
    create: {
      id: match.map.id,
      name: match.map.name,
    },
  });

  const dbMatch = await db.match.create({
    data: {
      id: match.match_id,
      startedAt: new Date(match.started),
      finishedAt: new Date(match.finished),
      server: match.server,
      durationReal: match.duration_real,
      durationInGame: match.duration_in_game,
      map: {
        connect: { id: map.id },
      },
    },
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
    await db.civilization.upsert({
      where: { id: player.civilization.id },
      update: { name: player.civilization.name },
      create: { id: player.civilization.id, name: player.civilization.name },
    });
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

async function createMatches() {
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    await createMatch(match);
  }
}

createMatches();
