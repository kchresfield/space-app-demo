import "dotenv/config";

import { SMSChannel, TAC, TACConfig, TACServer, VoiceChannel } from "twilio-agent-connect";

import { handleAgentMessage } from "./agents/field-shift-agent.js";

for (const name of [
  "TWILIO_RCS_SENDER_ID",
  "TWILIO_WHATSAPP_NUMBER",
  "TWILIO_VOICE_PUBLIC_DOMAIN",
  "OPENAI_MODEL",
  "AIR_QUALITY_PROVIDER",
  "AIRNOW_API_KEY",
]) {
  if (!process.env[name]) delete process.env[name];
}

const tac = await TAC.create({ config: TACConfig.fromEnv() });

tac.registerChannel(new VoiceChannel(tac, { memoryMode: "always" }));
tac.registerChannel(new SMSChannel(tac, { memoryMode: "always" }));

tac.onMessageReady(async ({ conversationId, message, memory, session, channel }) => {
  console.log(`[${channel}] ${message}`);
  return handleAgentMessage(message, { conversationId, memory, session, channel });
});

await new TACServer(tac, {
  host: process.env.TWILIO_SERVER_HOST || "0.0.0.0",
  port: Number.parseInt(process.env.TWILIO_SERVER_PORT || process.env.PORT || "8000", 10),
}).start();
