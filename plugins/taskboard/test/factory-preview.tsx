import React from 'react';
import { createRoot } from 'react-dom/client';
import { FactoryProgress } from '../factory/app.js';
const item = {
  bbProjectId: 'proj_test', source: 'github' as const, locator: 'example/repo#42',
  key: '#42', title: 'Keep saved filters when switching projects', description: '',
  url: '', status: 'Open', stateCategory: 'todo' as const, priority: null,
  assignee: null, project: null, labels: [], updatedAt: ''
};
window.factoryNavigation = [];
createRoot(document.querySelector('#root')!).render(<FactoryProgress item={item} pin={() => {}} />);
