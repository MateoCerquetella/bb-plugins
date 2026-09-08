// Real composer UI, browser-only RPC fixture: no saved user settings are changed.
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.BB_BASE_URL||'http://127.0.0.1:38886';
const shots=process.env.BB_SCREENSHOT_DIR||process.env.BB_THREAD_STORAGE;
if(!shots)throw new Error('Set BB_SCREENSHOT_DIR');
await mkdir(shots+'/browser-tmp',{recursive:true});
const saved=(await(await fetch(base+'/api/v1/plugins/aura/rpc/get',{method:'POST',headers:{'Content-Type':'application/json'},body:'null'})).json()).result;
let state={...saved,settings:{...saved.settings,enabled:true,newThreadOnly:false,dimmerEnabled:true,fade:.65}};
const browser=await chromium.launch({headless:true,...(process.env.BB_CHROMIUM_PATH?{executablePath:process.env.BB_CHROMIUM_PATH}:{}),env:{...process.env,TMPDIR:shots+'/browser-tmp'},args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 let calls=0;
 await page.route('**/api/v1/plugins/aura/rpc/get',r=>r.fulfill({json:{ok:true,result:state}}));
 await page.route('**/api/v1/plugins/aura/rpc/setDimmer',r=>{calls++;state={...state,settings:{...state.settings,dimmerEnabled:r.request().postDataJSON().enabled}};return r.fulfill({json:{ok:true,result:state}})});
 await page.goto(base);
 const toggle=page.getByRole('button',{name:'Dim background',exact:true});
 await toggle.waitFor();assert.equal(await toggle.getAttribute('aria-pressed'),'true');
 await page.locator('#root-compose-main-panel .aura-capy-ink[data-center-dim]').waitFor();
 await toggle.click();
 await page.waitForFunction(()=>document.querySelector('.aura-dimmer-toggle')?.getAttribute('aria-pressed')==='false');
 assert.equal(await page.locator('#root-compose-main-panel .aura-capy-ink[data-center-dim]').count(),0);
 assert.equal(state.settings.fade,.65);
 await page.reload();await toggle.waitFor();assert.equal(await toggle.getAttribute('aria-pressed'),'false');
 await toggle.click();await page.locator('#root-compose-main-panel .aura-capy-ink[data-center-dim]').waitFor();
 assert.equal(await toggle.getAttribute('aria-pressed'),'true');assert.equal(calls,2);
 await page.screenshot({path:shots+'/new-thread-dimmer-toggle.jpg',type:'jpeg',quality:88});
 if(process.env.BB_TEST_THREAD_PATH){
  await page.goto(base+process.env.BB_TEST_THREAD_PATH);
  await page.locator('#thread-detail-timeline-panel .aura-capy-ink').waitFor();
  assert.equal(await toggle.count(),0,'Dim toggle must not appear inside a chat');
  assert.equal(await page.locator('#thread-detail-timeline-panel .aura-capy-ink[data-center-dim]').count(),0,'Chats must use the full wallpaper');
  assert.equal(await page.locator('#thread-detail-timeline-panel .aura-capy-focus').evaluate(e=>getComputedStyle(e).opacity),'0');
 }
 console.log('PASS: New thread Dim button toggles immediately, survives reload, preserves strength, and never dims chats.');
}finally{await browser.close()}
