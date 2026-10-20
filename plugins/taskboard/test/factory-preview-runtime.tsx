import React, { useEffect } from 'react';
import type { FactoryRecord, FactoryScanObservation } from '../factory/contract.js';

declare global {
  interface Window {
    factoryFixture: FactoryRecord;
    factoryNavigation: string[];
    factoryItem: Record<string, unknown>;
    factoryStarts: number;
    factoryStartError?: string | null;
    factoryStartDelay?: number;
    factoryProjectState?: 'running' | 'paused' | 'awaiting_scan' | 'unconfigured' | 'provider_error';
    factoryProjectDelay?: number;
    factoryProjectReads?: number;
    factoryPreviewProject: (projectId: string) => void;
    empiricalStatus: Record<string, unknown>;
    empiricalOffline: boolean;
    empiricalLastKnown: Record<string, unknown> | null;
    empiricalRefresh: () => void;
    factoryRefresh: () => void;
    createdInputs: Record<string, unknown>[];
  }
}
export function useRpc() {
  return rpc;
}
export function useSettings() {
  return { values: {}, isLoading: false };
}
let factoryPolicy = { projectId: 'proj_test', provider: 'github', enabled: false,
  maxConcurrent: 1, intake: 'todo', updatedAt: new Date().toISOString() };
const rpc = {
  async call(method: string, input: { projectId?: string; body?: string; digest?: string; kind?: string; path?: string;
    enabled?: boolean; maxConcurrent?: number; threadId?: string; statusId?: string;
    mutation?: { field: 'assignee' | 'priority' | 'project'; valueId: string | null } }) {
    const record = window.factoryFixture;
    if (method === 'factoryGetProject' || method === 'factorySaveProject') {
      if (method === 'factorySaveProject') factoryPolicy = { ...factoryPolicy,
        enabled: input.enabled ?? false, maxConcurrent: input.maxConcurrent ?? 1 };
      const kind = window.factoryProjectState;
      const policy = { ...factoryPolicy, projectId: input.projectId ?? factoryPolicy.projectId,
        enabled: kind ? kind !== 'paused' : factoryPolicy.enabled };
      const lastScan: FactoryScanObservation | null = kind === 'awaiting_scan' || !kind ? null : {
        projectId: policy.projectId, observedAt: '2026-10-20T12:00:00.000Z',
        kind: kind === 'provider_error' ? 'blocked' : 'success',
        reason: kind === 'provider_error' ? 'Live provider scan failed.' : null,
        candidates: 5, pendingCandidates: kind === 'provider_error' ? null : 3
      };
      const observation = { queue: lastScan?.pendingCandidates ?? null, lastScan };
      const result = { policy, status: kind === 'unconfigured' || kind === 'provider_error'
        ? { kind: 'blocked', policy, active: 0, ...observation, reason: kind === 'unconfigured'
          ? 'Configure the project issue provider before enabling intake.' : 'Provider unavailable: live eligibility could not be confirmed.' }
        : kind === 'paused' || kind === 'awaiting_scan' ? { kind: 'paused', policy, active: 1, ...observation }
        : policy.enabled
          ? { kind: 'running', policy, active: 0, available: policy.maxConcurrent, ...observation }
          : { kind: 'disabled', policy, ...observation } };
      window.factoryProjectReads = (window.factoryProjectReads ?? 0) + 1;
      if (window.factoryProjectDelay) await new Promise(resolve => setTimeout(resolve, window.factoryProjectDelay));
      return result;
    }
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
    if (method === 'getItemInspector') return { inspector: {
      assigneeOptions: [
        { id: 'mateo', label: 'mateo rodriguez', current: window.factoryItem.assignee === 'mateo rodriguez' },
        { id: 'juan', label: 'Juan Sebastian Salazar Agudelo', current: window.factoryItem.assignee === 'Juan Sebastian Salazar Agudelo' }
      ],
      priorityOptions: [
        { id: 'urgent', label: 'Urgent', current: window.factoryItem.priority === 'Urgent' },
        { id: 'high', label: 'High', current: window.factoryItem.priority === 'High' },
        { id: 'medium', label: 'Medium', current: window.factoryItem.priority === 'Medium' },
        { id: 'low', label: 'Low', current: window.factoryItem.priority === 'Low' }
      ],
      projectOptions: [
        { id: 'empirical', label: 'Empirical SDD', current: window.factoryItem.project === 'Empirical SDD' },
        { id: 'roten', label: 'Roten Market', current: window.factoryItem.project === 'Roten Market' }
      ],
      supportsComments: true, supportsAssignee: true, supportsPriority: true, supportsProject: true
    } };
    if (method === 'updateItemField' && input.mutation) {
      const { field, valueId } = input.mutation;
      const labels: Record<string, Record<string, string>> = {
        assignee: { mateo: 'mateo rodriguez', juan: 'Juan Sebastian Salazar Agudelo' },
        priority: { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' },
        project: { empirical: 'Empirical SDD', roten: 'Roten Market' }
      };
      window.factoryItem[field] = valueId === null ? null : labels[field]?.[valueId] ?? null;
      return { item: structuredClone(window.factoryItem) };
    }
    if (method === 'addItemComment') {
      const comments = window.factoryItem.comments as Array<Record<string, unknown>>;
      comments.push({ author: 'mateo rodriguez', body: input.body,
        createdAt: new Date().toISOString() });
      return { item: structuredClone(window.factoryItem) };
    }
    if (method === 'factoryEmpirical') {
      const run = record.runs.at(-1);
      if (!run?.threadId || !run.environmentId) return { kind: 'unbound', reason: 'Start task to link an agent workspace.' };
      const identity = {
        hostId: 'host_demo', environmentId: run.environmentId,
        checkoutRoot: '/demo/empirical'
      };
      const snapshot = window.empiricalLastKnown;
      const lastKnown = snapshot && snapshot.hostId === identity.hostId &&
        snapshot.environmentId === identity.environmentId &&
        snapshot.checkoutRoot === identity.checkoutRoot ? snapshot : null;
      if (!window.empiricalOffline) window.empiricalLastKnown = {
        ...identity, observedAt: Date.now(), status: structuredClone(window.empiricalStatus)
      };
      return {
        kind: 'observation', ...identity, threadId: run.threadId, observedAt: Date.now(),
        status: window.empiricalOffline
          ? { kind: 'unavailable', reason: 'The host is offline or Empirical did not respond.' }
          : structuredClone(window.empiricalStatus),
        lastKnown: window.empiricalOffline ? lastKnown : null
      };
    }
    if (method === 'factoryStartTask') {
      window.factoryStarts++;
      if (window.factoryStartDelay) await new Promise(resolve => setTimeout(resolve, window.factoryStartDelay));
      if (window.factoryStartError) throw new Error(window.factoryStartError);
      const previous = record.runs.at(-1);
      if (previous?.kind === 'build' && previous.status === 'finished' && previous.buildResult?.verdict === 'blocked') {
        record.automationError = null;
        record.version++;
        record.runs.push({ ...previous, id: 'continued', status: 'running', error: null,
          buildResult: null, continuationOf: previous.id, output: '', activity: 'Continuing Build' });
        window.factoryRefresh();
        return { record: structuredClone(record) };
      }
      record.automatic = true;
      record.coordinator = { status: 'ready', intentId: 'preview-intent', startedAt: new Date().toISOString(),
        legacyRunCount: 0, threadId: 'thr_coordinator', nativeStatus: 'idle', error: null };
      record.stage = 'Triage';
      record.trackerProgress = { status: 'synced', message: null };
      window.factoryItem.status = 'In progress'; window.factoryItem.stateCategory = 'in_progress';
      record.runs = [{
        id: 'started', kind: 'investigate', status: 'running', threadId: 'thr_started',
        environmentId: 'env_worktree', hostId: 'host_demo', checkoutRoot: '/demo/empirical',
        cursor: 0, turnId: null, pendingCompletion: null, planDigest: null,
        scopeDigest: record.scopeDigest, activity: 'Inspecting repository', error: null,
        output: '', reviewResult: null, buildResult: null, repairOf: null, continuationOf: null, updates: [], checks: [], steps: [], changedFiles: [], startedAt: new Date().toISOString(), finishedAt: null
      }];
      record.version++;
      for (const callback of listeners.get('taskboard:factory') ?? []) callback({ projectId: 'proj_test' });
      for (const callback of listeners.get('taskboard:changed') ?? []) callback({ projectId: 'proj_test' });
    }
    if (method === 'factoryAdoptCoordinator' || method === 'factoryRetryCoordinator' || method === 'factoryRecoverCoordinator') {
      record.coordinator = { status: 'ready', intentId: 'preview-intent', startedAt: new Date().toISOString(),
        legacyRunCount: method === 'factoryAdoptCoordinator' ? record.runs.length : 0,
        threadId: input.threadId ?? 'thr_coordinator', nativeStatus: 'idle', error: null };
      record.version++;
      window.factoryRefresh();
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
window.empiricalRefresh = () => window.dispatchEvent(new Event('taskboard:empirical-refresh'));
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
