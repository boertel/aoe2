import cn from "classnames";
import dayjs from "dayjs";
import {
  useLoaderData,
  Link,
  ActionFunction,
  useActionData,
} from "@remix-run/react";
import type { LoaderFunction } from "@remix-run/react";
import { PubSub } from "@google-cloud/pubsub";
import type { Civilization, Match, PlayersOnMatches } from "@prisma/client";
import { duration } from "@boertel/duration";
import calendar from "dayjs/plugin/calendar";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(calendar);
dayjs.extend(relativeTime);

import { rateLimit } from "~/rateLimit.server";
import { db } from "~/db.server";

interface WinRate {
  civilization: Civilization;
  wins: number;
  losses: number;
}

type LoaderData = {
  matches: Array<Match>;
  civilizations: Array<Civilization>;
  playerId?: string;
  winRates: Array<WinRate>;
};

export let loader: LoaderFunction = async ({ request, params }) => {
  const { playerId } = params;
  const player = await db.player.findUnique({
    where: {
      id: playerId,
    },
  });
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
  const stats: { civilizations: Record<string, WinRate> } = {
    civilizations: {},
  };
  matches.forEach(({ players }) => {
    const currentPlayer:
      | (PlayersOnMatches & { civilization: Civilization })
      | undefined = players.find(
      ({ playerId }) => playerId === params.playerId
    );

    if (!currentPlayer) {
      return;
    }

    stats.civilizations[currentPlayer.civilizationId] = stats.civilizations[
      currentPlayer.civilizationId
    ] || {
      civilization: currentPlayer.civilization,
      wins: 0,
      losses: 0,
    };
    if (currentPlayer.winner) {
      stats.civilizations[currentPlayer.civilizationId].wins += 1;
    } else if (currentPlayer.winner === false) {
      stats.civilizations[currentPlayer.civilizationId].losses += 1;
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
    player,
  };
  return data;
};

const projectId = process.env.GOOGLE_PUBSUB_PROJECT_ID;
const credentials = JSON.parse(
  Buffer.from(process.env.GOOGLE_SA_KEY, "base64")
);

const pubsub = new PubSub({ projectId, credentials });

export const action: ActionFunction = async ({ params, request }) => {
  rateLimit(request, { count: 5, minutes: 15 });
  const { playerId } = params;

  const attributes = {
    profile_id: params.playerId,
  };
  const dataBuffer = Buffer.from("");
  const topicId = "match_for_player";
  const messageId = await pubsub.topic(topicId).publish(dataBuffer, attributes);
  const player = await db.player.update({
    where: {
      id: playerId,
    },
    data: {
      syncedAt: new Date(),
    },
  });
  return { player, messageId };
};

const formatter = new Intl.ListFormat("en", {
  style: "long",
  type: "conjunction",
});

export default function Matches() {
  const data = useLoaderData<LoaderData>();
  const actionData = useActionData();
  let wins: number = 0;
  let losses: number = 0;

  const civilizationsPlayed: number[] = [];

  data.winRates.forEach((winRate) => {
    wins += winRate.wins;
    losses += winRate.losses;
    civilizationsPlayed.push(winRate.civilization.id);
  });

  let winRates = [...data.winRates].filter(
    ({ wins, losses }) => wins + losses >= data.matches.length * 0.01
  );
  const winRate = Math.floor((wins / (wins + losses)) * 100);
  const best = winRates.splice(0, 5);
  const worse = winRates.splice(winRates.length - 5, 5);

  const syncedAt = dayjs(actionData?.syncedAt || data.player.syncedAt);
  const diff = dayjs().diff(syncedAt, "minutes");

  return (
    <>
      <div className="max-w-prose mx-auto w-full space-y-4 mt-10 px-4">
        <h3 className="flex items-center justify-between">
          <div
            className={cn("text-4xl group flex gap-2 items-center", {
              "text-green-500": winRate >= 50,
              "text-red-600": winRate < 50,
            })}
          >
            <div>{winRate}%</div>
            <div className="text-sm text-gray-500 transition-opacity text-opacity-0 group-hover:text-opacity-100">
              {wins}/{wins + losses}
            </div>
          </div>
          <form method="POST">
            <button
              disabled={diff < 15}
              title={diff < 15 ? `Allow in ${15 - diff} minutes` : null}
              className="flex items-center border-2 px-4 py-1 text-sm bg-amber-400 bg-opacity-0 transition-opacity hover:bg-opacity-40 text-amber-400 focus:bg-opacity-40 rounded-md border-amber-400 disabled:bg-gray-400 disabled:bg-opacity-20 disabled:border-gray-400 disabled:border-opacity-60 disabled:text-gray-400 disabled:text-opacity-60 disabled:cursor-not-allowed"
            >
              refresh
            </button>
          </form>
        </h3>
        <div className="gap-2 grid grid-cols-1 md:grid-cols-2">
          <WinRates winRates={best} className="text-green-600" />
          <WinRates winRates={worse} className="text-red-600" />
          <details className="md:col-span-2">
            <summary className="cursor-pointer pl-4 hover:underline">
              See other civilizations
            </summary>
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

        <div className="text-xs text-gray-500">
          Last synced {syncedAt.fromNow()}
        </div>
      </div>
      <ul className="max-w-prose mx-auto w-full space-y-4 p-4">
        {data.matches.map((match) => (
          <li key={match.id}>
            <Match key={match.id} {...match} playerId={data.player.id} />
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
  playerId,
}) {
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
        "flex flex-col group border border-opacity-20 hover:border-opacity-100 transition-opacity rounded-md p-4 bg-opacity-10 space-y-2 cursor-pointer",
        durationReal > 5 * 60
          ? {
              "bg-green-600 border-green-600": me.winner,
              "bg-red-600 border-red-600": me.winner === false,
            }
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
                ({ player, playerId, winner, color, civilization, rating }) => (
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
                    <Dot colorId={color} />
                    <div
                      className={cn("flex items-center gap-2 flex-wrap", {
                        "flex-row sm:flex-row-reverse": index === 1,
                      })}
                    >
                      <div className="text-ellipsis overflow-hidden">
                        {player?.name}
                      </div>
                      <div className="text-xs opacity-60">{rating}</div>
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
          {duration(durationReal * 1000).format(["h HH", "m MM"])}
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
