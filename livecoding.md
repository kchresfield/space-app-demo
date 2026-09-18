# Live-Coding Reference

This app uses a small router-style structure:

- `server.js` owns the minimal Twilio Agent Connect setup, channel registration, and callback wiring.
- `agents/aqi-agent.js` owns the OpenAI prompt, tool call loop, AirNow lookup, mock fallback, and spoken ZIP normalization.
- `agents/field-shift-agent.js` is an alternate NASA agriculture agent you can swap in by changing the import in `server.js`.

## TAC Callback

TAC calls `onMessageReady` with `message`, not `userMessage`, and TAC sends any non-empty string you return:

```js
tac.onMessageReady(async ({ conversationId, message, memory, session, channel }) => {
  return handleAgentMessage(message, { conversationId, memory, session, channel });
});
```

## AQI Lookup

The AQI agent uses the newer AirNow endpoint:

```text
https://www.airnowapi.org/aq/observation/current/ziplatlong/
```

It accepts voice transcripts like:

```text
1 0 0, 2 7
```

and normalizes them to:

```text
10027
```
