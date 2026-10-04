import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createConnectedState,createRegionalState,applyAction,activeObjects,serializeSave,parseSave,enableEncounters,enableEconomy,enableEcology,enableCaveSupply,enableCommonsTrade,enableWaterRequests,type State} from '../src/world.ts';
import {ACTIVE_WORLD_KEY,LEGACY_SAVE_KEY,saveKey,loadSlot,loadSession,storeSession,loadSavedWorld,storedSaveText,savedWorlds,selectSeed,selectRegionalSeed,preUpgradeKey,preUpgradeSave,preContactKey,preContactSave,sessionEpochKey,sessionResetRevision,preResetSave,sessionRecoverySaves,createSessionResetOperation,restartSession,restoreResetSession} from '../src/session.ts';
class Store {
 data=new Map<string,string>();writes:string[]=[];fail:string|null=null;
 getItem(k:string){return this.data.get(k)??null;}
 setItem(k:string,v:string){this.writes.push(k);if(k===this.fail)throw Error('Quota exceeded');this.data.set(k,v);}
 get length(){return this.data.size;}
 key(i:number){return [...this.data.keys()][i]??null;}
}
function progress(s:State){const item=activeObjects(s).find(o=>o.kind==='scrap')!;s=applyAction(s,{type:'move',x:item.x,z:item.z});return applyAction(s,{type:'collect',id:item.id});}
function packs(s:State){return enableWaterRequests(enableCommonsTrade(enableCaveSupply(enableEcology(enableEconomy(enableEncounters(s))))));}
function initial(s:State){return s.regional?createRegionalState(s.seed):s.generation===1?createState(s.seed):createConnectedState(s.seed);}

for(const factory of [createState,createConnectedState,createRegionalState])test(`restart ${factory.name} keeps exact foundation and seed, clearing all progress`,()=>{
 const store=new Store(),current=packs(progress(factory(73129)));storeSession(store,current,true);
 const original=new Map(store.data),before=serializeSave(current),operation=createSessionResetOperation(store,current);assert.deepEqual(store.data,original,'preparation and Cancel are read-only');
 const result=operation.commit();assert.equal(result.committed,true);assert.deepEqual(result.state,initial(current));assert.deepEqual(loadSession(store),initial(current));assert.equal(preResetSave(store,current),before);
 for(const [key,value] of original)assert.equal(store.getItem(key),value,'original slots and checkpoints are untouched');
 const after=new Map(store.data),writes=store.writes.length;assert.equal(operation.commit().committed,false);assert.equal(store.writes.length,writes);assert.deepEqual(store.data,after,'duplicate confirmation is exactly once');
});

test('every other seed, flavor, legacy save, checkpoint and setting retains exact bytes',()=>{
 const store=new Store(),old=progress(createState(17)),connected=progress(createConnectedState(17)),region=progress(createRegionalState(17)),other=progress(createRegionalState(18));
 store.setItem(LEGACY_SAVE_KEY,JSON.stringify(old,null,2)+'\n');for(const s of [old,connected,other,region])storeSession(store,s,true);store.setItem('axiom-sound','off');
 const before=new Map(store.data);restartSession(store,region);for(const [key,value] of before)assert.equal(store.getItem(key),value,key);
 assert.deepEqual(loadSavedWorld(store,old),old);assert.deepEqual(loadSavedWorld(store,connected),connected);assert.deepEqual(loadSavedWorld(store,other),other);assert.deepEqual(loadSession(store),createRegionalState(17));assert.equal(savedWorlds(store).length,4);
});

test('protected pre-reset bytes survive autosaves, another restart, recovery and later autosaves',()=>{
 const store=new Store(),old=progress(createRegionalState(17)),raw=JSON.stringify(old,null,3)+'\n\n';store.setItem(saveKey(old),raw);store.setItem(ACTIVE_WORLD_KEY,saveKey(old));
 let current=restartSession(store,old);const firstKey=`${saveKey(old)}-before-reset-1`;assert.equal(preResetSave(store,current),raw);
 for(let i=0;i<12;i++){current=applyAction(packs(current),{type:'tick',dt:.25});storeSession(store,current,true);}assert.equal(store.getItem(firstKey),raw);assert.equal(preResetSave(store,current),raw);
 assert.equal(storedSaveText(store,current),serializeSave(current));assert.deepEqual(loadSavedWorld(store,current),current);assert.deepEqual(selectRegionalSeed(store,current.seed),current);
 const secondRaw=serializeSave(current);current=restartSession(store,current);assert.equal(preResetSave(store,current),raw,'a later restart does not replace the first pending recovery');assert.equal(store.getItem(`${saveKey(old)}-before-reset-2`),secondRaw);assert.equal(store.getItem(firstKey),raw);
 const newProgress=progress(current);storeSession(store,newProgress,true);const restored=restoreResetSession(store,newProgress);assert.equal(storedSaveText(store,restored),raw);assert.deepEqual(loadSession(store),parseSave(raw));
 assert.equal(store.getItem(`${saveKey(old)}-before-restore-3`),serializeSave(newProgress),'restoring also protects the displaced fresh run');
 for(let i=0;i<4;i++)storeSession(store,applyAction(restored,{type:'tick',dt:.25}),true);assert.equal(preResetSave(store,restored),raw,'the original recovery remains accessible even after recovery');assert.equal(store.getItem(firstKey),raw);const live=loadSession(store),liveRaw=serializeSave(live);restartSession(store,live);assert.equal(preResetSave(store,live),raw,'a later restart never replaces the first recovery');assert.equal(store.getItem(firstKey),raw);const history=sessionRecoverySaves(store,live);assert.deepEqual(history.map(h=>h.epoch),[4,3,2,1]);assert.deepEqual(history.map(h=>h.kind),['restart','restore','restart','restart']);assert.equal(history[0]!.raw,liveRaw);assert.equal(history[1]!.raw,serializeSave(newProgress));assert.equal(history[2]!.raw,secondRaw);assert.equal(history[3]!.raw,raw);
});

test('checkpoint and atomic-commit quota failures preserve current save, pointer and existing recoveries',()=>{
 for(const priorRestart of [false,true])for(const phase of ['checkpoint','commit']){
  const store=new Store();let current=progress(createConnectedState(17));storeSession(store,current,true);if(priorRestart){current=progress(restartSession(store,current));storeSession(store,current,true);}
  const before=loadSession(store),raw=storedSaveText(store,current),selected=store.getItem(ACTIVE_WORLD_KEY),protectedRaw=preResetSave(store,current),original=new Map(store.data);
  store.fail=phase==='commit'?sessionEpochKey(current):`${saveKey(current)}-before-reset-${priorRestart?2:1}`;
  const operation=createSessionResetOperation(store,current);assert.throws(()=>operation.commit(),/Quota/);
  assert.deepEqual(loadSession(store),before);assert.equal(storedSaveText(store,current),raw);assert.equal(store.getItem(ACTIVE_WORLD_KEY),selected);assert.equal(preResetSave(store,current),protectedRaw);for(const [key,value] of original)assert.equal(store.getItem(key),value);
  store.fail=null;assert.equal(operation.commit().committed,true,'retry may reuse a staged protected checkpoint');assert.deepEqual(loadSession(store),createConnectedState(17));
 }
});

test('restore failures preserve the fresh run and its original recovery checkpoint',()=>{
 for(const phase of ['checkpoint','commit']){
  const store=new Store(),old=progress(createConnectedState(17));storeSession(store,old,true);const current=progress(restartSession(store,old));storeSession(store,current,true);const before=new Map(store.data);
  store.fail=phase==='commit'?sessionEpochKey(current):`${saveKey(current)}-before-restore-2`;assert.throws(()=>restoreResetSession(store,current),/Quota/);assert.deepEqual(loadSession(store),current);assert.equal(preResetSave(store,current),serializeSave(old));for(const [key,value] of before)assert.equal(store.getItem(key),value);
 }
});

test('unsaved live progress is checkpointed without an initial mutating save',()=>{
 const store=new Store(),current=progress(createRegionalState(73129));assert.equal(loadSession(store).seed,current.seed);const before=serializeSave(current);restartSession(store,current);assert.equal(preResetSave(store,current),before);assert.deepEqual(loadSession(store),createRegionalState(73129));assert.equal(store.getItem(ACTIVE_WORLD_KEY),null);assert.equal(store.getItem(saveKey(current)),null);assert.equal(savedWorlds(store).length,1);
 const minimal={getItem:(key:string)=>store.getItem(key),setItem:(key:string,v:string)=>store.setItem(key,v)};assert.deepEqual(loadSession(minimal),createRegionalState(73129));
});

test('legacy-only and legacy-selected generation-1 sessions restart without modifying the v1 alias',()=>{
 for(const pointer of [false,true]){
  const store=new Store(),old=progress(createState(17)),raw=JSON.stringify(old,null,1)+'\n';store.setItem(LEGACY_SAVE_KEY,raw);if(pointer)store.setItem(ACTIVE_WORLD_KEY,LEGACY_SAVE_KEY);
  const current=loadSession(store);restartSession(store,current);assert.equal(loadSession(store).generation,1);assert.deepEqual(loadSession(store),createState(17));assert.equal(store.getItem(LEGACY_SAVE_KEY),raw);assert.equal(store.getItem(ACTIVE_WORLD_KEY),pointer?LEGACY_SAVE_KEY:null);assert.equal(preResetSave(store,current),raw);assert.deepEqual(loadSlot(store,LEGACY_SAVE_KEY),createState(17));
  assert.deepEqual(restoreResetSession(store,loadSession(store)),old);assert.equal(store.getItem(LEGACY_SAVE_KEY),raw);
 }
});

test('seed selection resumes epoch progress and never mistakes an existing slot for fresh',()=>{
 const store=new Store(),old=progress(createConnectedState(17));storeSession(store,old,true);let current=restartSession(store,old);current=progress(current);storeSession(store,current,true);assert.deepEqual(selectSeed(store,17),current);assert.deepEqual(selectRegionalSeed(store,17),createRegionalState(17));assert.deepEqual(selectSeed(store,18),createConnectedState(18));
 const other=createRegionalState(18);storeSession(store,other,true);assert.equal(loadSession(store).seed,18);storeSession(store,selectSeed(store,17),true);assert.deepEqual(loadSession(store),current);assert.equal(preResetSave(store,current),serializeSave(old));
});

test('corrupt or wrong-world recovery data cannot restore or overwrite current progress',()=>{
 for(const corrupt of [null,'{bad',serializeSave(createRegionalState(18))]){
  const store=new Store(),old=progress(createRegionalState(17));storeSession(store,old,true);const fresh=restartSession(store,old),key=`${saveKey(old)}-before-reset-1`;if(corrupt===null)store.data.delete(key);else store.setItem(key,corrupt);
  const before=new Map(store.data);assert.equal(preResetSave(store,fresh),null);assert.throws(()=>restoreResetSession(store,fresh),/No valid pre-restart/);assert.deepEqual(store.data,before);assert.deepEqual(loadSession(store),fresh);
 }
});

test('invalid record blocks further writes while current and original raw sources remain intact',()=>{
 const store=new Store(),old=progress(createRegionalState(17));storeSession(store,old,true);restartSession(store,old);store.setItem(sessionEpochKey(old),'{bad');const before=new Map(store.data);assert.throws(()=>storeSession(store,old,true),/session record is invalid/);assert.throws(()=>restartSession(store,old),/session record is invalid/);assert.deepEqual(store.data,before);
});

test('corrupt current epoch payload falls back to its rolling backup without touching reset recovery',()=>{
 const store=new Store(),old=progress(createRegionalState(17));storeSession(store,old,true);const fresh=restartSession(store,old),current=progress(fresh);storeSession(store,current,true);const epoch=JSON.parse(store.getItem(sessionEpochKey(old))!);epoch.current='{bad';store.setItem(sessionEpochKey(old),JSON.stringify(epoch));assert.deepEqual(loadSession(store),fresh);assert.equal(storedSaveText(store,old),serializeSave(fresh));assert.equal(preResetSave(store,old),serializeSave(old));storeSession(store,current,true);assert.deepEqual(loadSession(store),current);
});

test('old confirmations reject autosaves, pointer changes, mutations and a newer reset without writes',()=>{
 for(const change of ['autosave','pointer','in-memory','reset']){
  const store=new Store(),old=progress(createRegionalState(17));storeSession(store,old,true);const operation=createSessionResetOperation(store,old);
  if(change==='autosave')storeSession(store,applyAction(old,{type:'tick',dt:.25}),true);
  if(change==='pointer')storeSession(store,createConnectedState(18),true);
  if(change==='in-memory')old.events.push('Uncommitted change');
  if(change==='reset')restartSession(store,old);
  const before=new Map(store.data);assert.throws(()=>operation.commit(),/session changed/);assert.deepEqual(store.data,before);
 }
});

test('pre-upgrade and pre-contact checkpoints retain exact original bytes across fresh epochs',()=>{
 const store=new Store(),old=progress(createRegionalState(17)),raw=JSON.stringify(old,null,2)+'\n';store.setItem(saveKey(old),raw);store.setItem(ACTIVE_WORLD_KEY,saveKey(old));store.setItem(preContactKey(old),raw);
 const current=packs(old);storeSession(store,current,true);assert.equal(preUpgradeSave(store,current),raw);restartSession(store,current);storeSession(store,packs(loadSession(store)),true);assert.equal(preUpgradeSave(store,current),raw);assert.equal(preContactSave(store,current),raw);assert.equal(store.getItem(preUpgradeKey(old)),raw);
});

test('new epoch pack-checkpoint creation uses fresh save bytes rather than archived original progress',()=>{
 const store=new Store(),old=packs(progress(createRegionalState(17)));storeSession(store,old,true);assert.equal(preUpgradeSave(store,old),null);const fresh=restartSession(store,old);storeSession(store,packs(fresh),true);assert.equal(preUpgradeSave(store,fresh),serializeSave(fresh));assert.notEqual(preUpgradeSave(store,fresh),serializeSave(old));
});

 test('operation returns defensive snapshots and repeated clicks cannot mutate committed data',()=>{const store=new Store(),old=progress(createRegionalState(17));storeSession(store,old,true);const operation=createSessionResetOperation(store,old),first=operation.commit();first.state.events.push('Caller mutation');const second=operation.commit();assert.equal(second.committed,false);assert.deepEqual(second.state,createRegionalState(17));assert.deepEqual(loadSession(store),createRegionalState(17));});

test('recovery archive exports ignore invalid, wrong-world and unrelated records and remain read-only',()=>{const store=new Store(),old=progress(createRegionalState(17));storeSession(store,old,true);const fresh=restartSession(store,old);store.setItem(`${saveKey(old)}-before-reset-20`,'{bad');store.setItem(`${saveKey(old)}-before-restore-21`,serializeSave(createConnectedState(17)));store.setItem(`${saveKey(old)}-before-contact-22`,serializeSave(old));const before=new Map(store.data),history=sessionRecoverySaves(store,fresh);assert.equal(history.length,1);assert.equal(history[0]!.raw,serializeSave(old));assert.deepEqual(store.data,before);store.setItem(sessionEpochKey(old),'{bad');assert.equal(sessionRecoverySaves(store,old)[0]!.raw,serializeSave(old),'rescues remain exportable despite a broken active record');});


test('an explicitly selected archive is directly recoverable without replacing the original protected checkpoint',()=>{
 const store=new Store(),old=progress(createRegionalState(17));storeSession(store,old,true);let current=packs(restartSession(store,old));current=applyAction(current,{type:'tick',dt:.25});storeSession(store,current,true);const laterRaw=serializeSave(current);current=restartSession(store,current);const later=sessionRecoverySaves(store,current).find(h=>h.epoch===2)!;assert.equal(later.raw,laterRaw);const before=new Map(store.data),operation=createSessionResetOperation(store,current,'restore',later.key);assert.deepEqual(store.data,before);const result=operation.commit();assert.equal(result.committed,true);assert.equal(storedSaveText(store,result.state),laterRaw);assert.equal(preResetSave(store,result.state),serializeSave(old));assert.equal(operation.commit().committed,false);
});

test('checkpoint selection rejects arbitrary keys, other worlds and changed or corrupt content without mutation',()=>{
 const store=new Store(),old=progress(createRegionalState(17));storeSession(store,old,true);const current=restartSession(store,old),originalKey=sessionRecoverySaves(store,current)[0]!.key;
 for(const key of ['axiom-sound',`${saveKey(createConnectedState(17))}-before-reset-1`,`${saveKey(current)}-before-contact-1`,`${saveKey(current)}-before-reset-999`]){const before=new Map(store.data);assert.throws(()=>createSessionResetOperation(store,current,'restore',key),/checkpoint/);assert.deepEqual(store.data,before);}
 assert.throws(()=>createSessionResetOperation(store,current,'restart',originalKey),/Invalid recovery/);const operation=createSessionResetOperation(store,current,'restore',originalKey);store.setItem(originalKey,serializeSave(createRegionalState(17)));const before=new Map(store.data);assert.throws(()=>operation.commit(),/session changed/);assert.deepEqual(store.data,before);
});


test('a tab holding pre-reset revision cannot overwrite the new session or any checkpoints',()=>{
 const store=new Store(),old=progress(createRegionalState(17));storeSession(store,old,true);const bootRevision=sessionResetRevision(store,old);assert.equal(bootRevision,0);const fresh=restartSession(store,old);assert.equal(sessionResetRevision(store,fresh),1);const before=new Map(store.data),writes=store.writes.length;assert.throws(()=>storeSession(store,packs(old),true,bootRevision),e=>e instanceof Error&&e.name==='StaleSessionError');assert.equal(store.writes.length,writes);assert.deepEqual(store.data,before);assert.deepEqual(loadSession(store),fresh);
});

test('a tab holding pre-restore revision cannot overwrite the recovered session',()=>{
 const store=new Store(),old=progress(createRegionalState(17));storeSession(store,old,true);const fresh=restartSession(store,old),bootRevision=sessionResetRevision(store,fresh);assert.equal(bootRevision,1);const restored=restoreResetSession(store,fresh);assert.equal(sessionResetRevision(store,restored),2);const before=new Map(store.data),writes=store.writes.length;assert.throws(()=>storeSession(store,packs(fresh),true,bootRevision),e=>e instanceof Error&&e.name==='StaleSessionError');assert.equal(store.writes.length,writes);assert.deepEqual(store.data,before);assert.deepEqual(loadSession(store),restored);
});

test('ordinary same-epoch saves remain valid and never increment the reset revision',()=>{
 const store=new Store();let state=createRegionalState(73129);assert.equal(sessionResetRevision(store,state),0);storeSession(store,state,true,0);state=progress(state);storeSession(store,state,true,0);assert.equal(sessionResetRevision(store,state),0);state=restartSession(store,state);const revision=sessionResetRevision(store,state);for(let i=0;i<4;i++){state=applyAction(packs(state),{type:'tick',dt:.25});storeSession(store,state,true,revision);assert.equal(sessionResetRevision(store,state),revision);assert.deepEqual(loadSession(store),state);}
 const other=createConnectedState(42);storeSession(store,other,false,0);assert.equal(sessionResetRevision(store,other),0);assert.equal(sessionResetRevision(store,state),1);
});

test('revision lookup rejects corrupt envelopes without mutation',()=>{const store=new Store(),state=createState(4);assert.equal(sessionResetRevision(store,state),0);store.setItem(sessionEpochKey(state),'{bad');const before=new Map(store.data);assert.throws(()=>sessionResetRevision(store,state),/session record is invalid/);assert.throws(()=>storeSession(store,state,true,0),/session record is invalid/);assert.deepEqual(store.data,before);});

test('a reset committed during rollback-checkpoint staging is rechecked before the old save can commit',()=>{
 const store=new Store(),old=progress(createRegionalState(17));storeSession(store,old,true);let reset=false;
 const interleaved={getItem:(key:string)=>store.getItem(key),setItem(key:string,raw:string){store.setItem(key,raw);if(key===preUpgradeKey(old)&&!reset){reset=true;restartSession(store,old);}}};
 assert.throws(()=>storeSession(interleaved,packs(old),true,0),e=>e instanceof Error&&e.name==='StaleSessionError');assert.equal(reset,true);assert.deepEqual(loadSession(store),createRegionalState(17));assert.equal(preResetSave(store,old),serializeSave(old));assert.equal(sessionResetRevision(store,old),1);
});
