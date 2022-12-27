import { updateMatchStatus, getMatch } from "~/models";
import { json } from "@remix-run/node";

export async function loader({ params }) {
  const match = await getMatch(params.matchId);
  if (match) {
    return json(match);
  }
  return json({ message: "match not found" }, { status: 404 });
}

export async function action({ request, params }) {
  const match = await getMatch(params.matchId);
  if (!match) {
    return json({ message: "match not found" }, { status: 404 });
  }
  const payload = await request.json();
  if (request.method === "PATCH") {
    await updateMatchStatus(params.matchId, payload.status);
  }

  return match;
}
