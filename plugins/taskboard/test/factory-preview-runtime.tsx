import React, { useEffect } from 'react';
import type { FactoryRecord } from '../factory/contract.js';

declare global {
  interface Window {
    factoryFixture: FactoryRecord;
    factoryNavigation: string[];
    factoryItem: Record<string, unknown>;
    factoryStarts: number;
    factoryRefresh: () => void;
    createdInputs: Record<string, unknown>[];
  }
}
export function useRpc() {
  return rpc;
}
const rpc = {
  async call(method: string, input: { body?: string; digest?: string; kind?: string; path?: string }) {
    const record = window.factoryFixture;
    if (method === 'getCreateIssueContext') return { context: {
      projectId: 'proj_test', projectName: 'Preview', source: 'linear', available: true,
      message: null, destinationLabel: 'Team', destinations: [{ id: 'TEST', label: 'Test team' }],
      defaultDestinationId: 'TEST', allowsCustomDestination: false, defaultIssueType: null
    } };
    if (method === 'getCreateIssueMetadata') return { ok: true, connectorRevision: 1, metadata: {
      statusOptions: [], assigneeOptions: [], priorityOptions: [], labelOptions: [], milestoneOptions: [],
      issueTypeOptions: [], defaultStatusId: null, defaultIssueTypeId: null, supportsDueDate: false
    } };
    if (method === 'createIssue') {
      window.createdInputs.push(structuredClone(input));
      return { item: window.factoryItem, warnings: [], assigneeConfirmation: { confirmed: true, id: null },
        mention: { provider: 'external-work-item', id: 'new', label: 'TEST-1' } };
    }
    if (method === 'factoryDiff') return {
      patch: `--- a/${input.path}\n+++ b/${input.path}\n@@ -1 +1 @@\n-const saved = null;\n+const saved = loadProjectPreferences(projectId);\n`,
      message: null, truncated: false
    };
    if (method === 'getItem') return { item: structuredClone(window.factoryItem) };
    if (method === 'factoryStartTask') {
      window.factoryStarts++;
      record.automatic = true;
      record.stage = 'Triage';
      record.trackerProgress = { status: 'synced', message: null };
      window.factoryItem.status = 'In progress'; window.factoryItem.stateCategory = 'in_progress';
      record.runs = [{
        id: 'started', kind: 'investigate', status: 'running', threadId: 'thr_started',
        environmentId: 'env_worktree', cursor: 0, turnId: null, planDigest: null,
        scopeDigest: record.scopeDigest, activity: 'Inspecting repository', error: null,
        output: '', reviewResult: null, buildResult: null, repairOf: null, continuationOf: null, updates: [], checks: [], steps: [], changedFiles: [], startedAt: new Date().toISOString(), finishedAt: null
      }];
      record.version++;
      for (const callback of listeners.get('taskboard:factory') ?? []) callback({ projectId: 'proj_test' });
      for (const callback of listeners.get('taskboard:changed') ?? []) callback({ projectId: 'proj_test' });
    }
    if (method === 'factoryStart' && input.kind === 'build') {
      const review = record.runs.at(-1)!;
      record.automatic = true; record.stage = 'Build'; record.version++;
      record.runs.push({ ...review, id: 'repair', kind: 'build', status: 'running',
        threadId: 'thr_build', repairOf: review.id, continuationOf: null, reviewResult: null, output: '',
        activity: 'Addressing review findings', updates: [], checks: [], steps: [], changedFiles: [] });
      window.factoryRefresh();
    }
    if (method === 'factorySavePlan') {
      record.plans.push({
        revision: record.plans.length + 1, body: input.body!, digest: 'preview-plan',
        scopeDigest: record.scopeDigest, createdAt: new Date().toISOString()
      });
      record.approvedDigest = null; record.version++;
    }
    if (method === 'factoryApprovePlan') { record.approvedDigest = input.digest!; record.version++; }
    return { record: structuredClone(record) };
  }
};
export function useBbContext() { return { projectId: 'proj_test', threadId: 'thr_test' }; }
export function useBbNavigate() { return {
  toThread: (id: string) => window.factoryNavigation.push(id),
  toPluginPanel: (_path: string, options: { subPath: string }) => window.factoryNavigation.push(options.subPath)
}; }
const listeners = new Map<string, Set<(payload: unknown) => void>>();
window.factoryRefresh = () => {
  for (const callback of listeners.get('taskboard:factory') ?? []) callback({ projectId: 'proj_test' });
};
export function useRealtime(channel: string, callback: (payload: unknown) => void) {
  useEffect(() => {
    const callbacks = listeners.get(channel) ?? new Set();
    callbacks.add(callback); listeners.set(channel, callbacks);
    return () => { callbacks.delete(callback); };
  }, [channel, callback]);
}
export function useRealtimeConnectionState() { return 'connected'; }
export function definePluginApp() {}
export function useComposer() { return {}; }
export function useComposerView() { return {}; }
export function Markdown({ content }: { content: string }) {
  return <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{content}</pre>;
}
export function experimental_Diff({ patch, path }: { patch: string; path: string }) {
  return <pre aria-label={`Diff for ${path}`} data-native-diff-preview>{patch}</pre>;
}
