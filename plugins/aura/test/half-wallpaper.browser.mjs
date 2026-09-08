// Real settings/New thread UI with browser-only mutations; preserves user data.
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.BB_BASE_URL||'http://127.0.0.1:38886';
const shots=process.env.BB_SCREENSHOT_DIR||process.env.BB_THREAD_STORAGE;
if(!shots)throw new Error('Set BB_SCREENSHOT_DIR');
await mkdir(shots+'/browser-tmp',{recursive:true});
const saved=(await(await fetch(base+'/api/v1/plugins/aura/rpc/get',{method:'POST',headers:{'Content-Type':'application/json'},body:'null'})).json()).result;
let state={...saved,settings:{...saved.settings,enabled:true,newThreadOnly:false,dimmerEnabled:true}};
const browser=await chromium.launch({headless:true,...(process.env.BB_CHROMIUM_PATH?{executablePath:process.env.BB_CHROMIUM_PATH}:{}),env:{...process.env,TMPDIR:shots+'/browser-tmp'},args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await page.route('**/api/v1/plugins/aura/rpc/get',r=>r.fulfill({json:{ok:true,result:state}}));
 await page.route('**/api/v1/plugins/aura/rpc/apply',r=>{state={...state,settings:r.request().postDataJSON().settings};return r.fulfill({json:{ok:true,result:state}})});
 const settings=base+'/settings/plugins/aura';
 await page.goto(settings);
 const toggle=page.getByRole('checkbox',{name:'Half wallpaper on New thread',exact:true});
 await toggle.waitFor();assert.ok(await toggle.isChecked());
 await page.goto(base);
 const ink=page.locator('#root-compose-main-panel .aura-capy-ink');
 await page.locator('#root-compose-main-panel .aura-capy-ink[data-half-wallpaper] canvas[data-rendered]').waitFor();
 assert.equal(await page.getByRole('button',{name:'Dim background',exact:true}).count(),0);
 assert.ok((await ink.evaluate(e=>getComputedStyle(e).maskImage)).includes('50%'));
 await page.locator('#root-compose-main-panel').screenshot({path:shots+'/new-thread-half.jpg',type:'jpeg',quality:88});
 await page.goto(settings);await toggle.uncheck();await page.getByRole('button',{name:'Apply background',exact:true}).click();
 await page.getByText('Applied to all threads',{exact:true}).waitFor();assert.equal(state.settings.dimmerEnabled,false);
 await page.goto(base);await ink.waitFor();assert.equal(await ink.evaluate(e=>getComputedStyle(e).maskImage),'none');
 await page.locator('#root-compose-main-panel').screenshot({path:shots+'/new-thread-full.jpg',type:'jpeg',quality:88});
 if(process.env.BB_TEST_THREAD_PATH){
  state={...state,settings:{...state.settings,dimmerEnabled:true}};
  await page.goto(base+process.env.BB_TEST_THREAD_PATH);
  const chat=page.locator('#thread-detail-timeline-panel .aura-capy-ink');await chat.waitFor();
  assert.equal(await chat.evaluate(e=>getComputedStyle(e).maskImage),'none');
  assert.equal(await page.getByRole('button',{name:'Dim background',exact:true}).count(),0);
 }
 console.log('PASS: settings-only half/full toggle; wallpaper ends at midpoint when on; no composer button; chats always full.');
}finally{await browser.close()}
