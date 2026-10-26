import { useSyncExternalStore } from "react";
import type { Snapshot } from "./preferences";

type RuntimeStatus = {
  state: "starting" | "active" | "disabled" | "unsupported";
  message: string;
};
type View = {
  snapshot: Snapshot | null;
  error: string | null;
  runtime: RuntimeStatus;
};
let view: View = {
  snapshot: null,
  error: null,
  runtime: { state: "starting", message: "Connecting to BB…" },
};
const listeners = new Set<() => void>();
function publish(next: View) {
  view = next;
  for (const listener of listeners) listener();
}
export function receivePreferences(snapshot: Snapshot) {
  if (view.snapshot && snapshot.revision < view.snapshot.revision) return;
  if (view.snapshot?.revision === snapshot.revision && !view.error) return;
  publish({ ...view, snapshot, error: null });
}
export function reportSyncError(error: unknown) {
  publish({
    ...view,
    error: error instanceof Error ? error.message : String(error),
  });
}
export function reportRuntime(runtime: RuntimeStatus) {
  publish({ ...view, runtime });
}
export function usePreferencesView() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => view,
  );
}
