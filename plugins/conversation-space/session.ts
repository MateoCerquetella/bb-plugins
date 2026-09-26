import { z } from 'zod';
export const messageSchema = z.object({id:z.string(),role:z.enum(['user','assistant','tool','other']),at:z.number(),type:z.string(),raw:z.string(),truncated:z.boolean(),estimatedTokens:z.number()});
export type SessionMessage = z.infer<typeof messageSchema>;
export type RecordEvent = {seq:number;type:string;createdAt:number;data:unknown};
const obj=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'?v as Record<string,unknown>:{};
// A transparent text-only approximation, not a model tokenizer or context attribution.
function contentCharacters(value: unknown): number {
 if (typeof value === 'string') return value.length;
 if (value === null || typeof value !== 'object') return 0;
 if (Array.isArray(value)) return value.reduce((sum,entry)=>sum+contentCharacters(entry),0);
 const record=obj(value);
 return ['text','content','output','result','aggregatedOutput','summary'].reduce((sum,key)=>sum+contentCharacters(record[key]),0);
}
export function messageContentShares(messages: SessionMessage[]) {
 const totals={user:0,assistant:0,tool:0,other:0};
 for(const message of messages)totals[message.role]+=message.estimatedTokens;
 const total=Object.values(totals).reduce((sum,value)=>sum+value,0);
 return {total,rows: Object.entries(totals).map(([role,tokens])=>({role,tokens,percent:total>0?tokens/total*100:0}))};
}
export function messageRecords(events:RecordEvent[]):SessionMessage[] {
 const seen=new Set<string>();
 const result:SessionMessage[]=[];
 for(const event of events){
  const data=obj(event.data), item=obj(data.item);
  let role:SessionMessage['role'], raw:unknown, id:string, type:string;
  if(event.type==='client/turn/requested'){
   role=data.initiator==='user'?'user':'other'; raw=data.input??[]; id=String(data.requestId??`event-${event.seq}`); type='input';
  } else if(event.type==='item/completed'){
   type=typeof item.type==='string'?item.type:'unknown';
   if(type==='userMessage')continue; // The outbound request already records user input.
   role=type==='agentMessage'?'assistant':/tool|command|fileChange|mcp/i.test(type)?'tool':'other';
   raw=item;id=typeof item.id==='string'?item.id:`event-${event.seq}`;
  } else continue;
  if(seen.has(id))continue;seen.add(id);
  const encoded=JSON.stringify(raw,null,2);
  result.push({id,role,at:event.createdAt,type,raw:encoded.slice(0,12000),truncated:encoded.length>12000,estimatedTokens:Math.ceil(contentCharacters(raw)/4)});
 }
 return result;
}
export function mergeMessages(current:SessionMessage[], older:SessionMessage[]):SessionMessage[]{
 const seen=new Set(current.map(m=>m.id));
 return [...current,...older.filter(m=>{if(seen.has(m.id))return false;seen.add(m.id);return true;})];
}
