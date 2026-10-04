import {createConnectedState,enableCommonsTrade,applyAction,worldObjects,validateSave,parseSave,serializeSave,type State} from './world.ts';
import {causalPlan} from './causal.ts';
import type {SystemCheck} from './systems-lab.ts';
/** Fixed seed-1 counterfactual using production reducers; no campaign objects are accepted. */
export function commonsTradeSystemCheck():SystemCheck {
 const seed=1,p=causalPlan(seed),home=p.settlements[0]!,work=p.workplaces.find(w=>!w.initiallyOperational&&p.agents.some(a=>a.workplaceId===w.id))!;
 let initial=enableCommonsTrade(createConnectedState(seed));for(const o of worldObjects(initial)){if(['water','scrap','core','enemy'].includes(o.kind)){initial=applyAction(initial,{type:'move',...o});initial=applyAction(initial,o.kind==='enemy'?{type:'attack',id:o.id}:{type:'collect',id:o.id});}}
 initial=applyAction(initial,{type:'move',...home.position});const tick=(s:State,n:number)=>{for(let i=0;i<n;i++)s=applyAction(s,{type:'tick',dt:.25});return s;};
 const control=tick(initial,960);let traded=initial;for(let i=0;i<2;i++)traded=applyAction(traded,{type:'commons-trade',command:{type:'water-for-scrap',settlementId:home.id,expectedRevision:traded.causal!.commonsTrade!.revision}});
 const exports=traded.causal!.commonsTrade!.revision,credit=traded.inventory.scrap-initial.inventory.scrap;traded=tick(traded,960);const blocked=!traded.causal!.workplaces.find(w=>w.id===work.id)!.operational&&traded.causal!.agentMaterialsSpent===0;
 const before=traded.inventory.scrap;traded=applyAction(traded,{type:'move',...work.position});traded=applyAction(traded,{type:'causal',command:{type:'repair-workplace',workplaceId:work.id}});traded=tick(traded,160);const live=traded.causal!.workplaces.find(w=>w.id===work.id)!,roundtrip=validateSave(traded)?parseSave(serializeSave(traded)):null;
 return {name:'Household barter changes actual repair ownership · seed 1',expected:'Two canisters transfer existing NPC scrap; the builder loses its repair stock; paying that stock back as a player repair restores real work',pass:control.causal!.workplaces.find(w=>w.id===work.id)!.repairedBy==='agent'&&exports===2&&credit===2&&blocked&&before-traded.inventory.scrap===work.repairCost&&live.repairedBy==='player'&&live.service>0&&!!roundtrip,actual:`${exports} receipt-backed exchanges; ${credit} scrap transferred; builder blocked ${blocked}; ${work.repairCost} scrap paid to repair; ${live.service.toFixed(1)}s actual service; valid save ${!!roundtrip}`};
}
