import { useCallback, useEffect, useRef, useState } from 'react';
import { Markdown, useBbContext, useBbNavigate, useRealtime, useRpc } from '@get-bb/plugin-sdk/app';
import type { TaskboardRpcContract, WorkItem } from '../contract.js';
import type { FactoryRecord, FactoryRun, FactoryRunKind } from './contract.js';
import { MAX_REVIEW_REPAIRS } from './review.js';
import { Button } from '../components/ui/button.js';
import { Icon } from '../components/ui/icon.js';
import { Textarea } from '../components/ui/textarea.js';
import { Input } from '../components/ui/input.js';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog.js';

function RunInsights({ record }: { record: FactoryRecord }) {
  const navigate = useBbNavigate();
  return <div className="space-y-4 text-xs min-w-0">
    {[...record.runs].reverse().map(run => <section key={run.id} className="border-t pt-3 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{labels[run.kind]}</strong><span>{runStatus(run)}</span>
        {run.threadId && <Button size="sm" variant="ghost" onClick={() => navigate.toThread(run.threadId!)}>Open session</Button>}
      </div>
      <p className="mt-1 break-words">{run.error ?? run.activity}</p>
      <p className="text-muted-foreground mt-1">Started {new Date(run.startedAt).toLocaleString()}</p>
      {run.steps.length > 0 && <div className="mt-3">
        <p>{run.steps.filter(step => step.status === 'completed').length} / {run.steps.length} steps completed</p>
        <ul className="mt-2 space-y-2">{run.steps.map((step, index) => <li key={index} className="flex gap-2">
          <span className="shrink-0">{step.status === 'completed' ? '✓' : step.status === 'active' ? '→' : '·'}</span>
          <span className="break-words">{step.step} <span className="text-muted-foreground">({step.status})</span></span>
        </li>)}</ul>
      </div>}
      {(run.updates ?? []).length > 0 && <div className="mt-3 space-y-3">
        <strong>Agent updates</strong>
        {[...(run.updates ?? [])].reverse().slice(0, 3).map(update => <div key={update.id}>
          <time className="text-muted-foreground">{new Date(update.at).toLocaleTimeString()}</time>
          <div className="max-h-48 overflow-auto break-words"><Markdown content={update.text} /></div>
        </div>)}
      </div>}
      {run.checks.length > 0 && <div className="mt-3">
        <strong>Commands ({run.checks.length})</strong>
        {[...run.checks].reverse().map(check => <details key={check.id} className="mt-2">
          <summary className="cursor-pointer break-all">{check.exitCode === 0 ? 'Passed' : check.exitCode === null ? 'Exit unknown' : `Failed (${check.exitCode})`}: {check.command}</summary>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all">{check.output || 'No output recorded.'}</pre>
        </details>)}
      </div>}
      {run.changedFiles.length > 0 && <details className="mt-3"><summary className="cursor-pointer">{run.changedFiles.length} changed files</summary>
        <ul>{run.changedFiles.map(path => <li key={path} className="break-all">{path}</li>)}</ul>
      </details>}
      {run.output && <details className="mt-3"><summary className="cursor-pointer">Stage result</summary>
        <div className="max-h-96 overflow-auto break-words"><Markdown content={run.output} /></div>
      </details>}
    </section>)}
  </div>;
}

export function FactoryThreadProgress({ threadId, isCompactViewport }: { threadId: string; isCompactViewport: boolean }) {
  const rpc = useRpc<TaskboardRpcContract>();
  const [record, setRecord] = useState<FactoryRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let canceled = false;
    setRecord(null); setOpen(false); setError(null);
    const load = async () => {
      try {
        const result = await rpc.call('factoryForThread', { threadId });
        if (!canceled) { setRecord(result.record); setError(null); }
      } catch { if (!canceled) setError('Progress could not be refreshed.'); }
    };
    void load();
    const interval = window.setInterval(() => void load(), 3000);
    return () => { canceled = true; window.clearInterval(interval); };
  }, [rpc, threadId]);
  const run = record?.runs.at(-1);
  if (!record || !run) return null;
  const completed = run.steps.filter(step => step.status === 'completed').length;
  return <>
    <span title={`${labels[run.kind]}: ${run.error ?? run.activity}`}><Button size="sm" variant="ghost" className="max-w-48"
      aria-label="Task progress" onClick={() => setOpen(true)}>
      <Icon name="AiContentGenerator01" className="size-3.5 shrink-0" />
      {!isCompactViewport && <span className="truncate">{labels[run.kind]} · {run.status === 'running' && run.steps.length ? `${completed}/${run.steps.length}` : runStatus(run)}</span>}
    </Button></span>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[80vh] overflow-y-auto">
      <DialogTitle>Task progress</DialogTitle>
      <DialogDescription>{record.stage} · Updated {new Date(record.updatedAt).toLocaleTimeString()}</DialogDescription>
      {error && <p role="alert">{error}</p>}
      {record.automationError && <p role="alert">{record.automationError}</p>}
      <RunInsights record={record} />
    </DialogContent></Dialog>
  </>;
}

const labels = { investigate: 'Investigate', plan: 'Plan', build: 'Build', review: 'Review' };
const statusLabels = {
  starting: 'Starting', running: 'In progress', finished: 'Turn finished',
  failed: 'Failed', canceled: 'Stopped', uncertain: 'Needs attention'
};
function runStatus(run: FactoryRun) {
  if (run.kind === 'build' && run.status === 'finished') {
    if (run.buildResult?.verdict === 'needs_input') return 'Build needs input';
    if (run.buildResult?.verdict === 'blocked') return 'Build found blockers';
  }
  if (run.kind === 'review' && run.status === 'finished') {
    return run.reviewResult?.verdict === 'blocked' ? 'Review found blockers'
      : run.reviewResult?.verdict === 'passed' ? 'Review passed'
      : 'Review needs attention';
  }
  return statusLabels[run.status];
}
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
  const repairLimitReached = (record?.runs.filter(run => run.kind === 'build' && run.repairOf &&
    run.planDigest === record.approvedDigest && run.scopeDigest === record.scopeDigest).length ?? 0) >= MAX_REVIEW_REPAIRS;
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
      <span role="status" className="status">{run ? runStatus(run) : 'Not started'}</span>
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
      {record && <RunInsights record={record} />}
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
        {!active && record?.automationError && run.kind !== 'review' && <StartTaskButton item={item} pin={pin} disabled={busy} />}
        {!active && approved && run.kind === 'review' && run.status === 'finished' && run.reviewResult?.verdict !== 'passed' &&
          <Button size="sm" disabled={busy || repairLimitReached || !run.output.trim()} onClick={() => void start('build')}>
            Return to Build with findings
          </Button>}
        {!active && !record?.automatic && !record?.automationError && run.status === 'finished' && run.kind === 'investigate' &&
          <Button size="sm" disabled={busy} onClick={() => void start('plan')}>Generate plan</Button>}
        {!active && approved && run.kind !== 'review' && (!record?.automatic || run.kind === 'build') &&
          !['needs_input', 'blocked'].includes(run.buildResult?.verdict ?? '') &&
          <Button size="sm" disabled={busy} onClick={() => void start(run.kind === 'build' && run.status === 'finished' ? 'review' : 'build')}>
            {run.kind === 'build' && run.status === 'finished' ? 'Start review' : 'Start build'}
          </Button>}
      </div>
      {(run.environmentId || plan || run.steps.length > 0 || run.changedFiles.length > 0 ||
        run.checks.length > 0 || run.output) && <details className="tb-agent-details mt-3">
        <summary className="cursor-pointer text-xs">Workspace and plan</summary>
        <div className="mt-2 text-xs">
          <p>{record?.stage} · {run.environmentId ?? 'Workspace pending'}
            {plan ? ` · Plan r${plan.revision} ${approved ? 'approved' : 'unapproved'}` : ''}</p>
          {plan && record?.automatic && <details className="mt-3">
            <summary className="cursor-pointer">Implementation plan · revision {plan.revision}</summary>
            <div className="mt-2 max-h-96 overflow-auto"><Markdown content={plan.body} /></div>
          </details>}
        </div>
      </details>}
      {!active && (!record?.automatic || (record.automationError && run.kind === 'review')) && <details className="mt-4" open={editing}>
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
      {run.repairOf && ['starting', 'running'].includes(run.status) &&
        <p className="notice">Addressing review findings in the Build workspace. Review will run again automatically.</p>}
      {run.status === 'finished' && run.kind === 'build' && !run.repairOf && !['needs_input', 'blocked'].includes(run.buildResult?.verdict ?? '') &&
        <p className="notice">Build turn finished. Start review to check the implementation.</p>}
      {run.status === 'finished' && run.kind === 'build' && ['needs_input', 'blocked'].includes(run.buildResult?.verdict ?? '') &&
        <p className="notice">Build has not completed the implementation. Open the Build session to resolve its reported blocker.</p>}
      {run.status === 'finished' && run.kind === 'review' &&
        <p className="notice">{run.reviewResult?.verdict === 'blocked'
          ? repairLimitReached ? 'Review still found blockers after two repair attempts. Inspect the findings and revise the plan.'
            : record?.automatic && !record.automationError ? 'Review found blockers. Returning to Build with the findings automatically.'
            : 'Review found blockers. Return to Build with the findings to continue.'
          : run.reviewResult?.verdict === 'passed' ? 'Review passed. Work acceptance is still pending.'
          : 'Review did not establish a verdict. Inspect its findings or return to Build.'}</p>}
    </>}
  </section>;
}
