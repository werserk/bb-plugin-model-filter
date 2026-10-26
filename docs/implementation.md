# Implementation record

The owner authorized design and implementation on 2026-10-26. Accepted choices remain all standard pickers, one preference per BB server, explicit selected IDs for configured providers, and a local current-model exception.

The original assumption that a BB-source extension was required was reopened at the owner's request. Source investigation found a shared runtime seam. A live reversible experiment then proved observer projection without changing the raw catalog. Independent source/plan review by model_filter_runtime_probe accepted this integration on installed BB0.47.1 before full settings/runtime implementation. The prior plan's public-hook recommendation is historical.

## Delivered locally

- Provider-neutral projection with native current metadata and untouched raw caches.
- Bounded versioned SQLite preferences, atomic revision checks, typed RPC, realtime and CLI.
- Full routed-catalog settings, bulk selection, draft/conflict recovery and native preview.
- App overlay lifecycle, reconnect refresh, selector/placeholder rotation and owned cleanup.
- Domain, backend, settings and real TanStack observer tests; live application evidence in compatibility.md.
- SDK scan, formatter, CI definition, English documentation, branding and cropped screenshots.

Local package: bb-plugin-model-filter, version0.1.0, primary branch main. Installed as model-filter. Public publication remains outside authorization. Temporary verification selections are reset before handoff so the owner chooses his own favorites.

Independent final review and final verification reports are recorded in verification/. Final review passed for tree9943f416b80631523907f9597888a8c2d8a989d5 with no open findings;45 tests, typecheck, SDK scan, format check and build passed. The two review receipts and final installed-UI capture are evidence-only additions after that reviewed subject. The original local acceptance did not exercise remote CI or physical clients. Current repository CI is reported on GitHub; physical-client coverage remains unverified.

## Review correction

Independent review of tree d7cd216e5effdda6d4b55594fa16c4d4fe11ba05 found F01: a pending catalog-source lookup could replace the provider while retaining the previous provider's dirty draft. The corrected editor binds the draft to its provider ID, blocks Apply while ownership differs, and scopes asynchronous mutation replies to the active provider. A failing race reproduction was added before the fix; it passes after the fix, together with ordinary editing on the new routed provider and All mode during catalog failure. The review report retains the original blocked subject and the final disposition separately.

## Private repository preparation

The owner requested a repository for review after accepting the local plugin. The repository target is werserk/bb-plugin-model-filter, private, with main as its primary branch. Repository metadata and install instructions were added; the implementation remains the previously reviewed code. No public release, npm publication, release tag or marketplace submission is included. Git history is scanned for secrets before push. GitHub Actions is the remote verification surface.
