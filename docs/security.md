# Security notes

- Treat appState, cookies, tokens, proxy credentials, and session values as secrets.
- Never print session contents in logs, exceptions, test snapshots, or CI output.
- Keep credentials out of source control and issue reports.
- Session storage is memory-only by default. The client does not expose its raw session-store object or cookies through the public session getter.
- AppState cookies are sent to the configured login URL only after validating HTTPS and a Facebook-owned hostname.
- Automatic session-cookie forwarding is restricted to HTTPS Facebook hosts. Configured GraphQL endpoints must also be HTTPS Facebook hosts.
- MQTT session cookies are sent only to WSS Facebook hosts. Do not point the listener at an untrusted WebSocket endpoint.
- Explicit caller-supplied Cookie headers remain the caller's responsibility; do not attach session cookies to third-party hosts.
- Proxy configuration is opt-in and must not silently change between direct and proxied modes.
- Use accounts and sessions only with authorization; respect applicable platform rules, checkpoints, and rate limits.
