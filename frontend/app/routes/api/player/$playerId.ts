import { PubSub } from "@google-cloud/pubsub";
import { json } from "remix";
import { db } from "~/db.server";

const projectId = process.env.GOOGLE_PUBSUB_PROJECT_ID;
const credentials = JSON.parse(
  Buffer.from(process.env.GOOGLE_SA_KEY, "base64")
);

const pubsub = new PubSub({ projectId, credentials });

export async function action({ params, request }) {
  const ipAddress =
    request.headers["x-forwarded-for"] || request.socket?.remoteAddress || null;
  console.log(ipAddress, request.headers);
  const where = {
    ipAddress,
  };

  if (ipAddress) {
    const rateLimit = await db.rateLimit.findFirst({
      where,
    });

    if (rateLimit.count >= 50 && rateLimit.updatedAt) {
      throw new Response("rate limit");
    }
    await db.rateLimit.upsert({
      where,
      create: {
        ...where,
        count: 1,
      },
      update: {
        count: (rateLimit.count || 0) + 1,
      },
    });
  }

  const attributes = {
    profile_id: params.playerId,
  };
  const dataBuffer = Buffer.from("");
  const topicId = "match_for_player";
  const messageId = await pubsub.topic(topicId).publish(dataBuffer, attributes);
  return json({ messageId });
}
