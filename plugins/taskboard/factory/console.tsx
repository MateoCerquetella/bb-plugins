import { useEffect, useId, useState, type ReactNode } from 'react';
import { useBbNavigate } from '@get-bb/plugin-sdk/app';
import type { FactoryRecord, FactoryRun } from './contract.js';
import { selectedRun, stageKinds, stageLabels, runStatus, type EvidenceView, type RunSelection } from './console-state.js';
import { Button } from '../components/ui/button.js';
import { Icon } from '../components/ui/icon.js';
import { requestTaskboardOpen } from './navigation.js';

const evidenceViews: { id: EvidenceView; label: string }[] = [
  { id: 'activity', label: 'Activity' }, { id: 'result', label: 'Result' },
  { id: 'changes', label: 'Changes' }, { id: 'plan', label: 'Plan' }, { id: 'workspace', label: 'Workspace' }
];

function stageTone(run: FactoryRun | undefined) {
  if (!run) return 'waiting';
  if (run.status === 'running' || run.status === 'starting') return 'active';
  if (run.status === 'failed') return 'failed';
  if (run.status === 'uncertain' || run.status === 'canceled' ||
    run.buildResult?.verdict === 'blocked' || run.buildResult?.verdict === 'needs_input' ||
    run.kind === 'review' && run.status === 'finished' && run.reviewResult?.verdict !== 'passed') return 'attention';
  return run.reviewResult?.verdict === 'passed' ? 'success' : 'complete';
}

export function FactoryConsole({ record, workspace, plan, renderRun }: {
  record: FactoryRecord;
  workspace: ReactNode;
  plan: ReactNode;
  renderRun: (run: FactoryRun, view: EvidenceView, historical: boolean) => ReactNode;
}) {
  const navigate = useBbNavigate();
  const id = useId();
  const [selection, setSelection] = useState<RunSelection>({ kind: 'follow-current' });
  const [view, setView] = useState<EvidenceView>('activity');
  const run = selectedRun(record, selection);
  const current = record.runs.at(-1);
  const stage = selection.kind === 'attempt' ? selection.stage : current?.kind ?? 'investigate';
  const attempts = record.runs.filter(candidate => candidate.kind === stage);
  const historical = !!run && run.id !== current?.id;
  const legacyCount = record.coordinator && 'legacyRunCount' in record.coordinator
    ? record.coordinator.legacyRunCount : record.runs.length;
  useEffect(() => {
    if (selection.kind !== 'attempt' || selection.runId === null ||
      record.runs.some(candidate => candidate.id === selection.runId && candidate.kind === selection.stage)) return;
    const fallback = record.runs.filter(candidate => candidate.kind === selection.stage).at(-1);
    setSelection(fallback ? { kind: 'attempt', stage: selection.stage, runId: fallback.id } : { kind: 'follow-current' });
  }, [record.runs, selection]);
  return <div className="tb-factory-console">
    <nav className="tb-stage-rail" aria-label="Work phases">
      {stageKinds.map((kind, index) => {
        const latest = record.runs.filter(candidate => candidate.kind === kind).at(-1);
        return <button key={kind} type="button" aria-pressed={stage === kind}
          aria-current={current?.kind === kind ? 'step' : undefined}
          data-observed={!!latest} data-current={current?.kind === kind} data-tone={stageTone(latest)}
          onClick={() => { setSelection({ kind: 'attempt', stage: kind, runId: latest?.id ?? null }); setView('activity'); }}>
          <span className="tb-stage-number">{index + 1}</span>
          <span><strong>{stageLabels[kind]}</strong><small>{latest ? runStatus(latest) : 'Waiting'}</small></span>
        </button>;
      })}
    </nav>
    <div className="tb-evidence-header">
      <div><h3>{stageLabels[stage]} <span>{attempts.length ? `${attempts.length} ${attempts.length === 1 ? 'attempt' : 'attempts'}` : 'Not started'}</span></h3>
        {historical && <span className="tb-history-label">Historical attempt</span>}
        {run && record.runs.indexOf(run) < legacyCount && <span className="tb-history-label">Legacy session</span>}
      </div>
      <div className="tb-attempt-actions">
        {selection.kind !== 'follow-current' && <Button size="sm" variant="ghost"
          onClick={() => setSelection({ kind: 'follow-current' })}><Icon name="Circle" className="size-3.5" />Follow current</Button>}
        {run && <div className="tb-session-picker">
          <label className="sr-only" htmlFor={`${id}-attempt`}>{stageLabels[stage]} attempt</label>
          <select id={`${id}-attempt`} value={run.id} onChange={event =>
            setSelection({ kind: 'attempt', stage, runId: event.target.value })}>
            {attempts.map((candidate, index) => <option key={candidate.id} value={candidate.id}>
              Attempt {index + 1} · {runStatus(candidate)}
            </option>)}
          </select>
          <Button size="sm" variant="outline" disabled={!run.threadId} onClick={() => {
            if (run.threadId) { requestTaskboardOpen(run.threadId); navigate.toThread(run.threadId); }
          }}><Icon name="MessageCirclePlus" className="size-3.5" />Open session</Button>
        </div>}
      </div>
    </div>
    <div className="tb-evidence-tabs" role="tablist" aria-label="Run evidence">
      {evidenceViews.map((tab, index) => <button key={tab.id} type="button" role="tab"
        id={`${id}-${tab.id}`} aria-controls={`${id}-${tab.id}-panel`} aria-selected={view === tab.id}
        tabIndex={view === tab.id ? 0 : -1} onClick={() => setView(tab.id)}
        onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % evidenceViews.length
            : event.key === 'ArrowLeft' ? (index + evidenceViews.length - 1) % evidenceViews.length
              : event.key === 'Home' ? 0 : event.key === 'End' ? evidenceViews.length - 1 : null;
          if (next === null) return;
          event.preventDefault();
          const target = evidenceViews[next];
          setView(target.id);
          document.getElementById(`${id}-${target.id}`)?.focus();
        }}>{tab.label}{tab.id === 'changes' && !!run?.changedFiles.length && <span>{run.changedFiles.length}</span>}</button>)}
    </div>
    {evidenceViews.map(tab => <div key={tab.id} role="tabpanel" tabIndex={0}
      id={`${id}-${tab.id}-panel`} aria-labelledby={`${id}-${tab.id}`} hidden={view !== tab.id} className="tb-evidence-panel">
      {tab.id === 'workspace' ? workspace : tab.id === 'plan' ? plan
        : view !== tab.id ? null : run ? renderRun(run, tab.id, historical) : <p className="tb-run-caption">No {stageLabels[stage].toLowerCase()} attempt recorded.</p>}
    </div>)}
  </div>;
}
