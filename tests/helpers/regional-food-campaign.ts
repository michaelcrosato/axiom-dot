import assert from 'node:assert/strict';
import {createRegionalState,enableRegionalTrade,enableRegionalFood,enableEcology,applyAction,validateSave,parseSave,serializeSave,type State} from '../../src/world.ts';
import {regionalTradePlan,regionalTradeCommandPosition,type RegionalTradeCommand} from '../../src/regional-trade.ts';
import {regionalSupplyPlan,createRegionalSupply} from '../../src/regional-supply.ts';
import {gatherRegionalSupplyMaterials} from '../../src/regional-supply-lab.ts';
import {ecologyPlan} from '../../src/ecology.ts';
import {regionalFoodPlan,regionalFoodCommandPosition,type RegionalFoodCommand} from '../../src/regional-food.ts';
let oldBytes:string|undefined;
/** Only disposable fixtures: every store and collector is earned via production
 * commands and active model ticks; legacy v1 rainfall and freight deliberately test old saves; approach poses are model placements. */
export function oldFoodCampaign():State {
 if(oldBytes)return parseSave(oldBytes)!;
 let state=enableEcology(enableRegionalTrade({...createRegionalState(73129),frontierSupply:createRegionalSupply(73129,1)},1));
 const garden=ecologyPlan(state.seed).plots[0]!;state={...state,player:{...state.player,x:garden.position.x,z:garden.position.z}};
 state=applyAction(state,{type:'ecology',command:{type:'plant',plotId:garden.id,species:'sunleaf',expectedRevision:state.ecology!.revision}});
 for(const outpost of regionalSupplyPlan(state.seed).outposts){
  state=gatherRegionalSupplyMaterials(state,outpost.deliveryPosition,outpost.cost).state;
  state={...state,player:{...state.player,x:outpost.deliveryPosition.x,z:outpost.deliveryPosition.z}};
  for(const type of ['deliver','build'] as const)state=applyAction(state,{type:'regional-supply',command:{type,outpostId:outpost.id,expectedRevision:state.frontierSupply!.revision}});
 }
 function issue(type:RegionalTradeCommand['type'],index:number){const plan=regionalTradePlan(state.seed),targetId=(type==='start-source'?plan.sources:type==='clear-route'?plan.routes:plan.projects)[index]!.id,command={type,targetId,expectedRevision:state.frontierTrade!.revision},position=regionalTradeCommandPosition(state.seed,command)!;state={...state,player:{...state.player,x:position.x,z:position.z}};const previous=state;state=applyAction(state,{type:'regional-trade',command});assert.notEqual(state,previous);}
 for(let i=0;i<3;i++){issue('start-source',i);issue('clear-route',i);}
 const limit=Math.ceil(Math.max(...regionalTradePlan(state.seed).routes.map(r=>r.travelSeconds))*6+500);
 for(let second=0;second<limit;second++){
  for(let i=0;i<3;i++){const route=state.frontierTrade!.routes[i]!;if(route.buildStartedAt===null&&route.destinationStock>=regionalTradePlan(state.seed).projects[i]!.cost)issue('build-store',i);}
  if(state.frontierTrade!.routes.every(r=>r.activity==='finished')&&state.frontierSupply!.outposts.every(o=>o.builtAt!==null&&o.spilled>1))break;
  state=applyAction(state,{type:'tick',dt:1});
 }
 assert(state.frontierTrade!.routes.every(r=>r.activity==='finished'));assert(state.frontierSupply!.outposts.every(o=>o.builtAt!==null&&o.spilled>1));assert(state.ecology!.plots[0]!.crop!.growth>0);assert(validateSave(state));oldBytes=serializeSave(state);return parseSave(oldBytes)!;
}
export function foodCommand(state:State,type:RegionalFoodCommand['type']='start-farm',index=0){return {type:'regional-food' as const,command:{type,targetId:regionalFoodPlan(state.seed).farms[index]!.id,expectedRevision:state.frontierFood!.revision}};}
export function atFoodCommand(state:State,type:RegionalFoodCommand['type']='start-farm',index=0){const command=foodCommand(state,type,index),position=regionalFoodCommandPosition(state.seed,command.command)!;return {...state,player:{...state.player,x:position.x,z:position.z}};}
export function readyFoodCampaign(){return atFoodCommand(enableRegionalFood(oldFoodCampaign()));}
