import { PubSub } from "@google-cloud/pubsub";
import { json } from "remix";

const projectId = process.env.GOOGLE_PUBSUB_PROJECT_ID;
const credentials = JSON.parse(
  Buffer.from(process.env.GOOGLE_SA_KEY, "base64")
);

const pubsub = new PubSub({ projectId, credentials });

export async function action({ params }) {
  // TODO rate limit
  const attributes = {
    profile_id: params.playerId,
  };
  const dataBuffer = Buffer.from("");
  const topicId = "match_for_player";
  const messageId = await pubsub.topic(topicId).publish(dataBuffer, attributes);
  return json({ messageId });
}
