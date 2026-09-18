# Space Apps AQI Agent - Live Demo Script

This demo connects a NASA Space Apps air quality assistant to Twilio Voice and Messaging through Twilio Agent Connect.

## Pre-Demo Checklist

- Run `npm install`.
- Fill `.env` with Twilio credentials, `OPENAI_API_KEY`, `AIRNOW_API_KEY`, and `TWILIO_VOICE_PUBLIC_DOMAIN`.
- Use `AIR_QUALITY_PROVIDER=auto` for AirNow with mock fallback, or `mock` for deterministic demo data.
- Run `ngrok http 8000`.
- Run `npm start`.
- Confirm the Twilio number Voice webhook is `https://<domain>/twiml`.

## Voice Demo

Call the Twilio number and say:

```text
What is the air quality in 10027?
```

Then ask:

```text
Is that safe for someone with asthma?
```

Point out that TAC handles `/twiml`, `/ws`, Conversation Relay, transcription, and reply routing.

## Messaging Demo

Send:

```text
What is the AQI for 90026?
```

The same `server.js` callback receives the message and routes it to `agents/aqi-agent.js`.

## Useful Demo ZIP Codes

| ZIP | City | Mock AQI | Category |
|---|---|---:|---|
| `10001` | New York, NY | 58 | Moderate |
| `10027` | New York, NY | 61 | Moderate |
| `90026` | Los Angeles, CA | 104 | Unhealthy for Sensitive Groups |
| `94103` | San Francisco, CA | 37 | Good |
| `85004` | Phoenix, AZ | 151 | Unhealthy |

## Intelligence

Use the conversation ID from the server log:

```bash
npm run show:intelligence -- <conversation_id>
```

For messaging conversations, close the conversation to trigger end-of-conversation operators:

```bash
npm run close:conversation -- <conversation_id>
```
