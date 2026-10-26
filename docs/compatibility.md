# Compatibility and evidence

## Verified target

BB 0.47.1, Plugin SDK 0.6.79, installed Chromium browser client, and TanStack Query v5 observer behavior. Manifest support is bounded to BB0.47.x; later releases require rechecking this adapter. The local tests import @tanstack/query-core5.105.0 directly as a development-only dependency.

The private boundary is isolated in query-bridge.ts: a bounded React ancestor walk from the plugin-owned mount and a wrapper around the shared QueryClient.defaultQueryOptions. Target query keys are [systemExecutionOptions, environmentId, hostId, providerId, projectId]. Settings/storage/RPC/realtime/catalog reads and the preview picker use public SDK surfaces. No BB files or private imports are required.

## Checked on the installed application

Live checks used a local headless Browser Automation session on 2026-10-26. No model inference or automation was submitted.

| Surface                 | Observed result                                                                                                                                | Evidence                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Settings save           | Full Codex catalog7; select Astra and Sol, Apply succeeds; canonical IDs persist in CLI readback.                                              | media/settings.jpg; native-picker.json |
| Existing thread         | Allowed Astra/Sol plus hidden6.1-Sol marked Current; reasoning and Fast mode remain native.                                                    | media/menu.jpg; browser snapshots      |
| New-thread draft        | Same filtered options; BB's remembered draft model is also preserved as its local current.                                                     | verification/native-picker.json        |
| Hosted SDK picker       | Preview shows only Astra/Sol;6.1-Sol from another picker does not leak into it.                                                                | verification/hosted-picker.json        |
| Built-in Claude Code    | 16 complete settings entries, Opus5.5 selected; native preview preserves only its local Sonnet5.5 Current exception.                           | verification/claude-live.json          |
| ACP provider / handoff  | opencode raw catalog463 reduced to exactly Claude Fable5 and5.1 in the original handoff menu.                                                  | verification/re-enabled.json           |
| Two clients, open menu  | Saving Astra removal in settings immediately removes it from another page's already-open picker, retaining Sol/current; adding it restores it. | Live browser snapshots; realtime tests |
| Native keyboard cycling | Alt+M cycles Astra→Sol→Astra→Sol. The former6.1-Sol exception disappears after choosing another model.                                         | verification/keyboard-live.json        |
| Raw cache               | Codex raw count remains7 while its observer data has2 visible models and0 hidden More candidates. Raw opencode count remains463.               | verification/native-picker.json        |
| Filter setting off/on   | An already-open opencode menu restores the full list/search; re-enable returns2 choices and no search.                                         | verification/re-enabled.json           |
| Whole plugin unload     | Runtime mount disappears; open opencode dialog returns477 total buttons including native controls/search.                                      | verification/unloaded.json             |
| Reload / enable         | Saved rules survive backend/plugin reload and re-enable; settings and native menus reconnect.                                                  | CLI readback; browser snapshots        |

The raw JSON captures are under verification/. Images are cropped application screenshots, with no synthetic rows or labels.

## Automated contracts

Domain and real SQLite tests cover canonical arbitrary IDs, equal labels, new IDs, unavailable/retained IDs, duplicate metadata, bounds, corrupt/future stored versions, persistence, revision conflicts, asynchronous save races, raw catalog validation, CLI and realtime events. UI tests cover full-catalog editing, bulk clearing, empty-save prevention, conflict recovery failed-save draft preservation, and a routed provider change during asynchronous discovery. Bridge tests use both a minimal host and real TanStack QueryClient/QueryObserver, covering selected placeholders, existing/new observers, selector composition, untouched raw caches and wrapper restoration.

## Limits and failure posture

This is a version-scoped runtime integration, not a documented public model-filter hook. The SDK scan checks imports, not compatibility of React fields or native resolver behavior. The declared BB range does not prove every future0.47 patch.

Desktop Electron, physical mobile clients, full BB-server restart and a network outage during an open menu were not individually exercised live. They use the same browser bundle, server database and reconnect lifecycle; coverage of those paths is inferred from the shared code and automated contracts. The README badge and GitHub Actions page report current repository CI; the original local acceptance did not exercise remote CI. There is no public release. Temporary rules were reset to an empty provider map at revision6; the draft model and empty composer were restored (verification/restored-draft.json).

If a compatible query client cannot be found, the plugin reports inactivity and preserves native options. A failed preferences fetch keeps the last snapshot in that client and reports the sync error; a new client starts with native options until preferences arrive. A catalog that loses all selected IDs keeps its allowlist and BB's own empty/unavailable presentation; recovery is through settings or disable. Filtering is presentation preference, not access control.
