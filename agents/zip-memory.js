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
const zipValueKeyPattern = /zip|postal|location|address|home|usual|preferred/i;
const zipContextPattern =
  /\b(zip(?:\s*code)?|postal|location|home|address|usual|preferred|near|lives?|based|located)\b/i;

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

  if (current) groups.push(current);
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

function zipFromMemoryString(value, key = "") {
  const text = String(value || "").trim();
  if (!text) return "";

  if (zipValueKeyPattern.test(key) || zipContextPattern.test(text)) {
    return normalizeZipCode(text);
  }

  return "";
}

function zipFromNamedMemoryValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";

  const name = String(value.name || value.key || value.label || value.displayName || "");
  if (!zipValueKeyPattern.test(name)) return "";

  return normalizeZipCode(value.value ?? value.answer ?? value.content ?? value.text ?? "");
}

function keyScore(key) {
  if (/zip|postal/i.test(key)) return 4;
  if (/home|usual|preferred|location|address/i.test(key)) return 3;
  if (/traits?|observations?|summaries?|memory|profile|session|context/i.test(key)) return 2;
  if (/content|text|value|answer|description/i.test(key)) return 1;
  return 0;
}

function knownMemoryParts(value) {
  const parts = [];

  for (const key of ["rawData", "observations", "summaries", "communications"]) {
    try {
      if (value && key in value && value[key] !== undefined) {
        parts.push([key, value[key]]);
      }
    } catch {
      continue;
    }
  }

  return parts;
}

function walkForZip(value, key = "", seen = new Set()) {
  if (value === null || value === undefined) return "";

  if (typeof value === "string" || typeof value === "number") {
    return zipFromMemoryString(value, key);
  }

  if (typeof value !== "object" || seen.has(value)) return "";
  seen.add(value);

  const namedZip = zipFromNamedMemoryValue(value);
  if (namedZip) return namedZip;

  for (const [partKey, partValue] of knownMemoryParts(value)) {
    const path = key ? `${key}.${partKey}` : partKey;
    const zipCode = walkForZip(partValue, path, seen);
    if (zipCode) return zipCode;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const zipCode = walkForZip(item, key, seen);
      if (zipCode) return zipCode;
    }
    return "";
  }

  const entries = Object.entries(value).sort(([leftKey], [rightKey]) => {
    return keyScore(rightKey) - keyScore(leftKey);
  });

  for (const [childKey, childValue] of entries) {
    const path = key ? `${key}.${childKey}` : childKey;
    const zipCode = walkForZip(childValue, path, seen);
    if (zipCode) return zipCode;
  }

  return "";
}

export function findZipInMemory(memory, session) {
  return walkForZip({ memory, session });
}

export function buildZipAwareUserMessage(userMessage, context = {}) {
  const text = String(userMessage || "");
  const messageZip = normalizeZipCode(text);
  if (messageZip) {
    return `${text}\n\nVoice transcription hint: interpret the ZIP code as ${messageZip}.`;
  }

  const memoryZip = findZipInMemory(context.memory, context.session);
  if (memoryZip) {
    return `${text}\n\nMemory hint: use ${memoryZip} as the customer's saved ZIP code unless they ask for a different ZIP.`;
  }

  return text;
}

export function zipMemoryInstruction(lookupName = "location-specific") {
  return `- If a memory hint provides a saved ZIP code, use that ZIP code for ${lookupName} lookups instead of asking for a ZIP.`;
}
