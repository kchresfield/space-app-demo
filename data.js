export const airQualityReadings = new Map([
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
    "11201",
    {
      zipCode: "11201",
      city: "Brooklyn",
      state: "NY",
      reportingArea: "New York City",
      aqi: 64,
      category: "Moderate",
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
    "60601",
    {
      zipCode: "60601",
      city: "Chicago",
      state: "IL",
      reportingArea: "Chicago",
      aqi: 73,
      category: "Moderate",
      dominantPollutant: "PM2.5",
      observedAt: "Demo sample",
    },
  ],
  [
    "77002",
    {
      zipCode: "77002",
      city: "Houston",
      state: "TX",
      reportingArea: "Houston",
      aqi: 88,
      category: "Moderate",
      dominantPollutant: "Ozone",
      observedAt: "Demo sample",
    },
  ],
  [
    "80202",
    {
      zipCode: "80202",
      city: "Denver",
      state: "CO",
      reportingArea: "Denver-Boulder",
      aqi: 129,
      category: "Unhealthy for Sensitive Groups",
      dominantPollutant: "Ozone",
      observedAt: "Demo sample",
    },
  ],
  [
    "98101",
    {
      zipCode: "98101",
      city: "Seattle",
      state: "WA",
      reportingArea: "Seattle-Tacoma",
      aqi: 42,
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
  [
    "20001",
    {
      zipCode: "20001",
      city: "Washington",
      state: "DC",
      reportingArea: "Washington DC",
      aqi: 52,
      category: "Moderate",
      dominantPollutant: "PM2.5",
      observedAt: "Demo sample",
    },
  ],
]);

export const categoryGuidance = new Map([
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

export const phoneZipPreferences = new Map([
  ["+12125550100", "10001"],
  ["+13105550100", "90012"],
]);

const spokenDigitWords = new Map([
  ["zero", "0"],
  ["oh", "0"],
  ["o", "0"],
  ["one", "1"],
  ["two", "2"],
  ["three", "3"],
  ["four", "4"],
  ["five", "5"],
  ["six", "6"],
  ["seven", "7"],
  ["eight", "8"],
  ["nine", "9"],
]);

const voiceZipCorrections = new Map([["9026", "90026"]]);

function digitsForZipToken(token) {
  const value = String(token || "").toLowerCase();
  if (/^\d+$/.test(value)) return value;
  return spokenDigitWords.get(value) || "";
}

function candidateDigitGroups(text) {
  const groups = [];
  const tokenPattern = /\b(?:\d+|zero|oh|o|one|two|three|four|five|six|seven|eight|nine)\b/gi;
  let current = "";
  let lastEnd = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const separator = text.slice(lastEnd, match.index);
    if (current && /[A-Za-z]/.test(separator)) {
      groups.push(current);
      current = "";
    }

    current += digitsForZipToken(match[0]);
    lastEnd = match.index + match[0].length;
  }

  if (current) {
    groups.push(current);
  }

  return groups;
}

export function normalizeZipCode(value) {
  const text = String(value || "").trim();
  const directMatch = text.match(/(?:^|[^\d])(\d{5})(?:-\d{4})?(?=$|[^\d])/);
  if (directMatch) return directMatch[1];

  for (const digits of candidateDigitGroups(text)) {
    if (digits.length === 5) return digits;
    if (voiceZipCorrections.has(digits)) return voiceZipCorrections.get(digits);
  }

  return "";
}

export function normalizeCategory(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");

  for (const category of categoryGuidance.keys()) {
    if (category.toLowerCase() === normalized) {
      return category;
    }
  }

  return "";
}

export function categoryForAqi(aqi) {
  const value = Number(aqi);
  if (!Number.isFinite(value)) return "";
  if (value <= 50) return "Good";
  if (value <= 100) return "Moderate";
  if (value <= 150) return "Unhealthy for Sensitive Groups";
  if (value <= 200) return "Unhealthy";
  if (value <= 300) return "Very Unhealthy";
  return "Hazardous";
}

export function getGuidanceForCategory(category) {
  return categoryGuidance.get(normalizeCategory(category)) || null;
}

export function getSupportedZipCodes() {
  return [...airQualityReadings.values()].map((reading) => ({
    zip_code: reading.zipCode,
    city: reading.city,
    state: reading.state,
  }));
}

export function setPreferredZip(phone, zipCode) {
  phoneZipPreferences.set(String(phone || "").trim(), normalizeZipCode(zipCode));
}

export function getPreferredZip(phone) {
  return phoneZipPreferences.get(String(phone || "").trim()) || "";
}
