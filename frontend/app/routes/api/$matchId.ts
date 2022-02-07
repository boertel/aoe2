import { createMatch } from "~/models";

export const action = async ({ request }) => {
  const payload = await request.json();
  console.log(payload);
  const match = await createMatch(payload);
  console.log(match);
  return new Response(match, {
    status: 200,
  });
};
