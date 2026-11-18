# Architecture

## Current boundary

The current branch contains an appState session bootstrap, an Axios-based HTTP request client, explicit HTTP/SOCKS proxy agents, an MQTT.js WSS listener, JSON/raw payload decoding, and five configurable API operation wrappers. It is a client foundation, not a verified Messenger protocol implementation or drop-in ws3-fca replacement.

Facebook's private GraphQL operation identifiers, variable schemas, MQTT topics, and binary event formats are not bundled. Those details must be verified against authorized protocol captures before claiming end-to-end compatibility.

## Layers

- **Public entry point:** CommonJS exports and client factory.
- **Core:** configuration, client lifecycle, appState login, token extraction, request wrapper, and structured errors.
- **HTTP transport:** Axios wrapper with timeout and response-size bounds; explicit HTTP, HTTPS, and SOCKS proxy agents.
- **Network engine:** separate Fetch-compatible primitive with bounded retries and injected proxy/realtime adapters. It is not yet the transport used by the main client or MQTT listener.
- **Storage:** asynchronous session-store interface; memory implementation is the default and raw store is not exposed as a client getter.
- **MQTT:** configurable MQTT.js WebSocket listener, explicit topic subscriptions, proxy agent injection, and conservative JSON/raw payload decoding.
- **API:** named methods backed by caller-supplied, verified operation descriptors.
- **Compatibility:** callback and legacy adapters remain planned and are not currently supported.

## Network contract

The main client HTTP path uses the Axios request wrapper. Direct mode is the default. Proxy mode creates explicit HTTP/HTTPS/SOCKS agents and disables Axios's own proxy discovery so a failed proxy does not silently become a direct request.

The separate createNetworkEngine(options) primitive exposes:
- request(input, init): Fetch-compatible HTTP request with per-attempt timeout and bounded retry behavior.
- openRealtime(url, protocols): delegates socket creation to an injected realtime adapter.
- diagnostics(): returns non-secret transport configuration metadata.

Network-engine retries are limited to GET, HEAD, and OPTIONS. Other methods are not retried unless the caller supplies an idempotency key. Retryable responses are 408, 425, 429, 500, 502, 503, and 504. Callers must use replayable request bodies when opting a non-safe method into retries.

The MQTT listener uses MQTT.js and applies the configured HTTPS proxy agent in proxy mode. The concrete Messenger WSS endpoint and topic names remain caller-supplied and unverified. There is no silent direct fallback.

## Authentication and origin boundaries

AppState login validates that the login URL uses HTTPS on a Facebook-owned hostname before sending cookies. Automatic client cookie forwarding is limited to HTTPS Facebook hosts. Configured GraphQL endpoints are subject to the same restriction, and MQTT session cookies are sent only to WSS Facebook hosts.

The public session getter returns account ID and authentication time only. Cookies and authentication tokens are not exposed by the public getter; internal API code uses a private symbol-based accessor. The raw session store is not exposed as a public client property. Injected transports receive the internal session/store context and must be treated as trusted application code.

## Client transport contract

An injected client transport may implement connect({ config, sessionStore, session, request, requestClient, api, emit }) and disconnect(). The client does not report a successful connection unless the transport's connect method resolves.

## Configuration

- Direct networking is the default.
- Proxy mode must be explicitly selected and supplied with a proxy URL.
- Session storage defaults to memory.
- Configuration is normalized and frozen when the client is created.


## Protocol fixture workflow

The test suite replays deterministic synthetic MQTT and GraphQL fixtures from test/fixtures. These prove parser and error-handling behavior only; they are not real Messenger captures and do not establish protocol compatibility. Real authorized captures must be sanitized offline, reviewed for secrets and personal data, reduced to minimal fixtures, and accompanied by provenance and verification notes before they are committed. Fixture tests are offline and must never require a live account or session.


## Session durability, refresh and invalidation

- `MemorySessionStore` remains the default. `FileSessionStore` is an opt-in store with hashed key filenames, mode-0600 temporary files, atomic rename, and a mode-0700 directory. It does not encrypt session data at rest.
- Critical cookie rotations (`xs`, `c_user`, `fr`, `sb`, `datr`) are merged into the normalized cookie state and persisted before the HTTP request returns.
- A jittered scheduler refreshes page-derived `fb_dtsg`, `lsd`, and `jazoest` by fetching the configured Facebook session page. The default is 45 minutes ±5 minutes. This is a best-effort page-token refresh, not a guarantee of session longevity or a claim about server token expiry.
- A refresh mutex serializes refresh work; client HTTP/API calls wait for an active refresh to settle.
- Checkpoint/logout redirects, known authentication error codes, and removal of required `c_user`/`xs` cookies trip a terminal circuit breaker. The session is persisted as invalidated, in-flight HTTP requests are aborted, the realtime transports and scheduler are stopped, and `session_expired` is emitted.
- A fresh explicit login creates a new session manager/breaker. No automatic checkpoint retry or authentication bypass is attempted.


## Browser profile and pacing

- `browserProfile` is normalized and frozen at client creation. The same User-Agent, `Sec-CH-UA*`, and `Sec-Fetch-*` profile is applied to HTTP requests and MQTT WebSocket handshakes. The configured values override conflicting per-request header values; the library does not rotate identities.
- Outbound mutation operations pass through a shared queue. It serializes operations per endpoint/thread, maintains token buckets for each endpoint and thread, and applies configurable jitter (default 400–1600 ms). Default buckets have capacity 5 and refill at 1 token/second. `getThreadInfo` is treated as a read; custom descriptors may set `mutation: false`.
- `sendMessage({ typingIndicator: true })` invokes the caller-supplied `apiHooks.sendTypingIndicator({ threadID, state: 'typ' })` immediately before the mutation request. The library does not fabricate a private typing payload.
- MQTT acknowledgements are opt-in through `mqtt.acknowledgements`. Delayed `markAsDelivered` and `markAsRead` callbacks must be supplied by the application. They receive normalized MQTT message events; no unverified receipt wire format is implemented. Pending acknowledgement timers are cancelled when the listener closes.


## External GraphQL operation registry

- The default registry is `src/config/operations.json`; it defines descriptors for the five API methods with null `doc_id` placeholders. The placeholders are deliberately non-executable until replaced with verified IDs.
- `createClient({ operationRegistryPath })` loads an alternate JSON registry. The file must use schema version 1. `apiOperations` programmatic descriptors override matching registry entries.
- JSON `input_schema` definitions validate required fields, basic value types, nullable optional fields, and unexpected keys before variables are built. Templates support literal values and explicit `$input`, `$inputOptional`, and `$session` references; they are resolved as data and never evaluated as JavaScript.
- The operation executor still enforces HTTPS Facebook-owned endpoints and refuses a null/unverified doc ID.

## MQTT Thrift and LightSpeed framing boundary

- `src/mqtt/thrift-binary.js` implements a generic, schema-neutral Thrift Binary Protocol struct reader/writer with byte, nesting, and collection limits.
- `src/mqtt/codec.js` recognizes `/ls_req` and `/ls_resp` topic families, preserves JSON handling, and reads/writes an explicit ECLIPSE-owned `ECLT` frame containing version, kind, length, and a Thrift struct.
- The `ECLT` frame is a synthetic ECLIPSE envelope, **not** a claim about Facebook's actual LightSpeed framing. Unrecognized binary data is preserved as raw payload text; actual Facebook message schemas and framing require authorized, redacted captures.
- The decoder does not infer field IDs, operation meanings, or private protocol structures. All fixtures for this layer are synthetic and offline.
