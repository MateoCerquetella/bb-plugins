import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtime, useRpc } from '@get-bb/plugin-sdk/app';
import type { TaskboardRpcContract, WorkSource } from '../contract.js';
import type { FactoryProjectStatus } from './contract.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';

export function FactoryProjectSettings({ projectId, provider }: { projectId: string; provider: WorkSource }) {
  return <ProjectSettings key={`${projectId}:${provider}`} projectId={projectId} provider={provider} />;
}

function ProjectSettings({ projectId, provider }: { projectId: string; provider: WorkSource }) {
  const rpc = useRpc<TaskboardRpcContract>();
  const [status, setStatus] = useState<FactoryProjectStatus | null>(null);
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
        projectId, provider, enabled, maxConcurrent: limit, intake: 'todo'
      });
      if (mounted.current) {
        setStatus(result.status);
        setEnabled(result.policy.enabled);
        setLimit(result.policy.maxConcurrent);
        setDirty(false);
        void load();
      }
    } catch (error) { if (mounted.current) setError(String(error)); }
    finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  return <section className="min-w-0 space-y-4 border-t border-border py-5 [overflow-wrap:anywhere]" aria-label="Autonomous factory">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Autonomous factory</h3>
      <span className="min-w-0 break-words text-xs text-muted-foreground">{status?.kind ?? 'Loading'} · {provider}</span>
    </div>
    <form className="flex flex-wrap items-end gap-4" onSubmit={event => { event.preventDefault(); void save(); }}>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} disabled={saving || !status}
          onChange={event => { setEnabled(event.target.checked); setDirty(true); }} />
        Enable automatic intake
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Automatic concurrency
        <Input className="tb-field h-9 w-24" type="number" min={1} max={20}
          value={limit} disabled={saving || !status}
          onChange={event => { setLimit(Number(event.target.value)); setDirty(true); }} />
      </label>
      <Button variant="outline" size="sm" disabled={saving || !status} type="submit">
        {saving ? 'Saving...' : 'Save factory settings'}
      </Button>
    </form>
    {status && 'active' in status ? <p className="text-xs text-muted-foreground">{status.active} active automatic workflows</p> : null}
    {status ? <p className="text-xs text-muted-foreground">
      {status.queue === null ? 'Provider queue unknown' : `${status.queue} last-known unclaimed todo tickets within the 500-ticket scan window`}
      {status.lastScan ? ` · Last scan ${status.lastScan.kind} at ${new Date(status.lastScan.observedAt).toLocaleString()}`
        : ' · No provider scan yet'}
    </p> : null}
    {status?.lastScan?.reason ? <p className="break-words text-xs text-muted-foreground">Scan reason: {status.lastScan.reason}</p> : null}
    {status?.kind === 'running' ? <p role="status" className="text-xs text-muted-foreground">{status.available} automatic slots available · Intake: provider todo tickets</p> : null}
    {status?.kind === 'disabled' ? <p role="status" className="break-words text-sm">Automatic intake is disabled.</p> : null}
    {status?.kind === 'paused' ? <p role="status" className="break-words text-sm">{status.policy.enabled
      ? 'Automatic intake is enabled and awaiting its first provider scan.'
      : 'Factory paused. No new automatic stages will start.'}</p> : null}
    {status?.kind === 'blocked' ? <p role="alert" className="break-words text-sm text-destructive">{status.reason}</p> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </section>;
}
