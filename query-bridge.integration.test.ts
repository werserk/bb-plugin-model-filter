import { describe, expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/query-core";
import { attachQueryBridge, type QueryClientAdapter } from "./query-bridge";
const key = ["systemExecutionOptions", null, "host", "custom", null];
const raw = {
  providers: [{ id: "custom" }],
  models: [
    { model: "a", displayName: "A" },
    { model: "b", displayName: "B" },
    { model: "c", displayName: "C" },
  ],
  selectedOnlyModels: [],
};
describe("installed TanStack observer behavior", () => {
  it("filters remembered placeholders and recomputes them after a remote rule change", () => {
    const client = new QueryClient();
    const observer = new QueryObserver<typeof raw>(client, {
      queryKey: key,
      enabled: false,
      placeholderData: () => raw,
    });
    const unsubscribe = observer.subscribe(() => {});
    expect(observer.getCurrentResult().isPlaceholderData).toBe(true);
    const bridge = attachQueryBridge(client as unknown as QueryClientAdapter, {
      revision: 1,
      providers: { custom: { mode: "selected", modelIds: ["b"] } },
    });
    expect(
      observer.getCurrentResult().data!.models.map((m) => m.model),
    ).toEqual(["b"]);
    bridge.update({
      revision: 2,
      providers: { custom: { mode: "selected", modelIds: ["c"] } },
    });
    expect(
      observer.getCurrentResult().data!.models.map((m) => m.model),
    ).toEqual(["c"]);
    expect(client.getQueryData(key)).toBeUndefined();
    bridge.dispose();
    expect(observer.getCurrentResult().data!.models).toEqual(raw.models);
    unsubscribe();
    client.clear();
  });
  it("keeps raw cached availability intact while new native observers receive a projection", () => {
    const client = new QueryClient();
    client.setQueryData(key, raw);
    const bridge = attachQueryBridge(client as unknown as QueryClientAdapter, {
      revision: 1,
      providers: { custom: { mode: "selected", modelIds: ["b"] } },
    });
    const observer = new QueryObserver<typeof raw>(client, {
      queryKey: key,
      enabled: false,
    });
    const unsubscribe = observer.subscribe(() => {});
    const data = observer.getCurrentResult().data as typeof raw;
    expect(data.models.map((m) => m.model)).toEqual(["b"]);
    expect(data.selectedOnlyModels.filter(() => true)).toEqual([]);
    expect(
      [...data.selectedOnlyModels].map((m: { model: string }) => m.model),
    ).toEqual(["a", "c"]);
    expect(client.getQueryData(key)).toEqual(raw);
    bridge.dispose();
    expect(observer.getCurrentResult().data).toEqual(raw);
    unsubscribe();
    client.clear();
  });
});
