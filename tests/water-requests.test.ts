import test from 'node:test';
import assert from 'node:assert/strict';
import {createConnectedState,createState,enableWaterRequests,applyAction,causalContext,worldObjects,worldEndpoints,serializeSave,parseSave,validateSave,type State} from '../src/world.ts';
import {causalPlan,CAUSAL_HASH,reconcileCausal} from '../src/causal.ts';
import {waterRequestView,validWaterRequests,validWaterRequestCommand,applyWaterRequestCommand,WATER_REQUEST_RULES,type WaterRequestCommand} from '../src/water-requests.ts';
const copy=<T>(s:T):T=>structuredClone(s);
function move(s:State,p:{x:number;z:number}){return applyAction(s,{type:'move',...p});}
function tick(s:State,n:number,dt=.25){for(let i=0;i<n/dt;i++)s=applyAction(s,{type:'tick',dt});return s;}
function ready(seed=1){
 let s=createConnectedState(seed);
 for(const o of worldObjects(s)){if(o.kind==='enemy'){s=move(s,o);s=applyAction(s,{type:'attack',id:o.id});}else if(['water','scrap','core'].includes(o.kind)){s=move(s,o);s=applyAction(s,{type:'collect',id:o.id});}}
 const home=causalPlan(seed).settlements.find(h=>h.nodeId==='highmeadow')!;
 return move(enableWaterRequests(s),home.position);
}
const episodes=(s:State)=>waterRequestView(s.causal!,s.seed).episodes;
const high=(s:State)=>causalPlan(s.seed).settlements[1]!;
function need(s=ready(),count=1){for(let t=0;t<1200&&episodes(s).filter(e=>e.settlementId===high(s).id).length<count;t++)s=tick(s,1,1);assert.ok(episodes(s).some(e=>e.settlementId===high(s).id));return s;}
function command(s:State,type:WaterRequestCommand['type'],id=episodes(s).filter(e=>e.settlementId===high(s).id).at(-1)!.id,expectedRevision=s.causal!.waterRequests!.revision){return applyAction(s,{type:'water-request',command:{type,id,expectedRevision}});}
function deliver(s:State){return applyAction(s,{type:'causal',command:{type:'deliver-water',settlementId:high(s).id}});}
function conserved(s:State){assert.ok(validateSave(s));assert.ok(validWaterRequests(s.causal!.waterRequests,s.seed,s.causal!));assert.deepEqual(parseSave(serializeSave(s)),s);for(const h of causalPlan(s.seed).settlements){const founding=s.causal!.jobs.filter(j=>j.settlementId===h.id).reduce((n,j)=>n+(j.status==='claimed'?j.reward:j.reservedReward),0),recurring=episodes(s).filter(e=>e.settlementId===h.id).reduce((n,e)=>n+(e.status==='claimed'?e.reward:e.reservedReward),0);assert.ok(founding+recurring<=32);}assert.ok(s.causal!.renown<=64);}

test('two genuine relief-consumption-relapse episodes use three real canisters, distinct IDs and the original finite issuer budget',()=>{
 let s=need(),first=episodes(s).at(-1)!;assert.equal(first.createdAt,91);assert.equal(first.status,'offered');assert.equal(s.inventory.water,3);assert.equal(first.relief.water.reserve,8);assert.ok(first.need.water.consumed-first.relief.water.consumed>=5);assert.ok(first.need.water.reserve<3);
 const founding=copy(s.causal!.jobs);s=command(s,'accept');s=deliver(s);assert.equal(episodes(s).at(-1)!.status,'completed');assert.equal(s.causal!.renown,0);s=command(s,'claim');assert.equal(s.causal!.renown,4);conserved(s);
 s=deliver(s);assert.ok(s.causal!.settlements[1]!.reserve>=8);s=need(s,2);const second=episodes(s).at(-1)!;assert.notEqual(second.id,first.id);assert.equal(second.createdAt,224.25);assert.equal(second.episode,2);assert.ok(second.need.water.consumed-second.relief.water.consumed>=5);
 s=command(s,'accept');s=deliver(s);s=command(s,'claim');assert.equal(s.causal!.renown,8);assert.equal(s.inventory.water,0);assert.equal(s.causal!.playerSpent.water,3);assert.deepEqual(s.causal!.jobs,founding);conserved(s);
 const at=s.causal!.elapsed;s=tick(s,1000,1);assert.equal(episodes(s).length,2,'unrelieved drought cannot regenerate rewards or identities');assert.equal(s.causal!.elapsed,at+1000);assert.equal(s.causal!.renown,8);conserved(s);
});

test('active time partitions, reloads and absent-pack legacy serialization preserve every receipt and founding manifest',()=>{
 const s=ready(),quarter=tick(s,100),whole=tick(s,100,1);assert.deepEqual(quarter.causal,whole.causal);assert.deepEqual(tick(parseSave(serializeSave(quarter))!,100),tick(quarter,100));conserved(quarter);
 assert.equal(CAUSAL_HASH,'1c9730fb');assert.equal(s.generationManifest.contentHash,'887423ac');const old=createConnectedState(1),oldText=serializeSave(old);assert.equal(old.causal!.waterRequests,undefined);assert.equal(serializeSave(parseSave(oldText)!),oldText);assert.equal(enableWaterRequests(createState(1)).causal,undefined);
 const previous=ready();delete previous.causal!.waterRequests;const initialized=enableWaterRequests(tick(previous,40));assert.equal(initialized.causal!.waterRequests!.startedAt,40);assert.equal(initialized.causal!.waterRequests!.records.length,0,'old relief already consumed is not reconstructed');assert.equal(enableWaterRequests(initialized),initialized);conserved(initialized);
 for(const dt of [0,-1,NaN,Infinity])assert.equal(applyAction(s,{type:'tick',dt}),s);assert.deepEqual(s,copy(s));
});

test('unaccepted or resident-only relief resolves unpaid; old player delivery before acceptance cannot earn future credit',()=>{
 let s=need();s=deliver(s);assert.equal(episodes(s).at(-1)!.status,'resolved');assert.equal(episodes(s).at(-1)!.reservedReward,0);assert.equal(s.causal!.renown,0);assert.equal(command(s,'claim'),s);conserved(s);
 s=need();s=command(s,'accept');const before=s.causal!.settlements[1]!.playerDelivered;
 s=move(s,causalPlan(s.seed).source.position);s=applyAction(s,{type:'causal',command:{type:'repair-source'}});s=tick(move(s,worldEndpoints(s).spawn),180,1);const episode=episodes(s).find(e=>e.episode===1&&e.settlementId===high(s).id)!;
 assert.equal(episode.status,'resolved');assert.equal(episode.outcome!.water.playerDelivered,before);assert.equal(s.causal!.renown,0);conserved(s);
});

test('completion deadline equality expires before relief and retains the real failure receipt; no expiry retry without new relief',()=>{
 let s=command(need(),'accept');const e=episodes(s).at(-1)!;s=tick(s,e.expiresAt-s.causal!.elapsed-.25);assert.equal(episodes(s).at(-1)!.status,'accepted');const before=copy(s);s=tick(s,.25);assert.equal(episodes(s).at(-1)!.status,'expired');assert.equal(episodes(s).at(-1)!.failureReason,'Relief deadline missed');assert.equal(episodes(s).at(-1)!.outcome!.at,e.expiresAt);assert.equal(episodes(s).at(-1)!.reservedReward,0);
 s=deliver(s);assert.equal(episodes(s).at(-1)!.status,'expired');assert.equal(command(s,'claim'),s);assert.equal(episodes(tick(s,400,1)).length,1);conserved(s);
 const justInTime=deliver(deliver(before));assert.equal(episodes(justInTime).at(-1)!.status,'completed');assert.equal(episodes(justInTime).at(-1)!.completedAt,e.expiresAt-.25);conserved(justInTime);
});

test('claim deadline equality expires first; a completed reserve may be consumed without undoing an earned on-time claim',()=>{
 let s=deliver(command(need(),'accept'));const e=episodes(s).at(-1)!;assert.equal(e.status,'completed');assert.equal(e.claimBy,e.completedAt!+180);s=tick(s,e.claimBy!-s.causal!.elapsed-.25);const paid=command(s,'claim');assert.equal(paid.causal!.renown,4);assert.equal(episodes(paid).at(-1)!.status,'claimed');conserved(paid);
 const expired=tick(s,.25);assert.equal(episodes(expired).at(-1)!.status,'expired');assert.equal(episodes(expired).at(-1)!.failureReason,'Claim deadline missed');assert.equal(command(expired,'claim'),expired);assert.equal(expired.causal!.renown,0);conserved(expired);
});

test('physical command, exact shape, stale revision and one-time claim guards prevent remote or replayed awards',()=>{
 const s=need(),e=episodes(s).at(-1)!,input:WaterRequestCommand={type:'accept',id:e.id,expectedRevision:s.causal!.waterRequests!.revision};
 for(const bad of [{...input,expectedRevision:-1},{...input,expectedRevision:.5},{...input,expectedRevision:83},{...input,renown:50},{...input,id:''},{...input,id:'a\n'},{...input,type:'reset'},null,[]]){assert.equal(validWaterRequestCommand(bad),false);assert.equal(applyWaterRequestCommand(s.causal!,causalContext(s),bad as WaterRequestCommand).state,s.causal);}
 for(const ctx of [{...causalContext(s),zone:'cave' as const},{...causalContext(s),player:{...s.player,hp:0}},{...causalContext(s),player:{...s.player,x:0,z:0}},{...causalContext(s),player:{...s.player,x:NaN}}])assert.equal(applyWaterRequestCommand(s.causal!,ctx,input).state,s.causal);
 let next=command(s,'accept');assert.equal(command(next,'accept',e.id,input.expectedRevision),next);next=deliver(next);const rev=next.causal!.waterRequests!.revision;next=command(next,'claim');assert.equal(command(next,'claim',e.id,rev),next);assert.equal(command(next,'claim'),next);conserved(next);
});

test('optional receipt corruption, impossible recurrence, reward overstatement and missing terminal records are rejected',()=>{
 const s=command(deliver(command(need(),'accept')),'claim');conserved(s);
 const mutations:((x:State)=>void)[]=[x=>x.causal!.waterRequests!.hash='bad',x=>x.causal!.waterRequests!.revision++,x=>x.causal!.waterRequests!.startedAt=.1,x=>x.causal!.waterRequests!.records[0]![3][0]=9,x=>x.causal!.waterRequests!.records[1]![3][3]=0,x=>x.causal!.waterRequests!.records[1]![1]=2,x=>x.causal!.waterRequests!.records[2]![0]=5,x=>x.causal!.waterRequests!.records[3]![3][2]=0,x=>x.causal!.waterRequests!.records[4]![2]+=180,x=>x.causal!.renown++,x=>{x.causal!.waterRequests!.records.pop();x.causal!.waterRequests!.revision--;},x=>(x.causal as unknown as {waterRequests:null}).waterRequests=null,x=>x.causal!.waterRequests!.records[0]!.push(999 as never)];
 for(const change of mutations){const bad=copy(s);change(bad);assert.doesNotThrow(()=>validateSave(bad));assert.equal(validateSave(bad),false);assert.equal(parseSave(JSON.stringify(bad)),null);}
 const expired=tick(command(need(),'accept'),180,1),bad=copy(expired);bad.causal!.waterRequests!.records.pop();bad.causal!.waterRequests!.revision--;assert.equal(validateSave(bad),false);conserved(expired);
});

test('real founding plus recurring payouts hit the hard 32-renown issuer ceiling, then defer another genuine relapse',()=>{
 let s=createConnectedState(15);const p=causalPlan(15),home=p.settlements[1]!,jobs=s.causal!.jobs.filter(j=>j.settlementId===home.id);assert.equal(home.initialWater,5);assert.equal(jobs.reduce((n,j)=>n+j.reward,0),28);
 s=move(s,home.position);for(const j of jobs)s=applyAction(s,{type:'causal',command:{type:'accept',id:j.id}});
 for(const o of worldObjects(s)){if(['water','scrap','core'].includes(o.kind)){s=move(s,o);s=applyAction(s,{type:'collect',id:o.id});}if(o.kind==='enemy'){s=move(s,o);s=applyAction(s,{type:'attack',id:o.id});}}
 const work=p.workplaces.find(w=>w.id===jobs.find(j=>j.kind==='repair')!.targetId)!;s=move(s,work.position);s=applyAction(s,{type:'causal',command:{type:'repair-workplace',workplaceId:work.id}});
 s=move(enableWaterRequests(s),home.position);s=deliver(s);for(const j of jobs)s=applyAction(s,{type:'causal',command:{type:'claim',id:j.id}});assert.equal(s.causal!.renown,28);assert.equal(s.causal!.settlements[1]!.reserve,9);conserved(s);
 s=need(s);s=command(s,'accept');s=deliver(s);s=command(s,'claim');assert.equal(s.causal!.renown,32);assert.equal(episodes(s).length,1);assert.equal(waterRequestView(s.causal!,s.seed).households[1]!.availableReward,0);conserved(s);
 s=deliver(s);assert.ok(s.causal!.settlements[1]!.reserve>=8);s=tick(s,500,1);assert.ok(s.causal!.settlements[1]!.reserve<3);assert.equal(episodes(s).length,1,'a real second relapse cannot advertise unpaid or fractional work');assert.equal(s.causal!.renown,32);assert.equal(s.inventory.water,0);conserved(s);
});

test('explicit undefined or malformed packs are never initialized or trusted by a direct command',()=>{
 const s=need(),e=episodes(s).at(-1)!,command:WaterRequestCommand={type:'accept',id:e.id,expectedRevision:s.causal!.waterRequests!.revision};
 for(const value of [undefined,null,{},[],{...s.causal!.waterRequests,records:null},{...s.causal!.waterRequests,records:[{kind:'claim'}]}]){
  const bad=copy(s);(bad.causal as unknown as {waterRequests:unknown}).waterRequests=value;assert.equal(enableWaterRequests(bad),bad);assert.equal(validateSave(bad),false);assert.doesNotThrow(()=>applyWaterRequestCommand(bad.causal!,causalContext(bad),command));assert.equal(applyWaterRequestCommand(bad.causal!,causalContext(bad),command).state,bad.causal);
 }
 for(const input of [Object.assign(Object.create({extra:true}),command),{...command,[Symbol('extra')]:true},Object.defineProperty({...command},'id',{get(){throw new Error('Accessor must not run');}})]){assert.doesNotThrow(()=>validWaterRequestCommand(input));assert.equal(validWaterRequestCommand(input),false);}
});

test('partial accumulators, fractional partitions and oversized input hit exact expiry boundaries without skipping or throwing',()=>{
 const start=command(need(),'accept'),expiry=episodes(start).at(-1)!.expiresAt,near=tick(start,expiry-start.causal!.elapsed-.25);
 const partial=applyAction(near,{type:'tick',dt:.125});assert.equal(partial.causal!.elapsed,expiry-.25);assert.equal(partial.causal!.accumulator,.125);assert.equal(episodes(partial).at(-1)!.status,'accepted');
 const large=applyAction(partial,{type:'tick',dt:100_000}),regular=applyAction(partial,{type:'tick',dt:1});assert.deepEqual(large.causal,regular.causal);assert.equal(episodes(large).at(-1)!.outcome!.at,expiry);assert.equal(episodes(large).at(-1)!.status,'expired');conserved(large);
 let eighths=near;for(let i=0;i<8;i++)eighths=applyAction(eighths,{type:'tick',dt:.125});const whole=applyAction(near,{type:'tick',dt:1});assert.deepEqual(eighths.causal,whole.causal);assert.equal(episodes(eighths).at(-1)!.outcome!.at,expiry);conserved(eighths);
});

test('two active-world hours of source extraction, carrier trips and resident consumption survive repeated exact save/load',()=>{
 let s=ready();s=move(s,causalPlan(s.seed).source.position);s=applyAction(s,{type:'causal',command:{type:'repair-source'}});s=move(s,worldEndpoints(s).spawn);const initial=s.causal!.settlements.reduce((n,h)=>n+h.consumed,0);
 for(let t=0;t<7200;t++){s=applyAction(s,{type:'tick',dt:1});if(t%240===239){conserved(s);s=parseSave(serializeSave(s))!;}}
 assert.equal(s.causal!.elapsed,7200);assert.ok(s.causal!.extracted>100,`Extracted ${s.causal!.extracted} L`);assert.ok(s.causal!.settlements.every(h=>h.delivered>50));assert.ok(s.causal!.settlements.reduce((n,h)=>n+h.consumed,0)>initial+100);assert.ok(s.causal!.waterRequests!.records.length<=WATER_REQUEST_RULES.maxRecords);conserved(s);
});

test('a later accepted episode cannot reuse historical player delivery when only carriers restore its reserve',()=>{
 let s=command(deliver(command(need(),'accept')),'claim');s=deliver(s);s=need(s,2);assert.equal(s.causal!.settlements[1]!.playerDelivered,8);s=command(s,'accept');const second=episodes(s).at(-1)!,water=s.inventory.water;
 s=move(s,causalPlan(s.seed).source.position);s=applyAction(s,{type:'causal',command:{type:'repair-source'}});s=tick(move(s,worldEndpoints(s).spawn),180,1);const outcome=episodes(s).find(e=>e.id===second.id)!;
 assert.equal(outcome.status,'resolved');assert.equal(outcome.acceptance!.water.playerDelivered,8);assert.equal(outcome.outcome!.water.playerDelivered,8);assert.equal(s.inventory.water,water);assert.equal(s.causal!.renown,4);conserved(s);
});
