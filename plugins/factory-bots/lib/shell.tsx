import "./foreman.css";

import { useRef, type ReactNode } from "react";

import type { BoardSnapshot } from "../contract";
import type { Factory } from "./factories";
import { formatUptime, type FactoryHealth } from "./derive";

export type ShellTab = "threads" | "bots" | "souls" | "capabilities";

const TABS: { id: ShellTab; label: string }[] = [
  { id: "threads", label: "Threads" },
  { id: "bots", label: "Bots" },
  { id: "souls", label: "Souls" },
  { id: "capabilities", label: "Capabilities" },
];

export function HealthDot({ health }: { health: FactoryHealth }) {
  return <span className="fm-dot" data-health={health} aria-hidden="true" />;
}

function ForemanMark() {
  return (
    <span className="fm-mark">
      <span className="fm-mark-glyph" aria-hidden="true" />
      Foreman
    </span>
  );
}

/** The factory picker: every factory, plus the way back to the overview. */
function FactorySwitch({
  factories,
  current,
  health,
  onOpen,
  onOverview,
}: {
  factories: readonly Factory[];
  current: Factory | null;
  health: FactoryHealth | null;
  onOpen: (id: string) => void;
  onOverview: () => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const pick = (action: () => void) => () => {
    if (menu.current !== null) menu.current.open = false;
    action();
  };
  return (
    <details className="fm-switch" ref={menu}>
      <summary aria-label="Switch factory">
        {health === null ? null : <HealthDot health={health} />}
        <b>{current?.name ?? "All factories"}</b>
        <small>
          {factories.length} {factories.length === 1 ? "factory" : "factories"}
        </small>
      </summary>
      <div className="fm-switch-menu" role="menu">
        {factories.map((factory) => (
          <button
            key={factory.id}
            type="button"
            role="menuitemradio"
            aria-checked={factory.id === current?.id}
            onClick={pick(() => onOpen(factory.id))}
          >
            <b>{factory.name}</b>
            <code>{factory.url}</code>
          </button>
        ))}
        <hr />
        <button type="button" role="menuitem" onClick={pick(onOverview)}>
          <b>All factories</b>
          <span>Health, add, and edit</span>
        </button>
      </div>
    </details>
  );
}

/** The one header every view shares; a factory's views add their tabs as children. */
export function ForemanBar({
  factories,
  current,
  health,
  onOpenFactory,
  onOverview,
  children,
}: {
  factories: readonly Factory[];
  current: Factory | null;
  health: FactoryHealth | null;
  onOpenFactory: (id: string) => void;
  onOverview: () => void;
  children?: ReactNode;
}) {
  return (
    <header className="fm-bar">
      <ForemanMark />
      <FactorySwitch
        factories={factories}
        current={current}
        health={health}
        onOpen={onOpenFactory}
        onOverview={onOverview}
      />
      {children}
    </header>
  );
}

/** A factory's views, and the one place new work starts. */
export function FactoryTabs({
  tab,
  attention,
  onTab,
  onNewWork,
}: {
  tab: ShellTab;
  /** Tickets whose blocker names them; the Threads badge. */
  attention: number;
  onTab: (tab: ShellTab) => void;
  onNewWork: () => void;
}) {
  return (
    <>
      <nav className="fm-tabs" aria-label="Factory views">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-current={tab === entry.id ? "page" : undefined}
            onClick={() => onTab(entry.id)}
          >
            {entry.label}
            {entry.id === "threads" && attention > 0 ? (
              <em aria-label={`${attention} need an answer`}>{attention}</em>
            ) : null}
          </button>
        ))}
      </nav>
      <span className="fm-spacer" />
      <button type="button" className="fm-button fm-button--primary" onClick={onNewWork}>
        New work
      </button>
    </>
  );
}

/** The factory at a glance: four readings, then where the tickets sit. */
export function BoardPulse({
  snapshot,
  blocked,
  fetchedAt,
}: {
  snapshot: BoardSnapshot;
  /** Bots waiting on a person, the same count the Bots tab groups. */
  blocked: number;
  fetchedAt: number;
}) {
  const busiest = Math.max(1, ...snapshot.byStage.map((stage) => stage.count));
  return (
    <section className="fm-pulse" aria-label="Factory readings">
      <div className="fm-kpis">
        <div className="fm-kpi">
          <span>Agents</span>
          <b>{snapshot.bots}</b>
        </div>
        <div className="fm-kpi">
          <span>Open tickets</span>
          <b>{snapshot.tickets}</b>
        </div>
        <div className="fm-kpi" data-alert={blocked > 0 ? "" : undefined}>
          <span>Needs a person</span>
          <b>{blocked}</b>
        </div>
        <div className="fm-kpi">
          <span>Uptime</span>
          <b>{formatUptime(snapshot.startedAt, fetchedAt) ?? "—"}</b>
        </div>
      </div>
      {snapshot.byStage.length === 0 ? (
        <p className="fm-pipeline-empty">No tickets in any stage.</p>
      ) : (
        <ol className="fm-pipeline" aria-label="Tickets by stage">
          {snapshot.byStage.map((stage) => (
            <li key={stage.stage}>
              <span>{stage.label}</span>
              <b>{stage.count}</b>
              <i style={{ width: `${(stage.count / busiest) * 100}%` }} aria-hidden="true" />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
