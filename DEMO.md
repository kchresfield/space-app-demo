# Space Apps AQI Agent - JavaScript Live Demo Script

This is the Space Apps version of the Conversations technical demo. The story is voice-first: connect an OpenAI-backed AQI assistant to Voice with Twilio Agent Connect, show Conversation Intelligence, turn on Conversation Memory, then continue the same customer relationship over messaging.

## Cast Of Demo Data

Use the seed values in `data.js` so lookups resolve instantly:

| ZIP | City | Mock AQI | Category | Pollutant |
|---|---|---:|---|---|
| `10001` | New York, NY | 58 | Moderate | PM2.5 |
| `11201` | Brooklyn, NY | 64 | Moderate | Ozone |
| `94103` | San Francisco, CA | 37 | Good | PM2.5 |
| `90012` | Los Angeles, CA | 116 | Unhealthy for Sensitive Groups | Ozone |
| `80202` | Denver, CO | 129 | Unhealthy for Sensitive Groups | Ozone |
| `85004` | Phoenix, AZ | 151 | Unhealthy | Ozone |

For phone-based personalization, edit `phoneZipPreferences` in `data.js` to use the presenter's real demo device number in E.164 format.

## Pre-Demo Checklist

- Run `npm install`.
- Fill `.env` with Twilio credentials, `TWILIO_PHONE_NUMBER`, `TWILIO_VOICE_PUBLIC_DOMAIN`, generated resource IDs, and `OPENAI_API_KEY`.
- Keep `AIR_QUALITY_PROVIDER=mock` for a deterministic demo, or set `AIR_QUALITY_PROVIDER=auto` and `AIRNOW_API_KEY` for live data with mock fallback.
- Run `ngrok http 8000` and keep it running.
- Run `npm start` in a second terminal.
- Run `npm run reset:demo` before a fresh demo if Memory profiles should be cleared.
- Confirm the Conversation Orchestrator webhook is `https://<domain>/webhook`.
- Confirm the phone number Voice URL is `https://<domain>/twiml`.
- Add Intelligence rules for sentiment and conversation summary.

## Demo Arc

| Act | Beat | What The Audience Sees |
|---|---|---|
| 0 | Architecture | Conversation Orchestrator, Memory, Intelligence, and TAC in the Console |
| 1 | The brain | `SYSTEM_PROMPT`, `tools.js`, and the OpenAI tool loop |
| 2 | Voice | A live call answered by the agent through Conversation Relay |
| 3 | Intelligence | Sentiment and summary results in Console or `show-intelligence.js` |
| 4 | Memory | The next interaction includes previous conversation context |
| 5 | Omnichannel | Messaging continues from the same profile and callback |
| 6 | Recap | One callback handles channels, memory, tools, and replies |

## Act 1 - Code Tour

Show `agent.js`:

- `SYSTEM_PROMPT` defines Orbit AQI behavior and channel constraints.
- `generateReply` runs the OpenAI tool-calling loop.
- `tac.onMessageReady` receives every channel and composes memory into the prompt.

Show `tools.js`:

- Each tool maps a snake_case OpenAI function name to a JavaScript implementation.
- Tools return JSON strings so the model can reason over structured AQI state.
- `AIR_QUALITY_PROVIDER=mock` keeps the demo deterministic; `auto` can use AirNow when configured.

## Act 2 - Voice

Call the Twilio number as the demo customer:

```text
Hi, can you check the air quality for 10001?
```

Then ask:

```text
Is that safe for someone with asthma to go for a run?
```

Point out that TAC handles `/twiml`, `/ws`, Conversation Relay, transcription, and reply routing.

## Act 3 - Intelligence

Use the Console or terminal helper:

```bash
npm run show:intelligence -- <conversation_id>
```

Show that real-time operators can score live communications and end-of-conversation operators can summarize the whole interaction.

## Act 4 - Memory

Start a second contact from the same phone number after Memory extraction has had time to complete:

```text
Remember 10001 as my usual ZIP code.
```

Then ask:

```text
What is the air quality where I usually am?
```

The callback uses `MemoryPromptBuilder.compose(...)`, and the channels use `memoryMode: "always"`, so retrieved observations and summaries are automatically available to the model.

## Act 5 - Messaging

Send an SMS or WhatsApp message from the same customer identity:

```text
Compare the air quality in 10001, 94103, and 85004.
```

The same `onMessageReady` callback handles the request and routes the reply back to the same channel.

Close the conversation when you need end-of-conversation operators to run:

```bash
npm run close:conversation -- <conversation_id>
```

## Reliability Notes

- Voice transcription works best in a quiet room with short utterances.
- Use `AIR_QUALITY_PROVIDER=mock` for a deterministic stage demo.
- Conversation Memory extraction is asynchronous, so pre-warm the memory profile before relying on recall live.
- If messaging is silent, check the agent terminal first. No inbound log usually means webhook or ngrok configuration is wrong.
- Restarting `npm start` resets only the in-process mock preferences and conversation history; Twilio Memory and Intelligence data persists.
