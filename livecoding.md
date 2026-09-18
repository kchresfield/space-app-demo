# Live-Coding Reference

This is the JavaScript companion to `DEMO.md`. The checked-in `agent.js` is already the complete version, but these snippets show the small edits to present if you want to live-code the progression.

## Act 2 - Connect Voice

Import TAC and the Voice channel:

```js
import {
  MemoryPromptBuilder,
  TAC,
  TACConfig,
  TACServer,
  VoiceChannel,
} from "twilio-agent-connect";
```

Create TAC, register Voice, and start the server:

```js
const tac = await TAC.create({ config: TACConfig.fromEnv() });
const voiceChannel = new VoiceChannel(tac, { memoryMode: "never" });

tac.registerChannel(voiceChannel);

const server = new TACServer(tac, {
  host: process.env.TWILIO_SERVER_HOST || "0.0.0.0",
  port: Number.parseInt(process.env.TWILIO_SERVER_PORT || "8000", 10),
});

await server.start();
```

Run:

```bash
npm start
```

## Act 3 - Add AQI Tools

Use `get_air_quality_by_zip` for direct lookup:

```js
export async function getAirQualityByZip({ zip_code: zipCode }) {
  return JSON.stringify(await resolveAirQualityReading(zipCode));
}
```

Pass tools to OpenAI:

```js
const completion = await getOpenAIClient().chat.completions.create({
  model: process.env.OPENAI_MODEL || "gpt-4o",
  messages,
  tools: openaiTools,
  tool_choice: "auto",
});
```

## Act 4 - Show Intelligence

Pass the `conversationId` from the agent log:

```bash
npm run show:intelligence -- <conversation_id>
```

## Act 5 - Turn On Memory

Change the Voice channel from `never` to `always`:

```js
const voiceChannel = new VoiceChannel(tac, { memoryMode: "always" });
```

`tac.onMessageReady` composes memory into the system prompt:

```js
const systemPrompt = MemoryPromptBuilder.compose(basePrompt, memory, session);
```

## Act 6 - Add Messaging

Add SMS:

```js
const smsChannel = new SMSChannel(tac, { memoryMode: "always" });
tac.registerChannel(smsChannel);
```

Add optional WhatsApp and RCS:

```js
if (process.env.TWILIO_WHATSAPP_NUMBER) {
  tac.registerChannel(new WhatsAppChannel(tac, { memoryMode: "always" }));
}

if (process.env.TWILIO_RCS_SENDER_ID) {
  tac.registerChannel(new RCSChannel(tac, { memoryMode: "always" }));
}
```

Close an SMS-style conversation when you need end-of-conversation operators:

```bash
npm run close:conversation -- <conversation_id>
```

## Complete Flow

The complete implementation is in `agent.js`:

- `createChannels` wires Voice, SMS, optional WhatsApp, and optional RCS.
- `resolveCallerPhone` extracts the customer phone number from TAC session context.
- `generateReply` runs OpenAI Chat Completions with function calling.
- `tools.js` contains the AQI lookup, comparison, guidance, and preferred ZIP tools.
