import { useCallback, useEffect, useRef, useState } from 'react';
import { Markdown, useBbContext, useBbNavigate, useRealtime, useRpc } from '@get-bb/plugin-sdk/app';
import type { TaskboardRpcContract, WorkItem } from '../contract.js';
import type { FactoryRecord, FactoryRunKind } from './contract.js';
import { Button } from '../components/ui/button.js';
import { Icon } from '../components/ui/icon.js';
import { Textarea } from '../components/ui/textarea.js';
import { Input } from '../components/ui/input.js';

const labels = { investigate: 'Investigate', plan: 'Plan', build: 'Build', review: 'Review' };
const statusLabels = {
  starting: 'Starting', running: 'In progress', finished: 'Turn finished',
  failed: 'Failed', canceled: 'Stopped', uncertain: 'Needs attention'
};
export function StartTaskButton({ item, pin, disabled = false }: {
  item: WorkItem; pin: () => void; disabled?: boolean;
}) {
  const rpc = useRpc<TaskboardRpcContract>();
  const navigate = useBbNavigate();
  const context = useBbContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  async function start() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      const { record } = await rpc.call('factoryStartTask', {
        projectId: item.bbProjectId, source: item.source, locator: item.locator,
        contextThreadId: context.projectId === item.bbProjectId ? context.threadId : null
      });
      const run = record.runs.at(-1);
      if (run?.threadId) { pin(); navigate.toThread(run.threadId); }
      setError(record.automationError ?? run?.error ??
        (record.trackerProgress.status === 'failed' ? record.trackerProgress.message : null));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="tb-start-task">
    <Button size="sm" variant="outline" disabled={disabled || busy}
      onClick={event => { event.stopPropagation(); void start(); }}>
      <Icon name="AiContentGenerator01" className="size-3.5" />{busy ? 'Starting...' : 'Start task'}
    </Button>
    {error && <p role="alert" className="mt-2 text-xs text-destructive break-words">{error}</p>}
  </div>;
}
export function FactoryProgress({ item, pin }: { item: WorkItem; pin: () => void }) {
  const rpc = useRpc<TaskboardRpcContract>();
  const navigate = useBbNavigate();
  const context = useBbContext();
  const [record, setRecord] = useState<FactoryRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState(false);
  const [recoveryId, setRecoveryId] = useState('');
  const epoch = useRef(0);
  const identity = { projectId: item.bbProjectId, source: item.source, locator: item.locator };
  const load = useCallback(async () => {
    const ticket = epoch.current;
    try {
      const result = await rpc.call('factoryGet', {
        projectId: item.bbProjectId, source: item.source, locator: item.locator
      });
      if (ticket !== epoch.current) return;
      setRecord(current => current && result.record && current.version > result.record.version ? current : result.record);
      setLoaded(true);
    } catch (e) {
      if (ticket === epoch.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, [rpc, item.bbProjectId, item.source, item.locator]);
  useEffect(() => {
    epoch.current++;
    setRecord(null); setLoaded(false); setError(null); setEditing(false); setBody(''); setBusy(false);
    void load();
    const interval = window.setInterval(() => void load(), 3000);
    return () => { epoch.current++; window.clearInterval(interval); };
  }, [load]);
  useRealtime('taskboard:factory', () => void load());
  const run = record?.runs.at(-1);
  const plan = record?.plans.at(-1);
  const approved = !!plan && record?.approvedDigest === plan.digest && plan.scopeDigest === record?.scopeDigest;
  const active = record?.runs.some(run => ['starting', 'running', 'uncertain'].includes(run.status));
  async function action(operation: () => Promise<{ record: FactoryRecord }>, open = false) {
    if (busy) return;
    const ticket = epoch.current;
    setBusy(true); setError(null);
    try {
      const result = await operation();
      if (ticket !== epoch.current) return;
      setRecord(result.record);
      const threadId = result.record.runs.at(-1)?.threadId;
      if (open && threadId) { pin(); navigate.toThread(threadId); }
    } catch (e) {
      if (ticket === epoch.current) { setError(e instanceof Error ? e.message : String(e)); void load(); }
    } finally { if (ticket === epoch.current) setBusy(false); }
  }
  const start = (kind: FactoryRunKind, retry = false) => action(() => rpc.call('factoryStart', {
    ...identity, expectedVersion: record?.version ?? 0, kind, retry,
    contextThreadId: context.projectId === item.bbProjectId ? context.threadId : null
  }), true);
  return <section className="tb-agent-progress progress" aria-label="Agent progress">
    <div className="sectionhead">
      <h2>Agent</h2>
      <span role="status" className="status">{run ? statusLabels[run.status] : 'Not started'}</span>
    </div>
    {error && <p role="alert" className="text-xs text-destructive break-words">{error}</p>}
    {record?.automationError && <p role="alert" className="mb-2 text-xs text-destructive break-words">{record.automationError}</p>}
    {record?.trackerProgress.message && <div className="mb-3 text-xs">
      <p role={record.trackerProgress.status === 'failed' ? 'alert' : 'status'} className="break-words">{record.trackerProgress.message}</p>
      {record.trackerProgress.status === 'failed' && <Button variant="outline" size="sm" disabled={busy} onClick={() => void action(() =>
        rpc.call('factoryRetryStatus', identity)
      )}>Retry status update</Button>}
    </div>}
    {!run ? <StartTaskButton item={item} pin={pin} disabled={!loaded || busy || ['done', 'canceled'].includes(item.stateCategory)} /> : <>
      <div className="tb-agent-summary">
        <Icon name={run.status === 'failed' || run.status === 'uncertain' ? 'AlertCircle' : 'Circle'} className="size-3.5" />
        <div>
          <strong>{labels[run.kind]}</strong>
          <span>{run.error ?? run.activity}</span>
        </div>
      </div>
      {run.status === 'uncertain' && <div className="my-3 space-y-2">
        <Input aria-label="Recovered native thread ID" placeholder="Native thread ID" value={recoveryId} onChange={e => setRecoveryId(e.target.value)} />
        <Button size="sm" variant="outline" disabled={busy || !(run.threadId || recoveryId.trim())} onClick={() => void action(() =>
          rpc.call('factoryRecover', { ...identity, expectedVersion: record!.version, threadId: run.threadId ?? recoveryId.trim() })
        )}>Link recovered session</Button>
      </div>}
      <div className="mt-3 flex flex-wrap gap-2">
        {run.threadId && <Button variant="outline" size="sm" onClick={() => {
          pin(); navigate.toThread(run.threadId!);
        }}><Icon name="MessageCirclePlus" className="size-3.5" />Open session</Button>}
        {!active && (run.status === 'failed' || run.status === 'canceled') &&
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void start(run.kind, true)}>
            <Icon name="RotateCcw" className="size-3.5" />Retry {labels[run.kind].toLowerCase()}
          </Button>}
        {!active && record?.automationError && <StartTaskButton item={item} pin={pin} disabled={busy} />}
        {!active && !record?.automatic && !record?.automationError && run.status === 'finished' && run.kind === 'investigate' &&
          <Button size="sm" disabled={busy} onClick={() => void start('plan')}>Generate plan</Button>}
        {!active && approved && run.kind !== 'review' && (!record?.automatic || run.kind === 'build') &&
          <Button size="sm" disabled={busy} onClick={() => void start(run.kind === 'build' && run.status === 'finished' ? 'review' : 'build')}>
            {run.kind === 'build' && run.status === 'finished' ? 'Start review' : 'Start build'}
          </Button>}
      </div>
      {(run.environmentId || plan || run.steps.length > 0 || run.changedFiles.length > 0 ||
        run.checks.length > 0 || run.output) && <details className="tb-agent-details mt-3">
        <summary className="cursor-pointer text-xs">Run details</summary>
        <div className="mt-2 text-xs">
          <p>{record?.stage} · {run.environmentId ?? 'Workspace pending'}
            {plan ? ` · Plan r${plan.revision} ${approved ? 'approved' : 'unapproved'}` : ''}</p>
          {run.steps.length > 0 && <ul aria-label="Current plan steps" className="mt-3 space-y-1">
            {run.steps.map((step, index) => <li key={index} className="break-words">{step.status}: {step.step}</li>)}
          </ul>}
          {run.changedFiles.length > 0 && <details className="mt-3">
            <summary className="cursor-pointer">{run.changedFiles.length} changed files reported</summary>
            <ul className="mt-2">{run.changedFiles.map(path => <li className="break-all" key={path}>{path}</li>)}</ul>
          </details>}
          {run.checks.length > 0 && <details className="mt-3">
            <summary className="cursor-pointer">Command results ({run.checks.length})</summary>
            {run.checks.map(check => <details key={check.id} className="mt-2">
              <summary className="cursor-pointer break-all">{check.exitCode === null ? 'Unknown exit' : `Exit ${check.exitCode}`}: {check.command}</summary>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all">{check.output}</pre>
            </details>)}
          </details>}
          {run.output && <div className="mt-3 max-h-96 overflow-auto"><Markdown content={run.output} /></div>}
          {plan && record?.automatic && <details className="mt-3">
            <summary className="cursor-pointer">Implementation plan · revision {plan.revision}</summary>
            <div className="mt-2 max-h-96 overflow-auto"><Markdown content={plan.body} /></div>
          </details>}
        </div>
      </details>}
      {!active && !record?.automatic && <details className="mt-4" open={editing}>
        <summary className="cursor-pointer text-xs font-medium" onClick={event => {
          event.preventDefault();
          if (!editing) setBody(plan?.body ?? (run.kind === 'plan' ? run.output : ''));
          setEditing(!editing);
        }}>Implementation plan</summary>
        <div className="mt-2 space-y-2">
          <Textarea aria-label="Implementation plan" value={body} onChange={e => setBody(e.target.value)} rows={8} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy || !body.trim()} onClick={() => void action(() => rpc.call('factorySavePlan', {
              ...identity, expectedVersion: record!.version, body
            }))}>Save revision</Button>
            {plan && !approved && <Button size="sm" disabled={busy || body.trim() !== plan.body} onClick={() => void action(() => rpc.call('factoryApprovePlan', {
              ...identity, expectedVersion: record!.version, digest: plan.digest
            }))}>Approve revision {plan.revision}</Button>}
          </div>
        </div>
      </details>}
      {record?.automatic && ['investigate', 'plan'].includes(run.kind) &&
        ['starting', 'running', 'finished'].includes(run.status) && !record.automationError &&
        <p className="mt-2 text-xs text-muted-foreground">Investigation, planning and build continue automatically.</p>}
      {run.status === 'finished' && ['build', 'review'].includes(run.kind) &&
        <p className="notice">Turn finished. Review and work acceptance are still pending.</p>}
    </>}
  </section>;
}
