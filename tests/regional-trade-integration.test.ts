import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createConnectedState,createRegionalState,enableRegionalSupply,enableRegionalTrade,applyAction,parseSave,serializeSave,validateSave,type State} from '../src/world.ts';
import {createRegionalTrade,regionalTradePlan,regionalTradeCommandPosition,applyRegionalTradeCommand,advanceRegionalTrade,validRegionalTrade,validRegionalTradeCommand,immutableRegionalTrade,REGIONAL_TRADE_MAX_TICKS,type RegionalTradeCommand,type RegionalTradeState} from '../src/regional-trade.ts';
import {regionalPlan,regionalHeight,generateRegionalChunk} from '../src/regional-world.ts';
import {regionalSupplyPlan,regionalSupplyProjectBoxes} from '../src/regional-supply.ts';
import {gatherRegionalSupplyMaterials} from '../src/regional-supply-lab.ts';
import {runRegionalTradeLab} from '../src/regional-trade-lab.ts';
const seed=73129,clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
function command(state:RegionalTradeState,type:RegionalTradeCommand['type'],targetId:string){const c={type,targetId,expectedRevision:state.revision},p=regionalTradeCommandPosition(state.seed,c)!;return {c,context:{...createRegionalState(state.seed),player:{x:p.x,z:p.z,hp:100},feetY:p.y,grounded:true}};}
// This historical forgery fixture retains its exact original movement/version.
function start(){const s=createRegionalTrade(seed,1),{c,context}=command(s,'start-source',regionalTradePlan(seed).sources[0]!.id);return applyRegionalTradeCommand(s,context,c).state;}

test('disposable regional trade lab repeats the complete finite quarry/forestry, physical-time interruption, repair and store loop',{timeout:60_000},()=>{
 const report=runRegionalTradeLab(seed,3,{sourceRevision:'integration-test'});assert.equal(report.status,'complete',report.error);assert.equal(report.runs.length,3);
 for(const run of report.runs)assert.deepEqual(run.checks.filter(c=>!c.pass),[],JSON.stringify(run.checks.filter(c=>!c.pass)));
 const stable=report.runs.map(({iteration:_,metrics,routes,checks})=>({routes,checks,metrics:Object.fromEntries(Object.entries(metrics).filter(([k])=>!k.endsWith('Milliseconds')))}));assert.deepEqual(stable,[stable[0],stable[0],stable[0]]);
 assert.equal(report.runs[0]!.routes.length,3);assert.deepEqual(new Set(report.runs[0]!.routes.map(r=>r.templateId)).size,3);
 console.log(JSON.stringify({regionalTradeScenario:1,scope:report.scope,runs:report.runs}));
});

test('regional trade commands reject absent physical context, impossible reach/elevation, wrong identity and malformed or replayed requests',()=>{
 const s=createRegionalTrade(seed),{c,context}=command(s,'start-source',regionalTradePlan(seed).sources[0]!.id),before=clone(s);
 const wrong=[{...context,grounded:false},{...context,grounded:undefined},{...context,feetY:undefined},{...context,feetY:context.feetY+1},{...context,feetY:NaN},{...context,zone:'cave'},{...context,generation:1},{...context,seed:seed+1},{...context,player:{...context.player,hp:0}},{...context,player:{...context.player,x:context.player.x+3.01}},{...context,regional:undefined}];
 for(const ctx of wrong)assert.equal(applyRegionalTradeCommand(s,ctx as typeof context,c).state,s,JSON.stringify(ctx));
 for(const bad of [null,{},[],{...c,type:'deliver'},{...c,expectedRevision:-1},{...c,expectedRevision:.5},{...c,targetId:''},{...c,targetId:'a'.repeat(121)},{...c,targetId:'bad\n'},{...c,extra:1}]){assert.equal(validRegionalTradeCommand(bad),false);assert.equal(applyRegionalTradeCommand(s,context,bad as RegionalTradeCommand).state,s);}
 for(const bad of [{...c,expectedRevision:1},{...c,targetId:regionalTradePlan(seed+1).sources[0]!.id},{...c,type:'build-store' as const,targetId:regionalTradePlan(seed).projects[0]!.id}])assert.equal(applyRegionalTradeCommand(s,context,bad).state,s);
 const next=applyRegionalTradeCommand(s,context,c).state;assert.notEqual(next,s);assert.equal(applyRegionalTradeCommand(next,context,c).state,next);assert.equal(applyRegionalTradeCommand(next,context,{...c,expectedRevision:1}).state,next);assert.deepEqual(s,before);assert(Object.isFrozen(next));assert(Object.isFrozen(next.routes[0]));
});

test('full finite-event replay rejects forged stock, cargo, movement, receipts, reserve and completion without laundering through advance',()=>{
 let s=start();for(let i=0;i<30;i++)s=advanceRegionalTrade(s,1);const ctx=createRegionalState(seed);assert(validRegionalTrade(clone(s),ctx));
 const changes:((v:any)=>void)[]=[v=>v.routes[0].remaining++,v=>v.routes[0].stock++,v=>v.routes[0].cargo++,v=>v.routes[0].reserved++,v=>v.routes[0].distance+=2,v=>v.routes[0].legStartDistance+=2,v=>v.routes[0].destinationStock++,v=>v.routes[0].delivered++,v=>v.routes[0].embodied=4,v=>v.routes[0].builtAt=v.ticks,v=>v.routes[0].clearedAt=v.ticks,v=>v.routes[0].id=v.routes[1].id,v=>v.routes[0].nextEventAt++,v=>v.receipts[0].tick=1,v=>v.receipts[0].targetId=v.routes[0].id,v=>v.receipts.push(v.receipts[0]),v=>v.extra=1,v=>v.routes[0].extra=1,v=>v.ticks=NaN,v=>v.remainder=.25,v=>v.version=2];
 for(const change of changes){const forged=clone(s);change(forged);assert.equal(validRegionalTrade(forged,ctx),false,JSON.stringify(forged));assert.equal(advanceRegionalTrade(forged,.1),forged);assert.throws(()=>immutableRegionalTrade(forged,ctx));assert.equal(parseSave(JSON.stringify({...ctx,frontierTrade:forged})),null);}
 for(const dt of [NaN,Infinity,-1,0])assert.equal(advanceRegionalTrade(s,dt),s);assert.equal(advanceRegionalTrade(s,1000).ticks-s.ticks,4,'one call never time-warps a long trip');
 const future=clone(createRegionalTrade(seed));future.ticks=REGIONAL_TRADE_MAX_TICKS;const began=performance.now();assert(validRegionalTrade(future,ctx));const validationMs=performance.now()-began;assert(validationMs<1000,'idle replay is event-bounded rather than a billion-tick loop');const resumed=advanceRegionalTrade(immutableRegionalTrade(future,ctx),1);assert(resumed.ticks<REGIONAL_TRADE_MAX_TICKS);assert(validRegionalTrade(clone(resumed),ctx));assert.deepEqual(resumed.routes,future.routes);assert(Object.isFrozen(resumed));
 console.log(JSON.stringify({regionalTradeReplay:1,forgeriesRejected:changes.length,idleTicks:REGIONAL_TRADE_MAX_TICKS,idleValidationMilliseconds:validationMs}));
});

test('legacy saves, generation, harvested materials and completed V31 collector survive optional regional trade and world action round trips',{timeout:30_000},()=>{
 for(const old of [createState(seed),createConnectedState(seed),createRegionalState(seed)]){const raw=serializeSave(old);assert.deepEqual(parseSave(raw),old);assert.equal(Object.hasOwn(parseSave(raw)!,'frontierTrade'),false);if(!old.regional)assert.equal(enableRegionalTrade(old),old);}
 let state=enableRegionalSupply(createRegionalState(seed));const collector=regionalSupplyPlan(seed).outposts[0]!;
 state=gatherRegionalSupplyMaterials(state,collector.deliveryPosition,collector.cost).state;state=applyAction(state,{type:'move',x:collector.deliveryPosition.x,z:collector.deliveryPosition.z});
 for(const type of ['deliver','build'] as const)state=applyAction(state,{type:'regional-supply',command:{type,outpostId:collector.id,expectedRevision:state.frontierSupply!.revision}});
 for(let i=0;i<600&&state.frontierSupply!.outposts[0]!.builtAt===null;i++)state=applyAction(state,{type:'tick',dt:.25});assert.notEqual(state.frontierSupply!.outposts[0]!.builtAt,null);
 const original=clone(state),roads=clone(regionalPlan(seed).roads),boxes=clone(regionalSupplyProjectBoxes(seed,state.frontierSupply)),worldSamples=regionalPlan(seed).sites.map(p=>regionalHeight(seed,p.position.x,p.position.z)),enabled=enableRegionalTrade(state);
 assert.notEqual(enabled,state);assert.equal(enableRegionalTrade(enabled),enabled);assert.deepEqual(enabled.frontierSupply,state.frontierSupply);assert.deepEqual(enabled.wilderness,state.wilderness);assert.deepEqual(enabled.player,state.player);
 state=parseSave(serializeSave(enabled))!;assert(state);assert.deepEqual(state,enabled);const source=regionalTradePlan(seed).sources[0]!;state=applyAction(state,{type:'move',x:source.interactionPosition.x,z:source.interactionPosition.z});
 const initialTrade=state.frontierTrade!;state=applyAction(state,{type:'regional-trade',command:{type:'start-source',targetId:source.id,expectedRevision:initialTrade.revision}});assert.notEqual(state.frontierTrade,initialTrade,'world action supplies validated ordinary local context');
 for(let i=0;i<20;i++)state=applyAction(state,{type:'tick',dt:1});assert.equal(state.frontierTrade!.ticks,80);assert(state.frontierTrade!.routes[0]!.remaining<source.deposit);
 const beforeLeave=clone(state.frontierTrade);state=applyAction(state,{type:'move',x:1300,z:-1300});for(let i=0;i<110;i++)generateRegionalChunk(seed,-23+(i%45),-20+Math.floor(i/45)*20);
 state=parseSave(serializeSave(state))!;assert.deepEqual(state.frontierTrade,beforeLeave);assert.deepEqual(state.wilderness,original.wilderness);assert.deepEqual(state.inventory,original.inventory);assert.deepEqual(state.collected,original.collected);assert.deepEqual(regionalSupplyProjectBoxes(seed,state.frontierSupply),boxes);assert.equal(state.frontierSupply!.outposts[0]!.builtAt,original.frontierSupply!.outposts[0]!.builtAt);assert.deepEqual(regionalPlan(seed).roads,roads);assert.deepEqual(regionalPlan(seed).sites.map(p=>regionalHeight(seed,p.position.x,p.position.z)),worldSamples);assert(validateSave(state));
 console.log(JSON.stringify({regionalTradeLegacy:1,completedCollectorPreserved:true,lifetimeHarvestUnchanged:true,roadsAndTerrainUnchanged:true,saveBytes:new TextEncoder().encode(serializeSave(state)).byteLength}));
});

test('near and far active campaign clocks remain equivalent and saving pauses instead of adding offline progress',()=>{
 const source=regionalTradePlan(seed).sources[0]!,base=enableRegionalTrade(createRegionalState(seed));let near=applyAction(base,{type:'move',x:source.interactionPosition.x,z:source.interactionPosition.z});near=applyAction(near,{type:'regional-trade',command:{type:'start-source',targetId:source.id,expectedRevision:0}});assert.equal(near.frontierTrade!.revision,1);
 let far=applyAction(parseSave(serializeSave(near))!,{type:'move',x:-1300,z:1300});for(let i=0;i<83;i++){near=applyAction(near,{type:'tick',dt:.25});far=applyAction(far,{type:'tick',dt:.25});}assert.deepEqual(near.frontierTrade,far.frontierTrade);
 const bytes=serializeSave(far),restored=parseSave(bytes)!;assert.deepEqual(restored.frontierTrade,far.frontierTrade);assert.equal(serializeSave(restored),bytes);assert.equal(restored.frontierTrade!.ticks,83);
});

test('delivered quarry and timber reserves withdraw once and build an actual collector without fake harvested materials',{timeout:30_000},()=>{
 const plan=regionalTradePlan(seed);let s=createRegionalTrade(seed);
 const issue=(type:RegionalTradeCommand['type'],targetId:string)=>{const {c,context}=command(s,type,targetId);const previous=s;s=applyRegionalTradeCommand(s,context,c).state;assert.notEqual(s,previous);return {c,context};};
 for(const p of plan.routes.slice(0,2)){issue('start-source',p.sourceId);issue('clear-route',p.id);}
 for(let i=0;i<500&&s.routes.slice(0,2).some(r=>r.delivered<4);i++)s=advanceRegionalTrade(s,1);assert(s.routes.slice(0,2).every(r=>r.delivered===4));for(const p of plan.projects.slice(0,2))issue('build-store',p.id);
 for(let i=0;i<3000&&s.routes.slice(0,2).some(r=>r.activity!=='finished');i++)s=advanceRegionalTrade(s,1);assert(s.routes.slice(0,2).every(r=>r.destinationStock===8&&r.withdrawn===0));
 const base=createRegionalState(seed);let state=enableRegionalSupply({...base,frontierTrade:s});const harvested=clone(state.wilderness??null);
 for(const project of plan.projects.slice(0,2)){state=applyAction(state,{type:'move',x:project.interactionPosition.x,z:project.interactionPosition.z});const c={type:'withdraw-reserve' as const,targetId:project.id,expectedRevision:state.frontierTrade!.revision};const previous=state;state=applyAction(state,{type:'regional-trade',command:c});assert.notEqual(state,previous);assert.equal(applyAction(state,{type:'regional-trade',command:c}),state);assert.equal(applyAction(state,{type:'regional-trade',command:{...c,expectedRevision:state.frontierTrade!.revision}}),state);}
 assert(state.frontierTrade!.routes.slice(0,2).every(r=>r.destinationStock===0&&r.withdrawn===8&&r.delivered===12&&r.embodied===4));
 const collector=regionalSupplyPlan(seed).outposts[0]!;state=applyAction(state,{type:'move',x:collector.deliveryPosition.x,z:collector.deliveryPosition.z});for(const type of ['deliver','build'] as const)state=applyAction(state,{type:'regional-supply',command:{type,outpostId:collector.id,expectedRevision:state.frontierSupply!.revision}});for(let i=0;i<600&&state.frontierSupply!.outposts[0]!.builtAt===null;i++)state=applyAction(state,{type:'tick',dt:.25});assert.notEqual(state.frontierSupply!.outposts[0]!.builtAt,null);assert.deepEqual(state.frontierSupply!.outposts[0]!.delivered,collector.cost);assert.deepEqual(state.wilderness??null,harvested);assert.deepEqual(parseSave(serializeSave(state)),state);
 const forged=clone(state);forged.frontierTrade!.routes[0]!.withdrawn++;assert.equal(validateSave(forged),false);assert.equal(parseSave(JSON.stringify(forged)),null);
 console.log(JSON.stringify({regionalTradeReserveUse:1,withdrawn:{wood:8,stone:8},collectorId:collector.id,used:collector.cost,collectorCompleted:true,lifetimeHarvestUnchanged:true,duplicateWithdrawalRejected:true,saveBytes:new TextEncoder().encode(serializeSave(state)).byteLength}));
});
