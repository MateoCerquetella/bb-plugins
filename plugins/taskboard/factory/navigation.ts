import type { FactoryRecord, FactoryRun } from './contract.js';

export function ticketThreadId(record: Pick<FactoryRecord, 'coordinator'> & { runs: Pick<FactoryRun, 'threadId'>[] }) {
  return record.coordinator?.status === 'ready'
    ? record.coordinator.threadId
    : record.coordinator ? null : record.runs.at(-1)?.threadId ?? null;
}

export const TASKBOARD_OPEN_EVENT = 'taskboard:open-once';
const OPEN_KEY = 'bb-taskboard:open-once';
export function requestTaskboardOpen(threadId: string) {
  try { sessionStorage.setItem(OPEN_KEY, threadId); } catch { return; }
  window.dispatchEvent(new Event(TASKBOARD_OPEN_EVENT));
}
export function consumeTaskboardOpen(threadId: string) {
  try {
    if (sessionStorage.getItem(OPEN_KEY) !== threadId) return false;
    sessionStorage.removeItem(OPEN_KEY);
    return true;
  } catch { return false; }
}
export function originalTicketPath(record: { projectId: string; source: string; locator: string }) {
  const locator = encodeURIComponent(record.locator).replaceAll('~', '%7E').replaceAll('%', '~');
  return `item/${encodeURIComponent(record.projectId)}/${record.source}/${locator}`;
}
