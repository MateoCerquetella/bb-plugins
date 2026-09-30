// Read-only live checks against the installed Aura plugin. No settings changed.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.BB_BASE_URL||'http://127.0.0.1:38886';
const shots=process.env.BB_SCREENSHOT_DIR||process.env.BB_THREAD_STORAGE;
if(!shots)throw new Error('Set BB_SCREENSHOT_DIR.');
await mkdir(shots+'/browser-tmp',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BB_CHROMIUM_PATH?{executablePath:process.env.BB_CHROMIUM_PATH}:{}),env:{...process.env,TMPDIR:shots+'/browser-tmp'},args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1050}});
 page.setDefaultTimeout(15000);
 const errors=[];page.on('console',m=>{if(m.text().includes('Aura:'))errors.push(m.text())});
 await page.goto(base);
 const panel=page.locator('[id="root-compose-main-panel"]');
 const content=panel.locator('[class~="@container/page"] > .mx-auto');
 await content.waitFor();await panel.locator('canvas[data-rendered]').waitFor();
 const positions=await content.evaluate(el=>{const c=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return {center:c.y+c.height/2,parentCenter:p.y+p.height/2,height:c.height}});
 assert.ok(Math.abs(positions.center-positions.parentCenter)<3,JSON.stringify(positions));
 await page.screenshot({path:shots+'/aura-centered.png'});
 const canvas=panel.locator('canvas');
 const box=await canvas.boundingBox();assert.ok(box);
 // Page screenshots avoid scrolling a decorative pointer-events:none canvas.
 const before=await page.screenshot({clip:box});await page.waitForTimeout(1100);const after=await page.screenshot({clip:box});
 assert.ok(!before.equals(after),'Photo dithering must animate');
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(150);
 const still=await page.screenshot({clip:box});await page.waitForTimeout(500);
 assert.ok(still.equals(await page.screenshot({clip:box})),'Reduced motion must freeze dithering');
 await page.setViewportSize({width:850,height:350});
 const reachable=await content.evaluate(el=>{const p=el.parentElement;return el.getBoundingClientRect().top>=p.getBoundingClientRect().top-1});assert.ok(reachable,'Composer must stay reachable in short windows');
 if(process.env.BB_TEST_THREAD_PATH){
  await page.setViewportSize({width:1440,height:1050});
  await page.goto(base+process.env.BB_TEST_THREAD_PATH);
  const reading=page.locator('[id="thread-detail-timeline-panel"] .thread-scrollbar > div > .mx-auto');
  await reading.waitFor();
  await page.waitForFunction(()=>document.querySelector('style[data-aura]')?.textContent.includes('box-shadow'));
  assert.equal(await page.locator('[id="thread-detail-timeline-panel"] .aura-capy-focus').evaluate(e=>getComputedStyle(e).opacity),'0');
  assert.equal(await page.locator('[id="thread-detail-timeline-panel"] .aura-capy-fade').evaluate(e=>getComputedStyle(e).opacity),'0');
  const color=await reading.evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.ok(color!=='transparent'&&color!=='rgba(0, 0, 0, 0)',color);
  await page.screenshot({path:shots+'/aura-readable.png'});
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: centered composer, animated photo, reduced motion, short viewport access, and opaque reading surface.');
}finally{await browser.close()}
