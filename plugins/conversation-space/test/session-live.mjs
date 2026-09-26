import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const url=process.env.BB_TEST_THREAD_URL;
if(!url)throw new Error('Set BB_TEST_THREAD_URL');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium'});
try{
 const context=await browser.newContext({viewport:{width:1280,height:1000},permissions:['clipboard-read','clipboard-write']});
 const page=await context.newPage();
 await page.goto(url);
 const trigger=page.getByRole('button',{name:'Conversation space',exact:true});await trigger.waitFor();await page.waitForTimeout(1000);await trigger.click();
 await page.getByRole('button',{name:'View details',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Session usage',exact:true});await dialog.waitFor();
 await dialog.locator('.cs-message').first().waitFor();
 assert.equal(await page.locator('.cs-popover:popover-open').count(),0);
 assert.match(await dialog.innerText(),/Context used/);assert.doesNotMatch(await dialog.innerText(),/Not reported|Billing plan not reported/);assert.match(await dialog.innerText(),/Estimated tokens/);assert.match(await dialog.innerText(),/Raw message data/);
 await page.screenshot({path:'docs/media/conversation-space-session.png'});
 const before=await dialog.locator('.cs-message').count();assert.ok(before>0);
 await dialog.getByRole('button',{name:'Assistant',exact:true}).click();assert.equal(await dialog.locator('.cs-role-user').count(),0);
 await dialog.getByRole('button',{name:'All',exact:true}).click();
 await dialog.getByRole('textbox',{name:'Search messages'}).fill(`no-record-${crypto.randomUUID()}`);await dialog.getByText('No matching records.',{exact:true}).waitFor();
 await dialog.getByRole('textbox',{name:'Search messages'}).fill('');
 await dialog.locator('.cs-message summary').first().click();assert.ok(await dialog.locator('.cs-message pre').first().isVisible());
 await dialog.getByRole('button',{name:'Copy JSON',exact:false}).click();await dialog.getByRole('status').filter({hasText:'Copied'}).waitFor();
 const copied=await page.evaluate(()=>navigator.clipboard.readText());assert.ok(JSON.parse(copied).messages.length>0);
 const more=dialog.getByRole('button',{name:'Load older records'});if(await more.count()){await more.click();await page.waitForFunction(n=>document.querySelectorAll('.cs-message').length>n,before);}
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 await page.setViewportSize({width:390,height:844});await trigger.click();await page.getByRole('button',{name:'View details',exact:true}).click();await dialog.waitFor();
 assert.ok((await dialog.boundingBox()).width<=390);await page.screenshot({path:'docs/media/conversation-space-session-mobile.png'});
 await dialog.getByRole('button',{name:'Close session usage'}).click();await dialog.waitFor({state:'hidden'});
 console.log('PASS real Session usage layout, records, role filter, search, expansion, Copy JSON, pagination, Escape, close and mobile bounds');
}finally{await browser.close();}
