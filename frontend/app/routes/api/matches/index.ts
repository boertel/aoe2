import { createMatch } from "~/models";
import { json } from "@remix-run/node";

export async function action({ request }) {
  const payload = await request.json();
  let output = [];
  for (let i = 0; i < payload.length; i += 1) {
    output.push(await createMatch(payload[i]));
  }
  return json(output);
}
