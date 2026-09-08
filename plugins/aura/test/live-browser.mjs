// Opt-in live checks. Uses one empty slot and restores the user's active state.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const base=process.env.BB_BASE_URL||'http://127.0.0.1:38886';
const shots=process.env.BB_SCREENSHOT_DIR||process.env.BB_THREAD_STORAGE;
if(!shots)throw new Error('Set BB_SCREENSHOT_DIR.');
await mkdir(shots,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BB_CHROMIUM_PATH?{executablePath:process.env.BB_CHROMIUM_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1050}});
page.setDefaultTimeout(15000);
const rpc=async(method,input=null)=>{const r=await page.request.post(`${base}/api/v1/plugins/aura/rpc/${method}`,{data:JSON.stringify(input),headers:{'Content-Type':'application/json'}});const b=await r.json();assert.equal(b.ok,true,JSON.stringify(b.error));return b.result;};
const original=await rpc('get');
const slot=[6,5,4,3,2,1].find(n=>!original.slots.some(s=>s.slot===n));
if(!slot){await browser.close();throw new Error('An empty slot is required for the live check.');}
const testName='__Aura verification__';
let backup=null;
if(original.image){const r=await page.request.get(`${base}/api/v1/plugins/aura/http/image?v=${original.image.version}`);assert.equal(r.status(),200);backup={name:original.image.name,dataUrl:`data:${original.image.mime};base64,${(await r.body()).toString('base64')}`};}
try {
  await page.goto(`${base}/settings/plugins/aura`);
  const apply=page.getByRole('button',{name:'Apply background',exact:true});await apply.waitFor();
  if(original.image){await page.waitForFunction(()=>document.querySelector('.aura-capy-ink[data-image] canvas[data-rendered]'));assert.equal(await page.locator('.aura-capy-fade').evaluate(e=>getComputedStyle(e).opacity),'0');}
  await page.getByLabel('Save to slot').selectOption(String(slot));
  await page.getByLabel('Slot name').fill(testName);
  const fixtures=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.width=320;c.height=200;const g=c.getContext('2d');g.fillStyle='#ab6038';g.fillRect(0,0,320,200);g.fillStyle='#41669d';g.fillRect(120,0,200,200);
    return ['image/png','image/jpeg'].map(mime=>({mime,data:c.toDataURL(mime).split(',')[1]}));
  });
  for(const fixture of fixtures){
    const name=fixture.mime==='image/png'?'aura-test.png':'aura-test.jpg';
    await page.getByLabel('Upload background image').setInputFiles({name,mimeType:fixture.mime,buffer:Buffer.from(fixture.data,'base64')});
    await page.getByText('Image ready — apply to save',{exact:true}).waitFor();
    await page.getByRole('button',{name:new RegExp(`^(Save|Replace) slot ${slot}$`)}).click();
    await page.getByText(`Saved to slot ${slot}`,{exact:true}).waitFor();
    const saved=await rpc('get');assert.equal(saved.activeSlot,slot);assert.equal(saved.image.name,name);
    const image=await page.request.get(`${base}/api/v1/plugins/aura/http/image?v=${saved.image.version}`);assert.equal(image.status(),200);assert.deepEqual(await image.body(),Buffer.from(fixture.data,'base64'));
    await page.waitForFunction(()=>document.querySelector('.aura-capy-ink[data-image] canvas[data-rendered]'));
  }
  await page.getByLabel('New thread screen only',{exact:true}).check();await apply.click();
  await page.getByText('Applied to the New thread screen',{exact:true}).waitFor();
  await page.getByRole('button',{name:`Use slot ${slot}: ${testName}`,exact:true}).click();
  await page.getByText(`Using ${testName}`,{exact:true}).waitFor();
  assert.equal((await rpc('get')).settings.newThreadOnly,true);
  const css=await page.locator('style[data-aura]').textContent();assert.ok(css.includes('root-compose-main-panel'));assert.ok(!css.includes('thread-detail-timeline-panel'));
  const beforeBad=await rpc('get');
  await page.getByLabel('Upload background image').setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('not a PNG')});await page.getByRole('alert').waitFor();assert.equal((await rpc('get')).image.version,beforeBad.image.version);
  await page.reload();await apply.waitFor();await page.getByText(testName,{exact:true}).first().waitFor();
  assert.equal(await page.getByLabel('New thread screen only',{exact:true}).isChecked(),true);
  if(original.activeSlot){const name=original.slots.find(s=>s.slot===original.activeSlot).name;await page.getByRole('button',{name:`Use slot ${original.activeSlot}: ${name}`,exact:true}).click();await page.getByText(`Using ${name}`,{exact:true}).waitFor();assert.equal((await rpc('get')).image?.version,original.image?.version);}
  await page.locator('.aura-library').screenshot({path:`${shots}/aura-slots.png`});
  await page.getByLabel('New thread screen only',{exact:true}).uncheck();await apply.click();await page.getByText('Applied to all threads',{exact:true}).waitFor();assert.ok((await page.locator('style[data-aura]').textContent()).includes('thread-detail-timeline-panel'));
  await page.setViewportSize({width:390,height:844});await apply.scrollIntoViewIfNeeded();assert.equal(await page.locator('.aura-editor').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
  await page.screenshot({path:`${shots}/aura-mobile.png`});
  console.log('PASS: PNG/JPG rendering, atomic slot saves, switching, scope toggle, invalid upload, reload and mobile layout.');
} finally {
  try {
    if(original.activeSlot)await rpc('activateSlot',{slot:original.activeSlot});
    await rpc('apply',{settings:original.settings,image:original.activeSlot?{action:'keep'}:backup?{action:'replace',...backup}:{action:'remove'}});
    const latest=await rpc('get');if(latest.slots.find(s=>s.slot===slot)?.name===testName)await rpc('deleteSlot',{slot});
  } finally {await browser.close();}
}
