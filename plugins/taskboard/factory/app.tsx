import { useCallback, useEffect, useRef, useState } from 'react';
import { Markdown, experimental_Diff as Diff, useBbContext, useBbNavigate, useRealtime, useRpc } from '@get-bb/plugin-sdk/app';
import type { TaskboardRpcContract, WorkItem } from '../contract.js';
import type { FactoryRecord, FactoryRun, FactoryRunKind } from './contract.js';
import { MAX_REVIEW_REPAIRS } from './review.js';
import { Button } from '../components/ui/button.js';
import { Icon } from '../components/ui/icon.js';
import { Textarea } from '../components/ui/textarea.js';
import { Input } from '../components/ui/input.js';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog.js';
import { originalTicketPath, requestTaskboardOpen } from './navigation.js';

function tone(run: FactoryRun) {
  if (run.status === 'failed') return 'failed';
  if (run.status === 'uncertain' || run.status === 'canceled' ||
    run.buildResult?.verdict === 'blocked' || run.buildResult?.verdict === 'needs_input' ||
    (run.kind === 'review' && run.status === 'finished' && run.reviewResult?.verdict !== 'passed')) return 'attention';
  if (run.status === 'running' || run.status === 'starting') return 'active';
  return run.reviewResult?.verdict === 'passed' ? 'success' : 'neutral';
}

function OriginalTicket({ record }: { record: FactoryRecord }) {
  const navigate = useBbNavigate();
  return <Button type="button" size="sm" variant="outline" onClick={() =>
    navigate.toPluginPanel('tasks', { subPath: originalTicketPath(record) })
  }><Icon name="FileText" className="size-3.5" />Original ticket</Button>;
}

function ChangedFiles({ record, run }: { record: FactoryRecord; run: FactoryRun }) {
  const rpc = useRpc<TaskboardRpcContract>();
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState(run.changedFiles[0] ?? '');
  const [result, setResult] = useState<{ patch: string | null; message: string | null; truncated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const counts = result?.patch ? result.patch.split('\n').reduce((total, line) => {
    if (line.startsWith('@@')) total.inHunk = true;
    else if (line.startsWith('diff --git')) total.inHunk = false;
    else if (total.inHunk && line.startsWith('+')) total.additions++;
    else if (total.inHunk && line.startsWith('-')) total.deletions++;
    return total;
  }, { additions: 0, deletions: 0, inHunk: false }) : null;
  useEffect(() => {
    if (!open || !path) return;
    let canceled = false;
    setResult(null); setError(null);
    void rpc.call('factoryDiff', {
      projectId: record.projectId, source: record.source, locator: record.locator, runId: run.id, path
    }).then(value => { if (!canceled) setResult(value); })
      .catch(reason => { if (!canceled) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { canceled = true; };
  }, [rpc, record.projectId, record.source, record.locator, run.id, path, open, refresh]);
  return <details className="tb-run-disclosure" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><Icon name="FileDiff" className="size-3.5" />Changed files <span className="tb-run-caption">{run.changedFiles.length}</span></summary>
    {open && <div className="tb-diff-workspace">
      <div className="tb-diff-toolbar">
        <div className="tb-diff-files" aria-label="Changed files">
          {run.changedFiles.map(file => <button type="button" key={file} aria-pressed={file === path}
            onClick={() => { if (file !== path) { setResult(null); setPath(file); } }}>
            <Icon name="FileDiff" className="size-3.5 shrink-0" /><span>{file}</span>
          </button>)}
        </div>
        <span title="Refresh diff"><Button size="sm" variant="ghost" aria-label="Refresh diff" onClick={() => setRefresh(value => value + 1)}>
          <Icon name="RotateCcw" className="size-3.5" />
        </Button></span>
      </div>
      <p className="tb-run-caption">Current workspace diff{counts && <>
        {' · '}<span className="tb-check-pass">+{counts.additions} added</span>
        {' · '}<span className="tb-check-fail">-{counts.deletions} removed</span>
        {result?.truncated ? ' (shown portion)' : ''}
      </>}</p>
      {error ? <p role="alert">{error}</p> : !result ? <p role="status">Loading diff...</p> :
        <>
          {result.truncated && <p role="status">Partial diff: this file exceeds the preview limit.</p>}
          {result.patch ? <div className="tb-diff-body"><Diff patch={result.patch} path={path} view="unified" overflow="scroll" /></div>
            : <p role="status" className="tb-run-caption">{result.message}</p>}
        </>}
    </div>}
  </details>;
}

function RunDetail({ run, record, historical = false }: { run: FactoryRun; record: FactoryRecord; historical?: boolean }) {
  const navigate = useBbNavigate();
  const passed = run.checks.filter(check => check.exitCode === 0).length;
  const failed = run.checks.filter(check => check.exitCode !== null && check.exitCode !== 0).length;
  const unknown = run.checks.length - passed - failed;
  const live = !historical && tone(run) === 'active' && !record.automationError;
  const needsAttention = tone(run) === 'attention' || tone(run) === 'failed' || !!record.automationError;
  return <section className="tb-run" data-tone={tone(run)} data-live={live}>
    {!historical && <div className="tb-run-heading">
      <Icon name={live ? 'Loading' : tone(run) === 'attention' || tone(run) === 'failed' ? 'AlertCircle' : 'Circle'} className="tb-live-mark size-4" />
      <strong>{labels[run.kind]}</strong><span className="tb-run-status">{runStatus(run)}</span>
      {run.threadId && <span className="tb-session-action"><Button size="sm" variant={needsAttention ? 'outline' : 'ghost'} onClick={() => navigate.toThread(run.threadId!)}>
        <Icon name="MessageCirclePlus" className="size-3.5" />
        {needsAttention ? 'Continue in thread' : 'Open session'}
      </Button></span>}
    </div>}
    <div className="tb-run-now"><p key={run.activity} aria-live={live ? 'polite' : 'off'}>{run.error ?? run.activity}</p>
      <time dateTime={run.startedAt}>{new Date(run.startedAt).toLocaleString()}</time>
    </div>
    {run.steps.length > 0 && <div className="tb-run-steps">
      <p className="tb-run-caption">{run.steps.filter(step => step.status === 'completed').length} of {run.steps.length} steps completed</p>
      <ul>{run.steps.map((step, index) => <li key={index} data-step={step.status}>
        <Icon name={step.status === 'completed' ? 'CircleCheck' : step.status === 'active' ? 'ArrowRight' : 'Circle'} className="size-3.5 shrink-0" />
        <span>{step.step}<span className="sr-only"> ({step.status})</span></span>
      </li>)}</ul>
    </div>}
    {run.checks.length > 0 && <>
      <details className="tb-run-disclosure tb-command-group">
        <summary><Icon name="Terminal" className="size-3.5" />Commands <span className="tb-run-caption">{run.checks.length}</span>
          <span className="tb-command-counts">
            <span className="tb-check-pass" title="Passed">{passed} passed</span>
            <span className={failed ? 'tb-check-fail' : 'tb-run-caption'}>{failed} failed</span>
            {unknown > 0 && <span className="tb-run-caption">{unknown} unknown</span>}
          </span>
        </summary>
        <div className="tb-command-list">{[...run.checks].reverse().map(check => <details key={check.id} className="tb-command">
          <summary><Icon name={check.exitCode === 0 ? 'CircleCheck' : check.exitCode === null ? 'Clock' : 'AlertCircle'}
            className={`size-3.5 shrink-0 ${check.exitCode === 0 ? 'tb-check-pass' : check.exitCode === null ? '' : 'tb-check-fail'}`} />
            <code>{check.command}</code><span className="sr-only">{check.exitCode === 0 ? 'Passed' : check.exitCode === null ? 'Exit unknown' : `Failed (${check.exitCode})`}</span></summary>
          <pre>{check.output || 'No output recorded.'}</pre>
        </details>)}</div>
      </details>
    </>}
    {(run.updates ?? []).length > 0 && <details className="tb-run-disclosure">
      <summary><Icon name="MessageCirclePlus" className="size-3.5" />Agent updates <span className="tb-run-caption">{Math.min(3, run.updates.length)}</span></summary>
      {[...run.updates].reverse().slice(0, 3).map(update => <div className="tb-run-update" key={update.id}>
        <time>{new Date(update.at).toLocaleTimeString()}</time>
        <div className="max-h-48 overflow-auto break-words"><Markdown content={update.text} /></div>
      </div>)}
    </details>}
    {run.changedFiles.length > 0 && <ChangedFiles record={record} run={run} />}
    {run.output && <details className="tb-run-disclosure"><summary>Stage result</summary>
      <div className="max-h-96 overflow-auto break-words"><Markdown content={run.output} /></div>
    </details>}
    {historical && run.threadId && <Button size="sm" variant="ghost" onClick={() => navigate.toThread(run.threadId!)}>
      <Icon name="MessageCirclePlus" className="size-3.5" />Open session
    </Button>}
  </section>;
}

function RunInsights({ record }: { record: FactoryRecord }) {
  const run = record.runs.at(-1);
  if (!run) return null;
  return <div className="tb-progress-ui">
    <ol className="tb-phase-track" aria-label="Work phases">{(Object.keys(labels) as FactoryRunKind[]).map(kind => {
      const previous = record.runs.some(candidate => candidate.kind === kind);
      return <li key={kind} data-current={run.kind === kind} data-observed={!!previous}
        aria-current={run.kind === kind ? 'step' : undefined}>{labels[kind]}</li>;
    })}</ol>
    <RunDetail key={run.id} run={run} record={record} />
    {record.runs.length > 1 && <details className="tb-run-disclosure"><summary>Earlier runs <span className="tb-run-caption">{record.runs.length - 1}</span></summary>
      {[...record.runs].slice(0, -1).reverse().map(previous => <details key={previous.id} className="tb-run-disclosure tb-run-history" data-tone={tone(previous)}>
        <summary>{labels[previous.kind]} <span className="tb-run-status">{runStatus(previous)}</span>
          <time className="tb-run-caption">{new Date(previous.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        </summary>
        <RunDetail run={previous} record={record} historical />
      </details>)}
    </details>}
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
        if (!canceled) { setRecord(current => current && result.record && current.version > result.record.version ? current : result.record); setError(null); }
      } catch { if (!canceled) setError('Progress could not be refreshed.'); }
    };
    void load();
    const interval = window.setInterval(() => void load(), 3000);
    return () => { canceled = true; window.clearInterval(interval); };
  }, [rpc, threadId]);
  const run = record?.runs.at(-1);
  if (!record || !run) return null;
  const completed = run.steps.filter(step => step.status === 'completed').length;
  const headerStatus = error ? 'Refresh failed' : record.automationError ? 'Paused' :
    run.status === 'running' && run.steps.length ? `${completed}/${run.steps.length}` : runStatus(run);
  return <>
    <span title={`${labels[run.kind]}: ${error ?? record.automationError ?? run.error ?? run.activity}`}><Button size="sm" variant="ghost" className={`tb-progress-trigger ${isCompactViewport ? 'size-7 p-0' : 'max-w-48'}`}
      data-tone={error || record.automationError ? 'attention' : tone(run)}
      aria-label={`Task progress: ${labels[run.kind]}, ${headerStatus}`} onClick={() => setOpen(true)}>
      <Icon name={error || record.automationError || tone(run) === 'attention' || tone(run) === 'failed' ? 'AlertCircle' : 'AiContentGenerator01'} className="size-3.5 shrink-0" />
      {!isCompactViewport && <span className="truncate">{labels[run.kind]} · {headerStatus}</span>}
    </Button></span>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="tb-progress-ui max-h-[80vh] overflow-y-auto">
      <DialogTitle>Task progress</DialogTitle>
      <DialogDescription>{record.stage} · Updated {new Date(record.updatedAt).toLocaleTimeString()}</DialogDescription>
      {error && <p role="alert">{error}</p>}
      {record.automationError && <p role="alert">{record.automationError}</p>}
      <RunInsights record={record} />
      <OriginalTicket record={record} />
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
export function StartTaskButton({ item, disabled = false }: {
  item: WorkItem; disabled?: boolean;
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
      if (run?.threadId) { requestTaskboardOpen(run.threadId); navigate.toThread(run.threadId); }
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
export function FactoryProgress({ item }: { item: WorkItem }) {
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
      if (open && threadId) { requestTaskboardOpen(threadId); navigate.toThread(threadId); }
    } catch (e) {
      if (ticket === epoch.current) { setError(e instanceof Error ? e.message : String(e)); void load(); }
    } finally { if (ticket === epoch.current) setBusy(false); }
  }
  const start = (kind: FactoryRunKind, retry = false) => action(() => rpc.call('factoryStart', {
    ...identity, expectedVersion: record?.version ?? 0, kind, retry,
    contextThreadId: context.projectId === item.bbProjectId ? context.threadId : null
  }), true);
  return <section className="tb-agent-progress progress tb-progress-ui" data-tone={record?.automationError ? 'attention' : run ? tone(run) : 'neutral'} aria-label="Agent progress">
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
    {!run ? <StartTaskButton item={item} disabled={!loaded || busy || ['done', 'canceled'].includes(item.stateCategory)} /> : <>
      {record && <RunInsights record={record} />}
      {run.status === 'uncertain' && <div className="my-3 space-y-2">
        <Input aria-label="Recovered native thread ID" placeholder="Native thread ID" value={recoveryId} onChange={e => setRecoveryId(e.target.value)} />
        <Button size="sm" variant="outline" disabled={busy || !(run.threadId || recoveryId.trim())} onClick={() => void action(() =>
          rpc.call('factoryRecover', { ...identity, expectedVersion: record!.version, threadId: run.threadId ?? recoveryId.trim() })
        )}>Link recovered session</Button>
      </div>}
      <div className="mt-3 flex flex-wrap gap-2">
        {!active && (run.status === 'failed' || run.status === 'canceled') &&
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void start(run.kind, true)}>
            <Icon name="RotateCcw" className="size-3.5" />Retry {labels[run.kind].toLowerCase()}
          </Button>}
        {record && <OriginalTicket record={record} />}
        {!active && record?.automationError && run.kind !== 'review' && <StartTaskButton item={item} disabled={busy} />}
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
      {run.status === 'finished' && run.kind === 'build' && !run.threadId && ['needs_input', 'blocked'].includes(run.buildResult?.verdict ?? '') &&
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
