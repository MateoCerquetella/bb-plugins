import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../server.ts";
import { CHANGED, snapshotSchema, type Snapshot } from "./model.ts";
import { LOCAL_CHANGE } from "./background.ts";
import { activityResultSchema, patterns, type ActivityInput, type ActivityResult } from "./activity.ts";

export function ActivityOverview() {
  const rpc = useRpc<typeof rpcContract>();
  const [settings, setSettings] = useState<Snapshot | null>(null);
  const settingsRequest = useRef(0);
  const mounted = useRef(false);
  const refresh = useCallback(() => {
    const request = ++settingsRequest.current;
    void rpc.call("get", null).then(value => {
      if (mounted.current && request === settingsRequest.current) setSettings(value);
    }).catch(() => { /* Keep the last known preference during a disconnect. */ });
  }, [rpc]);
  useEffect(() => {
    mounted.current = true; refresh();
    const changed = (event: Event) => {
      const value = snapshotSchema.safeParse((event as CustomEvent).detail);
      if (value.success) { settingsRequest.current++; setSettings(value.data); }
    };
    window.addEventListener(LOCAL_CHANGE, changed);
    window.addEventListener("focus", refresh);
    return () => { mounted.current = false; settingsRequest.current++; window.removeEventListener(LOCAL_CHANGE, changed); window.removeEventListener("focus", refresh); };
  }, [refresh]);
  useRealtime(CHANGED, refresh);
  const enabled = settings?.settings.activityOverview ?? false;
  return <div className="aura-activity-slot" hidden={!enabled}>{enabled && <ActivityContent />}</div>;
}

function ActivityContent() {
  const rpc = useRpc<typeof rpcContract>();
  const id = useId();
  const [period, setPeriod] = useState<ActivityInput["period"]>("year");
  const [repository, setRepository] = useState<string | null>(null);
  const [repositories, setRepositories] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<ActivityResult | null>(null);
  useEffect(() => {
    let live = true;
    setResult(null);
    void rpc.call("activity", { period, repository }).then(value => {
      if (!live) return;
      const validated = activityResultSchema.parse(value);
      setResult(validated);
      if (validated.data) setRepositories(previous => [...new Set([...previous, ...validated.data!.repositories])].sort());
    }).catch(() => {
      if (live) setResult({ status: "error", message: "Could not load verified GitHub activity. Please retry.", data: null });
    });
    return () => { live = false; };
  }, [rpc, period, repository, attempt]);
  const data = result?.data;
  const summary = data?.days ? patterns(data.days, data.to.slice(0, 10)) : null;
  const maximum = data?.days ? Math.max(1, ...data.days.map(day => day.contributionCount)) : 1;
  const offset = data?.days?.length ? new Date(data.days[0].date + "T00:00:00Z").getUTCDay() : 0;
  const empty = result?.status === "ready" && data && [data.contributions, data.opened, data.merged, data.reviews].every(value => value === 0);
  const retry = () => { setResult(null); setAttempt(value => value + 1); };
  return <section className="aura-activity overview" aria-labelledby={`${id}-title`} aria-busy={!result}>
    <header className="overview-header"><div><h2 id={`${id}-title`}>Activity overview</h2><p>{data ? `${data.login} · GitHub${repository ? ` · ${repository}` : ""}` : "GitHub activity"}</p></div><div className="filters">
      <label className="aura-sr-only" htmlFor={`${id}-period`}>Activity period</label><select id={`${id}-period`} aria-label="Activity period" value={period} onChange={e => { setResult(null); setPeriod(e.target.value as ActivityInput["period"]); }}><option value="year">Last 365 days</option><option value="quarter">Last 90 days</option><option value="month">Last 30 days</option></select>
      <label className="aura-sr-only" htmlFor={`${id}-repo`}>Activity repository</label><select id={`${id}-repo`} aria-label="Activity repository" value={repository ?? ""} onChange={e => { setResult(null); setRepository(e.target.value || null); }}><option value="">All repositories</option>{repositories.map(name => <option key={name} value={name}>{name}</option>)}</select>
    </div></header>
    {!result && <p className="notice" role="status">Loading GitHub activity…</p>}
    {result && !data && <p className="notice" role={result.status === "error" ? "alert" : "status"}>{result.message}<button type="button" onClick={retry}>Retry</button></p>}
    {data && <>
      {empty && <p className="notice" role="status">No GitHub activity in this period.</p>}
      <div className="stats" aria-label="GitHub activity metrics">{[["Contributions", data.contributions], ["PRs opened", data.opened], ["PRs merged", data.merged], ["Review contributions", data.reviews]].map(([label, value]) => <div className="stat" key={label as string}><span>{label}</span><strong>{typeof value === "number" ? value.toLocaleString() : "—"}</strong>{value === null && <small>Unavailable</small>}</div>)}</div>
      <div className="activity-body"><section><h3>Contribution activity</h3>{data.days ? <>
        <div className="calendar-region" tabIndex={0} role="region" aria-label="Dated contribution calendar, scroll horizontally"><div className="calendar">{Array.from({ length: offset }, (_, i) => <span className="day calendar-spacer" key={`spacer-${i}`} aria-hidden="true" />)}{data.days.map(day => <span className="day" key={day.date} data-level={day.contributionCount ? Math.min(4, Math.ceil(day.contributionCount / maximum * 4)) : 0} title={`${day.date}: ${day.contributionCount.toLocaleString()} contributions`} aria-label={`${day.date}: ${day.contributionCount} contributions`} />)}</div></div>
        <div className="calendar-caption"><span>{data.from.slice(0, 10)} – {data.to.slice(0, 10)}</span><span className="legend">Less <i aria-hidden="true" /><i aria-hidden="true" /> More</span></div>
      </> : <p className="notice">Calendar unavailable for this scope.</p>}</section>
      <section className="patterns"><h3>Patterns</h3>{summary ? <dl><div><dt>Current streak</dt><dd>{summary.current} days</dd></div><div><dt>Longest streak</dt><dd>{summary.longest} days</dd></div><div><dt>Busiest month</dt><dd>{formatDate(summary.busiestMonth ? summary.busiestMonth + "-01" : null, true)}</dd></div><div><dt>Busiest date</dt><dd>{formatDate(summary.busiestDate)}</dd></div></dl> : <p className="notice">Patterns unavailable.</p>}</section></div>
      {data.notes.length > 0 && <div className="source-notes" role="status">{data.notes.map(note => <p key={note}>{note}</p>)}{result?.status === "partial" && <button type="button" onClick={retry}>Retry</button>}</div>}
      <footer className="provenance"><span>GitHub · updated {new Date(data.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · visible activity</span><span><a href={data.links.pullRequests} target="_blank" rel="noreferrer">Your open PRs</a><a href={data.links.reviewRequests} target="_blank" rel="noreferrer">Review requests</a></span></footer>
    </>}
  </section>;
}
function formatDate(date: string | null, month = false) {
  return date ? new Date(date + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", ...(month ? { year: "numeric" as const } : { day: "numeric" as const }), timeZone: "UTC" }) : "—";
}
