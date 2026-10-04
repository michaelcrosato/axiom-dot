import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRegionalFoodLabCampaign,buildRegionalFoodLabCollectors,runRegionalFoodLab} from '../src/regional-food-lab.ts';
import {enableRegionalFood,applyAction,parseSave,serializeSave,type State} from '../src/world.ts';
import {regionalFoodPlan,regionalFoodSummary,regionalFoodConservation,regionalFoodActorPoses,regionalFoodInteractions} from '../src/regional-food.ts';
import {regionalSupplyPlan} from '../src/regional-supply.ts';
const seed=73129;
function startAll(input:State){let state=enableRegionalFood(input);for(const farm of regionalFoodPlan(state.seed).farms){state=applyAction(state,{type:'move',x:farm.interactionPosition.x,z:farm.interactionPosition.z});const prior=state;state=applyAction(state,{type:'regional-food',command:{type:'start-farm',targetId:farm.id,expectedRevision:state.frontierFood!.revision}});assert.notEqual(state,prior);}return state;}

test('disposable food lab repeats earned water crop carry unload meal and finite-request renewal scenarios exactly',{timeout:180_000},()=>{
 const report=runRegionalFoodLab(seed,3,{sourceRevision:'integration-test'});assert.equal(report.status,'complete',report.error);assert.equal(report.runs.length,3);
 for(const run of report.runs)assert.deepEqual(run.checks.filter(c=>!c.pass),[],JSON.stringify(run.checks.filter(c=>!c.pass)));
 const stable=report.runs.map(({iteration:_,metrics,...run})=>({...run,metrics:Object.fromEntries(Object.entries(metrics).filter(([k])=>!k.endsWith('Milliseconds')))}));assert.deepEqual(stable,[stable[0],stable[0],stable[0]]);
 assert(report.runs.every(run=>run.farms.length===3&&run.farms.every(f=>f.cycles>=7&&f.consumed>12&&f.checkpoints.length===6)));
 console.log(JSON.stringify({regionalFoodScenario:1,scope:report.scope,runs:report.runs}));
});

test('dry started gardens exhaust only declared starter meals then resume crops from actual newly built collector overflow',{timeout:120_000},()=>{
 let state=startAll(createRegionalFoodLabCampaign(seed,false));const initial=state,plan=regionalFoodPlan(seed),actorIds=regionalFoodActorPoses(seed,state.frontierFood).map(a=>a.id),oldIds=regionalSupplyPlan(seed).outposts.flatMap(o=>o.residents.map(r=>r.id));assert(actorIds.every(id=>!oldIds.includes(id)));assert.equal(new Set(actorIds).size,6);
 for(let second=0;second<240;second++)state=applyAction(state,{type:'tick',dt:1});
 assert(state.frontierFood!.farms.every(f=>f.water===0&&f.waterCaptured===0&&f.waterUsed===0&&f.harvested===0&&f.harvests===0&&f.seeds===2&&f.meals===f.starterGranted&&f.starterGranted===4));assert(state.frontierFood!.farms.every(f=>regionalFoodSummary(state.frontierFood!,seed,f.id)!.phase==='needs-water'));assert.deepEqual(state.frontierSupply!.outposts.map(o=>o.delivered),initial.frontierSupply!.outposts.map(o=>o.delivered));
 const dry=state;assert.deepEqual(parseSave(serializeSave(dry)),dry);state=buildRegionalFoodLabCollectors(state);const newlyBuilt=state.frontierSupply!.outposts.filter(o=>plan.farms.some(f=>f.siteId===o.id));assert(newlyBuilt.every(o=>o.buildStartedAt!==null&&o.builtAt===null));
 let simulatedSeconds=0;for(;simulatedSeconds<900;simulatedSeconds++){state=applyAction(state,{type:'tick',dt:1});assert(regionalFoodConservation(state.frontierFood!).every(b=>b.balanced));if(state.frontierFood!.farms.every(f=>f.harvests>=3&&f.meals>f.starterGranted+2&&f.waterUsed>=6))break;}
 assert(simulatedSeconds<900,'new rain and physical crop deliveries resume all three communities');assert(state.frontierFood!.farms.every(f=>f.harvests>=3&&f.meals>f.starterGranted));assert.deepEqual(regionalFoodActorPoses(seed,state.frontierFood).map(a=>a.id),actorIds);assert.deepEqual(parseSave(serializeSave(state)),state);
 console.log(JSON.stringify({regionalFoodShortage:1,scope:'Actual earned completed stores with unbuilt collectors, finite starter food exhaustion, real canonical gathered collector materials, real building and rain overflow followed by resumed crops and meals; no invented water or crop stock.',drySeconds:240,resumptionSeconds:simulatedSeconds+1,farms:state.frontierFood!.farms.map(f=>({id:f.id,starterGranted:f.starterGranted,harvests:f.harvests,harvested:f.harvested,meals:f.meals,waterCaptured:f.waterCaptured,waterUsed:f.waterUsed})),actorIds}));
});

test('multiple seeded campaigns generate real crops and conserved meals after every finite stewardship claim',{timeout:180_000},()=>{
 const records=[];for(const seed of [0,42]){const report=runRegionalFoodLab(seed,1,{sourceRevision:'integration-seed-sweep'});assert.equal(report.status,'complete',report.error);assert.equal(report.runs.length,1);const run=report.runs[0]!;assert.deepEqual(run.checks.filter(c=>!c.pass),[],JSON.stringify(run.checks.filter(c=>!c.pass)));records.push({seed,farms:run.farms,metrics:run.metrics});}
 console.log(JSON.stringify({regionalFoodCycles:1,scope:'Independent seeded earned-input production loops with recurring crops and meals beyond the bounded stewardship request set.',seeds:records}));
});

test('full capacity is a conserved waiting state and every available help job belongs to a distinct growing crop',{timeout:120_000},()=>{
 let state=startAll(createRegionalFoodLabCampaign(seed)),seen=new Map<string,Set<string>>(),full=false;
 for(let second=0;second<700;second++){
  for(const request of regionalFoodInteractions(seed,state.frontierFood,state).filter(a=>a.kind==='tend-crop'&&a.enabled)){const f=state.frontierFood!.farms.find(f=>f.id===request.farmId)!;assert.equal(f.crop,'growing');const summary=regionalFoodSummary(state.frontierFood!,seed,f.id)!;if(!seen.has(f.id))seen.set(f.id,new Set());seen.get(f.id)!.add(summary.jobId);}
  state=applyAction(state,{type:'tick',dt:1});assert(regionalFoodConservation(state.frontierFood!).every(c=>c.balanced));
  for(const f of state.frontierFood!.farms){const p=regionalFoodPlan(seed).farms.find(p=>p.id===f.id)!;if(f.stock===p.capacity.source&&f.store+f.cargo+f.reserved===p.capacity.store&&f.crop==='empty')full=true;}
 }
 assert(full);assert([...seen.values()].every(ids=>ids.size>=3));assert(state.frontierFood!.farms.every(f=>f.tended===0&&f.harvests>=5&&f.meals>f.starterGranted),'gardeners work and people eat without player chore commands');
});

test('one hour of active crop cycles remains bounded and cold process JSON replay rejects forged resources',{timeout:180_000},()=>{
 let state=startAll(createRegionalFoodLabCampaign(seed));const began=performance.now();let maximumTickMs=0,totalTickMs=0;
 for(let second=0;second<3600;second++){const tickStart=performance.now();state=applyAction(state,{type:'tick',dt:1});const ms=performance.now()-tickStart;maximumTickMs=Math.max(maximumTickMs,ms);totalTickMs+=ms;assert(regionalFoodConservation(state.frontierFood!).every(c=>c.balanced));}
 const activeElapsedMs=performance.now()-began,raw=serializeSave(state),foodBytes=new TextEncoder().encode(JSON.stringify(state.frontierFood)).byteLength;
 assert.equal(state.frontierFood!.ticks,14_400);assert(state.frontierFood!.farms.every(f=>f.harvests>=15&&f.meals>=50));assert(foodBytes<45_000);assert.equal(state.frontierFood!.receipts.length,3);
 // A fresh ordinary Node game-test process has no certified objects or warmed
 // replay cache from the parent. It receives only serialized disposable bytes.
 const script=`import {readFileSync} from 'node:fs';import {parseSave,serializeSave} from ${JSON.stringify(new URL('../src/world.ts',import.meta.url).href)};const raw=readFileSync(0,'utf8'),start=performance.now(),state=parseSave(raw),coldParseMilliseconds=performance.now()-start;if(!state)throw new Error('Cold production save rejected');if(serializeSave(state)!==raw)throw new Error('Cold replay changed saved bytes');const forged=JSON.parse(raw);forged.frontierFood.farms[0].water+=1;if(parseSave(JSON.stringify(forged))!==null)throw new Error('Cold replay accepted invented water');process.stdout.write(JSON.stringify({coldParseMilliseconds,exact:true,forgedWaterRejected:true,runtime:process.version}));`;
 const result=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',script],{input:raw,encoding:'utf8',timeout:120_000,maxBuffer:2*1024*1024});assert.equal(result.status,0,result.stderr||result.error?.message);const cold=JSON.parse(result.stdout);assert(cold.exact&&cold.forgedWaterRejected);
 console.log(JSON.stringify({regionalFoodColdReplay:1,scope:'3600 accepted one-second game-model updates, then production save parsing and forgery rejection in a fresh ordinary Node process with only JSON bytes. Local CPU observations, not a device-performance benchmark or offline production.',foodActiveSeconds:3600,activeElapsedMilliseconds:activeElapsedMs,activeTickMeanMilliseconds:totalTickMs/3600,activeTickMaximumMilliseconds:maximumTickMs,foodBytes,campaignBytes:new TextEncoder().encode(raw).byteLength,...cold,farms:state.frontierFood!.farms.map(f=>({id:f.id,harvests:f.harvests,harvested:f.harvested,meals:f.meals,starterGranted:f.starterGranted,seeds:f.seeds,seedsReturned:f.seedsReturned}))}));
});
