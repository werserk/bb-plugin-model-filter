import { getProviderRule } from "./preferences";
import {
  experimental_PluginRpcRefusal,
  type BbPluginApi,
} from "@get-bb/plugin-sdk";
import {
  PREFERENCES_CHANGED,
  rpcContract,
  routingSchema,
  idSchema,
  type Routing,
} from "./contract";
import { normalizeRule, type Rule, type Snapshot } from "./preferences";
import {
  PreferencesStore,
  PREFERENCE_MIGRATIONS,
  RevisionConflictError,
} from "./preferences-store";

export { rpcContract } from "./contract";

export default function plugin(bb: BbPluginApi) {
  bb.settings.define({
    enabled: {
      type: "boolean",
      label: "Enable model filtering",
      default: true,
    },
  });
  const db = bb.storage.database();
  bb.storage.migrate(db, PREFERENCE_MIGRATIONS);
  const store = new PreferencesStore(db);
  const refuse = (code: "invalid" | "conflict", message: string): never => {
    throw new experimental_PluginRpcRefusal({ code, message });
  };
  function checkRevision(expected: number): Snapshot {
    try {
      return store.checkRevision(expected);
    } catch (error) {
      if (error instanceof RevisionConflictError)
        return refuse("conflict", error.message);
      throw error;
    }
  }
  function commit(
    expected: number,
    providers: Snapshot["providers"],
  ): Snapshot {
    let result: Snapshot;
    try {
      result = store.update(expected, providers);
    } catch (error) {
      if (error instanceof RevisionConflictError)
        return refuse("conflict", error.message);
      throw error;
    }
    bb.realtime.publish(PREFERENCES_CHANGED, { revision: result.revision });
    return result;
  }

  async function saveProvider(input: {
    expectedRevision: number;
    providerId: string;
    rule: Rule;
    routing?: Routing;
  }): Promise<Snapshot> {
    const previous = checkRevision(input.expectedRevision);
    const rule = normalizeRule(input.rule);
    if (rule.mode === "selected") {
      // This server call reads the raw catalog; frontend observer projections
      // never become an authority for saved model identities.
      const catalog = await bb.sdk.system.executionOptions({
        providerId: input.providerId,
        ...input.routing,
      });
      if (
        !catalog.providers.some(
          (provider) => provider.id === input.providerId && provider.available,
        )
      )
        return refuse(
          "invalid",
          "Provider is unknown or unavailable in this routing context",
        );
      if (catalog.modelLoadError)
        return refuse(
          "invalid",
          "Cannot validate selection: the provider catalog failed to load",
        );
      const usable = new Set(
        [...catalog.models, ...catalog.selectedOnlyModels].map(
          (model) => model.model,
        ),
      );
      const retained = new Set(
        getProviderRule(previous, input.providerId)?.modelIds ?? [],
      );
      if (rule.modelIds.some((id) => !usable.has(id) && !retained.has(id)))
        return refuse(
          "invalid",
          "Selection contains an unknown model ID outside the current catalog",
        );
      if (!rule.modelIds.some((id) => usable.has(id)))
        return refuse(
          "invalid",
          "Select at least one currently available model",
        );
    }
    return commit(input.expectedRevision, {
      ...previous.providers,
      [input.providerId]: rule,
    });
  }

  function resetPreferences(input: {
    expectedRevision: number;
    providerId?: string;
  }): Snapshot {
    const previous = checkRevision(input.expectedRevision);
    const providers = { ...previous.providers };
    if (input.providerId === undefined)
      return commit(input.expectedRevision, {});
    delete providers[input.providerId];
    return commit(input.expectedRevision, providers);
  }
  bb.rpc.register(rpcContract, {
    getPreferences: () => store.read(),
    saveProvider,
    resetPreferences,
  });

  const usage =
    "Usage: bb model-filter status [--json] | select <provider> <model>... [--json] | all <provider> [--json] | reset [provider] [--json]";
  function format(snapshot: Snapshot): string {
    const lines = [`Revision ${snapshot.revision}`];
    for (const [provider, rule] of Object.entries(snapshot.providers))
      lines.push(
        `${provider}: ${rule.mode === "all" ? "All models" : `${rule.modelIds.length} selected models`}`,
      );
    if (lines.length === 1)
      lines.push("All providers use their full catalogs.");
    return lines.join("\n");
  }
  bb.cli.register({
    name: "model-filter",
    summary: "Manage model visibility in BB's standard model pickers",
    commands: [
      {
        name: "status",
        summary: "Show the saved preferences",
        usage: "bb model-filter status [--json]",
      },
      {
        name: "select",
        summary: "Choose visible model IDs for a provider",
        usage: "bb model-filter select <provider> <model>... [--json]",
      },
      {
        name: "all",
        summary: "Show every model for a provider",
        usage: "bb model-filter all <provider> [--json]",
      },
      {
        name: "reset",
        summary: "Reset one provider or all preferences",
        usage: "bb model-filter reset [provider] [--json]",
      },
    ],
    async run(argv, context) {
      const json = argv.includes("--json");
      const [command, ...args] = argv.filter((arg) => arg !== "--json");
      if (command === undefined || command === "help" || command === "--help")
        return { exitCode: 0, stdout: usage };
      try {
        const previous = store.read();
        let snapshot: Snapshot;
        if (command === "status" && args.length === 0) snapshot = previous;
        else if (command === "select" && args.length >= 2)
          snapshot = await saveProvider({
            expectedRevision: previous.revision,
            providerId: idSchema.parse(args[0]),
            rule: normalizeRule({ mode: "selected", modelIds: args.slice(1) }),
            routing: context.projectId
              ? routingSchema.parse({ projectId: context.projectId })
              : undefined,
          });
        else if (command === "all" && args.length === 1)
          snapshot = await saveProvider({
            expectedRevision: previous.revision,
            providerId: idSchema.parse(args[0]),
            rule: {
              mode: "all",
              modelIds: getProviderRule(previous, args[0])?.modelIds ?? [],
            },
          });
        else if (command === "reset" && args.length <= 1)
          snapshot = resetPreferences({
            expectedRevision: previous.revision,
            providerId:
              args[0] === undefined ? undefined : idSchema.parse(args[0]),
          });
        else return { exitCode: 1, stderr: usage };
        return {
          exitCode: 0,
          stdout: json ? JSON.stringify(snapshot) : format(snapshot),
        };
      } catch (error) {
        return {
          exitCode: 1,
          stderr:
            error instanceof Error
              ? error.message.slice(0, 2048)
              : "Cannot update model preferences",
        };
      }
    },
  });
}
