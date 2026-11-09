import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";

import type { BoardResult, rpcContract } from "../contract";
import type { Factory } from "./factories";
import { HEALTH_LABEL, blockedAgentCount, boardHealth, formatUptime } from "./derive";
import { ForemanBar, HealthDot } from "./shell";

type RpcClient = ReturnType<typeof useRpc<typeof rpcContract>>;

const CARD_REFRESH_MS = 10_000;

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** The configured factories, kept current by the server's change event. */
export function useFactories(): { factories: Factory[] | null; error: string | null } {
  const rpc = useRpc<typeof rpcContract>();
  const [factories, setFactories] = useState<Factory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    rpc
      .call("listFactories", null)
      .then((result) => {
        setFactories(result.factories);
        setError(null);
      })
      .catch((cause: unknown) => setError(errorText(cause)));
  }, [rpc]);
  useEffect(refresh, [refresh]);
  useRealtime("factory-bots:factories", refresh);
  return { factories, error };
}

interface Reading {
  data: BoardResult | null;
  error: boolean;
}

/** Every factory's board, read side by side, so the overview is one glance. */
function useReadings(rpc: RpcClient, factories: readonly Factory[]): Record<string, Reading> {
  const [readings, setReadings] = useState<Record<string, Reading>>({});
  const ids = factories.map((factory) => factory.id).join("\n");
  useEffect(() => {
    let live = true;
    const read = () => {
      for (const id of ids.split("\n")) {
        rpc
          .call("getBoard", { factoryId: id })
          .then((data) => ({ data, error: false }))
          .catch(() => ({ data: null, error: true }))
          .then((reading) => {
            if (live) setReadings((current) => ({ ...current, [id]: reading }));
          });
      }
    };
    read();
    const timer = window.setInterval(read, CARD_REFRESH_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [rpc, ids]);
  return readings;
}

type Draft = { id?: string; name: string; url: string; checkoutPath: string };

const EMPTY_DRAFT: Draft = { name: "", url: "http://127.0.0.1:8080", checkoutPath: "" };

function FactoryForm({
  draft,
  onCancel,
  onSaved,
}: {
  draft: Draft;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const [value, setValue] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = draft.id !== undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await rpc.call("saveFactory", {
        ...(value.id === undefined ? {} : { id: value.id }),
        name: value.name.trim(),
        url: value.url.trim(),
        checkoutPath: value.checkoutPath.trim(),
      });
      if (result.ok) onSaved();
      else setError(result.message);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="fm-card fm-form" onSubmit={(event) => void submit(event)}>
      <h2>{editing ? `Edit ${draft.name}` : "Add a factory"}</h2>
      <label>
        <span>Name</span>
        <input
          required
          maxLength={60}
          value={value.name}
          placeholder="Bandely"
          onChange={(event) => setValue({ ...value, name: event.target.value })}
        />
      </label>
      <label>
        <span>Factory URL</span>
        <input
          required
          type="url"
          value={value.url}
          placeholder="http://10.8.0.6:8080"
          onChange={(event) => setValue({ ...value, url: event.target.value })}
        />
      </label>
      <label>
        <span>Checkout path</span>
        <input
          value={value.checkoutPath}
          placeholder="Bundled checkout"
          onChange={(event) => setValue({ ...value, checkoutPath: event.target.value })}
        />
        <small>The Factory checkout whose dist/main.js serves MCP. Leave empty for the bundled one.</small>
      </label>
      {error === null ? null : <p className="fm-error" role="alert">{error}</p>}
      <div className="fm-form-actions">
        <button type="button" className="fm-button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="fm-button fm-button--primary" disabled={busy}>
          {busy ? "Checking…" : editing ? "Save" : "Add factory"}
        </button>
      </div>
    </form>
  );
}

function FactoryCard({
  factory,
  reading,
  onOpen,
  onEdit,
  onRemove,
}: {
  factory: Factory;
  reading: Reading | undefined;
  onOpen: () => void;
  onEdit: () => void;
  onRemove: (() => void) | null;
}) {
  const data = reading?.data ?? null;
  const health = boardHealth(data, reading?.error ?? false);
  const online = data?.ok === true ? data : null;
  const blocked = online === null ? 0 : blockedAgentCount(online.agents);
  return (
    <article className="fm-card fm-factory" data-health={health}>
      <button type="button" className="fm-factory-open" onClick={onOpen}>
        <span className="fm-factory-head">
          <HealthDot health={health} />
          <b>{factory.name}</b>
          <small>{HEALTH_LABEL[health]}</small>
        </span>
        <code>{factory.url}</code>
        <span className="fm-factory-stats">
          <span><b>{online?.snapshot.bots ?? "—"}</b>agents</span>
          <span><b>{online?.snapshot.tickets ?? "—"}</b>tickets</span>
          <span data-alert={blocked > 0 ? "" : undefined}><b>{online === null ? "—" : blocked}</b>need a person</span>
          <span><b>{online === null ? "—" : formatUptime(online.snapshot.startedAt, online.fetchedAt) ?? "—"}</b>uptime</span>
        </span>
      </button>
      <footer>
        <span className="fm-factory-path" title={factory.checkoutPath || "Bundled checkout"}>
          {factory.checkoutPath || "Bundled checkout"}
        </span>
        <button type="button" className="fm-link" onClick={onEdit}>Edit</button>
        {onRemove === null ? null : (
          <button type="button" className="fm-link fm-link--danger" onClick={onRemove}>Remove</button>
        )}
      </footer>
    </article>
  );
}

/** Home: every factory's health, and where factories are added and edited. */
export function FactoriesView({
  factories,
  missing,
  onOpen,
}: {
  factories: readonly Factory[];
  missing: string | null;
  onOpen: (id: string) => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const readings = useReadings(rpc, factories);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (factory: Factory) => {
    if (!window.confirm(`Remove ${factory.name}? Foreman stops reading it; the factory itself keeps running.`)) return;
    try {
      await rpc.call("removeFactory", { id: factory.id });
      setError(null);
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  return (
    <div className="fb-root fm-overview">
      <ForemanBar
        factories={factories}
        current={null}
        health={null}
        onOpenFactory={onOpen}
        onOverview={() => setDraft(null)}
      />
      <main className="fm-overview-body">
        <div className="fm-page-head">
          <div>
            <h1>Factories</h1>
            <p>Every software factory Foreman reads. Open one to run its floor.</p>
          </div>
          <button
            type="button"
            className="fm-button fm-button--primary"
            onClick={() => setDraft(EMPTY_DRAFT)}
            disabled={draft !== null}
          >
            Add factory
          </button>
        </div>
        {missing === null ? null : (
          <p className="fm-notice" role="status">
            There is no factory called <code>{missing}</code>. Pick one below.
          </p>
        )}
        {error === null ? null : <p className="fm-error" role="alert">{error}</p>}
        <div className="fm-factory-grid">
          {draft === null ? null : (
            <FactoryForm
              key={draft.id ?? "new"}
              draft={draft}
              onCancel={() => setDraft(null)}
              onSaved={() => setDraft(null)}
            />
          )}
          {factories.map((factory) => (
            <FactoryCard
              key={factory.id}
              factory={factory}
              reading={readings[factory.id]}
              onOpen={() => onOpen(factory.id)}
              onEdit={() => setDraft(factory)}
              onRemove={factories.length > 1 ? () => void remove(factory) : null}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
