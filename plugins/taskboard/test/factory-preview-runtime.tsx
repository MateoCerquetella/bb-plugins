import React, { useEffect } from 'react';
import type { FactoryRecord } from '../factory/contract.js';

declare global {
  interface Window {
    factoryFixture: FactoryRecord;
    factoryNavigation: string[];
    factoryItem: Record<string, unknown>;
    factoryStarts: number;
  }
}
export function useRpc() {
  return rpc;
}
const rpc = {
  async call(method: string, input: { body?: string; digest?: string }) {
    const record = window.factoryFixture;
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
        output: '', checks: [], steps: [], changedFiles: [], startedAt: new Date().toISOString(), finishedAt: null
      }];
      record.version++;
      for (const callback of listeners.get('taskboard:factory') ?? []) callback({ projectId: 'proj_test' });
      for (const callback of listeners.get('taskboard:changed') ?? []) callback({ projectId: 'proj_test' });
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
export function useBbNavigate() { return { toThread: (id: string) => window.factoryNavigation.push(id) }; }
const listeners = new Map<string, Set<(payload: unknown) => void>>();
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
