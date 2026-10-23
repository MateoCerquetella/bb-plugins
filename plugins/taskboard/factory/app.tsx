import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Markdown, useBbContext, useBbNavigate, useRealtime, useRpc, useSettings } from '@get-bb/plugin-sdk/app';
import type { TaskboardRpcContract, WorkItem } from '../contract.js';
import type { FactoryExecution, FactoryProjectStatus, FactoryRecord, FactoryRun, FactoryRunKind } from './contract.js';
import type { EmpiricalObservation } from '../empirical/contract.js';
import { Button } from '../components/ui/button.js';
import { Icon } from '../components/ui/icon.js';
import { Textarea } from '../components/ui/textarea.js';
import { Input } from '../components/ui/input.js';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog.js';
import { originalTicketPath, requestTaskboardOpen, ticketThreadId } from './navigation.js';
import { ErrorNotice } from './error-notice.js';
import { ExecutionPicker } from './execution-picker.js';
import { FactoryRoom } from './room.js';
import { consoleState, runStatus, stageLabels as labels } from './console-state.js';

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

function FactoryWorkbench({ record, onRecord, actions, plan, item }: {
  record: FactoryRecord; onRecord: (record: FactoryRecord) => void; actions?: ReactNode; plan?: ReactNode;
  item?: WorkItem;
}) {
  const rpc = useRpc<TaskboardRpcContract>();
  const navigate = useBbNavigate();
  const identity = JSON.stringify([record.projectId, record.source, record.locator]);
  const [recovery, setRecovery] = useState({ identity, threadId: '' });
  const recoveryId = recovery.identity === identity ? recovery.threadId : '';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [projectSnapshot, setProjectSnapshot] = useState<{ identity: string; status: FactoryProjectStatus } | null>(null);
  const [policyError, setPolicyError] = useState<{ identity: string; message: string } | null>(null);
  const projectRequest = useRef(0);
  const pending = useRef(false);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const loadProjectStatus = useCallback(async () => {
    const request = ++projectRequest.current;
    try {
      const result = await rpc.call('factoryGetProject', { projectId: record.projectId });
      if (request !== projectRequest.current || currentIdentity.current !== identity) return;
      setProjectSnapshot({ identity, status: result.status });
      setPolicyError(null);
    } catch (reason) {
      if (request !== projectRequest.current || currentIdentity.current !== identity) return;
      setPolicyError({ identity, message: reason instanceof Error ? reason.message : String(reason) });
    }
  }, [identity, record.projectId, rpc]);
  useEffect(() => {
    setError(null);
    void loadProjectStatus();
    return () => { projectRequest.current++; };
  }, [loadProjectStatus]);
  useRealtime('taskboard:factory', () => void loadProjectStatus());
  const projectStatus = projectSnapshot?.identity === identity ? projectSnapshot.status : null;
  const coordinator = record.coordinator;
  const current = consoleState(record);
  const policyBlocker = record.admission.kind !== 'factory' ? null
    : projectStatus?.kind === 'disabled' || projectStatus?.kind === 'paused' && !projectStatus.policy.enabled
      ? 'Factory paused. Existing sessions remain available, but no new automatic stage will start.'
      : projectStatus?.kind === 'paused' && projectStatus.policy.enabled
        ? 'Automatic intake is enabled and awaiting its first provider scan.'
        : null;
  const blocker = record.automationError ??
    (coordinator && 'error' in coordinator ? coordinator.error : null) ?? policyBlocker;
  const coordinatorStatus = !coordinator ? 'Legacy sessions' : coordinator.status === 'ready'
    ? coordinator.error ? 'Unavailable' : coordinator.nativeStatus
    : coordinator.status === 'uncertain' ? 'Needs recovery' : coordinator.status;
  const input = { projectId: record.projectId, source: record.source, locator: record.locator,
    expectedVersion: record.version };
  async function act(operation: () => Promise<{ record: FactoryRecord }>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      const result = await operation();
      if (currentIdentity.current === identity) onRecord(result.record);
    } catch (reason) {
      if (currentIdentity.current === identity) setError(reason instanceof Error ? reason.message : String(reason));
    } finally { pending.current = false; setBusy(false); }
  }
  function openThread(threadId: string) {
    requestTaskboardOpen(threadId); navigate.toThread(threadId);
  }
  const policyExecution = projectSnapshot?.identity === identity
    ? projectSnapshot.status.policy.execution : null;
  async function saveExecution(execution: FactoryRecord['execution']) {
    if (aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    setAiNote(null);
    try {
      const result = await rpc.call('factorySetExecution', {
        projectId: record.projectId, source: record.source, locator: record.locator,
        expectedVersion: record.version, execution
      });
      onRecord(result.record);
      setAiNote(execution ? 'AI saved for this ticket.' : 'Using the project default AI.');
    } catch (reason) {
      setAiError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setAiBusy(false);
    }
  }
  const aiNode = <>
    <span className="tb-room-ai-label">AI for this ticket</span>
    <ExecutionPicker
      projectId={record.projectId}
      value={record.execution}
      fallback={policyExecution}
      onChange={saveExecution}
      disabled={aiBusy}
      showSummary={false}
    />
    {aiBusy ? <span role="status" className="tb-room-caption">Saving AI…</span> : null}
    {aiNote ? <span role="status" className="tb-room-caption">{aiNote}</span> : null}
    {aiError ? <ErrorNotice title="AI could not be saved"
      nextStep="Refresh the ticket and try again. The previous AI choice is still in effect."
      detail={aiError} /> : null}
  </>;
  const notices = <>
    {blocker && <p role="status" className="tb-factory-blocker" data-team-blocker><Icon name="AlertCircle" className="size-4 shrink-0" />{blocker}</p>}
    {current.run?.error && <ErrorNotice
      title={`${labels[current.run.kind]} ${current.run.status === 'uncertain' ? 'needs recovery' : current.run.status === 'failed' ? 'could not finish' : 'progress is unavailable'}`}
      nextStep={current.run.status === 'uncertain' ? 'Confirm the native session before linking it. Do not start duplicate work.' : 'Inspect the current attempt and its recovery action.'}
      detail={current.run.error} />}
    {policyError?.identity === identity && <ErrorNotice title="Factory policy unavailable"
      nextStep="Refresh the ticket before relying on its automatic intake state." detail={policyError.message} />}
  </>;
  const workspaceNode = <>
    {error && <ErrorNotice title="Coordinator action failed" nextStep="Refresh the ticket and inspect its coordinator before trying again." detail={error} />}
    {coordinator ? <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border py-2" data-team-role="coordinator">
      <strong className="min-w-0 break-words text-xs">Coordinator</strong>
      <span className="text-xs text-muted-foreground">{coordinatorStatus}</span>
      {coordinator.status === 'ready' && <Button variant="ghost" size="sm" className="basis-full justify-start sm:ml-auto sm:basis-auto"
        aria-label="Open coordinator thread" onClick={() => openThread(coordinator.threadId)}>
        <Icon name="MessageCirclePlus" className="size-3.5" />Open thread
      </Button>}
      {coordinator.status === 'failed' && <Button variant="outline" size="sm" className="basis-full justify-start sm:ml-auto sm:basis-auto" disabled={busy}
        onClick={() => void act(() => rpc.call('factoryRetryCoordinator', { ...input, intentId: coordinator.intentId }))}>
        <Icon name="RotateCcw" className="size-3.5" />Retry coordinator
      </Button>}
      {coordinator.status === 'uncertain' && <div className="w-full min-w-0 space-y-2">
        <p className="break-words text-xs">Coordinator creation could not be confirmed. Link the existing thread.</p>
        <Input aria-label="Recovered coordinator thread ID" value={recoveryId}
          onChange={event => setRecovery({ identity, threadId: event.target.value })} />
        <Button variant="outline" size="sm" disabled={busy || !recoveryId.trim()}
          onClick={() => void act(() => rpc.call('factoryRecoverCoordinator', {
            ...input, intentId: coordinator.intentId, threadId: recoveryId.trim()
          }))}><Icon name="ExternalLink" className="size-3.5" />Link coordinator</Button>
      </div>}
    </div> : <div className="flex flex-wrap items-center gap-2 border-b border-border py-2">
      <strong className="text-xs">Legacy sessions</strong>
      <Button variant="outline" size="sm" disabled={busy}
        onClick={() => void act(() => rpc.call('factoryAdoptCoordinator', input))}>
        <Icon name="Plus" className="size-3.5" />Add coordinator
      </Button>
    </div>}
    <dl className="tb-workspace-facts">
      <div><dt>Workspace</dt><dd>{current.run?.environmentId ?? 'Not assigned'}</dd></div>
      <div><dt>Stage sessions</dt><dd>{record.runs.length}</dd></div>
      <div><dt>Updated</dt><dd>{new Date(record.updatedAt).toLocaleString()}</dd></div>
    </dl>
    <EmpiricalProgress record={record} />
  </>;
  return <section className="min-w-0" aria-label="Factory workbench" data-factory-team>
    <FactoryRoom record={record} actions={actions} plan={plan} workspace={workspaceNode} ai={aiNode} notices={notices} />
  </section>;

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
  if (!record) return null;
  const completed = run?.steps.filter(step => step.status === 'completed').length ?? 0;
  const headerStatus = error ? 'Refresh failed' : record.automationError ? 'Paused' :
    run?.status === 'running' && run.steps.length ? `${completed}/${run.steps.length}` : run ? runStatus(run) : 'Coordinator pending';
  const role = run ? labels[run.kind] : 'Coordinator';
  return <>
    <span title={`${role}: ${error ?? record.automationError ?? run?.error ?? run?.activity ?? headerStatus}`}><Button size="sm" variant="ghost" className={`tb-progress-trigger ${isCompactViewport ? 'size-7 p-0' : 'max-w-48'}`}
      data-tone={error || record.automationError ? 'attention' : run ? tone(run) : 'neutral'}
      aria-label={`Task progress: ${role}, ${headerStatus}`} onClick={() => setOpen(true)}>
      <Icon name={error || record.automationError || run && (tone(run) === 'attention' || tone(run) === 'failed') ? 'AlertCircle' : 'AiContentGenerator01'} className="size-3.5 shrink-0" />
      {!isCompactViewport && <span className="truncate">{role} · {headerStatus}</span>}
    </Button></span>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="tb-progress-ui max-h-[80vh] overflow-y-auto">
      <DialogTitle>Task progress</DialogTitle>
      <DialogDescription>{record.stage} · Updated {new Date(record.updatedAt).toLocaleTimeString()}</DialogDescription>
      {error && <ErrorNotice title="Progress could not refresh" nextStep="The last known progress is shown. Refresh will be retried automatically." detail={error} />}
      <FactoryWorkbench record={record} onRecord={setRecord}
        actions={run && consoleState(record).action === 'continue-build' ? <ContinueBuild run={run} record={record} /> : null}
        plan={record.plans.at(-1) ? <Markdown content={record.plans.at(-1)!.body} /> : undefined} />
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

export function StartTaskButton({ item, disabled = false }: {
  item: WorkItem; disabled?: boolean;
}) {
  const rpc = useRpc<TaskboardRpcContract>();
  const navigate = useBbNavigate();
  const context = useBbContext();
  const [open, setOpen] = useState(false);
  const [execution, setExecution] = useState<FactoryExecution | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const executionTouched = useRef(false);
  const pending = useRef(false);
  async function start() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      const { record } = await rpc.call('factoryStartTask', {
        projectId: item.bbProjectId, source: item.source, locator: item.locator,
        contextThreadId: context.projectId === item.bbProjectId ? context.threadId : null,
        execution
      });
      setOpen(false);
      const run = record.runs.at(-1);
      const threadId = ticketThreadId(record);
      if (threadId) { requestTaskboardOpen(threadId); navigate.toThread(threadId); }
      setError(record.automationError ?? run?.error ??
        (record.trackerProgress.status === 'failed' ? record.trackerProgress.message : null));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="tb-start-task">
    <Button size="sm" variant="outline" disabled={disabled || busy}
      onClick={event => {
        event.stopPropagation();
        executionTouched.current = false;
        setExecution(null);
        setOpen(true);
      }}>
      <Icon name="AiContentGenerator01" className="size-3.5" />{busy ? 'Starting...' : 'Start task'}
    </Button>
    <Dialog open={open} onOpenChange={next => { if (!busy) setOpen(next); }}>
      <DialogContent className="max-w-md" onClick={event => event.stopPropagation()}>
        <DialogTitle>Start task</DialogTitle>
        <DialogDescription>Choose the AI for this task before starting work.</DialogDescription>
        <ExecutionPicker
          projectId={item.bbProjectId}
          value={execution}
          onChange={next => { executionTouched.current = true; setExecution(next); }}
          threadId={context.projectId === item.bbProjectId ? context.threadId : null}
          disabled={busy}
          showSummary
          summaryTitle="AI for this task"
          compact
          defaultsLabel={context.projectId === item.bbProjectId ? 'Thread default' : 'Project default'}
          resetLabel={context.projectId === item.bbProjectId ? 'Use thread defaults' : 'Use project defaults'}
          onDefaults={defaults => {
            if (!executionTouched.current) setExecution(defaults);
          }}
        />
        {error && <ErrorNotice title="Task needs attention" nextStep="Inspect Agent progress before starting again; a session may already exist." detail={error} />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" disabled={disabled || busy || !execution} aria-busy={busy}
            onClick={() => void start()}>
            <Icon name={busy ? 'Loading' : 'AiContentGenerator01'} className="size-3.5" />
            {busy ? 'Starting...' : 'Start task'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    {!open && error && <ErrorNotice title="Task needs attention" nextStep="Inspect Agent progress before starting again; a session may already exist." detail={error} />}
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
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
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
  const state = record ? consoleState(record) : null;
  const run = state?.run;
  const plan = state?.plan;
  const active = state?.active;
  const approved = state?.approved;
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
  const primaryAction = state?.action ?? (!record ? 'start-task' : null);
  const actions = <>
    {primaryAction === 'retry-status' && <Button variant="outline" size="sm" disabled={busy} onClick={() => void action(() =>
      rpc.call('factoryRetryStatus', identity)
    )}><Icon name="RotateCcw" className="size-3.5" />Retry status update</Button>}
    {primaryAction === 'start-task' && <StartTaskButton item={item} disabled={!loaded || busy || ['done', 'canceled'].includes(item.stateCategory)} />}
    {primaryAction === 'continue-build' && run && record && <ContinueBuild key={run.id} run={run} record={record} />}
    {primaryAction === 'retry' && run && <Button size="sm" disabled={busy} onClick={() => void start(run.kind, true)}>
      <Icon name="RotateCcw" className="size-3.5" />Retry {labels[run.kind].toLowerCase()}
    </Button>}
    {primaryAction === 'return-build' && run && <Button size="sm" disabled={busy || state?.repairLimitReached || !run.output.trim()}
      onClick={() => void start('build')}><Icon name="ChevronLeft" className="size-3.5" />Return to Build with findings</Button>}
    {primaryAction === 'generate-plan' && <Button size="sm" disabled={busy} onClick={() => void start('plan')}>
      <Icon name="FileText" className="size-3.5" />Generate plan</Button>}
    {primaryAction === 'start-build' && <Button size="sm" disabled={busy} onClick={() => void start('build')}>
      <Icon name="Play" className="size-3.5" />Start build</Button>}
    {primaryAction === 'start-review' && <Button size="sm" disabled={busy} onClick={() => void start('review')}>
      <Icon name="Play" className="size-3.5" />Start review</Button>}
    {primaryAction === 'approve-plan' && plan && record && <Button size="sm"
      disabled={busy || editing && body.trim() !== plan.body} onClick={() => void action(() => rpc.call('factoryApprovePlan', {
        ...identity, expectedVersion: record.version, digest: plan.digest
      }))}><Icon name="Check" className="size-3.5" />Approve revision {plan.revision}</Button>}
    {primaryAction === 'recover' && run && record && <div className="tb-stage-recovery">
      <Input aria-label="Recovered native thread ID" placeholder="Native thread ID" value={recoveryId} onChange={e => setRecoveryId(e.target.value)} />
      <Button size="sm" variant="outline" disabled={busy || !(run.threadId || recoveryId.trim())} onClick={() => void action(() =>
        rpc.call('factoryRecover', { ...identity, expectedVersion: record.version, threadId: run.threadId ?? recoveryId.trim() })
      )}><Icon name="ExternalLink" className="size-3.5" />Link recovered session</Button>
    </div>}
  </>;
  const planContent = <>
    <div className="tb-plan-heading"><h3>Implementation plan</h3>
      {plan && <span className="tb-run-caption">Revision {plan.revision} · {approved ? 'Approved' : 'Unapproved'}</span>}
    </div>
    {plan ? <div className="tb-plan-body"><Markdown content={plan.body} /></div>
      : <p className="tb-run-caption">No saved plan yet.</p>}
    {record && run && !active && (!record.automatic || (record.automationError && run.kind === 'review')) &&
      <details className="tb-plan-editor" open={editing}>
        <summary onClick={event => {
          event.preventDefault();
          if (!editing) setBody(plan?.body ?? (run.kind === 'plan' ? run.output : ''));
          setEditing(!editing);
        }}>Edit implementation plan</summary>
        <div className="mt-2 space-y-2">
          <Textarea aria-label="Implementation plan" value={body} onChange={e => setBody(e.target.value)} rows={8} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy || !body.trim()} onClick={() => void action(() => rpc.call('factorySavePlan', {
              ...identity, expectedVersion: record.version, body
            }))}><Icon name="Check" className="size-3.5" />Save revision</Button>
            {plan && !approved && primaryAction !== 'approve-plan' && <Button size="sm" disabled={busy || body.trim() !== plan.body}
              onClick={() => void action(() => rpc.call('factoryApprovePlan', {
                ...identity, expectedVersion: record.version, digest: plan.digest
              }))}>Approve revision {plan.revision}</Button>}
          </div>
        </div>
      </details>}
  </>;
  return <section className="tb-agent-progress tb-progress-ui" data-tone={record?.automationError ? 'attention' : run ? tone(run) : 'neutral'} aria-label="Agent progress">
    {error && error !== run?.error && error !== record?.automationError && <ErrorNotice title="Task action failed" nextStep="Inspect the current progress before trying the action again." detail={error} />}
    {record?.trackerProgress.message && <div className="mb-3 text-xs">
      {record.trackerProgress.status === 'failed'
        ? <ErrorNotice title="Tracker status could not update" nextStep="Retry the status update. This does not restart the agent session." detail={record.trackerProgress.message} />
        : <p role="status" className="break-words">{record.trackerProgress.message}</p>}
    </div>}
    {record ? <FactoryWorkbench record={record} onRecord={setRecord} actions={actions} plan={planContent} item={item} />
      : <div className="tb-factory-summary"><div className="tb-factory-summary-copy">
        <span className="tb-factory-eyebrow">Software factory</span><h2>{loaded ? 'Ready to start' : 'Loading factory'}</h2>
        <p>{loaded ? 'No agent work has started for this ticket.' : 'Reading the latest work state.'}</p>
      </div><div className="tb-factory-primary">{actions}</div></div>}
  </section>;
}
