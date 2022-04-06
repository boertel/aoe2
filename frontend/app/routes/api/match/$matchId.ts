import { createMatch, getMatch } from "~/models";
import { json } from "@remix-run/node";

export async function loader({ params }) {
  const match = await getMatch(params.matchId);
  if (match) {
    return json(match);
  }
  return json({ message: "match not found" }, { status: 404 });
}

export async function action({ request }) {
  const payload = await request.json();
  console.log(JSON.stringify(payload));
  const match = await createMatch(payload);
  console.log(match);
  return new Response(match, {
    status: 200,
  });
}
