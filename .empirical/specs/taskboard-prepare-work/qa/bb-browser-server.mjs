import { chromium } from '/home/dyaus/.local/share/fnm/node-versions/v22.23.1/installation/lib/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,args:['--remote-debugging-port=9225']});
const context=await browser.newContext({viewport:{width:1500,height:1000}});
const page=await context.newPage();await page.goto('http://127.0.0.1:38886');
console.log('BB browser ready on local CDP 9225');
await new Promise(resolve=>{process.on('SIGTERM',resolve);process.on('SIGINT',resolve);});await browser.close();
