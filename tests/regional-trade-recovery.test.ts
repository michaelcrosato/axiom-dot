import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createConnectedState,createRegionalState,enableRegionalSupply,enableRegionalTrade,applyAction,parseSave,serializeSave,validateSave,type State} from '../src/world.ts';
import {saveKey,storeSession,preRegionalTradeKey,preRegionalTradeSave,preRegionalSupplySave,ACTIVE_WORLD_KEY,createSessionResetOperation,sessionResetRevision,sessionRecoverySaves,loadSession} from '../src/session.ts';
import {regionalSupplyPlan} from '../src/regional-supply.ts';
import {gatherRegionalSupplyMaterials} from '../src/regional-supply-lab.ts';

class Store {
 data=new Map<string,string>();
 getItem(key:string){return this.data.get(key)??null;}
 setItem(key:string,value:string){this.data.set(key,value);}
 get length(){return this.data.size;}
 key(index:number){return [...this.data.keys()][index]??null;}
}
function completedCollector(){
 let state=enableRegionalSupply(createRegionalState(73129));const outpost=regionalSupplyPlan(state.seed).outposts[0]!;
 state=gatherRegionalSupplyMaterials(state,outpost.deliveryPosition,outpost.cost).state;
 state={...state,player:{...state.player,x:outpost.deliveryPosition.x,z:outpost.deliveryPosition.z}};
 for(const type of ['deliver','build'] as const)state=applyAction(state,{type:'regional-supply',command:{type,outpostId:outpost.id,expectedRevision:state.frontierSupply!.revision}});
 for(let i=0;i<60;i++)state=applyAction(state,{type:'tick',dt:1});
 assert.notEqual(state.frontierSupply!.outposts[0]!.builtAt,null);assert(validateSave(state));return state;
}
test('regional freight activation retains exact completed V31 collectors and immutable pre-trade bytes',()=>{
 const store=new Store(),old=completedCollector(),raw=JSON.stringify(old,null,2)+'\n';store.setItem(saveKey(old),raw);
 const next=enableRegionalTrade(old);assert.equal(next.player,old.player);assert.equal(next.frontierSupply,old.frontierSupply);assert.equal(next.wilderness,old.wilderness);assert.equal(next.generationManifest,old.generationManifest);assert.equal(saveKey(next),saveKey(old));assert.equal(enableRegionalTrade(next),next);
 assert.equal(next.frontierTrade!.ticks,0);assert.equal(parseSave(raw)!.frontierTrade,undefined);
 storeSession(store,next,true);let advanced=next;for(let i=0;i<8;i++){advanced=applyAction(advanced,{type:'tick',dt:.25});storeSession(store,advanced,true);}
 assert.equal(preRegionalTradeSave(store,next),raw);assert.deepEqual(parseSave(raw)!.frontierSupply,old.frontierSupply);
 const reloaded=parseSave(serializeSave(next))!;assert.deepEqual(reloaded.frontierTrade,next.frontierTrade);assert(Object.isFrozen(reloaded.frontierTrade));assert(Object.isFrozen(reloaded.frontierTrade!.routes));
 for(const legacy of [createState(42),createConnectedState(42)]){assert.equal(enableRegionalTrade(legacy),legacy);assert.equal(enableRegionalTrade(legacy).frontierTrade,undefined);}
});
test('trade checkpoint quota or corruption leaves current, rolling and active saves untouched',()=>{
 for(const corrupt of [false,true]){
  const store=new Store(),old=enableRegionalSupply(createRegionalState(42));storeSession(store,old,true);
  if(corrupt)store.setItem(preRegionalTradeKey(old),'{corrupt');
  const before=new Map(store.data),blocked={getItem:(k:string)=>store.getItem(k),setItem(k:string,v:string){if(k===preRegionalTradeKey(old))throw Error('quota');store.setItem(k,v);}};
  assert.throws(()=>storeSession(blocked,enableRegionalTrade(old),true));assert.deepEqual(store.data,before);assert.equal(store.getItem(ACTIVE_WORLD_KEY),saveKey(old));
 }
});
test('trade checkpoint never fabricates a downgrade or accepts another world identity',()=>{
 const old=enableRegionalSupply(createRegionalState(13));
 for(const prior of [null,serializeSave(createConnectedState(13)),serializeSave(createRegionalState(12)),serializeSave(enableRegionalTrade(old)),serializeSave(old)]){
  const store=new Store();if(prior)store.setItem(saveKey(old)+'-backup',prior);storeSession(store,enableRegionalTrade(old));
  assert.equal(preRegionalTradeSave(store,old),prior===serializeSave(old)?prior:null);
 }
});
test('freight reset archives and stale-tab protection retain both generation checkpoints and completed collectors',()=>{
 const store=new Store(),base=createRegionalState(73129);storeSession(store,base,true);const old=completedCollector();storeSession(store,old,true);const next=enableRegionalTrade(old);storeSession(store,next,true,0);
 assert.equal(preRegionalSupplySave(store,next),serializeSave(base));assert.equal(preRegionalTradeSave(store,next),serializeSave(old));
 const before=serializeSave(next),reset=createSessionResetOperation(store,next,'restart');assert(reset.commit().committed);assert.equal(sessionResetRevision(store,next),1);assert.throws(()=>storeSession(store,next,false,0));assert.equal(preRegionalTradeSave(store,next),serializeSave(old));
 const archive=sessionRecoverySaves(store,next);assert(archive.some(item=>item.raw===before));const restored=createSessionResetOperation(store,loadSession(store),'restore').commit().state;assert.deepEqual(restored.frontierTrade,next.frontierTrade);assert.deepEqual(restored.frontierSupply,old.frontierSupply);assert.equal(preRegionalSupplySave(store,next),serializeSave(base));assert.equal(preRegionalTradeSave(store,next),serializeSave(old));
});
test('malformed present freight cannot be silently repaired, imported, shared into old flavors or mutated after parsing',()=>{
 const good=enableRegionalTrade(completedCollector()),copy=(v:unknown)=>JSON.parse(JSON.stringify(v));
 for(const value of [null,{},[],{...copy(good.frontierTrade),revision:-1},{...copy(good.frontierTrade),ticks:Infinity},{...copy(good.frontierTrade),seed:14},{...copy(good.frontierTrade),inventedStock:1}]){
  const bad={...good,frontierTrade:value} as State;assert.equal(enableRegionalTrade(bad),bad);assert.equal(validateSave(bad),false);assert.equal(parseSave(JSON.stringify(bad)),null);assert.throws(()=>serializeSave(bad));
 }
 for(const legacy of [createState(good.seed),createConnectedState(good.seed)])assert.equal(parseSave(JSON.stringify({...legacy,frontierTrade:good.frontierTrade})),null);
 const parsed=parseSave(serializeSave(good))!;assert.throws(()=>{parsed.frontierTrade!.revision++;},TypeError);assert.throws(()=>{parsed.frontierTrade!.routes.pop();},TypeError);assert.equal(validateSave(good),true);
});
