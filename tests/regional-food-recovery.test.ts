import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createConnectedState,createRegionalState,enableRegionalSupply,enableRegionalTrade,enableRegionalFood,applyAction,validateSave,serializeSave,parseSave,type State} from '../src/world.ts';
import {saveKey,storeSession,preRegionalFoodKey,preRegionalFoodSave,preRegionalSupplySave,preRegionalTradeSave,ACTIVE_WORLD_KEY,createSessionResetOperation,sessionResetRevision,sessionRecoverySaves,loadSession} from '../src/session.ts';
import {readCoopBoot,writeCoopBoot,queueSoloReturn,consumeSoloReturnCheckpoint} from '../src/coop-session.ts';
import {generateRegionalChunk} from '../src/regional-world.ts';
import {oldFoodCampaign,readyFoodCampaign,foodCommand} from './helpers/regional-food-campaign.ts';
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
class Store {data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);}removeItem(k:string){this.data.delete(k);}get length(){return this.data.size;}key(i:number){return [...this.data.keys()][i]??null;}}

test('food opt-in preserves completed collectors, finite stores, old gardens and exact pre-rollout raw bytes',{timeout:120_000},()=>{
 const old=oldFoodCampaign(),raw=JSON.stringify(old,null,2)+'\n',store=new Store();store.setItem(saveKey(old),raw);
 const next=enableRegionalFood(old);assert.notEqual(next,old);assert.equal(enableRegionalFood(next),next);assert.equal(next.frontierFood!.ticks,0);assert.equal(next.frontierFood!.remainder,0);assert.equal(next.frontierFood!.supplyStartTick,old.frontierSupply!.ticks);assert.equal(next.frontierFood!.supplyStartRemainder,old.frontierSupply!.remainder);
 for(const key of ['frontierSupply','frontierTrade','ecology','wilderness','player','inventory','generationManifest'] as const)assert.equal(next[key],old[key],key);
 assert.equal(parseSave(raw)!.frontierFood,undefined);assert.equal(saveKey(next),saveKey(old));storeSession(store,next,true);
 let live=next;for(let i=0;i<6;i++){live=applyAction(live,{type:'tick',dt:.25});storeSession(store,live,true);}
 assert.equal(preRegionalFoodSave(store,next),raw);assert.deepEqual(parseSave(serializeSave(live)),live);assert(Object.isFrozen(parseSave(serializeSave(live))!.frontierFood));
 for(const legacy of [createState(42),createConnectedState(42),createRegionalState(42)])assert.equal(enableRegionalFood(legacy),legacy);
});
test('food checkpoint quota failures, corrupt existing checkpoints and mismatched worlds never overwrite outgoing saved progress',()=>{
 for(const corrupt of [false,true]){const store=new Store(),old=enableRegionalTrade(enableRegionalSupply(createRegionalState(42)));storeSession(store,old,true);if(corrupt)store.setItem(preRegionalFoodKey(old),'{corrupt');const before=new Map(store.data),blocked={getItem:(k:string)=>store.getItem(k),setItem(k:string,v:string){if(k===preRegionalFoodKey(old))throw Error('quota');store.setItem(k,v);}};assert.throws(()=>storeSession(blocked,enableRegionalFood(old),true));assert.deepEqual(store.data,before);assert.equal(store.getItem(ACTIVE_WORLD_KEY),saveKey(old));}
 const old=enableRegionalTrade(enableRegionalSupply(createRegionalState(13)));
 for(const prior of [null,serializeSave(createConnectedState(13)),serializeSave(createRegionalState(12)),serializeSave(enableRegionalFood(old)),serializeSave(old)]){const store=new Store();if(prior)store.setItem(saveKey(old)+'-backup',prior);storeSession(store,enableRegionalFood(old));assert.equal(preRegionalFoodSave(store,old),prior===serializeSave(old)?prior:null);}
});
test('food saves, cross-chunk revisit, reset recovery, stale resumed tabs and co-op handoff preserve each campaign',{timeout:120_000},()=>{
 const store=new Store(),base=createRegionalState(73129);storeSession(store,base,true);const supplied=enableRegionalSupply(base);storeSession(store,supplied,true);const traded=oldFoodCampaign();storeSession(store,traded,true);let next=readyFoodCampaign();next=applyAction(next,foodCommand(next));storeSession(store,next,true,0);
 const foodBefore=clone(next.frontierFood),oldRaw=serializeSave(traded),preSupply=preRegionalSupplySave(store,next),preTrade=preRegionalTradeSave(store,next);assert.equal(preRegionalFoodSave(store,next),oldRaw);
 let far=applyAction(next,{type:'move',x:1300,z:-1300});for(let i=0;i<110;i++)generateRegionalChunk(next.seed,-23+(i%45),-20+Math.floor(i/45)*20);far=parseSave(serializeSave(far))!;assert.deepEqual(far.frontierFood,foodBefore);assert.deepEqual(far.frontierSupply,next.frontierSupply);assert.deepEqual(far.frontierTrade,next.frontierTrade);storeSession(store,far,true,0);
 const before=serializeSave(far),op=createSessionResetOperation(store,far,'restart');assert(op.commit().committed);assert.equal(sessionResetRevision(store,far),1);assert.throws(()=>storeSession(store,far,true,0),/older local session/,'stale bfcache/tab cannot save an earlier food ledger');assert(sessionRecoverySaves(store,far).some(s=>s.raw===before));
 const restored=createSessionResetOperation(store,loadSession(store),'restore').commit().state;assert.deepEqual(restored,far);assert.equal(preRegionalFoodSave(store,restored),oldRaw);assert.equal(preRegionalSupplySave(store,restored),preSupply);assert.equal(preRegionalTradeSave(store,restored),preTrade);
 const session=new Store(),solo=serializeSave(restored),online=applyAction(restored,{type:'tick',dt:1});writeCoopBoot(session,'food_room_12345',online,restored,2);const boot=readCoopBoot(session)!;assert.equal(serializeSave(boot.solo),solo);assert.deepEqual(boot.world.frontierFood,online.frontierFood);queueSoloReturn(session,boot.solo,boot.soloRevision);const checkpoint=consumeSoloReturnCheckpoint(session)!;assert.equal(checkpoint.soloRevision,2);assert.equal(serializeSave(checkpoint.state),solo);assert.equal(consumeSoloReturnCheckpoint(session),null);
});
test('malformed current-present food never resets or launders on parse, serialization, optional upgrade or session handoff',()=>{
 const good=enableRegionalFood(enableRegionalTrade(enableRegionalSupply(createRegionalState(13))));
 for(const badFood of [null,undefined,{},[],{...clone(good.frontierFood),revision:-1},{...clone(good.frontierFood),ticks:Infinity},{...clone(good.frontierFood),seed:14},{...clone(good.frontierFood),inventedMeals:8}]){const bad={...good,frontierFood:badFood} as State;assert.equal(enableRegionalFood(bad),bad);assert.equal(validateSave(bad),false);assert.throws(()=>serializeSave(bad));if(badFood!==undefined)assert.equal(parseSave(JSON.stringify(bad)),null);assert.throws(()=>writeCoopBoot(new Store(),'food_room_12345',bad,good));}
 for(const missing of ['frontierSupply','frontierTrade'] as const){const bad=clone(good);delete bad[missing];assert.equal(validateSave(bad),false);assert.equal(parseSave(JSON.stringify(bad)),null);}
 for(const old of [createState(13),createConnectedState(13)])assert.equal(parseSave(JSON.stringify({...old,frontierFood:good.frontierFood})),null);
 const parsed=parseSave(serializeSave(good))!;assert.throws(()=>{parsed.frontierFood!.revision++;},TypeError);assert.throws(()=>{parsed.frontierFood!.farms.pop();},TypeError);
});
