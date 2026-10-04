import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRegionalObjective,type RegionalObjective} from '../src/regional-objective.ts';
import {createSettlementWorkbench} from '../src/regional-settlement-workbench.ts';
import {createRegionalFood,regionalFoodPlan,regionalFoodInteractions} from '../src/regional-food.ts';
import {regionalSupplyPlan,regionalSupplyAvailable} from '../src/regional-supply.ts';
import {regionalTradePlan} from '../src/regional-trade.ts';
import {regionalCacheStats} from '../src/regional-world.ts';
import {createWildernessState} from '../src/wilderness-state.ts';

/** Display-only fixtures cloned from production initial state. These tests neither
 * advance a clock nor submit fabricated snapshots to production/save authority. */
function fixture(farmIndex=1,version:1|2=1,seed=73129){
 const state=structuredClone(createSettlementWorkbench(seed));
 state.wilderness=structuredClone(createWildernessState(state));
 if(version===2)state.frontierFood=structuredClone(createRegionalFood(seed,state.frontierSupply!,state.frontierTrade!,2));
 const farm=regionalFoodPlan(seed).farms[farmIndex]!,supply=regionalSupplyPlan(seed),trade=regionalTradePlan(seed);
 const collector=supply.outposts.find(o=>o.id===farm.siteId)!,route=trade.routes.find(r=>r.projectId===farm.storeId)!;
 const savedCollector=state.frontierSupply!.outposts.find(o=>o.id===collector.id)!,savedRoute=state.frontierTrade!.routes.find(r=>r.id===route.id)!,savedFarm=state.frontierFood!.farms.find(f=>f.id===farm.id)!;
 state.player.x=collector.deliveryPosition.x;state.player.z=collector.deliveryPosition.z;
 const select=()=>{const result=selectRegionalObjective(state,{previousSiteId:collector.id});assert(result);assert.equal(result.siteId,collector.id);return result;};
 return {state,farm,collector,route,savedCollector,savedRoute,savedFarm,select};
}
type Fixture=ReturnType<typeof fixture>;
function finishStore(f:Fixture){Object.assign(f.savedRoute,{sourceStartedAt:0,repairStartedAt:4,clearedAt:8,buildStartedAt:20,builtAt:40,remaining:8,delivered:4,embodied:4,destinationStock:0,withdrawn:0});}
function finishCollector(f:Fixture){Object.assign(f.savedCollector,{delivered:{...f.collector.cost},buildStartedAt:0,builtAt:48,workTicks:48,water:3});}
function startFarm(f:Fixture){Object.assign(f.savedFarm,{startedAt:0,starterGranted:4,store:4});}
function readyFarm(version:1|2=1){const f=fixture(1,version);finishStore(f);finishCollector(f);startFarm(f);return f;}
const words=(o:RegionalObjective)=>`${o.title} ${o.copy} ${o.progress}`;

test('regional objective preserves exact original core, zone and laboratory ownership',()=>{
 const {state}=fixture();state.player.x=0;state.player.z=0;
 assert(selectRegionalObjective(state),'an unaccepted core request did not suppress regional guidance previously');
 state.jobAccepted=true;assert.equal(selectRegionalObjective(state),null);
 state.waterRestored=true;assert.equal(selectRegionalObjective(state),null,'accepted request stays protected after restoration');
 state.jobAccepted=false;state.jobs.active={id:'commission',deliveredAt:0,servedAt:0};assert.equal(selectRegionalObjective(state),null);
 state.player.x=100;assert(selectRegionalObjective(state),'the exact core boundary is outside its suppression area');
 state.jobs.active=null;state.player.x=0;state.jobs.completed=['commission'];assert(selectRegionalObjective(state),'completed commissions alone do not change the legacy guard');
 for(const zone of ['cave','dungeon'] as const){state.zone=zone;assert.equal(selectRegionalObjective(state),null);}
 state.zone='valley';assert.equal(selectRegionalObjective(state,{labActive:true}),null);
 delete state.frontierSupply;assert.equal(selectRegionalObjective(state),null);
});

test('dependency selection matches farm, freight project and collector identities rather than first entries',()=>{
 for(const farmIndex of [0,1,2]){
  const f=fixture(farmIndex),trade=regionalTradePlan(f.state.seed);
  for(const r of f.state.frontierTrade!.routes)if(r.id!==f.route.id)Object.assign(r,{sourceStartedAt:0,repairStartedAt:1,clearedAt:2,buildStartedAt:3,builtAt:4});
  for(const o of f.state.frontierSupply!.outposts)if(o.id!==f.collector.id)Object.assign(o,{buildStartedAt:0,builtAt:48});
  let result=f.select();assert.equal(result.stage,'freight');assert.equal(result.inspect.targetId,f.route.sourceId);assert.deepEqual(result.position,trade.sources.find(s=>s.id===f.route.sourceId)!.interactionPosition);
  finishStore(f);result=f.select();assert.equal(result.stage,'collector');assert.equal(result.inspect.targetId,f.collector.id);
  finishCollector(f);result=f.select();assert.equal(result.stage,'farm');assert.equal(result.inspect.targetId,f.farm.id);assert.equal(result.status,'actionable');
 }
});

test('freight gives exact local source, road and store work points before completion',()=>{
 const f=fixture(),trade=regionalTradePlan(f.state.seed),project=trade.projects.find(p=>p.id===f.route.projectId)!;
 let result=f.select();assert.equal(result.status,'actionable');assert.equal(result.inspect.targetId,f.route.sourceId);
 Object.assign(f.savedRoute,{sourceStartedAt:0,activity:'outbound',cargo:4,distance:3});
 result=f.select();assert.equal(result.status,'actionable');assert.equal(result.inspect.targetId,f.route.id);assert.deepEqual(result.position,f.route.obstruction.interactionPosition);
 Object.assign(f.savedRoute,{repairStartedAt:2,activity:'blocked'});result=f.select();assert.equal(result.status,'waiting');assert.equal(result.inspect.targetId,f.route.id);
 Object.assign(f.savedRoute,{clearedAt:10,activity:'returning',cargo:0,destinationStock:4,delivered:4});result=f.select();assert.equal(result.status,'actionable');assert.equal(result.inspect.targetId,project.id);assert.deepEqual(result.position,project.interactionPosition);
 Object.assign(f.savedRoute,{buildStartedAt:12,embodied:4,destinationStock:0});result=f.select();assert.equal(result.status,'waiting');assert.match(result.title,/construction/i);
});

test('built and fully exhausted freight hand off without requiring reserve withdrawal',()=>{
 for(const exhausted of [false,true]){
  const f=fixture();finishStore(f);
  if(exhausted)Object.assign(f.savedRoute,{remaining:0,activity:'finished',delivered:12,withdrawn:8});
  assert.equal(f.select().stage,'collector');
  finishCollector(f);let result=f.select();assert.equal(result.stage,'farm');assert.equal(result.inspect.targetId,f.farm.id);assert.match(result.title,/start/i);
  startFarm(f);Object.assign(f.savedFarm,{water:2,crop:'growing',growth:20,seeds:1,waterUsed:2});result=f.select();assert.equal(result.stage,'farm');assert.notEqual(result.status,'completed');
 }
});

test('collector distinguishes carried materials, staged build readiness and construction waiting',()=>{
 const f=fixture();finishStore(f);let result=f.select();assert.equal(result.stage,'collector');assert.match(result.title,/gather/i);
 f.state.wilderness!.wood=1;result=f.select();assert.match(result.title,/deliver/i);assert.equal(result.status,'actionable');
 f.savedCollector.delivered={...f.collector.cost};result=f.select();assert.match(result.title,/build/i);assert.equal(result.status,'actionable');
 f.savedCollector.buildStartedAt=0;f.savedCollector.workTicks=12;startFarm(f);result=f.select();assert.equal(result.stage,'collector');assert.equal(result.status,'waiting');assert.match(result.title,/construction/i);
 finishCollector(f);assert.equal(f.select().stage,'farm');
});

test('waiting freight yields to useful delivery and assembly for the same community',()=>{
 const f=fixture();Object.assign(f.savedRoute,{sourceStartedAt:0,repairStartedAt:2,clearedAt:10,activity:'outbound',cargo:4,distance:12});
 assert.equal(f.select().stage,'freight');f.state.wilderness!.wood=1;let result=f.select();assert.equal(result.stage,'collector');assert.match(result.title,/deliver/i);
 f.savedCollector.delivered={...f.collector.cost};result=f.select();assert.equal(result.stage,'collector');assert.match(result.title,/build/i);
});

test('a ready farm may start while collector construction is still in progress',()=>{
 const f=fixture();finishStore(f);f.savedCollector.delivered={...f.collector.cost};f.savedCollector.buildStartedAt=0;f.savedCollector.workTicks=12;
 const action=regionalFoodInteractions(f.state.seed,f.state.frontierFood,f.state).find(a=>a.farmId===f.farm.id&&a.kind==='start-farm')!;assert(action.enabled);
 const result=f.select();assert.equal(result.stage,'farm');assert.equal(result.status,'actionable');assert.equal(result.inspect.targetId,f.farm.id);assert.match(result.title,/start/i);
});

test('collector reserve advice requires completed store, actual stock and a still-missing material',()=>{
 const f=fixture();finishStore(f);const plan=regionalTradePlan(f.state.seed),stoneIndex=plan.routes.findIndex(r=>r.material==='quarry-stone'),woodIndex=plan.routes.findIndex(r=>r.material==='deadwood-timber');
 assert(stoneIndex>=0&&woodIndex>=0);f.savedCollector.delivered.wood=f.collector.cost.wood;
 const stone=f.state.frontierTrade!.routes[stoneIndex]!,wood=f.state.frontierTrade!.routes[woodIndex]!;
 Object.assign(wood,{sourceStartedAt:0,repairStartedAt:1,clearedAt:2,buildStartedAt:3,builtAt:4,destinationStock:8});
 Object.assign(stone,{sourceStartedAt:0,repairStartedAt:1,clearedAt:2,buildStartedAt:3,builtAt:null,destinationStock:8});
 // Keep the local freight dependency complete while testing a separate stone reserve.
 if(stone.id===f.route.id)stone.builtAt=4;
 if(stone.id!==f.route.id){assert.equal(f.select().stage,'collector','unfinished other store cannot supply building reserve');stone.builtAt=4;}
 let result=f.select();assert.equal(result.stage,'freight');assert.equal(result.inspect.targetId,plan.projects[stoneIndex]!.id);assert.match(result.title,/reserve/i);assert.equal(result.siteId,f.collector.id);
 stone.destinationStock=0;stone.cargo=8;result=f.select();assert.equal(result.stage,'collector','loaded cargo is not withdrawable reserve');
 stone.cargo=0;stone.withdrawn=2;assert.equal(regionalSupplyAvailable(f.state.frontierSupply,f.state.wilderness,f.state.frontierTrade).stone,2);result=f.select();assert.equal(result.stage,'collector');assert.match(result.title,/deliver/i);
 f.savedCollector.delivered.stone=2;assert.equal(regionalSupplyAvailable(f.state.frontierSupply,f.state.wilderness,f.state.frontierTrade).stone,0);assert.match(f.select().title,/gather/i);
});

test('starter errands, held food, stewardship and harvested stock do not certify crop meals',()=>{
 const f=readyFarm();
 for(const activity of ['outbound','returning','eating'] as const){f.savedFarm.activity=activity;f.savedFarm.meals=2;f.savedFarm.farmerMeal=1;const result=f.select();assert.equal(result.stage,'farm');assert.notEqual(result.status,'completed');assert.doesNotMatch(result.title,/harvested meals reached/i);}
 Object.assign(f.savedFarm,{activity:'idle',farmerMeal:0,meals:4,store:0,tended:4,stewardship:4});let result=f.select();assert.notEqual(result.status,'completed');
 Object.assign(f.savedFarm,{harvested:4,harvests:1,stock:4});result=f.select();assert.notEqual(result.status,'completed');assert.match(words(result),/carrier|load/i);
 Object.assign(f.savedFarm,{stock:0,reserved:4,activity:'loading'});result=f.select();assert.match(words(result),/load/i);assert.notEqual(result.status,'completed');
 Object.assign(f.savedFarm,{reserved:0,cargo:4,activity:'outbound'});result=f.select();assert.match(words(result),/pantry|unload/i);assert.deepEqual(result.position,f.farm.storeInteractionPosition);assert.notEqual(result.status,'completed');
 f.savedFarm.activity='unloading';result=f.select();assert.match(result.title,/Unloading/);assert.match(result.copy,/has reached the pantry/);assert.notEqual(result.status,'completed');
 Object.assign(f.savedFarm,{cargo:0,delivered:4,store:3,carrierMeal:1,activity:'eating'});result=f.select();assert.notEqual(result.status,'completed');assert.match(words(result),/starter/i);
 Object.assign(f.savedFarm,{carrierMeal:0,meals:5,activity:'returning'});result=f.select();assert.equal(result.stage,'meal');assert.equal(result.status,'completed');assert.match(result.copy,/at least 1/i);assert.match(result.copy,/starter/i);
});

test('meal completion needs actual crop and delivery counters in addition to consumed portions',()=>{
 const f=readyFarm();f.savedFarm.meals=5;
 assert.notEqual(f.select().status,'completed');f.savedFarm.harvested=4;assert.notEqual(f.select().status,'completed');f.savedFarm.delivered=4;assert.equal(f.select().status,'completed');
});

test('crop and delivery progress remain visible before renewable collector completion',()=>{
 const f=fixture(1,2);finishStore(f);startFarm(f);Object.assign(f.savedFarm,{waterIrrigated:4,water:2,waterUsed:2,seeds:1,crop:'growing',growth:20});
 let result=f.select();assert.equal(result.stage,'farm');assert.match(words(result),/grow|tend/i);
 Object.assign(f.savedFarm,{crop:'ripe',growth:f.farm.growWork,harvestWork:3});result=f.select();assert.equal(result.stage,'farm');assert.match(words(result),/harvest/i);
 Object.assign(f.savedFarm,{crop:'empty',harvested:4,cargo:4,activity:'outbound'});result=f.select();assert.equal(result.stage,'farm');assert.match(words(result),/pantry|unload/i);
 Object.assign(f.savedFarm,{cargo:0,delivered:4,meals:5});result=f.select();assert.equal(result.stage,'meal');assert.equal(result.status,'completed');assert.match(result.copy,/collector.*renewable/i);
});

test('irrigation advice follows production availability and stays optional',()=>{
 const f=readyFarm(2);f.state.inventory.water=1;
 const production=()=>regionalFoodInteractions(f.state.seed,f.state.frontierFood,f.state).find(a=>a.farmId===f.farm.id&&a.kind==='irrigate-farm')!;
 assert(production().enabled);let result=f.select();assert.equal(result.irrigation?.state,'available');assert.match(result.irrigation!.text,/optional/i);assert.equal(result.status,'waiting');
 f.state.inventory.water=0;assert.equal(production().enabled,false);assert.equal(f.select().irrigation?.state,'no-canister');
 f.state.inventory.water=1;f.savedFarm.water=2;assert(production().enabled);assert.equal(f.select().irrigation?.state,'available');
 f.savedFarm.water=2.01;assert.equal(production().enabled,false);assert.equal(f.select().irrigation?.state,'no-space');
 f.savedFarm.water=0;f.savedFarm.waterIrrigated=4;assert.equal(production().enabled,false);result=f.select();assert.equal(result.irrigation?.state,'used');assert.match(result.irrigation!.text,/used/i);
 f.savedFarm.waterIrrigated=0;f.savedFarm.startedAt=null;assert.equal(production().enabled,false);assert.equal(f.select().irrigation?.state,'not-started');
 const legacy=readyFarm();legacy.state.inventory.water=2;assert.equal(legacy.select().irrigation,undefined);assert.doesNotMatch(words(legacy.select()),/canister|emergency/i);
});

test('community cursor ignores moving workers and changing ordinary clock/status snapshots',()=>{
 const f=fixture(),selected=f.select().siteId;
 for(const tick of [0,12,80,240]){
  f.state.frontierSupply!.ticks=tick;f.state.frontierTrade!.ticks=tick;f.state.frontierFood!.ticks=tick;
  for(const r of f.state.frontierTrade!.routes){r.distance=tick;r.activity='outbound';}
  for(const farm of f.state.frontierFood!.farms){farm.distance=tick/2;farm.activity='returning';}
  assert.equal(f.select().siteId,selected);
 }
 finishStore(f);assert.equal(f.select().siteId,selected);finishCollector(f);assert.equal(f.select().siteId,selected);
 const other=regionalSupplyPlan(f.state.seed).outposts.find(o=>o.id!==selected&&Math.hypot(o.deliveryPosition.x-f.collector.deliveryPosition.x,o.deliveryPosition.z-f.collector.deliveryPosition.z)>200)!;
 delete f.state.frontierTrade;delete f.state.frontierFood;Object.assign(f.state.player,{x:other.deliveryPosition.x,z:other.deliveryPosition.z});
 assert.equal(selectRegionalObjective(f.state,{previousSiteId:selected})!.siteId,other.id,'substantial relocation releases the old community');
 assert.equal(selectRegionalObjective(f.state,{previousSiteId:'stale-site'})!.siteId,other.id);
});

test('small boundary jitter preserves an existing community while fresh selection is deterministic',()=>{
 const {state}=fixture();delete state.frontierTrade;delete state.frontierFood;
 const outposts=regionalSupplyPlan(state.seed).outposts;
 const pairs=outposts.flatMap((a,i)=>outposts.slice(i+1).map(b=>({a,b,d:Math.hypot(a.deliveryPosition.x-b.deliveryPosition.x,a.deliveryPosition.z-b.deliveryPosition.z)}))).sort((a,b)=>a.d-b.d);
 const {a,b,d}=pairs[0]!,mid={x:(a.deliveryPosition.x+b.deliveryPosition.x)/2,z:(a.deliveryPosition.z+b.deliveryPosition.z)/2},dx=(b.deliveryPosition.x-a.deliveryPosition.x)/d,dz=(b.deliveryPosition.z-a.deliveryPosition.z)/d;
 Object.assign(state.player,mid);const first=selectRegionalObjective(state)!.siteId;assert.equal(selectRegionalObjective(state)!.siteId,first);
 for(const offset of [-.25,.25,-.5,.5]){state.player.x=mid.x+dx*offset;state.player.z=mid.z+dz*offset;assert.equal(selectRegionalObjective(state,{previousSiteId:first})!.siteId,first);}
});

test('approaching the next local work point releases a completed remote freight community',()=>{
 const f=readyFarm();Object.assign(f.savedFarm,{harvested:4,delivered:4,meals:5});
 assert.equal(f.select().stage,'meal');
 const nearby=regionalFoodPlan(f.state.seed).farms.find(p=>p.siteId!==f.collector.id&&Math.hypot(p.interactionPosition.x-regionalTradePlan(f.state.seed).sources.find(s=>s.id===f.route.sourceId)!.interactionPosition.x,p.interactionPosition.z-regionalTradePlan(f.state.seed).sources.find(s=>s.id===f.route.sourceId)!.interactionPosition.z)<64)!;
 assert(nearby,'the incoming source is physically beside a different farm');Object.assign(f.state.player,{x:nearby.interactionPosition.x,z:nearby.interactionPosition.z});
 const result=selectRegionalObjective(f.state,{previousSiteId:f.collector.id})!;assert.equal(result.siteId,nearby.siteId);assert.notEqual(result.stage,'meal');
 const source=regionalTradePlan(f.state.seed).sources.find(s=>s.id===f.route.sourceId)!;Object.assign(f.state.player,{x:source.interactionPosition.x,z:source.interactionPosition.z});
 assert.equal(selectRegionalObjective(f.state,{previousSiteId:nearby.siteId})!.siteId,f.collector.id,'direct source inspection belongs to its actual destination chain');
});

test('repeated selector reads leave all state bytes untouched and compile no wilderness features',()=>{
 const f=fixture(1,2),before=JSON.stringify(f.state),stats=regionalCacheStats();
 for(let i=0;i<20;i++){const result=f.select();assert(result.id&&result.title&&result.copy&&result.progress);assert(!('command'in result));assert(!('command'in result.inspect));}
 assert.equal(JSON.stringify(f.state),before);assert.equal(regionalCacheStats().featureCompilations,stats.featureCompilations);
 finishStore(f);const afterStore=JSON.stringify(f.state),afterStats=regionalCacheStats();for(let i=0;i<20;i++)f.select();assert.equal(JSON.stringify(f.state),afterStore);assert.equal(regionalCacheStats().featureCompilations,afterStats.featureCompilations);
});

test('selector accepts deeply frozen snapshots without introducing display authority',()=>{
 const f=readyFarm(2);f.state.inventory.water=1;
 const freeze=(value:unknown):void=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}};
 freeze(f.state);const before=JSON.stringify(f.state),result=f.select();assert.equal(result.stage,'farm');assert.equal(result.irrigation?.state,'available');assert.equal(JSON.stringify(f.state),before);
});
