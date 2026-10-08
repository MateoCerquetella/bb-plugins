import React from 'react';
import type { FactoryRecord } from '../factory/contract.js';

declare global {
  interface Window {
    factoryFixture: FactoryRecord;
    factoryNavigation: string[];
  }
}
export function useRpc() {
  return rpc;
}
const rpc = {
  async call(method: string, input: { body?: string; digest?: string }) {
    const record = window.factoryFixture;
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
export function useRealtime() {}
export function Markdown({ content }: { content: string }) {
  return <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{content}</pre>;
}
