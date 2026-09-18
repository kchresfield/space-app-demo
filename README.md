# Space Apps AQI Agent - JavaScript

An omnichannel air quality index assistant built with Twilio Agent Connect, OpenAI tool calling, Conversation Orchestrator, Conversation Memory, and Conversation Intelligence.

The agent answers voice and messaging questions like:

```text
What is the air quality in 10001?
```

It can use local demo AQI data immediately, or live AirNow observations when `AIRNOW_API_KEY` is configured.

## What It Does

- Answers SMS, Voice, WhatsApp, and optional RCS through one `tac.onMessageReady` callback.
- Retrieves AQI by US ZIP code.
- Explains AQI category, dominant pollutant, and practical health guidance.
- Compares AQI across multiple ZIP codes.
- Stores a caller's preferred ZIP in process memory for the live demo.
- Injects Twilio Conversation Memory into each OpenAI turn.

## Architecture

```text
Customer contacts you (SMS / RCS / Voice / WhatsApp)
         |
         v
Conversation Orchestrator
  |-- groups channel traffic into one conversation
  |-- links the conversation to a customer profile
         |
         |--> Conversation Memory and Intelligence
         |
         v
Twilio Agent Connect -> agent.js -> OpenAI + tools.js
         |
         v
Reply routed back to the same channel
```

## Quick Start

```bash
npm install
cp .env.example .env
# Fill in credentials, then:
npm run setup
# Paste the printed resource IDs into .env, then:
npm start
```

See `SETUP.md` for the full Twilio Console and ngrok walkthrough.

## Scripts

| Command | Purpose |
|---|---|
| `npm start` | Start the TAC server from `agent.js` |
| `npm run setup` | Provision Memory, Intelligence, and Conversation resources |
| `npm run reset:demo` | Delete Memory profiles before a fresh demo |
| `npm run show:intelligence -- <conversation_id>` | Print Conversation Intelligence operator results |
| `npm run close:conversation -- <conversation_id>` | Close a conversation so end-of-conversation operators run |

## Environment Variables

| Variable | Description |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_API_KEY` | Twilio API Key SID |
| `TWILIO_API_SECRET` | Twilio API Key Secret |
| `TWILIO_PHONE_NUMBER` | Twilio voice/SMS number in E.164 format |
| `TWILIO_WHATSAPP_NUMBER` | Optional WhatsApp sender, `whatsapp:+15551234567` |
| `TWILIO_RCS_SENDER_ID` | Optional RCS sender, `rcs:<sender-id-or-phone>` |
| `TWILIO_VOICE_PUBLIC_DOMAIN` | Public ngrok/custom domain without `https://` |
| `TWILIO_MEMORY_STORE_ID` | Set by `npm run setup` |
| `TWILIO_CONVERSATION_CONFIGURATION_ID` | Set by `npm run setup` |
| `TWILIO_INTELLIGENCE_CONFIGURATION_ID` | Set by `npm run setup` |
| `TWILIO_SERVER_HOST` | Optional host, defaults to `0.0.0.0` |
| `TWILIO_SERVER_PORT` | Optional port, defaults to `8000` |
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_MODEL` | Optional model override, defaults to `gpt-4o` |
| `AIR_QUALITY_PROVIDER` | `mock`, `auto`, or `airnow`; defaults to `mock` |
| `AIRNOW_API_KEY` | Optional AirNow key for live US AQI observations |

## Endpoints

TAC mounts these automatically:

| Endpoint | Purpose |
|---|---|
| `POST /webhook` | SMS, WhatsApp, and RCS events |
| `POST /twiml` | Inbound voice calls |
| `wss://<domain>/ws` | Conversation Relay WebSocket |

## Demo Data

The mock AQI store is in `data.js`. It includes ZIP codes for New York, Brooklyn, San Francisco, Los Angeles, Chicago, Houston, Denver, Seattle, Phoenix, and Washington DC. Restarting the server resets preferred ZIP changes.
