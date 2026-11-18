# ECLIPSE FCA

An independently maintained, modular Node.js client foundation for authorized Messenger sessions.

> **Development status:** AppState bootstrap, HTTP/proxy transport, configurable MQTT-over-WebSocket listener, and five injectable API modules are implemented. Actual Facebook MQTT topic schemas and private GraphQL operation identifiers are not bundled because they require verification against authorized protocol captures. This project does not claim drop-in ws3-fca compatibility yet.

## Requirements

- Node.js >= 20
- npm

## Development

```sh
npm install
npm test
npm run check
```

## Current capabilities

- CommonJS client with explicit lifecycle and in-memory session store.
- AppState cookie validation and best-effort extraction of `fb_dtsg`, `lsd`, `jazoest`, and account ID.
- Central HTTP client and explicit HTTP/HTTPS/SOCKS proxy agents.
- Configurable MQTT.js WebSocket listener with subscriptions, publish, JSON decoding, raw-payload preservation, and event forwarding.
- MQTT WebSocket proxy uses the configured HTTPS proxy agent; proxy errors do not silently switch to direct mode.
- API methods are injected into `client.api` after successful appState login:
  - `sendMessage` (including validated mention ranges)
  - `createPoll`
  - `commentPost` (including nested reply parent IDs)
  - `joinCall` (application-provided signaling hook)
  - `getThreadInfo`

## Configure verified operations

Facebook's private GraphQL schemas and doc IDs are not stable public contracts. Supply verified descriptors from protocol captures you are authorized to use. Each descriptor requires a real `docId` and either a `buildVariables(input, session)` function or a variables object.

```js
const { createClient } = require('eclipse-fca');

const client = createClient({
  apiOperations: {
    sendMessage: {
      docId: process.env.FB_SEND_MESSAGE_DOC_ID,
      buildVariables: ({ threadID, body, mentions }) => ({
        // Map these fields to the verified operation's actual variables.
        threadID, body, mentions
      })
    }
  },
  mqtt: {
    endpoint: process.env.FB_MQTT_WEBSOCKET_URL,
    topics: (process.env.FB_MQTT_TOPICS || '').split(',').filter(Boolean)
  }
});

await client.login(appState);
await client.api.sendMessage({
  threadID: 'thread-id',
  body: 'Hello @Sam',
  mentions: [{ tag: '@Sam', id: 'user-id', fromIndex: 6 }]
});

const listener = client.listen();
listener.on('message', event => {
  // Decode only payload formats your application has verified.
});
```

The example's operation mapping is illustrative; the supplied doc ID, variable names, endpoint, MQTT endpoint, and topics must be verified for the account and protocol version. No Facebook endpoint or doc ID is hard-coded as a claimed working operation.

## MQTT and calls

`client.listen()` requires a valid `wss://` endpoint, an authenticated session, and caller-supplied topic names. It forwards decoded JSON events and preserves unknown payloads as raw text. It does not claim to decode every Messenger binary payload or know undocumented topic names.

`joinCall` invokes a configured operation and forwards any returned signaling data to your application-provided `apiHooks.onSignal`. It does not implement a media stack, WebRTC negotiation, microphone/camera access, or platform-specific call signaling by itself.

## Authentication and safety limits

This release accepts an existing authorized appState session. It does not collect passwords, evade checkpoints, bypass two-factor challenges, rotate identities to evade detection, or retry through security challenges. Token extraction is best-effort; automatic token-expiry refresh is not yet verified. Never log or commit appState cookies, tokens, or raw session objects.

Use only accounts and sessions you are authorized to access, and respect platform terms and rate limits.
