import assert from 'node:assert/strict';
import {call,evaluate,ws} from './cdp.mjs';
const delay=()=>new Promise(r=>setTimeout(r,750));
async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing control');const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});}
async function clickText(text){const p=await evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Missing '+${JSON.stringify(text)});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});}
try{
 assert.equal(new URL(await evaluate("location.href")).origin,process.env.BB_AGENT_CANVAS_FIXTURE_ORIGIN??"http://127.0.0.1:8769","Navigate to the development fixture before running these checks");
 await evaluate('localStorage.removeItem("fixture-shared-canvas");localStorage.removeItem("agent-canvas:document:v1")');await call('Page.reload');await delay();const original=await evaluate('document.querySelectorAll(".node").length');
 await click('.node.note .name');await clickText('Save ensemble');await delay();assert.ok(await evaluate('document.body.innerText.includes("1 nodes")'));
 await clickText('Place on this canvas');await delay();assert.equal(await evaluate('document.querySelectorAll(".node").length'),original+1);
 await clickText('Note collections');await clickText('+ Collect selected notes');await delay();await clickText('Save as reusable collection');await delay();assert.ok(await evaluate(`Boolean(document.querySelector(${JSON.stringify('input[aria-label="Note template name"]')}))`));
 await clickText('Place on this canvas');await delay();assert.equal(await evaluate('document.querySelectorAll(".node").length'),original+2);
 console.log('Library UI checks passed: save/place ensemble and save/place note collection.');
}finally{ws.close();}
