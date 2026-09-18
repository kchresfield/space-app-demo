import {
  airQualityReadings,
  categoryForAqi,
  getGuidanceForCategory,
  getPreferredZip,
  getSupportedZipCodes,
  normalizeCategory,
  normalizeZipCode,
  setPreferredZip,
} from "./data.js";

function json(payload) {
  return JSON.stringify(payload);
}

function providerMode() {
  const mode = String(process.env.AIR_QUALITY_PROVIDER || "mock").trim().toLowerCase();
  return ["mock", "auto", "airnow"].includes(mode) ? mode : "mock";
}

function buildGuidance(category) {
  const guidance = getGuidanceForCategory(category);
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
  const date = row.DateObserved || row.dateObserved || "";
  const hour = row.HourObserved ?? row.hourObserved;
  const timezone = row.LocalTimeZone || row.localTimeZone || "";

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

async function resolveAirQualityReading(zipCode) {
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

      const demoReading = airQualityReadings.get(normalizedZip);
      if (demoReading) {
        return {
          ...normalizeReading(demoReading),
          warning: `AirNow lookup failed, so demo data was used: ${error.message}`,
        };
      }

      return { error: error.message };
    }
  }

  const demoReading = airQualityReadings.get(normalizedZip);
  if (!demoReading) {
    return {
      error: `No demo AQI data found for ZIP ${normalizedZip}.`,
      supported_zip_codes: getSupportedZipCodes(),
    };
  }

  return normalizeReading(demoReading);
}

export async function getAirQualityByZip({ zip_code: zipCode }) {
  return json(await resolveAirQualityReading(zipCode));
}

export async function compareAirQualityByZipCodes({ zip_codes: zipCodes }) {
  const zipList = Array.isArray(zipCodes) ? zipCodes : String(zipCodes || "").split(/[,\s]+/);
  const normalizedZips = [...new Set(zipList.map(normalizeZipCode).filter(Boolean))].slice(0, 5);

  if (!normalizedZips.length) {
    return json({ error: "Please provide at least one valid 5-digit US ZIP code." });
  }

  const readings = [];
  const errors = [];

  for (const zipCode of normalizedZips) {
    const result = await resolveAirQualityReading(zipCode);
    if (result.error) {
      errors.push({ zip_code: zipCode, error: result.error });
    } else {
      readings.push(result);
    }
  }

  if (!readings.length) {
    return json({ error: "No AQI readings were found for the requested ZIP codes.", details: errors });
  }

  const ranked = [...readings].sort((left, right) => left.aqi - right.aqi);

  return json({
    readings,
    best_air_quality: ranked[0],
    worst_air_quality: ranked[ranked.length - 1],
    errors,
  });
}

export function getAirQualityGuidance({ aqi, category, sensitive_group: sensitiveGroup }) {
  const resolvedCategory = Number.isFinite(Number(aqi))
    ? categoryForAqi(Number(aqi))
    : normalizeCategory(category);

  if (!resolvedCategory) {
    return json({ error: "Provide either an AQI number or a valid AQI category." });
  }

  return json({
    category: resolvedCategory,
    sensitive_group: sensitiveGroup || "",
    ...buildGuidance(resolvedCategory),
  });
}

export function savePreferredZip({ phone, zip_code: zipCode }) {
  const normalizedZip = normalizeZipCode(zipCode);

  if (!phone) {
    return json({ error: "A phone number is required to save a preferred ZIP." });
  }
  if (!normalizedZip) {
    return json({ error: "Please provide a valid 5-digit US ZIP code." });
  }

  setPreferredZip(phone, normalizedZip);

  return json({
    phone,
    preferred_zip_code: normalizedZip,
    message: `Preferred ZIP saved as ${normalizedZip}.`,
  });
}

export function getPreferredZipByPhone({ phone }) {
  if (!phone) {
    return json({ error: "A phone number is required to look up a preferred ZIP." });
  }

  const preferredZip = getPreferredZip(phone);
  if (!preferredZip) {
    return json({ error: "No preferred ZIP has been saved for this phone number." });
  }

  const reading = airQualityReadings.get(preferredZip);

  return json({
    phone,
    preferred_zip_code: preferredZip,
    city: reading?.city || "",
    state: reading?.state || "",
  });
}

export function listDemoZipCodes() {
  return json({ supported_zip_codes: getSupportedZipCodes() });
}

const stringParam = (description) => ({ type: "string", description });

export const allTools = [
  {
    name: "get_air_quality_by_zip",
    description: "Retrieve the air quality index for a 5-digit US ZIP code.",
    parameters: {
      type: "object",
      properties: {
        zip_code: stringParam("A 5-digit US ZIP code, for example 10001."),
      },
      required: ["zip_code"],
    },
    execute: getAirQualityByZip,
  },
  {
    name: "compare_air_quality_by_zip_codes",
    description: "Compare AQI readings across up to five 5-digit US ZIP codes.",
    parameters: {
      type: "object",
      properties: {
        zip_codes: {
          type: "array",
          items: { type: "string" },
          description: "A list of up to five ZIP codes, for example ['10001', '94103'].",
        },
      },
      required: ["zip_codes"],
    },
    execute: compareAirQualityByZipCodes,
  },
  {
    name: "get_air_quality_guidance",
    description: "Explain what an AQI number or AQI category means for outdoor activity.",
    parameters: {
      type: "object",
      properties: {
        aqi: { type: "number", description: "An air quality index value, for example 116." },
        category: stringParam("An AQI category, for example Moderate or Unhealthy."),
        sensitive_group: stringParam("Optional sensitive group, for example asthma or older adult."),
      },
    },
    execute: getAirQualityGuidance,
  },
  {
    name: "save_preferred_zip",
    description: "Save the customer's preferred ZIP code for future AQI lookups in this demo process.",
    parameters: {
      type: "object",
      properties: {
        phone: stringParam("Customer phone number in E.164 format, for example +12125550100."),
        zip_code: stringParam("A 5-digit US ZIP code, for example 10001."),
      },
      required: ["phone", "zip_code"],
    },
    execute: savePreferredZip,
  },
  {
    name: "get_preferred_zip_by_phone",
    description: "Look up the customer's saved preferred ZIP code by phone number.",
    parameters: {
      type: "object",
      properties: {
        phone: stringParam("Customer phone number in E.164 format, for example +12125550100."),
      },
      required: ["phone"],
    },
    execute: getPreferredZipByPhone,
  },
  {
    name: "list_demo_zip_codes",
    description: "List ZIP codes available in local mock data.",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: listDemoZipCodes,
  },
];

export const toolMap = new Map(allTools.map((tool) => [tool.name, tool.execute]));

export function buildOpenAITools() {
  return allTools.map(({ name, description, parameters }) => ({
    type: "function",
    function: {
      name,
      description,
      parameters,
    },
  }));
}
