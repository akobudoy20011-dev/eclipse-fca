# Architecture

## Current boundary

The foundation and network-engine milestones provide a shared transport primitive. Messenger authentication, MQTT framing, Messenger protocol decoding, and Messenger operations are not implemented yet.

## Layers

- **Public entry point:** stable CommonJS exports.
- **Core:** configuration, client lifecycle, and structured errors.
- **Network:** centralized Fetch-compatible HTTP dispatch, timeout, bounded retry policy, optional injected proxy adapter, and injected realtime adapter.
- **Storage:** asynchronous session-store interface; memory implementation is the default.
- **Authentication (planned):** cookie parsing, session validation, and controlled login lifecycle.
- **Protocol and API (planned):** Messenger-specific operations and event normalization.
- **Compatibility (planned):** callback and legacy method adapters backed by the same modern implementation.

## Network contract

Create an engine with `createNetworkEngine(options)`. It exposes:

- `request(input, init)`: Fetch-compatible HTTP request with a per-attempt timeout.
- `openRealtime(url, protocols)`: delegates socket creation to an injected realtime adapter.
- `diagnostics()`: returns non-secret transport configuration metadata.

Direct mode uses the supplied `fetch` implementation or Node's global Fetch. Proxy mode requires an explicit `proxyAdapter.fetch`; there is no silent direct fallback. A realtime adapter receives the selected mode and, only in proxy mode, the configured proxy URL so the adapter can apply the same route.

Automatic retries are limited to GET, HEAD, and OPTIONS. Other methods are not retried unless the caller supplies an idempotency key. Retryable responses are 408, 425, 429, 500, 502, 503, and 504. Retry delays are bounded by configuration. Callers must use replayable request bodies when opting a non-safe method into retries.

The engine does not select or install a proxy implementation. A future concrete proxy adapter must be separately audited and must cover both HTTP and realtime traffic. Credentials must never be included in diagnostics or error messages.

## Client transport contract

An injected client transport may implement:

- `connect({ config, sessionStore, emit })`
- `disconnect()`

The client does not report a successful connection unless the transport's `connect` method resolves.

## Configuration

- Direct networking is the default.
- Proxy mode must be explicitly selected and supplied with a proxy URL.
- Session storage defaults to memory.
- Configuration is normalized and frozen when the client is created.

## Planned module boundaries

Authentication, realtime connection, event normalization, and individual API domains will remain separate modules. Every network-capable module must receive the shared network engine rather than creating independent clients.
