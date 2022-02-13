import cn from "classnames";
import dayjs from "dayjs";
import { useLoaderData, Link } from "remix";
import type { MetaFunction, LoaderFunction } from "remix";
import type { Civilization, Match } from "@prisma/client";
import { duration } from "@boertel/duration";
import calendar from "dayjs/plugin/calendar";
import { useParams } from "react-router-dom";
dayjs.extend(calendar);

import { db } from "~/db.server";

type LoaderData = { matches: Array<Match>; civilizations: Array<Civilization> };

export const meta: MetaFunction = () => {
  return {
    title: "AoE2",
  };
};

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
  const winRates = Object.values(stats.civilizations).sort(
    (a, z) => z.wins / (z.wins + z.losses) - a.wins / (a.wins + a.losses)
  );

  const civilizations = await db.civilization.findMany();
  const data: LoaderData = {
    matches,
    winRates,
    civilizations,
  };
  return data;
};

const formatter = new Intl.ListFormat("en", {
  style: "long",
  type: "conjunction",
});

export default function Matches() {
  const data = useLoaderData<LoaderData>();
  let wins = 0;
  let losses = 0;

  const civilizationsPlayed: number[] = [];

  data.winRates.forEach((winRate) => {
    wins += winRate.wins;
    losses += winRate.losses;
    civilizationsPlayed.push(winRate.civilization.id);
  });

  let winRates = [...data.winRates].filter(
    ({ wins, losses }) => wins + losses >= data.matches.length * 0.01
  );
  const winRate = parseInt((wins / (wins + losses)) * 100, 10);
  const best = winRates.splice(0, 5);
  const worse = winRates.splice(winRates.length - 5, 5);

  return (
    <>
      <div className="max-w-prose mx-auto w-full space-y-4 mt-10 px-4">
        <h3
          className={cn("text-4xl group flex gap-2 items-center", {
            "text-green-500": winRate >= 50,
            "text-red-600": winRate < 50,
          })}
        >
          <div>{winRate}%</div>
          <div className="text-sm text-gray-500 transition-opacity text-opacity-0 group-hover:text-opacity-100">
            {wins}/{wins + losses}
          </div>
        </h3>
        <div className="flex justify-between flex-wrap">
          <WinRates winRates={best} className="text-green-600" />
          <WinRates winRates={worse} className="text-red-600" />
        </div>
        <details>
          <summary>See other civilizations</summary>
          <div className="mt-2">
            <WinRates winRates={winRates} className="text-blue-600" />

            <div className="mt-4 mb-1 ml-2">Civilizations never played:</div>
            <div className="ml-6">
              {formatter.format(
                data.civilizations
                  .filter(({ id }) => !civilizationsPlayed.includes(id))
                  .map(({ name }) => name)
              )}
            </div>
          </div>
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
    <ul className="flex flex-col gap-2">
      {winRates.map(({ civilization: { id, name }, wins, losses }) => (
        <li className="flex gap-2 group" key={id}>
          <div className={cn("tabular-nums w-[5ch] text-right", className)}>
            {parseInt((wins / (wins + losses)) * 100, 10)}%
          </div>
          <div className="flex gap-2">
            <img
              style={{ width: "24px", height: "24px" }}
              className="flex-shrink-0"
              src={`https://aoecompanion.com/civ-icons/${name.toLowerCase()}.png`}
            />
            {name}
          </div>
          <div className="text-gray-500 transition-opacity text-opacity-0 group-hover:text-opacity-100">
            {wins}/{wins + losses}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Match({
  id,
  players,
  durationReal,
  startedAt,
  map,
  leaderboardType,
  ratingType,
}) {
  const { playerId } = useParams();
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
    <Link
      to={`/match/${id}`}
      className={cn(
        "flex flex-col group border border-yellow-400 border-opacity-20 hover:border-opacity-100 transition-opacity rounded-md p-4 bg-opacity-10 space-y-2 cursor-pointer",
        durationReal > 5 * 60
          ? { "bg-green-600": me.winner, "bg-red-600": me.winner === false }
          : "bg-gray-100 border-gray-400"
      )}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                    className={cn("flex items-center gap-2", {
                      "flex-row sm:flex-row-reverse": index === 1,
                    })}
                    key={playerId}
                  >
                    <img
                      width="24px"
                      height="24px"
                      src={`https://aoecompanion.com/civ-icons/${civilization.name.toLowerCase()}.png`}
                    />
                    <Dot colorId={colorId} />
                    <div className="text-ellipsis overflow-hidden">
                      {player?.name}
                    </div>
                  </li>
                )
              )}
            </ul>
          );
        })}
      </div>
      <ul className="text-gray-500 text-sm font-light flex justify-between flex-wrap gap-1">
        <li>
          {getRatingLabel(ratingType)} on{" "}
          <span className="font-medium">{map?.name || "Unknown"}</span>
        </li>
        <li>
          <span className="font-medium">{dayjs(startedAt).calendar()}</span> for{" "}
          {duration(durationReal).format(["h HH", "m MM"])}
        </li>
      </ul>
    </Link>
  );
}

function getLeaderboardLabel(leaderboardType) {
  return (
    {
      0: "Unranked",
      1: "1v1 Death Match",
      2: "Team Death Match",
      3: "1v1 Random Map",
      4: "Team Random Map",
      13: "1v1 Empire Wars",
      14: "Team Empire Wars",
    }[leaderboardType] || ""
  );
}

function getRatingLabel(ratingType) {
  return (
    {
      0: "Unranked",
      1: "1v1 Death Match",
      2: "1v1 Random Map",
      3: "Team Death Match",
      4: "Team Random Map",
      5: "1v1 Random Map Quick Play",
      6: "Team Random Map Quick Play",
      7: "1v1 Empire Wars Quick Play",
      8: "Team Empire Wars Quick Play",
      9: "Battle Royale Quick Play",
      13: "1v1 Empire Wars",
      14: "Team Empire Wars",
    }[ratingType] || ""
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
      className="flex-shrink-0 w-2 h-2 rounded-full opacity-10 group-hover:opacity-100 transition-opacity"
      style={{ backgroundColor: COLORS[colorId + 1] }}
    />
  );
}
