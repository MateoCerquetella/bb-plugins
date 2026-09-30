// Layout regression for BB's wide Markdown-table markup, using Aura's real CSS.
// Run with: node --experimental-strip-types test/table-readability.browser.mjs
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { READING_SURFACE } from '../lib/background.ts';
import assert from 'node:assert/strict';
const shots=process.env.BB_SCREENSHOT_DIR||process.env.BB_THREAD_STORAGE||tmpdir();
await mkdir(shots+'/browser-tmp',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.BB_CHROMIUM_PATH?{executablePath:process.env.BB_CHROMIUM_PATH}:{}),env:{...process.env,TMPDIR:shots+'/browser-tmp'},args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:850}});
 for(const dark of [false,true]){
  await page.setContent(`<style>
  :root{--background:${dark?'#181818':'#ffffff'};--border:${dark?'#393939':'#dedee7'};color:${dark?'#eeeeee':'#202020'};font:16px/1.5 sans-serif;}
  body{margin:0;background:repeating-conic-gradient(#507793 0% 25%,#a1bfce 0% 50%) 0/12px 12px;}
  .thread-scrollbar{overflow:auto;height:850px}.mx-auto{max-width:760px;margin:0 auto;min-height:850px;padding:24px;box-sizing:border-box;}
  .breakout{width:min(1320px,calc(100vw - 32px));margin-inline:calc((100% - min(1320px,calc(100vw - 32px)))/2);display:flex;justify-content:center;}
  .overflow-x-auto{width:max-content;max-width:100%;overflow-x:auto}table{width:1200px;border-collapse:collapse}th,td{padding:12px;border:1px solid var(--border);text-align:left}thead{background:${dark?'#242424':'#f5f5f5'}}
  ${READING_SURFACE}</style>
  <div id="thread-detail-timeline-panel"><div class="thread-scrollbar"><div><div class="mx-auto"><div data-markdown-preview>
  <p>A wide table must remain readable outside the normal message column.</p>
  <div class="breakout"><div class="overflow-x-auto"><table><thead><tr><th>Area</th><th>Proposed improvement</th><th>Result</th></tr></thead><tbody>
  <tr><td>Navigation</td><td>Give each workspace a clear starting point and keyboard access.</td><td>Focused navigation</td></tr>
  <tr><td>Activity</td><td>Group updates by project and keep the latest results near the top.</td><td>Readable updates</td></tr>
  <tr><td>Layout</td><td>Keep wide content legible without clipping its columns or hiding values.</td><td>All columns available</td></tr>
  </tbody></table></div></div></div></div></div></div></div>`);
  const result=await page.locator('table').evaluate(table=>{const surface=table.parentElement;const column=table.closest('.mx-auto');return {table:getComputedStyle(table).backgroundColor,surface:getComputedStyle(surface).backgroundColor,column:getComputedStyle(column).backgroundColor,width:table.getBoundingClientRect().width,columnWidth:column.getBoundingClientRect().width,overflow:getComputedStyle(surface).overflowX}});
  assert.ok(result.width>result.columnWidth);
  assert.equal(result.table,result.column);
  assert.equal(result.surface,result.column);
  assert.equal(result.overflow,'auto');
  await page.screenshot({path:`${shots}/wide-table-${dark?'dark':'light'}.png`});
  await page.setViewportSize({width:390,height:850});
  assert.ok(await page.locator('.overflow-x-auto').evaluate(el=>el.scrollWidth>el.clientWidth),'Narrow windows keep horizontal scrolling');
  assert.ok(await page.locator('.overflow-x-auto').evaluate(el=>{el.scrollLeft=400;return el.scrollLeft>0}));
  await page.setViewportSize({width:1440,height:850});
 }
 console.log('PASS: wide tables retain opaque backing in light/dark themes and scroll on narrow screens.');
} finally {await browser.close()}
