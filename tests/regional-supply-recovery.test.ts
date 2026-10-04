import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createConnectedState,createRegionalState,enableRegionalSupply,applyAction,parseSave,serializeSave} from '../src/world.ts';
import {saveKey,storeSession,preRegionalSupplyKey,preRegionalSupplySave,ACTIVE_WORLD_KEY,createSessionResetOperation,sessionResetRevision} from '../src/session.ts';

class Store {
 data=new Map<string,string>();
 getItem(key:string){return this.data.get(key)??null;}
 setItem(key:string,value:string){this.data.set(key,value);}
 get length(){return this.data.size;}
 key(index:number){return [...this.data.keys()][index]??null;}
}
test('regional supply activation preserves world identity and exact previous raw checkpoint',()=>{
 const store=new Store(),old=createRegionalState(73129);old.player={x:-312,z:138,hp:97};
 const raw=JSON.stringify(old,null,2)+'\n';store.setItem(saveKey(old),raw);
 let next=enableRegionalSupply(old);assert.equal(next.player,old.player);assert.equal(next.generationManifest,old.generationManifest);assert.equal(saveKey(next),saveKey(old));
 for(let i=0;i<8;i++){storeSession(store,next,true);next=applyAction(next,{type:'tick',dt:.25});}
 assert.equal(preRegionalSupplySave(store,next),raw);assert.equal(parseSave(raw)!.frontierSupply,undefined);
 assert.ok(parseSave(store.getItem(saveKey(next))!)!.frontierSupply);
 assert.equal(enableRegionalSupply(createState(42)).frontierSupply,undefined);
 assert.equal(enableRegionalSupply(createConnectedState(42)).frontierSupply,undefined);
});
test('supply checkpoint quota and invalid archived bytes protect current and rolling saves',()=>{
 for(const malformed of [false,true]){
  const store=new Store(),old=createRegionalState(42);storeSession(store,old,true);
  if(malformed)store.setItem(preRegionalSupplyKey(old),'{corrupt');
  const before=new Map(store.data),blocked={getItem:(k:string)=>store.getItem(k),setItem(k:string,v:string){if(k===preRegionalSupplyKey(old))throw Error('quota');store.setItem(k,v);}};
  assert.throws(()=>storeSession(blocked,enableRegionalSupply(old),true));assert.deepEqual(store.data,before);assert.equal(store.getItem(ACTIVE_WORLD_KEY),saveKey(old));
 }
});
test('supply checkpoint never invents old progress or accepts another save flavor',()=>{
 const old=createRegionalState(13);
 for(const prior of [null,serializeSave(createConnectedState(13)),serializeSave(createRegionalState(12)),serializeSave(enableRegionalSupply(old)),serializeSave(old)]){
  const store=new Store();if(prior)store.setItem(saveKey(old)+'-backup',prior);storeSession(store,enableRegionalSupply(old));
  assert.equal(preRegionalSupplySave(store,old),prior===serializeSave(old)?prior:null);
 }
});
test('protected reset history and stale-tab locks continue to cover upgraded supply worlds',()=>{
 const store=new Store(),old=createRegionalState(991);storeSession(store,old,true);
 const next=enableRegionalSupply(old);storeSession(store,next,true,0);const raw=serializeSave(next);
 const reset=createSessionResetOperation(store,next,'restart');assert.equal(reset.commit().committed,true);
 assert.equal(sessionResetRevision(store,next),1);assert.throws(()=>storeSession(store,next,false,0));
 assert.equal(preRegionalSupplySave(store,next),serializeSave(old));
 assert.ok([...store.data.values()].includes(raw));
});
