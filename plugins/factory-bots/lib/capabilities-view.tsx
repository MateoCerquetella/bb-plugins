import "./capabilities.css";

import { useCallback, useEffect, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";

import { type rpcContract } from "../contract";
import { DoodAvatar } from "./dood";
import {
  BOT_ORDER,
  type BotName,
  type Failure,
} from "./soul-contract";
import {
  type CapabilitiesPayload,
  type CapabilityAuditEntry,
} from "./capability-contract";

type RpcClient = ReturnType<typeof useRpc<typeof rpcContract>>;

const BOT_COPY: Record<
  BotName,
  { label: string; role: string; consequence: string }
> = {
  orchestrator: {
    label: "Orchestrator",
    role: "Chat and routing",
    consequence:
      "The Orchestrator chat and routing will be unavailable. Existing tickets keep their current state.",
  },
  sieve: {
    label: "Sieve",
    role: "Specification",
    consequence:
      "Specification tickets will stop with “capability disabled: sieve” instead of being specified.",
  },
  helm: {
    label: "Helm",
    role: "Implementation",
    consequence:
      "Implementation and integration tickets will stop with “capability disabled: helm”.",
  },
  lens: {
    label: "Lens",
    role: "Review",
    consequence:
      "The factory will not review. A canonical review recorded while the ticket is waiting can still close the gate, so the team’s review is the only review.",
  },
  warden: {
    label: "Warden",
    role: "Post-merge lifecycle",
    consequence:
      "No Warden loop, post-merge lifecycle work, or stall paging will run.",
  },
  audit: {
    label: "Audit",
    role: "Production-error intake",
    consequence:
      "Production-error intake will be unavailable. Existing tickets are unchanged.",
  },
  lookback: {
    label: "Lookback",
    role: "Weekly retrospective",
    consequence:
      "The weekly Lookback retrospective will be unavailable.",
  },
};

function failureText(failure: Failure): string {
  return failure.reason === "not-running" && failure.startCommand !== null
    ? `${failure.message}\n\nStart it with:\n${failure.startCommand}`
    : failure.message;
}

function timeLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function CapabilityRow({
  bot,
  enabled,
  pending,
  busy,
  onToggle,
}: {
  bot: BotName;
  enabled: boolean;
  pending: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const copy = BOT_COPY[bot];
  return (
    <li className={`cap-row${enabled ? "" : " cap-row--off"}${pending ? " cap-row--pending" : ""}`}>
      <span className="cap-avatar" aria-hidden="true">
        <DoodAvatar agentId={bot} />
      </span>
      <span className="cap-copy">
        <span className="cap-name-row">
          <strong>{copy.label}</strong>
          <span className={`cap-state${enabled ? " is-on" : ""}`}>
            {enabled ? "Enabled" : "Team provides"}
          </span>
        </span>
        <span className="cap-role">{copy.role}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${enabled ? "Disable" : "Enable"} ${copy.label} capability`}
        className="cap-switch"
        disabled={busy || pending}
        onClick={onToggle}
      >
        <span aria-hidden="true" />
      </button>
    </li>
  );
}

function AuditList({ entries }: { entries: readonly CapabilityAuditEntry[] }) {
  if (entries.length === 0) {
    return <p className="cap-muted">No capability changes have been recorded.</p>;
  }
  return (
    <ol className="cap-audit">
      {entries.map((entry) => (
        <li key={`${entry.at}:${entry.bot}:${entry.digest}`}>
          <span className="cap-audit-main">
            <strong>{BOT_COPY[entry.bot].label}</strong>
            <span>{entry.enabled ? "enabled" : "disabled"}</span>
          </span>
          <span className="cap-audit-meta">
            {timeLabel(entry.at)}
            <span aria-hidden="true">/</span>
            {entry.author}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function CapabilitiesView({ onBack }: { onBack: () => void }) {
  const rpc = useRpc<typeof rpcContract>();
  const [capabilities, setCapabilities] = useState<CapabilitiesPayload | null>(null);
  const [entries, setEntries] = useState<CapabilityAuditEntry[]>([]);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ bot: BotName; next: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setFailure(null);
    try {
      const [nextCapabilities, nextAudit] = await Promise.all([
        rpc.call("getCapabilities", null),
        rpc.call("getCapabilityAudit", null),
      ]);
      if (!nextCapabilities.ok) {
        setFailure(nextCapabilities);
        return;
      }
      if (!nextAudit.ok) {
        setFailure(nextAudit);
        return;
      }
      setCapabilities(nextCapabilities.capabilities);
      setEntries(nextAudit.entries);
    } catch (cause) {
      setFailure({
        ok: false,
        reason: "unavailable",
        message: cause instanceof Error ? cause.message : String(cause),
        startCommand: null,
        fetchedAt: Date.now(),
      });
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const confirm = async (): Promise<void> => {
    if (pending === null || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await rpc.call("setCapability", {
        bot: pending.bot,
        enabled: pending.next,
      });
      if (!result.ok) {
        setFailure(result);
        return;
      }
      const nextCapabilities: CapabilitiesPayload = {
        bots: BOT_ORDER.map((bot) => ({
          bot,
          enabled: result.capabilities.enabled.includes(bot),
        })),
        enabled: result.capabilities.enabled,
        disabled: result.capabilities.disabled,
      };
      setCapabilities(nextCapabilities);
      setNotice(
        `${BOT_COPY[result.bot].label} ${result.enabled ? "enabled" : "disabled"} · recorded by ${result.author}`,
      );
      setPending(null);
      // Refresh the audit without blocking the switch on a second MCP read.
      void rpc.call("getCapabilityAudit", null).then((audit) => {
        if (audit.ok) setEntries(audit.entries);
      }).catch(() => undefined);
    } catch (cause) {
      setFailure({
        ok: false,
        reason: "unavailable",
        message: cause instanceof Error ? cause.message : String(cause),
        startCommand: null,
        fetchedAt: Date.now(),
      });
    } finally {
      setBusy(false);
    }
  };

  const rows = BOT_ORDER.map((bot) => {
    const record = capabilities?.bots.find((entry) => entry.bot === bot);
    return {
      bot,
      enabled: record?.enabled ?? capabilities?.enabled.includes(bot) ?? true,
    };
  });

  return (
    <section className="cap-root" aria-labelledby="cap-title">
      <header className="cap-header">
        <div>
          <h1 id="cap-title">Capabilities</h1>
          <p>
            Turn off work the team already provides. A disabled bot never gets a
            model turn; the ticket records a named capability stop.
          </p>
        </div>
        <div className="cap-actions">
          <button type="button" className="cap-button" onClick={onBack}>
            ← Board
          </button>
          <button
            type="button"
            className="cap-button"
            onClick={() => void refresh()}
            disabled={loading || busy}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {failure === null ? null : (
        <div className="cap-failure" role="alert">
          <strong>Capability controls are unavailable</strong>
          <p>{failureText(failure)}</p>
          {failure.reason === "not-running" && failure.startCommand !== null ? (
            <pre className="cap-command">
              <code>{failure.startCommand}</code>
            </pre>
          ) : null}
          <button type="button" className="cap-button" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}

      {notice === null ? null : (
        <p className="cap-notice" role="status">
          {notice}
        </p>
      )}

      {pending === null ? null : (
        <div className="cap-confirm" role="alertdialog" aria-labelledby="cap-confirm-title">
          <div>
            <h2 id="cap-confirm-title">
              {pending.next ? "Enable" : "Disable"} {BOT_COPY[pending.bot].label}?
            </h2>
            <p>{BOT_COPY[pending.bot].consequence}</p>
            <p className="cap-muted">
              The change is recorded against the signed-in host identity.
            </p>
          </div>
          <div className="cap-confirm-actions">
            <button
              type="button"
              className="cap-button cap-button--primary"
              onClick={() => void confirm()}
              disabled={busy}
            >
              {busy
                ? "Saving…"
                : `${pending.next ? "Enable" : "Disable"} ${BOT_COPY[pending.bot].label}`}
            </button>
            <button
              type="button"
              className="cap-button"
              onClick={() => setPending(null)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="cap-summary" aria-live="polite">
        <span>
          <strong>{capabilities?.enabled.length ?? "—"}</strong> enabled
        </span>
        <span>
          <strong>{capabilities?.disabled.length ?? "—"}</strong> left to the team
        </span>
        <span className="cap-muted">Changes apply on the next drive, without a restart.</span>
      </div>

      <div className="cap-list-wrap">
        <ul className="cap-list">
          {rows.map(({ bot, enabled }) => (
            <CapabilityRow
              key={bot}
              bot={bot}
              enabled={enabled}
              pending={pending?.bot === bot}
              busy={busy}
              onToggle={() => {
                setNotice(null);
                setFailure(null);
                setPending({ bot, next: !enabled });
              }}
            />
          ))}
        </ul>
      </div>

      <section className="cap-audit-wrap" aria-labelledby="cap-audit-title">
        <div className="cap-section-head">
          <h2 id="cap-audit-title">Recent changes</h2>
          <span>{entries.length}</span>
        </div>
        <AuditList entries={entries} />
      </section>
    </section>
  );
}
