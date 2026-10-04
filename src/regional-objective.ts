import {regionalFoodPlan,regionalFoodSummary,regionalFoodInteractions,type RegionalFoodFarmPlan} from './regional-food.ts';
import {regionalSupplyPlan,regionalSupplyAvailable,regionalSupplyWeather,REGIONAL_SUPPLY_WORK_TICKS,type RegionalSupplyOutpostPlan,type RegionalSupplySummary} from './regional-supply.ts';
import {regionalTradePlan,regionalTradeSummary,regionalTradeInteractions,type RegionalTradeRoutePlan} from './regional-trade.ts';
import type {State} from './world.ts';
import type {Vec3} from './procedural.ts';

export type RegionalObjectiveStatus='actionable'|'waiting'|'completed';
export interface RegionalObjective {
 id:string;siteId:string;status:RegionalObjectiveStatus;stage:'freight'|'collector'|'farm'|'meal';
 title:string;copy:string;progress:string;position:Vec3;
 inspect:{kind:'trade'|'supply'|'food';targetId:string;label:string};
 /** Advice only: no command is issued, and local panels remain authoritative. */
 irrigation?:{state:'available'|'used'|'no-canister'|'no-space'|'not-started'|'unavailable';text:string};
}
export interface RegionalObjectiveOptions {previousSiteId?:string;labActive?:boolean}
const metres=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
const number=(n:number)=>n.toFixed(1).replace(/\.0$/,'');
type CollectorSummary=Pick<RegionalSupplySummary,'phase'|'cause'|'missing'|'available'|'water'|'capacity'|'consumed'|'workProgress'|'weather'>;

/** Read-only dependency guidance, never a quest ledger, simulation or action authority.
 * Fixed site/work-point anchors and 64 m / 25% hysteresis keep a community selected
 * through worker, weather and task changes. Approaching a different work point
 * within 3.5 m selects its community. The optional cursor is UI-only. */
export function selectRegionalObjective(state:State,options:RegionalObjectiveOptions={}):RegionalObjective|null {
 if(!state.frontierSupply||state.zone!=='valley'||options.labActive)return null;
 const inCore=Math.max(Math.abs(state.player.x),Math.abs(state.player.z))<100;
 if(inCore&&(state.jobAccepted||state.jobs.active))return null;
 const supply=regionalSupplyPlan(state.seed),trade=state.frontierTrade?regionalTradePlan(state.seed):undefined,food=state.frontierFood?regionalFoodPlan(state.seed):undefined;
 const candidates=supply.outposts.map(outpost=>{
  const route=trade?.routes.find(r=>trade.projects.find(p=>p.id===r.projectId)?.siteId===outpost.id),farm=food?.farms.find(f=>f.siteId===outpost.id);
  const points=[outpost.deliveryPosition,...(farm?[farm.interactionPosition]:[]),...(route?[trade!.sources.find(p=>p.id===route.sourceId)!.interactionPosition,trade!.projects.find(p=>p.id===route.projectId)!.interactionPosition,route.obstruction.interactionPosition]:[])];
  return {outpost,route,farm,distance:Math.min(...points.map(p=>metres(p,state.player)))};
 }).sort((a,b)=>a.distance-b.distance||a.outpost.id.localeCompare(b.outpost.id));
 let selected=candidates[0]!;const previous=candidates.find(c=>c.outpost.id===options.previousSiteId);
 if(previous&&selected.distance>3.5&&!(selected.distance+64<previous.distance*.75))selected=previous;
 const {outpost,route,farm}=selected,saved=state.frontierSupply.outposts.find(o=>o.id===outpost.id)!;
 // HUD needs no finite-source catalogs or terrain compilation. Read the same
 // authoritative collector ledger, resource balance and production weather.
 const missing={wood:outpost.cost.wood-saved.delivered.wood,stone:outpost.cost.stone-saved.delivered.stone};
 const summary:CollectorSummary={phase:saved.builtAt!==null?'operational':saved.buildStartedAt!==null?'building':missing.wood+missing.stone===0?'ready':'shortage',missing,available:regionalSupplyAvailable(state.frontierSupply,state.wilderness,state.frontierTrade),water:saved.water,capacity:outpost.capacity,consumed:saved.consumed,workProgress:saved.workTicks/REGIONAL_SUPPLY_WORK_TICKS,weather:regionalSupplyWeather(state.frontierSupply,outpost.id)!,cause:saved.builtAt!==null?'The collector is built. Residents drink from its finite roof-rain reserve.':'All required wood and stone is staged. Start construction at the collector work point.'};
 const foodState=farm?state.frontierFood!.farms.find(f=>f.id===farm.id):undefined;
 const routeState=route?state.frontierTrade!.routes.find(r=>r.id===route.id):undefined;
 const canStage=summary.phase==='ready'||summary.phase==='shortage'&&(Math.min(summary.missing.wood,summary.available.wood)+Math.min(summary.missing.stone,summary.available.stone)>0);
 if(route&&routeState?.builtAt===null){
  const freight=freightObjective(state,outpost,route);
  // A travelling carrier cannot hide useful work on its community's collector.
  if(freight.status==='waiting'&&canStage)return collectorObjective(state,outpost,summary);
  return freight;
 }
 if(saved.builtAt===null){
  // An earned one-use canister can fund a real crop before renewable water exists.
  // Do not call an already growing/delivering crop blocked on infrastructure.
  if(farm&&foodState?.startedAt!==null&&foodState&&(foodState.crop!=='empty'||foodState.water>=farm.waterPerCrop||foodState.harvested>0||regionalFoodInteractions(state.seed,state.frontierFood,state).some(a=>a.farmId===farm.id&&a.kind==='irrigate-farm'&&a.enabled)))return farmObjective(state,outpost,farm,summary);
  // Starting the farm during construction preserves future overflow; no water is fabricated.
  if(farm&&foodState?.startedAt===null&&summary.phase==='building')return farmObjective(state,outpost,farm,summary);
  return collectorObjective(state,outpost,summary);
 }
 if(farm&&foodState)return farmObjective(state,outpost,farm,summary);
 return {id:`${outpost.id}/collector-complete`,siteId:outpost.id,status:'completed',stage:'collector',title:`${outpost.name} · collector built`,copy:summary.cause+' '+summary.weather.description,progress:`${number(summary.water)} / ${summary.capacity} L · ${number(summary.consumed)} L DRUNK`,position:outpost.deliveryPosition,inspect:{kind:'supply',targetId:outpost.id,label:'Inspect collector'}};
}

function freightObjective(state:State,outpost:RegionalSupplyOutpostPlan,route:RegionalTradeRoutePlan,reserve=false):RegionalObjective {
 const summary=regionalTradeSummary(state.frontierTrade!,state.seed,route.id)!;
 const actions=regionalTradeInteractions(state.seed,state.frontierTrade).filter(a=>a.routeId===route.id),action=reserve?actions.find(a=>a.kind==='withdraw-reserve'&&a.enabled):['build-store','start-source','clear-route'].map(kind=>actions.find(a=>a.kind===kind&&a.enabled)).find(Boolean);
 const plan=regionalTradePlan(state.seed),project=plan.projects.find(p=>p.id===route.projectId)!;
 const repair=summary.phase==='blocked'||summary.phase==='repairing',position=action?.position??(repair?route.obstruction.interactionPosition:project.interactionPosition);
 const title=reserve?'Take reserve for the collector':action?.label??(summary.phase==='building'?'Freight store under construction':summary.phase==='repairing'?'Freight road under repair':'Waiting for freight');
 const copy=reserve?`Take delivered ${summary.material==='quarry-stone'?'stone':'wood'} at ${project.name}, then deliver it to ${outpost.name}.`:action?.kind==='clear-route'?'Repair the marked freight bed locally. The carrier cannot cross it until the crew finishes.':summary.cause;
 const weather=summary.travelRule==='regional'&&['outbound','returning'].includes(summary.carrierActivity)?` · ${summary.travelCondition.toUpperCase()} ROAD · ${number(summary.travelSpeed)} m/s`:'';
 return {id:`${outpost.id}/${route.id}/${reserve?'reserve':action?.kind??summary.phase}`,siteId:outpost.id,status:action?'actionable':'waiting',stage:'freight',title,copy,progress:`${summary.cargo} CARGO · ${summary.destinationStock} STORED${weather}`,position,inspect:{kind:'trade',targetId:action?.targetId??(repair?route.id:project.id),label:'Inspect freight'}};
}

function collectorObjective(state:State,outpost:RegionalSupplyOutpostPlan,s:CollectorSummary):RegionalObjective {
 let status:RegionalObjectiveStatus='actionable',title='Build the rain collector',copy=s.cause;
 if(s.phase==='building'){status='waiting';title='Collector under construction';copy='The crew is assembling the delivered wood and stone. Crop water waits for the working collector to overflow.';}
 else if(s.phase==='shortage'){
  const deliver=Math.min(s.missing.wood,s.available.wood)+Math.min(s.missing.stone,s.available.stone)>0;
  if(deliver){title='Deliver collector materials';copy=`Stage what you carry: ${s.missing.wood} wood and ${s.missing.stone} stone still needed. Construction uses only real delivered materials.`;}
  else {
   const plan=state.frontierTrade?regionalTradePlan(state.seed):undefined;
   const reserves=regionalTradeInteractions(state.seed,state.frontierTrade).filter(a=>a.kind==='withdraw-reserve'&&a.enabled&&s.missing[plan!.routes.find(r=>r.id===a.routeId)!.material==='quarry-stone'?'stone':'wood']>0).sort((a,b)=>metres(a.position,state.player)-metres(b.position,state.player)||a.id.localeCompare(b.id));
   if(reserves[0])return freightObjective(state,outpost,plan!.routes.find(r=>r.id===reserves[0]!.routeId)!,true);
   title='Gather collector materials';copy=`Collector not built: ${s.missing.wood} wood and ${s.missing.stone} stone needed. Inspect remaining wood and stone sources, or use delivered freight reserve.`;
  }
 }
 return {id:`${outpost.id}/collector-${s.phase}`,siteId:outpost.id,status,stage:'collector',title:`${outpost.name} · ${title}`,copy,progress:s.phase==='building'?`${Math.round(s.workProgress*100)}% BUILT`:`CARRY ${s.available.wood} WOOD · ${s.available.stone} STONE`,position:outpost.deliveryPosition,inspect:{kind:'supply',targetId:outpost.id,label:'Inspect collector'}};
}

function farmObjective(state:State,outpost:RegionalSupplyOutpostPlan,farm:RegionalFoodFarmPlan,collector:CollectorSummary):RegionalObjective {
 const food=state.frontierFood!,saved=food.farms.find(f=>f.id===farm.id)!,s=regionalFoodSummary(food,state.seed,farm.id,state)!;
 const actions=regionalFoodInteractions(state.seed,food,state).filter(a=>a.farmId===farm.id),start=actions.find(a=>a.kind==='start-farm'),tend=actions.find(a=>a.kind==='tend-crop');
 const imported=actions.find(a=>a.kind==='irrigate-farm');
 const irrigation:RegionalObjective['irrigation']=!imported?undefined:imported.enabled?{state:'available',text:'Optional: spend 1 earned canister for 4 L, once here.'}:saved.waterIrrigated?{state:'used',text:'One-time irrigation already used.'}:saved.startedAt===null?{state:'not-started',text:'Emergency irrigation needs a started farm.'}:farm.capacity.water-saved.water<4?{state:'no-space',text:'Emergency irrigation needs room for all 4 L.'}:state.inventory.water<1?{state:'no-canister',text:'No earned canister available for emergency irrigation.'}:{state:'unavailable',text:imported.reason};
 const completed=s.harvested>0&&s.delivered>0&&s.meals>s.starterGranted;
 let status:RegionalObjectiveStatus='waiting',title='Waiting for crop water',copy=s.cause,position=farm.interactionPosition;
 if(s.phase==='paused'){title='Food simulation paused';copy=s.cause;}
 else if(saved.startedAt===null){status=start?.enabled?'actionable':'waiting';title='Start the local garden';copy='The freight pantry is ready. Start two reusable seed portions locally; new collector overflow supplies crop water.';}
 else if(completed){status='completed';title='Harvested meals reached residents';copy=`At least ${s.meals-s.starterGranted} eaten portions came from crops. ${s.starterGranted} starter portions are counted separately. ${collector.phase==='operational'?'The local food loop continues.':'The collector is still needed for renewable crop water.'}`;position=farm.storeInteractionPosition;}
 else if(saved.crop==='empty'&&saved.water<farm.waterPerCrop&&saved.harvested===0){
  copy=collector.phase!=='operational'?`Collector ${collector.phase==='building'?'under construction':'not built'}: renewable crop water needs a working collector and new overflow.`:collector.weather.intensity===0?`Dry weather: no roof rain now. Crops need ${number(farm.waterPerCrop-saved.water)} L more; residents drink before new overflow.`:`Roof rain is available. Residents drink first; crops wait for ${number(farm.waterPerCrop-saved.water)} L more new collector overflow.`;
  if(irrigation)copy+=' '+irrigation.text;
 }
 else if(s.harvested>0&&s.delivered===0){const unloading=s.cargo>0&&s.carrierActivity==='unloading';title=unloading?'Unloading harvested food':s.cargo>0?'Food travelling to the pantry':s.reserved>0?'Loading harvested food':'Harvested food awaits its carrier';copy=unloading?'The carrier has reached the pantry. Food enters its shelves only when unloading finishes; a meal must still be eaten.':s.cargo>0?'The carrier must reach the pantry and finish unloading. Harvested or carried food is not yet a meal.':'Four food portions form a real load. The carrier loads, walks the local route and unloads before crop food can be eaten.';position=s.cargo>0?farm.storeInteractionPosition:farm.interactionPosition;}
 else if(s.delivered>0){title='Waiting for a harvested meal';copy=`${s.delivered} harvested portions delivered. ${s.meals} meals eaten so far; the ${s.starterGranted} starter portions do not prove a crop meal. Residents eat when hungry.`;position=farm.storeInteractionPosition;}
 else if(tend?.enabled){status='actionable';title='Help tend the growing crop';copy='Optional: tend this funded crop once. The gardener also works without help; harvesting, delivery and an eaten crop portion still lie ahead.';}
 else if(saved.crop==='ripe'){title='Harvesting the ripe crop';copy='The gardener must finish harvesting before the crop becomes food stock. The carrier then takes it to the pantry.';}
 else if(saved.crop==='growing'){title='Crop growing';copy='Water and a seed are committed. The gardener continues at its meal-supported work rate; this crop cannot be helped again now.';}
 else if(saved.seeds<1){title='Waiting for returned seed';copy='No seed portion is available. A completed harvest returns the reusable seed; no new seed is granted here.';}
 else if(saved.stock+farm.yield>farm.capacity.source){title='Waiting for harvest space';copy='The next crop needs four free source slots. Deliveries and meals free storage; no extra food is created while it is full.';}
 else {title='Waiting for planting';copy='A seed and crop water are available. The gardener plants when crop storage has room; work follows active world time.';}
 // A meal is proven only beyond the entire finite starter allowance. Stewardship
 // marks, ripe crops, loaded cargo, held portions and pantry stock are insufficient.
 return {id:`${farm.id}/${completed?'meal-complete':saved.startedAt===null?'start':title}`,siteId:outpost.id,status,stage:completed?'meal':'farm',title:`${farm.name} · ${title}`,copy,progress:`${number(s.water)} L CROP WATER · ${s.harvested} HARVESTED · ${s.meals} MEALS`,position,inspect:{kind:'food',targetId:farm.id,label:'Inspect food loop'},...(irrigation?{irrigation}:{})};
}
