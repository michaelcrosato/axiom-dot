import test from 'node:test';
import assert from 'node:assert/strict';
import {regionalSupplyPlan,regionalSupplyLocalSources,createRegionalSupply,enableRegionalSupply,advanceRegionalSupply,applyRegionalSupplyCommand,regionalSupplySpent,regionalSupplyAvailable,regionalSupplySummary,regionalSupplyActorPoses,regionalSupplyConstructionBoxes,regionalSupplyProjectBoxes,regionalSupplyProjectSignature,validRegionalSupply,validRegionalSupplyCommand,immutableRegionalSupply,REGIONAL_SUPPLY_WORK_TICKS,REGIONAL_SUPPLY_STEP,type RegionalSupplyState,type RegionalSupplyContext} from '../src/regional-supply.ts';
import {regionalPlan,regionalCacheStats,regionalHeight,generateRegionalChunk,regionalChunkAt} from '../src/regional-world.ts';
import {immutableWildernessState,validWildernessState,type WildernessState} from '../src/wilderness-state.ts';
import {obstacleSegmentIntersects} from '../src/wilderness-geometry.ts';
const seed=73129,identity={generation:2 as const,seed,regional:{version:1 as const}},clone=<T>(s:T):T=>JSON.parse(JSON.stringify(s));
function stock(seed=identity.seed):WildernessState {const p=regionalSupplyPlan(seed),ids=new Set<string>(),totals={wood:0,stone:0};for(const place of p.outposts){const local=regionalSupplyLocalSources(seed,place.id);for(const kind of ['wood','stone'] as const)for(const id of local[kind])if(!ids.has(id)){ids.add(id);totals[kind]++;}}return immutableWildernessState({version:1,generation:2,seed,harvested:[...ids],...totals},{...identity,seed});}
function context(wilderness=stock(),index=0):RegionalSupplyContext {const p=regionalSupplyPlan(wilderness.seed).outposts[index]!;return {...identity,seed:wilderness.seed,zone:'valley',player:{x:p.deliveryPosition.x,z:p.deliveryPosition.z,hp:100},feetY:p.position.y,grounded:true,wilderness};}
function command(s:RegionalSupplyState,ctx:RegionalSupplyContext,type:'deliver'|'build',index=0){return applyRegionalSupplyCommand(s,ctx,{type,outpostId:s.outposts[index]!.id,expectedRevision:s.revision}).state;}
function builtStart(index=0){const ctx=context(stock(),index);let s=createRegionalSupply(seed);s=command(s,ctx,'deliver',index);s=command(s,ctx,'build',index);return {s,ctx};}
function run(s:RegionalSupplyState,seconds:number,dt=1){for(let i=0;i<seconds/dt;i++)s=advanceRegionalSupply(s,dt);return s;}
function validRoundTrip(s:RegionalSupplyState,ctx:RegionalSupplyContext){assert.ok(validRegionalSupply(clone(s),ctx),`invalid at tick ${s.ticks}: ${JSON.stringify(s.outposts[0])}`);return immutableRegionalSupply(clone(s),ctx);}

test('macro-only plan preserves all six stable outposts, terrain, roads and cache bounds',()=>{
 const before=regionalCacheStats().featureCompilations,p=regionalSupplyPlan(283717),base=regionalPlan(283717);assert.equal(regionalCacheStats().featureCompilations,before);assert.equal(p.outposts.length,6);assert.deepEqual(p.outposts.map(o=>o.id),base.sites.filter(o=>o.kind==='outpost').map(o=>o.id));
 for(const o of p.outposts){const site=base.sites.find(s=>s.id===o.id)!;assert.equal(o.ownerChunk,site.ownerChunk);assert.equal(o.position.x,site.position.x+site.structureOffset.x);assert.equal(o.position.z,site.position.z+site.structureOffset.z);assert.ok(o.roadIds.length>=2);assert.ok(o.roadIds.every(id=>base.roads.some(r=>r.id===id)));assert.deepEqual(o.buildPosition,o.deliveryPosition);}
 assert.ok(new Set(p.outposts.map(o=>JSON.stringify([o.cost,o.rainRate,o.capacity]))).size>=3);
});
test('supply enable is explicit, lazy, idempotent and preserves nonregional saves and position',()=>{
 const location={x:345,z:-890,hp:76},legacy={generation:1 as const,seed,player:location},connected={generation:2 as const,seed,player:location};assert.equal(enableRegionalSupply(legacy),legacy);assert.equal(enableRegionalSupply(connected),connected);
 const original={...identity,player:location},enabled=enableRegionalSupply(original);assert.equal(enabled.player,location);assert.ok('frontierSupply' in enabled);assert.equal(enableRegionalSupply(enabled),enabled);assert.ok(!('frontierSupply' in original));
});
test('real shortage becomes exact finite material delivery and one-time resident construction',()=>{
 const ctx=context(),p=regionalSupplyPlan(seed).outposts[0]!,s=createRegionalSupply(seed),summary=regionalSupplySummary(s,seed,p.id,ctx.wilderness)!;assert.equal(summary.phase,'shortage');assert.deepEqual(summary.missing,p.cost);assert.equal(command(s,ctx,'build'),s);
 const delivered=command(s,ctx,'deliver');assert.deepEqual(delivered.outposts[0]!.delivered,p.cost);assert.deepEqual(regionalSupplySpent(delivered),p.cost);assert.equal(delivered.revision,1);assert.equal(regionalSupplySummary(delivered,seed,p.id,ctx.wilderness)!.phase,'ready');assert.equal(regionalSupplyProjectBoxes(seed,delivered).length,0);assert.equal(command(delivered,ctx,'deliver'),delivered);
 assert.equal(applyRegionalSupplyCommand(delivered,ctx,{type:'deliver',outpostId:p.id,expectedRevision:0}).state,delivered);
 const construction=command(delivered,ctx,'build');assert.equal(construction.revision,2);assert.equal(construction.outposts[0]!.buildStartedAt,0);assert.equal(command(construction,ctx,'build'),construction);assert.equal(regionalSupplyProjectBoxes(seed,construction).length,2);assert.deepEqual(regionalSupplyAvailable(construction,ctx.wilderness),{wood:ctx.wilderness!.wood-p.cost.wood,stone:ctx.wilderness!.stone-p.cost.stone});assert.ok(validWildernessState(ctx.wilderness,identity));validRoundTrip(construction,ctx);
 const done=run(construction,30);assert.equal(done.outposts[0]!.workTicks,REGIONAL_SUPPLY_WORK_TICKS);assert.notEqual(done.outposts[0]!.builtAt,null);assert.equal(done.revision,construction.revision);assert.equal(regionalSupplyProjectSignature(done),regionalSupplyProjectSignature(construction));assert.deepEqual(regionalSupplyProjectBoxes(seed,done).map(({material,...box})=>box),regionalSupplyProjectBoxes(seed,construction).map(({material,...box})=>box));validRoundTrip(done,ctx);
});
test('roof rain is finite renewable input; physical gathering, drinking and hydration improve useful service',()=>{
 let {s,ctx}=builtStart();const phases=new Set<string>();let firstDrink:number|undefined;
 for(let i=0;i<180/REGIONAL_SUPPLY_STEP;i++){s=advanceRegionalSupply(s,REGIONAL_SUPPLY_STEP);const o=s.outposts[0]!;for(const a of o.residents)phases.add(a.activity);if(o.consumed>0&&firstDrink===undefined)firstDrink=s.ticks*REGIONAL_SUPPLY_STEP;if(i%31===0)validRoundTrip(s,ctx);assert.ok(o.water<=regionalSupplyPlan(seed).outposts[0]!.capacity);assert.ok(o.captured<=o.precipitation+1e-8);assert.ok(Math.abs(o.captured-o.water-o.spilled-o.consumed-o.residents.reduce((n,a)=>n+a.carrying,0))<1e-8);}
 assert.ok(firstDrink!==undefined&&firstDrink<90);assert.ok(['to-work','working','gathering','returning','drinking'].every(a=>phases.has(a)));assert.ok(s.outposts[0]!.residents.every(a=>a.drunk>0&&a.service>0));assert.ok(s.outposts[0]!.residents.every(a=>a.thirst<s.outposts[1]!.residents[0]!.thirst));assert.equal(s.outposts[0]!.consumed,s.outposts[0]!.residents.reduce((n,a)=>n+a.drunk,0));assert.ok(regionalSupplySummary(s,seed,s.outposts[0]!.id,ctx.wilderness)!.benefit.includes('4×'));validRoundTrip(s,ctx);
});
test('same coarse/live clock is decomposition stable and persists exactly away/revisit without offline catchup',()=>{
 const {s,ctx}=builtStart();assert.deepEqual(run(s,180,1),run(s,180,.25));assert.deepEqual(run(s,180,.1),run(s,180,1));const a=run(s,66),loaded=validRoundTrip(a,ctx);assert.deepEqual(run(loaded,88),run(s,154));assert.deepEqual(advanceRegionalSupply(s,1e12),advanceRegionalSupply(s,1));for(const dt of [-1,0,NaN,Infinity])assert.equal(advanceRegionalSupply(s,dt),s);assert.equal(run(s,180).revision,2);assert.ok(JSON.stringify(run(s,180)).length<15000);
});
test('bounded local source survey has enough regional supply across sampled seeds, with honest exhaustion',()=>{
 for(const seed of [0,1,42,991,73129,4294967295]){const p=regionalSupplyPlan(seed),before=regionalCacheStats().featureCompilations;for(const o of p.outposts){const sources=regionalSupplyLocalSources(seed,o.id);assert.ok(sources.wood.length>=o.cost.wood,`${seed} ${o.id} wood`);assert.ok(sources.stone.length>=o.cost.stone,`${seed} ${o.id} stone`);}assert.ok(regionalCacheStats().featureCompilations-before<=54);}
 const p=regionalSupplyPlan(identity.seed),o=p.outposts[0]!,local=regionalSupplyLocalSources(identity.seed,o.id),harvested=[...local.wood,...local.stone],wilderness=immutableWildernessState({version:1,generation:2,seed,harvested,wood:local.wood.length,stone:local.stone.length},identity),summary=regionalSupplySummary(createRegionalSupply(seed),seed,o.id,wilderness)!;assert.deepEqual(summary.localRemaining,{wood:0,stone:0});assert.ok(summary.alternatives.wood);assert.ok(summary.alternatives.stone);const exhausted=stock(),all=regionalSupplySummary(createRegionalSupply(seed),seed,o.id,exhausted)!;assert.deepEqual(all.localRemaining,{wood:0,stone:0});assert.deepEqual(all.alternatives,{wood:null,stone:null});
});
test('construction and resident routes fit untouched pads and clear shelter, storage and every road',()=>{
 for(const seed of [0,42,73129,4294967295]){const region=regionalPlan(seed);for(const p of regionalSupplyPlan(seed).outposts){const at=regionalChunkAt(p.position.x,p.position.z),base=generateRegionalChunk(seed,...p.ownerChunk.split(':').map(Number) as [number,number]).structures.filter(b=>b.id.startsWith(p.id+'/'));
  const project=regionalSupplyConstructionBoxes(seed,p.id),obstacles=[...base,...project].filter(b=>b.center.y+b.half.y>p.position.y+.2&&b.center.y-b.half.y<p.position.y+1.7).map(b=>({featureId:b.id,x:b.center.x,y:b.center.y,z:b.center.z,hx:b.half.x,hy:b.half.y,hz:b.half.z}));
  for(const b of project)for(const dx of [-b.half.x,b.half.x])for(const dz of [-b.half.z,b.half.z])assert.ok(Math.abs(regionalHeight(seed,b.center.x+dx,b.center.z+dz)-p.position.y)<1e-5);
  for(const a of p.residents)for(let i=1;i<a.path.length;i++){const from={...a.path[i-1]!,y:p.position.y+.85},to={...a.path[i]!,y:p.position.y+.85};assert.ok(obstacles.every(b=>!obstacleSegmentIntersects(b,from,to,.55)),`${seed} ${a.id} blocked path`);}
  assert.ok(Number.isInteger(at.cx));
 }}
});
test('strict boundary rejects malformed, replayed, forged, cross-world and over-capacity resource saves',()=>{
 const {ctx,s}=builtStart(),live=run(s,120);validRoundTrip(live,ctx);
 const cases:((bad:any)=>void)[]=[b=>b.secret=1,b=>b.seed++,b=>b.remainder=.25,b=>b.ticks=Infinity,b=>b.revision++,b=>b.receipts.push(b.receipts[0]),b=>b.receipts[0].wood++,b=>b.receipts[1].tick=-1,b=>b.outposts.reverse(),b=>b.outposts[0].delivered.wood++,b=>b.outposts[0].water++,b=>b.outposts[0].captured++,b=>b.outposts[0].precipitation++,b=>b.outposts[0].consumed++,b=>b.outposts[0].residents[0].thirst=0,b=>b.outposts[0].residents[0].routeProgress=1e9,b=>b.outposts[0].residents[0].carrying=2,b=>b.outposts[0].residents.push(b.outposts[0].residents[0]),b=>Object.defineProperty(b.outposts[0],'water',{get(){throw Error('getter');}})];
 for(const mutate of cases){const bad=clone(live);mutate(bad);assert.equal(validRegionalSupply(bad,ctx),false);}
 assert.equal(validRegionalSupply(live,{...ctx,wilderness:undefined} as any),false);assert.equal(validRegionalSupply(live,{...ctx,generation:1}),false);assert.equal(validRegionalSupply(live,{...ctx,seed:1}),false);assert.equal(validRegionalSupply(live,{...ctx,wilderness:{...ctx.wilderness!,wood:ctx.wilderness!.wood+1}}),false);
 const p=regionalSupplyPlan(seed).outposts[0]!,cmd={type:'deliver',outpostId:p.id,expectedRevision:0};for(const bad of [{...cmd,amount:5},{...cmd,expectedRevision:-1},{...cmd,expectedRevision:257},{...cmd,type:'claim'},{...cmd,outpostId:'x'.repeat(101)}])assert.equal(validRegionalSupplyCommand(bad),false);assert.equal(validRegionalSupplyCommand(cmd),true);
});
test('remote, dead, airborne, subterranean, stale and wrong-zone commands cannot transfer resources',()=>{
 const ctx=context(),s=createRegionalSupply(seed);for(const patch of [{zone:'dungeon'},{player:{...ctx.player,hp:0}},{player:{...ctx.player,x:0,z:0}},{grounded:false},{feetY:ctx.feetY!+5},{feetY:NaN}])assert.equal(command(s,{...ctx,...patch},'deliver'),s);const p=regionalSupplyPlan(seed).outposts[0]!;assert.equal(applyRegionalSupplyCommand(s,ctx,{type:'deliver',outpostId:p.id,expectedRevision:1}).state,s);
});

test('60Hz and 120Hz integer phase quantization stays bounded and preserves all work at the same completed coarse tick',()=>{
 const s=createRegionalSupply(seed),coarse=run(s,60);
 for(const fps of [60,120]){let live=s;for(let i=0;i<fps*60;i++)live=advanceRegionalSupply(live,1/fps);
  const acceptedSeconds=live.ticks*.25+live.remainder;assert(Math.abs(acceptedSeconds-60)<=fps*60*.5e-12+1e-14);
  // Quantized 120Hz frames end 2.4ns before the nominal boundary. Complete only
  // that real remaining fraction before comparing identical dynamic snapshots.
  if(live.ticks<coarse.ticks)live=advanceRegionalSupply(live,(coarse.ticks-live.ticks)*.25-live.remainder);
  assert.equal(live.ticks,coarse.ticks);assert(live.remainder<=fps*60*.5e-12);assert.deepEqual({...live,remainder:coarse.remainder},coarse);
 }
});
test('retroactive completion, invented hydration and uncertified advance laundering are rejected',()=>{
 const {s,ctx}=builtStart(),live=run(s,25),p=regionalSupplyPlan(seed).outposts[0]!;
 const retro=clone(live);retro.outposts[0]!.builtAt=1;retro.outposts[0]!.precipitation=0;for(let t=1;t<retro.ticks;t++)if((t+p.rainOffset)%120<80)retro.outposts[0]!.precipitation=Math.round((retro.outposts[0]!.precipitation+p.rainRate*.25)*1e6)/1e6;assert.equal(validRegionalSupply(retro,ctx),false);
 const hydration=clone(createRegionalSupply(seed));hydration.outposts[0]!.residents[0]!.thirst=0;hydration.outposts[0]!.residents[0]!.thirstOverflow=60;assert.equal(validRegionalSupply(hydration,ctx),false);
 const malformed=clone(createRegionalSupply(seed));malformed.outposts[0]!.water=5;malformed.outposts[0]!.captured=5;assert.equal(validRegionalSupply(malformed,ctx),false);assert.equal(advanceRegionalSupply(malformed,.01),malformed);assert.equal(validRegionalSupply(advanceRegionalSupply(malformed,.01),ctx),false);
 const forgedWork=clone(live);forgedWork.outposts[0]!.residents[0]!.service+=1;assert.equal(validRegionalSupply(forgedWork,ctx),false);
 const correct=clone(live);assert.ok(validRegionalSupply(correct,ctx));assert.notEqual(advanceRegionalSupply(correct,.01),correct);assert.equal(validRegionalSupplyCommand({type:'build',outpostId:'bad\n',expectedRevision:0}),false);assert.equal(validRegionalSupplyCommand({type:'build',outpostId:'bad\x7f',expectedRevision:0}),false);
});

test('bounded cold replay exactly validates long periodic histories and max-clock saves for all six biomes',async(testContext)=>{
 const dynamic=(s:RegionalSupplyState)=>s.outposts.map(o=>({water:o.water,workTicks:o.workTicks,residents:o.residents.map(a=>({activity:a.activity,routeProgress:a.routeProgress,actionTicks:a.actionTicks,thirst:a.thirst,carrying:a.carrying}))}));
 for(const [testSeed,startTick] of [[0,0],[991,137],[4294967295,6000]]){
  const wilderness=stock(testSeed),ctx=context(wilderness),plan=regionalSupplyPlan(testSeed);let initial=clone(createRegionalSupply(testSeed));initial.ticks=startTick!;
  for(const o of initial.outposts)for(const a of o.residents){a.thirst=Math.min(100,60+startTick!*.03);a.thirstOverflow=Math.max(0,60+startTick!*.03-100);}
  let s=immutableRegionalSupply(initial,ctx);
  for(let i=0;i<plan.outposts.length;i++){const local=context(wilderness,i);s=command(s,local,'deliver',i);s=command(s,local,'build',i);}
  const a=run(s,3000),b=run(a,7500);assert.deepEqual(dynamic(a),dynamic(b));
  // Independently repeat the observed identical 30,000-tick cycle, then run its finite tail.
  const max=1_000_000_000,target=max-20_000,cycles=Math.floor((target-b.ticks)/30000),skipped=clone(b);skipped.ticks+=cycles*30000;
  for(let i=0;i<skipped.outposts.length;i++){
   const o=skipped.outposts[i]!,prior=a.outposts[i]!,now=b.outposts[i]!;
   for(const field of ['precipitation','captured','spilled','consumed'] as const)o[field]=Math.round((now[field]+(now[field]-prior[field])*cycles)*1e6)/1e6;
   for(let n=0;n<o.residents.length;n++)for(const field of ['thirstOverflow','drunk','service'] as const)o.residents[n]![field]=Math.round((now.residents[n]![field]+(now.residents[n]![field]-prior.residents[n]![field])*cycles)*1e6)/1e6;
  }
  const cold=await import(`../src/regional-supply.ts?cold-${testSeed}-${startTick}`),t=performance.now();assert.ok(cold.validRegionalSupply(skipped,ctx),`cold max history ${testSeed} ${startTick}`);const elapsed=performance.now()-t;assert.ok(elapsed<5000,`cold validation ${elapsed}ms exceeded bounded budget`);
  let final=immutableRegionalSupply(skipped,ctx);while(final.ticks<max)final=advanceRegionalSupply(final,1);assert.equal(final.ticks,max);assert.equal(final.remainder,0);assert.equal(advanceRegionalSupply(final,1),final);const finalCold=await import(`../src/regional-supply.ts?final-cold-${testSeed}-${startTick}`),coldStart=performance.now();assert.ok(finalCold.validRegionalSupply(clone(final),ctx));const maxColdMs=performance.now()-coldStart;testContext.diagnostic(`seed ${testSeed}, build tick ${startTick}, six max-clock outposts: cold ${maxColdMs.toFixed(1)} ms, ${JSON.stringify(final).length} bytes`);assert.ok(maxColdMs<5000);assert.ok(JSON.stringify(final).length<15000);
 }
});
