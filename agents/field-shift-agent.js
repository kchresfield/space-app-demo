import "dotenv/config";

import OpenAI from "openai";
import { MemoryPromptBuilder } from "twilio-agent-connect";

import { buildZipAwareUserMessage, normalizeZipCode, zipMemoryInstruction } from "./zip-memory.js";

export { normalizeZipCode };

const conversationHistory = new Map();
let openaiClient;

const mockFieldData = new Map([
  [
    "10027",
    {
      zipCode: "10027",
      location: "New York, NY",
      tempCelsius: 21.4,
      precipitationMm: 2.1,
      rootZoneSoilWetnessRatio: 0.62,
      source: "Demo sample data",
    },
  ],
  [
    "90026",
    {
      zipCode: "90026",
      location: "Los Angeles, CA",
      tempCelsius: 28.2,
      precipitationMm: 0.0,
      rootZoneSoilWetnessRatio: 0.28,
      source: "Demo sample data",
    },
  ],
  [
    "94103",
    {
      zipCode: "94103",
      location: "San Francisco, CA",
      tempCelsius: 17.6,
      precipitationMm: 0.3,
      rootZoneSoilWetnessRatio: 0.48,
      source: "Demo sample data",
    },
  ],
  [
    "85004",
    {
      zipCode: "85004",
      location: "Phoenix, AZ",
      tempCelsius: 34.1,
      precipitationMm: 0.0,
      rootZoneSoilWetnessRatio: 0.18,
      source: "Demo sample data",
    },
  ],
]);

const tools = [
  {
    type: "function",
    function: {
      name: "get_nasa_ag_data",
      description:
        "Fetch NASA POWER agricultural climate and soil data for a 5-digit US ZIP code.",
      parameters: {
        type: "object",
        properties: {
          zip_code: {
            type: "string",
            description: "A 5-digit US ZIP code, for example 10027.",
          },
        },
        required: ["zip_code"],
      },
    },
  },
];

const systemPrompt = `You are Field Shift, a concise agricultural advisor powered by NASA Earth observations.

Guidelines:
- Use get_nasa_ag_data before giving location-specific field guidance.
- If the user does not provide a ZIP code, ask for a 5-digit US ZIP code.
${zipMemoryInstruction("NASA field-data")}
- If a voice transcription hint provides a normalized ZIP code, use that ZIP code.
- Explain temperature, recent precipitation, and root-zone soil wetness in plain language.
- Give practical crop, irrigation, soil, or field-work guidance in one or two short paragraphs.
- If the source is Demo sample data, clearly say it is demo data.
- Do not use markdown formatting, asterisks, bullets, or emojis.`;

function getOpenAIClient() {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function daysAgo(count) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - count);
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function latestValidValue(values) {
  return Object.values(values || {})
    .reverse()
    .find((value) => value !== null && value !== undefined && Number(value) !== -999);
}

function normalizeFieldData(data) {
  return {
    zip_code: data.zipCode,
    location: data.location,
    temp_celsius: Number(data.tempCelsius),
    precipitation_mm: Number(data.precipitationMm),
    root_zone_soil_wetness_ratio: Number(data.rootZoneSoilWetnessRatio),
    source: data.source,
  };
}

async function fetchCoordinates(zipCode) {
  const response = await fetch(`https://api.zippopotam.us/us/${zipCode}`);
  if (!response.ok) {
    throw new Error(`Unable to resolve location for ZIP code ${zipCode}.`);
  }

  const data = await response.json();
  const place = data.places?.[0];
  if (!place) {
    throw new Error(`No location found for ZIP code ${zipCode}.`);
  }

  return {
    latitude: place.latitude,
    longitude: place.longitude,
    location: `${place["place name"]}, ${place["state abbreviation"]}`,
  };
}

async function fetchNasaPowerData(zipCode) {
  const location = await fetchCoordinates(zipCode);
  const url = new URL("https://power.larc.nasa.gov/api/temporal/daily/point");
  url.searchParams.set("parameters", "PRECTOTCORR,T2M,GWETROOT");
  url.searchParams.set("community", "AG");
  url.searchParams.set("longitude", location.longitude);
  url.searchParams.set("latitude", location.latitude);
  url.searchParams.set("start", daysAgo(9));
  url.searchParams.set("end", daysAgo(2));
  url.searchParams.set("format", "JSON");

  const response = await fetch(url);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`NASA POWER request failed ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = JSON.parse(text);
  const params = data.properties?.parameter;
  if (!params) {
    throw new Error("NASA POWER response did not include parameter data.");
  }

  const tempCelsius = latestValidValue(params.T2M);
  const precipitationMm = latestValidValue(params.PRECTOTCORR);
  const rootZoneSoilWetnessRatio = latestValidValue(params.GWETROOT);

  if (
    tempCelsius === undefined ||
    precipitationMm === undefined ||
    rootZoneSoilWetnessRatio === undefined
  ) {
    throw new Error("NASA POWER response did not include complete recent field data.");
  }

  return normalizeFieldData({
    zipCode,
    location: location.location,
    tempCelsius,
    precipitationMm,
    rootZoneSoilWetnessRatio,
    source: "NASA POWER",
  });
}

export async function getNasaAgData(zipCode) {
  const normalizedZip = normalizeZipCode(zipCode);
  if (!normalizedZip) {
    return { error: "Please provide a valid 5-digit US ZIP code." };
  }

  if (String(process.env.FIELD_SHIFT_PROVIDER || "auto").toLowerCase() === "mock") {
    const mock = mockFieldData.get(normalizedZip);
    return mock ? normalizeFieldData(mock) : { error: `No mock field data found for ${normalizedZip}.` };
  }

  try {
    return await fetchNasaPowerData(normalizedZip);
  } catch (error) {
    const mock = mockFieldData.get(normalizedZip);
    if (!mock) return { error: error.message };

    return {
      ...normalizeFieldData(mock),
      warning: `Live NASA lookup failed, so demo data was used: ${error.message}`,
    };
  }
}

function getHistory(conversationId) {
  const key = String(conversationId || "default");
  if (!conversationHistory.has(key)) {
    conversationHistory.set(key, []);
  }
  return conversationHistory.get(key);
}

export async function handleAgentMessage(userMessage, context = {}) {
  const history = getHistory(context.conversationId);
  const basePrompt =
    context.channel === "voice"
      ? `${systemPrompt}\n\nThis is a Voice call, so be extra concise.`
      : systemPrompt;
  const composedPrompt = MemoryPromptBuilder.compose(basePrompt, context.memory, context.session);
  const messages = [{ role: "system", content: composedPrompt }, ...history];

  const modelUserMessage = buildZipAwareUserMessage(userMessage, context);
  messages.push({ role: "user", content: modelUserMessage });
  history.push({ role: "user", content: modelUserMessage });

  for (let toolTurn = 0; toolTurn < 4; toolTurn += 1) {
    const response = await getOpenAIClient().chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      messages,
      tools,
      tool_choice: "auto",
    });

    const message = response.choices[0]?.message;
    const toolCalls = message?.tool_calls || [];

    if (!toolCalls.length) {
      const content = message?.content || "";
      history.push({ role: "assistant", content });
      return content;
    }

    messages.push(message);

    for (const toolCall of toolCalls) {
      let args;
      try {
        args = JSON.parse(toolCall.function?.arguments || "{}");
      } catch (error) {
        args = { __parse_error: error.message };
      }

      const result =
        args.__parse_error || toolCall.function?.name !== "get_nasa_ag_data"
          ? { error: args.__parse_error || `Unknown tool: ${toolCall.function?.name}` }
          : await getNasaAgData(args.zip_code);

      console.log(
        `  [tool] ${toolCall.function?.name}(${JSON.stringify(args)}) -> ${JSON.stringify(result).slice(0, 160)}`,
      );

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  const fallback = "I could not complete that field data lookup. Please try again with a 5-digit ZIP code.";
  history.push({ role: "assistant", content: fallback });
  return fallback;
}
