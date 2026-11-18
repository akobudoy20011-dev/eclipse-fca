# Contributing

## Workflow

1. Create a focused branch from `main`.
2. Keep changes scoped to one concern.
3. Add or update tests for observable behavior.
4. Run `npm run check` and `npm test`.
5. Open a pull request; do not push directly to `main`.

## Standards

- Node.js 20+ and CommonJS.
- Prefer built-in Node.js modules until an external dependency is justified.
- Keep all network access behind the transport abstraction.
- Never log cookies, credentials, tokens, or raw session data.
- Do not claim protocol support until verified by integration tests.
