# Space Apps AQI Agent - Setup Guide

This app uses Twilio Agent Connect for Voice/SMS routing, Conversation Orchestrator for conversation capture, Conversation Memory for context, Conversation Intelligence for analysis, OpenAI for response generation, and AirNow or mock data for AQI readings.

## 1. Install

```bash
cd /Users/kchresfield/code/space-app-demo
npm install
cp .env.example .env
```

## 2. Fill In `.env`

Required:

```text
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_API_KEY=SK...
TWILIO_API_SECRET=...
TWILIO_PHONE_NUMBER=+1...
OPENAI_API_KEY=...
TWILIO_SERVER_PORT=8000
```

For AQI data:

```text
AIR_QUALITY_PROVIDER=auto
AIRNOW_API_KEY=...
```

Use `AIR_QUALITY_PROVIDER=mock` if you want deterministic local demo data only.

Leave these blank until `npm run setup` prints them:

```text
TWILIO_MEMORY_STORE_ID=
TWILIO_CONVERSATION_CONFIGURATION_ID=
TWILIO_INTELLIGENCE_CONFIGURATION_ID=
```

## 3. Start ngrok

In a separate terminal:

```bash
ngrok http 8000
```

Copy the domain only into `.env`:

```text
TWILIO_VOICE_PUBLIC_DOMAIN=abc123.ngrok.app
```

## 4. Provision Twilio Resources

Run:

```bash
npm run setup
```

Copy the printed values into `.env`:

```text
TWILIO_MEMORY_STORE_ID=...
TWILIO_INTELLIGENCE_CONFIGURATION_ID=...
TWILIO_CONVERSATION_CONFIGURATION_ID=...
```

## 5. Configure Voice

In the Twilio Console, set your Twilio phone number Voice webhook to:

```text
https://<your-ngrok-domain>/twiml
```

Use `HTTP POST`.

## 6. Start The Agent

```bash
npm start
```

Expected startup:

```text
Space Apps AQI agent starting on 0.0.0.0:8000.
Webhook : POST /webhook  (SMS)
TwiML   : POST /twiml    (inbound calls)
WS      : wss://<your-ngrok-domain>/ws
Channels: Voice, SMS
AQI data: auto
```

## 7. Test Voice

Call your Twilio number and say:

```text
What is the air quality in 10027?
```

If transcription splits the ZIP code as `1 0 0, 2 7`, the app normalizes it to `10027`.

## Optional Intelligence Commands

Inspect Conversation Intelligence results:

```bash
npm run show:intelligence -- <conversation_id>
```

Close a conversation to trigger end-of-conversation operators:

```bash
npm run close:conversation -- <conversation_id>
```
