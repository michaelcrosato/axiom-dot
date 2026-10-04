import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRegionalState,enableRegionalTrade,enableRegionalFood,applyAction,parseSave,serializeSave,validateSave,type State} from '../src/world.ts';
import {createRegionalTrade,advanceRegionalTrade,regionalTradePlan,regionalTradeCommandPosition,regionalTradeReplayTimeline,regionalTradeCanonical,regionalTradeConservation,regionalTradeWithdrawn,regionalTradeDrainTicks,immutableRegionalTrade,validRegionalTrade,REGIONAL_TRADE_MAX_TICKS,type RegionalTradeCommand} from '../src/regional-trade.ts';
import {regionalTradeRoadWeather,regionalTradeWeatherMetres,REGIONAL_TRADE_DRYING_TICKS} from '../src/regional-trade-weather.ts';
import {createRegionalSupply,regionalSupplyPlan,regionalSupplySpent,regionalSupplyAvailable} from '../src/regional-supply.ts';
import {createRegionalFood,validRegionalFood,regionalFoodPlan,regionalFoodConservation} from '../src/regional-food.ts';
import {gatherRegionalSupplyMaterials} from '../src/regional-supply-lab.ts';
import {createVertical} from '../server/coop-vertical.ts';
import {worldHeight} from '../src/generation.ts';
import type {CoopAction} from '../src/coop-protocol.ts';
import {foodHttpFixture,foodExpedition,foodInput,foodCurrent,type FoodFixture,type FoodPeer} from './helpers/regional-food-http.ts';

const seed=73129,clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
function fresh(tradeVersion:1|2,supplyVersion:1|2=2):State{return {...createRegionalState(seed),frontierSupply:createRegionalSupply(seed,supplyVersion),frontierTrade:createRegionalTrade(seed,tradeVersion)};}
function tradeCommand(state:State,type:RegionalTradeCommand['type']='start-source',index=0){
 const plan=regionalTradePlan(state.seed),targetId=(type==='start-source'?plan.sources:type==='clear-route'?plan.routes:plan.projects)[index]!.id;
 return {type:'regional-trade' as const,command:{type,targetId,expectedRevision:state.frontierTrade!.revision}};
}
function atTrade(state:State,type:RegionalTradeCommand['type']='start-source',index=0):State {const p=regionalTradeCommandPosition(state.seed,tradeCommand(state,type,index).command)!;return {...state,player:{...state.player,x:p.x,z:p.z}};}
function issue(state:State,type:RegionalTradeCommand['type'],index=0){state=atTrade(state,type,index);const next=applyAction(state,tradeCommand(state,type,index));assert.notEqual(next,state,`${type} version ${state.frontierTrade!.version}`);return next;}
function advance(state:State,seconds:number){for(let i=0;i<seconds;i++)state=applyAction(state,{type:'tick',dt:1});return state;}
function roundTrip(state:State){assert(validateSave(state));const raw=serializeSave(state),loaded=parseSave(raw);assert(loaded);assert.equal(serializeSave(loaded),raw);assert.deepEqual(loaded,state);return loaded;}

test('new freight opts into weather while existing legacy and mixed dependency campaigns retain their exact saved model',()=>{
 const empty=createRegionalState(seed),enabled=enableRegionalTrade(empty);assert.equal(enabled.frontierTrade!.version,2);assert.equal(enabled.player,empty.player);assert.equal(enabled.seed,empty.seed);
 for(const tradeVersion of [1,2] as const)for(const supplyVersion of [1,2] as const){
  let state=enableRegionalFood(fresh(tradeVersion,supplyVersion));state=issue(issue(state,'start-source'),'clear-route');state=advance(state,180);
  assert.equal(state.frontierTrade!.ticks,720);assert.equal(state.frontierSupply!.ticks,720);assert.equal(state.frontierFood!.ticks,720);assert.equal(state.frontierTrade!.version,tradeVersion);assert.equal(state.frontierSupply!.version,supplyVersion);
  assert.equal(state.frontierFood!.tradeBaseline.version,tradeVersion);assert.equal(state.frontierFood!.tradeSnapshot.version,tradeVersion);assert(regionalTradeConservation(state.frontierTrade!).every(r=>r.balanced));assert(regionalFoodConservation(state.frontierFood!).every(r=>r.balanced));
  const loaded=roundTrip(state);assert.equal(enableRegionalTrade(loaded),loaded);assert.deepEqual(advance(loaded,1),advance(state,1),'reload resumes the saved model at the same active time');
 }
});

test('ordinary cold food dependency replay keeps both freight versions isolated in either cache order',async()=>{
 const states=([1,2] as const).map(version=>{let state=enableRegionalFood(fresh(version));state=issue(issue(state,'start-source'),'clear-route');return advance(state,180);});
 assert.deepEqual(states[0]!.frontierFood!.tradeEvents,states[1]!.frontierFood!.tradeEvents);assert.deepEqual(states[0]!.frontierFood!.receipts,states[1]!.frontierFood!.receipts);assert.notDeepEqual(states[0]!.frontierTrade!.routes,states[1]!.frontierTrade!.routes,'wet road freight differs on the same command and room clocks');
 for(const [name,order] of [['legacy-first',states],['weather-first',[...states].reverse()]] as const){
  const cold=await import(`../src/regional-food.ts?freight-cache-${name}`);
  for(const state of [...order,...order]){assert(cold.validRegionalFood(clone(state.frontierFood),state));const restored=cold.immutableRegionalFood(clone(state.frontierFood),state);assert.equal(restored.tradeBaseline.version,state.frontierTrade!.version);assert.equal(restored.tradeSnapshot.version,state.frontierTrade!.version);assert.deepEqual(restored,state.frontierFood);}
 }
 // Even identical idle inventories cannot substitute a different dependency model.
 const old=fresh(1),modern=fresh(2),food=createRegionalFood(seed,old.frontierSupply!,old.frontierTrade!);
 assert(validRegionalFood(food,old));assert.equal(validRegionalFood(food,modern),false);assert.equal(validRegionalFood(clone(food),modern),false);
 const mismatched=enableRegionalFood(old);mismatched.frontierTrade=modern.frontierTrade;assert.equal(parseSave(JSON.stringify(mismatched)),null);
});

test('freight replay and canonicalization retain version and fresh-process campaign parsing rejects relabeled moving stock',()=>{
 const records=[];
 for(const version of [1,2] as const){
  let state=enableRegionalFood(fresh(version));state=issue(issue(state,'start-source'),'clear-route');state=advance(state,180);const food=state.frontierFood!,trade=state.frontierTrade!;
  const replay=regionalTradeReplayTimeline(food.tradeBaseline,food.tradeEvents,{ticks:food.ticks,remainder:food.remainder});assert.deepEqual(replay,trade);assert.equal(regionalTradeCanonical(trade)!.version,version);
  const altered={...clone(trade),version:version===1?2:1};assert.equal(validRegionalTrade(altered,state),false);records.push(serializeSave(state));
 }
 const script=`import {readFileSync} from 'node:fs';import {parseSave,serializeSave} from ${JSON.stringify(new URL('../src/world.ts',import.meta.url).href)};const records=JSON.parse(readFileSync(0,'utf8'));for(const raw of records){const state=parseSave(raw);if(!state||serializeSave(state)!==raw)throw Error('Cold weather freight save rejected or changed');const forged=JSON.parse(raw);forged.frontierTrade.version=forged.frontierTrade.version===1?2:1;if(parseSave(JSON.stringify(forged))!==null)throw Error('Cold parser accepted relabeled freight');}process.stdout.write(JSON.stringify({exactCampaigns:records.length,runtime:process.version}));`;
 const result=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',script],{input:JSON.stringify(records),encoding:'utf8',timeout:60000,maxBuffer:1024*1024});assert.equal(result.status,0,result.stderr||result.error?.message);assert.equal(JSON.parse(result.stdout).exactCampaigns,2);
});

test('ordinary harvested food cold-replays against earned legacy and weather freight stores',{timeout:60000},async()=>{
 const states=[];
 for(const version of [1,2] as const){
  let state=deliveredReserves(version,1);const farm=regionalFoodPlan(seed).farms[0]!,outpost=regionalSupplyPlan(seed).outposts.find(p=>p.id===farm.siteId)!;
  state=gatherRegionalSupplyMaterials(state,outpost.deliveryPosition,outpost.cost).state;state=applyAction(state,{type:'move',x:outpost.deliveryPosition.x,z:outpost.deliveryPosition.z});
  for(const type of ['deliver','build'] as const){const next=applyAction(state,{type:'regional-supply',command:{type,outpostId:outpost.id,expectedRevision:state.frontierSupply!.revision}});assert.notEqual(next,state);state=next;}
  for(let second=0;second<1000&&state.frontierSupply!.outposts.find(o=>o.id===outpost.id)!.spilled===0;second++)state=advance(state,1);
  assert(state.frontierSupply!.outposts.find(o=>o.id===outpost.id)!.spilled>0);state=enableRegionalFood(state);const baseline=clone(state.frontierFood!.tradeBaseline);
  state=applyAction(state,{type:'move',x:farm.interactionPosition.x,z:farm.interactionPosition.z});const started=applyAction(state,{type:'regional-food',command:{type:'start-farm',targetId:farm.id,expectedRevision:state.frontierFood!.revision}});assert.notEqual(started,state);state=advance(started,600);
  assert(state.frontierFood!.farms[0]!.harvested>0);assert(state.frontierFood!.farms[0]!.meals>4);assert(regionalFoodConservation(state.frontierFood!).every(f=>f.balanced));assert.deepEqual(state.frontierFood!.tradeBaseline,baseline);assert.equal(state.frontierFood!.tradeSnapshot.version,version);states.push(roundTrip(state));
 }
 const cold=await import('../src/regional-food.ts?harvested-freight-versions');for(const state of [...states,...states].reverse()){assert(cold.validRegionalFood(clone(state.frontierFood),state));assert.deepEqual(cold.immutableRegionalFood(clone(state.frontierFood),state),state.frontierFood);}
});

test('ordinary food records the v2 freight rebase threshold while its own clock advances only zero to four',()=>{
 const initial=fresh(2),raw=clone(initial.frontierTrade!);raw.ticks=REGIONAL_TRADE_MAX_TICKS-regionalTradeDrainTicks(seed,2);
 const state=enableRegionalFood({...initial,frontierTrade:immutableRegionalTrade(raw,initial)}),before=clone(state.frontierFood!),next=applyAction(state,{type:'tick',dt:1});
 assert.notEqual(next,state);assert.equal(before.ticks,0);assert.equal(next.frontierFood!.ticks,4);assert.equal(next.frontierSupply!.ticks,4);assert.equal(next.frontierFood!.tradeEvents.length,1);assert.deepEqual(next.frontierFood!.tradeEvents[0],{type:'rebase',ticks:0,remainder:0});assert.deepEqual(next.frontierFood!.tradeBaseline,before.tradeBaseline);assert.deepEqual(next.frontierFood!.tradeSnapshot,next.frontierTrade);assert.equal(next.frontierTrade!.version,2);assert(next.frontierTrade!.ticks<raw.ticks);roundTrip(next);
});

test('four authenticated weather-freight peers share one clock and preserve command and sequence idempotency',async()=>{
 const fixture=await foodHttpFixture();try{
  const peers=await foodExpedition(fixture,atTrade(fresh(2))),host=peers[0]!,command=tradeCommand(host.s.world),expected=applyAction(host.s.world,command),hold=fixture.hold(),pending=foodInput(fixture,peers[1]!,[command]);
  await hold.waiting;try{await foodInput(fixture,host,[command]);}finally{hold.release();}await pending;await Promise.all(peers.slice(2).map(p=>foodInput(fixture,p,[command])));await Promise.all(peers.map(p=>foodCurrent(fixture,p)));assert(fixture.conflicts()>0);
  for(const peer of peers){assert.deepEqual(peer.s.world.frontierTrade,expected.frontierTrade);assert.equal(peer.s.world.frontierFood!.tradeEvents.length,1);assert.equal(peer.s.world.frontierTrade!.version,2);}
  const ticked=applyAction(host.s.world,{type:'tick',dt:1});fixture.advance(1000);await Promise.all(peers.map(p=>foodInput(fixture,p)));await Promise.all(peers.map(p=>foodCurrent(fixture,p)));
  for(const peer of peers){assert.deepEqual(peer.s.world.frontierTrade,ticked.frontierTrade);assert.deepEqual(peer.s.world.frontierSupply,ticked.frontierSupply);assert.deepEqual(peer.s.world.frontierFood,ticked.frontierFood);roundTrip(peer.s.world);}
  const stable=serializeSave(host.s.world),replayed=await fixture.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:host.s.ack,sessionId:host.s.sessionId,actions:[command]});assert.equal(replayed.status,200);assert.equal(serializeSave(replayed.body.world),stable);
  const sessionId=host.s.sessionId;assert.equal((await fixture.raw(host.user,`/rooms/${host.s.roomId}/leave`,{sessionId})).status,200);fixture.advance(3600000);await foodInput(fixture,peers[1]!);assert(peers[1]!.s.paused);assert.deepEqual(peers[1]!.s.world.frontierTrade,ticked.frontierTrade);assert.deepEqual(peers[1]!.s.world.frontierFood,ticked.frontierFood);
  const resumed=await fixture.raw(host.user,`/rooms/${host.s.roomId}/resume`,{});assert.equal(resumed.status,200);assert.deepEqual(resumed.body.world.frontierTrade,ticked.frontierTrade);assert.equal(resumed.body.world.frontierTrade.version,2);
 }finally{await fixture.stop();}
});

test('four HTTP peers advance loaded weather freight once through rain and a real drying speed boundary',async()=>{
 const route=regionalTradePlan(seed).routes[0]!,rainEnd=regionalTradeRoadWeather(seed,route,0).nextChangeTick,dryingBoundary=rainEnd+REGIONAL_TRADE_DRYING_TICKS;
 const base=issue(issue(fresh(2),'start-source'),'clear-route'),windows=[{name:'loaded rain',tick:240},{name:'drying speed transition',tick:dryingBoundary-2},{name:'dry recovery',tick:rainEnd+4*REGIONAL_TRADE_DRYING_TICKS+4}];
 for(const {name,tick} of windows){
  let state=advance(base,Math.floor(tick/4));if(tick%4)state=applyAction(state,{type:'tick',dt:tick%4*.25});assert.equal(state.frontierTrade!.ticks,tick);assert.equal(state.frontierTrade!.routes[0]!.activity,'outbound');assert.equal(state.frontierTrade!.routes[0]!.cargo,4);
  const fixture=await foodHttpFixture();try{
   const peers=await foodExpedition(fixture,state),host=peers[0]!,before=clone(host.s.world.frontierTrade!),expected=applyAction(host.s.world,{type:'tick',dt:1}),metres=regionalTradeWeatherMetres(seed,route,tick,tick+4);
   fixture.advance(1000);await Promise.all(peers.map(p=>foodInput(fixture,p)));await Promise.all(peers.map(p=>foodCurrent(fixture,p)));
   for(const peer of peers){const trade=peer.s.world.frontierTrade!;assert.equal(trade.ticks,before.ticks+4,name);assert.deepEqual(trade,expected.frontierTrade,name);assert.deepEqual(peer.s.world.frontierSupply,expected.frontierSupply);assert.deepEqual(peer.s.world.frontierFood,expected.frontierFood);assert(Math.abs(trade.routes[0]!.distance-before.routes[0]!.distance-metres)<.000002,name);assert.equal(trade.routes[0]!.cargo,4);assert.equal(trade.routes[0]!.delivered,0);assert(regionalTradeConservation(trade).every(r=>r.balanced));roundTrip(peer.s.world);}
   const accepted=clone(host.s.world.frontierTrade),replay=await fixture.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:host.s.ack,sessionId:host.s.sessionId,actions:[]});assert.equal(replay.status,200);assert.deepEqual(replay.body.world.frontierTrade,accepted);await Promise.all(peers.map(p=>foodInput(fixture,p)));await foodCurrent(fixture,host);assert.deepEqual(host.s.world.frontierTrade,accepted,'four additional same-time inputs cannot repeat travel');
   if(name==='loaded rain')assert(metres<route.speed);if(name==='drying speed transition')assert(regionalTradeRoadWeather(seed,route,tick+4).speed>regionalTradeRoadWeather(seed,route,tick).speed);if(name==='dry recovery')assert.equal(metres,route.speed);
  }finally{await fixture.stop();}
 }
});

function deliveredReserves(version:1|2,supplyVersion:1|2=2){
 let state=fresh(version,supplyVersion);for(let i=0;i<2;i++){state=issue(state,'start-source',i);state=issue(state,'clear-route',i);}
 const limit=Math.ceil(Math.max(...regionalTradePlan(seed).routes.slice(0,2).map(p=>p.travelSeconds))*14+600);
 for(let second=0;second<limit;second++){
  for(let i=0;i<2;i++)if(state.frontierTrade!.routes[i]!.destinationStock>=4&&state.frontierTrade!.routes[i]!.buildStartedAt===null)state=issue(state,'build-store',i);
  if(state.frontierTrade!.routes.slice(0,2).every(r=>r.activity==='finished'))break;
  state={...state,frontierTrade:advanceRegionalTrade(state.frontierTrade!,1)};
 }
 assert(state.frontierTrade!.routes.slice(0,2).every(r=>r.activity==='finished'&&r.destinationStock===8&&r.embodied===4&&r.shipments===3));assert(regionalTradeConservation(state.frontierTrade!).every(r=>r.balanced));return roundTrip(atTrade(state,'withdraw-reserve'));
}
async function relocateAll(fixture:FoodFixture,peers:FoodPeer[],position:{x:number;z:number}){
 const room=fixture.stored(peers[0]!.s.roomId);for(const p of room.players){p.player={...p.player,...position};p.motion=createVertical(worldHeight({...room.world,player:p.player},position.x,position.z));delete p.wildernessCollisionVersion;}room.world={...room.world,player:{...room.players[0]!.player}};fixture.replace(room);await Promise.all(peers.map(p=>foodCurrent(fixture,p)));
}
async function race(fixture:FoodFixture,peers:FoodPeer[],command:CoopAction){
 const hold=fixture.hold(),pending=foodInput(fixture,peers[1]!,[command]);await hold.waiting;try{await foodInput(fixture,peers[0]!,[command]);}finally{hold.release();}await pending;await Promise.all(peers.slice(2).map(p=>foodInput(fixture,p,[command])));await Promise.all(peers.map(p=>foodCurrent(fixture,p)));
}
test('weather-freight reserves fund one shared collector without duplicate extraction withdrawal or allocation',{timeout:60000},async()=>{
 for(const version of [1,2] as const){const state=deliveredReserves(version),fixture=await foodHttpFixture();try{
  const peers=await foodExpedition(fixture,state),host=peers[0]!,initialWilderness=clone(host.s.world.wilderness??null),initialInventory=clone(host.s.world.inventory);
  for(let i=0;i<2;i++){
   await relocateAll(fixture,peers,regionalTradePlan(seed).projects[i]!.interactionPosition);const command=tradeCommand(host.s.world,'withdraw-reserve',i);await race(fixture,peers,command);const before=clone(host.s.world.frontierTrade);await foodInput(fixture,host,[command]);await foodInput(fixture,host,[tradeCommand(host.s.world,'withdraw-reserve',i)]);assert.deepEqual(host.s.world.frontierTrade,before);
  }
  assert.deepEqual(regionalTradeWithdrawn(host.s.world.frontierTrade),{wood:8,stone:8});const freight=clone(host.s.world.frontierTrade),outpost=regionalSupplyPlan(seed).outposts[0]!;await relocateAll(fixture,peers,outpost.deliveryPosition);
  const command:CoopAction={type:'regional-supply',command:{type:'deliver',outpostId:outpost.id,expectedRevision:host.s.world.frontierSupply!.revision}};await race(fixture,peers,command);assert(fixture.conflicts()>=3);
  for(const peer of peers){assert.deepEqual(peer.s.world.frontierTrade,freight);assert.equal(peer.s.world.frontierTrade!.version,version);assert.deepEqual(regionalSupplySpent(peer.s.world.frontierSupply),outpost.cost);assert.deepEqual(regionalSupplyAvailable(peer.s.world.frontierSupply,peer.s.world.wilderness,peer.s.world.frontierTrade),{wood:8-outpost.cost.wood,stone:8-outpost.cost.stone});assert.deepEqual(peer.s.world.wilderness??null,initialWilderness);assert.deepEqual(peer.s.world.inventory,initialInventory);assert(regionalTradeConservation(peer.s.world.frontierTrade!).every(r=>r.balanced));roundTrip(peer.s.world);}
  const supplied=clone(host.s.world.frontierSupply);await foodInput(fixture,host,[command]);assert.deepEqual(host.s.world.frontierSupply,supplied);assert.deepEqual(host.s.world.frontierTrade,freight);
 }finally{await fixture.stop();}}
});
