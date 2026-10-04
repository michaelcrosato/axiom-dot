import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
import * as world from '../src/world.ts';import * as session from '../src/session.ts';
class Store{data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null}setItem(k:string,v:string){this.data.set(k,v)}}
const full=(s:world.State)=>world.enableWaterRequests(world.enableCommonsTrade(world.enableEcology(world.enableEconomy(world.enableEncounters(s)))));
const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
test('occupied malformed, empty, wrong-world and upgraded pre-overnight checkpoints fail closed before any save writes',()=>{
 const old=world.createConnectedState(73129),raw=JSON.stringify(old,null,2)+'\n\n';
 for(const bad of ['', '{bad',world.serializeSave(world.createConnectedState(1)),world.serializeSave(world.enableEncounters(old)),world.serializeSave(world.enableCommonsTrade(old)),world.serializeSave(world.enableWaterRequests(old))]){
  const store=new Store();store.setItem(session.saveKey(old),raw);store.setItem(session.saveKey(old)+'-backup',raw);store.setItem(session.ACTIVE_WORLD_KEY,session.saveKey(old));store.setItem(session.preUpgradeKey(old),bad);const before=new Map(store.data);
  for(let i=0;i<3;i++)assert.throws(()=>session.storeSession(store,full(old),true),e=>e instanceof Error&&e.name==='RollbackCheckpointError');
  assert.deepEqual(store.data,before);assert.equal(session.preUpgradeSave(store,old),null);assert.equal(session.storedSaveText(store,old),raw);
 }
});
test('later-only packs cannot be mislabeled as a compatible pre-overnight save',()=>{
 let old=world.createConnectedState(73129);for(const o of world.activeObjects(old).filter(o=>o.kind==='scrap')){old=world.applyAction(old,{type:'move',...o});old=world.applyAction(old,{type:'collect',id:o.id});}
 const custom=world.applyAction(old,{type:'assemble-equipment',recipe:{version:2,seed:0,parts:{grip:'linen',shaft:'ash',head:'fork'}}});assert.equal(custom.equipment!.active!.version,2);
 for(const upgraded of [world.enableCommonsTrade(old),world.enableWaterRequests(old),custom]){const store=new Store(),raw=JSON.stringify(old,null,3)+'\n';store.setItem(session.saveKey(old),raw);session.storeSession(store,upgraded);assert.equal(session.preUpgradeSave(store,old),raw);const fabricated=new Store();fabricated.setItem(session.preUpgradeKey(old),world.serializeSave(upgraded));assert.equal(session.preUpgradeSave(fabricated,old),null);}
});
test('valid immutable checkpoint survives later saves and fresh upgraded worlds never invent one',()=>{
 const old=world.createConnectedState(3),store=new Store(),raw=JSON.stringify(old,null,1)+'\n';store.setItem(session.preUpgradeKey(old),raw);for(let i=0;i<3;i++)session.storeSession(store,full(old),true);assert.equal(session.preUpgradeSave(store,old),raw);
 const fresh=new Store();session.storeSession(fresh,full(old));assert.equal(session.preUpgradeSave(fresh,old),null);
});
test('stored checkpoint export is exact and read-only across primary, rolling and matching legacy aliases',()=>{
 for(const legacy of [false,true]){const old=legacy?world.createState(5):world.createConnectedState(5),raw=JSON.stringify(old,null,2)+'\n\n',keys=[session.saveKey(old),session.saveKey(old)+'-backup',...(legacy?[session.LEGACY_SAVE_KEY,'axiom-save-backup-v1']:[])];
  for(const key of keys){const store=new Store();store.setItem(session.saveKey(old),'{bad');store.setItem(key,raw);const before=new Map(store.data);assert.equal(session.storedSaveText(store,old),raw);assert.deepEqual(store.data,before);}
 }
 const store=new Store(),old=world.createConnectedState(5);store.setItem(session.saveKey(old),world.serializeSave(world.createConnectedState(6)));assert.equal(session.storedSaveText(store,old),null);
});
test('actual persist clearly pauses saving on invalid checkpoints while preserving playable in-memory state and exact stored export',()=>{
 const old=world.createConnectedState(73129),state=full(old),store=new Store(),raw=JSON.stringify(old,null,2)+'\n';store.setItem(session.saveKey(old),raw);store.setItem(session.preUpgradeKey(old),'{bad');const before=JSON.stringify(state),messages:string[]=[];
 const persist=source.slice(source.indexOf('function persist('),source.indexOf('/** Changing foundations'));
 const api=new Function('state','localStorage','storeSession','toast',stripTypeScriptTypes(`const startup={playing:true};let saveStatus='ready';const coop={active:false},coopPending=false,labActive=false,persistedSessionRevision=0,sessionReloading=false,sessionLoadFailed=false;function ensureSessionRevision(){return true}${persist};`)+`return {persist,status:()=>saveStatus};`)(state,store,session.storeSession,(s:string)=>messages.push(s));
 assert.equal(api.persist(),false);assert.match(api.status(),/Save paused.*rollback/);assert.match(messages.at(-1)!,/stored world is unchanged.*last stored checkpoint/);assert.equal(JSON.stringify(state),before);assert.equal(session.storedSaveText(store,old),raw);
 const quota=new Function('storeSession','toast',stripTypeScriptTypes(`const startup={playing:true};let state={},localStorage={},saveStatus='ready';const coop={active:false},coopPending=false,labActive=false,persistedSessionRevision=0,sessionReloading=false,sessionLoadFailed=false;function ensureSessionRevision(){return true}${persist};`)+`return {persist,status:()=>saveStatus};`)(()=>{throw Error('quota')},(s:string)=>messages.push(s));assert.equal(quota.persist(),false);assert.equal(quota.status(),'Save failed');assert.match(messages.at(-1)!,/Storage unavailable/);
});
test('actual last-stored export handler downloads original bytes and never current unsaved state',async()=>{
 assert.match(source,/<button id="export-stored">Export last stored checkpoint<\/button>/);const marker="$('export-stored').onclick=",start=source.indexOf(marker),end=source.indexOf(";$('",start),handler=source.slice(start,end+1),download=source.slice(source.indexOf('function downloadSaveText('),source.indexOf('function updateLabVisuals('));
 const old=world.createConnectedState(1),state=full(old),store=new Store(),raw=JSON.stringify(old,null,2)+'\n\n',button:{onclick?:()=>void}={},blobs:Blob[]=[],messages:string[]=[],links:any[]=[];store.setItem(session.saveKey(old),raw);const before=new Map(store.data);
 new Function('$','storedSaveText','localStorage','state','toast','Blob','URL','document','setTimeout',stripTypeScriptTypes(download+handler))(()=>button,session.storedSaveText,store,state,(s:string)=>messages.push(s),Blob,{createObjectURL:(b:Blob)=>{blobs.push(b);return 'blob:test'},revokeObjectURL(){}},{createElement:()=>{const a={href:'',download:'',click(){}};links.push(a);return a}},()=>{});
 button.onclick!();assert.equal(await blobs[0]!.text(),raw);assert.equal(links[0].download,'axiom-last-stored-checkpoint.json');assert.deepEqual(store.data,before);store.data.clear();button.onclick!();assert.equal(blobs.length,1);assert.match(messages.at(-1)!,/No valid stored checkpoint/);
});
