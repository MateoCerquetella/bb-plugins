// Capture the real installed UI with browser-only mock data. No server writes.
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.BB_BASE_URL||'http://127.0.0.1:38886';
const dir=process.env.BB_SCREENSHOT_DIR;if(!dir)throw new Error('Set BB_SCREENSHOT_DIR');
await mkdir(dir,{recursive:true});
const temp=process.env.BB_THREAD_STORAGE+'/aura-browser-temp';await mkdir(temp,{recursive:true});
const snapshot=(await(await fetch(base+'/api/v1/plugins/aura/rpc/get',{method:'POST',headers:{'Content-Type':'application/json'},body:'null'})).json()).result;
assert.ok(snapshot.slots.length>=2,'Two saved wallpapers required');
const bootstrap=await(await fetch(base+'/api/v1/sidebar-bootstrap')).json();
const sourceProject=bootstrap.projects.find(p=>p.threads.length);
const thread=sourceProject.threads[0];
const now=Date.now();
const groups=[['Studio',['Polish the landing page','Build the component library','Review accessibility']],['Weekend project',['Plan the next release','Add keyboard shortcuts']],['Ideas',['Explore a calmer workspace']]];
const mockProjects=groups.map(([name,titles],i)=>({...structuredClone(sourceProject),id:`proj_demo_${i}`,name,gitRemoteUrl:null,sources:[],threads:titles.map((title,j)=>({...structuredClone(thread),id:`thr_demo_${i}_${j}`,projectId:`proj_demo_${i}`,title,titleFallback:title,environmentId:null,environmentBranchName:`feature/${title.toLowerCase().replaceAll(' ','-')}`,environmentName:'Workspace',environmentHostId:null,parentThreadId:null,sourceThreadId:null,originKind:'user',originPluginId:null,hasPendingInteraction:false,archivedAt:null,deletedAt:null,pinnedAt:null,sectionId:bootstrap.sections[0]?.id??null,status:j===0?'active':'idle',runtime:{displayStatus:j===0?'active':'idle',hostReconnectGraceExpiresAt:null},activity:{activeBackgroundAgentCount:0,activeBackgroundCommandCount:0,activeGoalCount:0,activePlanModeCount:0,activeWorkflowCount:0},queuedWork:null,createdAt:now-(j+1)*180000,updatedAt:now-(j+1)*60000,lastReadAt:now,latestAttentionAt:null}))}));
const browser=await chromium.launch({headless:true,...(process.env.BB_CHROMIUM_PATH?{executablePath:process.env.BB_CHROMIUM_PATH}:{}),env:{...process.env,TMPDIR:temp},args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{
 for(let i=0;i<2;i++){
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2,reducedMotion:'reduce'});
  await context.routeWebSocket('**',socket=>{const server=socket.connectToServer();server.onMessage(()=>{});});
  const selected=snapshot.slots[i];
  const mock={...snapshot,settings:{...selected.settings,enabled:true,newThreadOnly:true,imageOpacity:i===0?.68:.56,fade:1},image:selected.image,activeSlot:selected.slot,slots:snapshot.slots.map((s,j)=>({...s,name:j===0?'Alpine lake':'Moonlight'}))};
  await context.route('**/api/v1/sidebar-bootstrap',route=>route.fulfill({json:{...bootstrap,sections:bootstrap.sections.map(s=>({...s,name:'Workspace'})),projects:mockProjects,personalProject:{...bootstrap.personalProject,name:'Personal',sources:[],threads:[]}}}));
  await context.route('**/api/v1/plugins/aura/rpc/get',route=>route.fulfill({json:{ok:true,result:mock}}));
  await context.route('**/api/v1/hosts',async route=>{const r=await route.fetch();const hosts=await r.json();await route.fulfill({json:hosts.map((h,j)=>({...h,name:j===0?'Studio Mac':`Development ${j}`,hostname:`studio-${j}`}))});});
  const page=await context.newPage();page.setDefaultTimeout(20000);
  await page.goto(base);await page.locator('[id="root-compose-main-panel"] .aura-capy-ink canvas[data-rendered]').waitFor();
  await page.waitForTimeout(350);
  await page.evaluate(()=>{document.activeElement?.blur?.();});
  const text=await page.locator('body').innerText();
  for(const secret of ['dyaus','cerquetella','nullhunter','empirical-sdd','freebee','Wipe Naranja','bb/create-thread']) assert.ok(!text.includes(secret),`Unsanitized demo text: ${secret}`);
  await page.screenshot({path:`${dir}/aura-${i===0?'alpine':'moonlight'}.jpg`,type:'jpeg',quality:88});
  if(i===0){await page.goto(base+'/settings/plugins/aura');await page.getByRole('button',{name:'Apply background',exact:true}).waitFor();await page.getByRole('button',{name:'Use slot 1: Alpine lake',exact:true}).waitFor();await page.locator('.aura-library').scrollIntoViewIfNeeded();await page.screenshot({path:`${dir}/aura-slots.jpg`,type:'jpeg',quality:88});}
  await context.close();
 }
 console.log('Captured both wallpapers and saved slots with mock data at 2× resolution.');
}finally{await browser.close()}
