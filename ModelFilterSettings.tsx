import { getProviderRule } from "./preferences";
import { useModelFilterSettings, type SettingsModel } from "./settings-state";
import { ModelCatalogEditor } from "./ModelCatalogEditor";
import { Button } from "./components/ui/button";
import { useState } from "react";
import { experimental_ProviderModelPicker as ProviderModelPicker } from "@get-bb/plugin-sdk/app";
import type { ExperimentalProviderModelPickerValue } from "@get-bb/plugin-sdk/app";
export function ModelFilterSettings() {
  const model = useModelFilterSettings();
  const {
    view,
    providers,
    hosts,
    environments,
    providerId,
    hostId,
    setHostId,
    environmentId,
    setEnvironmentId,
    loading,
    saving,
    snapshot,
    dirty,
    changeProvider,
  } = model;
  return (
    <section className="mf-settings">
      <div className="mf-intro">
        <p>Keep a short model list in BB’s original menus.</p>
        <p className="mf-muted">
          Changes apply to every device connected to this BB server. The current
          model stays available in each picker.
        </p>
      </div>
      <div
        className={`mf-status mf-status-${view.runtime.state}`}
        role="status"
      >
        <span className="mf-dot" />
        {view.runtime.message}
      </div>
      {view.error && (
        <p className="mf-error" role="alert">
          Could not sync preferences: {view.error}
        </p>
      )}
      <details className="mf-source">
        <summary>Catalog source</summary>
        <p className="mf-muted">
          Choose a machine or workspace to discover its models. Visibility rules
          apply everywhere by provider and model ID.
        </p>
        <div className="mf-source-fields">
          <label>
            Machine
            <select
              value={hostId}
              onChange={(e) => {
                setHostId(e.target.value);
                setEnvironmentId("");
              }}
              disabled={dirty || saving}
            >
              <option value="">BB server</option>
              {hosts.map((host) => (
                <option key={host.id} value={host.id}>
                  {host.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Workspace
            <select
              value={environmentId}
              onChange={(e) => setEnvironmentId(e.target.value)}
              disabled={dirty || saving}
            >
              <option value="">Default catalog</option>
              {environments
                .filter((env) => !hostId || env.hostId === hostId)
                .map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name ??
                      env.branchName ??
                      env.path?.split("/").pop() ??
                      env.id}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </details>
      <div className="mf-grid">
        <nav aria-label="Model providers" className="mf-providers">
          {providers.map((provider) => (
            <button
              type="button"
              key={provider.id}
              aria-pressed={provider.id === providerId}
              onClick={() => changeProvider(provider.id)}
              disabled={saving || (dirty && provider.id !== providerId)}
            >
              <span>{provider.displayName}</span>
              <small>
                {getProviderRule(snapshot, provider.id)?.mode === "selected"
                  ? `${getProviderRule(snapshot, provider.id)!.modelIds.length} selected`
                  : "All models"}
              </small>
            </button>
          ))}
          {providers.length === 0 && !loading && (
            <p className="mf-muted">No providers available.</p>
          )}
        </nav>
        <ModelCatalogEditor model={model} />
      </div>
      {providerId && <PickerPreview key={providerId} providerId={providerId} />}
      <SettingsFooter model={model} />
    </section>
  );
}

function PickerPreview({ providerId }: { providerId: string }) {
  const [value, setValue] = useState<ExperimentalProviderModelPickerValue>({
    providerId,
    model: "",
    reasoningLevel: "high",
  });
  return (
    <details className="mf-source mf-preview">
      <summary>Preview menu</summary>
      <p className="mf-muted">
        Try the saved selection. Changes here only affect this preview.
      </p>
      <ProviderModelPicker value={value} onChange={setValue} />
    </details>
  );
}

function SettingsFooter({ model }: { model: SettingsModel }) {
  const { confirmReset, setConfirmReset, reset, saving, snapshot } = model;
  return (
    <div className="mf-footer">
      <span className="mf-muted">
        Standard BB pickers · no provider configuration changes
      </span>
      {confirmReset ? (
        <div className="mf-reset-confirm">
          <span>Restore every provider?</span>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => reset(true)}
            disabled={saving}
          >
            Reset all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmReset(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirmReset(true)}
          disabled={!snapshot || saving}
        >
          Reset all providers
        </Button>
      )}
    </div>
  );
}
