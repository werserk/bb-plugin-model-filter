# Product contract

Status: the owner authorized design and implementation on 2026-10-26. Local installation and repository creation are complete. The owner requested Community submission after reviewing the repository. Release0.1.0 and public MIT distribution are prepared for the exact release approval required by the submission workflow.

## Accepted behavior

- Reduce model choices inside all standard BB model pickers, including built-in, ACP and plugin providers. Do not replace providers or the composer.
- Store one preference on the existing BB server and synchronize its connected clients. Independent BB servers remain independent.
- A configured provider uses canonical model IDs as an explicit selection. New IDs stay hidden until chosen. Unconfigured providers retain their native catalog.
- Preserve each picker's current model as a local exception, marked Current. Never switch an existing thread automatically or expose another picker's exception.

## Settings

The editor lives at Settings → Installed plugins → Model Filter. Each provider has one editable full-catalog checklist with labels and IDs, search, always-visible Select all and Deselect all, Apply, Discard and resets. Bulk actions affect the entire catalog regardless of search. Default and legacy all rules display every available model checked; the first checkbox edit or bulk action creates an explicit selected-ID draft. Select all saves the current catalog IDs, so newly discovered IDs stay hidden. A selected rule requires at least one currently available selected ID at save time. Previously saved unavailable IDs may be retained alongside an available ID.

Catalog source lets the owner discover a host- or environment-dependent catalog; visibility rules apply globally by provider/model ID. Unavailable providers and catalog failures preserve saved preferences. Resets work without a catalog. The persisted all mode remains supported for existing preferences and the CLI; settings use Reset provider to restore native choices. A local draft survives a failed or conflicting save; it cannot overwrite a newer revision silently. Preview menu uses BB's actual hosted picker with local state and saved policy.

The native picker owns empty, removed-model and unavailable-provider presentation. A later empty intersection does not expose new models or reset the selection. Recovery is through plugin settings, reset, the CLI all command or disabling the filter. An earlier planning-only suggestion for a custom empty-state action is deferred to avoid modifying native menu presentation.

## Engineering boundary

Use canonical IDs and preserve native model metadata, reasoning and service tiers. Leave raw SDK responses, query caches, provider configuration and execution APIs unchanged. Only plugin preferences are stored; no transcripts, credentials or model requests are needed.

One plugin is the shipping unit. The accepted data-interception approach is implemented by a version-scoped React/TanStack runtime adapter. No BB source/bundle changes, private source imports, fetch interception or DOM model-row hiding are used. The original planning-only ban on React introspection was an assistant assumption superseded by the owner's acceptance of a standalone runtime data adapter.

## Acceptance

The verification matrix and its limits live in compatibility.md. Invariants are tested with arbitrary IDs, duplicate labels, unavailable saved IDs, new catalog IDs, multiple observers, current metadata, conflicting saves, placeholders and cleanup. Native menus and restoration are additionally checked against installed BB.
