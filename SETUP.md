# Space Apps AQI Agent - JavaScript Setup Guide

This app is the AQI-focused version of the Twilio Conversations demo. It uses:

- Twilio Agent Connect for Voice, SMS, WhatsApp, and optional RCS routing.
- Conversation Orchestrator to group cross-channel interactions by customer profile.
- Conversation Memory to retrieve prior observations and summaries.
- Conversation Intelligence to run sentiment, summary, and custom operators.
- OpenAI Chat Completions with tool calling for AQI lookups.
- Local mock AQI data by default, with optional AirNow live data.

## 1. Twilio Prerequisites

Collect these values from the Twilio Console:

| Credential | Notes |
|---|---|
| `TWILIO_ACCOUNT_SID` | Starts with `AC` |
| `TWILIO_AUTH_TOKEN` | Account auth token |
| `TWILIO_API_KEY` | Standard API Key SID, starts with `SK` |
| `TWILIO_API_SECRET` | Shown once when creating the API key |
| `TWILIO_PHONE_NUMBER` | Voice/SMS sender in E.164 format |

Enable these products on the account:

- Conversation Orchestrator
- Conversation Memory
- Conversation Intelligence

For WhatsApp, configure a WhatsApp sender and set `TWILIO_WHATSAPP_NUMBER` in `whatsapp:+15551234567` format. For RCS, configure an RCS sender and set `TWILIO_RCS_SENDER_ID` in `rcs:<sender-id-or-phone>` format.

## 2. Local Setup

Install dependencies with Node.js 22.13 or newer:

```bash
npm install
```

Create your environment file:

```bash
cp .env.example .env
```

Fill in Twilio and OpenAI credentials. Leave these values blank until the setup script prints them:

```text
TWILIO_MEMORY_STORE_ID=
TWILIO_CONVERSATION_CONFIGURATION_ID=
TWILIO_INTELLIGENCE_CONFIGURATION_ID=
```

The app uses local mock AQI data by default:

```text
AIR_QUALITY_PROVIDER=mock
```

To use live AirNow observations, set:

```text
AIR_QUALITY_PROVIDER=auto
AIRNOW_API_KEY=your_airnow_key
```

Use `airnow` instead of `auto` if you want the app to fail instead of falling back to demo data when AirNow is unavailable.

## 3. Start ngrok

The server listens on port `8000` by default. Point ngrok at the same port:

```bash
ngrok http 8000
```

Copy the domain only, without `https://`, into `.env`:

```text
TWILIO_VOICE_PUBLIC_DOMAIN=abc123.ngrok.app
```

If you change `TWILIO_SERVER_PORT`, point ngrok at that value instead.

## 4. Provision Twilio Resources

Run the setup script once:

```bash
npm run setup
```

It creates:

- a Conversation Memory Store
- a Conversation Intelligence Configuration
- a Conversation Orchestrator Configuration with `GROUP_BY_PROFILE`
- a `/webhook` status callback when `TWILIO_VOICE_PUBLIC_DOMAIN` is set

Paste the printed IDs into `.env`.

## 5. Wire Channels

Voice is configured directly on the phone number:

```text
https://<your-ngrok-domain>/twiml
```

Use HTTP POST.

Messaging is delivered through Conversation Orchestrator, not the phone number's direct messaging webhook. `npm run setup` registers:

```text
https://<your-ngrok-domain>/webhook
```

Use the same Orchestrator webhook for SMS, WhatsApp, and RCS.

## 6. Add Intelligence Operators

Open the `space-app-aqi-intelligence` configuration in the Twilio Console and add the operators needed for the demo:

| Operator | Trigger | Purpose |
|---|---|---|
| Conversation Summary | `CONVERSATION_END` | Summarizes the full conversation |
| Sentiment Analysis | `COMMUNICATION` | Scores customer sentiment during the interaction |
| Customer Satisfaction | `CONVERSATION_END` | Predicts CSAT after the conversation closes |

To inspect operator results from a terminal:

```bash
npm run show:intelligence -- <conversation_id>
```

For SMS-style conversations, close the conversation to trigger end-of-conversation operators:

```bash
npm run close:conversation -- <conversation_id>
```

## 7. Start The Agent

```bash
npm start
```

Expected startup shape:

```text
Space Apps AQI agent starting on 0.0.0.0:8000.
Webhook : POST /webhook  (SMS, WhatsApp, RCS)
TwiML   : POST /twiml    (inbound calls)
WS      : wss://<your-ngrok-domain>/ws
Channels: Voice, SMS
AQI data: mock
```

WhatsApp appears only when `TWILIO_WHATSAPP_NUMBER` is set. RCS appears only when `TWILIO_RCS_SENDER_ID` is set.

## Demo Data

The mock data lives in `data.js`. Useful demo ZIP codes:

| ZIP | City | Mock AQI | Category |
|---|---|---:|---|
| `10001` | New York, NY | 58 | Moderate |
| `11201` | Brooklyn, NY | 64 | Moderate |
| `94103` | San Francisco, CA | 37 | Good |
| `90012` | Los Angeles, CA | 116 | Unhealthy for Sensitive Groups |
| `60601` | Chicago, IL | 73 | Moderate |
| `85004` | Phoenix, AZ | 151 | Unhealthy |

For a stage demo, update `phoneZipPreferences` in `data.js` with your device's E.164 number and preferred ZIP code.

## Development Tips

- Use `npx nodemon agent.js` for local auto-restart.
- Every turn logs channel, conversation ID, profile ID, masked phone number, tool calls, and reply text.
- The in-memory `histories` and preferred ZIP maps are demo-only. Replace them with Redis or a database for multi-instance deployments.
- Conversation Memory extraction is asynchronous after a conversation ends; pre-warm memory before depending on recall in a live presentation.

## Constraints

- Mock AQI data is sample data, not live regulatory guidance.
- Live AirNow mode requires external network access and an AirNow API key.
- These products are not HIPAA-eligible or PCI compliant.
- Conversation Memory Store limit is 15 per account.
- Intelligence Configuration rule limit is 5 rules per configuration and 5 operators per rule.
- `conversationGroupingType` is immutable after Conversation Configuration creation.
