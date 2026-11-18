# Security notes

- Treat appState, cookies, tokens, and session values as secrets.
- Never print session contents in logs, exceptions, test snapshots, or CI output.
- Keep credentials out of source control and issue reports.
- Use memory-only session storage by default.
- Use accounts and sessions only with authorization; respect applicable platform rules and rate limits.
- Proxy configuration is opt-in and must not silently change between direct and proxied modes.
