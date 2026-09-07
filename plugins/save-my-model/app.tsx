import {
  definePluginApp,
  experimental_ProviderModelPicker as ProviderModelPicker,
  useRpc,
  type ExperimentalProviderModelPickerValue,
} from "@get-bb/plugin-sdk/app";
import { useEffect, useMemo, useState } from "react";
import type { saveMyModelRpcContract } from "./server.js";
import {
  clearPreferences,
  listPreferences,
  readPreference,
  writePreference,
  type SavedSelection,
} from "./lib/preferences.js";
import type { ExecutionSelection } from "./contract.js";
import "./app.css";

interface HostRow {
  id: string;
  name: string;
  status: "connected" | "disconnected";
}

function sameSelection(
  left: ExecutionSelection,
  right: ExecutionSelection,
): boolean {
  return left.providerId === right.providerId &&
    left.model === right.model &&
    left.reasoningLevel === right.reasoningLevel;
}

function SavedRecords({ items }: { items: SavedSelection[] }) {
  return (
    <details className="save-model-records">
      <summary>Saved records <span>{items.length}</span></summary>
      {items.length === 0 ? (
        <p className="save-model-muted">No preferences saved yet.</p>
      ) : (
        <div className="save-model-record-list">
          {items.map((item) => (
            <div className="save-model-record" key={`${item.hostId}:${item.providerId}`}>
              <strong>{item.providerId}</strong>
              <span>{item.model || "Provider selected"}</span>
              <span>{item.reasoningLevel || "No reasoning saved"}</span>
              <code>{item.hostId || "Browser fallback"}</code>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

function Settings() {
  const rpc = useRpc<typeof saveMyModelRpcContract>();
  const [hosts, setHosts] = useState<HostRow[] | null>(null);
  const [hostError, setHostError] = useState<string | null>(null);
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [selection, setSelection] = useState<ExecutionSelection | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [recordsRevision, setRecordsRevision] = useState(0);
  const records = useMemo(() => listPreferences(), [recordsRevision]);
  const selectedHost = hosts?.find((host) => host.id === selectedHostId) ?? null;

  useEffect(() => {
    let active = true;
    setHosts(null);
    setHostError(null);
    void rpc.call("listHosts", null).then((result) => {
      if (!active) return;
      setHosts(result.hosts);
      setHostError(result.error);
      setSelectedHostId((current) =>
        result.hosts.some((host) => host.id === current)
          ? current
          : result.hosts[0]?.id ?? null,
      );
    }).catch(() => {
      if (!active) return;
      setHosts([]);
      setHostError("BB could not list machines.");
    });
    return () => { active = false; };
  }, [rpc, refreshKey]);

  useEffect(() => {
    if (selectedHostId === null) {
      setSelection(null);
      setSelectionError(null);
      return;
    }
    let active = true;
    const preferred = readPreference(selectedHostId);
    setSelection(preferred);
    setSelectionError(null);
    setResolving(true);
    void rpc.call("resolveSelection", { hostId: selectedHostId, preferred }).then((result) => {
      if (!active) return;
      setSelection(result.selection ?? preferred);
      setSelectionError(result.error?.message ?? null);
      if (preferred !== null && result.selection !== null && !sameSelection(preferred, result.selection)) {
        writePreference({ hostId: selectedHostId, ...result.selection });
        setRecordsRevision((value) => value + 1);
      }
    }).catch(() => {
      if (!active) return;
      setSelectionError("BB could not load this machine's model catalog.");
    }).finally(() => {
      if (active) setResolving(false);
    });
    return () => { active = false; };
  }, [rpc, selectedHostId]);

  function saveSelection(value: ExperimentalProviderModelPickerValue): void {
    if (selectedHostId === null) return;
    const next = {
      providerId: value.providerId,
      model: value.model,
      reasoningLevel: value.reasoningLevel,
    };
    writePreference({ hostId: selectedHostId, ...next });
    setSelection(next);
    setSelectionError(null);
    setRecordsRevision((revision) => revision + 1);
  }

  return (
    <section className="save-model-shell">
      <header className="save-model-header">
        <div>
          <h2>Machine model preferences</h2>
          <p>Choose the provider, model, and reasoning level to remember for each BB machine.</p>
        </div>
        <button className="save-model-button" type="button" onClick={() => setRefreshKey((key) => key + 1)}>
          Refresh
        </button>
      </header>

      {hosts === null ? <div className="save-model-state" role="status">Loading BB machines…</div> : null}
      {hostError !== null ? <div className="save-model-state save-model-state--error" role="alert">{hostError}</div> : null}
      {hosts?.length === 0 && hostError === null ? (
        <div className="save-model-state">No machines are enrolled in BB yet.</div>
      ) : null}

      {hosts !== null && hosts.length > 0 ? (
        <div className="save-model-workspace">
          <nav aria-label="BB machines" className="save-model-hosts">
            {hosts.map((host) => (
              <button
                aria-current={host.id === selectedHostId ? "true" : undefined}
                className="save-model-host"
                key={host.id}
                type="button"
                onClick={() => setSelectedHostId(host.id)}
              >
                <span className={`save-model-dot save-model-dot--${host.status}`} aria-hidden="true" />
                <span className="save-model-host-copy">
                  <strong>{host.name}</strong>
                  <small>{host.status === "connected" ? "Connected" : "Disconnected"}</small>
                </span>
              </button>
            ))}
          </nav>

          <div className="save-model-config">
            <div className="save-model-config-heading">
              <div>
                <span className={`save-model-dot save-model-dot--${selectedHost?.status ?? "disconnected"}`} aria-hidden="true" />
                <strong>{selectedHost?.name ?? "Machine"}</strong>
              </div>
              <span>{selectedHost?.status === "connected" ? "Live catalog" : "Last known preference"}</span>
            </div>
            <div className="save-model-picker-row">
              <div>
                <h3>Execution default</h3>
                <p>Saved only for this machine. BB's built-in New Thread defaults are unchanged.</p>
              </div>
              {selection !== null ? (
                <ProviderModelPicker
                  value={selection}
                  onChange={saveSelection}
                  routing={{ kind: "host", hostId: selectedHostId! }}
                  disabled={resolving || selectionError !== null}
                  align="end"
                />
              ) : resolving ? (
                <span className="save-model-muted" role="status">Loading models…</span>
              ) : null}
            </div>
            {selectionError !== null ? (
              <div className="save-model-state save-model-state--inline" role="alert">{selectionError}</div>
            ) : null}
            {selection === null && !resolving && selectionError === null ? (
              <div className="save-model-state save-model-state--inline">No provider models are available for this machine.</div>
            ) : null}
          </div>
        </div>
      ) : null}

      <footer className="save-model-footer">
        <SavedRecords items={records} />
        <button
          className="save-model-button save-model-button--danger"
          disabled={records.length === 0}
          type="button"
          onClick={() => { clearPreferences(); setRecordsRevision((value) => value + 1); setRefreshKey((key) => key + 1); }}
        >
          Clear saved preferences
        </button>
      </footer>
    </section>
  );
}

export default definePluginApp((app) => {
  app.slots.settingsSection({
    id: "save-my-model",
    title: "Save My Model",
    description: "Remember a provider, model, and reasoning level for each BB machine.",
    component: Settings,
  });
});
