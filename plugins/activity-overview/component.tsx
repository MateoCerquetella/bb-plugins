import { useMemo, useState } from "react";
import { getOverview, periods, repositories, type Period, type Repository } from "./data";

export function ActivityOverview() {
  const [period, setPeriod] = useState<Period>("year");
  const [repository, setRepository] = useState<Repository>("all");
  const [selectedAttention, setSelectedAttention] = useState<string | null>(null);
  const data = useMemo(() => getOverview(period, repository), [period, repository]);
  return <main className="activity-overview">
    <header className="activity-header"><div><p className="activity-eyebrow">ACTIVITY</p><h1>Overview</h1><p className="activity-subtitle">Your contribution pulse across BB repositories.</p></div><div className="activity-toolbar">
      <label>Period<select aria-label="Period" value={period} onChange={event => setPeriod(event.target.value as Period)}>{periods.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label>Repository<select aria-label="Repository" value={repository} onChange={event => setRepository(event.target.value as Repository)}>{repositories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    </div></header>
    <section className="activity-metrics" aria-label="Activity metrics">{[["Contributions", data.contributions], ["PRs opened", data.opened], ["PRs merged", data.merged], ["Reviews", data.reviews]].map(([label, value]) => <article className="metric" key={label as string}><span>{label}</span><strong>{value}</strong><small>{data.delta}</small></article>)}</section>
    <section className="activity-grid"><article className="activity-panel contribution-panel"><div className="panel-heading"><div><h2>Contribution activity</h2><p>{data.contributions} contributions in selected period</p></div><span className="legend"><i /> Less <i className="legend-high" /> More</span></div><div className="heatmap" aria-label="Annual contribution heatmap">{data.heatmap.map((level, index) => <i key={index} data-level={level} title={`${level} contributions`} />)}</div></article>
      <article className="activity-panel"><h2>Patterns</h2><dl className="patterns"><div><dt>Current streak</dt><dd>{data.currentStreak} days</dd></div><div><dt>Longest streak</dt><dd>{data.longestStreak} days</dd></div><div><dt>Most active month</dt><dd>{data.activeMonth}</dd></div><div><dt>Most active day</dt><dd>{data.activeDay}</dd></div></dl></article></section>
    <section className="activity-panel attention"><div className="panel-heading"><div><h2>Needs your attention</h2><p>Items that benefit from a quick follow-up.</p></div><span className="attention-count">{data.attention.length}</span></div><ul>{data.attention.map(item => <li key={item}><span>{item}</span><button type="button" onClick={() => setSelectedAttention(item)}>Open <span aria-hidden="true">→</span></button></li>)}</ul>{selectedAttention && <p className="attention-status" role="status">Selected: {selectedAttention}</p>}</section>
  </main>;
}
