import OpenAI from "openai";
import { MemoryPromptBuilder } from "twilio-agent-connect";

import { buildZipAwareUserMessage, normalizeZipCode, zipMemoryInstruction } from "./zip-memory.js";

export { normalizeZipCode };

const conversationHistory = new Map();
let openaiClient;

const mockReadings = new Map([
  [
    "10001",
    {
      zipCode: "10001",
      city: "New York",
      state: "NY",
      reportingArea: "New York City",
      aqi: 58,
      category: "Moderate",
      dominantPollutant: "PM2.5",
      observedAt: "Demo sample",
    },
  ],
  [
    "10027",
    {
      zipCode: "10027",
      city: "New York",
      state: "NY",
      reportingArea: "New York City",
      aqi: 61,
      category: "Moderate",
      dominantPollutant: "PM2.5",
      observedAt: "Demo sample",
    },
  ],
  [
    "90012",
    {
      zipCode: "90012",
      city: "Los Angeles",
      state: "CA",
      reportingArea: "Los Angeles",
      aqi: 116,
      category: "Unhealthy for Sensitive Groups",
      dominantPollutant: "Ozone",
      observedAt: "Demo sample",
    },
  ],
  [
    "90026",
    {
      zipCode: "90026",
      city: "Los Angeles",
      state: "CA",
      reportingArea: "Los Angeles",
      aqi: 104,
      category: "Unhealthy for Sensitive Groups",
      dominantPollutant: "Ozone",
      observedAt: "Demo sample",
    },
  ],
  [
    "94103",
    {
      zipCode: "94103",
      city: "San Francisco",
      state: "CA",
      reportingArea: "San Francisco Bay Area",
      aqi: 37,
      category: "Good",
      dominantPollutant: "PM2.5",
      observedAt: "Demo sample",
    },
  ],
  [
    "85004",
    {
      zipCode: "85004",
      city: "Phoenix",
      state: "AZ",
      reportingArea: "Phoenix",
      aqi: 151,
      category: "Unhealthy",
      dominantPollutant: "Ozone",
      observedAt: "Demo sample",
    },
  ],
]);

const categoryGuidance = new Map([
  [
    "Good",
    {
      range: "0-50",
      color: "Green",
      general: "Air quality is satisfactory for most outdoor activities.",
      sensitiveGroups: "People who are unusually sensitive can monitor symptoms, but restrictions are not usually needed.",
    },
  ],
  [
    "Moderate",
    {
      range: "51-100",
      color: "Yellow",
      general: "Air quality is acceptable, though unusually sensitive people may consider reducing prolonged heavy exertion.",
      sensitiveGroups: "Children, older adults, and people with heart or lung disease should watch for symptoms during extended outdoor activity.",
    },
  ],
  [
    "Unhealthy for Sensitive Groups",
    {
      range: "101-150",
      color: "Orange",
      general: "Most people can continue normal activity, but sensitive groups should reduce prolonged or heavy outdoor exertion.",
      sensitiveGroups: "Children, older adults, outdoor workers, and people with asthma, COPD, or heart disease should take extra breaks and keep rescue medication nearby if prescribed.",
    },
  ],
  [
    "Unhealthy",
    {
      range: "151-200",
      color: "Red",
      general: "Everyone should reduce prolonged or heavy outdoor exertion.",
      sensitiveGroups: "Sensitive groups should avoid prolonged outdoor exertion and move activities indoors where possible.",
    },
  ],
  [
    "Very Unhealthy",
    {
      range: "201-300",
      color: "Purple",
      general: "Health alert: everyone should avoid prolonged or heavy outdoor exertion.",
      sensitiveGroups: "Sensitive groups should avoid outdoor activity and use cleaner indoor air if available.",
    },
  ],
  [
    "Hazardous",
    {
      range: "301+",
      color: "Maroon",
      general: "Health warning: everyone should avoid outdoor exertion and follow local emergency guidance.",
      sensitiveGroups: "Sensitive groups should remain indoors with filtered air if possible and follow public health instructions.",
    },
  ],
]);

const tools = [
  {
    type: "function",
    function: {
      name: "get_air_quality_by_zip",
      description: "Get the current Air Quality Index by 5-digit US ZIP code.",
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

const systemPrompt = `You are Orbit AQI, a concise air quality assistant for a NASA Space Apps demo.

Guidelines:
- Always use get_air_quality_by_zip for AQI values. Do not invent AQI readings.
- If the user asks for AQI without a ZIP code, ask for a 5-digit US ZIP code.
${zipMemoryInstruction("AQI")}
- If a voice transcription hint provides a normalized ZIP code, use that ZIP code.
- If the tool source is Demo sample data, clearly say it is demo data.
- Keep responses short and practical for SMS and Voice.
- Do not use markdown formatting, asterisks, bullets, or emojis.
- For Voice, say "A Q I" when spelling out the abbreviation helps clarity.
- If the user reports severe symptoms or an emergency, tell them to contact local emergency services or a medical professional.`;

function getOpenAIClient() {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function providerMode() {
  const mode = String(process.env.AIR_QUALITY_PROVIDER || "mock").trim().toLowerCase();
  return ["mock", "auto", "airnow"].includes(mode) ? mode : "mock";
}

function categoryForAqi(aqi) {
  const value = Number(aqi);
  if (!Number.isFinite(value)) return "";
  if (value <= 50) return "Good";
  if (value <= 100) return "Moderate";
  if (value <= 150) return "Unhealthy for Sensitive Groups";
  if (value <= 200) return "Unhealthy";
  if (value <= 300) return "Very Unhealthy";
  return "Hazardous";
}

function buildGuidance(category) {
  const guidance = categoryGuidance.get(category);
  if (!guidance) return {};

  return {
    category_range: guidance.range,
    category_color: guidance.color,
    general_guidance: guidance.general,
    sensitive_group_guidance: guidance.sensitiveGroups,
  };
}

function normalizeReading(reading, sourceOverride) {
  const category = reading.category || categoryForAqi(reading.aqi);

  return {
    zip_code: reading.zipCode,
    city: reading.city,
    state: reading.state,
    reporting_area: reading.reportingArea,
    aqi: Number(reading.aqi),
    category,
    dominant_pollutant: reading.dominantPollutant,
    observed_at: reading.observedAt,
    source: sourceOverride || reading.source || "Demo sample data",
    ...buildGuidance(category),
  };
}

function observedAtFromAirNow(row) {
  const date = row.dateObserved || row.DateObserved || "";
  const hour = row.hourObserved ?? row.HourObserved;
  const timezone = row.localTimeZone || row.LocalTimeZone || "";

  if (!date) return "Current AirNow observation";
  if (hour === undefined || hour === null || hour === "") return `${date} ${timezone}`.trim();
  return `${date} ${String(hour).padStart(2, "0")}:00 ${timezone}`.trim();
}

function airNowAqi(row) {
  return Number(row.nowcastAQI ?? row.NowcastAQI ?? row.AQI ?? row.aqi);
}

function airNowCategory(row, aqi) {
  return (
    row.aqiCategoryName ||
    row.AQICategoryName ||
    row.CategoryName ||
    row.categoryName ||
    row.Category?.Name ||
    row.category?.name ||
    categoryForAqi(aqi)
  );
}

function airNowReportingArea(row, zipCode) {
  return (
    row.reportingAreaName ||
    row.ReportingAreaName ||
    row.ReportingArea ||
    row.reportingArea ||
    row.siteName ||
    row.SiteName ||
    zipCode
  );
}

async function fetchAirNowReading(zipCode) {
  if (!process.env.AIRNOW_API_KEY) return null;

  const url = new URL("https://www.airnowapi.org/aq/observation/current/ziplatlong/");
  url.searchParams.set("format", "application/json");
  url.searchParams.set("zipcode", zipCode);
  url.searchParams.set("API_KEY", process.env.AIRNOW_API_KEY);

  const response = await fetch(url);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`AirNow request failed ${response.status}: ${text.slice(0, 200)}`);
  }

  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed : parsed.Data || parsed.data || parsed.results;
  if (!Array.isArray(rows) || !rows.length) {
    return null;
  }

  const highestAqiRow = rows.reduce((highest, row) => {
    const highestAqi = airNowAqi(highest) || -1;
    const rowAqi = airNowAqi(row) || -1;
    return rowAqi > highestAqi ? row : highest;
  }, rows[0]);

  const aqi = airNowAqi(highestAqiRow);
  const category = airNowCategory(highestAqiRow, aqi);
  const reportingArea = airNowReportingArea(highestAqiRow, zipCode);

  return normalizeReading(
    {
      zipCode,
      city: reportingArea,
      state: highestAqiRow.stateCode || highestAqiRow.StateCode || "",
      reportingArea,
      aqi,
      category,
      dominantPollutant: highestAqiRow.parameterName || highestAqiRow.ParameterName || "Unknown",
      observedAt: observedAtFromAirNow(highestAqiRow),
    },
    "AirNow",
  );
}

export async function getAqiByZip(zipCode) {
  const normalizedZip = normalizeZipCode(zipCode);

  if (!normalizedZip) {
    return { error: "Please provide a valid 5-digit US ZIP code." };
  }

  const mode = providerMode();

  if (mode === "airnow" && !process.env.AIRNOW_API_KEY) {
    return { error: "AIR_QUALITY_PROVIDER is set to airnow, but AIRNOW_API_KEY is missing." };
  }

  if ((mode === "airnow" || mode === "auto") && process.env.AIRNOW_API_KEY) {
    try {
      const liveReading = await fetchAirNowReading(normalizedZip);
      if (liveReading) return liveReading;

      if (mode === "airnow") {
        return { error: `AirNow returned no current observation for ZIP ${normalizedZip}.` };
      }
    } catch (error) {
      if (mode === "airnow") {
        return { error: error.message };
      }

      const mockReading = mockReadings.get(normalizedZip);
      if (mockReading) {
        return {
          ...normalizeReading(mockReading),
          warning: `AirNow lookup failed, so demo data was used: ${error.message}`,
        };
      }

      return { error: error.message };
    }
  }

  const mockReading = mockReadings.get(normalizedZip);
  if (!mockReading) {
    return {
      error: `No demo AQI data found for ZIP ${normalizedZip}.`,
      supported_zip_codes: [...mockReadings.keys()],
    };
  }

  return normalizeReading(mockReading);
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
        args.__parse_error || toolCall.function?.name !== "get_air_quality_by_zip"
          ? { error: args.__parse_error || `Unknown tool: ${toolCall.function?.name}` }
          : await getAqiByZip(args.zip_code);

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

  const fallback = "I could not complete that air quality lookup. Please try again with a 5-digit ZIP code.";
  history.push({ role: "assistant", content: fallback });
  return fallback;
}
