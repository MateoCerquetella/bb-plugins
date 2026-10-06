import "./app.css";
import {Workbench} from "./workbench";
import {useCallback,useEffect,useRef,useState} from "react";
import {definePluginApp,experimental_Icon as Icon,useRpc,useRealtime,useRealtimeConnectionState} from "@get-bb/plugin-sdk/app";
import {snapshotSchema,type rpcContract,type Snapshot} from "./contract";

export function Canvas() {
  const rpc = useRpc<typeof rpcContract>();
  const connection = useRealtimeConnectionState();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const pending = useRef(false);
  const refreshAgain = useRef(false);
  const refresh = useCallback(async () => {
    if (pending.current) { refreshAgain.current = true; return; }
    pending.current = true;
    try {
      do {
        refreshAgain.current = false;
        setSnapshot(snapshotSchema.parse(await rpc.call("snapshot", null))); setError(false);
      } while (refreshAgain.current);
    }
    catch { setError(true); }
    finally { pending.current = false; }
  }, [rpc]);
  useRealtime("snapshot-changed", () => void refresh());
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(timer);
  }, [refresh, connection]);
  return <main className="ac-shell">
    {(error || connection !== "connected" || snapshot?.truncated) && <div className="ac-notice" role="status">
      {error ? "Refresh failed. Showing the last available snapshot." : connection !== "connected" ? "Reconnecting. Status may be delayed." : "Showing the latest 80 threads."}
    </div>}
    {snapshot ? <Workbench snapshot={snapshot} refresh={()=>void refresh()} />
      : <div className="ac-empty"><Icon name="Workflow" /><h2>{snapshot ? "No active workspaces" : error ? "Workspaces unavailable" : "Loading workspaces..."}</h2></div>}
  </main>;
}

export default definePluginApp((app) => {
  app.slots.navPanel({ id: "canvas", title: "Agent Canvas", icon: "Workflow", path: "canvas", component: Canvas });
});
