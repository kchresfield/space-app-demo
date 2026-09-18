import "dotenv/config";

import { fileURLToPath } from "node:url";

import { basicAuth, requireEnv, twilioRequest } from "./twilio-api.js";

const MEMORY_STORES_URL = "https://memory.twilio.com/v1/ControlPlane/Stores";
const INTELLIGENCE_CONFIGS_URL = "https://intelligence.twilio.com/v3/ControlPlane/Configurations";
const CONVERSATION_CONFIGS_URL = "https://conversations.twilio.com/v2/ControlPlane/Configurations";
const MEMORY_STORE_NAME = "space-app-aqi-memory-store";
const INTELLIGENCE_CONFIG_NAME = "space-app-aqi-intelligence";
const CONVERSATION_CONFIG_NAME = "space-app-aqi-config";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function request(method, url, body) {
  const auth = basicAuth(process.env.TWILIO_API_KEY, process.env.TWILIO_API_SECRET);
  return twilioRequest(method, url, { auth, body });
}

async function getExisting(listUrl, displayName, label) {
  const result = await request("GET", listUrl);
  const items = Object.values(result).find((value) => Array.isArray(value));

  if (!items?.length) {
    throw new Error(`Could not list ${label} resources: ${JSON.stringify(result)}`);
  }

  for (const item of items) {
    const resource = typeof item === "string" ? await request("GET", `${listUrl}/${item}`) : item;
    if (resource.displayName === displayName) {
      return resource;
    }
  }

  throw new Error(`No existing ${label} with displayName "${displayName}" found`);
}

function isAlreadyExistsError(error) {
  if (error.status === 409) return true;

  try {
    const body = JSON.parse(error.body || "{}");
    return body.code === 20001 || body.code === 520045;
  } catch {
    return false;
  }
}

function isAlreadyExistsOperation(result) {
  return result.error?.code === 20001 || result.error?.code === 520045;
}

async function waitForOperation(statusUrl, label, listUrl, displayName) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await request("GET", statusUrl);
    const status = String(result.status || "").toUpperCase();

    if (status === "COMPLETED") {
      return result.resource || result.result || (await getExisting(listUrl, displayName, label));
    }

    if (status === "FAILED") {
      if (isAlreadyExistsOperation(result)) {
        console.log(`   (already exists; fetching existing ${label})`);
        return getExisting(listUrl, displayName, label);
      }

      throw new Error(`${label} operation failed: ${JSON.stringify(result)}`);
    }

    console.log(`   ... ${status.toLowerCase() || "pending"}`);
    await sleep(3000);
  }

  throw new Error(`${label} timed out waiting for operation to complete`);
}

async function createMemoryStore() {
  let operation;

  try {
    operation = await request("POST", MEMORY_STORES_URL, {
      displayName: MEMORY_STORE_NAME,
      description: "Customer profiles for the Space Apps AQI assistant",
    });
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
    console.log("   (already exists; fetching existing Memory Store)");
    return getExisting(MEMORY_STORES_URL, MEMORY_STORE_NAME, "Memory Store");
  }

  return operation.id
    ? operation
    : waitForOperation(operation.statusUrl, "Memory Store", MEMORY_STORES_URL, MEMORY_STORE_NAME);
}

async function createIntelligenceConfiguration() {
  let operation;

  try {
    operation = await request("POST", INTELLIGENCE_CONFIGS_URL, {
      displayName: INTELLIGENCE_CONFIG_NAME,
      description: "Sentiment and summaries for the Space Apps AQI assistant",
      rules: [],
    });
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
    console.log("   (already exists; fetching existing Intelligence Configuration)");
    return getExisting(
      INTELLIGENCE_CONFIGS_URL,
      INTELLIGENCE_CONFIG_NAME,
      "Intelligence Configuration",
    );
  }

  return operation.id
    ? operation
    : waitForOperation(
        operation.statusUrl,
        "Intelligence Configuration",
        INTELLIGENCE_CONFIGS_URL,
        INTELLIGENCE_CONFIG_NAME,
      );
}

async function createConversationConfiguration(store, intelligenceConfiguration) {
  let operation;

  try {
    operation = await request("POST", CONVERSATION_CONFIGS_URL, {
      displayName: CONVERSATION_CONFIG_NAME,
      description: "Captures voice and messaging traffic for the Space Apps AQI assistant",
      conversationGroupingType: "GROUP_BY_PROFILE",
      memoryStoreId: store.id,
      memoryExtractionEnabled: true,
      intelligenceConfigurationIds: [intelligenceConfiguration.id],
    });
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
    console.log("   (already exists; fetching existing Conversation Configuration)");
    return getExisting(
      CONVERSATION_CONFIGS_URL,
      CONVERSATION_CONFIG_NAME,
      "Conversation Configuration",
    );
  }

  return operation.id
    ? operation
    : waitForOperation(
        operation.statusUrl,
        "Conversation Configuration",
        CONVERSATION_CONFIGS_URL,
        CONVERSATION_CONFIG_NAME,
      );
}

async function registerWebhook(configuration) {
  const publicDomain = process.env.TWILIO_VOICE_PUBLIC_DOMAIN;

  if (!publicDomain || publicDomain === "your-app.ngrok.app") {
    console.log("4. Skipping webhook registration (TWILIO_VOICE_PUBLIC_DOMAIN is not set)");
    console.log("   Run `npm run setup` again after setting TWILIO_VOICE_PUBLIC_DOMAIN\n");
    return;
  }

  console.log("4. Registering TAC server webhook with Conversation Orchestrator...");
  const webhookUrl = `https://${publicDomain}/webhook`;
  const existing = await request("GET", `${CONVERSATION_CONFIGS_URL}/${configuration.id}`);
  const updatePayload = {
    displayName: existing.displayName || configuration.displayName || CONVERSATION_CONFIG_NAME,
    description:
      existing.description ||
      configuration.description ||
      "Captures voice and messaging traffic for the Space Apps AQI assistant",
    conversationGroupingType:
      existing.conversationGroupingType || configuration.conversationGroupingType || "GROUP_BY_PROFILE",
    memoryStoreId: existing.memoryStoreId || configuration.memoryStoreId,
    channelSettings: existing.channelSettings || configuration.channelSettings || {},
    statusCallbacks: [{ url: webhookUrl, method: "POST" }],
    intelligenceConfigurationIds:
      existing.intelligenceConfigurationIds || configuration.intelligenceConfigurationIds || [],
    memoryExtractionEnabled:
      existing.memoryExtractionEnabled ?? configuration.memoryExtractionEnabled ?? true,
  };

  if (existing.metadata || configuration.metadata) {
    updatePayload.metadata = existing.metadata || configuration.metadata;
  }
  if (existing.conversationsV1Bridge || configuration.conversationsV1Bridge) {
    updatePayload.conversationsV1Bridge = existing.conversationsV1Bridge || configuration.conversationsV1Bridge;
  }

  const operation = await request("PUT", `${CONVERSATION_CONFIGS_URL}/${configuration.id}`, updatePayload);
  if (operation.statusUrl) {
    await waitForOperation(
      operation.statusUrl,
      "Conversation Configuration",
      CONVERSATION_CONFIGS_URL,
      updatePayload.displayName,
    );
  }
  console.log(`   Created: ${webhookUrl}\n`);
}

export async function setup() {
  requireEnv(["TWILIO_ACCOUNT_SID", "TWILIO_API_KEY", "TWILIO_API_SECRET"]);

  console.log("Setting up Twilio resources...\n");

  console.log("1. Creating Memory Store...");
  const store = await createMemoryStore();
  console.log(`   Created: ${store.id}\n`);

  console.log("2. Creating Intelligence Configuration...");
  const intelligenceConfiguration = await createIntelligenceConfiguration();
  console.log(`   Created: ${intelligenceConfiguration.id}\n`);

  console.log("3. Creating Conversation Configuration...");
  const conversationConfiguration = await createConversationConfiguration(store, intelligenceConfiguration);
  console.log(`   Created: ${conversationConfiguration.id}\n`);

  await registerWebhook(conversationConfiguration);

  console.log("----------------------------------------------------");
  console.log("Add these lines to your .env file:\n");
  console.log(`TWILIO_MEMORY_STORE_ID=${store.id}`);
  console.log(`TWILIO_INTELLIGENCE_CONFIGURATION_ID=${intelligenceConfiguration.id}`);
  console.log(`TWILIO_CONVERSATION_CONFIGURATION_ID=${conversationConfiguration.id}`);
  console.log("----------------------------------------------------");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  setup().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
