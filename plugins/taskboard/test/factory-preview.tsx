import React from 'react';
import { createRoot } from 'react-dom/client';
import { FactoryProgress } from '../factory/app.js';
import { TooltipProvider } from '../components/ui/tooltip.js';
// The browser build exports these local components through its onLoad hook.
// @ts-expect-error Only the preview build adds component exports.
import { KanbanCard, TrackerDetail } from '../app.js';
const item = {
  bbProjectId: 'proj_test', source: 'github' as const, locator: 'example/repo#42',
  key: '#42', title: 'Keep saved filters when switching projects', description: '',
  url: '', status: 'Open', stateCategory: 'todo' as const, priority: null,
  assignee: null, project: null, labels: [], updatedAt: ''
};
window.factoryNavigation = []; window.factoryStarts = 0;
window.factoryItem = { ...item, source: 'linear', locator: 'issue-42', key: 'SDD-134',
  title: 'Close already-merged features automatically at session start',
  description: 'Investigate and implement the issue, then report verification and changes.',
  priority: 'Urgent', assignee: 'Juan Sebastian Salazar Agudelo', project: 'Empirical SDD',
  updatedAt: new Date().toISOString(), comments: []
};
const detail = <TrackerDetail route={{ kind: 'item', projectId: 'proj_test', source: 'linear', locator: 'issue-42' }} refreshGeneration={0} />;
function Preview() {
  return <TooltipProvider><div className="tb-linear">
    <div id="preview-detail">{detail}</div>
    <div id="preview-card" style={{ width: 264, padding: 8 }}>
      <KanbanCard item={window.factoryItem} pickedUp={false} pending={false} moveDisabled={false}
        composerDragEnabled={false} onOpen={() => window.factoryNavigation.push('card-open')}
        onPrepare={() => {}} onDragStart={() => {}} onDragEnd={() => {}} onKeyDown={() => {}} />
    </div>
    <div id="preview-manual"><FactoryProgress item={item} pin={() => {}} /></div>
  </div></TooltipProvider>;
}
createRoot(document.querySelector('#root')!).render(<Preview />);
