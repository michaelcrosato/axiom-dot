import test from 'node:test';
import assert from 'node:assert/strict';
import {causalPlan,createCausalState,type CausalContext,type CausalState} from '../src/causal.ts';
import {applyEconomyCommand,createEconomyState,advanceEconomy,economyCost,economyRecoverableScrap,economyView,validEconomy,ECONOMY_ACTIONS,ECONOMY_RECIPES,ECONOMY_RULES,type EconomyState,type EconomyCommand} from '../src/economy.ts';
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
function fixture(seed=73129){
 const causal=createCausalState(seed),economy=createEconomyState(seed,causal),work=causalPlan(seed).workplaces.find(w=>w.id===economy.workshops[0]!.id)!;
 // Unit fixture supplies authoritative service independently; integration tests own
 // the water/resident planner that commits these seconds in the actual world.
 for(const w of causal.workplaces)w.operational=true;
 const ctx:CausalContext={seed,defeated:[],inventory:{scrap:64,core:0,water:0},player:{x:work.position.x,z:work.position.z,hp:100},zone:'valley',networkOverflow:0,networkWorking:false,recoverableScrap:64,recoverableCore:0,recoverableWater:0,historicalPumpRepaired:false};
 return {causal,economy,ctx,workId:work.id};
}
type Fixture=ReturnType<typeof fixture>;
function command(f:Fixture,cmd:EconomyCommand){const result=applyEconomyCommand(f.economy,f.causal,f.ctx,cmd);return {...f,economy:result.state,ctx:{...f.ctx,inventory:result.inventory}};}
function act(f:Fixture,type:'commission-kit'|'collect-kit'|'recycle-kit'){return command(f,{type,workplaceId:f.workId});}
function tick(f:Fixture,seconds:number,service=seconds){const causal=copy(f.causal);causal.elapsed+=seconds;causal.workplaces.find(w=>w.id===f.workId)!.service+=service;return {...f,causal,economy:advanceEconomy(f.economy,causal)};}
function repair(f:Fixture){return command(f,{type:'repair-press',incidentId:f.economy.incidents.at(-1)!.id});}
function conserved(f:Fixture){assert.equal(f.ctx.inventory.scrap+economyCost(f.economy).scrap,64);assert.equal(validEconomy(f.economy,f.ctx.seed,f.causal),true);}
function kit(f:Fixture){return act(tick(act(f,'commission-kit'),12),'collect-kit');}

test('repair-kit production contracts explicitly declare quantities, service, capacities, preconditions and effects',()=>{
 assert.ok(Object.isFrozen(ECONOMY_RECIPES.repairKit.inputs));assert.ok(Object.isFrozen(ECONOMY_ACTIONS['commission-kit'].preconditions));
 assert.equal(ECONOMY_RECIPES.repairKit.inputs.scrap,2);assert.equal(ECONOMY_RECIPES.repairKit.serviceSeconds,12);
 for(const contract of Object.values(ECONOMY_ACTIONS)){assert.ok(contract.preconditions.length);assert.ok(contract.effects.length);}
});
test('manufacturing consumes real scrap and actual service; collection transfers goods with no duplicate claim',()=>{
 const initial=fixture(),snapshot=copy(initial);let f=act(initial,'commission-kit');assert.deepEqual(initial,snapshot);assert.equal(f.ctx.inventory.scrap,62);assert.equal(f.economy.workshops[0]!.feedstock,2);conserved(f);
 f=tick(f,100,0);assert.equal(f.economy.workshops[0]!.stock,0,'wall time alone does no work');conserved(f);
 f=tick(f,11.75);assert.equal(f.economy.workshops[0]!.stock,0);assert.equal(f.economy.workshops[0]!.progress,11.75);conserved(f);
 f=tick(f,.25);assert.equal(f.economy.workshops[0]!.stock,1);assert.equal(f.economy.workshops[0]!.feedstock,0);conserved(f);
 f=act(f,'collect-kit');assert.equal(f.economy.kits,1);assert.equal(f.economy.workshops[0]!.stock,0);conserved(f);
 assert.equal(act(f,'collect-kit').economy,f.economy);assert.equal(f.economy.renown,0,'purchase is not an earned community reward');
 const recycled=act(f,'recycle-kit');assert.equal(recycled.ctx.inventory.scrap,63);assert.equal(recycled.economy.kits,0);conserved(recycled);assert.equal(act(recycled,'recycle-kit').economy,recycled.economy);
});
test('queue/output capacity blocks overflow, and idle work cannot be banked for later free production',()=>{
 let f=tick(fixture(),50);f=act(f,'commission-kit');assert.equal(f.economy.workshops[0]!.progress,0);
 for(let i=0;i<3;i++)f=act(f,'commission-kit');const full=f;assert.equal(act(f,'commission-kit').economy,full.economy);assert.equal(f.ctx.inventory.scrap,56);
 f=tick(f,48);assert.equal(f.economy.workshops[0]!.stock,4);assert.equal(f.economy.workshops[0]!.feedstock,0);conserved(f);
 f=act(f,'commission-kit');f=tick(f,100);assert.equal(f.economy.workshops[0]!.stock,4);assert.equal(f.economy.workshops[0]!.progress,0,'full shelf discards service credit');
 f=act(f,'collect-kit');f=tick(f,1);assert.equal(f.economy.workshops[0]!.stock,3);assert.equal(f.economy.workshops[0]!.progress,1);conserved(f);
});
test('commands require a living nearby player, correct workshop, matching service, stock and existing materials',()=>{
 const f=fixture();for(const ctx of [{...f.ctx,zone:'cave' as const},{...f.ctx,player:{...f.ctx.player,hp:0}},{...f.ctx,player:{...f.ctx.player,x:70,z:70}},{...f.ctx,inventory:{scrap:1,core:0,water:0}}])assert.equal(applyEconomyCommand(f.economy,f.causal,ctx,{type:'commission-kit',workplaceId:f.workId}).state,f.economy);
 assert.equal(command(f,{type:'commission-kit',workplaceId:'missing'}).economy,f.economy);
 const damaged=copy(f);damaged.causal.workplaces.find(w=>w.id===f.workId)!.operational=false;assert.equal(act(damaged,'commission-kit').economy,damaged.economy);
 const stale=copy(f);stale.causal.elapsed=1;assert.equal(act(stale,'commission-kit').economy,stale.economy);
 assert.equal(applyEconomyCommand(f.economy,f.causal,f.ctx,{type:'damage-press',workplaceId:f.workId} as unknown as EconomyCommand).state,f.economy);
});
test('natural wear needs real work and an already carried kit; its last repair material cannot be traded away',()=>{
 let f=tick(fixture(),240);assert.equal(f.economy.incidents.length,0,'no kits, no impossible incident');f=kit(f);f=tick(f,24);assert.equal(f.economy.incidents.length,1);assert.equal(f.economy.incidents[0]!.cause,'natural-wear');conserved(f);
 assert.equal(act(f,'recycle-kit').economy,f.economy,'last carried kit is reserved');assert.equal(act(f,'commission-kit').economy,f.economy,'press is jammed');
 const original=f;f=tick(f,20);assert.equal(f.economy.incidents.length,1);f=repair(f);assert.equal(f.economy.kits,0);assert.equal(f.economy.renown,2);conserved(f);assert.equal(repair(f).economy,f.economy,'duplicate repair pays nothing');
 assert.equal(original.economy.incidents[0]!.resolvedAt,null,'immutable transition');
});
test('jam stalls pending manufacturing and repair resumes only future committed service',()=>{
 let f=kit(fixture());f=act(f,'commission-kit');f=tick(f,108,12); // second kit is finished at t=120; press wears
 assert.equal(f.economy.incidents.length,1);assert.equal(f.economy.workshops[0]!.stock,1);f=act(f,'collect-kit');f=repair(f);conserved(f);
 f=act(f,'commission-kit');f=tick(f,120,24);assert.equal(f.economy.incidents.length,2);
 const before=f.economy.workshops[0]!.produced;f=tick(f,500);assert.equal(f.economy.workshops[0]!.produced,before);f=repair(f);f=act(f,'commission-kit');f=tick(f,11.75);assert.equal(f.economy.workshops[0]!.progress,11.75);conserved(f);
});
test('repeated wear has rest periods, finite budgets and genuinely executable repairs',()=>{
 let f=fixture();for(let n=0;n<ECONOMY_RULES.maxIncidents;n++){
  f=kit(f);const rest=f.economy.incidents.at(-1)?.resolvedAt??f.economy.startedAt;
  const before=f.economy.incidents.length;const toRest=rest+120-f.causal.elapsed;
  if(toRest>0){f=tick(f,toRest-.25);assert.equal(f.economy.incidents.length,before);f=tick(f,.25);}else f=tick(f,24);
  assert.equal(f.economy.incidents.length,n+1);assert.ok(f.economy.kits>=1);conserved(f);f=repair(f);assert.equal(f.economy.renown,(n+1)*2);conserved(f);
 }
 f=kit(f);f=tick(f,10000);assert.equal(f.economy.incidents.length,8);assert.equal(f.economy.renown,16);assert.equal(f.economy.kits,1);conserved(f);
});
test('deterministic replay/roundtrip and old service baseline avoid retroactive work or fabricated traditions',()=>{
 function run(){let f=fixture(8);f=kit(f);f=tick(f,120);f=repair(f);return f;}
 const a=run(),b=run();assert.deepEqual(a,b);conserved(a);const reloaded={...a,economy:JSON.parse(JSON.stringify(a.economy)) as EconomyState};assert.deepEqual(tick(reloaded,12),tick(a,12));
 const later=copy(a.causal);later.elapsed+=500;for(const w of later.workplaces)w.service+=300;const migrated=createEconomyState(8,later);assert.ok(validEconomy(migrated,8,later));assert.equal(migrated.records.length,0);assert.equal(migrated.kits,0);assert.ok(economyView(migrated,8).settlements.every(s=>s.motif==='No recorded craft tradition'));
 const view=economyView(a.economy,8);assert.ok(view.history.every(h=>a.economy.records.some(r=>r.id===h.id)));assert.equal(view.settlements.reduce((n,t)=>n+t.evidence.repaired,0),1);
});
test('save validation rejects forged goods, logs, manufacturing, renown, wear, baselines and malformed payloads without throwing',()=>{
 let f=kit(fixture());f=tick(f,120);f=repair(f);conserved(f);
 const mutations:((s:EconomyState)=>void)[]=[s=>s.kits++,s=>s.renown++,s=>s.manifestHash='wrong',s=>s.records.push(copy(s.records[0]!)),s=>s.records[0]!.service=10000,s=>s.records[0]!.at=-1,s=>s.records[0]!.workplaceId='missing',s=>s.records[1]!.kind='recycled',s=>s.workshops[0]!.stock++,s=>s.workshops[0]!.feedstock++,s=>s.workshops[0]!.progress=1,s=>s.workshops[0]!.baselineService=2,s=>s.workshops[0]!.serviceSeen=Infinity,s=>s.incidents[0]!.createdAt=0,s=>s.incidents[0]!.resolvedAt=null,s=>s.incidents[0]!.cause='player-damage' as 'natural-wear',s=>s.incidents[0]!.serviceAtCreation=0,s=>s.elapsed+=1,s=>(s as unknown as Record<string,unknown>).arbitrary='unvalidated'];
 for(const mutate of mutations){const corrupt=copy(f.economy);mutate(corrupt);assert.doesNotThrow(()=>validEconomy(corrupt,f.ctx.seed,f.causal));assert.equal(validEconomy(corrupt,f.ctx.seed,f.causal),false,mutate.toString());}
 for(const value of [null,{},[],{...f.economy,workshops:[null]},{...f.economy,incidents:[null]},{...f.economy,records:[null]}]){assert.doesNotThrow(()=>validEconomy(value,f.ctx.seed,f.causal));assert.equal(validEconomy(value,f.ctx.seed,f.causal),false);}
});
test('service cannot travel backwards, exceed elapsed time or advance from a foreign workshop snapshot',()=>{
 const f=fixture();for(const change of [(c:CausalState)=>c.elapsed=-1,(c:CausalState)=>c.workplaces.find(w=>w.id===f.workId)!.service=10,(c:CausalState)=>c.workplaces=[]]){const c=copy(f.causal);change(c);assert.equal(advanceEconomy(f.economy,c),f.economy);}
});
test('deterministic mixed trading across both towns never exceeds storage, duplicates goods, or breaks replay conservation',()=>{
 let f=fixture(17),random=17;const rand=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296;};
 for(let n=0;n<2000;n++){
  const id=f.economy.workshops[Math.floor(rand()*f.economy.workshops.length)]!.id,place=causalPlan(17).workplaces.find(w=>w.id===id)!;
  f={...f,workId:place.id,ctx:{...f.ctx,player:{...f.ctx.player,x:place.position.x,z:place.position.z}}};
  const choice=rand();if(choice<.24)f=act(f,'commission-kit');else if(choice<.48)f=act(f,'collect-kit');else if(choice<.64)f=act(f,'recycle-kit');else if(choice<.72&&f.economy.incidents.some(i=>i.resolvedAt===null)){const incident=f.economy.incidents.find(i=>i.resolvedAt===null)!;f=command(f,{type:'repair-press',incidentId:incident.id});}else f=tick(f,1);
  assert.ok(f.economy.kits<=6);assert.ok(f.economy.workshops.every(w=>w.stock<=4&&w.feedstock<=8));conserved(f);
 }
});

test('causal feasibility may count only finished unreserved kits as recyclable scrap',()=>{
 let f=act(fixture(),'commission-kit');assert.equal(economyRecoverableScrap(f.economy),0);f=tick(f,12);assert.equal(economyRecoverableScrap(f.economy),1);f=act(f,'collect-kit');assert.equal(economyRecoverableScrap(f.economy),1);f=tick(f,120);assert.equal(economyRecoverableScrap(f.economy),0);f=repair(f);assert.equal(economyRecoverableScrap(f.economy),0);assert.equal(economyRecoverableScrap(undefined),0);
});
