import {test} from 'node:test';
import assert from 'node:assert/strict';
import {messageRecords,mergeMessages,messageContentShares} from '../session.ts';
const event=(seq:number,type:string,data:unknown)=>({seq,type,data,createdAt:seq*1000});
test('records roles without duplicating user input and repeated completed items',()=>{
 const rows=messageRecords([event(4,'item/completed',{item:{type:'agentMessage',id:'a',text:'reply'}}),event(3,'item/completed',{item:{type:'agentMessage',id:'a',text:'reply'}}),event(2,'item/completed',{item:{type:'userMessage',id:'u'}}),event(1,'client/turn/requested',{initiator:'user',requestId:'r',input:[{text:'hello'}]})]);
 assert.deepEqual(rows.map(r=>r.role),['assistant','user']);assert.match(rows[1]!.raw,/hello/);
});
test('truncation is explicit and tools/system input retain distinct roles',()=>{
 const rows=messageRecords([event(1,'item/completed',{item:{id:'t',type:'toolCall',output:'x'.repeat(13000)}}),event(2,'client/turn/requested',{initiator:'system',input:[]})]);assert.equal(rows[0]!.role,'tool');assert.equal(rows[0]!.truncated,true);assert.equal(rows[0]!.raw.length,12000);assert.equal(rows[1]!.role,'other');assert.equal(mergeMessages(rows,rows).length,2);
});
test('text estimates exclude metadata, include full content before display truncation, and separate roles',()=>{
 const rows=messageRecords([event(1,'client/turn/requested',{initiator:'user',input:[{type:'text',text:'abcdefgh',imageUrl:'ignored'}]}),event(2,'item/completed',{item:{id:'large',type:'toolCall',output:'x'.repeat(16000),status:'completed'}})]);
 assert.equal(rows[0]!.estimatedTokens,2);assert.equal(rows[1]!.estimatedTokens,4000);assert.equal(rows[1]!.truncated,true);
});

test('loaded content shares use only loaded estimates and handle empty history',()=>{const rows=messageRecords([event(1,'client/turn/requested',{initiator:'user',input:[{text:'abcd'}]}),event(2,'item/completed',{item:{id:'a',type:'agentMessage',text:'abcdefgh'}})]);const s=messageContentShares(rows);assert.equal(s.total,3);assert.equal(s.rows.find(r=>r.role==='user')!.tokens,1);assert.equal(s.rows.find(r=>r.role==='assistant')!.tokens,2);assert.equal(messageContentShares([]).total,0);});
