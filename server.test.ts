import { afterEach, describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import plugin from "./server";
import type { Snapshot } from "./preferences";

type CatalogResult = Awaited<
  ReturnType<BbPluginApi["sdk"]["system"]["executionOptions"]>
>;
const catalog = (
  ids = ["vendor/x", "acp:y"],
  more = ["old/z"],
): CatalogResult =>
  ({
    providers: [
      { id: "alpha", available: true },
      { id: "beta", available: true },
    ],
    models: ids.map((model) => ({ model })),
    selectedOnlyModels: more.map((model) => ({ model })),
    modelLoadError: null,
  }) as unknown as CatalogResult;
const activeHosts: ReturnType<typeof createFakePluginHost>[] = [];
async function setup(load = async (_args?: unknown) => catalog()) {
  const host = createFakePluginHost({
    pluginId: "model-filter",
    sdk: { system: { executionOptions: load } },
  });
  activeHosts.push(host);
  await plugin(host.bb);
  return host;
}
afterEach(async () => {
  for (const host of activeHosts.splice(0))
    await host.harness.lifecycle.dispose();
});
const selected = (...modelIds: string[]) => ({ mode: "selected", modelIds });
const save = (
  revision: number,
  providerId: string,
  rule = selected("vendor/x"),
  routing?: object,
) => ({
  expectedRevision: revision,
  providerId,
  rule,
  ...(routing ? { routing } : {}),
});

describe("server preferences", () => {
  it("starts empty, validates raw routed IDs, and broadcasts only committed revisions", async () => {
    const { harness } = await setup();
    expect(await harness.behavior.callRpc("getPreferences", null)).toEqual({
      revision: 0,
      providers: {},
    });
    const snapshot = await harness.behavior.callRpc(
      "saveProvider",
      save(0, "alpha", selected("acp:y", "acp:y"), {
        hostId: "host_1",
        projectId: "proj_1",
      }),
    );
    expect(snapshot).toEqual({
      revision: 1,
      providers: { alpha: selected("acp:y") },
    });
    expect(
      harness.inspection.sdk.callsTo("system.executionOptions")[0],
    ).toEqual([{ providerId: "alpha", hostId: "host_1", projectId: "proj_1" }]);
    expect(harness.realtimeSignals).toEqual([
      { channel: "preferences-changed", payload: { revision: 1 } },
    ]);
  });
  it("refuses invalid input and new arbitrary IDs without touching state", async () => {
    const { harness } = await setup();
    for (const input of [
      save(0, "alpha", selected()),
      save(0, "alpha", selected("invented")),
      save(0, "", selected("vendor/x")),
      save(-1, "alpha"),
      save(0, "alpha", selected("vendor/x"), {
        hostId: "h",
        environmentId: "e",
      }),
    ])
      await expect(
        harness.behavior.callRpc("saveProvider", input),
      ).rejects.toThrow();
    expect(await harness.behavior.callRpc("getPreferences", null)).toEqual({
      revision: 0,
      providers: {},
    });
    expect(harness.realtimeSignals).toEqual([]);
  });
  it("refuses unknown or unavailable providers even when a default catalog is returned", async () => {
    const { harness } = await setup();
    await expect(
      harness.behavior.callRpc("saveProvider", save(0, "missing")),
    ).rejects.toThrow(/provider/i);
    harness.inspection.sdk.stub("system.executionOptions", async () => ({
      ...catalog(),
      providers: [{ id: "alpha", available: false }],
    }));
    await expect(
      harness.behavior.callRpc("saveProvider", save(0, "alpha")),
    ).rejects.toThrow(/provider/i);
  });
  it("rejects model-load failures while allowing All and reset without a catalog", async () => {
    const { harness } = await setup(async () => ({
      ...catalog(),
      modelLoadError: {
        code: "failed",
        detail: "No catalog",
        providerId: "alpha",
      },
    }));
    await expect(
      harness.behavior.callRpc("saveProvider", save(0, "alpha")),
    ).rejects.toThrow(/catalog/i);
    expect(
      await harness.behavior.callRpc(
        "saveProvider",
        save(0, "alpha", { mode: "all", modelIds: [] }),
      ),
    ).toEqual({
      revision: 1,
      providers: { alpha: { mode: "all", modelIds: [] } },
    });
    expect(
      await harness.behavior.callRpc("resetPreferences", {
        expectedRevision: 1,
      }),
    ).toEqual({ revision: 2, providers: {} });
    expect(
      harness.inspection.sdk.callsTo("system.executionOptions"),
    ).toHaveLength(1);
  });
  it("accepts native More model IDs and retained unavailable IDs with a usable selection", async () => {
    const { harness } = await setup();
    await harness.behavior.callRpc(
      "saveProvider",
      save(0, "alpha", selected("old/z", "vendor/x")),
    );
    harness.inspection.sdk.stub("system.executionOptions", async () =>
      catalog(["vendor/x"], []),
    );
    expect(
      await harness.behavior.callRpc(
        "saveProvider",
        save(1, "alpha", selected("old/z", "vendor/x")),
      ),
    ).toEqual({
      revision: 2,
      providers: { alpha: selected("old/z", "vendor/x") },
    });
    await expect(
      harness.behavior.callRpc(
        "saveProvider",
        save(2, "alpha", selected("old/z")),
      ),
    ).rejects.toThrow(/available|usable/i);
    await expect(
      harness.behavior.callRpc(
        "saveProvider",
        save(2, "alpha", selected("vendor/x", "never-saved")),
      ),
    ).rejects.toThrow(/unknown|catalog/i);
  });
  it("makes compare-and-swap atomic across two catalog requests", async () => {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { harness } = await setup(async () => {
      await barrier;
      return catalog();
    });
    const first = harness.behavior.callRpc("saveProvider", save(0, "alpha"));
    const second = harness.behavior.callRpc("saveProvider", save(0, "beta"));
    release();
    const results = await Promise.allSettled([first, second]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejection = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejection.reason).toMatchObject({ code: "conflict" });
    expect(
      ((await harness.behavior.callRpc("getPreferences", null)) as Snapshot)
        .revision,
    ).toBe(1);
    expect(harness.realtimeSignals).toHaveLength(1);
  });
  it("preserves other providers and refuses stale resets", async () => {
    const { harness } = await setup();
    await harness.behavior.callRpc("saveProvider", save(0, "alpha"));
    await harness.behavior.callRpc(
      "saveProvider",
      save(1, "beta", selected("acp:y")),
    );
    await expect(
      harness.behavior.callRpc("resetPreferences", {
        expectedRevision: 1,
        providerId: "alpha",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(
      await harness.behavior.callRpc("resetPreferences", {
        expectedRevision: 2,
        providerId: "alpha",
      }),
    ).toEqual({ revision: 3, providers: { beta: selected("acp:y") } });
  });
  it("persists the snapshot through plugin reload on its real SQLite database", async () => {
    const { harness } = await setup();
    await harness.behavior.callRpc("saveProvider", save(0, "alpha"));
    const reloaded = await harness.lifecycle.reload(plugin);
    activeHosts.push(reloaded);
    expect(
      await reloaded.harness.behavior.callRpc("getPreferences", null),
    ).toEqual({ revision: 1, providers: { alpha: selected("vendor/x") } });
  });
  it.each([
    "not-json",
    JSON.stringify({ version: 999, snapshot: { revision: 0, providers: {} } }),
    JSON.stringify({ version: 1, snapshot: { revision: -1, providers: {} } }),
  ])(
    "refuses malformed or unknown-version state without erasing it: %s",
    async (document) => {
      const { bb, harness } = await setup();
      const db = bb.storage.database();
      db.prepare(
        "INSERT INTO model_filter_preferences (singleton, document) VALUES (1, ?)",
      ).run(document);
      await expect(
        harness.behavior.callRpc("getPreferences", null),
      ).rejects.toThrow(/stored|version/i);
      await expect(
        harness.behavior.callRpc("resetPreferences", { expectedRevision: 0 }),
      ).rejects.toThrow();
      expect(
        db
          .prepare(
            "SELECT document FROM model_filter_preferences WHERE singleton=1",
          )
          .get(),
      ).toEqual({ document });
      expect(harness.realtimeSignals).toEqual([]);
    },
  );
});

describe("CLI", () => {
  it("remembers selected IDs across All so a later selection restores unavailable choices", async () => {
    const { harness } = await setup();
    await harness.behavior.runCli(["select", "alpha", "vendor/x", "old/z"]);
    await harness.behavior.runCli(["all", "alpha"]);
    expect(await harness.behavior.callRpc("getPreferences", null)).toEqual({
      revision: 2,
      providers: { alpha: { mode: "all", modelIds: ["vendor/x", "old/z"] } },
    });
    harness.inspection.sdk.stub("system.executionOptions", async () =>
      catalog(["vendor/x"], []),
    );
    expect(
      await harness.behavior.callRpc(
        "saveProvider",
        save(2, "alpha", selected("vendor/x", "old/z")),
      ),
    ).toEqual({
      revision: 3,
      providers: { alpha: selected("vendor/x", "old/z") },
    });
  });
  it("uses the same persisted snapshots for status, select, all and reset", async () => {
    const { harness } = await setup();
    expect(
      JSON.parse((await harness.behavior.runCli(["status", "--json"])).stdout),
    ).toEqual({ revision: 0, providers: {} });
    expect(
      (
        await harness.behavior.runCli([
          "select",
          "alpha",
          "vendor/x",
          "acp:y",
          "--json",
        ])
      ).exitCode,
    ).toBe(0);
    expect(await harness.behavior.callRpc("getPreferences", null)).toEqual({
      revision: 1,
      providers: { alpha: selected("vendor/x", "acp:y") },
    });
    expect((await harness.behavior.runCli(["all", "alpha"])).exitCode).toBe(0);
    expect((await harness.behavior.runCli(["reset", "alpha"])).exitCode).toBe(
      0,
    );
    expect(
      JSON.parse((await harness.behavior.runCli(["status", "--json"])).stdout),
    ).toEqual({ revision: 3, providers: {} });
    expect(
      (await harness.behavior.runCli(["select", "alpha", "made-up"])).exitCode,
    ).toBe(1);
    expect((await harness.behavior.runCli(["reset", "a", "b"])).exitCode).toBe(
      1,
    );
  });
});
