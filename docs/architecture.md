# Architecture

## Current boundary

This milestone provides contracts and scaffolding only. It does not implement Messenger authentication, HTTP endpoints, MQTT framing, or Messenger operations.

## Layers

- **Public entry point:** stable CommonJS exports.
- **Core:** configuration, client lifecycle, and structured errors.
- **Storage:** asynchronous session-store interface; memory implementation is the default.
- **Network (planned):** one transport abstraction shared by HTTP and realtime connections.
- **Authentication (planned):** cookie parsing, session validation, and controlled login lifecycle.
- **Protocol and API (planned):** Messenger-specific operations and event normalization.
- **Compatibility (planned):** callback and legacy method adapters backed by the same modern implementation.

## Transport contract

An injected transport may implement:

- `connect({ config, sessionStore, emit })`
- `disconnect()`

The client does not report a successful connection unless the transport's `connect` method resolves.

## Configuration

- Direct networking is the default.
- Proxy mode must be explicitly selected and supplied with a proxy URL.
- Session storage defaults to memory.
- Configuration is normalized and frozen when the client is created.

## Planned module boundaries

Authentication, transport, realtime connection, event normalization, and individual API domains will remain separate modules. Each network-capable module must receive the shared transport rather than creating independent clients.
