import { describe, expect, it } from "vitest";
import {
  INITIAL_SNAPSHOT,
  normalizeRule,
  parseSnapshot,
  projectCatalog,
  type Rule,
} from "./preferences";

const selected = (...modelIds: string[]): Rule => ({
  mode: "selected",
  modelIds,
});
const model = (id: string, displayName = "Same label") => ({
  model: id,
  displayName,
  id: `catalog:${id}`,
  description: "Metadata",
  supportedReasoningEfforts: [{ reasoningEffort: "high" }],
});
const a = model("vendor/model-a"),
  b = model("acp:model:b"),
  c = model("alias-c"),
  extra = model("archive/model");
const raw = () => ({
  models: [a, b, c],
  selectedOnlyModels: [extra],
  providerId: "opaque-provider",
  other: { intact: true },
});

describe("preference validation", () => {
  it("starts with no configured providers", () =>
    expect(INITIAL_SNAPSHOT).toEqual({ revision: 0, providers: {} }));
  it("deduplicates opaque model IDs without changing aliases, case or whitespace", () => {
    expect(
      normalizeRule({
        mode: "selected",
        modelIds: ["x", "x", "X", " x ", "vendor/model"],
      }),
    ).toEqual(selected("x", "X", " x ", "vendor/model"));
  });
  it("remembers selected IDs in all mode and refuses empty selections or invalid IDs", () => {
    expect(normalizeRule({ mode: "all", modelIds: ["x", "x"] })).toEqual({
      mode: "all",
      modelIds: ["x"],
    });
    for (const input of [
      { mode: "selected", modelIds: [] },
      { mode: "selected", modelIds: [""] },
      { mode: "selected", modelIds: [" "] },
      { mode: "selected", modelIds: ["x".repeat(513)] },
      { mode: "selected", modelIds: ["x\n"] },
      { mode: "other", modelIds: [] },
    ]) {
      expect(() => normalizeRule(input)).toThrow();
    }
  });
  it("validates persisted snapshots rather than silently replacing malformed state", () => {
    expect(
      parseSnapshot({ revision: 2, providers: { acp: selected("x", "x") } }),
    ).toEqual({ revision: 2, providers: { acp: selected("x") } });
    for (const value of [
      null,
      {},
      { revision: -1, providers: {} },
      { revision: 0.5, providers: {} },
      { revision: 0, providers: { a: selected() } },
    ])
      expect(() => parseSnapshot(value)).toThrow();
  });
  it("refuses malformed extra fields and bounds the entire persisted snapshot", () => {
    expect(() =>
      parseSnapshot({ revision: 0, providers: {}, futureField: true }),
    ).toThrow();
    expect(() =>
      parseSnapshot({
        revision: 0,
        providers: { a: { mode: "all", modelIds: [], futureField: true } },
      }),
    ).toThrow();
    const ids = Array.from(
      { length: 1024 },
      (_, index) => `${"x".repeat(508)}${index}`,
    );
    expect(() =>
      parseSnapshot({
        revision: 0,
        providers: { a: selected(...ids), b: selected(...ids) },
      }),
    ).toThrow(/large|size|limit/i);
  });
});

describe("native catalog projection", () => {
  it("returns the identical raw catalog for all mode and unconfigured providers", () => {
    const data = raw();
    expect(projectCatalog(data)).toBe(data);
    expect(projectCatalog(data, { mode: "all", modelIds: [] })).toBe(data);
    expect(Object.hasOwn(data.selectedOnlyModels, "filter")).toBe(false);
  });
  it("filters primary candidates using opaque IDs despite equal labels and aliases", () => {
    const data = raw(),
      result = projectCatalog(data, selected(b.model));
    expect(result.models).toEqual([b]);
    expect(result.models[0]).toBe(b);
    expect(result.other).toBe(data.other);
    expect(data.models).toEqual([a, b, c]);
  });
  it("retains every original model for iteration and native current promotion", () => {
    const data = raw(),
      result = projectCatalog(data, selected(b.model));
    expect(Array.isArray(result.selectedOnlyModels)).toBe(true);
    expect([...result.selectedOnlyModels]).toEqual([extra, a, c]);
    const current = result.selectedOnlyModels.find(
      (item) => item.model === a.model,
    );
    expect(current).toEqual({ ...a, displayName: "Same label (Current)" });
    expect(current?.supportedReasoningEfforts).toBe(
      a.supportedReasoningEfforts,
    );
    expect(a.displayName).toBe("Same label");
  });
  it("hides filtered primary and archived models from native More and search", () => {
    const result = projectCatalog(raw(), selected(b.model));
    expect(result.selectedOnlyModels.filter(() => true)).toEqual([]);
    expect(
      result.selectedOnlyModels.filter((item) =>
        item.displayName.includes("Same"),
      ),
    ).toEqual([]);
  });
  it("allows explicitly selected original More items without duplicating metadata", () => {
    const result = projectCatalog(
      { ...raw(), selectedOnlyModels: [extra, a, extra] },
      selected(extra.model, b.model),
    );
    expect(result.selectedOnlyModels.filter(() => true)).toEqual([extra]);
    expect(
      result.selectedOnlyModels.find((item) => item.model === extra.model),
    ).toBe(extra);
    expect([...result.selectedOnlyModels]).toEqual([extra, a, c]);
  });
  it("preserves original selected-only metadata when hidden primary entries share an ID", () => {
    const archived = {
      ...a,
      description: "Original selected-only metadata",
      displayName: "Archived A",
    };
    const result = projectCatalog(
      { ...raw(), selectedOnlyModels: [archived] },
      selected(b.model),
    );
    expect([...result.selectedOnlyModels][0]).toBe(archived);
    expect(
      result.selectedOnlyModels.find((item) => item.model === a.model),
    ).toEqual({ ...archived, displayName: "Archived A (Current)" });
  });
  it("keeps simultaneous picker current exceptions independent", () => {
    const result = projectCatalog(raw(), selected(b.model));
    const promote = (current: string) =>
      [
        ...result.models,
        result.selectedOnlyModels.find((item) => item.model === current),
      ].filter(Boolean);
    expect(promote(a.model)).toEqual([
      b,
      { ...a, displayName: "Same label (Current)" },
    ]);
    expect(promote(c.model)).toEqual([
      b,
      { ...c, displayName: "Same label (Current)" },
    ]);
    expect(result.models).toEqual([b]);
    expect(result.selectedOnlyModels.filter(() => true)).toEqual([]);
  });
  it("supports empty catalog intersection while retaining current metadata", () => {
    const result = projectCatalog(raw(), selected("temporarily-unavailable"));
    expect(result.models).toEqual([]);
    expect(
      result.selectedOnlyModels.find((item) => item.model === b.model)?.model,
    ).toBe(b.model);
    expect(result.selectedOnlyModels.filter(() => true)).toEqual([]);
  });
  it("marks real arrays with enumerable methods so structural sharing preserves the facade", () => {
    const result = projectCatalog(raw(), selected(b.model));
    expect(
      Object.getOwnPropertyDescriptor(result.selectedOnlyModels, "filter")
        ?.enumerable,
    ).toBe(true);
    expect(
      Object.getOwnPropertyDescriptor(result.selectedOnlyModels, "find")
        ?.enumerable,
    ).toBe(true);
    expect(Object.keys(result.selectedOnlyModels).length).toBeGreaterThan(
      result.selectedOnlyModels.length,
    );
    expect(
      projectCatalog(raw(), {
        mode: "all",
        modelIds: [],
      }).selectedOnlyModels.filter(() => true),
    ).toEqual([extra]);
  });
});
