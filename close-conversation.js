import "dotenv/config";

import { basicAuth, requireEnv, twilioRequest } from "./twilio-api.js";

async function closeConversation() {
  requireEnv(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]);

  const conversationId = process.argv[2];
  if (!conversationId) {
    throw new Error("Usage: node close-conversation.js <conversation_id>");
  }

  const auth = basicAuth(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const url = `https://conversations.twilio.com/v2/Conversations/${encodeURIComponent(conversationId)}`;
  const data = await closeWithJson(url, auth);

  console.log(data.id || data.sid || conversationId);
}

async function closeWithJson(url, auth) {
  try {
    return await twilioRequest("PATCH", url, {
      auth,
      body: { status: "CLOSED" },
    });
  } catch (error) {
    if (![400, 415, 422].includes(error.status)) {
      throw error;
    }

    const form = new URLSearchParams({ Status: "closed" }).toString();
    return twilioRequest("PATCH", url, {
      auth,
      body: form,
      contentType: "application/x-www-form-urlencoded",
    });
  }
}

closeConversation().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
