import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../usage.ts';
const usage = {type:'thread/tokenUsage/updated',createdAt:2,data:{tokenUsage:{last:{inputTokens:46600,cachedInputTokens:41100,outputTokens:664,reasoningOutputTokens:188,totalTokens:47264},total:{totalTokens:900000},modelContextWindow:1100000}}};
test('latest call excludes cached input and does not use cumulative totals',()=>{const s=summarize([usage]);assert.equal(s.input,5500);assert.equal(s.used,47264);assert.equal(s.reasoning,188);assert.equal(s.percent,4);});
test('explicit context measurement takes precedence',()=>{const s=summarize([usage,{type:'thread/contextWindowUsage/updated',createdAt:3,data:{contextWindowUsage:{usedTokens:50000,modelContextWindow:100000,estimated:false}}}]);assert.equal(s.percent,50);assert.equal(s.remaining,50000);assert.equal(s.estimated,false);});
test('reset and unavailable measurements do not show old context',()=>{assert.equal(summarize([usage,{type:'thread/context/cleared',createdAt:3,data:{}}]).used,null);assert.equal(summarize([]).percent,null);assert.equal(summarize([{type:'thread/contextWindowUsage/updated',createdAt:3,data:{contextWindowUsage:{usedTokens:-1,modelContextWindow:0}}}]).percent,null);});

test('unknown cache does not imply zero cached tokens or known uncached input',()=>{const s=summarize([{type:'thread/tokenUsage/updated',createdAt:1,data:{tokenUsage:{last:{inputTokens:100,outputTokens:5,totalTokens:105},modelContextWindow:1000}}}]);assert.equal(s.totalInput,100);assert.equal(s.input,null);assert.equal(s.cached,null);assert.equal(s.output,5);});
test('cumulative provider usage remains separate from current context',()=>{const s=summarize([usage]);assert.equal(s.sessionTokens,900000);assert.equal(s.used,47264);assert.equal(summarize([]).sessionTokens,null);});
