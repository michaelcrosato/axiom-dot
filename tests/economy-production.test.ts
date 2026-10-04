import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceCausal,causalPlan,validCausal} from '../src/causal.ts';
import {createConnectedState,worldObjects,applyAction,causalContext} from '../src/world.ts';
import {advanceEconomy,applyEconomyCommand,createEconomyState,validEconomy} from '../src/economy.ts';

test('real resident routes, repaired supply and water-funded service make a commissioned kit then a feasible repeat repair',()=>{
 let world=createConnectedState(73129);
 for(const object of worldObjects(world)){if(['scrap','core','water'].includes(object.kind)){world=applyAction(world,{type:'move',x:object.x,z:object.z});world=applyAction(world,{type:'collect',id:object.id});}else if(object.kind==='enemy'){world=applyAction(world,{type:'move',x:object.x,z:object.z});world=applyAction(world,{type:'attack',id:object.id});}}
 const p=causalPlan(world.seed);world=applyAction(world,{type:'move',...p.source.position});world=applyAction(world,{type:'causal',command:{type:'repair-source'}});
 const place=p.workplaces.find(w=>p.agents.some(a=>a.workplaceId===w.id))!;world=applyAction(world,{type:'move',...place.position});world=applyAction(world,{type:'causal',command:{type:'repair-workplace',workplaceId:place.id}});
 let causal=world.causal!,ctx=causalContext(world),economy=createEconomyState(world.seed,causal);
 const ordered=applyEconomyCommand(economy,causal,ctx,{type:'commission-kit',workplaceId:place.id});assert.notEqual(ordered.state,economy);economy=ordered.state;ctx={...ctx,inventory:ordered.inventory};
 for(let tick=0;tick<2400&&economy.workshops.find(w=>w.id===place.id)!.stock===0;tick++){causal=advanceCausal(causal,ctx,.25);economy=advanceEconomy(economy,causal);assert.ok(validCausal(causal,ctx));assert.ok(validEconomy(economy,world.seed,causal));}
 assert.equal(economy.workshops.find(w=>w.id===place.id)!.stock,1);assert.ok(causal.settlements.find(s=>s.id===place.settlementId)!.consumed>=.72,'12 seconds costs at least .72 L real household water');assert.ok(causal.agents.some(a=>a.task?.kind==='work'));
 const collected=applyEconomyCommand(economy,causal,ctx,{type:'collect-kit',workplaceId:place.id});economy=collected.state;ctx={...ctx,inventory:collected.inventory};assert.equal(economy.kits,1);
 for(let tick=0;tick<2400&&economy.incidents.length===0;tick++){causal=advanceCausal(causal,ctx,.25);economy=advanceEconomy(economy,causal);}
 assert.equal(economy.incidents.length,1);assert.ok(economy.incidents[0]!.serviceAtCreation>=24);const repaired=applyEconomyCommand(economy,causal,ctx,{type:'repair-press',incidentId:economy.incidents[0]!.id});assert.equal(repaired.state.kits,0);assert.equal(repaired.state.renown,2);assert.ok(validEconomy(repaired.state,world.seed,causal));assert.ok(validCausal(causal,ctx));
});
