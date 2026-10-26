import { useEffect, useMemo, useRef, useState } from "react";
import { useRpc, useSdk } from "@get-bb/plugin-sdk/app";
import type { PluginBrowserBbSdk } from "@get-bb/plugin-sdk/app";
import { rpcContract } from "./contract";
import { getProviderRule, type Rule } from "./preferences";
import {
  receivePreferences,
  reportSyncError,
  usePreferencesView,
} from "./preferences-client";

type Catalog = Awaited<
  ReturnType<PluginBrowserBbSdk["system"]["executionOptions"]>
>;
type Provider = Awaited<
  ReturnType<PluginBrowserBbSdk["providers"]["list"]>
>[number];
type Host = Awaited<ReturnType<PluginBrowserBbSdk["hosts"]["list"]>>[number];
type Environment = Awaited<
  ReturnType<PluginBrowserBbSdk["environments"]["list"]>
>[number];
const emptyRule: Rule = { mode: "all", modelIds: [] };
const describe = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);
const signature = (rule: Rule) =>
  JSON.stringify({ mode: rule.mode, modelIds: [...rule.modelIds].sort() });

function useCatalogSources({
  sdk,
  providerId,
  setProviderId,
  hostId,
  environmentId,
  setError,
  setQuery,
  setFeedback,
}: {
  sdk: PluginBrowserBbSdk;
  providerId: string;
  setProviderId: React.Dispatch<React.SetStateAction<string>>;
  hostId: string;
  environmentId: string;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  setFeedback: React.Dispatch<React.SetStateAction<string>>;
}) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const routing = environmentId ? { environmentId } : hostId ? { hostId } : {};
  useEffect(() => {
    let live = true;
    sdk.hosts.list().then(
      (rows) => {
        if (live) setHosts(rows);
      },
      () => {},
    );
    sdk.environments.list({ limit: 200 }).then(
      (rows) => {
        if (live) setEnvironments(rows);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [sdk]);
  useEffect(() => {
    let live = true;
    setError(null);
    sdk.providers.list(routing).then(
      (rows) => {
        if (!live) return;
        setProviders(rows);
        setProviderId((current) =>
          rows.some((p) => p.id === current) ? current : (rows[0]?.id ?? ""),
        );
      },
      (cause) => {
        if (live) setError(describe(cause));
      },
    );
    return () => {
      live = false;
    };
  }, [sdk, hostId, environmentId]);
  useEffect(() => {
    let live = true;
    setError(null);
    setCatalog(null);
    setLoading(true);
    setQuery("");
    setFeedback("");
    if (!providerId) {
      setLoading(false);
      return;
    }
    sdk.system.executionOptions({ ...routing, providerId }).then(
      (data) => {
        if (!live) return;
        setCatalog(data);
        setLoading(false);
        if (data.modelLoadError)
          setError(
            data.modelLoadError.detail ??
              "Could not load this provider’s models.",
          );
      },
      (cause) => {
        if (live) {
          setError(describe(cause));
          setLoading(false);
        }
      },
    );
    return () => {
      live = false;
    };
  }, [sdk, providerId, hostId, environmentId]);
  return { providers, hosts, environments, catalog, loading };
}

function useCatalogSelection(
  catalog: Catalog | null,
  draft: Rule,
  query: string,
) {
  const models = useMemo(
    () => [
      ...new Map(
        [
          ...(catalog?.models ?? []),
          ...(catalog?.selectedOnlyModels ?? []),
        ].map((model) => [model.model, model]),
      ).values(),
    ],
    [catalog],
  );
  const known = new Set(models.map((model) => model.model));
  const selected = new Set([
    ...(draft.mode === "all" ? models.map((model) => model.model) : []),
    ...draft.modelIds,
  ]);
  const visible = models.filter((model) =>
    `${model.displayName} ${model.model}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const unavailable = draft.modelIds.filter((id) => !known.has(id));
  const selectedAvailable = models.filter((model) =>
    selected.has(model.model),
  ).length;
  return { models, selected, visible, unavailable, selectedAvailable };
}

export function useModelFilterSettings() {
  const sdk = useSdk();
  const rpc = useRpc<typeof rpcContract>();
  const view = usePreferencesView();
  const [providerId, setProviderId] = useState("");
  const [hostId, setHostId] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Rule>(emptyRule);
  const [draftProviderId, setDraftProviderId] = useState("");
  const activeProvider = useRef(providerId);
  activeProvider.current = providerId;
  const [baseline, setBaseline] = useState<Rule>(emptyRule);
  const [draftRevision, setDraftRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const snapshot = view.snapshot;
  const dirty = signature(draft) !== signature(baseline);
  const routing = environmentId ? { environmentId } : hostId ? { hostId } : {};
  const { providers, hosts, environments, catalog, loading } =
    useCatalogSources({
      sdk,
      providerId,
      setProviderId,
      hostId,
      environmentId,
      setError,
      setQuery,
      setFeedback,
    });
  useEffect(() => {
    if (!snapshot || !providerId) return;
    if (draftProviderId === providerId && dirty) return;
    setDraftProviderId(providerId);
    const next = getProviderRule(snapshot, providerId) ?? emptyRule;
    setDraft(next);
    setBaseline(next);
    setDraftRevision(snapshot.revision);
  }, [snapshot, providerId, draftProviderId, dirty]);
  const derived = useCatalogSelection(catalog, draft, query);
  const changeProvider = (id: string) => {
    if (dirty) return;
    setDraft(emptyRule);
    setBaseline(emptyRule);
    setProviderId(id);
    setError(null);
  };
  const apply = async () => {
    if (!snapshot || draftProviderId !== providerId) return;
    setSaving(true);
    setError(null);
    setFeedback("");
    try {
      const next = await rpc.call("saveProvider", {
        expectedRevision: draftRevision,
        providerId,
        rule: draft,
        routing,
      });
      receivePreferences(next);
      if (activeProvider.current === providerId) {
        setBaseline(draft);
        setDraftRevision(next.revision);
        setFeedback("Saved. All connected devices will use this selection.");
      }
    } catch (cause) {
      if (activeProvider.current === providerId) setError(describe(cause));
      rpc
        .call("getPreferences", null)
        .then(receivePreferences, reportSyncError);
    } finally {
      setSaving(false);
    }
  };
  const reset = async (all: boolean) => {
    if (!snapshot) return;
    setSaving(true);
    setError(null);
    try {
      const next = await rpc.call("resetPreferences", {
        expectedRevision: snapshot.revision,
        ...(all ? {} : { providerId }),
      });
      receivePreferences(next);
      if (activeProvider.current === providerId) {
        const rule = getProviderRule(next, providerId) ?? emptyRule;
        setDraft(rule);
        setBaseline(rule);
        setDraftRevision(next.revision);
        setConfirmReset(false);
        setFeedback(
          all
            ? "All providers restored to their native model lists."
            : "Native model list restored for this provider.",
        );
      }
    } catch (cause) {
      if (activeProvider.current === providerId) setError(describe(cause));
    } finally {
      setSaving(false);
    }
  };
  const conflict = !!snapshot && snapshot.revision > draftRevision && dirty;
  return {
    view,
    providers,
    hosts,
    environments,
    providerId,
    hostId,
    setHostId,
    environmentId,
    setEnvironmentId,
    catalog,
    loading,
    error,
    setError,
    draft,
    setDraft,
    setBaseline,
    setDraftRevision,
    query,
    setQuery,
    saving,
    feedback,
    confirmReset,
    setConfirmReset,
    snapshot,
    dirty,
    editorReady: draftProviderId === providerId,
    ...derived,
    changeProvider,
    apply,
    reset,
    conflict,
  };
}
export type SettingsModel = ReturnType<typeof useModelFilterSettings>;
