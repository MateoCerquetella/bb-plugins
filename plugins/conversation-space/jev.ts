import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const obj = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' ? v as Record<string, unknown> : {};
const tokens = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
export type JevSummary = {
  state: 'off' | 'waiting' | 'recorded' | 'unavailable';
  calls: number; failures: number; models: Array<{model:string;calls:number}>;
  lastModel: string | null; effort: string | null; at: string | null;
  judgeTokens: number | null;
};
export function summarizeRoutes(text: string, session: string): JevSummary {
  const scope = createHash('sha256').update(`prompt:${session}`).digest('hex').slice(0,16);
  const rows: Record<string, unknown>[] = [];
  for (const line of text.split('\n')) {
    try { const row = obj(JSON.parse(line)); if (row.cache_scope === scope && typeof row.model === 'string' && typeof row.at === 'string') rows.push(row); } catch { /* Partial tail records are ignored. */ }
  }
  const recent = rows.slice(-200), latest = recent.at(-1);
  const models = new Map<string,number>();
  let failures = 0, judgeTokens = 0, measured = false;
  for (const row of recent) {
    const model = row.model as string;
    models.set(model,(models.get(model)??0)+1);
    if (typeof row.status === 'number' && row.status >= 400) failures++;
    const usage = obj(row.jev_usage);
    const input = tokens(usage.input_tokens ?? usage.inputTokens), output = tokens(usage.output_tokens ?? usage.outputTokens);
    if (input !== null && output !== null) { judgeTokens += input+output; measured = true; }
  }
  return {state:latest?'recorded':'waiting',calls:recent.length,failures,models:[...models].map(([model,calls])=>({model,calls})),lastModel:latest?.model as string??null,effort:typeof latest?.effort==='string'?latest.effort:null,at:latest?.at as string??null,judgeTokens:measured?judgeTokens:null};
}
export async function readJev(active: boolean, session: string | null): Promise<JevSummary> {
  const empty = summarizeRoutes('', '');
  if (!active) return {...empty,state:'off'};
  if (!session) return empty;
  try {
    const file = await open(process.env.JEV_ROUTER_LOG ?? join(homedir(),'.codex/codex-router/jev-router-live.jsonl'),'r');
    try {
      const size = (await file.stat()).size;
      const start = Math.max(0,size-512*1024);
      const buffer = Buffer.alloc(size-start);
      const {bytesRead} = await file.read(buffer,0,buffer.length,start);
      let tail = buffer.subarray(0,bytesRead).toString('utf8');
      if (start > 0) tail = tail.slice(tail.indexOf('\n')+1);
      return summarizeRoutes(tail,session);
    } finally { await file.close(); }
  } catch { return {...empty,state:'unavailable'}; }
}
