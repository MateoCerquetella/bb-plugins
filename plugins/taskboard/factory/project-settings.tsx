import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtime, useRpc } from '@get-bb/plugin-sdk/app';
import type { TaskboardRpcContract, WorkSource } from '../contract.js';
import type { FactoryExecution, FactoryProjectStatus } from './contract.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Icon } from '../components/ui/icon.js';
import { Input } from '../components/ui/input.js';
import { ExecutionPicker } from './execution-picker.js';

export function FactoryProjectSettings({ projectId, provider }: { projectId: string; provider: WorkSource }) {
  return <ProjectSettings key={`${projectId}:${provider}`} projectId={projectId} provider={provider} />;
}

function ProjectSettings({ projectId, provider }: { projectId: string; provider: WorkSource }) {
  const rpc = useRpc<TaskboardRpcContract>();
  const [status, setStatus] = useState<FactoryProjectStatus | null>(null);
  const [execution, setExecution] = useState<FactoryExecution | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [limit, setLimit] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      const result = await rpc.call('factoryGetProject', { projectId });
      if (!mounted.current || request !== generation.current || result.policy.projectId !== projectId) return;
      setStatus(result.status);
      if (!dirty) {
        setEnabled(result.policy.enabled);
        setLimit(result.policy.maxConcurrent);
        setExecution(result.policy.execution);
      }
      setError(null);
    } catch (error) {
      if (mounted.current && request === generation.current) setError(String(error));
    }
  }, [dirty, projectId, rpc]);
  useRealtime('taskboard:factory', () => { if (!pending.current) void load(); });
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; generation.current++; };
  }, [load]);
  async function save() {
    if (pending.current) return;
    pending.current = true;
    generation.current++;
    setSaving(true);
    setError(null);
    try {
      const result = await rpc.call('factorySaveProject', {
        projectId, provider, enabled, maxConcurrent: limit, intake: 'todo', execution
      });
      if (mounted.current) {
        setStatus(result.status);
        setEnabled(result.policy.enabled);
        setLimit(result.policy.maxConcurrent);
        setExecution(result.policy.execution);
        setDirty(false);
        void load();
      }
    } catch (error) { if (mounted.current) setError(String(error)); }
    finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  const stateLabel = !status ? 'Loading'
    : status.kind === 'running' ? 'Running'
    : status.kind === 'paused' ? 'Paused'
    : status.kind === 'blocked' ? 'Blocked' : 'Disabled';
  const stateClass = status?.kind === 'running'
    ? 'border-[color-mix(in_oklch,var(--success)_40%,transparent)] text-[var(--success)]'
    : status?.kind === 'blocked' ? 'border-destructive/40 text-destructive'
    : status?.kind === 'paused' ? 'border-border text-muted-foreground'
    : 'border-border text-foreground';
  const active = status && 'active' in status ? status.active : 0;
  const queue = status?.queue ?? null;
  const lastScan = status?.lastScan;
  const scanLabel = lastScan ? new Date(lastScan.observedAt).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit'
  }) : 'Never';
  return <form onSubmit={event => { event.preventDefault(); void save(); }} className="tb-settings-card min-w-0 space-y-4 rounded-lg border p-4 [overflow-wrap:anywhere] @lg:p-5" aria-label="Autonomous factory">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h3 className="text-sm font-semibold">Autonomous factory</h3>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {dirty ? <Badge variant="outline" className="border-border text-muted-foreground">Unsaved</Badge> : null}
        <Badge variant="outline" className={stateClass}>{stateLabel}</Badge>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-3 border-y border-border py-3">
      <span className="text-xs font-medium text-muted-foreground">AI for new sessions</span>
      <div className="min-w-0 flex-1">
        <ExecutionPicker
          projectId={projectId}
          value={execution}
          onChange={next => { setExecution(next); setDirty(true); }}
          disabled={saving || !status}
        />
      </div>
      <Button type="button" variant="ghost" size="sm" disabled={saving || !status || !execution}
        onClick={() => { setExecution(null); setDirty(true); }}>
        Use project defaults
      </Button>
    </div>

    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Factory activity">
      <span>Active <strong className="font-medium text-foreground tabular-nums">{active}/{limit}</strong></span>
      <span>Queue <strong className="font-medium text-foreground tabular-nums">{queue ?? 'Unknown'}</strong></span>
      <span>Last scan <strong className="font-medium text-foreground">{scanLabel}</strong></span>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
      <label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={enabled} disabled={saving || !status}
          onChange={event => { setEnabled(event.target.checked); setDirty(true); }} />
        <span className="font-medium">Enable automatic intake</span>
      </label>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          Concurrency
          <Input className="tb-field h-9 w-20 tabular-nums" type="number" min={1} max={20}
            aria-label="Automatic concurrency"
            value={limit} disabled={saving || !status}
            onChange={event => { setLimit(Number(event.target.value)); setDirty(true); }} />
        </label>
        <Button variant={dirty ? 'default' : 'outline'} size="sm" disabled={saving || !status} type="submit">
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'Save settings'}
        </Button>
      </div>
    </div>

    {status?.kind === 'running' ? <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon name="CircleCheck" className="size-3.5 shrink-0 text-[var(--success)]" />
      {status.available} automatic {status.available === 1 ? 'slot' : 'slots'} available · Intake: provider todo tickets
    </p> : null}
    {status?.kind === 'disabled' ? <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon name="Pause" className="size-3.5 shrink-0" />
      Automatic intake is off. Manual Start task still uses the AI above.
    </p> : null}
    {status?.kind === 'paused' ? <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon name="Pause" className="size-3.5 shrink-0" />
      {status.policy.enabled
        ? 'Automatic intake is enabled and awaiting its first provider scan.'
        : 'No new tickets or automatic stages will start. Active sessions keep running.'}
    </p> : null}
    {status?.kind === 'blocked' ? <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
      <Icon name="AlertTriangle" className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 break-words">{status.reason}</span>
    </div> : null}
    {status?.lastScan?.reason ? <p className="break-words text-[11px] text-muted-foreground">Scan: {status.lastScan.reason}</p> : null}
    {error ? <p role="alert" className="break-words text-sm text-destructive">{error}</p> : null}
  </form>;
}
