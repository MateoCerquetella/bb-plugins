import assert from "node:assert/strict";
import test from "node:test";
import {documentSchema,emptyDocument} from "./document.ts";
import {seedStarterRoles} from "./roles.ts";

test("existing canvases gain usable presets without overwriting custom roles",()=>{
 const current=emptyDocument();
 const custom={id:"custom-engineer",name:"Engineer",color:"#123456",instructions:"Use our project conventions",maestro:false};
 const {rolePresetsVersion:_,...settings}=current.settings;
 const legacy=documentSchema.parse({...current,settings,roles:[custom]});
 const migrated=seedStarterRoles(legacy);
 assert.equal(migrated.roles.length,5);
 assert.deepEqual(migrated.roles.find(role=>role.name==="Engineer"),custom);
 assert.ok(migrated.roles.filter(role=>role.id!==custom.id).every(role=>role.instructions.length>100));
 assert.equal(migrated.roles.find(role=>role.name==="Maestro")?.maestro,true);
 assert.equal(migrated.settings.rolePresetsVersion,1);
 assert.equal(documentSchema.safeParse(migrated).success,true);
});

test("deleted presets stay deleted after reload and full role libraries stay bounded",()=>{
 const current=seedStarterRoles(emptyDocument());
 const deleted={...current,roles:current.roles.filter(role=>role.id!=="preset-reviewer")};
 assert.equal(seedStarterRoles(documentSchema.parse(deleted)).roles.some(role=>role.id==="preset-reviewer"),false);
 const full={...current,settings:{...current.settings,rolePresetsVersion:0},roles:Array.from({length:100},(_,i)=>({id:`role-${i}`,name:`Role ${i}`,color:"#123456",instructions:"custom",maestro:false}))};
 const migrated=seedStarterRoles(full);
 assert.equal(migrated.roles.length,100);
 assert.deepEqual(migrated.roles,full.roles);
 assert.equal(documentSchema.safeParse(migrated).success,true);
});
