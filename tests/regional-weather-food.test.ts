import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,enableRegionalFood,type State} from '../src/world.ts';
import {createRegionalFoodLabCampaign} from '../src/regional-food-lab.ts';
import {regionalFoodPlan,regionalFoodConservation,type RegionalFoodFarm} from '../src/regional-food.ts';
import {regionalSupplyPlan,type RegionalSupplyOutpost} from '../src/regional-supply.ts';
import {regionalWeatherAt} from '../src/regional-weather.ts';

const seed=73129,farmIndex=1,clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const initial=new Map<1|2,State>();
function started(version:1|2):State {
 const cached=initial.get(version);if(cached)return cached;
 let state=enableRegionalFood(createRegionalFoodLabCampaign(seed,true,version));
 const farm=regionalFoodPlan(seed).farms[farmIndex]!;
 state=applyAction(state,{type:'move',x:farm.interactionPosition.x,z:farm.interactionPosition.z});
 const next=applyAction(state,{type:'regional-food',command:{type:'start-farm',targetId:farm.id,expectedRevision:state.frontierFood!.revision}});
 assert.notEqual(next,state,'the ordinary local start-farm action is accepted');
 assert.equal(next.frontierSupply!.version,version);assert.equal(next.frontierFood!.ticks,0);
 initial.set(version,next);return next;
}
function advance(state:State,seconds:number):State {for(let second=0;second<seconds;second++)state=applyAction(state,{type:'tick',dt:1});return state;}
/** Observable instantaneous state, deliberately excluding cumulative accounting.
 * Matching these values during a drought does not imply matching future rainfall. */
function dryPose(source:RegionalSupplyOutpost,farm:RegionalFoodFarm){return JSON.stringify({
 source:{started:source.buildStartedAt!==null,built:source.builtAt!==null,workTicks:source.workTicks,water:source.water,residents:source.residents.map(r=>({activity:r.activity,distance:r.routeProgress,work:r.actionTicks,thirst:r.thirst,carrying:r.carrying}))},
 farm:{started:farm.startedAt!==null,currentCropTended:farm.lastTendedHarvest===farm.harvests,water:farm.water,seeds:farm.seeds,crop:farm.crop,growth:farm.growth,harvestWork:farm.harvestWork,stock:farm.stock,reserved:farm.reserved,cargo:farm.cargo,store:farm.store,farmerHunger:farm.farmer.hunger,carrierHunger:farm.carrier.hunger,activity:farm.activity,distance:farm.distance,actionWork:farm.actionWork,returnMeal:farm.returnMeal,farmerMeal:farm.farmerMeal,carrierMeal:farm.carrierMeal,farmerEating:farm.farmerEating}
});}

test('ordinary regional food cold replay preserves later rain after repeated complete dry poses',{timeout:60000},async t=>{
 let state=started(2);const baseline=state.frontierFood!.supplyStartTick,farmPlan=regionalFoodPlan(seed).farms[farmIndex]!,sourcePlan=regionalSupplyPlan(seed).outposts.find(p=>p.id===farmPlan.siteId)!;
 assert.equal(baseline,9018*4,'the earned prerequisite clock is retained');
 const firstFood=clone(state.frontierFood!),dryPoses=new Map<string,{tick:number;cycleTick:number}>();let repeatedDry=false,settledDry=0,laterRain=false;
 for(let second=0;second<3600;second++){
  const before=state.frontierFood!.farms[farmIndex]!,weather=regionalWeatherAt(seed,sourcePlan.position.x,sourcePlan.position.z,state.frontierSupply!.ticks);
  if(second%30===0&&weather.intensity===0){
   const source=state.frontierSupply!.outposts.find(o=>o.id===farmPlan.siteId)!,pose=dryPose(source,before),prior=dryPoses.get(pose);
   if(prior&&prior.cycleTick!==weather.cycleTick){assert(state.frontierFood!.ticks>prior.tick);repeatedDry=true;}
   else dryPoses.set(pose,{tick:state.frontierFood!.ticks,cycleTick:weather.cycleTick});
  }
  state=advance(state,1);const after=state.frontierFood!.farms[farmIndex]!;
  if(weather.intensity===0&&weather.drySeconds>=1&&weather.secondsUntilChange>1){assert.equal(after.waterCaptured,before.waterCaptured);settledDry++;}
  if(repeatedDry&&weather.intensity>0&&after.waterCaptured>firstFood.farms[farmIndex]!.waterCaptured)laterRain=true;
  assert(regionalFoodConservation(state.frontierFood!).every(f=>f.balanced));
 }
 assert.equal(state.frontierFood!.ticks,14_400);assert.equal(state.frontierSupply!.ticks,baseline+14_400);
 assert(repeatedDry,'complete instantaneous dry poses repeat at different weather phases');assert(settledDry>100);assert(laterRain,'rain after the repeated dry poses reaches the garden');assert(state.frontierFood!.farms[farmIndex]!.harvested>0);
 // A fresh module has no warm food replay certificates or expected-state cache.
 const cold=await import('../src/regional-food.ts?weather-food-season-cold');
 const began=performance.now();assert(cold.validRegionalFood(clone(state.frontierFood),state),'cold replay must reconstruct the ordinary season and subsequent complete drought without skipping recovery rain');
 assert(cold.validRegionalFood(clone(state.frontierFood),state),'cached validation agrees with cold reconstruction');
 t.diagnostic(`Cold ordinary-season validation ${(performance.now()-began).toFixed(1)} ms; ${state.frontierFood!.farms[farmIndex]!.harvested} food harvested`);
});

test('food replay cache isolates legacy and regional supply with identical ordinary histories',{timeout:60000},async()=>{
 const legacy=advance(started(1),60),regional=advance(started(2),60),a=legacy.frontierFood!,b=regional.frontierFood!;
 assert.equal(legacy.frontierSupply!.ticks,regional.frontierSupply!.ticks);assert.equal(a.supplyStartTick,b.supplyStartTick);assert.equal(a.supplyStartRemainder,b.supplyStartRemainder);assert.equal(a.ticks,b.ticks);
 assert.deepEqual(legacy.frontierSupply!.outposts.map(o=>o.buildStartedAt),regional.frontierSupply!.outposts.map(o=>o.buildStartedAt));
 assert.deepEqual(a.tradeBaseline,b.tradeBaseline);assert.deepEqual(a.tradeEvents,b.tradeEvents);assert.deepEqual(a.receipts,b.receipts);
 assert.notDeepEqual(a.farms,b.farms,'the real rainfall models produce different ledgers on the same clocks');
 for(const [label,order] of [['legacy-first',[legacy,regional]],['regional-first',[regional,legacy]]] as const){
  const cold=await import(`../src/regional-food.ts?weather-food-cache-${label}`);
  for(const state of [...order,...order])assert(cold.validRegionalFood(clone(state.frontierFood),state),`${label}: supply v${state.frontierSupply!.version} remains valid after the other model warms the cache`);
 }
});
