import test from 'node:test';import assert from 'node:assert/strict';
import {createEconomyState,advanceEconomy,applyEconomyCommand,validEconomy,economyCost,economyRecoverableScrap,ECONOMY_RULES,type EconomyCommand,type EconomyState} from '../src/economy.ts';
import {causalPlan,createCausalState,type CausalState} from '../src/causal.ts';

/** Seeded randomized command/service schedules. Pure economy reducers only; it uses
 * synthetic causal service (bounded by elapsed time) to reach every budget quickly. */
function rng(seed:number){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};}
function run(seed:number,schedule:number,steps:number){
 const r=rng(seed*31+schedule),plan=causalPlan(seed),start=40;
 let causal:CausalState=createCausalState(seed,false,0),economy:EconomyState=createEconomyState(seed,causal),inventory={scrap:start,core:0,water:0};
 const ids=economy.workshops.map(w=>w.id),accepted:Record<string,number>={};
 for(let step=0;step<steps;step++){
  causal={...causal,elapsed:causal.elapsed+.25,workplaces:causal.workplaces.map(w=>{const next={...w};if(!next.operational&&r()<.002){next.operational=true;next.repairedBy='player';}if(next.operational&&r()<.7)next.service+=.25*(r()<.8?1:r());return next;})};
  const advanced=advanceEconomy(economy,causal);
  assert.equal(advanced.elapsed,causal.elapsed,'economy must stay synchronized with committed causal time');economy=advanced;
  if(r()<.15){
   const kinds=['commission-kit','collect-kit','recycle-kit','repair-press'] as const,kind=kinds[Math.floor(r()*kinds.length)]!,open=economy.incidents.find(i=>i.resolvedAt===null);
   const command:EconomyCommand=kind==='repair-press'?{type:kind,incidentId:open?.id??'missing'}:{type:kind,workplaceId:ids[Math.floor(r()*ids.length)]!};
   const target=command.type==='repair-press'?open?.workplaceId:command.workplaceId,place=plan.workplaces.find(w=>w.id===target);
   if(place){const result=applyEconomyCommand(economy,causal,{seed,zone:'valley',player:{x:place.position.x,z:place.position.z,hp:100},inventory} as never,command);if(result.state!==economy){accepted[kind]=(accepted[kind]??0)+1;economy=result.state;inventory=result.inventory;}}
  }
  assert.ok(inventory.scrap>=0&&economy.kits>=0&&economy.kits<=ECONOMY_RULES.playerCapacity);
  for(const w of economy.workshops)assert.ok(w.feedstock>=0&&w.stock>=0&&w.stock<=ECONOMY_RULES.stockCapacity&&Number.isFinite(w.progress)&&w.progress<ECONOMY_RULES.recipeSeconds);
  // Net player debit exactly explains every scrap leaving the canonical inventory.
  assert.equal(inventory.scrap+economyCost(economy).scrap,start);
  assert.ok(economyRecoverableScrap(economy)<=economy.kits+economy.workshops.reduce((n,w)=>n+w.stock,0));
  if(step%100===0)assert.ok(validEconomy(JSON.parse(JSON.stringify(economy)),seed,causal),`live state must survive save validation at ${causal.elapsed}s`);
 }
 assert.ok(validEconomy(JSON.parse(JSON.stringify(economy)),seed,causal));
 return {economy,accepted};
}
test('randomized commissions, collection, recycling, wear and repairs conserve scrap and always pass strict save replay',()=>{
 let repaired=0,commissions=0;
 for(const seed of [73129,1,42])for(const schedule of [0,1]){const {economy,accepted}=run(seed,schedule,3000);repaired+=accepted['repair-press']??0;commissions+=accepted['commission-kit']??0;assert.ok(economy.records.length<=ECONOMY_RULES.maxCommissions*4+ECONOMY_RULES.maxIncidents*2);}
 assert.ok(commissions>0&&repaired>0,'schedules must exercise manufacture and natural-wear repair');
});
test('identical randomized schedules are deterministic',()=>{
 assert.equal(JSON.stringify(run(42,3,1500).economy),JSON.stringify(run(42,3,1500).economy));
});
