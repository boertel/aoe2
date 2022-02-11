import cn from "classnames";
import dayjs from "dayjs";
import { useLoaderData } from "remix";
import type { LoaderFunction } from "remix";
import type { Match } from "@prisma/client";
import { duration } from "@boertel/duration";
import calendar from "dayjs/plugin/calendar";
dayjs.extend(calendar);

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

  let winRates = [...data.winRates];
  const winRate = parseInt((wins / (wins + losses)) * 100, 10);
  const best = winRates.splice(0, 5);
  const worse = winRates.splice(winRates.length - 5, 5);
  return (
    <>
      <div className="max-w-prose mx-auto w-full space-y-4 mt-10 px-4">
        <h3
          className={cn("text-4xl", {
            "text-green-500": winRate >= 50,
            "text-red-600": winRate < 50,
          })}
        >
          {winRate}%
        </h3>
        <div className="flex justify-between">
          <WinRates winRates={best} className="text-green-600" />
          <WinRates winRates={worse} className="text-red-600" />
        </div>
        <details>
          <summary>See other civilizations</summary>
          <WinRates winRates={winRates} />
        </details>
      </div>
      <ul className="max-w-prose mx-auto w-full space-y-4 p-4">
        {data.matches.map((match) => (
          <li key={match.id}>
            <Match key={match.id} {...match} />
          </li>
        ))}
      </ul>
    </>
  );
}

function WinRates({ winRates, className }) {
  return (
    <ul>
      {winRates.map(({ civilization: { id, name }, wins, losses }) => (
        <li key={id}>
          {name}{" "}
          <span className={className}>
            {parseInt((wins / (wins + losses)) * 100, 10)}%
          </span>{" "}
          out of {wins + losses} matches.
        </li>
      ))}
    </ul>
  );
}

function Match({ players, durationReal, startedAt, map }) {
  const playerId = "2918752";
  let me = {};
  let teams = {};
  players.forEach((player) => {
    teams[player.team] = teams[player.team] || [];
    if (playerId === player.playerId) {
      me = player;
    }
    teams[player.team].push(player);
  });
  return (
    <div
      className={cn(
        "flex flex-col group border border-yellow-400 border-opacity-20 hover:border-opacity-100 transition-opacity rounded-md p-4 bg-opacity-10 space-y-2 cursor-pointer",
        { "bg-green-600": me.winner, "bg-red-600": me.winner === false }
      )}
    >
      <div className="flex justify-between">
        {Object.values(teams).map((players, index) => {
          return (
            <ul
              key={index}
              className={cn(
                "flex flex-col gap-2",
                me.team === index + 1 && {
                  "text-red-600": me.winner === false,
                  "text-green-600": me.winner === true,
                }
              )}
            >
              {players.map(
                ({ player, playerId, winner, colorId, civilization }) => (
                  <li
                    className={cn("flex items-center gap-1", {
                      "flex-row-reverse": index === 1,
                    })}
                    key={playerId}
                  >
                    <img
                      width="24px"
                      height="24px"
                      src={`https://aoecompanion.com/civ-icons/${civilization.name.toLowerCase()}.png`}
                    />
                    <Dot colorId={colorId} />
                    {player.name}
                  </li>
                )
              )}
            </ul>
          );
        })}
      </div>
      <ul className="text-gray-500 text-sm font-light flex justify-between">
        <li>{map.name}</li>
        <li>
          <span className="font-medium">{dayjs(startedAt).calendar()}</span> for{" "}
          {duration(durationReal).format(["h HH", "m MM"])}
        </li>
      </ul>
    </div>
  );
}

const COLORS = {
  1: "#0000FF",
  2: "#FB0006",
  3: "#23FF07",
  4: "#FFFF09",
  5: "#22FFFF",
  6: "#FB00FF",
  7: "#2E2E2E",
  8: "#FC6D07",
};

function Dot({ colorId }) {
  return (
    <div
      className="w-2 h-2 opacity-10 group-hover:opacity-100 transition-opacity"
      style={{ backgroundColor: COLORS[colorId + 1] }}
    />
  );
}
