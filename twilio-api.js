export function requireEnv(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

export function basicAuth(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export async function twilioRequest(method, url, { auth, body, contentType = "application/json" } = {}) {
  const headers = {};
  let requestBody;

  if (auth) headers.Authorization = auth;
  if (body !== undefined) {
    headers["Content-Type"] = contentType;
    requestBody = typeof body === "string" ? body : JSON.stringify(body);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: requestBody,
  });
  const text = await response.text();
  const data = parseJson(text);

  if (!response.ok) {
    const error = new Error(`${method} ${url} failed ${response.status}: ${text}`);
    error.status = response.status;
    error.body = text;
    throw error;
  }

  return data;
}

function parseJson(text) {
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
