import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createConnectedState,enableCommonsTrade,enableEconomy,enableEcology,applyAction,worldObjects,allWorldObjects,activeObjects,worldEndpoints,validateSave,serializeSave,parseSave,causalContext,type State} from '../src/world.ts';
import {causalPlan,CAUSAL_HASH} from '../src/causal.ts';
import {commonsTradeView,commonsTradeExports,validCommonsTrade,applyCommonsTrade,COMMONS_TRADE_RULES,type CommonsTradeState} from '../src/commons-trade.ts';
import {ECONOMY_HASH} from '../src/economy.ts';
import {ecologyPlan,ECOLOGY_HASH} from '../src/ecology.ts';
import {naturalCave} from '../src/natural-cave.ts';
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
function move(s:State,p:{x:number;z:number}){return applyAction(s,{type:'move',x:p.x,z:p.z});}
function stock(seed=1){let s=createConnectedState(seed);for(const o of worldObjects(s)){if(['water','scrap','core'].includes(o.kind))s=applyAction(move(s,o),{type:'collect',id:o.id});if(o.kind==='enemy')s=applyAction(move(s,o),{type:'attack',id:o.id});}return s;}
function fixture(seed=1){let s=enableCommonsTrade(stock(seed));return move(s,causalPlan(seed).settlements.find(h=>h.initialWater<6)!.position);}
function trade(s:State,settlementId=causalPlan(s.seed).settlements.find(h=>s.causal!.settlements.find(x=>x.id===h.id)!.reserve<6)!.id,revision=s.causal!.commonsTrade!.revision){return applyAction(s,{type:'commons-trade',command:{type:'water-for-scrap',settlementId,expectedRevision:revision}});}
function run(s:State,seconds:number){for(let i=0;i<seconds*4;i++)s=applyAction(s,{type:'tick',dt:.25});return s;}
function conserved(s:State){assert(validateSave(s));assert(validCommonsTrade(s.causal!.commonsTrade,s.seed,s.causal!));assert.equal(s.causal!.materials+s.causal!.agentMaterialsSpent+commonsTradeExports(s.causal,s.seed),causalPlan(s.seed).initialMaterials);const parsed=parseSave(serializeSave(s))!;assert.ok(Math.hypot(parsed.player.x-s.player.x,parsed.player.z-s.player.z)<1e-8);assert.deepEqual({...parsed,player:s.player},s);}

test('an exchange transfers real communal ownership, canister water and accepted-job contribution atomically',()=>{
 let s=fixture(),home=causalPlan(s.seed).settlements[0]!,job=s.causal!.jobs.find(j=>j.kind==='water'&&j.targetId===home.id)!;
 s=applyAction(s,{type:'causal',command:{type:'accept',id:job.id}});const before=copy(s);s=trade(s,home.id);conserved(s);
 assert.equal(s.inventory.water,before.inventory.water-1);assert.equal(s.inventory.scrap,before.inventory.scrap+1);assert.equal(s.causal!.materials,before.causal!.materials-1);assert.equal(s.causal!.settlements[0]!.reserve,4);assert.equal(s.causal!.playerSpent.water,1);assert.equal(s.causal!.playerWater,4);assert.equal(s.causal!.jobs.find(j=>j.id===job.id)!.status,'accepted');assert.deepEqual(s.causal!.jobs.find(j=>j.id===job.id)!.playerEvidence,['delivery']);assert.equal(s.waterRestored,false);assert.equal(s.jobs.renown,0);assert.equal(s.causal!.renown,0);
 s=trade(s,home.id);assert.equal(s.causal!.settlements[0]!.reserve,8);assert.equal(s.causal!.jobs.find(j=>j.id===job.id)!.status,'completed');s=applyAction(s,{type:'causal',command:{type:'claim',id:job.id}});assert.equal(s.causal!.renown,job.reward);const saved=serializeSave(s);assert.equal(applyAction(s,{type:'causal',command:{type:'claim',id:job.id}}),s);assert.equal(trade(s,home.id,0),s);assert.equal(serializeSave(s),saved);conserved(s);
 const view=commonsTradeView(s.causal!,s.seed);assert.equal(view.history.length,2);assert.match(view.history[1]!.text,/received 4 L/);assert.match(view.history[1]!.text,/0 communal scrap remained/);assert.deepEqual(s.collected,before.collected);assert.deepEqual(s.defeated,before.defeated);
});

test('selling both NPC repair scraps prevents the actual builder repair until the player spends that transferred stock',()=>{
 const initial=fixture(),home=causalPlan(initial.seed).settlements[0]!,work=causalPlan(initial.seed).workplaces.find(w=>!w.initiallyOperational&&causalPlan(initial.seed).agents.some(a=>a.workplaceId===w.id))!;
 const control=run(initial,240);assert.equal(control.causal!.workplaces.find(w=>w.id===work.id)!.repairedBy,'agent');assert.equal(control.causal!.agentMaterialsSpent,2);
 let traded=trade(trade(initial,home.id),home.id);traded=run(traded,240);assert.equal(traded.causal!.materials,0);assert.equal(traded.causal!.agentMaterialsSpent,0);assert.equal(traded.causal!.workplaces.find(w=>w.id===work.id)!.operational,false);assert.equal(traded.causal!.workplaces.find(w=>w.id===work.id)!.service,0);conserved(traded);
 const scrap=traded.inventory.scrap;traded=applyAction(move(traded,work.position),{type:'causal',command:{type:'repair-workplace',workplaceId:work.id}});assert.equal(traded.inventory.scrap,scrap-work.repairCost);traded=run(traded,40);assert.equal(traded.causal!.workplaces.find(w=>w.id===work.id)!.repairedBy,'player');assert.ok(traded.causal!.workplaces.find(w=>w.id===work.id)!.service>0);assert.ok(traded.causal!.settlements[0]!.consumed>0);conserved(traded);
});

test('precise actor position, alive/zone, current demand, whole canister, finite materials and bounded revision gate barter',()=>{
 const s=fixture(),c=s.causal!,ctx=causalContext(s),home=causalPlan(s.seed).settlements[0]!,command={type:'water-for-scrap',settlementId:home.id,expectedRevision:0} as const;
 for(const patch of [{zone:'cave' as const},{zone:'dungeon' as const},{player:{...ctx.player,hp:0}},{player:{...ctx.player,x:NaN}},{player:{...ctx.player,x:80,z:80}},{inventory:{...ctx.inventory,water:0}},{inventory:{...ctx.inventory,water:.5}},{inventory:{...ctx.inventory,scrap:NaN}}])assert.equal(applyCommonsTrade(c,{...ctx,...patch},command).state,c);
 for(const expectedRevision of [-1,.5,1,5,NaN,Infinity])assert.equal(applyCommonsTrade(c,ctx,{...command,expectedRevision}).state,c);
 assert.equal(trade(s,causalPlan(s.seed).settlements[1]!.id),s);assert.equal(applyCommonsTrade(c,ctx,{...command,settlementId:'foreign'}).state,c);
 const supplied=fixture(73129),town=causalPlan(supplied.seed).settlements[0]!.id,paid=trade(supplied,town);assert.ok(paid.causal!.materials>0);assert.equal(trade(paid,town),paid,'actual 9 L reserve has no demand despite remaining stock');
 const depleted=trade(trade(s,home.id),home.id);assert.equal(depleted.causal!.materials,0);const later=run(depleted,240);assert.equal(trade(later,home.id),later,'no free replenishment');assert.equal(COMMONS_TRADE_RULES.maxExchanges,4);
});

test('optional activation baselines previous donations and leaves absent old saves and pinned generation byte-compatible',()=>{
 const old=stock(73129),bytes=serializeSave(old);assert.equal(old.causal!.commonsTrade,undefined);assert.equal(serializeSave(parseSave(bytes)!),bytes);assert.equal(enableCommonsTrade(createState()).causal,undefined);assert.equal(CAUSAL_HASH,'1c9730fb');assert.equal(old.generationManifest.contentHash,'887423ac');
 const home=causalPlan(old.seed).settlements[0]!;let donated=applyAction(move(old,home.position),{type:'causal',command:{type:'deliver-water',settlementId:home.id}});const inv={...donated.inventory};donated=enableCommonsTrade(run(donated,20));assert.equal(donated.causal!.commonsTrade!.baseline.playerWater,4);assert.equal(donated.causal!.commonsTrade!.revision,0);assert.deepEqual(donated.causal!.commonsTrade!.records,[]);assert.deepEqual(donated.inventory,inv);assert.equal(enableCommonsTrade(donated),donated);conserved(donated);assert.equal(trade(donated,home.id),donated);
 assert.equal(ECONOMY_HASH,'688b09cb');assert.equal(ECOLOGY_HASH,'deb39020');
});

test('malformed present receipts, unmatched debit/credit, forged inventory and duplicate revisions never validate or reset',()=>{
 const s=trade(fixture()),mutations:((p:CommonsTradeState)=>void)[]=[p=>p.version=2 as 1,p=>p.hash='bad',p=>p.planId='foreign',p=>p.revision++,p=>p.baseline.materials++,p=>p.baseline.agentMaterialsSpent++,p=>p.baseline.playerWater+=4,p=>p.baseline.homes[0]!.playerDelivered+=4,p=>p.records.push(copy(p.records[0]!)),p=>p.records[0]!.revision++,p=>p.records[0]!.id='duplicate',p=>p.records[0]!.settlementId='foreign',p=>p.records[0]!.at=-1,p=>p.records[0]!.before.materials++,p=>p.records[0]!.before.reserve=6,p=>p.records[0]!.before.consumed++,p=>p.records[0]!.before.playerWater+=4,p=>p.records[0]!.scrap.playerCredit=2 as 1,p=>p.records[0]!.water.householdLitres=8 as 4,p=>(p as unknown as Record<string,unknown>).extra=1];
 for(const mutate of mutations){const bad=copy(s);mutate(bad.causal!.commonsTrade!);assert.equal(enableCommonsTrade(bad),bad);assert.equal(commonsTradeExports(bad.causal,bad.seed),0);assert.doesNotThrow(()=>validateSave(bad));assert.equal(validateSave(bad),false,mutate.toString());assert.equal(parseSave(JSON.stringify(bad)),null);}
 for(const value of [null,[],{},undefined,{...s.causal!.commonsTrade,records:[null]}]){const bad=copy(s);(bad.causal as unknown as Record<string,unknown>).commonsTrade=value;assert.equal(enableCommonsTrade(bad),bad);assert.equal(validateSave(bad),false);assert.equal(applyCommonsTrade(bad.causal!,causalContext(bad),{type:'water-for-scrap',settlementId:causalPlan(s.seed).settlements[0]!.id,expectedRevision:1}).state,bad.causal);}
 for(const mutate of [(x:State)=>x.inventory.scrap++,(x:State)=>x.inventory.water++,(x:State)=>x.causal!.materials++,(x:State)=>{delete x.causal!.commonsTrade;},(x:State)=>x.causal!.settlements[0]!.reserve++]){const bad=copy(s);mutate(bad);assert.equal(validateSave(bad),false);}
});

test('canonical old pump, three-canister quest, causal intake and no-quest payments remain distinct after barter',()=>{
 for(const payment of ['none','pump','three-canisters','causal-source'] as const){let s=fixture(73129);s=trade(s);if(payment==='pump')s=applyAction(move(s,worldEndpoints(s).pump),{type:'repair-pump'});if(payment==='three-canisters'){s=applyAction(move(s,worldEndpoints(s).entrance),{type:'enter-cave'});const water=naturalCave(s.seed).objects.find(o=>o.kind==='water')!;s=applyAction(move(s,water),{type:'collect',id:water.id});s=applyAction(move(s,naturalCave(s.seed).spawn),{type:'exit'});s=applyAction(move(s,worldEndpoints(s).settlement),{type:'deliver-water'});}if(payment==='causal-source')s=applyAction(move(s,causalPlan(s.seed).source.position),{type:'causal',command:{type:'repair-source'}});
  assert.equal(s.waterRestored,payment==='pump'||payment==='three-canisters',payment);assert.equal(causalContext(s).historicalPumpRepaired,payment==='pump',payment);assert.equal(s.causal!.sourcePaid,payment==='causal-source',payment);conserved(s);
 }
});

test('barter canisters, workshop kits/recycling, cave bridge and garden irrigation share the exact canonical ledger',()=>{
 let s=enableEcology(enableEconomy(fixture(73129)));s=trade(s);const traded=s.inventory.scrap;
 s=applyAction(move(s,worldEndpoints(s).entrance),{type:'enter-cave'});s=applyAction(move(s,naturalCave(s.seed).anchors.drain),{type:'cave-supply',command:{type:'connect-outfall'}});assert.equal(s.inventory.scrap,traded-2);s=applyAction(move(s,naturalCave(s.seed).spawn),{type:'exit'});
 const plot=ecologyPlan(s.seed).plots[0]!;s=applyAction(move(s,plot.position),{type:'ecology',command:{type:'water',plotId:plot.id,expectedRevision:0}});s=run(s,400);assert.ok(s.causal!.caveReceipts!.received>0);
 const place=causalPlan(s.seed).workplaces.find(w=>s.economy!.workshops.some(e=>e.id===w.id)&&s.causal!.workplaces.find(c=>c.id===w.id)!.operational)!;s=applyAction(move(s,place.position),{type:'economy',command:{type:'commission-kit',workplaceId:place.id}});s=run(s,40);s=applyAction(s,{type:'economy',command:{type:'collect-kit',workplaceId:place.id}});assert.equal(s.economy!.kits,1);const scrap=s.inventory.scrap;s=applyAction(s,{type:'economy',command:{type:'recycle-kit',workplaceId:place.id}});assert.equal(s.inventory.scrap,scrap+1);assert.equal(s.causal!.commonsTrade!.revision,1);assert.equal(s.causal!.playerSpent.water,1);assert.equal(s.ecology!.canistersSpent,1);conserved(s);
});


test('all four lifetime exchanges transfer only the original finite stock and extend the canonical carried-scrap ceiling by exactly their receipts',()=>{
 let s=fixture(126);s=applyAction(move(s,worldEndpoints(s).entrance),{type:'enter-cave'});for(const o of activeObjects(s).filter(o=>['water','scrap','core'].includes(o.kind)))s=applyAction(move(s,o),{type:'collect',id:o.id});s=applyAction(move(s,naturalCave(s.seed).spawn),{type:'exit'});
 s=applyAction(move(s,worldEndpoints(s).entrance),{type:'enter'});for(const o of activeObjects(s).filter(o=>['water','scrap','core'].includes(o.kind)))s=applyAction(move(s,o),{type:'collect',id:o.id});const exit=activeObjects(s).find(o=>o.kind==='exit')!;s=applyAction(move(s,exit),{type:'exit'});
 const initial=s.inventory.scrap,available=allWorldObjects(s).filter(o=>o.kind==='scrap').length;assert.equal(initial,available);assert.ok(s.inventory.water>=4);assert.equal(s.causal!.materials,4);
 for(const home of causalPlan(s.seed).settlements){s=move(s,home.position);s=trade(trade(s,home.id),home.id);conserved(s);}
 assert.equal(s.causal!.commonsTrade!.revision,4);assert.equal(s.causal!.materials,0);assert.equal(s.inventory.scrap,available+4);assert.equal(s.causal!.playerWater,16);conserved(s);const unchanged=trade(s,causalPlan(s.seed).settlements[1]!.id,4);assert.equal(unchanged,s);
 const minted=copy(s);minted.inventory.scrap++;assert.equal(validateSave(minted),false);assert.equal(commonsTradeView(s.causal!,s.seed).history.length,4);
});


test('receipt global player-water checkpoints cannot precede known household deliveries',()=>{
 let s=fixture(),id=causalPlan(s.seed).settlements[0]!.id;s=applyAction(s,{type:'causal',command:{type:'deliver-water',settlementId:id}});s=trade(s,id);conserved(s);assert.equal(s.causal!.commonsTrade!.records[0]!.before.playerWater,4);
 const forged=copy(s);forged.causal!.commonsTrade!.records[0]!.before.playerWater=0;assert.equal(validateSave(forged),false);assert.equal(commonsTradeExports(forged.causal,forged.seed),0);
});

test('custom equipment recycling and reciprocal barter share one conserved player-material ledger',()=>{
 let s=fixture(73129);s=applyAction(s,{type:'assemble-equipment',recipe:{version:2,seed:55,parts:{grip:'braced',shaft:'alloy',head:'crown'}}});assert.equal(s.equipment!.active!.version,2);conserved(s);const before=s.inventory.scrap;s=trade(s);assert.equal(s.inventory.scrap,before+1);conserved(s);const paid=s;s=applyAction(s,{type:'refit-equipment',seed:null});assert.ok(s.inventory.scrap>paid.inventory.scrap);conserved(s);const survey=s;s=applyAction(s,{type:'refit-equipment',seed:null});assert.equal(s,survey);assert.equal(s.causal!.commonsTrade!.revision,1);
});
