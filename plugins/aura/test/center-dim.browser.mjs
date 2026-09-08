// Read-only live check. Changes dimming only in this browser's in-memory view.
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.BB_BASE_URL||'http://127.0.0.1:38886';
const shots=process.env.BB_SCREENSHOT_DIR||process.env.BB_THREAD_STORAGE;
if(!shots)throw new Error('Set BB_SCREENSHOT_DIR');
await mkdir(shots+'/browser-tmp',{recursive:true});
const saved=(await(await fetch(base+'/api/v1/plugins/aura/rpc/get',{method:'POST',headers:{'Content-Type':'application/json'},body:'null'})).json()).result;
assert.ok(saved.image,'A saved photo is needed for the live check');
const browser=await chromium.launch({headless:true,...(process.env.BB_CHROMIUM_PATH?{executablePath:process.env.BB_CHROMIUM_PATH}:{}),env:{...process.env,TMPDIR:shots+'/browser-tmp'},args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1800,height:1100},reducedMotion:'reduce'});
 await page.goto(base);await page.locator('#root-compose-main-panel .aura-capy-ink[data-center-dim] canvas[data-rendered]').waitFor();
 const setDim=async fade=>page.evaluate(snapshot=>window.dispatchEvent(new CustomEvent('bb:aura:changed',{detail:snapshot})),{...saved,settings:{...saved.settings,enabled:true,fade}});
 for(const dark of [false,true]) {
  await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
  await setDim(1);
  const ink=page.locator('#root-compose-main-panel .aura-capy-ink');
  assert.notEqual(await ink.evaluate(e=>getComputedStyle(e).maskImage),'none');
  assert.equal(await ink.evaluate(e=>e.style.getPropertyValue('--aura-center-visibility')),'0');
  const panel=await page.locator('#root-compose-main-panel').boundingBox();
  const composer=await page.locator('#root-compose-main-panel [data-promptbox]').boundingBox();
  // Sample just above the composer, not its own opaque card.
  const clip={x:composer.x+composer.width/2-20,y:composer.y-35,width:40,height:20};
  await page.waitForTimeout(100);
  const dimmed=await page.screenshot({clip});
  await page.locator('#root-compose-main-panel').screenshot({path:`${shots}/center-dim-${dark?'dark':'light'}.jpg`,type:'jpeg',quality:88});
  await setDim(0);await page.waitForTimeout(100);
  const full=await page.screenshot({clip});
  assert.ok(!dimmed.equals(full),'The wallpaper above the composer must visibly respond to the dimmer');
  assert.equal(await ink.evaluate(e=>e.style.getPropertyValue('--aura-center-visibility')),'1');
  assert.ok(panel.width>0);
 }
 console.log('PASS: direct center mask is active and visibly responds to the dimmer in light/dark mode.');
}finally{await browser.close()}
