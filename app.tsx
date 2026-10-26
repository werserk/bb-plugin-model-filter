import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import {
  definePluginApp,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  useSettings,
} from "@get-bb/plugin-sdk/app";
import { rpcContract, PREFERENCES_CHANGED } from "./contract";
import { INITIAL_SNAPSHOT } from "./preferences";
import { attachQueryBridge, findQueryClient } from "./query-bridge";
import {
  receivePreferences,
  reportRuntime,
  reportSyncError,
  usePreferencesView,
} from "./preferences-client";
import { ModelFilterSettings } from "./ModelFilterSettings";
import "./app.css";

function RuntimeBootstrap() {
  const anchor = useRef<HTMLDivElement>(null);
  const bridge = useRef<ReturnType<typeof attachQueryBridge> | null>(null);
  const rpc = useRpc<typeof rpcContract>();
  const { values } = useSettings();
  const enabled = values?.enabled !== false;
  const connection = useRealtimeConnectionState();
  const view = usePreferencesView();
  const refresh = useCallback(() => {
    rpc.call("getPreferences", null).then(receivePreferences, reportSyncError);
  }, [rpc]);
  useRealtime(PREFERENCES_CHANGED, refresh);
  useEffect(() => {
    if (connection === "connected") refresh();
  }, [connection, refresh]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useLayoutEffect(() => {
    if (!enabled) {
      reportRuntime({
        state: "disabled",
        message: "Filtering is off. Native model lists are restored.",
      });
      return;
    }
    try {
      const client = anchor.current ? findQueryClient(anchor.current) : null;
      if (!client) {
        reportRuntime({
          state: "unsupported",
          message:
            "This BB client is not compatible with Model Filter. Native model lists are unchanged.",
        });
        return;
      }
      bridge.current = attachQueryBridge(
        client,
        view.snapshot ?? INITIAL_SNAPSHOT,
      );
      reportRuntime({
        state: "active",
        message: "Filtering is active in this BB window.",
      });
    } catch (error) {
      reportRuntime({
        state: "unsupported",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return () => {
      bridge.current?.dispose();
      bridge.current = null;
    };
  }, [enabled]);
  useLayoutEffect(() => {
    if (view.snapshot) bridge.current?.update(view.snapshot);
  }, [view.snapshot]);
  return <div ref={anchor} hidden data-model-filter-runtime="true" />;
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({
    id: "runtime",
    component: RuntimeBootstrap,
  });
  app.slots.settingsSection({
    id: "models",
    title: "Visible models",
    component: ModelFilterSettings,
  });
});
