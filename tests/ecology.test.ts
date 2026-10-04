import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {worldValley} from '../src/generation.ts';
import {ecologyPlan,ecologyPlotClearance,ecologyStage,ecologyView,ecologyWeather,createEcologyState,advanceEcology,applyEcologyCommand,validEcology,ecologyCost,ecologyWaterBalance,ECOLOGY_RULES,ECOLOGY_WATER_SCALE,type EcologyState,type EcologyCommand,type EcologyContext} from '../src/ecology.ts';
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
function fixture(seed=73129,hp=40){const ecology=createEcologyState(seed),p=ecologyPlan(seed).plots[0]!;return {ecology,context:{seed,generation:2,zone:'valley',player:{x:p.position.x,z:p.position.z,hp},inventory:{scrap:3,core:2,water:48}} as EcologyContext,plotId:p.id};}
type Fixture=ReturnType<typeof fixture>;
type CommandInput=EcologyCommand extends infer C?C extends EcologyCommand?Omit<C,'expectedRevision'>:never:never;
function act(f:Fixture,input:CommandInput){const r=applyEcologyCommand(f.ecology,f.context,{...input,expectedRevision:f.ecology.revision} as EcologyCommand);return {...f,ecology:r.state,context:{...f.context,inventory:r.inventory,player:{...f.context.player,hp:f.context.player.hp+r.hpEffect}}};}
function tick(f:Fixture,seconds:number){let ecology=f.ecology;for(let i=0;i<seconds;i++)ecology=advanceEcology(ecology,1);return {...f,ecology};}
function plant(f:Fixture){return act(f,{type:'plant',plotId:f.plotId,species:ecologyPlan(f.context.seed).plots.find(p=>p.id===f.plotId)!.habitat==='sunny'?'sunleaf':'reedmoss'});}
function mature(f:Fixture){for(let i=0;i<900&&ecologyStage(f.ecology.plots.find(p=>p.id===f.plotId)!.crop)!=='ripe';i++)f=tick(f,1);assert.equal(ecologyStage(f.ecology.plots.find(p=>p.id===f.plotId)!.crop),'ripe');return f;}
function conserved(f:Fixture){assert.equal(validEcology(f.ecology,f.context.seed),true);assert.equal(ecologyWaterBalance(f.ecology),0);assert.equal(f.context.inventory.water+ecologyCost(f.ecology).water,48);assert.equal(f.context.inventory.scrap,3);assert.equal(f.context.inventory.core,2);assert.equal(f.ecology.harvested*2,f.ecology.biomass+f.ecology.crafted*2);assert.equal(f.ecology.crafted,f.ecology.bioGel+f.ecology.used);assert.equal(f.ecology.seeds+f.ecology.plots.filter(p=>p.crop).length+f.ecology.harvested,12);}

test('seeded plans preserve original terrain/resources/IDs and obey actual geometry with a finite tested fallback',()=>{
 const seeds=[0,1,3,73129,0xffffffff,2528090702,3084875593,2993451726,...Array.from({length:48},(_,n)=>(Math.imul(n,2654435761)+17)>>>0)];let fallback=0;
 for(const seed of seeds){const valley=worldValley(seed),before=JSON.stringify(valley),plan=ecologyPlan(seed);assert.equal(plan.plots.length,3);assert.ok(plan.candidateCount<=1513);if(plan.fallbackUsed)fallback++;
  for(const p of plan.plots)assert.ok(ecologyPlotClearance(valley,p.position,plan.plots.filter(other=>p.id!==other.id)),`${seed}: ${p.id}`);
  assert.equal(JSON.stringify(valley),before);assert.deepEqual(plan,ecologyPlan(seed));assert.ok(Object.isFrozen(plan));
 }
 assert.ok(fallback>=3);assert.notDeepEqual(ecologyPlan(1).plots,ecologyPlan(3).plots);
 const v=worldValley(1);assert.equal(ecologyPlotClearance(v,v.endpoints.spawn),false);assert.equal(ecologyPlotClearance(v,v.buildings[0]!.plan.shapes.find(s=>s.solid)!.center),false);assert.equal(ecologyPlotClearance(v,v.roads[0]!.points[2]!),false);assert.equal(ecologyPlotClearance(v,v.decorations[0]!),false);assert.equal(ecologyPlotClearance(v,{x:NaN,z:0}),false);
});

test('1 and 3 repeated plant-water-grow-harvest-craft-repair scenarios conserve all real inputs and goods',()=>{
 for(const repeats of [1,3]){let f=fixture();const initial=copy(f);
  for(let i=0;i<repeats;i++){f=plant(f);if(f.ecology.plots[0]!.soilWater<=4000)f=act(f,{type:'water',plotId:f.plotId});f=mature(f);f=act(f,{type:'harvest',plotId:f.plotId});f=act(f,{type:'craft-gel'});f=act(f,{type:'use-gel'});conserved(f);}
  assert.equal(f.ecology.harvested,repeats);assert.equal(f.ecology.used,repeats);assert.equal(f.context.player.hp,40+repeats*20);assert.equal(f.ecology.seeds,12-repeats);assert.equal(f.ecology.biomass,0);assert.equal(f.ecology.bioGel,0);assert.deepEqual(initial,fixture());
  assert.equal(ecologyView(f.ecology).history.length,f.ecology.records.length);assert.ok(f.ecology.records.some(r=>r.kind==='sprouted'));assert.ok(f.ecology.records.some(r=>r.kind==='budding'));assert.ok(f.ecology.records.some(r=>r.kind==='ripe'));
 }
});

test('climate, temperature, habitat, rain, evaporation and moisture change actual growth deterministically',()=>{
 let a=plant(fixture(1)),b=act(a,{type:'water',plotId:a.plotId});a=tick(a,20);b=tick(b,20);
 assert.ok(b.ecology.plots[0]!.crop!.growth>a.ecology.plots[0]!.crop!.growth);assert.notEqual(a.ecology.plots[0]!.soilWater,b.ecology.plots[0]!.soilWater);assert.ok(a.ecology.water.evaporated>0);conserved(a);conserved(b);
 const identical=tick(plant(fixture(1)),20);assert.deepEqual(a,identical);
 assert.notDeepEqual(ecologyWeather(1,0),ecologyWeather(3,0));assert.notEqual(ecologyWeather(1,0).temperature,ecologyWeather(1,36).temperature);
 const rainy=tick(fixture(1),96);assert.ok(rainy.ecology.water.rain>0);assert.ok(rainy.ecology.water.evaporated>0);assert.equal(rainy.ecology.harvested,0);assert.equal(rainy.ecology.records.length,0,'weather does not invent player history');
 const sunny=plant(fixture(3)),sheltered=plant(fixture(73129));assert.notEqual(ecologyView(sunny.ecology).plots[0]!.temperature,ecologyView(sheltered.ecology).plots[0]!.temperature);
 const wrong=act(fixture(3),{type:'plant',plotId:fixture(3).plotId,species:'reedmoss'});assert.equal(ecologyView(wrong.ecology).plots[0]!.growthFactors.habitat,.68);assert.equal(ecologyView(sunny.ecology).plots[0]!.growthFactors.habitat,1);
});

test('accepted-command revision survives weather ticks but stale commands cannot double-spend or heal',()=>{
 const f=fixture(),water:EcologyCommand={type:'water',plotId:f.plotId,expectedRevision:0},afterTicks=tick(f,2);assert.equal(afterTicks.ecology.revision,0);
 const paid=applyEcologyCommand(afterTicks.ecology,afterTicks.context,water);assert.equal(paid.inventory.water,47);assert.equal(paid.state.revision,1);assert.equal(applyEcologyCommand(paid.state,{...afterTicks.context,inventory:paid.inventory},water).state,paid.state);
 let gel=act(act(mature(plant(f)),{type:'harvest',plotId:f.plotId}),{type:'craft-gel'});const cmd:EcologyCommand={type:'use-gel',expectedRevision:gel.ecology.revision},nearFull={...gel.context,player:{...gel.context.player,hp:97.25}};
 const used=applyEcologyCommand(gel.ecology,nearFull,cmd);assert.equal(used.hpEffect,2.75);assert.equal(used.state.bioGel,0);assert.equal(used.state.restoredHP,2.75);assert.equal(applyEcologyCommand(used.state,nearFull,cmd).hpEffect,0);assert.equal(validEcology(used.state,f.context.seed),true);
 const full=applyEcologyCommand(gel.ecology,{...gel.context,player:{...gel.context.player,hp:100}},cmd);assert.equal(full.state,gel.ecology);assert.equal(full.hpEffect,0);
 const underground=applyEcologyCommand(gel.ecology,{...gel.context,zone:'cave'},cmd);assert.equal(underground.hpEffect,20,'carried suit gel works underground');
});

test('range, correct zone, finite resources, exact canister capacity and alive state are enforced at execution',()=>{
 const f=fixture(),command:EcologyCommand={type:'water',plotId:f.plotId,expectedRevision:0};
 for(const ctx of [{...f.context,zone:'cave'},{...f.context,generation:1},{...f.context,seed:4},{...f.context,player:{...f.context.player,hp:0}},{...f.context,player:{...f.context.player,x:NaN}},{...f.context,player:{...f.context.player,x:78,z:78}},{...f.context,inventory:{...f.context.inventory,water:0}},{...f.context,inventory:{...f.context.inventory,water:.5}}])assert.equal(applyEcologyCommand(f.ecology,ctx,command).state,f.ecology);
 const watered=act(f,{type:'water',plotId:f.plotId});assert.equal(watered.ecology.plots[0]!.soilWater,5600);assert.equal(act(watered,{type:'water',plotId:f.plotId}).ecology,watered.ecology);
 assert.equal(act(f,{type:'plant',plotId:'foreign',species:'sunleaf'}).ecology,f.ecology);assert.equal(act(f,{type:'harvest',plotId:f.plotId}).ecology,f.ecology);assert.equal(act(f,{type:'craft-gel'}).ecology,f.ecology);
});

test('finite seeds and goods capacities prevent auto-harvest, silent overflow, regeneration and unbounded rewards',()=>{
 let f=fixture();for(let i=0;i<3;i++)f=act(mature(plant(f)),{type:'harvest',plotId:f.plotId});assert.equal(f.ecology.biomass,6);f=mature(plant(f));const ripe=f.ecology;assert.equal(act(f,{type:'harvest',plotId:f.plotId}).ecology,ripe);
 const waiting=tick(f,192);assert.equal(waiting.ecology.biomass,6);assert.equal(ecologyStage(waiting.ecology.plots[0]!.crop),'ripe');f=waiting;
 for(let i=0;i<3;i++)f=act(f,{type:'craft-gel'});assert.equal(f.ecology.bioGel,3);f=act(f,{type:'harvest',plotId:f.plotId});assert.equal(act(f,{type:'craft-gel'}).ecology,f.ecology,'full gel pouch');
 for(let i=4;i<12;i++){
  f={...f,context:{...f.context,player:{...f.context.player,hp:40}}};if(f.ecology.bioGel>0)f=act(f,{type:'use-gel'});if(f.ecology.biomass>=2)f=act(f,{type:'craft-gel'});f=act(mature(plant(f)),{type:'harvest',plotId:f.plotId});conserved(f);
 }
 assert.equal(f.ecology.seeds,0);assert.equal(f.ecology.harvested,12);assert.equal(plant(f).ecology,f.ecology);assert.equal(tick(f,500).ecology.harvested,12);
});

test('bounded catch-up, split-step equivalence, save round trips and no retroactive migration rewards',()=>{
 const initial=fixture(),a=advanceEcology(initial.ecology,1e9),b=advanceEcology(initial.ecology,1);assert.deepEqual(a,b);assert.equal(a.tick,4);
 let split=initial.ecology;for(let i=0;i<10;i++)split=advanceEcology(split,.1);assert.deepEqual(split,b);assert.equal(advanceEcology(a,Infinity),a);assert.equal(advanceEcology(a,-1),a);
 let f=tick(plant(initial),71);const round=copy(f);assert.deepEqual(tick(round,20),tick(f,20));conserved(f);
 const fresh=createEcologyState(73129);assert.equal(fresh.tick,0);assert.equal(fresh.records.length,0);assert.equal(fresh.bioGel,0);assert.equal(fresh.harvested,0);assert.equal(ecologyCost(undefined).water,0);
});

function longIdle(seed:number,cycles:number){
 let f=tick(fixture(seed),96*12),next=tick(f,96);assert.deepEqual(f.ecology.plots,next.ecology.plots,'steady cycle reached');const s=copy(f.ecology);
 for(const k of ['rain','evaporated','runoff'] as const)s.water[k]+=(next.ecology.water[k]-f.ecology.water[k])*cycles;s.tick+=384*cycles;return s;
}
test('exact analytical idle replay matches ordinary ticking and validates years of elapsed time in bounded work',()=>{
 for(const seed of [0,1,3,17,73129,0xffffffff]){let f=tick(fixture(seed),96*16+11);conserved(f);const huge=longIdle(seed,1_000_000),start=performance.now();assert.equal(validEcology(huge,seed),true);const ms=performance.now()-start;assert.ok(ms<250,`large-elapsed validation took ${ms.toFixed(1)}ms`);assert.equal(ecologyWaterBalance(huge),0);}
 let late={...fixture(1),ecology:longIdle(1,1_000_000)};late=act(mature(plant(late)),{type:'harvest',plotId:late.plotId});conserved(late);
 const malformed=copy(longIdle(1,1_000_000));malformed.tick=Number.MAX_SAFE_INTEGER;const start=performance.now();assert.equal(validEcology(malformed,1),false);assert.ok(performance.now()-start<100);
});

test('strict save validation rejects forged goods, climate water, growth, costs, healing, duplicate logs and unknown fields',()=>{
 let f=act(act(act(mature(act(plant(fixture()),{type:'water',plotId:fixture().plotId})),{type:'harvest',plotId:fixture().plotId}),{type:'craft-gel'}),{type:'use-gel'});conserved(f);
 const mutations:((s:EcologyState)=>void)[]=[s=>s.hash='x',s=>s.version=2 as 1,s=>s.seed++,s=>s.seeds++,s=>s.biomass++,s=>s.bioGel++,s=>s.harvested++,s=>s.crafted++,s=>s.used++,s=>s.restoredHP++,s=>s.canistersSpent++,s=>s.revision++,s=>s.plots[0]!.soilWater++,s=>s.water.rain++,s=>s.water.irrigation++,s=>s.water.evaporated++,s=>s.water.uptake++,s=>s.water.runoff++,s=>s.records.push(copy(s.records[0]!)),s=>s.records[0]!.amount=2,s=>s.records[0]!.tick=5,s=>s.records[0]!.revision=0,s=>s.records[0]!.plotId='foreign',s=>s.records[0]!.id='fake',s=>s.records.find(r=>r.kind==='used')!.amount=21,s=>s.records[0]!.species='__proto__' as 'sunleaf',s=>s.remainder=.25,s=>(s as unknown as Record<string,unknown>).unvalidated=true];
 for(const mutate of mutations){const s=copy(f.ecology);mutate(s);assert.doesNotThrow(()=>validEcology(s,f.context.seed));assert.equal(validEcology(s,f.context.seed),false,mutate.toString());}
 const growing=plant(fixture());growing.ecology.plots[0]!.crop!.growth=30;assert.equal(validEcology(growing.ecology,73129),false);
 for(const value of [null,[],{},NaN,{...f.ecology,plots:[null,null,null]},{...f.ecology,records:[null]},{...f.ecology,water:{...f.ecology.water,secret:0}}]){assert.doesNotThrow(()=>validEcology(value,73129));assert.equal(validEcology(value,73129),false);}
});

test('mixed accepted and rejected commands keep conserved integer water and replayable finite goods across all three beds',()=>{
 let f=fixture(17),random=17;const rand=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296;};
 for(let n=0;n<1200;n++){
  const p=ecologyPlan(17).plots[Math.floor(rand()*3)]!;f={...f,plotId:p.id,context:{...f.context,player:{...f.context.player,x:p.position.x,z:p.position.z}}};const choice=rand();
  if(choice<.12)f=plant(f);else if(choice<.22)f=act(f,{type:'water',plotId:p.id});else if(choice<.34)f=act(f,{type:'harvest',plotId:p.id});else if(choice<.44)f=act(f,{type:'craft-gel'});else if(choice<.54)f=act(f,{type:'use-gel'});else f=tick(f,3);
  if(n%40===0)conserved(f);
 }
 conserved(f);assert.ok(f.ecology.records.length<=132);assert.ok(f.ecology.plots.every(p=>Number.isInteger(p.soilWater)&&p.soilWater>=0&&p.soilWater<=8000));
 const reordered=JSON.parse(JSON.stringify(f.ecology,(key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).reverse()):value));assert.equal(validEcology(reordered,17),true,'object key order is not a save version');
});
