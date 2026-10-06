import {renderSlot} from '../../../../../plugins/agent-canvas/node_modules/@get-bb/plugin-sdk/dist/testing/app.js';
import {Workbench} from '../../../../../plugins/agent-canvas/workbench';
import {emptyDocument,createNode,connect,groupNodes,importDocument} from '../../../../../plugins/agent-canvas/document';
import type {Snapshot} from '../../../../../plugins/agent-canvas/contract';
let document=emptyDocument();
const a=createNode('note','fixture-project',{x:60,y:120,w:300,h:340});a.title='Release brief';a.content='# Release\n\n- Preserve live BB surfaces\n- Add canvas interactions\n- Verify shared context';
const b=createNode('text','fixture-project',{x:430,y:145,w:300,h:200});b.title='Design direction';b.content='A place for the whole team.';
const c=createNode('drawing','fixture-project',{x:430,y:370,w:300,h:230});c.title='Architecture sketch';c.strokes=[{points:[{x:30,y:80},{x:100,y:40},{x:170,y:110},{x:240,y:50}],color:'#578af3',width:4}];
document={...document,nodes:[a,b,c]};document=connect(document,a.id,b.id);document=groupNodes(document,[a.id,b.id],'Canvas refresh');
let revision=1;const stored=localStorage.getItem('fixture-shared-canvas');if(stored){const value=JSON.parse(stored);document=importDocument(JSON.stringify(value.document));revision=value.revision;}
const snapshot:Snapshot={capturedAt:Date.now(),truncated:false,browsersPartial:false,controlThreadId:null,threads:[],browsers:[]};
renderSlot({component:Workbench},{snapshot,refresh:()=>{}},{pluginId:'agent-canvas',sdk:{projects:{list:async()=>[{id:'fixture-project',name:'Canvas fixture'}]},environments:{list:async()=>[]}},rpc:{readDocument:()=>({revision,document}),saveDocument:(v:any)=>{if(v.revision!==revision)throw Error('Stale revision');document=v.document;revision++;localStorage.setItem('fixture-shared-canvas',JSON.stringify({revision,document}));return {revision};},presence:()=>({ok:true}),acknowledge:()=>({ok:true}),listFiles:()=>({paths:[],truncated:false})}});
