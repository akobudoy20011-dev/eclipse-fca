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
- AppState cookie validation and best-effort extraction of fb_dtsg, lsd, jazoest, and account ID.
- Central HTTP client and explicit HTTP/HTTPS/SOCKS proxy agents.
- Configurable MQTT.js WebSocket listener with subscriptions, publish, JSON decoding, raw-payload preservation, and event forwarding.
- MQTT WebSocket proxy uses the configured HTTPS proxy agent; proxy errors do not silently switch to direct mode.
- Session cookies are not exposed by the public session getter or raw session-store getter.
- Automatic cookie forwarding is restricted to HTTPS Facebook hosts; configured GraphQL endpoints must also use HTTPS Facebook hosts.
- MQTT session cookies are restricted to WSS Facebook hosts.
- API methods are injected into client.api after successful appState login:
  - sendMessage (including validated mention ranges)
  - createPoll
  - commentPost (including nested reply parent IDs)
  - joinCall (application-provided signaling hook)
  - getThreadInfo

## Configure verified operations

Facebook's private GraphQL schemas and doc IDs are not stable public contracts. Supply verified descriptors from protocol captures you are authorized to use. Each descriptor requires a real docId and either a buildVariables(input, session) function or a variables object.

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

The example's operation mapping is illustrative; the supplied doc ID, variable names, endpoint, MQTT endpoint, and topics must be verified for the account and protocol version. API and login URLs must use HTTPS on Facebook-owned hosts; the MQTT endpoint must use WSS on a Facebook-owned host. No Facebook endpoint or doc ID is hard-coded as a claimed working operation.

## MQTT and calls

client.listen() requires a valid WSS Facebook endpoint, an authenticated session, and caller-supplied topic names. It forwards decoded JSON events and preserves unknown payloads as raw text. It does not claim to decode every Messenger binary payload or know undocumented topic names.

joinCall invokes a configured operation and forwards any returned signaling data to your application-provided apiHooks.onSignal. It does not implement a media stack, WebRTC negotiation, microphone/camera access, or platform-specific call signaling by itself.

## Authentication and safety limits

This release accepts an existing authorized appState session. It does not collect passwords, evade checkpoints, bypass two-factor challenges, rotate identities to evade detection, or retry through security challenges. Token extraction is best-effort; automatic token-expiry refresh is not yet verified. Never log or commit appState cookies, tokens, proxy credentials, or raw session objects.

Use only accounts and sessions you are authorized to access, and respect platform terms and rate limits.


## Session durability and lifecycle

The default session store remains in-memory. For opt-in disk persistence, inject the file-backed store:

```js
const path = require('node:path');
const { createClient, FileSessionStore } = require('eclipse-fca');

const sessionStore = new FileSessionStore({
  directory: path.join(process.cwd(), '.eclipse-sessions')
});
const client = createClient({ sessionStore });
await client.login(appState);
```

The file store hashes session keys into filenames, writes a temporary file with mode `0600`, flushes it, then atomically renames it into place. Its directory is created with mode `0700`. Session contents necessarily include authentication cookies; protect the directory, backups, and host account. Disk persistence is opt-in and is not encryption at rest.

When HTTP responses rotate any of `xs`, `c_user`, `fr`, `sb`, or `datr`, the normalized cookie set is persisted before the request completes. Other cookie updates remain in memory until a critical cookie rotates or the next explicit session write occurs.

After login, a refresh scheduler fetches the configured Facebook session page (default `https://www.facebook.com/`) roughly every 45 minutes with ±5 minutes of jitter. It extracts tokens from the returned page; no private refresh endpoint is assumed. Configure `session.refresh.intervalMs`, `session.refresh.jitterMs`, or `session.refreshUrl` if required. Concurrent client HTTP/API requests wait while a refresh is active. Failed extraction emits `token_refresh_error`; it does not fabricate new tokens.

A detected checkpoint redirect, logout redirect, missing required session cookie, or known authentication error trips a terminal session circuit breaker. The client stops its refresh timer, closes MQTT and the injected transport, persists `invalidated: true`, emits `session_expired`, and rejects subsequent requests until the application explicitly logs in again with a valid authorized appState.

The refresh mechanism can reduce stale-token reuse, but it cannot guarantee that Facebook will preserve a session. Server-side security decisions, checkpoints, revocation, password changes, and account restrictions remain outside the library's control.
