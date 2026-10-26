import { getProviderRule, projectCatalog, type Snapshot } from "./preferences";

export interface QueryOptions {
  queryKey?: readonly unknown[];
  select?: (data: unknown) => unknown;
  placeholderData?: unknown;
  [key: string]: unknown;
}
interface Observer {
  options: QueryOptions;
  setOptions(options: QueryOptions): void;
}
interface Query {
  queryKey: readonly unknown[];
  observers: Observer[];
}
interface Cache {
  getAll(): Query[];
  subscribe(listener: (event: unknown) => void): () => void;
}
export interface QueryClientAdapter {
  defaultQueryOptions(options: QueryOptions): QueryOptions;
  getQueryCache(): Cache;
}
interface NativeModel {
  model: string;
  displayName?: string;
}
interface NativeCatalog {
  providers: { id: string }[];
  models: NativeModel[];
  selectedOnlyModels: NativeModel[];
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function isCatalog(value: unknown): value is NativeCatalog {
  return (
    isRecord(value) &&
    Array.isArray(value.providers) &&
    value.providers.every((p) => isRecord(p) && typeof p.id === "string") &&
    Array.isArray(value.models) &&
    value.models.every((m) => isRecord(m) && typeof m.model === "string") &&
    Array.isArray(value.selectedOnlyModels) &&
    value.selectedOnlyModels.every(
      (m) => isRecord(m) && typeof m.model === "string",
    )
  );
}
function targets(key: readonly unknown[] | undefined): boolean {
  return key?.[0] === "systemExecutionOptions" && key.length === 5;
}
function observerFromEvent(event: unknown): Observer | null {
  if (
    !isRecord(event) ||
    event.type !== "observerAdded" ||
    !isRecord(event.observer)
  )
    return null;
  const observer = event.observer;
  if (typeof observer.setOptions !== "function" || !isRecord(observer.options))
    return null;
  return observer as unknown as Observer;
}

export function attachQueryBridge(
  client: QueryClientAdapter,
  initial: Snapshot,
) {
  const original = client.defaultQueryOptions;
  let snapshot = initial;
  let active = true;
  const selectorOriginals = new WeakMap<Function, QueryOptions["select"]>();
  const placeholderOriginals = new WeakMap<Function, unknown>();
  let selectors = new Map<
    string,
    Map<QueryOptions["select"], NonNullable<QueryOptions["select"]>>
  >();
  let placeholders = new Map<unknown, Function>();

  function nativeSelect(
    select: QueryOptions["select"],
  ): QueryOptions["select"] {
    return select && selectorOriginals.has(select)
      ? selectorOriginals.get(select)
      : select;
  }
  function nativePlaceholder(value: unknown): unknown {
    return typeof value === "function" && placeholderOriginals.has(value)
      ? placeholderOriginals.get(value)
      : value;
  }
  function decorate(options: QueryOptions): QueryOptions {
    if (!active || !targets(options.queryKey)) return options;
    const key = options.queryKey!;
    const requested = typeof key[3] === "string" ? key[3] : null;
    const route = JSON.stringify(key);
    const native = nativeSelect(options.select);
    let bySelector = selectors.get(route);
    if (!bySelector) {
      bySelector = new Map();
      selectors.set(route, bySelector);
    }
    let select = bySelector.get(native);
    if (!select) {
      select = (data) => {
        let projected: unknown = data;
        if (active && isCatalog(data)) {
          const providerId =
            requested && data.providers.some((p) => p.id === requested)
              ? requested
              : data.providers[0]?.id;
          projected = projectCatalog(
            data,
            providerId ? getProviderRule(snapshot, providerId) : undefined,
          );
        }
        return native ? native(projected) : projected;
      };
      selectorOriginals.set(select, native);
      bySelector.set(native, select);
    }
    const rawPlaceholder = nativePlaceholder(options.placeholderData);
    let placeholderData = rawPlaceholder;
    if (rawPlaceholder !== undefined) {
      let wrapped = placeholders.get(rawPlaceholder);
      if (!wrapped) {
        wrapped =
          typeof rawPlaceholder === "function"
            ? (...args: unknown[]) =>
                Reflect.apply(rawPlaceholder, undefined, args)
            : () => rawPlaceholder;
        placeholders.set(rawPlaceholder, wrapped);
        placeholderOriginals.set(wrapped, rawPlaceholder);
      }
      placeholderData = wrapped;
    }
    if (
      options.select === select &&
      options.placeholderData === placeholderData
    )
      return options;
    return { ...options, select, placeholderData };
  }

  const wrapper = function (this: QueryClientAdapter, options: QueryOptions) {
    return decorate(original.call(this, options));
  };
  client.defaultQueryOptions = wrapper;
  if (client.defaultQueryOptions !== wrapper)
    throw new Error("BB's query client does not allow the required adapter.");

  function refresh() {
    for (const query of client.getQueryCache().getAll()) {
      if (!targets(query.queryKey)) continue;
      for (const observer of [...query.observers])
        observer.setOptions(observer.options);
    }
  }
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    const observer = observerFromEvent(event);
    if (observer && targets(observer.options.queryKey))
      observer.setOptions(observer.options);
  });
  try {
    refresh();
  } catch (error) {
    active = false;
    unsubscribe();
    if (client.defaultQueryOptions === wrapper)
      client.defaultQueryOptions = original;
    throw error;
  }
  return {
    update(next: Snapshot) {
      if (!active) return;
      snapshot = next;
      selectors = new Map();
      placeholders = new Map();
      refresh();
    },
    dispose() {
      if (!active) return;
      active = false;
      unsubscribe();
      if (client.defaultQueryOptions === wrapper)
        client.defaultQueryOptions = original;
      for (const query of client.getQueryCache().getAll()) {
        if (!targets(query.queryKey)) continue;
        for (const observer of [...query.observers]) {
          const options = observer.options;
          observer.setOptions({
            ...options,
            select: nativeSelect(options.select),
            placeholderData: nativePlaceholder(options.placeholderData),
          });
        }
      }
      selectors.clear();
      placeholders.clear();
    },
  };
}

export function findQueryClient(
  element: HTMLElement,
): QueryClientAdapter | null {
  const key = Object.getOwnPropertyNames(element).find((name) =>
    name.startsWith("__reactFiber$"),
  );
  if (!key) return null;
  let fiber: unknown = Reflect.get(element, key);
  const seen = new Set<unknown>();
  for (
    let depth = 0;
    depth < 256 && isRecord(fiber) && !seen.has(fiber);
    depth++
  ) {
    seen.add(fiber);
    const props = fiber.memoizedProps;
    const candidate = isRecord(props) ? props.value : null;
    if (
      isRecord(candidate) &&
      typeof candidate.defaultQueryOptions === "function" &&
      typeof candidate.getQueryCache === "function"
    ) {
      const cache: unknown = Reflect.apply(
        candidate.getQueryCache,
        candidate,
        [],
      );
      if (
        isRecord(cache) &&
        typeof cache.getAll === "function" &&
        typeof cache.subscribe === "function"
      ) {
        return candidate as unknown as QueryClientAdapter;
      }
    }
    fiber = fiber.return;
  }
  return null;
}
