import test from 'node:test';
import assert from 'node:assert/strict';
import {action} from '../server/coop-validation.ts';
import {createRoom,syncRoom} from '../server/coop-authority.ts';
import {createVertical} from '../server/coop-vertical.ts';
import {applyAction,enableRegionalFood,worldObjects,validateSave,serializeSave,parseSave,type State} from '../src/world.ts';
import {worldHeight} from '../src/generation.ts';
import {regionalFoodPlan,regionalFoodConservation,regionalFoodCost} from '../src/regional-food.ts';
import {createRegionalFoodLabCampaign} from '../src/regional-food-lab.ts';
import {CoopClient} from '../src/coop.ts';
import type {CoopAction} from '../src/coop-protocol.ts';
import {foodHttpFixture,foodExpedition,foodInput,foodCurrent} from './helpers/regional-food-http.ts';
import {foodCommand,atFoodCommand} from './helpers/regional-food-campaign.ts';

const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const valid=(state:State)=>{assert(validateSave(state));assert.deepEqual(parseSave(serializeSave(state)),state);assert(state.frontierFood!.ticks<100_000,'Only ordinary food clocks belong in these irrigation tests');};
const campaigns=new Map<boolean,string>();

/** Disposable ordinary-clock model fixture. Freight/collectors are earned with
 * production actions. Canisters are collected from canonical world objects;
 * no inventory, cistern, receipt, or clock is fabricated. Approach poses are
 * assigned model placements, not an executed controller traversal. */
function irrigationCampaign({canisters=2,started=true,collectors=false,version=2}:{canisters?:number;started?:boolean;collectors?:boolean;version?:1|2}={}):State {
 let bytes=campaigns.get(collectors);
 if(!bytes){bytes=serializeSave(createRegionalFoodLabCampaign(73129,collectors));campaigns.set(collectors,bytes);}
 let state=parseSave(bytes)!;assert(state);assert.equal(state.inventory.water,0);
 const objects=worldObjects(state).filter(object=>object.kind==='water'&&!state.collected.includes(object.id));assert(objects.length>=canisters);
 for(const object of objects.slice(0,canisters)){
  state=applyAction(state,{type:'move',x:object.x,z:object.z});const before=state;
  state=applyAction(state,{type:'collect',id:object.id});assert.notEqual(state,before);assert.equal(state.inventory.water,before.inventory.water+1);assert(state.collected.includes(object.id));
 }
 state=atFoodCommand(enableRegionalFood(state,version));
 if(started){const before=state;state=applyAction(state,foodCommand(state));assert.notEqual(state,before);}
 assert.equal(state.frontierFood!.version,version);assert.equal(state.frontierFood!.ticks,0);assert.equal(state.frontierFood!.farms[0]!.water,0);valid(state);return state;
}

function conservedTransfer(before:State,after:State){
 assert.equal(after.inventory.water,before.inventory.water-1);
 assert.equal(after.frontierFood!.revision,before.frontierFood!.revision+1);
 assert.equal(after.frontierFood!.receipts.length,before.frontierFood!.receipts.length+1);
 assert.equal(after.frontierFood!.receipts.at(-1)!.type,'irrigate-farm');
 assert.equal(after.frontierFood!.farms[0]!.water,before.frontierFood!.farms[0]!.water+4);
 assert.equal(after.frontierFood!.farms[0]!.waterIrrigated,4);
 assert.equal(regionalFoodCost(after.frontierFood).water,regionalFoodCost(before.frontierFood).water+1);
 assert(regionalFoodConservation(after.frontierFood!).every(farm=>farm.balanced));
 for(const key of ['frontierSupply','frontierTrade','wilderness','collected','ecology'] as const)assert.deepEqual(after[key],before[key],key);
 assert.equal(after.inventory.scrap,before.inventory.scrap);assert.equal(after.inventory.core,before.inventory.core);
 valid(after);
}

test('irrigation HTTP allowlist rejects client inventory, litres, receipt, ownership and pose injection',{timeout:120_000},async()=>{
 const state=irrigationCampaign(),command=foodCommand(state,'irrigate-farm');assert(action(command));
 const invalid=[null,{},[],
  ...[-1,.5,NaN,Infinity,'1',undefined].map(expectedRevision=>({...command.command,expectedRevision})),
  ...['inventory','water','waterIrrigated','litres','receipts','cost','playerId','userId','grounded','feetY','position','frontierFood'].map(key=>({...command.command,[key]:4})),
  {...command.command,type:'refill-canister'},{...command.command,targetId:''},{...command.command,targetId:'bad\n'},
 ];
 const fixture=await foodHttpFixture();try{
  const [host]=await foodExpedition(fixture,state,1);assert(host);const before=fixture.stored(host.s.roomId);
  for(const value of invalid){
   assert.equal(action({type:'regional-food',command:value}),null);
   const response=await fixture.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:1,sessionId:host.s.sessionId,actions:[{type:'regional-food',command:value}]});assert.equal(response.status,400);
  }
  for(const extra of [{inventory:{water:10}},{world:state},{userId:'guest-1'},{playerId:host.s.selfId}]){
   const response=await fixture.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:1,sessionId:host.s.sessionId,actions:[command],...extra});assert.equal(response.status,400);
  }
  assert.deepEqual(fixture.stored(host.s.roomId),before);
 }finally{await fixture.stop();}
});

test('four irrigation HTTP actors race through SQLite CAS and all old, same, current and future revision retries debit once',{timeout:120_000},async()=>{
 const fixture=await foodHttpFixture();try{
  const peers=await foodExpedition(fixture,irrigationCampaign()),host=peers[0]!,before=clone(host.s.world),command=foodCommand(before,'irrigate-farm'),expected=applyAction(before,command);
  conservedTransfer(before,expected);
  const hold=fixture.hold(),pending=foodInput(fixture,peers[1]!,[command]);await hold.waiting;
  try{await foodInput(fixture,host,[command]);}finally{hold.release();}
  await pending;await Promise.all(peers.slice(2).map(peer=>foodInput(fixture,peer,[command])));await Promise.all(peers.map(peer=>foodCurrent(fixture,peer)));
  assert(fixture.conflicts()>0,'The test must exercise a real failed SQLite CAS update');
  for(const peer of peers){assert.deepEqual(peer.s.world.frontierFood,expected.frontierFood);assert.deepEqual(peer.s.world.inventory,expected.inventory);conservedTransfer(before,peer.s.world);}
  const committed=clone(host.s.world);
  for(const expectedRevision of [command.command.expectedRevision-1,command.command.expectedRevision,host.s.world.frontierFood!.revision,host.s.world.frontierFood!.revision+1]){
   await foodInput(fixture,host,[{...command,command:{...command.command,expectedRevision}}]);assert.deepEqual(host.s.world.frontierFood,committed.frontierFood);assert.deepEqual(host.s.world.inventory,committed.inventory);
  }
  const replay=await fixture.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:host.s.ack,sessionId:host.s.sessionId,actions:[command]});assert.equal(replay.status,200);assert.deepEqual(replay.body.world.frontierFood,committed.frontierFood);assert.deepEqual(replay.body.world.inventory,committed.inventory);
  fixture.advance(1000);await foodInput(fixture,host);assert(host.s.world.frontierFood!.farms[0]!.water<4,'Ordinary crop work consumes transferred water');const growing=clone(host.s.world);
  await foodInput(fixture,host,[foodCommand(host.s.world,'irrigate-farm')]);assert.deepEqual(host.s.world.frontierFood,growing.frontierFood);assert.deepEqual(host.s.world.inventory,growing.inventory);valid(fixture.stored(host.s.roomId).world);
 }finally{await fixture.stop();}
});

test('irrigation rejects unstarted gardens, missing earned inventory, stale revision and legacy food without spending',{timeout:120_000},async()=>{
 const fixture=await foodHttpFixture();try{
  for(const condition of ['unstarted','no-canister','stale','legacy-v1'] as const){
   const source=irrigationCampaign({started:condition!=='unstarted',canisters:condition==='no-canister'?0:1,version:condition==='legacy-v1'?1:2}),[host]=await foodExpedition(fixture,source,1);assert(host);
   const before=clone(host.s.world),command=foodCommand(before,'irrigate-farm');if(condition==='stale')command.command.expectedRevision--;
   await foodInput(fixture,host,[command]);assert.deepEqual(host.s.world.frontierFood,before.frontierFood,condition);assert.deepEqual(host.s.world.inventory,before.inventory,condition);valid(fixture.stored(host.s.roomId).world);
   if(condition==='legacy-v1'){assert.equal(host.s.world.frontierFood!.version,1);assert.equal(Object.hasOwn(host.s.world.frontierFood!.farms[0]!,'waterIrrigated'),false);}
  }
 }finally{await fixture.stop();}
});

test('irrigation uses accepted grounded reach and rejects remote, airborne, high, crouched and committed actors despite a forged move',{timeout:120_000},()=>{
 for(const condition of ['jump','crouch','high','attack','guard','remote'] as const){
  const source=irrigationCampaign(),room=createRoom('host','Host',source,1000),player=room.players[0]!,before=clone(room.world);
  if(condition==='high')player.motion!.feetY+=10;
  if(condition==='remote'){player.player={...player.player,x:player.player.x+20};player.motion=createVertical(worldHeight(source,player.player.x,player.player.z));}
  const actions:CoopAction[]=[...(condition==='jump'?[{type:'jump-press' as const,intentId:'irrigation-air'}]:condition==='attack'?[{type:'attack-press' as const}]:condition==='guard'?[{type:'guard-press' as const,intentId:'irrigation-guard'}]:[]),foodCommand(room.world,'irrigate-farm')];
  syncRoom(room,'host',{seq:1,sessionId:player.sessionId,actions,move:{x:source.player.x,z:source.player.z,y:worldHeight(source,source.player.x,source.player.z),grounded:true,crouched:condition==='crouch',facing:0}},1000);
  assert.deepEqual(room.world.frontierFood,before.frontierFood,condition);assert.deepEqual(room.world.inventory,before.inventory,condition);assert.deepEqual(room.world.collected,before.collected,condition);valid(room.world);
 }
});

test('an ordinary rain-filled cistern rejects irrigation unless the full four litres fit',{timeout:120_000},async()=>{
 let source=irrigationCampaign({collectors:true,canisters:1});const capacity=regionalFoodPlan(source.seed).farms[0]!.capacity.water;
 for(let second=0;second<600&&source.frontierFood!.farms[0]!.water<capacity;second++)source=applyAction(source,{type:'tick',dt:1});
 assert.equal(source.frontierFood!.farms[0]!.water,capacity,'Collector overflow, earned at ordinary active ticks, fills this cistern');assert.equal(source.frontierFood!.farms[0]!.waterIrrigated,0);assert(source.frontierFood!.farms[0]!.waterCaptured>0);valid(source);
 const fixture=await foodHttpFixture();try{
  const [host]=await foodExpedition(fixture,source,1);assert(host);const before=clone(host.s.world);
  await foodInput(fixture,host,[foodCommand(host.s.world,'irrigate-farm')]);assert.deepEqual(host.s.world.frontierFood,before.frontierFood);assert.deepEqual(host.s.world.inventory,before.inventory);valid(fixture.stored(host.s.roomId).world);
 }finally{await fixture.stop();}
});

for(const failure of ['lost-response','invalid-inventory-overlay'] as const)test(`irrigation client ${failure} retries the identical committed request without a second debit`,{timeout:120_000},async()=>{
 const fixture=await foodHttpFixture();let client:CoopClient|undefined;
 try{
  const requests:string[]=[];let failed=false;
  const fetcher:typeof fetch=async(url,init)=>{
   const response=await fetch(url,{...init,headers:{...init?.headers,'oai-authenticated-user-id':'host',Origin:fixture.origin}});
   if(String(url).endsWith('/sync')&&JSON.parse(String(init?.body)).actions.some((value:{type:string})=>value.type==='regional-food')){
    requests.push(String(init?.body));
    if(!failed&&response.ok){failed=true;if(failure==='lost-response')throw Error('Response lost after irrigation SQLite commit');const payload=await response.json();payload.world.inventory.water++;return new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json'}});}
   }
   return response;
  };
  client=new CoopClient({baseURL:fixture.origin,fetch:fetcher,onSnapshot:()=>{}});await client.create({name:'Host',world:irrigationCampaign()});
  const before=client.snapshot!.world,command=foodCommand(before,'irrigate-farm'),expected=applyAction(before,command);assert(client.send(command));
  const deadline=Date.now()+8000;while(client.snapshot!.world.frontierFood!.revision!==expected.frontierFood!.revision&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
  assert(failed);assert.equal(requests.length,2);assert.equal(requests[0],requests[1]);assert(client.canAct);assert.deepEqual(client.snapshot!.world.frontierFood,expected.frontierFood);conservedTransfer(before,client.snapshot!.world);
  assert(Object.isFrozen(client.snapshot!.world.frontierFood));assert(Object.isFrozen(client.snapshot!.world.frontierSupply));const persisted=fixture.stored(client.snapshot!.roomId).world;assert.deepEqual(persisted.frontierFood,expected.frontierFood);assert.deepEqual(persisted.inventory,expected.inventory);valid(persisted);
 }finally{client?.disconnect();await fixture.stop();}
});
