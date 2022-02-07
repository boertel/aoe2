import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

import data from "./2918752.json";

async function createMatches() {
  const { matches, civilizations } = data;
  if (civilizations) {
    await Promise.all(
      Object.keys(civilizations).map((civilizationId) => {
        return db.civilization.create({
          data: {
            id: parseInt(civilizationId, 10),
            name: civilizations[civilizationId].name,
          },
        });
      })
    );
  }
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    try {
      await createMatch(match);
    } catch (exception) {
      console.error(match.match_id, exception);
    }
  }
}

createMatches();
