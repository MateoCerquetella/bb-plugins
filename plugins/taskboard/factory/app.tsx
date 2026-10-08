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
  starting: 'Starting', running: 'Working', finished: 'Turn finished',
  failed: 'Failed', canceled: 'Stopped', uncertain: 'Needs attention'
};
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
      <h2>Agent progress</h2>
      <span role="status" className="status">{run ? statusLabels[run.status] : 'Not started'}</span>
    </div>
    {error && <p role="alert" className="text-xs text-destructive break-words">{error}</p>}
    {!run ? <Button size="sm" disabled={!loaded || busy} onClick={() => void start('investigate')}>
      <Icon name="AiContentGenerator01" className="size-3.5" />{busy ? 'Starting...' : 'Send to agent'}
    </Button> : <>
      <div className="tb-agent-phases">
        {(Object.keys(labels) as FactoryRunKind[]).map(kind => {
          const phaseRun = record?.runs.filter(run => run.kind === kind).at(-1);
          return <div className={`phase ${phaseRun?.status === 'running' ? 'current' : ''}`} key={kind}>
            <span className="phaseicon"><Icon name={phaseRun?.status === 'finished' ? 'Check' : 'Circle'} className="size-3" /></span>
            <div className="phasetext"><strong>{labels[kind]}</strong><span>{phaseRun ? statusLabels[phaseRun.status] : 'Waiting'}</span></div>
          </div>;
        })}
      </div>
      <div className="currentline"><span className="text-2xs text-muted-foreground">Current activity</span>
        <p>{run.activity}</p>
        {run.error && <p role="alert" className="text-destructive">{run.error}</p>}
      </div>
      {run.status === 'uncertain' && <div className="my-3 space-y-2">
        <Input aria-label="Recovered native thread ID" placeholder="Native thread ID" value={recoveryId} onChange={e => setRecoveryId(e.target.value)} />
        <Button size="sm" variant="outline" disabled={busy || !(run.threadId || recoveryId.trim())} onClick={() => void action(() =>
          rpc.call('factoryRecover', { ...identity, expectedVersion: record!.version, threadId: run.threadId ?? recoveryId.trim() })
        )}>Link recovered session</Button>
      </div>}
      <dl className="facts">
        <dt>Stage</dt><dd>{record?.stage}</dd>
        <dt>Tracker</dt><dd>{item.status}</dd>
        <dt>Workspace</dt><dd>{run.environmentId ?? 'Provisioning'}</dd>
        <dt>Plan</dt><dd>{plan ? `Revision ${plan.revision} · ${approved ? 'approved' : 'needs approval'}` : 'Not drafted'}</dd>
        <dt>Verification</dt><dd>Not accepted</dd>
      </dl>
      {run.steps.length > 0 && <ul aria-label="Current plan steps" className="mt-3 space-y-1 text-xs">
        {run.steps.map((step, index) => <li key={index} className="break-words">{step.status}: {step.step}</li>)}
      </ul>}
      {run.changedFiles.length > 0 && <details className="mt-3">
        <summary className="cursor-pointer text-xs">{run.changedFiles.length} changed files reported</summary>
        <ul className="mt-2 text-xs">{run.changedFiles.map(path => <li className="break-all" key={path}>{path}</li>)}</ul>
      </details>}
      {run.checks.length > 0 && <details className="mt-3">
        <summary className="cursor-pointer text-xs">Command results ({run.checks.length})</summary>
        {run.checks.map(check => <details key={check.id} className="mt-2 text-xs">
          <summary className="cursor-pointer break-all">{check.exitCode === null ? 'Unknown exit' : `Exit ${check.exitCode}`}: {check.command}</summary>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all">{check.output}</pre>
        </details>)}
      </details>}
      <div className="mt-3 flex flex-wrap gap-2">
        {run.threadId && <Button variant="outline" size="sm" onClick={() => {
          pin(); navigate.toThread(run.threadId!);
        }}><Icon name="MessageCirclePlus" className="size-3.5" />Open session</Button>}
        {!active && (run.status === 'failed' || run.status === 'canceled') &&
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void start(run.kind, true)}>
            <Icon name="RotateCcw" className="size-3.5" />Retry {labels[run.kind].toLowerCase()}
          </Button>}
        {!active && run.status === 'finished' && run.kind === 'investigate' &&
          <Button size="sm" disabled={busy} onClick={() => void start('plan')}>Generate plan</Button>}
        {!active && approved && run.kind !== 'review' &&
          <Button size="sm" disabled={busy} onClick={() => void start(run.kind === 'build' && run.status === 'finished' ? 'review' : 'build')}>
            {run.kind === 'build' && run.status === 'finished' ? 'Start review' : 'Start build'}
          </Button>}
      </div>
      {run.output && <details className="mt-4">
        <summary className="cursor-pointer text-xs font-medium">{labels[run.kind]} findings</summary>
        <div className="mt-2 max-h-96 overflow-auto text-xs"><Markdown content={run.output} /></div>
      </details>}
      {!active && <details className="mt-4" open={editing}>
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
      {run.status === 'finished' && <p className="notice">Turn finished. Verification and work acceptance are still pending. Tracker unchanged.</p>}
    </>}
  </section>;
}
