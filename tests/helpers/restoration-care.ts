import assert from 'node:assert/strict';
import {createRegionalState,enableStartingTown,applyAction,worldObjects,worldRestorationPlan,validateSave,type State} from '../../src/world.ts';
import {startingTown} from '../../src/starting-town.ts';
import {restorationPlayerCost} from '../../src/restoration.ts';
import {earnRestorationCareHabitat} from '../../src/restoration-care-scenarios.ts';
import {restorationCarePosition,type RestorationCareCommand} from '../../src/restoration-care.ts';
let cached:State|undefined;
/** Real preparation receipts plus canonical campaign pickups fund the exact structural part cost. */
export function earnedCareWorld():State {
 if(cached)return cached;
 let s=enableStartingTown(createRegionalState(73129));s={...s,player:{...s.player,...startingTown(s.seed).shops[0]!.entry}};s=applyAction(s,{type:'town-purchase',command:{offerId:'arrival-kit',expectedRevision:0}});
 const prepared=earnRestorationCareHabitat(worldRestorationPlan(s.seed)),cost=restorationPlayerCost(prepared.restoration);
 for(const kind of ['scrap','core','water'] as const)for(const o of worldObjects(s).filter(o=>o.kind===kind)){
  if(s.inventory[kind]>=cost[kind])break;
  s={...s,player:{...s.player,x:o.x,z:o.z}};const next=applyAction(s,{type:'collect',id:o.id});assert.notEqual(next,s);s=next;
 }
 assert(s.inventory.scrap>=cost.scrap&&s.inventory.core>=cost.core&&s.inventory.water>=cost.water);
 s={...s,restoration:prepared.restoration,inventory:{scrap:s.inventory.scrap-cost.scrap,core:s.inventory.core-cost.core,water:s.inventory.water-cost.water}};
 const point=restorationCarePosition(worldRestorationPlan(s.seed),{kind:'collect',targetId:prepared.restoration.sites[0]!.id})!;
 s={...s,player:{...s.player,x:point.x,z:point.z}};assert(validateSave(s),'earned habitat must be a conserved campaign save');cached=s;return s;
}
export function careCommand(s:State,kind:'collect'|'deliver'):RestorationCareCommand {return {kind,targetId:kind==='collect'?worldRestorationPlan(s.seed).sites[0]!.id:'apothecary',expectedRevision:s.restorationCare?.revision??0};}
export function atCare(s:State,kind:'collect'|'deliver'):State {const point=restorationCarePosition(worldRestorationPlan(s.seed),careCommand(s,kind))!;return {...s,player:{...s.player,x:point.x,z:point.z}};}
