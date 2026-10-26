export interface Rule {
  mode: "all" | "selected";
  modelIds: string[];
}
export interface Snapshot {
  revision: number;
  providers: Record<string, Rule>;
}

export const MAX_ID_LENGTH = 512;
export const MAX_MODELS = 1024;
export const MAX_PROVIDERS = 128;
export const MAX_SNAPSHOT_BYTES = 512 * 1024;
export const INITIAL_SNAPSHOT: Snapshot = { revision: 0, providers: {} };

export function getProviderRule(
  snapshot: Snapshot | null | undefined,
  providerId: string,
): Rule | undefined {
  return snapshot && Object.hasOwn(snapshot.providers, providerId)
    ? snapshot.providers[providerId]
    : undefined;
}

export function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeRule(input: unknown): Rule {
  if (
    !object(input) ||
    Object.keys(input).some((key) => key !== "mode" && key !== "modelIds") ||
    !["all", "selected"].includes(input.mode as string) ||
    !Array.isArray(input.modelIds) ||
    input.modelIds.length > MAX_MODELS ||
    !input.modelIds.every(validId)
  )
    throw new Error("Invalid model rule");
  const modelIds = [...new Set(input.modelIds as string[])];
  if (input.mode === "selected" && modelIds.length === 0)
    throw new Error("Select at least one model");
  return { mode: input.mode as Rule["mode"], modelIds };
}

export function parseSnapshot(input: unknown): Snapshot {
  if (
    !object(input) ||
    Object.keys(input).some(
      (key) => key !== "revision" && key !== "providers",
    ) ||
    !Number.isSafeInteger(input.revision) ||
    (input.revision as number) < 0 ||
    !object(input.providers) ||
    Object.keys(input.providers).length > MAX_PROVIDERS
  )
    throw new Error("Invalid stored preferences");
  const providers: Record<string, Rule> = {};
  for (const [id, rule] of Object.entries(input.providers)) {
    if (!validId(id)) throw new Error("Invalid provider ID");
    Object.defineProperty(providers, id, {
      value: normalizeRule(rule),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  const snapshot = { revision: input.revision as number, providers };
  if (
    new TextEncoder().encode(JSON.stringify(snapshot)).byteLength >
    MAX_SNAPSHOT_BYTES
  )
    throw new Error("Preferences exceed the size limit");
  return snapshot;
}

export interface CatalogModel {
  model: string;
  displayName?: string;
}
export interface Catalog {
  models: CatalogModel[];
  selectedOnlyModels?: CatalogModel[];
}

/** Keep native current-model lookup intact while reducing visible candidates.
 * Enumerable array methods make TanStack's structural sharing retain this
 * local facade rather than copying its indexed values into a plain array.
 */
export function projectCatalog<T extends Catalog>(data: T, rule?: Rule): T {
  if (!rule || rule.mode === "all") return data;
  const allowed = new Set(rule.modelIds);
  const unique = <M extends CatalogModel>(models: M[]): M[] => {
    const seen = new Set<string>();
    return models.filter(
      (item) => !seen.has(item.model) && Boolean(seen.add(item.model)),
    );
  };
  const originalMore = unique(data.selectedOnlyModels ?? []);
  const models = data.models.filter((item) => allowed.has(item.model));
  const hidden = data.models.filter((item) => !allowed.has(item.model));
  const selectedOnlyModels = unique([...originalMore, ...hidden]);
  const visibleMore = originalMore.filter((item) => allowed.has(item.model));
  Object.defineProperties(selectedOnlyModels, {
    filter: {
      enumerable: true,
      configurable: true,
      value: function (
        predicate: (
          value: CatalogModel,
          index: number,
          array: CatalogModel[],
        ) => unknown,
        thisArg?: unknown,
      ) {
        return visibleMore.filter(predicate, thisArg);
      },
    },
    find: {
      enumerable: true,
      configurable: true,
      value: function (
        predicate: (
          value: CatalogModel,
          index: number,
          array: CatalogModel[],
        ) => unknown,
        thisArg?: unknown,
      ) {
        const found = Array.prototype.find.call(
          selectedOnlyModels,
          predicate,
          thisArg,
        ) as CatalogModel | undefined;
        if (!found || allowed.has(found.model)) return found;
        return {
          ...found,
          displayName: `${found.displayName ?? found.model} (Current)`,
        };
      },
    },
  });
  return { ...data, models, selectedOnlyModels };
}
