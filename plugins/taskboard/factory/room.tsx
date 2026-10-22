import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Markdown, experimental_Diff as Diff, useBbNavigate, useRpc } from '@get-bb/plugin-sdk/app';
import type { TaskboardRpcContract } from '../contract.js';
import type { FactoryRecord, FactoryRun, FactoryRunKind } from './contract.js';
import { Button } from '../components/ui/button.js';
import { Icon } from '../components/ui/icon.js';
import { requestTaskboardOpen } from './navigation.js';
import { consoleState, runStatus, stageKinds, stageLabels } from './console-state.js';
import { readableResultOutput } from './review.js';

const timeOf = (run: FactoryRun | null) => run
  ? new Date(run.finishedAt ?? run.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  : '—';

function plain(text: string) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/[#>*_`]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function shortSummary(run: FactoryRun | null, limit = 230) {
  if (!run) return 'No stage has run yet.';
  const text = plain(readableResultOutput(run.output));
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text || run.activity;
}

function tone(run: FactoryRun | null) {
  if (!run) return 'waiting';
  if (run.status === 'failed' || run.status === 'uncertain') return 'failed';
  if (run.kind === 'review' && run.status === 'finished') {
    return run.reviewResult?.verdict === 'blocked' ? 'attention'
      : run.reviewResult?.verdict === 'passed' ? 'success' : 'attention';
  }
  if (run.buildResult?.verdict === 'blocked' || run.buildResult?.verdict === 'needs_input') return 'attention';
  if (run.status === 'starting' || run.status === 'running') return 'active';
  return 'success';
}

function checksOf(run: FactoryRun | null) {
  const checks = run?.checks ?? [];
  return {
    passed: checks.filter(check => check.exitCode === 0).length,
    failed: checks.filter(check => check.exitCode !== null && check.exitCode !== 0).length,
    unknown: checks.filter(check => check.exitCode === null).length
  };
}

function stageNote(kind: FactoryRunKind, run: FactoryRun | null, current: ReturnType<typeof consoleState>) {
  if (!run) return 'Waiting to start';
  if (kind === 'review') {
    const verdict = run.reviewResult?.verdict;
    if (verdict === 'passed') return 'Awaiting acceptance';
    if (verdict === 'blocked') return 'Blocked';
    return run.status === 'finished' ? 'Review finished' : runStatus(run);
  }
  if (kind === 'build') {
    const checks = checksOf(run);
    if (checks.failed) return `${checks.failed} checks failed`;
    if (run.changedFiles.length || checks.passed) return `${run.changedFiles.length} files · ${checks.passed} checks`;
    return run.status === 'finished' ? 'No files changed' : runStatus(run);
  }
  if (kind === 'plan') return current.approved ? 'Approved' : run.status === 'finished' ? 'Needs approval' : runStatus(run);
  return run.status === 'finished' ? 'Complete' : runStatus(run);
}

function stageProgressState(kind: FactoryRunKind, run: FactoryRun | null) {
  return kind === 'review' && run?.reviewResult?.verdict === 'passed' ? 'review' : tone(run);
}

function stageNode(state: string) {
  if (state === 'success') return <Icon name="Check" className="size-3" />;
  if (state === 'failed' || state === 'attention') return <Icon name="AlertCircle" className="size-3" />;
  if (state === 'review' || state === 'active') return <span className="tb-room-step-dot" />;
  return null;
}

function RunCommands({ run }: { run: FactoryRun }) {
  if (!run.checks.length) return null;
  const checks = checksOf(run);
  return <details className="tb-room-details tb-room-commands">
    <summary><span className="tb-room-detail-label"><Icon name="Terminal" className="size-3" />Commands executed</span> <span className="tb-room-caption">{run.checks.length} · {checks.passed} passed{checks.failed ? ` · ${checks.failed} failed` : ''}{checks.unknown ? ` · ${checks.unknown} unknown` : ''}</span></summary>
    <div className="tb-room-command-list">{run.checks.map(check => <div className="tb-room-command" key={check.id}>
      <span className={`tb-room-status tb-room-status-${check.exitCode === 0 ? 'success' : check.exitCode === null ? 'waiting' : 'failed'}`}>
        {check.exitCode === 0 ? 'Passed' : check.exitCode === null ? 'Unknown' : 'Failed'}
      </span>
      <code>{check.command}</code>
      {check.output ? <pre>{check.output.slice(-3000)}</pre> : null}
    </div>)}</div>
  </details>;
}

function StageDetail({ kind, run, attempts, onAttempt, title, summary = true, children, footer }: {
  kind: FactoryRunKind;
  run: FactoryRun | null;
  attempts: FactoryRun[];
  onAttempt: (id: string) => void;
  title: string;
  summary?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const navigate = useBbNavigate();
  return <section className="tb-room-focus" aria-label={`${stageLabels[kind]} stage`}>
    <div className="tb-room-focus-head">
      <div className="tb-room-focus-title">
        <h3>{title}</h3>
        {run ? <span className="tb-room-time">{timeOf(run)}</span> : null}
      </div>
      {run ? <div className="tb-room-focus-actions">
        {attempts.length > 1 ? <select className="tb-room-attempt" aria-label={`${title} attempt`}
          value={run.id} onChange={event => onAttempt(event.target.value)}>
          {attempts.map((attempt, index) => <option key={attempt.id} value={attempt.id}>
            Attempt {index + 1} · {runStatus(attempt)}
          </option>)}
        </select> : null}
        {run.threadId ? <button type="button" className="tb-room-link" onClick={() => {
          requestTaskboardOpen(run.threadId!); navigate.toThread(run.threadId!);
        }}>Open session ↗</button> : null}
      </div> : null}
    </div>
    {run?.error ? <p className="tb-room-error" role="alert">{run.error}</p> : null}
    {!run ? <p className="tb-room-empty">This stage has not started yet.</p> : <>
      {summary ? <p className="tb-room-focus-summary">{shortSummary(run, 220)}</p> : null}
      {children}
      <RunCommands run={run} />
    </>}
    {footer ? <div className="tb-room-focus-footer">{footer}</div> : null}
  </section>;
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
  return <details className="tb-room-details tb-run-disclosure" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><span className="tb-room-detail-label"><Icon name="FileText" className="size-3" />Changed files</span> <span className="tb-room-caption">{run.changedFiles.length}</span></summary>
    {open && <div className="tb-diff-workspace">
      <div className="tb-diff-toolbar">
        <div className="tb-diff-files" aria-label="Changed files">
          {run.changedFiles.map(file => <button type="button" key={file} aria-pressed={file === path}
            onClick={() => { if (file !== path) { setResult(null); setPath(file); } }}>
            <span>{file}</span>
          </button>)}
        </div>
        <span title="Refresh diff"><Button size="sm" variant="ghost" aria-label="Refresh diff" onClick={() => setRefresh(value => value + 1)}>
          Refresh
        </Button></span>
      </div>
      <p className="tb-room-caption">Current workspace diff{counts && <>
        {' · '}<span className="tb-check-pass">+{counts.additions} added</span>
        {' · '}<span className="tb-check-fail">-{counts.deletions} removed</span>
        {result?.truncated ? ' (shown portion)' : ''}
      </>}</p>
      {error ? <p role="alert">{error}</p> : !result ? <p role="status">Loading diff...</p> :
        <>
          {result.truncated && <p role="status">Partial diff: this file exceeds the preview limit.</p>}
          {result.patch ? <div className="tb-diff-body"><Diff patch={result.patch} path={path} view="unified" overflow="scroll" /></div>
            : <p role="status" className="tb-room-caption">{result.message}</p>}
        </>}
    </div>}
  </details>;
}

function ReviewEvidence({ run, build, record, approvals }: {
  run: FactoryRun | null;
  build: FactoryRun | null;
  record: FactoryRecord;
  approvals: { approved: boolean; digest: string | null };
}) {
  if (!run) return <p className="tb-room-empty">Review has not started yet.</p>;
  const findings = run.reviewResult?.findings?.trim() || readableResultOutput(run.output).trim();
  const checks = checksOf(run);
  const total = run.checks.length;
  const changed = build?.changedFiles ?? [];
  return <div className="tb-room-review">
    <div className="tb-room-review-metrics">
      <div className="tb-room-metric"><span>Checks</span><b>{checks.passed}<small> / {total}</small></b></div>
      <div className={`tb-room-metric${checks.failed ? ' is-bad' : ''}`}><span>Failed</span><b>{checks.failed}</b></div>
      <div className="tb-room-metric"><span>Files</span><b>{changed.length}</b></div>
      <div className="tb-room-metric"><span>Plan</span><b>{approvals.approved ? <>Approved{approvals.digest ? <small> · {approvals.digest.slice(0, 6)}</small> : null}</> : 'Unapproved'}</b></div>
    </div>
    {total ? <div className="tb-room-check-meter" role="img"
      aria-label={`${checks.passed} of ${total} checks passed${checks.failed ? `, ${checks.failed} failed` : ''}`}>
      <span className="tb-room-check-pass" style={{ width: `${(checks.passed / total) * 100}%` }} />
      {checks.failed ? <span className="tb-room-check-fail" style={{ width: `${(checks.failed / total) * 100}%` }} /> : null}
    </div> : null}
    <details className="tb-room-details">
      <summary><span className="tb-room-detail-label"><Icon name="Eye" className="size-3" />Validation evidence</span> <span className="tb-room-caption">{/!\[[^\]]*\]\(/u.test(findings) ? 'Screenshots attached' : 'No screenshot capture attached'}</span></summary>
      <div className="tb-room-markdown"><Markdown content={findings || 'No review findings recorded.'} /></div>
    </details>
    {build && changed.length ? <ChangedFiles record={record} run={build} /> : null}
  </div>;
}

export function FactoryRoom({ record, actions, plan, workspace, ai, notices }: {
  record: FactoryRecord;
  actions?: ReactNode;
  plan?: ReactNode;
  workspace?: ReactNode;
  ai?: ReactNode;
  notices?: ReactNode;
}) {
  const current = consoleState(record);
  const latest = useMemo(() => Object.fromEntries(stageKinds.map(kind =>
    [kind, record.runs.filter(run => run.kind === kind).at(-1) ?? null])) as Record<FactoryRunKind, FactoryRun | null>,
  [record.runs]);
  const attempts = useMemo(() => Object.fromEntries(stageKinds.map(kind =>
    [kind, record.runs.filter(run => run.kind === kind)])) as Record<FactoryRunKind, FactoryRun[]>,
  [record.runs]);
  const [selected, setSelected] = useState<Partial<Record<FactoryRunKind, string>>>({});
  const selectedRun = (kind: FactoryRunKind) =>
    attempts[kind].find(run => run.id === selected[kind]) ?? latest[kind];
  const [active, setActive] = useState<FactoryRunKind>(
    latest.review ? 'review' : current.run?.kind ?? 'investigate');
  const coordinatorStatus = !record.coordinator ? 'Legacy'
    : record.coordinator.status === 'ready' ? (record.coordinator.error ? 'Unavailable' : record.coordinator.nativeStatus)
    : record.coordinator.status === 'uncertain' ? 'Needs recovery' : record.coordinator.status;
  const coordinatorTone = !record.coordinator ? 'waiting'
    : record.coordinator.status === 'ready' && !record.coordinator.error ? 'success'
    : record.coordinator.status === 'failed' || record.coordinator.status === 'uncertain' ? 'failed' : 'active';
  const focus = (kind: FactoryRunKind) => setActive(kind);
  const currentStatus = current.run ? runStatus(current.run) : '';
  const currentNote = currentStatus && current.summary.startsWith(currentStatus)
    ? current.summary.slice(currentStatus.length).replace(/^[.\s·-]+/u, '')
    : current.summary;
  const progressDone = stageKinds.filter(kind => {
    const run = latest[kind];
    if (!run) return false;
    if (kind === 'review' && run.reviewResult?.verdict === 'passed') return false;
    return tone(run) === 'success';
  }).length;
  const build = selectedRun('build');
  const review = selectedRun('review');
  const activeRun = selectedRun(active);
  const focusTitle = active === 'review' ? 'Review evidence'
    : active === 'build' ? 'Build output'
    : active === 'plan' ? 'Plan' : 'Investigation';
  const workspaceDetails = workspace ? <details className="tb-room-details tb-room-workspace" open={!!record.automationError}>
    <summary><span className="tb-room-detail-label"><Icon name="Layers" className="size-3" />Coordinator and workspace</span> <span className={`tb-room-status tb-room-status-${coordinatorTone}`}>{coordinatorStatus}</span></summary>
    {workspace}
  </details> : null;
  return <section className="tb-room" aria-label="Software factory">
    <header className="tb-room-head">
      <div className="tb-room-state">
        <span className="tb-room-kicker">Software factory · {record.automatic ? 'Automatic' : 'Manual'}</span>
        <h2>{current.run ? `${stageLabels[current.run.kind]} · ${runStatus(current.run)}` : 'Ready to start'}</h2>
        {currentNote ? <p>{currentNote}</p> : null}
      </div>
      {actions ? <div className="tb-room-actions">{actions}</div> : null}
    </header>
    {ai ? <div className="tb-room-ai">{ai}</div> : null}
    {notices}
    <div className="tb-room-progress">
      <div className="tb-room-progress-head">
        <h3>Progress</h3>
        <span className="tb-room-caption">{progressDone} of {stageKinds.length} complete</span>
      </div>
      <ol className="tb-room-progress-steps" aria-label="Factory progress">
        {stageKinds.map(kind => {
          const run = latest[kind];
          const state = stageProgressState(kind, run);
          const note = stageNote(kind, run, current);
          return <li key={kind}>
            <button type="button" className="tb-room-step" data-state={state}
              data-selected={active === kind ? 'true' : 'false'}
              data-current={current.run?.kind === kind ? 'true' : 'false'}
              aria-current={current.run?.kind === kind ? 'step' : undefined}
              aria-pressed={active === kind}
              aria-label={`${stageLabels[kind]}: ${note}`}
              onClick={() => focus(kind)}>
              <span className="tb-room-step-head" aria-hidden="true">
                <span className="tb-room-step-node">{stageNode(state)}</span>
                <span className="tb-room-step-rail" />
              </span>
              <span className="tb-room-step-label">{stageLabels[kind]}</span>
              <span className="tb-room-step-note">{note}</span>
            </button>
          </li>;
        })}
      </ol>
    </div>
    <StageDetail kind={active} run={activeRun} attempts={attempts[active]}
      onAttempt={id => setSelected(value => ({ ...value, [active]: id }))}
      title={focusTitle} summary={active !== 'review'} footer={workspaceDetails}>
      {active === 'plan' ? (plan ? <details className="tb-room-details tb-room-plan" open={!current.approved}>
        <summary><span className="tb-room-detail-label"><Icon name="FileText" className="size-3" />Implementation plan {current.approved ? '· approved' : '· needs approval'}</span></summary>
        {plan}
      </details> : <p className="tb-room-caption">No saved plan yet.</p>) : null}
      {active === 'build' ? <>
        {build && (build.changedFiles.length || build.checks.length) ? <div className="tb-room-facts">
          <span><b>{build.changedFiles.length}</b> files changed</span>
          <span><b>{checksOf(build).passed}</b> checks passed</span>
          {checksOf(build).failed ? <span className="tb-room-fail"><b>{checksOf(build).failed}</b> failed</span> : null}
        </div> : null}
        {build && build.changedFiles.length ? <ChangedFiles record={record} run={build} /> : null}
      </> : null}
      {active === 'review' ? <ReviewEvidence run={review} build={build} record={record}
        approvals={{ approved: current.approved, digest: record.approvedDigest }} /> : null}
    </StageDetail>
  </section>;
}
