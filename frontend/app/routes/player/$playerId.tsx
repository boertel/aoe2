import cn from "classnames";
import { useLoaderData } from "remix";
import type { LoaderFunction } from "remix";
import type { Match } from "@prisma/client";
import { duration } from "@boertel/duration";

import { db } from "~/db.server";

type LoaderData = { matches: Array<Match> };

export let loader: LoaderFunction = async ({ params }) => {
  const { playerId } = params;
  const data: LoaderData = {
    matches: await db.match.findMany({
      where: {
        players: {
          some: {
            playerId,
          },
        },
      },
      include: {
        players: {
          orderBy: { team: "asc" },
          include: {
            player: true,
            civilization: true,
          },
        },
        map: true,
      },
    }),
  };
  return data;
};

export default function Matches() {
  const data = useLoaderData<LoaderData>();
  return (
    <ul className="max-w-prose mx-auto w-full space-y-4">
      {data.matches.map((match) => (
        <li key={match.id}>
          {match.id} on {match.map?.name} played at {match.startedAt} and lasted{" "}
          <span
            title={`in game time: ${duration(match.durationInGame).format([
              "h HH",
              "m MM",
            ])}`}
          >
            {duration(match.durationReal).format(["h HH", "m MM"])}
          </span>
          <ul>
            {match.players.map(({ id, player, winner, civilization }) => (
              <li
                className={cn({
                  "text-green-600": winner,
                  "text-red-600": !winner,
                })}
                key={id}
              >
                {player?.name} as {civilization?.name}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
