# ECLIPSE FCA

An independently maintained Node.js Messenger client library with a modern internal architecture and a compatibility layer for existing ws3-fca-style consumers.

> **Development status:** Foundation + network engine. Messenger authentication, MQTT framing, Messenger protocol operations, and concrete production proxy/realtime adapters are not implemented yet. This package does not claim to connect to Messenger at this stage.

## Design goals

- CommonJS-first public entry point.
- Node.js 20 or newer.
- Modern client API with a planned legacy compatibility adapter.
- One centralized network engine; direct connection by default and explicitly injected proxy support.
- In-memory session storage by default, behind a replaceable storage interface.
- Explicit lifecycle, structured errors, and credential-safe diagnostics.
- Automated tests and GitHub Actions on every push and pull request.

## Requirements

- Node.js >= 20
- npm

## Development

```sh
npm test
npm run check
```

## Current capabilities

- Configuration normalization and validation.
- Client lifecycle built around an injected transport interface.
- Shared Fetch-compatible HTTP engine with per-attempt timeouts.
- Bounded retries for safe methods; non-safe methods require an idempotency key to opt into retries.
- Explicit proxy adapter seam with no silent direct fallback.
- Realtime adapter seam that receives the selected network mode.
- In-memory session store and structured errors.

## Planned milestones

1. Foundation and contracts.
2. Shared HTTP/realtime transport engine and retry policy.
3. Authentication and session validation.
4. Messenger connection and event decoding.
5. Messenger API modules.
6. Legacy API compatibility.
7. Integration and Render stability testing.

See [docs/architecture.md](docs/architecture.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Safety and account access

Use only accounts and sessions you are authorized to access. Protect cookies and session data, respect platform rules and rate limits, and never commit credentials or raw session exports.
