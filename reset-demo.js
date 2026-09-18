import "dotenv/config";

import { basicAuth, requireEnv, twilioRequest } from "./twilio-api.js";

async function resetDemo() {
  requireEnv(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_MEMORY_STORE_ID"]);

  const storeId = process.env.TWILIO_MEMORY_STORE_ID;
  const auth = basicAuth(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const listUrl = `https://memory.twilio.com/v1/Stores/${storeId}/Profiles`;

  console.log(`Fetching profiles from ${storeId}...`);
  const data = await twilioRequest("GET", listUrl, { auth });
  const items = Object.values(data).find((value) => Array.isArray(value)) || [];

  if (!items.length) {
    console.log("No profiles found; already clean.");
    return;
  }

  for (const profile of items) {
    const profileId = typeof profile === "string" ? profile : profile.id;
    await twilioRequest("DELETE", `${listUrl}/${profileId}`, { auth });
    console.log(`Deleted ${profileId}`);
  }

  console.log(`Done; deleted ${items.length} profile(s).`);
}

resetDemo().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
