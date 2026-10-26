---
name: model-filter
description: Inspect or change the models visible in BB's standard model pickers with the Model Filter plugin.
---

# Model Filter

Read `bb model-filter status --json` before changing saved preferences. Writes affect connected clients of the same BB server.

Use opaque provider and model IDs from the user's request or the raw BB provider catalog. Display labels are not identifiers.

- `bb model-filter select <provider> <model>... [--json]` saves the visible IDs. At least one selected model must be available now; previously saved unavailable IDs can remain.
- `bb model-filter all <provider> [--json]` shows the provider's full catalog and remembers its selected IDs.
- `bb model-filter reset <provider> [--json]` removes that provider's saved rule.
- `bb model-filter reset [--json]` removes every saved rule; use it only for an explicit request covering all providers.

After a write, read status and verify the resulting rule. A revision conflict means state changed concurrently: read the current state before deciding whether the same change still applies.

Filtering changes picker candidates. Existing current models remain usable, and CLI/API model access is unchanged.
