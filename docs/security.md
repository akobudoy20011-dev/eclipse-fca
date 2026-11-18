# Security notes

## Secrets and local data

- Treat appState, cookies, tokens, proxy credentials, and session values as secrets.
- Never print session contents in logs, exceptions, test snapshots, CI output, or public issue reports.
- Keep credentials out of source control. The repository ignore rules cover common local session, key, certificate, and capture files, but `.gitignore` is not a secret scanner and does not remove files already tracked.
- If a secret is committed, revoke or rotate it immediately. Removing it in a later commit does not make the exposed credential safe.
- Use GitHub's private vulnerability reporting for sensitive reports; do not post exploit details or live credentials publicly.

## GitHub repository settings (maintainer action)

These controls must be enabled in GitHub repository settings; a workflow file cannot turn them on:

1. Open **Settings → Code security and analysis**.
2. Enable secret scanning and push protection when the repository/account offers them.
3. Enable Dependabot alerts and security updates where available.
4. Under **Settings → Actions → General**, set the default workflow token permission to read-only and require approval for workflows from outside collaborators where appropriate.
5. Protect `main`: require pull requests, require the CI and security checks, dismiss stale approvals after new commits, and restrict direct pushes.
6. Review installed GitHub Apps, OAuth authorizations, deploy keys, and personal access tokens periodically. Revoke anything no longer needed and use least-privilege, short-lived credentials where supported.

## Runtime and transport

- Session storage is memory-only by default. The client does not expose its raw session-store object or cookies through the public session getter.
- AppState cookies are sent to the configured login URL only after validating HTTPS and a Facebook-owned hostname.
- Automatic session-cookie forwarding is restricted to HTTPS Facebook hosts. Configured GraphQL endpoints must also be HTTPS Facebook hosts.
- MQTT session cookies are sent only to WSS Facebook hosts. Do not point the listener at an untrusted WebSocket endpoint.
- Explicit caller-supplied Cookie headers remain the caller's responsibility; do not attach session cookies to third-party hosts.
- Proxy configuration is opt-in and must not silently change between direct and proxied modes.
- Use accounts and sessions only with authorization; respect applicable platform rules, checkpoints, and rate limits.

## Automated checks

Pull requests and main-branch changes run tests, syntax checks, npm audit, package-content inspection, secret scanning, and CodeQL analysis. The Dependency Review action is not enabled because GitHub reports that the repository's current dependency-graph/security configuration does not support it. Scheduled security workflows provide a recurring audit.

These checks reduce risk but cannot guarantee that a repository or account will never be compromised or suspended. Maintainers must also review alerts, rotate exposed credentials, keep GitHub account recovery methods secure, and respond to platform notices.
