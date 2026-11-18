# Protocol fixture policy

The fixtures in this directory are **synthetic test vectors**, not captured Facebook traffic and not evidence of Messenger protocol compatibility.

When adding a real authorized capture:

1. Obtain it only from an account and environment you are authorized to test.
2. Preserve the original privately; never commit it.
3. Create a sanitized derivative that removes cookies, appState, access tokens, fb_dtsg, lsd, jazoest, user IDs, thread IDs, message text, attachment URLs, proxy credentials, device identifiers, and other personal data.
4. Replace identifiers with stable placeholders such as USER_A, THREAD_A, and MESSAGE_A.
5. Keep only the minimum fields needed to reproduce the parser behavior.
6. Record capture date, client surface, observed transport, redaction steps, and verification status in a separate fixture note. Never include the source capture.
7. Have a second reviewer check the sanitized fixture before committing it.

Do not mark a fixture as protocol-verified merely because it parses. Verification requires repeatable observation and an independently reviewed field mapping. Tests must not make network calls or require live session cookies.
