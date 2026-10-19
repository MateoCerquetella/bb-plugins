import React from 'react';
import { createRoot } from 'react-dom/client';
import { FactoryProgress, FactoryThreadProgress } from '../factory/app.js';
import { FactoryProjectSettings } from '../factory/project-settings.js';
import { TooltipProvider } from '../components/ui/tooltip.js';
import { TaskboardResultDirective } from '../factory/result-card.js';
// The browser build exports these local components through its onLoad hook.
// @ts-expect-error Only the preview build adds component exports.
import { KanbanCard, TrackerDetail, CreateIssueDialog } from '../app.js';
const item = {
  bbProjectId: 'proj_test', source: 'github' as const, locator: 'example/repo#42',
  key: '#42', title: 'Keep saved filters when switching projects', description: '',
  url: '', status: 'Open', stateCategory: 'todo' as const, priority: null,
  assignee: null, project: null, labels: [], updatedAt: ''
};
window.factoryNavigation = []; window.factoryStarts = 0;
window.createdInputs = [];
window.factoryItem = { ...item, source: 'linear', locator: 'issue-42', key: 'SDD-134',
  title: 'Close already-merged features automatically at session start',
  description: 'Investigate and implement the issue, then report verification and changes.',
  priority: 'Urgent', assignee: 'Juan Sebastian Salazar Agudelo', project: 'Empirical SDD',
  updatedAt: new Date().toISOString(), comments: []
};
const detail = <TrackerDetail route={{ kind: 'item', projectId: 'proj_test', source: 'linear', locator: 'issue-42' }} refreshGeneration={0} />;
function Preview() {
  const [creating, setCreating] = React.useState(true);
  const setEmpirical = (status: Record<string, unknown>, offline = false) => {
    window.empiricalOffline = offline;
    window.empiricalStatus = { ...window.empiricalStatus, ...status };
    window.empiricalRefresh();
  };
  if (location.search.includes('creation')) return <TooltipProvider>
    <CreateIssueDialog mode="direct" projectId="proj_test" open={creating} onOpenChange={setCreating} />
  </TooltipProvider>;
  return <TooltipProvider><div className="tb-linear">
    <div id="preview-factory-settings" style={{ padding: 20 }}>
      <FactoryProjectSettings projectId="proj_test" provider="github" />
    </div>
    <div id="preview-result" style={{ padding: 20 }}>
      <TaskboardResultDirective attributes={{ kind: 'review', verdict: 'blocked' }}
        source={'::taskboard-result{kind="review" verdict="blocked"}'}
        message={{ id: 'message-review', threadId: 'thr_test', turnId: 'turn', projectId: 'proj_test' }}
        openWorkspaceFile={null} />
      <h3>Blockers</h3>
      <ul><li>Acquisition-cost permissions leak.</li><li>Historical allocation backfill is missing.</li></ul>
    </div>
    <div id="demo-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
      <button onClick={() => setEmpirical({ revision: 2, phase: 'implement', status: 'awaiting_human',
        nextAction: 'Answer the implementation question' })}>Awaiting input</button>
      <button onClick={() => setEmpirical({ revision: 3, phase: 'review', status: 'blocked',
        nextAction: 'Resolve review findings' })}>Blocked</button>
      <button onClick={() => setEmpirical({}, true)}>Host offline</button>
      <button onClick={() => setEmpirical({}, false)}>Reconnect</button>
      <button onClick={() => setEmpirical({ revision: 4, phase: 'done', status: 'done',
        nextAction: 'Completed at implemented', verification: 'skipped',
        completionLevel: 'implemented', completionMethod: 'workflow' })}>Implemented only</button>
      <button onClick={() => setEmpirical({ revision: 5, phase: 'done', status: 'done',
        nextAction: 'Completed at verified', verification: 'verified',
        completionLevel: 'verified', completionMethod: 'workflow' })}>Verified</button>
    </div>
    <FactoryThreadProgress threadId="thr_test" isCompactViewport={false} />
    <div id="preview-detail">{detail}</div>
    <div id="preview-card" style={{ width: 264, padding: 8 }}>
      <KanbanCard item={window.factoryItem} pickedUp={false} pending={false} moveDisabled={false}
        composerDragEnabled={false} onOpen={() => window.factoryNavigation.push('card-open')}
        onPrepare={() => {}} onDragStart={() => {}} onDragEnd={() => {}} onKeyDown={() => {}} />
    </div>
    <div id="preview-manual"><FactoryProgress item={item} /></div>
  </div></TooltipProvider>;
}
createRoot(document.querySelector('#root')!).render(<Preview />);
