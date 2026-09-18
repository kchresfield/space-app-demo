import "dotenv/config";

import { basicAuth, requireEnv, twilioRequest } from "./twilio-api.js";

async function showIntelligence() {
  requireEnv(["TWILIO_API_KEY", "TWILIO_API_SECRET"]);

  const conversationId = process.argv[2];
  if (!conversationId) {
    throw new Error("Usage: node show-intelligence.js <conversation_id>");
  }

  const auth = basicAuth(process.env.TWILIO_API_KEY, process.env.TWILIO_API_SECRET);
  const url = `https://intelligence.twilio.com/v3/OperatorResults?conversationId=${encodeURIComponent(
    conversationId,
  )}`;
  const data = await twilioRequest("GET", url, { auth });
  console.log(JSON.stringify(data, null, 2));
}

showIntelligence().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
