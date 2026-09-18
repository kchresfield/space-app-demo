import "dotenv/config";

import { fileURLToPath } from "node:url";

import OpenAI from "openai";
import {
  MemoryPromptBuilder,
  RCSChannel,
  SMSChannel,
  TAC,
  TACConfig,
  TACServer,
  VoiceChannel,
  WhatsAppChannel,
} from "twilio-agent-connect";

import { normalizeZipCode } from "./data.js";
import { maskPhone, normalizePhoneAddress, obfuscateArgs, sameAddress } from "./helpers.js";
import { buildOpenAITools, toolMap } from "./tools.js";

const histories = new Map();
const openaiTools = buildOpenAITools();

let openaiClient;

const optionalEnvVars = [
  "TWILIO_RCS_SENDER_ID",
  "TWILIO_WHATSAPP_NUMBER",
  "TWILIO_VOICE_PUBLIC_DOMAIN",
  "OPENAI_MODEL",
  "AIR_QUALITY_PROVIDER",
  "AIRNOW_API_KEY",
];
const aqiLookupWaitingMessage = "One moment while I check the air quality for that ZIP code.";
const aqiLookupPattern =
  /\b\d{4,5}(?:-\d{4})?\b|\b(?:AQI|air quality|air pollution|pollution|smoke|ozone|particulate|PM\s*2\.?5|PM\s*10)\b/i;

export const SYSTEM_PROMPT = `You are Orbit AQI, a friendly and efficient air quality assistant for a NASA Space Apps demo.

Help customers with:
- Looking up the air quality index by 5-digit US ZIP code
- Explaining AQI category, dominant pollutant, and health guidance
- Comparing air quality across ZIP codes
- Remembering a preferred ZIP code when a caller provides one

Guidelines:
- Always use tools for AQI values. Do not invent AQI readings.
- If a user asks for AQI but does not provide a ZIP code, ask for a 5-digit US ZIP code.
- If the customer's phone number is available and no ZIP is provided, try get_preferred_zip_by_phone before asking.
- If the user provides a ZIP code and asks to remember it, call save_preferred_zip.
- If a tool response says the source is Demo sample data, clearly say it is demo data, not live regulatory guidance.
- If a tool response says the source is AirNow, treat it as the current observation returned by AirNow.
- Do not use markdown formatting; plain text only, since responses are sent via SMS and Voice.
- Keep responses concise and practical.
- For Voice channel: keep responses brief and conversational. Say "A Q I" instead of "AQI" when it improves speech clarity.
- If memory from past interactions is available, briefly acknowledge it to personalize the experience.
- If the user reports severe symptoms or an emergency, tell them to contact local emergency services or a medical professional.`;

function getOpenAIClient() {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function requireEnv(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

function normalizeEnv() {
  for (const name of Object.keys(process.env)) {
    if (
      name.startsWith("TWILIO_") ||
      name.startsWith("OPENAI_") ||
      name.startsWith("AIRNOW_") ||
      name === "AIR_QUALITY_PROVIDER"
    ) {
      process.env[name] = String(process.env[name]).trim();
    }
  }

  for (const name of optionalEnvVars) {
    if (!process.env[name]) {
      delete process.env[name];
    }
  }
}

function validateEnvFormats() {
  const conversationConfigId = process.env.TWILIO_CONVERSATION_CONFIGURATION_ID;
  const rcsSenderId = process.env.TWILIO_RCS_SENDER_ID;
  const provider = process.env.AIR_QUALITY_PROVIDER;

  if (!/^conv_configuration_[0-9a-z]{26}$/.test(conversationConfigId)) {
    throw new Error(
      "TWILIO_CONVERSATION_CONFIGURATION_ID must look like conv_configuration_01abc... Copy the value printed by `npm run setup`; older CC... IDs will not work with TAC.",
    );
  }

  if (rcsSenderId && !/^rcs:.+$/.test(rcsSenderId)) {
    throw new Error(
      "TWILIO_RCS_SENDER_ID is optional. Remove it or leave it blank if you are not using RCS; if you are using RCS, set it to rcs:<sender-id-or-phone>, for example rcs:+15551234567.",
    );
  }

  if (provider && !["mock", "auto", "airnow"].includes(provider.toLowerCase())) {
    throw new Error("AIR_QUALITY_PROVIDER must be mock, auto, or airnow.");
  }
}

function getHistory(conversationId) {
  const key = String(conversationId);
  if (!histories.has(key)) {
    histories.set(key, []);
  }
  return histories.get(key);
}

function parseToolArguments(toolCall) {
  try {
    return JSON.parse(toolCall.function?.arguments || "{}");
  } catch (error) {
    return {
      __parse_error: `Invalid JSON arguments: ${error.message}`,
    };
  }
}

function resolveCallerPhone({ author, session }) {
  const candidates = [
    session?.authorInfo?.address,
    author,
    session?.customerAddress,
    session?.customer?.address,
  ];

  for (const candidate of candidates) {
    const phone = normalizePhoneAddress(candidate);
    if (phone && !sameAddress(phone, process.env.TWILIO_PHONE_NUMBER)) {
      return phone;
    }
  }

  return "";
}

function shouldSendAqiLookupWaitingMessage(message) {
  const text = String(message || "");
  return aqiLookupPattern.test(text) || Boolean(normalizeZipCode(text));
}

function buildModelMessage(message) {
  const text = String(message || "");
  const zipCode = normalizeZipCode(text);

  if (!zipCode) return text;

  return `${text}\n\nVoice transcription hint: interpret the ZIP code as ${zipCode}.`;
}

async function sendAqiLookupWaitingMessage(tac, channel, conversationId, message) {
  if (!shouldSendAqiLookupWaitingMessage(message)) return;

  const activeChannel = tac.getChannel(channel);
  if (!activeChannel) return;

  try {
    await activeChannel.sendResponse(conversationId, aqiLookupWaitingMessage);
  } catch (error) {
    console.warn(`Could not send waiting message: ${error.message || error}`);
  }
}

export async function generateReply(conversationId, systemPrompt, userMessage) {
  const history = getHistory(conversationId);
  history.push({ role: "user", content: userMessage });

  const messages = [{ role: "system", content: systemPrompt }, ...history];

  for (let toolTurn = 0; toolTurn < 6; toolTurn += 1) {
    const completion = await getOpenAIClient().chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      messages,
      tools: openaiTools,
      tool_choice: "auto",
    });

    const message = completion.choices[0]?.message;
    const toolCalls = message?.tool_calls || [];

    if (toolCalls.length) {
      messages.push(message);

      for (const toolCall of toolCalls) {
        const tool = toolMap.get(toolCall.function?.name);
        const args = parseToolArguments(toolCall);
        let result;

        if (args.__parse_error) {
          result = JSON.stringify({ error: args.__parse_error });
        } else if (!tool) {
          result = JSON.stringify({ error: `Unknown tool: ${toolCall.function?.name}` });
        } else {
          try {
            result = await tool(args);
          } catch (error) {
            result = JSON.stringify({ error: error.message });
          }
        }

        console.log(
          `  [tool] ${toolCall.function?.name}(${JSON.stringify(obfuscateArgs(args))}) -> ${result.slice(0, 160)}`,
        );

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      continue;
    }

    const reply = message?.content || "";
    history.push({ role: "assistant", content: reply });
    return reply;
  }

  const fallback = "I'm sorry, I could not complete that air quality lookup. Please try again with a 5-digit ZIP code.";
  history.push({ role: "assistant", content: fallback });
  return fallback;
}

function createChannels(tac) {
  const channels = [];

  const voiceChannel = new VoiceChannel(tac, { memoryMode: "always" });
  tac.registerChannel(voiceChannel);
  channels.push("Voice");

  const smsChannel = new SMSChannel(tac, { memoryMode: "always" });
  tac.registerChannel(smsChannel);
  channels.push("SMS");

  if (process.env.TWILIO_WHATSAPP_NUMBER) {
    const whatsAppChannel = new WhatsAppChannel(tac, { memoryMode: "always" });
    tac.registerChannel(whatsAppChannel);
    channels.push("WhatsApp");
  }

  if (process.env.TWILIO_RCS_SENDER_ID) {
    const rcsChannel = new RCSChannel(tac, { memoryMode: "always" });
    tac.registerChannel(rcsChannel);
    channels.push("RCS");
  }

  return channels;
}

export async function main() {
  normalizeEnv();
  requireEnv([
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_API_KEY",
    "TWILIO_API_SECRET",
    "TWILIO_PHONE_NUMBER",
    "TWILIO_CONVERSATION_CONFIGURATION_ID",
    "OPENAI_API_KEY",
  ]);
  validateEnvFormats();

  const tac = await TAC.create({ config: TACConfig.fromEnv() });
  const channels = createChannels(tac);

  tac.onMessageReady(async ({ conversationId, profileId, message, author, memory, session, channel }) => {
    const callerPhone = resolveCallerPhone({ author, session });

    console.log(
      `[${channel}] conv=${conversationId} profile=${profileId || session?.profileId || "unknown"} phone=${
        callerPhone ? maskPhone(callerPhone) : "unknown"
      }`,
    );
    console.log(`  -> "${message}"`);

    let basePrompt = SYSTEM_PROMPT;
    if (channel === "voice") {
      basePrompt += "\n\nThis is a Voice call, so be extra concise.";
    }
    if (callerPhone) {
      basePrompt += `\n\nThe customer's phone number is ${callerPhone}. Use get_preferred_zip_by_phone when they ask for air quality but do not provide a ZIP code. Use save_preferred_zip if they ask you to remember a ZIP.`;
    }

    const zipCode = normalizeZipCode(message);
    if (zipCode) {
      console.log(`  [zip] normalized=${zipCode}`);
    }

    const systemPrompt = MemoryPromptBuilder.compose(basePrompt, memory, session);
    const modelMessage = buildModelMessage(message);
    await sendAqiLookupWaitingMessage(tac, channel, conversationId, message);
    const reply = await generateReply(conversationId, systemPrompt, modelMessage);

    console.log(`  <- "${reply}"`);
    return reply;
  });

  const host = process.env.TWILIO_SERVER_HOST || "0.0.0.0";
  const port = Number.parseInt(process.env.TWILIO_SERVER_PORT || process.env.PORT || "8000", 10);
  const domain = process.env.TWILIO_VOICE_PUBLIC_DOMAIN || "<domain>";

  console.log(`Space Apps AQI agent starting on ${host}:${port}.`);
  console.log("Webhook : POST /webhook  (SMS, WhatsApp, RCS)");
  console.log("TwiML   : POST /twiml    (inbound calls)");
  console.log(`WS      : wss://${domain}/ws`);
  console.log(`Channels: ${channels.join(", ")}`);
  console.log(`AQI data: ${process.env.AIR_QUALITY_PROVIDER || "mock"}`);

  const server = new TACServer(tac, { host, port });
  await server.start();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
