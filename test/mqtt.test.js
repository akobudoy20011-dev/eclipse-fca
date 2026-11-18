# ECLIPSE FCA

An independently maintained, modular Node.js client foundation for authorized Messenger sessions.

> **Development status:** Foundation, HTTP transport wrapper, explicit HTTP/SOCKS proxy agents, and appState session bootstrap are present. MQTT/WebSocket connectivity and Messenger API operations are not implemented yet. Facebook page markup and private endpoints can change without notice; successful token extraction is not guaranteed until validated against maintained fixtures and authorized integration tests.

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

- CommonJS package and explicit client lifecycle.
- AppState cookie normalization and validation (requires `c_user` and `xs`).
- Authenticated landing-page request and best-effort extraction of `fb_dtsg`, `lsd`, `jazoest`, and account ID.
- In-memory session storage by default; session cookies are not exposed by the client's public session getter.
- Central Axios HTTP wrapper with timeout, bounded response sizes, and redacted error details.
- Direct network mode by default; optional HTTP, HTTPS, SOCKS4, and SOCKS5 proxy agents.
- Proxy mode is explicit. A proxy initialization or connection failure is surfaced; there is no silent direct-network fallback.
- Authenticated client requests automatically attach the current session cookie header.

## Authentication limits

This release accepts an existing, authorized appState session. It does not collect account passwords, automate credential login, defeat checkpoints, bypass two-factor challenges, rotate identities to evade detection, or retry through security challenges. Token extraction is best-effort and based on observed page markup; there is not yet a verified automatic token-expiry refresh flow. If Facebook requires a checkpoint or changes its login page, the library must stop and surface the failure.

Never log, publish, or commit appState cookies, access tokens, or raw session objects.

## Network configuration

Direct mode is the default:

```js
const client = createClient();
```

Explicit proxy mode:

```js
const client = createClient({
  network: {
    mode: 'proxy',
    proxy: 'socks5h://username:password@proxy.example:1080'
  }
});
```

Use `http://`, `https://`, `socks4://`, `socks4a://`, `socks5://`, or `socks5h://` proxy URLs. Keep credentials in environment variables or a secret manager, never source control. Both HTTP and HTTPS requests use the selected proxy agents in proxy mode.

## AppState example

```js
const { createClient } = require('eclipse-fca');

const client = createClient();
const result = await client.login(appState);
console.log('Authenticated account:', result.userId);
// client.request(...) now includes the session cookie automatically.
```

The example assumes `appState` is supplied securely by the application. It is not a guarantee that Facebook will accept the session or expose all expected page tokens.

## Safety and account access

Use only accounts and sessions you are authorized to access. Respect platform terms, rate limits, and account security challenges. The library must not silently bypass checkpoints or fall back to a different network route.
