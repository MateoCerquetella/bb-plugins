import assert from 'node:assert/strict';
import {chromium} from '/home/dyaus/.local/share/fnm/node-versions/v22.23.1/installation/lib/node_modules/playwright/index.mjs';
import {sandboxHtml} from '../../../../plugins/taskboard/preparation/contract.ts';
import {writeFile} from 'node:fs/promises';
const escape=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const browser=await chromium.launch();const results=[];
try {
 for(const [name,html,click] of [
 ['script-self-navigation', '<button onclick="location.replace(\'https://example.invalid/navigation\')">Try</button>',true],
 ['self-link','<a href="https://example.invalid/link">Try</a>',true],
 ['meta-refresh','<meta http-equiv="refresh" content="0;url=https://example.invalid/refresh">',false],
 ['nested-frame','<iframe src="https://example.invalid/nested"></iframe>',false],
 ['fetch-image-style','<img src="https://example.invalid/image"><style>@import url(https://example.invalid/style);</style><script>fetch("https://example.invalid/fetch").catch(()=>{})</script>',false],
 ['form-submit','<form action="https://example.invalid/form"><button>Try</button></form>',true],
 ['top-navigation','<button onclick="top.location=\'https://example.invalid/top\'">Try</button>',true]
 ]) {
  const page=await browser.newPage();const requests=[];
  await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
  await page.setContent('<iframe sandbox="allow-scripts" srcdoc="'+escape(sandboxHtml(html))+'"></iframe>');
  if(click)await page.frameLocator('iframe').frameLocator('iframe').getByText('Try',{exact:true}).click();
  await page.waitForTimeout(200);assert.deepEqual(requests,[],name+' must block requests before network');results.push({case:name,networkRequests:requests.length,passed:true});await page.close();
 }
 const page=await browser.newPage();await page.setContent('<iframe sandbox="allow-scripts" srcdoc="'+escape(sandboxHtml('<button onclick="this.textContent=\'Worked\'">Try</button>'))+'"></iframe>');const frame=page.frameLocator('iframe').frameLocator('iframe');await frame.getByText('Try',{exact:true}).click();assert.equal(await frame.getByText('Worked',{exact:true}).count(),1);await page.close();
 await writeFile('.empirical/specs/taskboard-prepare-work/qa/preview-security.json',JSON.stringify({interactive:true,cases:results},null,2)+'\n');console.log(JSON.stringify(results));
}finally{await browser.close();}
