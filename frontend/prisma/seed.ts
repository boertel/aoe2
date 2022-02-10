import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

import data from "./seed.json";

async function createCivilizations() {
  const { civilizations } = data;
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
}

createCivilizations();
