# Twilio Agent Connect Starter Guide

This project is a small Twilio Agent Connect application for learning how to connect an AI agent to Twilio Voice and SMS.

It is intentionally simple: Twilio Agent Connect handles the Twilio channel plumbing, and this repo focuses on the agent code you own.

## What You Will Learn

- How a TAC app receives Voice and SMS messages.
- How `server.js` connects Twilio channels to your AI agent.
- How Conversation Memory is passed into the agent.
- How an agent uses OpenAI tool calling to look up external data.
- How to swap one agent implementation for another.

## What TAC Does

Twilio Agent Connect is middleware between Twilio channels and your AI application.

In this app, TAC handles:

- Inbound Voice and SMS webhooks.
- ConversationRelay setup for Voice.
- WebSocket handling for Voice through the TAC SDK.
- Conversation lifecycle tracking.
- Conversation Memory retrieval when enabled.
- Routing your returned response back to the same channel.

Your code handles:

- The agent instructions.
- The OpenAI request.
- The custom tools your agent can call.
- Any API integrations or fallback data.
- How the final response should sound to the user.

## Current App

The active agent is `Field Shift`, a NASA-style field conditions assistant. It accepts a ZIP code and returns practical field guidance using:

- NASA POWER data when available.
- Local mock data as a safe fallback.
- Twilio Conversation Memory when TAC provides prior ZIP code context.

The repo also includes an alternate AQI agent in `agents/aqi-agent.js`. To use that instead, change the import in `server.js`.

## Project Structure

```text
space-app-demo/
├── server.js                     # TAC server and channel registration
├── agents/
│   ├── field-shift-agent.js      # Active agent used by server.js
│   ├── aqi-agent.js              # Alternate air quality agent
│   └── zip-memory.js             # Shared ZIP parsing and memory helper
├── .env.example                  # Environment variable template
└── package.json                  # npm scripts and dependencies
```

## How Requests Flow

```text
Customer call or text
        |
        v
Twilio phone number
        |
        v
TAC routes the event to this app
        |
        v
server.js receives the normalized message
        |
        v
agents/field-shift-agent.js sends the message to OpenAI
        |
        v
OpenAI may call get_nasa_ag_data
        |
        v
TAC sends the final response back over Voice or SMS
```

The important handoff point is this callback in `server.js`:

```js
tac.onMessageReady(async ({ conversationId, message, memory, session, channel }) => {
  return handleAgentMessage(message, { conversationId, memory, session, channel });
});
```

That is where TAC gives your app the user message, the conversation context, and any retrieved Conversation Memory.

## Prerequisites

Install or create the following before running the project:

- Node.js `22.13.0` or newer.
- npm `9` or newer.
- A Twilio account.
- A Twilio phone number with Voice and SMS support.
- Twilio API Key SID and Secret.
- OpenAI API key.
- ngrok or another HTTPS tunnel for local development.
- `curl` for the manual Twilio API setup commands.

## Install

```bash
cd /Users/kchresfield/code/space-app-demo
npm install
cp .env.example .env
```

Then edit `.env`.

## Required Environment Variables

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_SECRET=your_api_key_secret
TWILIO_PHONE_NUMBER=+15551234567

OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
```

For local Voice testing, also set:

```env
TWILIO_VOICE_PUBLIC_DOMAIN=your-ngrok-domain.ngrok.app
TWILIO_SERVER_PORT=8000
```

Do not include `https://` in `TWILIO_VOICE_PUBLIC_DOMAIN`.

## Optional Environment Variables

These are filled in after you create the Twilio resources:

```env
TWILIO_MEMORY_STORE_ID=
TWILIO_CONVERSATION_CONFIGURATION_ID=
TWILIO_INTELLIGENCE_CONFIGURATION_ID=
```

`TWILIO_CONVERSATION_CONFIGURATION_ID` is the resource ID the running TAC server needs. `TWILIO_MEMORY_STORE_ID` and `TWILIO_INTELLIGENCE_CONFIGURATION_ID` are useful when creating, inspecting, or resetting related Twilio resources.

Only set these if you actually use those channels:

```env
TWILIO_WHATSAPP_NUMBER=whatsapp:+15551234567
TWILIO_RCS_SENDER_ID=rcs:your_sender_id
```

If you leave optional values blank, remove the line or keep the cleanup logic in `server.js`.

## Create Twilio Resources

Start your HTTPS tunnel first:

```bash
ngrok http 8000
```

Copy the ngrok domain into `.env`:

```env
TWILIO_VOICE_PUBLIC_DOMAIN=abc123.ngrok.app
```

Then create the Twilio resources below. These steps replace any local `setup.js` helper script.

### Set Shell Variables

Set these in your terminal so the `curl` commands are shorter:

```bash
export TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
export TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
export TWILIO_API_SECRET=your_api_key_secret
export TWILIO_PHONE_NUMBER=+15551234567
export TWILIO_VOICE_PUBLIC_DOMAIN=abc123.ngrok.app
```

The examples use `TWILIO_API_KEY` and `TWILIO_API_SECRET` for Basic Auth.

### 1. Create a Conversation Memory Store

Conversation Memory stores profile traits, observations, summaries, and conversation context.

```bash
curl -sS -u "$TWILIO_API_KEY:$TWILIO_API_SECRET" \
  -H "Content-Type: application/json" \
  -X POST "https://memory.twilio.com/v1/ControlPlane/Stores" \
  -d '{
    "displayName": "space-app-demo-memory-store",
    "description": "Customer memory for the TAC starter app"
  }'
```

If the response includes a `statusUrl`, poll it until the operation is `COMPLETED`:

```bash
curl -sS -u "$TWILIO_API_KEY:$TWILIO_API_SECRET" "<statusUrl from the create response>"
```

Copy the Memory Store ID into `.env`:

```env
TWILIO_MEMORY_STORE_ID=mem_store_xxxxxxxxxxxxxxxxxxxxxxxxxx
```

The Memory Store should be active before you link it to Conversation Orchestrator.

If the store already exists, list stores and copy the existing ID:

```bash
curl -sS -u "$TWILIO_API_KEY:$TWILIO_API_SECRET" \
  "https://memory.twilio.com/v1/ControlPlane/Stores"
```

### 2. Create a Conversation Intelligence Configuration

Conversation Intelligence runs operators against captured conversations. This example enables the Twilio-authored Summary operator when a conversation ends.

```bash
curl -sS -u "$TWILIO_API_KEY:$TWILIO_API_SECRET" \
  -H "Content-Type: application/json" \
  -X POST "https://intelligence.twilio.com/v3/ControlPlane/Configurations" \
  -d '{
    "displayName": "space-app-demo-intelligence",
    "description": "Post-conversation analysis for the TAC starter app",
    "rules": [
      {
        "operators": [
          {
            "id": "intelligence_operator_01kcv35pnkeysaf6z6cqtbpegn"
          }
        ],
        "triggers": [
          {
            "on": "CONVERSATION_END"
          }
        ],
        "actions": []
      }
    ]
  }'
```

Copy the Intelligence Configuration ID into `.env`:

```env
TWILIO_INTELLIGENCE_CONFIGURATION_ID=intelligence_configuration_xxxxxxxxxxxxxxxxxxxxxxxxxx
```

If you do not want Conversation Intelligence results yet, create the configuration with `"rules": []`.

### 3. Create a Conversation Orchestrator Configuration

Conversation Orchestrator connects your Twilio channels, Conversation Memory, and Conversation Intelligence.

Create a file named `/tmp/tac-conversation-config.json`:

```bash
cat > /tmp/tac-conversation-config.json <<EOF
{
  "displayName": "space-app-demo-conversation-config",
  "description": "Routes Voice and SMS traffic to the TAC starter app",
  "conversationGroupingType": "GROUP_BY_PROFILE",
  "memoryStoreId": "$TWILIO_MEMORY_STORE_ID",
  "memoryExtractionEnabled": true,
  "intelligenceConfigurationIds": [
    "$TWILIO_INTELLIGENCE_CONFIGURATION_ID"
  ],
  "statusCallbacks": [
    {
      "url": "https://$TWILIO_VOICE_PUBLIC_DOMAIN/webhook",
      "method": "POST"
    }
  ],
  "channelSettings": {
    "SMS": {
      "statusTimeouts": {
        "inactive": 10,
        "closed": 60
      }
    },
    "VOICE": {
      "statusTimeouts": null
    }
  }
}
EOF
```

This app uses TAC's active Voice path through ConversationRelay, so the example intentionally does not add passive `VOICE.captureRules`. Do not combine active ConversationRelay voice with passive Voice capture rules for the same traffic.

Then create the configuration:

```bash
curl -sS -u "$TWILIO_API_KEY:$TWILIO_API_SECRET" \
  -H "Content-Type: application/json" \
  -X POST "https://conversations.twilio.com/v2/ControlPlane/Configurations" \
  --data @/tmp/tac-conversation-config.json
```

If the response includes a `statusUrl`, poll it until the operation is `COMPLETED`:

```bash
curl -sS -u "$TWILIO_API_KEY:$TWILIO_API_SECRET" "<statusUrl from the create response>"
```

Copy the Conversation Configuration ID into `.env`:

```env
TWILIO_CONVERSATION_CONFIGURATION_ID=conv_configuration_xxxxxxxxxxxxxxxxxxxxxxxxxx
```

If you need to update this configuration later, use `PUT` with the full configuration object. Do not use `PATCH`; the ControlPlane Configuration endpoint does not support it.

## Configure Your Twilio Number

In the Twilio Console, set your phone number webhooks:

```text
Voice webhook: https://<your-ngrok-domain>/twiml
Method: POST

Messaging webhook: https://<your-ngrok-domain>/webhook
Method: POST
```

For Voice, TAC uses `/twiml` to return ConversationRelay TwiML. The TAC SDK handles the WebSocket route internally.

## Start the App

```bash
npm start
```

You should see the TAC server start on port `8000`.

Now call or text your Twilio number.

Example prompts:

```text
What are the field conditions in 10027?
```

```text
Can I irrigate today in 90026?
```

For Voice, the app also handles transcriptions like:

```text
1 0 0, 2 7
```

## Understanding `server.js`

`server.js` is the TAC entry point.

It does four things:

1. Loads environment variables.
2. Creates a TAC instance from `.env`.
3. Registers Voice and SMS channels.
4. Sends each normalized user message to the active agent.

The current active agent is imported here:

```js
import { handleAgentMessage } from "./agents/field-shift-agent.js";
```

To switch to the AQI agent:

```js
import { handleAgentMessage } from "./agents/aqi-agent.js";
```

## Understanding the Agent

The active agent lives in `agents/field-shift-agent.js`.

It contains:

- `systemPrompt`: the behavior instructions for the AI agent.
- `tools`: the function schema OpenAI can call.
- `getNasaAgData`: the function that returns field condition data.
- `conversationHistory`: short-term in-memory chat history per conversation.
- `handleAgentMessage`: the main function called by `server.js`.

The agent builds a prompt, adds Conversation Memory, sends the request to OpenAI, runs any requested tool calls, and returns the final text response.

## Conversation Memory

Memory is enabled in `server.js`:

```js
tac.registerChannel(new VoiceChannel(tac, { memoryMode: "always" }));
tac.registerChannel(new SMSChannel(tac, { memoryMode: "always" }));
```

With `memoryMode: "always"`, TAC attempts to retrieve memory for every inbound message.

The agent receives memory here:

```js
handleAgentMessage(message, { conversationId, memory, session, channel });
```

Then the agent uses:

```js
MemoryPromptBuilder.compose(basePrompt, context.memory, context.session);
```

This adds available profile traits, observations, summaries, and recent communications to the model prompt.

Important behavior:

- First-time callers may not have memory yet.
- Memory extraction can happen after a conversation is closed.
- A saved ZIP code is only available if Twilio Memory has extracted or stored it.
- The helper in `agents/zip-memory.js` looks for ZIP codes in `memory` and `session.profile.traits`.

## Adding Your Own Agent

To build a new TAC agent:

1. Create a new file in `agents/`.
2. Export a `handleAgentMessage(userMessage, context)` function.
3. Add your system prompt.
4. Add any OpenAI tools your agent needs.
5. Import your new handler from `server.js`.

Minimal shape:

```js
export async function handleAgentMessage(userMessage, context = {}) {
  return `You said: ${userMessage}`;
}
```

Once that works, add OpenAI, memory prompt composition, and tool calling.

## Data Modes

Field Shift uses live NASA POWER data by default and falls back to local mock data if the live lookup fails.

To force mock mode:

```env
FIELD_SHIFT_PROVIDER=mock
```

The alternate AQI agent supports:

```env
AIR_QUALITY_PROVIDER=mock
AIR_QUALITY_PROVIDER=auto
AIR_QUALITY_PROVIDER=airnow
AIRNOW_API_KEY=your_airnow_key
```

For live presentations or workshops, mock mode is more predictable.

## Useful Commands

| Command | Purpose |
|---|---|
| `npm start` | Start the TAC server |

This guide does not require local helper scripts such as `setup.js`, `reset-demo.js`, `DEMO.md`, or `SETUP.md`.

## Manual Operations

These commands replace the local helper scripts if you do not commit them to the repo.

### Close a Conversation

Closing a conversation triggers end-of-conversation processing, including Conversation Memory extraction and `CONVERSATION_END` Intelligence rules.

```bash
export TWILIO_AUTH_TOKEN=your_auth_token
export CONVERSATION_ID=conv_conversation_xxxxxxxxxxxxxxxxxxxxxxxxxx

curl -sS -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -X PATCH "https://conversations.twilio.com/v2/Conversations/$CONVERSATION_ID" \
  -d '{
    "status": "CLOSED"
  }'
```

### Inspect Conversation Intelligence Results

After the conversation closes, query operator results by conversation ID:

```bash
curl -sS -u "$TWILIO_API_KEY:$TWILIO_API_SECRET" \
  "https://intelligence.twilio.com/v3/OperatorResults?conversationId=$CONVERSATION_ID"
```

If you used the Summary rule from the setup section, results appear after the `CONVERSATION_END` operator finishes.

### Reset Conversation Memory

For a clean local test, list profiles in your Memory Store:

```bash
curl -sS -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  "https://memory.twilio.com/v1/Stores/$TWILIO_MEMORY_STORE_ID/Profiles"
```

Then delete any test profile you want to remove:

```bash
export PROFILE_ID=mem_profile_xxxxxxxxxxxxxxxxxxxxxxxxxx

curl -sS -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  -X DELETE "https://memory.twilio.com/v1/Stores/$TWILIO_MEMORY_STORE_ID/Profiles/$PROFILE_ID"
```

Profile deletion is irreversible. Use this only for test data.

## Troubleshooting

### RCS or WhatsApp validation errors

If you see validation errors for RCS or WhatsApp, remove blank optional variables from `.env`:

```env
TWILIO_RCS_SENDER_ID=
TWILIO_WHATSAPP_NUMBER=
```

Only set them when you have real sender values.

### Voice call does not connect

Check:

- `npm start` is running.
- ngrok is running on the same port as `TWILIO_SERVER_PORT`.
- `TWILIO_VOICE_PUBLIC_DOMAIN` matches the current ngrok domain.
- Your Twilio number Voice webhook points to `/twiml`.

### SMS does not reach the app

Check:

- Your Twilio number Messaging webhook points to `/webhook`.
- The webhook method is `POST`.
- Your ngrok tunnel is still active.

### The agent keeps asking for a ZIP code

That means the current message, conversation history, and retrieved memory did not include a usable ZIP code.

For first-time testing, include the ZIP explicitly:

```text
What are the field conditions in 10027?
```

After a conversation closes and memory extraction runs, future conversations from the same resolved profile may include saved context.

### Setup says a resource already exists

If a create command says the resource already exists, list that resource type, find the matching `displayName`, and copy the existing ID into `.env`.

## Next Steps

After you understand this starter app, the usual next improvements are:

- Replace mock data with your own API.
- Add a stronger system prompt for your use case.
- Add more tools.
- Add human handoff.
- Add richer memory traits.
- Deploy the server to a public HTTPS host instead of using ngrok.
