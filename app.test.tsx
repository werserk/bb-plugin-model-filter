// @vitest-environment jsdom
import React, { type ComponentType } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import type { Snapshot } from "./preferences";
import {
  receivePreferences,
  reportRuntime,
  usePreferencesView,
} from "./preferences-client";

type Bridge = {
  update: Mock<(snapshot: Snapshot) => void>;
  dispose: Mock<() => void>;
};
type Registration = { component: ComponentType };
const state = vi.hoisted(() => ({
  connection: "connecting",
  enabled: true,
  overlay: null as ComponentType | null,
  snapshot: { revision: 0, providers: {} } as Snapshot,
  rpc: { call: vi.fn<(...args: unknown[]) => Promise<Snapshot>>() },
  listeners: new Map<string, Set<() => void>>(),
  client: {},
  bridges: [] as Bridge[],
  attach: vi.fn(),
  find: vi.fn(),
}));

vi.mock("@get-bb/plugin-sdk/app", () => ({
  definePluginApp: (
    setup: (app: {
      slots: {
        experimental_appOverlay: (registration: Registration) => void;
        settingsSection: () => void;
      };
    }) => void,
  ) => {
    setup({
      slots: {
        experimental_appOverlay: ({ component }) => {
          state.overlay = component;
        },
        settingsSection: () => {},
      },
    });
    return {};
  },
  useRpc: () => state.rpc,
  useSettings: () => ({ values: { enabled: state.enabled } }),
  useRealtimeConnectionState: () => state.connection,
  useRealtime: (channel: string, handler: () => void) => {
    React.useEffect(() => {
      const listeners = state.listeners.get(channel) ?? new Set<() => void>();
      state.listeners.set(channel, listeners);
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    }, [channel, handler]);
  },
}));
vi.mock("./query-bridge", () => ({
  findQueryClient: () => state.find(),
  attachQueryBridge: (...args: unknown[]) => state.attach(...args),
}));
vi.mock("./ModelFilterSettings", () => ({ ModelFilterSettings: () => null }));
import "./app";

function Surface() {
  const Overlay = state.overlay!;
  const view = usePreferencesView();
  return (
    <>
      <Overlay />
      <output data-testid="snapshot">{JSON.stringify(view.snapshot)}</output>
      <output data-testid="runtime">{view.runtime.state}</output>
    </>
  );
}
function snapshot(revision: number, model = "selected-model"): Snapshot {
  return {
    revision,
    providers: { custom: { mode: "selected", modelIds: [model] } },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const readSnapshot = () =>
  JSON.parse(screen.getByTestId("snapshot").textContent!);
let baseRevision = 0;
beforeEach(() => {
  baseRevision += 100;
  state.connection = "connecting";
  state.enabled = true;
  state.find.mockReset().mockReturnValue(state.client);
  state.snapshot = snapshot(baseRevision + 1);
  state.listeners.clear();
  state.bridges.length = 0;
  state.rpc.call.mockReset().mockImplementation(async () => state.snapshot);
  state.attach.mockReset().mockImplementation(() => {
    const bridge = {
      update: vi.fn<(value: Snapshot) => void>(),
      dispose: vi.fn<() => void>(),
    };
    state.bridges.push(bridge);
    return bridge;
  });
  receivePreferences({ revision: baseRevision, providers: {} });
  reportRuntime({ state: "starting", message: "Connecting" });
});
afterEach(cleanup);

describe("frontend preference synchronization", () => {
  it("recovers a missed server update on reconnect without a realtime signal", async () => {
    const surface = render(<Surface />);
    await waitFor(() => expect(readSnapshot()).toEqual(state.snapshot));
    state.connection = "connected";
    surface.rerender(<Surface />);
    state.connection = "reconnecting";
    surface.rerender(<Surface />);
    state.snapshot = snapshot(baseRevision + 2, "changed-on-another-client");
    state.connection = "connected";
    surface.rerender(<Surface />);
    await waitFor(() => expect(readSnapshot()).toEqual(state.snapshot));
    expect(state.bridges[0].update).toHaveBeenLastCalledWith(state.snapshot);
  });

  it("keeps the newest snapshot when a slower bootstrap response arrives after a realtime refresh", async () => {
    const bootstrap = deferred<Snapshot>();
    const realtime = deferred<Snapshot>();
    state.rpc.call
      .mockReset()
      .mockReturnValueOnce(bootstrap.promise)
      .mockReturnValueOnce(realtime.promise);
    render(<Surface />);
    act(() => {
      for (const listener of state.listeners.get("preferences-changed") ?? [])
        listener();
    });
    const newest = snapshot(baseRevision + 2, "latest");
    await act(async () => {
      realtime.resolve(newest);
    });
    await waitFor(() => expect(readSnapshot()).toEqual(newest));
    const stale = snapshot(baseRevision + 1, "stale");
    await act(async () => {
      bootstrap.resolve(stale);
    });
    expect(readSnapshot()).toEqual(newest);
    expect(state.bridges[0].update).not.toHaveBeenCalledWith(stale);
  });

  it("restores native choices on disable, reattaches with the latest preferences, and disposes on unmount", async () => {
    const surface = render(<Surface />);
    await waitFor(() => expect(readSnapshot()).toEqual(state.snapshot));
    const first = state.bridges[0];
    state.enabled = false;
    surface.rerender(<Surface />);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("runtime").textContent).toBe("disabled");
    const latest = snapshot(baseRevision + 2, "saved-while-disabled");
    act(() => {
      receivePreferences(latest);
    });
    expect(state.bridges).toHaveLength(1);
    state.enabled = true;
    surface.rerender(<Surface />);
    expect(state.attach).toHaveBeenLastCalledWith(state.client, latest);
    expect(screen.getByTestId("runtime").textContent).toBe("active");
    const second = state.bridges[1];
    surface.unmount();
    expect(second.dispose).toHaveBeenCalledTimes(1);
    expect(state.listeners.get("preferences-changed")?.size).toBe(0);
  });
  it("keeps discovery failures inside the inactive status boundary", async () => {
    state.find.mockImplementation(() => {
      throw new Error("Unsupported query client");
    });
    render(<Surface />);
    await waitFor(() =>
      expect(screen.getByTestId("runtime").textContent).toBe("unsupported"),
    );
    expect(state.attach).not.toHaveBeenCalled();
  });
});
