# Compatibility strategy

The target is a hybrid API: a modern promise-based client internally, with a legacy adapter for supported ws3-fca-style call signatures.

Compatibility is a planned milestone, not a current feature. Before implementing an adapter, document each supported legacy method's arguments, callback behavior, return value, event shape, and error behavior. Verify it with contract tests. Unsupported methods must fail explicitly rather than silently returning fabricated data.
