import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectedState,createState,applyAction,causalContext,serializeSave,parseSave,validateSave,worldObjects,worldEndpoints,type State} from '../src/world.ts';
import {causalPlan,createCausalState,advanceCausal,applyCausalCommand,planRoute,validCausal,CAUSAL_STEP,CAUTION_RADIUS} from '../src/causal.ts';
import {worldDungeon,CONNECTED_GENERATION_MANIFEST,GENERATION_MANIFEST} from '../src/generation.ts';
import {storeSession,loadSession,selectSeed} from '../src/session.ts';
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
function move(s:State,p:{x:number;z:number}){return applyAction(s,{type:'move',...p});}
function collect(s:State){for(const o of worldObjects(s))if(['scrap','core','water'].includes(o.kind)){s=move(s,o);s=applyAction(s,{type:'collect',id:o.id});}return s;}
function run(s:State,seconds:number){for(let i=0;i<seconds/CAUSAL_STEP;i++)s=applyAction(s,{type:'tick',dt:CAUSAL_STEP});return s;}
function board(s:State,settlementId:string){return move(s,causalPlan(s.seed).settlements.find(x=>x.id===settlementId)!.position);}
function accept(s:State,id:string){const job=s.causal!.jobs.find(j=>j.id===id)!;s=board(s,job.settlementId);return applyAction(s,{type:'causal',command:{type:'accept',id}});}
function clear(s:State){for(const o of worldObjects(s).filter(o=>o.kind==='enemy')){s=move(s,o);s=applyAction(s,{type:'attack',id:o.id});}return move(s,worldEndpoints(s).spawn);}
function repairSource(s:State){s=move(s,causalPlan(s.seed).source.position);return applyAction(s,{type:'causal',command:{type:'repair-source'}});}

 test('causal plans are immutable, stable, bounded and vary meaningful actors, needs and work',()=>{
 const fingerprints=new Set<string>(),counts=new Set<number>(),waterPatterns=new Set<string>(),workPatterns=new Set<string>();
 for(let seed=0;seed<32;seed++){
  const p=causalPlan(seed),s=createConnectedState(seed);assert.deepEqual(p,causalPlan(seed));assert.ok(Object.isFrozen(p));assert.ok(Object.isFrozen(p.routes[0]!.points));assert.ok(p.agents.length>=4&&p.agents.length<=8);assert.equal(new Set(p.agents.map(a=>a.id)).size,p.agents.length);assert.ok(s.causal!.jobs.length<=8);assert.ok(validateSave(s));
  const initial=s.causal!;counts.add(p.agents.length);waterPatterns.add(p.settlements.map(s=>s.initialWater).join(','));workPatterns.add(p.workplaces.map(w=>`${w.initiallyOperational}/${w.repairCost}`).join(','));fingerprints.add(JSON.stringify({roles:p.agents.map(a=>a.role),water:p.settlements.map(s=>s.initialWater),work:p.workplaces.map(w=>[w.initiallyOperational,w.repairCost]),jobs:initial.jobs.map(j=>[j.kind,j.reward,j.route.length])}));
  for(const a of p.agents){const home=p.settlements.find(s=>s.id===a.homeId)!;assert.ok(planRoute(p,home.nodeId,p.source.nodeId,[],false));if(a.workplaceId)assert.ok(planRoute(p,home.nodeId,p.workplaces.find(w=>w.id===a.workplaceId)!.nodeId,[],false));}
 }
 assert.equal(counts.size,2);assert.ok(waterPatterns.size>15);assert.ok(workPatterns.size>15);assert.ok(fingerprints.size>25,'Variation must change generated needs, capability assignments and jobs, not seed text');
});

test('same fixed-step replay and pause-free roundtrip retains agent identities and exact ledgers',()=>{
 let s=repairSource(clear(collect(createConnectedState(73129))));const initial=clone(s);
 s=run(s,90);const repeated=run(initial,90);assert.deepEqual(s,repeated);assert.ok(validateSave(s));
 const loaded=parseSave(serializeSave(s))!;assert.deepEqual(loaded,s);assert.deepEqual(run(loaded,90),run(s,90));
 assert.deepEqual(s.causal!.agents.map(a=>a.id),initial.causal!.agents.map(a=>a.id));assert.ok(s.causal!.extracted>0);assert.ok(s.causal!.settlements.some(t=>t.delivered>0));assert.ok(s.causal!.workplaces.some(w=>w.service>0));
 const ctx=causalContext(s),c=s.causal!;for(const dt of [0,-1,NaN,Infinity])assert.equal(advanceCausal(c,ctx,dt),c);assert.ok(advanceCausal(c,ctx,999).elapsed-c.elapsed<=1);
 const final=run(s,300);assert.ok(validateSave(final));assert.ok(final.causal!.agents.every(a=>Number.isFinite(a.position.x)&&a.thirst<=100&&a.fatigue<=100));
});

test('real water shortage allows direct delivery, has exact costs, and pays once after accepted contribution',()=>{
 let s=collect(createConnectedState(73129)),job=s.causal!.jobs.find(j=>j.kind==='water'&&j.targetId.endsWith('highmeadow'))!;s=accept(s,job.id);const before=s.inventory.water;
 s=applyAction(s,{type:'causal',command:{type:'deliver-water',settlementId:job.targetId}});job=s.causal!.jobs.find(j=>j.id===job.id)!;assert.equal(s.inventory.water,before-1);assert.equal(s.causal!.playerWater,4);assert.equal(job.status,'completed');assert.equal(job.playerContribution,true);assert.equal(s.causal!.renown,0);assert.ok(validateSave(s));
 s=applyAction(s,{type:'causal',command:{type:'claim',id:job.id}});assert.equal(s.causal!.renown,job.reward);const claimed=s;assert.equal(applyAction(s,{type:'causal',command:{type:'claim',id:job.id}}),claimed);assert.equal(s.causal!.jobs.find(j=>j.id===job.id)!.reservedReward,0);assert.ok(validateSave(s));
 s=run(move(s,worldEndpoints(s).spawn),250);assert.equal(s.causal!.jobs.filter(j=>j.id===job.id).length,1);assert.equal(s.causal!.jobs.find(j=>j.id===job.id)!.status,'claimed');assert.equal(s.causal!.renown,job.reward);
});

test('intake repair changes reserves through actual carrier trips and resolves unmet predicates',()=>{
 let s=clear(collect(createConnectedState(73129)));const water=s.causal!.jobs.filter(j=>j.kind==='water');for(const j of water)s=accept(s,j.id);const before={...s.inventory};s=repairSource(s);
 assert.equal(s.inventory.scrap,before.scrap-3);assert.equal(s.inventory.core,before.core-1);assert.equal(s.causal!.sourceRepaired,true);assert.equal(s.causal!.jobs.filter(j=>j.kind==='water').every(j=>j.status==='accepted'),true,'source click alone does not finish water need');
 s=run(move(s,worldEndpoints(s).spawn),600);assert.ok(s.causal!.settlements.every(t=>t.delivered>0));assert.ok(s.causal!.jobs.filter(j=>j.kind==='water').every(j=>j.status==='completed'));assert.ok(validateSave(s));assert.equal(applyAction(move(s,causalPlan(s.seed).source.position),{type:'causal',command:{type:'repair-source'}}).causal!.playerSpent.scrap,s.causal!.playerSpent.scrap);
});

test('NPC repair spends finite kit stock and resolves accepted jobs without unearned player reward',()=>{
 let s=clear(createConnectedState(73129)),job=s.causal!.jobs.find(j=>j.kind==='repair')!;s=accept(s,job.id);const before=s.causal!.materials;s=run(move(s,worldEndpoints(s).spawn),180);job=s.causal!.jobs.find(j=>j.id===job.id)!;
 assert.equal(job.status,'resolved');assert.equal(job.playerContribution,false);assert.equal(job.reservedReward,0);assert.equal(s.causal!.renown,0);assert.ok(s.causal!.materials<before);assert.ok(s.causal!.workplaces.some(w=>w.repairedBy==='agent'));assert.equal(s.causal!.materials+s.causal!.agentMaterialsSpent,causalPlan(s.seed).initialMaterials);assert.ok(validateSave(s));
 s=board(s,job.settlementId);assert.equal(applyAction(s,{type:'causal',command:{type:'claim',id:job.id}}),s);
});

test('player repair and threat clearance use actual targets; satisfied prerequisites resume plans',()=>{
 let s=collect(createConnectedState(73129));let repair=s.causal!.jobs.find(j=>j.kind==='repair')!,route=s.causal!.jobs.find(j=>j.kind==='clear-route')!;
 s=accept(s,repair.id);const work=causalPlan(s.seed).workplaces.find(w=>w.id===repair.targetId)!;const before=s.inventory.scrap;s=move(s,work.position);s=applyAction(s,{type:'causal',command:{type:'repair-workplace',workplaceId:work.id}});assert.equal(s.inventory.scrap,before-work.repairCost);assert.equal(s.causal!.jobs.find(j=>j.id===repair.id)!.status,'completed');
 s=accept(s,route.id);s=run(move(s,worldEndpoints(s).spawn),1);const carrier=s.causal!.agents.find(a=>a.id===route.issuerId)!;assert.match(carrier.status,/threatened/);
 const enemy=worldObjects(s).find(o=>o.id===route.targetId)!;s=move(s,enemy);s=applyAction(s,{type:'attack',id:enemy.id});assert.equal(s.causal!.jobs.find(j=>j.id===route.id)!.status,'completed');s=run(move(s,worldEndpoints(s).spawn),1);assert.match(s.causal!.agents.find(a=>a.id===carrier.id)!.status,/Walking/);assert.ok(validateSave(s));
 const p=causalPlan(s.seed),routeJob=s.causal!.jobs.find(j=>j.id===route.id)!;assert.ok(routeJob.route.length>1);const threatenedEdges=p.routes.filter(edge=>edge.points.some(point=>Math.hypot(point.x-enemy.x,point.z-enemy.z)<CAUTION_RADIUS));assert.ok(threatenedEdges.some(edge=>routeJob.route.includes(edge.from)&&routeJob.route.includes(edge.to)));
});

test('costs, remote actions, NPC stock and cargo cannot duplicate collected player inventory',()=>{
 let s=createConnectedState(73129),c=s.causal!,ctx=causalContext(s),water=c.jobs.find(j=>j.kind==='water')!;assert.equal(applyCausalCommand(c,ctx,{type:'deliver-water',settlementId:water.targetId}).state,c);assert.equal(applyCausalCommand(c,ctx,{type:'repair-source'}).state,c);
 s=collect(s);s=board(s,water.targetId);for(let i=0;i<4;i++)s=applyAction(s,{type:'causal',command:{type:'deliver-water',settlementId:water.targetId}});assert.equal(s.inventory.water,0);assert.equal(s.causal!.playerSpent.water,3);assert.ok(validateSave(s));const after=s;assert.equal(applyAction(s,{type:'causal',command:{type:'deliver-water',settlementId:water.targetId}}),after);
 for(const change of [(x:State)=>x.inventory.water++,(x:State)=>x.causal!.agents[0]!.cargo++,(x:State)=>x.causal!.materials++,(x:State)=>x.causal!.renown++,(x:State)=>x.causal!.sourceRepaired=true,(x:State)=>x.causal!.playerSpent.scrap++]){const corrupt=clone(s);change(corrupt);assert.equal(validateSave(corrupt),false);assert.equal(parseSave(JSON.stringify(corrupt)),null);}
});

test('dungeon simulation, repeated visits and reload preserve active paths, finite transfers and completed episodes',()=>{
 let s=repairSource(clear(collect(createConnectedState(73129))));s=run(s,12);const p=worldEndpoints(s);s=move(s,p.entrance);s=applyAction(s,{type:'enter'});assert.equal(s.zone,'dungeon');const time=s.causal!.elapsed;const snapshot=serializeSave(s);s=run(s,60);assert.equal(s.causal!.elapsed,time+60);assert.ok(s.causal!.settlements.some(t=>t.delivered>0));assert.equal(s.waterworks.delivered,parseSave(snapshot)!.waterworks.delivered,'historical waterworks retains original dungeon pause');
 assert.deepEqual(run(parseSave(snapshot)!,60),s);s=move(s,worldDungeon(s).spawn);s=applyAction(s,{type:'exit'});assert.equal(s.zone,'valley');assert.ok(validateSave(s));assert.deepEqual(parseSave(serializeSave(s)),s);
});

test('legacy schema6 adds overlay once without changing old world or terrain manifests',()=>{
 const original=createState(42);assert.equal(original.causal,undefined);assert.deepEqual(parseSave(serializeSave(original)),original);assert.equal(GENERATION_MANIFEST.contentHash,'16ba1973');assert.equal(CONNECTED_GENERATION_MANIFEST.contentHash,'887423ac');
 let old=collect(createConnectedState(73129));old=move(old,worldEndpoints(old).pump);old=applyAction(old,{type:'repair'});delete old.causal;const restored=parseSave(JSON.stringify(old))!;assert.ok(restored.causal!.sourceRepaired);assert.equal(restored.causal!.sourcePaid,false);assert.deepEqual(restored.inventory,old.inventory);assert.deepEqual(restored.collected,old.collected);assert.deepEqual(restored.jobs,old.jobs);assert.deepEqual(restored.generationManifest,old.generationManifest);assert.ok(validateSave(restored));assert.deepEqual(parseSave(serializeSave(restored)),restored);
 const relieved=collect(createConnectedState(8));const delivered=applyAction(board(relieved,causalPlan(8).settlements[0]!.id),{type:'deliver'});delete delivered.causal;assert.equal(parseSave(JSON.stringify(delivered))!.causal!.sourceRepaired,false,'legacy canister relief is not a repaired pump');
});

function modular(s:State){
 const p=worldEndpoints(s).buildOrigin;s=move(s,{x:p.x-12,z:p.z+3});
 for(const [kind,x]of [['pump',-5],['pipe',-8],['reservoir',-11],['outlet',-14]] as const)s=applyAction(s,{type:'build',command:{type:'place',kind,x,z:6}});
 const parts=s.waterworks.parts;for(let i=1;i<parts.length;i++)s=applyAction(s,{type:'build',command:{type:'connect',link:`${parts[i-1]!.id}.out>${parts[i]!.id}.in`}});
 return s;
}
test('modular substitute supplies only real overflow and resolves the same water predicates',()=>{
 let s=clear(collect(createConnectedState(73129)));for(const j of s.causal!.jobs.filter(j=>j.kind==='water'))s=accept(s,j.id);s=modular(s);assert.equal(s.causal!.sourceRepaired,false);assert.equal(s.causal!.networkEverWorking,true);s=run(move(s,worldEndpoints(s).spawn),600);
 assert.ok(s.settlement.spilled>0);assert.ok(s.causal!.networkCaptured>0);assert.ok(s.causal!.networkDiscarded>0);assert.equal(s.causal!.extracted,0);assert.ok(s.causal!.networkCaptured<=s.settlement.spilled);assert.ok(s.causal!.jobs.filter(j=>j.kind==='water').every(j=>j.status==='completed'));assert.ok(validateSave(s));
 const [a,b]=s.waterworks.parts.slice(-2);s=move(s,{x:worldEndpoints(s).buildOrigin.x-12,z:worldEndpoints(s).buildOrigin.z+3});s=applyAction(s,{type:'build',command:{type:'disconnect',link:`${a!.id}.out>${b!.id}.in`}});const captured=s.causal!.networkCaptured;s=run(move(s,worldEndpoints(s).spawn),300);assert.equal(s.causal!.networkCaptured,captured,'old spill is discarded, never a deferred infinite source');assert.ok(validateSave(s));
});
test('disconnect/reconnect cannot credit a player for an already established source',()=>{
 let s=clear(collect(createConnectedState(73129)));s=modular(s);for(const j of s.causal!.jobs.filter(j=>j.kind==='water'))s=accept(s,j.id);
 const [a,b]=s.waterworks.parts;s=move(s,{x:worldEndpoints(s).buildOrigin.x-12,z:worldEndpoints(s).buildOrigin.z+3});const link=`${a!.id}.out>${b!.id}.in`;s=applyAction(s,{type:'build',command:{type:'disconnect',link}});s=applyAction(s,{type:'build',command:{type:'connect',link}});
 assert.ok(s.causal!.jobs.filter(j=>j.kind==='water').every(j=>!j.playerContribution));s=run(move(s,worldEndpoints(s).spawn),600);assert.ok(s.causal!.jobs.filter(j=>j.kind==='water').every(j=>j.status==='resolved'&&j.reservedReward===0));assert.equal(s.causal!.renown,0);
});
test('feasibility counts an executable transfer rather than summing incompatible stock',()=>{
 const s=createConnectedState(73129),ctx={...causalContext(s),recoverableWater:1,recoverableScrap:0,recoverableCore:0};let c=clone(s.causal!);const town=c.settlements[0]!;town.reserve=0;const next=advanceCausal(c,ctx,.25);assert.equal(next.jobs.find(j=>j.kind==='water'&&j.targetId===town.id)!.status,'blocked','one 4L canister cannot satisfy an otherwise unsupported6L deficit');
 const seed=Array.from({length:30},(_,i)=>i).find(seed=>createConnectedState(seed).causal!.jobs.some(j=>j.kind==='repair'&&causalPlan(seed).workplaces.find(w=>w.id===j.targetId)!.repairCost===2))!;const other=createConnectedState(seed),job=other.causal!.jobs.find(j=>j.kind==='repair'&&causalPlan(seed).workplaces.find(w=>w.id===j.targetId)!.repairCost===2)!;c=clone(other.causal!);c.materials=1;const after=advanceCausal(c,{...causalContext(other),recoverableScrap:1},.25);assert.equal(after.jobs.find(j=>j.id===job.id)!.status,'blocked','one player scrap plus one NPC scrap is not a payable two-scrap action');
});
test('malformed causal paths, targets, roles and manifests are rejected without validator throws',()=>{
 const s=run(repairSource(clear(collect(createConnectedState(73129)))),1);
 for(const mutate of [(s:State)=>s.causal!.manifestHash='wrong',(s:State)=>s.causal!.agents[0]!.position.x+=10,(s:State)=>s.causal!.agents[0]!.position.y=1000,(s:State)=>s.causal!.workplaces[0]!.service=1e8,(s:State)=>s.causal!.agents[0]!.task={kind:'fetch',targetId:causalPlan(s.seed).settlements[0]!.id},(s:State)=>s.causal!.jobs[0]!.targetId='nonexistent',(s:State)=>s.causal!.agents[0]!.route=['made-up'],(s:State)=>s.causal!.jobs[0]!.reservedReward=31,(s:State)=>s.causal!.networkCaptured=Infinity]){
  const bad=clone(s);mutate(bad);assert.doesNotThrow(()=>validateSave(bad));assert.equal(validateSave(bad),false);assert.equal(parseSave(JSON.stringify(bad)),null);
 }
});
