import { getProviderRule } from "./preferences";
import type { SettingsModel } from "./settings-state";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
const emptyRule = { mode: "all" as const, modelIds: [] as string[] };
function ModelChecklist({ model }: { model: SettingsModel }) {
  const {
    providers,
    catalog,
    loading,
    error,
    draft,
    setDraft,
    query,
    setQuery,
    saving,
    models,
    selected,
    visible,
    unavailable,
    selectedAvailable,
  } = model;
  return (
    <>
      <Input
        aria-label="Search models"
        placeholder="Search models or IDs…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading ? (
        <p className="mf-muted" role="status">
          Loading model catalog…
        </p>
      ) : (
        <div className="mf-checklist" aria-label="Available models">
          {visible.map((model) => (
            <label className="mf-model" key={model.model}>
              <input
                type="checkbox"
                checked={draft.mode === "all" || selected.has(model.model)}
                disabled={draft.mode === "all" || saving}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    modelIds: e.target.checked
                      ? [...draft.modelIds, model.model]
                      : draft.modelIds.filter((id) => id !== model.model),
                  })
                }
              />
              <span>
                <span>{model.displayName || model.model}</span>
                <code>{model.model}</code>
              </span>
            </label>
          ))}
          {visible.length === 0 && (
            <p className="mf-muted">
              {models.length
                ? "No models match your search."
                : "No models available from this catalog."}
            </p>
          )}
        </div>
      )}
      {draft.mode === "selected" && (
        <p className="mf-muted mf-hint">
          New models stay hidden until you select them. Other providers keep
          their full lists until configured.
        </p>
      )}
      {unavailable.length > 0 && (
        <details>
          <summary>Unavailable selections ({unavailable.length})</summary>
          {unavailable.map((id) => (
            <label className="mf-model" key={id}>
              <input
                type="checkbox"
                checked
                disabled={saving}
                onChange={() =>
                  setDraft({
                    ...draft,
                    modelIds: draft.modelIds.filter((model) => model !== id),
                  })
                }
              />
              <code>{id}</code>
            </label>
          ))}
        </details>
      )}
      {draft.mode === "selected" && !loading && selectedAvailable === 0 && (
        <p role="alert" className="mf-error">
          Select at least one available model, or choose All models.
        </p>
      )}
    </>
  );
}

function VisibilityControls({ model }: { model: SettingsModel }) {
  const { draft, setDraft, saving, loading, models } = model;
  return (
    <>
      <div className="mf-mode" role="group" aria-label="Model visibility">
        <Button
          size="sm"
          variant={draft.mode === "all" ? "secondary" : "ghost"}
          aria-pressed={draft.mode === "all"}
          onClick={() => setDraft({ ...draft, mode: "all" })}
          disabled={saving}
        >
          All models
        </Button>
        <Button
          size="sm"
          variant={draft.mode === "selected" ? "secondary" : "ghost"}
          aria-pressed={draft.mode === "selected"}
          onClick={() =>
            setDraft({
              mode: "selected",
              modelIds: draft.modelIds.length
                ? draft.modelIds
                : models.map((m) => m.model),
            })
          }
          disabled={saving || loading}
        >
          Selected models
        </Button>
      </div>
      {draft.mode === "selected" && (
        <div className="mf-bulk">
          <Button
            size="sm"
            variant="ghost"
            disabled={saving || loading}
            onClick={() =>
              setDraft({
                ...draft,
                modelIds: [
                  ...new Set([
                    ...draft.modelIds,
                    ...models.map((m) => m.model),
                  ]),
                ],
              })
            }
          >
            Select all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={saving || !draft.modelIds.length}
            onClick={() => setDraft({ ...draft, modelIds: [] })}
          >
            Clear selection
          </Button>
        </div>
      )}
    </>
  );
}

export function ModelCatalogEditor({ model }: { model: SettingsModel }) {
  const {
    providers,
    providerId,
    catalog,
    loading,
    error,
    setError,
    draft,
    setDraft,
    setBaseline,
    setDraftRevision,
    saving,
    feedback,
    snapshot,
    dirty,
    editorReady,
    models,
    selectedAvailable,
    apply,
    reset,
    conflict,
  } = model;
  return (
    <div className="mf-models">
      <div className="mf-models-header">
        <h3>
          {providers.find((p) => p.id === providerId)?.displayName ?? "Models"}
        </h3>
        <span className="mf-muted">
          {draft.mode === "all"
            ? `${models.length} models`
            : `${selectedAvailable} of ${models.length} selected`}
        </span>
      </div>
      <VisibilityControls model={model} />
      <ModelChecklist model={model} />
      {conflict && (
        <div className="mf-warning" role="alert">
          Preferences changed on another device. Your draft is preserved.{" "}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const next = getProviderRule(snapshot, providerId) ?? emptyRule;
              setDraft(next);
              setBaseline(next);
              setDraftRevision(snapshot!.revision);
              setError(null);
            }}
          >
            Load latest selection
          </Button>
        </div>
      )}
      {error && (
        <p className="mf-error" role="alert">
          {error}
        </p>
      )}
      {feedback && (
        <p className="mf-muted" role="status">
          {feedback}
        </p>
      )}
      <div className="mf-actions">
        <Button
          size="sm"
          onClick={apply}
          disabled={
            !editorReady ||
            !snapshot ||
            !providerId ||
            !dirty ||
            saving ||
            conflict ||
            (draft.mode === "selected" &&
              (loading || !!catalog?.modelLoadError || selectedAvailable === 0))
          }
        >
          {saving ? "Saving…" : "Apply"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => reset(false)}
          disabled={!snapshot || !providerId || saving}
        >
          Reset provider
        </Button>
        {dirty && (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const next = getProviderRule(snapshot, providerId) ?? emptyRule;
                setDraft(next);
                setBaseline(next);
                setDraftRevision(snapshot?.revision ?? 0);
                setError(null);
              }}
            >
              Discard
            </Button>
            <span className="mf-muted">
              Apply or discard to switch provider
            </span>
          </>
        )}
      </div>
    </div>
  );
}
