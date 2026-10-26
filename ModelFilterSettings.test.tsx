// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ModelFilterSettings } from "./ModelFilterSettings";

const state = vi.hoisted(() => ({
  view: {
    snapshot: { revision: 1, providers: {} },
    error: null,
    runtime: { state: "active", message: "Active" },
  } as any,
  call: vi.fn(),
  executionOptions: vi.fn(),
  receive: vi.fn(),
}));
const sdk = {
  hosts: { list: async () => [{ id: "host-new", name: "Other machine" }] },
  environments: { list: async () => [] },
  providers: {
    list: vi.fn(async () => [
      { id: "custom", displayName: "Custom", available: true },
    ]),
  },
  system: { executionOptions: state.executionOptions },
};
const rpc = { call: state.call };
vi.mock("@get-bb/plugin-sdk/app", () => ({
  useSdk: () => sdk,
  useRpc: () => rpc,
  experimental_ProviderModelPicker: () => (
    <button>Native picker preview</button>
  ),
}));
vi.mock("./preferences-client", () => ({
  usePreferencesView: () => state.view,
  receivePreferences: state.receive,
  reportSyncError: vi.fn(),
}));
vi.mock("./components/ui/button", () => ({
  Button: ({ variant, size, ...props }: any) => <button {...props} />,
}));
vi.mock("./components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

beforeEach(() => {
  vi.clearAllMocks();
  sdk.providers.list
    .mockReset()
    .mockResolvedValue([
      { id: "custom", displayName: "Custom", available: true },
    ]);
  state.view = {
    snapshot: { revision: 1, providers: {} },
    error: null,
    runtime: { state: "active", message: "Active" },
  };
  state.executionOptions.mockResolvedValue({
    providers: [{ id: "custom", available: true }],
    models: [
      { model: "a", displayName: "Alpha" },
      { model: "b", displayName: "Beta" },
    ],
    selectedOnlyModels: [],
  });
});
afterEach(cleanup);

describe("model settings workflow", () => {
  it("binds drafts to their provider when routed discovery switches provider asynchronously", async () => {
    state.view.snapshot = {
      revision: 1,
      providers: { custom: { mode: "selected", modelIds: ["a"] } },
    };
    let release!: (
      rows: { id: string; displayName: string; available: boolean }[],
    ) => void;
    sdk.providers.list.mockResolvedValueOnce([
      { id: "custom", displayName: "Custom", available: true },
    ]);
    sdk.providers.list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    render(<ModelFilterSettings />);
    await screen.findByRole("checkbox", { name: /Alpha/ });
    fireEvent.click(screen.getByText("Catalog source"));
    fireEvent.change(screen.getByRole("combobox", { name: "Machine" }), {
      target: { value: "host-new" },
    });
    await screen.findByRole("checkbox", { name: /Alpha/ });
    fireEvent.click(screen.getByRole("checkbox", { name: /Alpha/ }));
    release([
      { id: "other-provider", displayName: "Other provider", available: true },
    ]);
    await screen.findByRole("heading", { name: "Other provider" });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(state.call).not.toHaveBeenCalled();
    // Ordinary editing of the new provider still uses its current routed context.
    await screen.findByRole("checkbox", { name: /Beta/ });
    state.call.mockResolvedValue({
      revision: 2,
      providers: { "other-provider": { mode: "selected", modelIds: ["b"] } },
    });
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Deselect all",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Beta/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(state.call).toHaveBeenCalledWith("saveProvider", {
        expectedRevision: 1,
        providerId: "other-provider",
        rule: { mode: "selected", modelIds: ["b"] },
        routing: { hostId: "host-new" },
      }),
    );
  });
  it("restores the native list without a catalog through Reset provider", async () => {
    state.view.snapshot = {
      revision: 1,
      providers: { custom: { mode: "selected", modelIds: ["a"] } },
    };
    state.executionOptions.mockRejectedValue(new Error("Catalog unavailable"));
    state.call.mockResolvedValue({
      revision: 2,
      providers: {},
    });
    render(<ModelFilterSettings />);
    await screen.findByText("Catalog unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Reset provider" }));
    await waitFor(() =>
      expect(state.call).toHaveBeenCalledWith("resetPreferences", {
        expectedRevision: 1,
        providerId: "custom",
      }),
    );
  });

  it("edits the full raw catalog, blocks empty selection, and applies canonical IDs", async () => {
    state.call.mockResolvedValue({
      revision: 2,
      providers: { custom: { mode: "selected", modelIds: ["b"] } },
    });
    render(<ModelFilterSettings />);
    await screen.findByRole("checkbox", { name: /Alpha/ });
    expect(screen.queryByRole("button", { name: "All models" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Selected models" }),
    ).toBeNull();
    expect(
      (screen.getByRole("checkbox", { name: /Alpha/ }) as HTMLInputElement)
        .disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(
      (screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Beta/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(state.call).toHaveBeenCalledWith("saveProvider", {
        expectedRevision: 1,
        providerId: "custom",
        rule: { mode: "selected", modelIds: ["b"] },
        routing: {},
      }),
    );
    await screen.findByText(/Saved\./);
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });
  it("preserves a local draft when another client saves and requires explicit conflict recovery", async () => {
    const { rerender } = render(<ModelFilterSettings />);
    await screen.findByRole("checkbox", { name: /Alpha/ });
    fireEvent.click(screen.getByRole("checkbox", { name: /Alpha/ }));
    state.view = {
      ...state.view,
      snapshot: {
        revision: 2,
        providers: { custom: { mode: "selected", modelIds: ["a"] } },
      },
    };
    rerender(<ModelFilterSettings />);
    expect(
      (screen.getByRole("checkbox", { name: /Beta/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Load latest selection" }),
    );
    expect(
      (screen.getByRole("checkbox", { name: /Alpha/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByRole("checkbox", { name: /Beta/ }) as HTMLInputElement)
        .checked,
    ).toBe(false);
  });
  it("keeps a draft after save failure", async () => {
    state.call.mockRejectedValue(new Error("Offline"));
    render(<ModelFilterSettings />);
    await screen.findByRole("checkbox", { name: /Alpha/ });
    fireEvent.click(screen.getByRole("checkbox", { name: /Alpha/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByText("Offline");
    expect(
      (screen.getByRole("checkbox", { name: /Beta/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByRole("checkbox", { name: /Alpha/ }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
  });

  it("bulk-selects the entire large catalog even while search hides most rows", async () => {
    const models = Array.from({ length: 500 }, (_, i) => ({
      model: `model-${i}`,
      displayName: `Model ${i}`,
    }));
    state.executionOptions.mockResolvedValue({
      models,
      selectedOnlyModels: [],
    });
    state.call.mockResolvedValue({
      revision: 2,
      providers: {
        custom: { mode: "selected", modelIds: models.map((m) => m.model) },
      },
    });
    render(<ModelFilterSettings />);
    await screen.findByRole("checkbox", { name: "Model 499 model-499" });
    fireEvent.change(screen.getByRole("textbox", { name: "Search models" }), {
      target: { value: "model-499" },
    });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      false,
    );
    expect(
      (screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(state.call).toHaveBeenCalledWith("saveProvider", {
        expectedRevision: 1,
        providerId: "custom",
        rule: { mode: "selected", modelIds: models.map((m) => m.model) },
        routing: {},
      }),
    );
  });

  it("edits a legacy All rule from the full catalog while retaining unavailable IDs", async () => {
    state.view.snapshot.providers = {
      custom: { mode: "all", modelIds: ["b", "retired"] },
    };
    state.call.mockResolvedValue({
      revision: 2,
      providers: { custom: { mode: "selected", modelIds: ["a", "retired"] } },
    });
    render(<ModelFilterSettings />);
    await screen.findByRole("checkbox", { name: /Alpha/ });
    expect(
      (screen.getByRole("checkbox", { name: /Alpha/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Beta/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(state.call).toHaveBeenCalledWith("saveProvider", {
        expectedRevision: 1,
        providerId: "custom",
        rule: { mode: "selected", modelIds: ["a", "retired"] },
        routing: {},
      }),
    );
  });
});
