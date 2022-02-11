import cn from "classnames";
import dayjs from "dayjs";
import { useLoaderData } from "remix";
import type { LoaderFunction } from "remix";
import type { Match } from "@prisma/client";
import { duration } from "@boertel/duration";

import { db } from "~/db.server";

type LoaderData = { matches: Array<Match> };

export let loader: LoaderFunction = async ({ request, params, ...etc }) => {
  const { playerId } = params;
  let where = {
    players: {
      some: {
        playerId,
      },
    },
  };
  let url = new URL(request.url);
  let since = url.searchParams.get("since");
  if (since) {
    where.startedAt = { gt: dayjs(since).toDate() };
  }
  const matches = await db.match.findMany({
    where,
    orderBy: { startedAt: "desc" },
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
  });
  const stats = { civilizations: {} };
  matches.forEach(({ players }) => {
    const me = players.find(({ playerId }) => playerId === params.playerId);
    stats.civilizations[me.civilizationId] = stats.civilizations[
      me.civilizationId
    ] || {
      civilization: me.civilization,
      wins: 0,
      losses: 0,
    };
    if (me.winner) {
      stats.civilizations[me.civilizationId].wins += 1;
    } else if (me.winner === false) {
      stats.civilizations[me.civilizationId].losses += 1;
    }
  });
  const winRates = Object.values(stats.civilizations)
    .filter(({ wins, losses }) => wins + losses >= matches.length * 0.01)
    .sort((a, z) => z.wins - a.wins);

  const data: LoaderData = {
    matches,
    winRates,
  };
  return data;
};

export default function Matches() {
  const data = useLoaderData<LoaderData>();
  let wins = 0;
  let losses = 0;
  data.winRates.forEach((winRate) => {
    wins += winRate.wins;
    losses += winRate.losses;
  });
  const winRate = parseInt((wins / (wins + losses)) * 100, 10);
  const best = data.winRates.slice(0, 6);
  const worse = data.winRates.slice(
    data.winRates.length - 5,
    data.winRates.length
  );
  const more = data.winRates.slice(5, data.winRates.length - 5);
  return (
    <>
      <div className="max-w-prose mx-auto w-full space-y-4 mt-10">
        <h3
          className={cn("text-4xl", {
            "text-green-500": winRate >= 50,
            "text-red-600": winRate < 50,
          })}
        >
          {winRate}%
        </h3>
        <ul>
          {best.map(({ civilization: { id, name }, wins, losses }) => (
            <li key={id}>
              {name}{" "}
              <span className="text-green-800">
                {parseInt((wins / (wins + losses)) * 100, 10)}%
              </span>{" "}
              win rate out of {wins + losses} matches.
            </li>
          ))}
        </ul>
        <details>
          <summary>See more</summary>
          <ul>
            {more.map(({ civilization: { id, name }, wins, losses }) => (
              <li key={id}>
                {name}{" "}
                <span className="text-blue-500">
                  {parseInt((wins / (wins + losses)) * 100, 10)}%
                </span>{" "}
                out of {wins + losses} matches.
              </li>
            ))}
          </ul>
        </details>
        <ul>
          {worse.map(({ civilization: { id, name }, wins, losses }) => (
            <li key={id}>
              {name}{" "}
              <span className="text-red-500">
                {parseInt((wins / (wins + losses)) * 100, 10)}%
              </span>{" "}
              out of {wins + losses} matches.
            </li>
          ))}
        </ul>
      </div>
      <ul className="max-w-prose mx-auto w-full space-y-4">
        {data.matches.map((match) => (
          <li key={match.id}>
            {match.id} on {match.map?.name} played at {match.startedAt} and
            lasted{" "}
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
                  {player?.name} as {civilization?.name}{" "}
                  <span className="text-sm font-mono">{player.id}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}
