import { defineRpcContract, type BbPluginApi } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { readJev } from './jev.ts';
import { summarize } from './usage.ts';
const number = z.number().nullable();
export const rpcContract = defineRpcContract({ usage: {
  input: z.object({ threadId: z.string().min(1) }),
  output: z.object({ used:number, capacity:number, remaining:number, percent:number, input:number, cached:number, output:number, reasoning:number, estimated:z.boolean(), measuredAt:number, model:z.string(), provider:z.string(), jev:z.object({state:z.enum(['off','waiting','recorded','unavailable']),calls:z.number(),failures:z.number(),models:z.array(z.object({model:z.string(),calls:z.number()})),lastModel:z.string().nullable(),effort:z.string().nullable(),at:z.string().nullable(),judgeTokens:number}) })
}});
export default function plugin(bb: BbPluginApi) {
  bb.rpc.register(rpcContract, { usage: async ({threadId}) => {
    const [thread, events, requests] = await Promise.all([bb.sdk.threads.get({threadId}), bb.sdk.threads.events.list({threadId, types:['thread/tokenUsage/updated','thread/contextWindowUsage/updated','thread/context/cleared','thread/compacted','client/turn/requested'],order:'desc',limit:'100'}), bb.sdk.threads.events.list({threadId,types:['client/turn/requested'],order:'desc',limit:'1'})]);
    const latest = requests[0];
    const execution = (latest?.data as {execution?:{model?:unknown}} | undefined)?.execution;
    const model = typeof execution?.model === 'string' ? execution.model : 'Unknown model';
    const session = events.map(event => (event.data as {providerThreadId?:unknown}).providerThreadId).find(value => typeof value === 'string');
    const jev = await readJev(model === 'jev/auto' && thread.providerId === 'codex', typeof session === 'string' ? session : null);
    return {...summarize(events), model, provider:thread.providerId, jev};
  }});
}
