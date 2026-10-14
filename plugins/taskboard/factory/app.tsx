import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Markdown, experimental_Diff as Diff, useBbContext, useBbNavigate, useRealtime, useRpc, useSettings } from '@get-bb/plugin-sdk/app';
import type { TaskboardRpcContract, WorkItem } from '../contract.js';
import type { FactoryRecord, FactoryRun, FactoryRunKind } from './contract.js';
import { MAX_REVIEW_REPAIRS, readableResultOutput } from './review.js';
import type { EmpiricalObservation } from '../empirical/contract.js';
import { Button } from '../components/ui/button.js';
import { Icon } from '../components/ui/icon.js';
import { Textarea } from '../components/ui/textarea.js';
import { Input } from '../components/ui/input.js';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog.js';
import { originalTicketPath, requestTaskboardOpen } from './navigation.js';
import { ErrorNotice } from './error-notice.js';
import { ResultCard } from './result-card.js';

function tone(run: FactoryRun) {
  if (run.status === 'running' || run.status === 'starting') return 'active';
  if (run.status === 'failed') return 'failed';
  if (run.status === 'uncertain' || run.status === 'canceled' ||
    run.buildResult?.verdict === 'blocked' || run.buildResult?.verdict === 'needs_input' ||
    (run.kind === 'review' && run.status === 'finished' && run.reviewResult?.verdict !== 'passed')) return 'attention';
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

function ContinueBuild({ run, record }: { run: FactoryRun; record: FactoryRecord }) {
  const rpc = useRpc<TaskboardRpcContract>();
  const navigate = useBbNavigate();
  const context = useBbContext();
  const [continuing, setContinuing] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);
  const continuePending = useRef(false);
  async function continueBlockedBuild() {
    if (continuePending.current) return;
    continuePending.current = true;
    setContinuing(true);
    setContinueError(null);
    try {
      const result = await rpc.call('factoryStartTask', {
        projectId: record.projectId,
        source: record.source,
        locator: record.locator,
        contextThreadId: context.projectId === record.projectId ? context.threadId : null
      });
      const resumed = result.record.runs.at(-1);
      const failure = result.record.automationError ?? resumed?.error;
      if (failure) {
        setContinueError(failure);
        return;
      }
      if (!resumed?.threadId || !['starting', 'running'].includes(resumed.status)) {
        setContinueError('The Build session did not resume. Refresh progress and try again.');
        return;
      }
      navigate.toThread(resumed.threadId);
    } catch (reason) {
      setContinueError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      continuePending.current = false;
      setContinuing(false);
    }
  }
  return <div className="tb-current-recovery" aria-label="Current Build recovery">
    <Button size="sm" variant="outline" disabled={continuing} aria-busy={continuing} onClick={() => void continueBlockedBuild()}>
      <Icon name={continuing ? 'Loading' : 'MessageCirclePlus'} className="size-3.5" />
      {continuing ? 'Continuing...' : 'Continue in thread'}
    </Button>
    {continueError && continueError !== run.error && continueError !== record.automationError &&
      <ErrorNotice title="Build could not continue" nextStep="Inspect the technical details, then try Continue in thread again." detail={continueError} />}
  </div>;
}

function RunDetail({ run, record, historical = false }: { run: FactoryRun; record: FactoryRecord; historical?: boolean }) {
  const passed = run.checks.filter(check => check.exitCode === 0).length;
  const failed = run.checks.filter(check => check.exitCode !== null && check.exitCode !== 0).length;
  const unknown = run.checks.length - passed - failed;
  const live = tone(run) === 'active';
  return <section className="tb-run" data-tone={tone(run)} data-live={live} aria-label={`${labels[run.kind]} session details`}>
    <div className="tb-run-heading">
      <Icon name={live ? 'Loading' : tone(run) === 'attention' || tone(run) === 'failed' ? 'AlertCircle' : 'Circle'} className="tb-live-mark size-4" />
      <strong>{labels[run.kind]}</strong><span className="tb-run-status">{runStatus(run)}</span>
    </div>
    {run.error && <ErrorNotice title={`${labels[run.kind]} ${run.status === 'uncertain' ? 'needs recovery' : run.status === 'failed' ? 'could not finish' : 'progress is unavailable'}`}
      nextStep={run.status === 'uncertain' ? 'Confirm the native session before linking it. Do not start duplicate work.'
        : historical ? 'Inspect the technical details of this earlier run.'
        : run.status === 'failed' ? 'Inspect the technical details, then retry this stage from the original ticket.'
        : 'Progress refresh will retry automatically. Open the session to inspect its current state.'} detail={run.error} />}
    <div className="tb-run-now">{!run.error && <p key={run.activity} aria-live={live ? 'polite' : 'off'}>{run.activity}</p>}
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
    {!live && run.output && <details className="tb-run-disclosure"><summary>Stage result</summary>
      {run.buildResult && <ResultCard result={{ kind: 'build', verdict: run.buildResult.verdict, ...(run.buildResult.revision ? { revision: run.buildResult.revision } : {}) }} />}
      {run.reviewResult && <ResultCard result={{ kind: 'review', verdict: run.reviewResult.verdict }} />}
      <div className="max-h-96 overflow-auto break-words"><Markdown content={readableResultOutput(run.output)} /></div>
    </details>}
  </section>;
}

function RunInsights({ record }: { record: FactoryRecord }) {
  const run = record.runs.at(-1);
  const navigate = useBbNavigate();
  const selectorId = useId();
  const identity = JSON.stringify([record.projectId, record.source, record.locator]);
  const [selection, setSelection] = useState<{ identity: string; runId: string } | null>(null);
  const selected = selection?.identity === identity
    ? record.runs.find(candidate => candidate.id === selection.runId) ?? run : run;
  useEffect(() => {
    if (selection && (selection.identity !== identity ||
      !record.runs.some(candidate => candidate.id === selection.runId))) setSelection(null);
  }, [identity, record.runs, selection]);
  if (!run) return null;
  const canContinueBlockedBuild = run.kind === 'build' && run.status === 'finished' &&
    run.buildResult?.verdict === 'blocked' && !!run.threadId &&
    !record.runs.some(candidate => ['starting', 'running', 'uncertain'].includes(candidate.status));
  return <div className="tb-progress-ui">
    <ol className="tb-phase-track" aria-label="Work phases">{(Object.keys(labels) as FactoryRunKind[]).map(kind => {
      const previous = record.runs.some(candidate => candidate.kind === kind);
      return <li key={kind} data-current={run.kind === kind} data-observed={!!previous}
        aria-current={run.kind === kind ? 'step' : undefined}>{labels[kind]}</li>;
    })}</ol>
    {selected && <div className="tb-session-picker">
      <label htmlFor={selectorId}>Session<span className="sr-only"> for {record.locator}</span></label>
      <select id={selectorId} value={selected.id}
        onChange={event => setSelection({ identity, runId: event.target.value })}>
        {record.runs.map(candidate => {
          const attempt = record.runs.slice(0, record.runs.indexOf(candidate) + 1)
            .filter(prior => prior.kind === candidate.kind).length;
          return <option key={candidate.id} value={candidate.id}>
            {labels[candidate.kind]} {attempt} · {runStatus(candidate)}
          </option>;
        })}
      </select>
      <Button size="sm" variant={tone(selected) === 'attention' || tone(selected) === 'failed' ? 'outline' : 'ghost'}
        disabled={!selected.threadId} onClick={() => { if (selected.threadId) navigate.toThread(selected.threadId); }}>
        <Icon name="MessageCirclePlus" className="size-3.5" />Open session
      </Button>
    </div>}
    {selected && selected.id !== run.id && run.error && <ErrorNotice
      title={`${labels[run.kind]} ${run.status === 'uncertain' ? 'needs recovery' : run.status === 'failed' ? 'could not finish' : 'progress is unavailable'}`}
      nextStep={run.status === 'uncertain' ? 'Confirm the native session before linking it. Do not start duplicate work.'
        : 'Inspect the latest run and its available recovery action.'}
      detail={run.error} />}
    {selected && <RunDetail key={selected.id} run={selected} record={record} historical={selected.id !== run.id} />}
    {canContinueBlockedBuild && <ContinueBuild key={run.id} run={run} record={record} />}
  </div>;
}

function EmpiricalProgress({ record }: { record: FactoryRecord }) {
  const rpc = useRpc<TaskboardRpcContract>();
  const navigate = useBbNavigate();
  const [observation, setObservation] = useState<EmpiricalObservation | null>(null);
  const [lastGood, setLastGood] = useState<Extract<EmpiricalObservation, { kind: 'observation' }> | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    let canceled = false;
    let generation = 0;
    let refreshTimer = 0;
    setObservation(null); setLastGood(null); setFailure(null);
    const load = async () => {
      const request = ++generation;
      try {
        const next = await rpc.call('factoryEmpirical', {
          projectId: record.projectId, source: record.source, locator: record.locator
        });
        if (canceled || request !== generation) return;
        setObservation(next);
        setClock(Date.now());
        if (next.kind === 'observation' && next.status.kind !== 'unavailable') {
          setLastGood(next);
          setFailure(null);
        } else {
          if (next.kind === 'unbound') setLastGood(null);
          setFailure(next.kind === 'unbound' ? next.reason :
            next.status.kind === 'unavailable' ? next.status.reason : null);
        }
      } catch {
        if (!canceled && request === generation) {
          setFailure('Empirical observation could not be refreshed.'); setClock(Date.now());
        }
      } finally {
        if (!canceled && request === generation) refreshTimer = window.setTimeout(() => { void load(); }, 8000);
      }
    };
    void load();
    const clockInterval = window.setInterval(() => setClock(Date.now()), 1000);
    const refresh = () => {
      window.clearTimeout(refreshTimer);
      void load();
    };
    window.addEventListener('taskboard:empirical-refresh', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => {
      canceled = true; window.clearTimeout(refreshTimer); window.clearInterval(clockInterval);
      window.removeEventListener('taskboard:empirical-refresh', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [rpc, record.projectId, record.source, record.locator, record.runs.at(-1)?.environmentId]);
  useRealtime('taskboard:factory', () => window.dispatchEvent(new Event('taskboard:empirical-refresh')));
  const current = observation?.kind === 'observation' ? observation : null;
  const sameWorkspace = current && lastGood &&
    current.hostId === lastGood.hostId &&
    current.environmentId === lastGood.environmentId &&
    current.checkoutRoot === lastGood.checkoutRoot;
  const saved = current?.lastKnown;
  const retained = saved && current &&
    saved.hostId === current.hostId &&
    saved.environmentId === current.environmentId &&
    saved.checkoutRoot === current.checkoutRoot
    ? { ...current, observedAt: saved.observedAt, status: saved.status }
    : sameWorkspace || !current ? lastGood : null;
  const offline = !!failure || current?.status.kind === 'unavailable';
  const displayed = offline ? retained ?? current : current;
  const stale = offline || !!displayed && clock - displayed.observedAt > 20_000;
  const state = displayed?.status;
  const title = !observation && !failure ? 'Connecting' :
    state?.kind === 'invalid' ? 'Invalid source' :
    state?.kind === 'uninitialized' ? 'Not initialized' :
    stale ? 'Stale' :
    state?.kind === 'feature' ? `${state.phase} · r${state.revision}` :
    state?.kind === 'empty' ? 'No active feature' :
    'Unavailable';
  return <section className="tb-empirical-progress" aria-label="Empirical workflow" data-stale={stale}>
    <div className="tb-empirical-heading">
      <strong>Empirical</strong><span role="status">{title}</span>
      {displayed?.threadId && <Button size="sm" variant="ghost"
        onClick={() => navigate.toThread(displayed.threadId)}>
        <Icon name="MessageCirclePlus" className="size-3.5" />Open session
      </Button>}
    </div>
    {failure && <p role="status" className="tb-run-caption">{failure}{retained ? ' Last observation retained.' : ''}</p>}
    {state?.kind === 'feature' && <>
      <p className="tb-empirical-feature">{state.feature}</p>
      {state.ownership === 'conflict' && <div role="alert" className="tb-run-caption">
        Multiple worktrees claim this feature.
        <ul>{state.owners?.map(owner => <li key={owner}><code>{owner}</code></li>)}</ul>
      </div>}
      {state.mergedButUnclosed && <p role="status" className="tb-run-caption">Merged, but Empirical has not closed this feature.</p>}
      <dl className="tb-empirical-facts">
        <div><dt>Phase</dt><dd>{state.phase} · {state.status}</dd></div>
        <div><dt>Verification</dt><dd>{state.verification}</dd></div>
        <div><dt>Completion</dt><dd>{state.completionLevel}{state.completionMethod ? ` · ${state.completionMethod}` : ''}</dd></div>
      </dl>
      <p className="tb-run-caption">Next: {state.nextAction}</p>
    </>}
    {state?.kind === 'empty' && <p className="tb-run-caption">No Empirical feature is selected in this checkout.</p>}
    {state?.kind === 'uninitialized' && <p className="tb-run-caption">This checkout has no Empirical project.</p>}
    {state?.kind === 'invalid' && <p role="alert" className="tb-run-caption">{state.reason}</p>}
    {state?.kind === 'unavailable' && <p role="status" className="tb-run-caption">{state.reason}</p>}
    {displayed && <p className="tb-empirical-source" title={displayed.checkoutRoot}>
      {displayed.hostId} · {displayed.checkoutRoot} · observed {new Date(displayed.observedAt).toLocaleTimeString()}
    </p>}
  </section>;
}

function FactoryThreadProgressContent({ threadId, isCompactViewport }: { threadId: string; isCompactViewport: boolean }) {
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
      {error && <ErrorNotice title="Progress could not refresh" nextStep="The last known progress is shown. Refresh will be retried automatically." detail={error} />}
      {record.automationError && record.automationError !== run.error && <ErrorNotice title="Automatic work paused" nextStep="Inspect the latest run and open the original ticket for available recovery actions." detail={record.automationError} />}
      <EmpiricalProgress record={record} />
      <RunInsights record={record} />
      <OriginalTicket record={record} />
    </DialogContent></Dialog>
  </>;
}

export function FactoryThreadProgress(props: { threadId: string; isCompactViewport: boolean }) {
  const { values } = useSettings();
  return values?.showThreadHeaderProgress === false
    ? null
    : <FactoryThreadProgressContent {...props} />;
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
    {error && <ErrorNotice title="Task needs attention" nextStep="Inspect Agent progress before starting again; a session may already exist." detail={error} />}
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
    {error && error !== run?.error && error !== record?.automationError && <ErrorNotice title="Task action failed" nextStep="Inspect the current progress before trying the action again." detail={error} />}
    {record?.automationError && record.automationError !== run?.error && <ErrorNotice title="Automatic work paused" nextStep="Inspect the latest run and use its available recovery action." detail={record.automationError} />}
    {record?.trackerProgress.message && <div className="mb-3 text-xs">
      {record.trackerProgress.status === 'failed'
        ? <ErrorNotice title="Tracker status could not update" nextStep="Retry the status update. This does not restart the agent session." detail={record.trackerProgress.message} />
        : <p role="status" className="break-words">{record.trackerProgress.message}</p>}
      {record.trackerProgress.status === 'failed' && <Button variant="outline" size="sm" disabled={busy} onClick={() => void action(() =>
        rpc.call('factoryRetryStatus', identity)
      )}>Retry status update</Button>}
    </div>}
    {!run ? <StartTaskButton item={item} disabled={!loaded || busy || ['done', 'canceled'].includes(item.stateCategory)} /> : <>
      {record && <EmpiricalProgress record={record} />}
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
        {!active && approved && run.status === 'finished' && run.kind !== 'review' && (!record?.automatic || run.kind === 'build') &&
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
