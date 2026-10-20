import { useEffect, useState } from 'react';
import { useRealtime, useRpc } from '@get-bb/plugin-sdk/app';
import type { TaskboardRpcContract, WorkSource } from '../contract.js';
import type { FactoryProjectStatus } from './contract.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';

export function FactoryProjectSettings({ projectId, provider }: { projectId: string; provider: WorkSource }) {
  const rpc = useRpc<TaskboardRpcContract>();
  const [status, setStatus] = useState<FactoryProjectStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [limit, setLimit] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useRealtime('taskboard:factory', () => {
    void rpc.call('factoryGetProject', { projectId }).then(result => {
      if (result.policy.projectId === projectId) setStatus(result.status);
    }).catch(error => setError(String(error)));
  });
  useEffect(() => {
    let canceled = false;
    void rpc.call('factoryGetProject', { projectId }).then(result => {
      if (canceled) return;
      setStatus(result.status);
      setEnabled(result.policy.enabled);
      setLimit(result.policy.maxConcurrent);
    }).catch(error => { if (!canceled) setError(String(error)); });
    return () => { canceled = true; };
  }, [projectId, provider, rpc]);
  async function save() {
    setSaving(true);
    setError(null);
    try {
      const result = await rpc.call('factorySaveProject', {
        projectId, provider, enabled, maxConcurrent: limit, intake: 'todo'
      });
      setStatus(result.status);
    } catch (error) { setError(String(error)); }
    finally { setSaving(false); }
  }
  return <section className="min-w-0 space-y-4 border-t border-border py-5 [overflow-wrap:anywhere]" aria-label="Autonomous factory">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Autonomous factory</h3>
      <span className="min-w-0 break-words text-xs text-muted-foreground">{status?.kind ?? 'Loading'} · {provider}</span>
    </div>
    <form className="flex flex-wrap items-end gap-4" onSubmit={event => { event.preventDefault(); void save(); }}>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} disabled={saving || !status}
          onChange={event => setEnabled(event.target.checked)} />
        Enable automatic intake
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Automatic concurrency
        <Input className="tb-field h-9 w-24" type="number" min={1} max={20}
          value={limit} disabled={saving || !status} onChange={event => setLimit(Number(event.target.value))} />
      </label>
      <Button variant="outline" size="sm" disabled={saving || !status} type="submit">
        {saving ? 'Saving...' : 'Save factory settings'}
      </Button>
    </form>
    {status && 'active' in status ? <p className="text-xs text-muted-foreground">{status.active} active automatic workflows</p> : null}
    {status?.kind === 'running' ? <p role="status" className="text-xs text-muted-foreground">{status.available} automatic slots available · Intake: provider todo tickets</p> : null}
    {status?.kind === 'paused' ? <p role="status" className="break-words text-sm">Factory paused. No new automatic stages will start.</p> : null}
    {status?.kind === 'blocked' ? <p role="alert" className="break-words text-sm text-destructive">{status.reason}</p> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </section>;
}
