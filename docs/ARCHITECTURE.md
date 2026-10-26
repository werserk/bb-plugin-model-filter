# Model Filter architecture

## Sources of truth

spec.md owns accepted behavior and scope. README.md owns setup and user instructions. This map owns boundaries and rationale; compatibility.md owns the tested runtime contract and evidence. implementation.md records implementation and review status.

## Modules

| Home                    | Responsibility                                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| preferences.ts          | Validated versioned snapshots, bounded opaque IDs, safe provider lookup, observer catalog projection and local-current metadata facade.                                                                           |
| preferences-store.ts    | Plugin SQLite migrations and atomic compare-and-swap revisions. Invalid stored data is reported without erasing it.                                                                                               |
| contract.ts             | Typed, strict RPC inputs, routing and the realtime invalidation channel.                                                                                                                                          |
| server.ts               | Raw catalog validation, preference writes, realtime publication and CLI. No model inference or execution interception.                                                                                            |
| preferences-client.ts   | One frontend snapshot per client; reject stale revisions and expose sync/runtime status.                                                                                                                          |
| app.tsx                 | Settings registration and hidden app-overlay lifecycle. Initial load and realtime reconnect re-fetch authoritative preferences; disable/unmount disposes the adapter.                                             |
| query-bridge.ts         | The only private runtime boundary. Find the host query client from the plugin's own React mount; compose targeted observer selectors and placeholders; refresh existing/future observers; restore owned wrappers. |
| settings-state.ts       | Catalog discovery/routing, effective checkbox selection for native all rules, drafts bound to provider IDs, explicit conflict recovery and settings mutations.                                                    |
| ModelFilterSettings.tsx | Provider navigation, source selection, reset confirmation and a local native picker preview.                                                                                                                      |
| ModelCatalogEditor.tsx  | One editable full-catalog checklist, search, unavailable IDs, always-visible whole-catalog bulk actions and Apply/Discard.                                                                                        |
| components/ui, lib      | Minimal local Button/Input source and their supporting primitives.                                                                                                                                                |
| scripts/check-sdk.mjs   | Scan imports/dependencies against the public SDK boundary; does not bless runtime introspection.                                                                                                                  |
| skills/model-filter     | Narrow CLI usage instructions.                                                                                                                                                                                    |
| *.test.ts(x)            | Domain, SQLite, UI and real TanStack observer contract tests.                                                                                                                                                     |

## Runtime decision

Global deletion from executionOptions responses would corrupt availability and remembered catalogs. Instead, project data after raw query caching and before native picker reconciliation. The adapter targets the exact five-part systemExecutionOptions key. It composes existing selectors and rotates both select and placeholderData identities on policy changes, since TanStack otherwise reuses a previously selected placeholder.

The selectedOnlyModels facade retains hidden metadata for the native current lookup. Its visible-candidate filter omits hidden IDs. Native code promotes only the local current into ordinary options, so multiple pickers do not share exceptions. Enumerable facade methods prevent TanStack structural sharing from flattening this distinction. The raw catalog is never rewritten.

This relies on private runtime behavior and is confined to BB 0.47.x, tested on 0.47.1 / SDK0.6.79. Unsupported discovery leaves native choices intact and reports inactive filtering. Cleanup restores only the wrapper still owned by this plugin; any later wrapper is preserved and retained projections become inert.

## Storage and synchronization

Only {revision, providers} is persisted in the plugin's server SQLite database. Saves validate a full routed catalog on the server and perform a final atomic revision check after asynchronous discovery. Post-commit realtime invalidation makes clients fetch the new snapshot; reconnect performs the same fetch. There is no new server or credential setting. All mode and resets avoid catalog dependence.

The settings editor derives checked IDs for native all rules from the full loaded catalog and remembered IDs. Every edit converts that effective selection to explicit IDs; Select all snapshots the current catalog and Deselect all clears the draft. Search changes only rendered rows. Separate visibility-mode controls are retired because they hide useful bulk actions and duplicate the same checklist. The stored all/selected contract remains the owner of CLI and legacy compatibility; Reset provider restores native behavior in Settings without a schema migration.

## Repository distribution

THIRD_PARTY_NOTICES.md retains upstream notices for vendored UI and bundled dependencies. package.json records the Git source and MIT license; README.md owns tagged Git installation. main is the primary branch. .github/workflows/ci.yml validates pushes and pull requests. Community metadata is maintained in get-bb/marketplace; release0.1.0 uses the immutable v0.1.0 tag and ^0.1.0 tracking range. Release preparation does not change the runtime or preference database.
