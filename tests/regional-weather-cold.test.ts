import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegionalSupply,regionalSupplyPlan,regionalSupplyLocalSources,immutableRegionalSupply,applyRegionalSupplyCommand,advanceRegionalSupply,type RegionalSupplyState} from '../src/regional-supply.ts';
import {immutableWildernessState} from '../src/wilderness-state.ts';

const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const q=(n:number)=>Math.round(n*1e6)/1e6;
const MAX_TICKS=1_000_000_000;
function builtCollectors(seed:number,startTick:number){
 const identity={generation:2 as const,seed,regional:{version:1 as const}},plan=regionalSupplyPlan(seed),ids=new Set<string>(),totals={wood:0,stone:0};
 for(const p of plan.outposts){const local=regionalSupplyLocalSources(seed,p.id);for(const kind of ['wood','stone'] as const)for(const id of local[kind])if(!ids.has(id)){ids.add(id);totals[kind]++;}}
 const wilderness=immutableWildernessState({version:1,generation:2,seed,harvested:[...ids],...totals},identity),ctx={...identity,wilderness};
 // A waiting ledger has a closed-form clock and no production or materials yet.
 const initial=clone(createRegionalSupply(seed,2));initial.ticks=startTick;
 for(const o of initial.outposts)for(const a of o.residents){a.thirst=Math.min(100,q(60+startTick*.03));a.thirstOverflow=q(Math.max(0,60+startTick*.03-100));}
 let state=immutableRegionalSupply(initial,ctx);
 for(const p of plan.outposts)for(const type of ['deliver','build'] as const){
  const next=applyRegionalSupplyCommand(state,{...ctx,zone:'valley',player:{x:p.deliveryPosition.x,z:p.deliveryPosition.z,hp:100},feetY:p.position.y,grounded:true},{type,outpostId:p.id,expectedRevision:state.revision}).state;
  assert.notEqual(next,state,`${seed}: ordinary ${type} at ${p.id}`);state=next;
 }
 return {state,ctx};
}
function until(state:RegionalSupplyState,tick:number){while(state.ticks<tick)state=advanceRegionalSupply(state,Math.min(1,(tick-state.ticks)*.25));return state;}
function dynamics(state:RegionalSupplyState){return state.outposts.map(o=>({water:o.water,workTicks:o.workTicks,residents:o.residents.map(a=>({activity:a.activity,routeProgress:a.routeProgress,actionTicks:a.actionTicks,thirst:a.thirst,carrying:a.carrying}))}));}
function extrapolate(previous:RegionalSupplyState,current:RegionalSupplyState,endTick:number){
 const period=current.ticks-previous.ticks,cycles=(endTick-current.ticks)/period;assert(Number.isInteger(cycles));
 assert.deepEqual(dynamics(previous),dynamics(current),'only observed identical dynamics may be extrapolated');
 const state=clone(current);state.ticks=endTick;
 for(let i=0;i<state.outposts.length;i++){
  const o=state.outposts[i]!,a=previous.outposts[i]!,b=current.outposts[i]!;
  for(const field of ['precipitation','captured','spilled','consumed'] as const)o[field]=q(b[field]+(b[field]-a[field])*cycles);
  for(let n=0;n<o.residents.length;n++)for(const field of ['thirstOverflow','drunk','service'] as const)o.residents[n]![field]=q(b.residents[n]![field]+(b.residents[n]![field]-a.residents[n]![field])*cycles);
 }
 return state;
}
test('regional weather supply cold replay validates observed seasonal cycles at the billion-tick limit',{timeout:60000},async t=>{
 for(const [seed,startTick] of [[0,0],[42,137],[73129,8300],[0xffffffff,10000]] as const){
  const fixture=builtCollectors(seed,startTick),previous=until(fixture.state,20000),current=until(previous,30000),far=extrapolate(previous,current,MAX_TICKS);
  const cold=await import(`../src/regional-supply.ts?weather-cold-${seed}-${startTick}`),started=performance.now();
  assert(cold.validRegionalSupply(far,fixture.ctx),`cold weather history ${seed}:${startTick}`);
  const ms=performance.now()-started;assert(ms<5000,`cold weather replay exceeded bounded budget: ${ms} ms`);
  const restored=cold.immutableRegionalSupply(clone(far),fixture.ctx);assert.equal(cold.advanceRegionalSupply(restored,1),restored);assert.equal(restored.remainder,0);assert(JSON.stringify(far).length<15000);
  for(const o of far.outposts){assert(Math.abs(o.captured-o.water-o.spilled-o.consumed-o.residents.reduce((n,a)=>n+a.carrying,0))<.00001);assert(o.captured<=o.precipitation);}
  t.diagnostic(`seed ${seed}, build tick ${startTick}, six seasonal max-clock collectors: ${ms.toFixed(1)} ms cold validation`);
 }
});
test('late-built regional weather collectors cold replay within a finite terminal window',async()=>{
 for(const startTick of [MAX_TICKS-10001,MAX_TICKS-201,MAX_TICKS-1]){
  const fixture=builtCollectors(73129,startTick),state=until(fixture.state,MAX_TICKS),cold=await import(`../src/regional-supply.ts?weather-late-${startTick}`);
  assert(cold.validRegionalSupply(clone(state),fixture.ctx),`late weather construction at ${startTick}`);
  const restored=cold.immutableRegionalSupply(clone(state),fixture.ctx);assert.deepEqual(restored,state);assert.equal(cold.advanceRegionalSupply(restored,.25),restored);
  assert(state.outposts.every(o=>o.buildStartedAt===startTick&&o.precipitation>=0));
 }
});
