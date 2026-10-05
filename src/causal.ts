import {validCommonsTrade,type CommonsTradeState} from './commons-trade.ts';
import {reconcileWaterRequests,validWaterRequests,waterRequestLiability,waterRequestRenown,type WaterRequests} from './water-requests.ts';
import {takeCaveCargo,deliverCaveCargo,validCaveReceipts,type CaveReceipts} from './cave-receipts.ts';
import {worldValley} from './generation.ts';
import {seedSample,hashSeed,type Vec3} from './procedural.ts';
import {valleySurfaceHeight} from './valley.ts';

/** Bounded, engine-independent simulation overlay. Foundation manifests remain unchanged. */
export const CAUSAL_VERSION=1;
export const CAUSAL_STEP=.25;
export const CAUTION_RADIUS=16;
const EPS=1e-7;
export const CAUSAL_MANIFEST=Object.freeze({version:1,algorithm:'needs-capability-graph/founding-episodes-1',step:CAUSAL_STEP,cautionRadius:CAUTION_RADIUS,maximumAgents:6,maximumJobs:8,sourceRate:.5,depotCapacity:20,householdCapacity:20,reliefThreshold:6,canisterLitres:4,workWaterRate:.06,carrierSpeed:2.6,carrierCapacity:[3,12],repairSeconds:8,issuerBudget:32});
export const CAUSAL_HASH=hashSeed(JSON.stringify(CAUSAL_MANIFEST)).toString(16).padStart(8,'0');
export type Role='caretaker'|'carrier'|'builder';
export type CausalCommand={type:'accept'|'claim';id:string}|{type:'deliver-water';settlementId:string}|{type:'repair-workplace';workplaceId:string}|{type:'repair-source'};
export interface CausalPlan {
 version:1;seed:number;id:string;
 nodes:{id:string;name:string;position:Vec3}[];
 routes:{id:string;from:string;to:string;points:Vec3[]}[];
 agents:{id:string;name:string;role:Role;homeId:string;workplaceId?:string;carryCapacity?:number}[];
 settlements:{id:string;name:string;nodeId:string;position:Vec3;capacity:number;initialWater:number;rewardBudget:number}[];
 workplaces:{id:string;name:string;settlementId:string;nodeId:string;position:Vec3;repairCost:number;initiallyOperational:boolean}[];
 source:{nodeId:string;position:Vec3};
 initialMaterials:number;
 threats:{id:string;position:Vec3;label:string}[];
}
export interface AgentState {
 id:string;position:Vec3;nodeId:string;status:string;
 task:{kind:'drink'|'rest'|'work'|'fetch'|'deliver'|'repair';targetId:string}|null;
 route:string[];waypoint:number;routeIndex:number;thirst:number;fatigue:number;cargo:number;workTime:number;
}
export interface CausalJob {
 id:string;title:string;cause:string;issuerId:string;settlementId:string;targetId:string;kind:'water'|'repair'|'clear-route';
 status:'offered'|'accepted'|'completed'|'resolved'|'claimed'|'blocked';reward:number;completion:string;preconditions:string[];capabilities:string[];route:string[];
 accepted:boolean;playerContribution:boolean;playerEvidence:('delivery'|'intake'|'network'|'repair'|'pulse'|'cave')[];resolvedAt:number|null;createdAt:number;expiresAt:null;reservedReward:number;failureReason:string|null;
}
export interface CausalState {
 commonsTrade?:CommonsTradeState;
 waterRequests?:WaterRequests;
 caveReceipts?:CaveReceipts;
 version:1;manifestHash:string;planId:string;elapsed:number;accumulator:number;
 agents:AgentState[];
 settlements:{id:string;reserve:number;delivered:number;playerDelivered:number;consumed:number;relief:boolean}[];
 workplaces:{id:string;operational:boolean;service:number;repairedBy:'initial'|'player'|'agent'|null}[];
 jobs:CausalJob[];renown:number;sourceRepaired:boolean;depot:number;extracted:number;networkCaptured:number;networkSeen:number;networkDiscarded:number;networkBaseline:number;playerWater:number;
 materials:number;agentMaterialsSpent:number;playerSpent:{scrap:number;core:number;water:number};
 sourcePaid:boolean;networkEverWorking:boolean;
}
export interface CausalContext {
 /** Validated optional outfall bridge. Received is cumulative captured litres. */
 caveSupply?:{received:number;connected:boolean;available:boolean};
 seed:number;defeated:readonly string[];inventory:{scrap:number;core:number;water:number};player:{x:number;z:number;hp:number};zone:'valley'|'dungeon'|'cave';
 networkOverflow:number;networkWorking:boolean;
 /** All recoverable player scrap, including carried, uncollected and dismantlable parts. */
 recoverableScrap:number;recoverableCore:number;recoverableWater:number;historicalPumpRepaired:boolean;
}
const dist=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
function freeze<T>(x:T):T {if(x&&typeof x==='object'&&!Object.isFrozen(x)){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;}
const plans=new Map<number,CausalPlan>();
export function causalPlan(seed:number):CausalPlan {
 let cached=plans.get(seed);if(cached)return cached;
 const valley=worldValley(seed),id=`causal:1:${seed}`,sample=(path:string,purpose:string)=>seedSample(seed,1,'causal',path,purpose);
 const settlements=valley.settlements.map((s,i)=>({id:s.id,name:s.name,nodeId:i?'highmeadow':'mossbank',position:{...s.center},capacity:20,initialWater:Math.floor(sample(s.id,'initial-water')*10),rewardBudget:32}));
 const workplaces=valley.buildings.map((b,i)=>({id:b.id,name:`${settlements.find(s=>s.id===b.settlementId)!.name} workshop ${i%2+1}`,settlementId:b.settlementId,nodeId:`workshop-${i}-work`,position:{x:b.workplace.x,y:b.elevation,z:b.workplace.z},repairCost:sample(b.id,'repair-cost')<.6?1:2,initiallyOperational:sample(b.id,'wear')>.58}));
 const nodes=valley.sites.filter(s=>s.id!=='pump'&&s.id!=='cave').map(s=>({id:s.id,name:s.kind==='workplace'?workplaces.find(w=>w.nodeId===s.id)!.name:s.id.replaceAll('-',' '),position:{...s.position,y:valleySurfaceHeight(valley,s.position.x,s.position.z)}}));
 const routes=valley.roads.filter(r=>nodes.some(n=>n.id===r.from)&&nodes.some(n=>n.id===r.to)).map(r=>({id:r.id,from:r.from,to:r.to,points:clone(r.points)}));
 for(const [i,b] of valley.buildings.entries()){
  const hall=b.rooms[0]!,entry=b.doors[0]!;
  // Follow the real front doorway and hall; never cross a room wall diagonally.
  const points=[b.spawn,entry.center,hall.center,{x:b.workplace.x,z:hall.center.z},b.workplace].map(p=>({x:p.x,y:b.elevation,z:p.z}));
  routes.push({id:`${id}/work-access/${i}`,from:`workshop-${i}`,to:`workshop-${i}-work`,points});
 }
 const names=['Mira','Toma','Iris','Oren','Sable','Ari','Lio','Neri'];
 const agents:CausalPlan['agents']=[];
 for(const [i,s]of settlements.entries()){
  const home=workplaces.filter(w=>w.settlementId===s.id),caretaker=home[Math.floor(sample(s.id,'assigned-workplace')*home.length)]!;
  for(const role of ['caretaker','carrier'] as const){const index=agents.length;agents.push({id:`${id}/agent/${s.nodeId}/${role}`,name:names[(index+Math.floor(sample('names','offset')*8))%8]!,role,homeId:s.id,...(role==='caretaker'?{workplaceId:caretaker.id}:{})});}
  if(i===0||sample(s.id,'builder')>.45)agents.push({id:`${id}/agent/${s.nodeId}/builder`,name:names[(agents.length+Math.floor(sample('names','offset')*8))%8]!,role:'builder',homeId:s.id});
 }
 const source=nodes.find(n=>n.id==='waterworks')!;
 const plan:CausalPlan={version:1,seed,id,nodes,routes,agents,settlements,workplaces,source:{nodeId:source.id,position:source.position},initialMaterials:2+Math.floor(sample('stores','materials')*3),threats:valley.objects.filter(o=>o.kind==='enemy').map(o=>({id:o.id,position:{x:o.x,y:o.y,z:o.z},label:o.label}))};
 for(const actor of plan.agents)if(actor.role==='carrier'){const home=settlements.find(s=>s.id===actor.homeId)!,route=planRoute(plan,home.nodeId,source.id,[],false)!;const length=routeEdges(plan,route).reduce((sum,r)=>sum+r.points.slice(1).reduce((n,point,i)=>n+dist(point,r.points[i]!),0),0);actor.carryCapacity=Math.min(12,Math.max(3,Math.ceil(length*2/2.6*.06+2)));}
 cached=freeze(plan);if(plans.size>=8)plans.clear();plans.set(seed,cached);return cached;
}
export function createCausalState(seed:number,sourceRepaired=false,networkBaseline=0):CausalState {
 const p=causalPlan(seed);
 return {version:1,manifestHash:CAUSAL_HASH,planId:p.id,elapsed:0,accumulator:0,agents:p.agents.map(a=>{const home=p.settlements.find(s=>s.id===a.homeId)!;return {id:a.id,position:{...home.position},nodeId:home.nodeId,status:'Assessing local needs',task:null,route:[],waypoint:0,routeIndex:0,thirst:12,fatigue:0,cargo:0,workTime:0};}),settlements:p.settlements.map(s=>({id:s.id,reserve:s.initialWater,delivered:0,playerDelivered:0,consumed:0,relief:s.initialWater>=6})),workplaces:p.workplaces.map(w=>({id:w.id,operational:w.initiallyOperational,service:0,repairedBy:w.initiallyOperational?'initial':null})),jobs:[],renown:0,sourceRepaired,depot:0,extracted:0,networkCaptured:0,networkSeen:networkBaseline,networkDiscarded:0,networkBaseline,playerWater:0,materials:p.initialMaterials,agentMaterialsSpent:0,playerSpent:{scrap:0,core:0,water:0},sourcePaid:false,networkEverWorking:false};
}
function routeThreats(p:CausalPlan,route:CausalPlan['routes'][number],defeated:readonly string[]){return p.threats.filter(t=>!defeated.includes(t.id)&&route.points.some(point=>dist(t.position,point)<CAUTION_RADIUS));}
/** Breadth-first graph planner. At most nodes × routes checks; named ordering is stable. */
export function planRoute(p:CausalPlan,from:string,to:string,defeated:readonly string[],avoidThreats=true):string[]|null {
 if(!p.nodes.some(n=>n.id===from)||!p.nodes.some(n=>n.id===to))return null;if(from===to)return [from];
 const queue=[[from]],seen=new Set([from]);
 for(let q=0;q<queue.length&&q<p.nodes.length;q++){
  const path=queue[q]!,last=path.at(-1)!;
  for(const edge of p.routes){const next=edge.from===last?edge.to:edge.to===last?edge.from:null;if(!next||seen.has(next)||avoidThreats&&routeThreats(p,edge,defeated).length)continue;const extended=[...path,next];if(next===to)return extended;seen.add(next);queue.push(extended);}
 }return null;
}
function routeEdges(p:CausalPlan,nodes:string[]){return nodes.slice(1).map((to,i)=>p.routes.find(r=>r.from===nodes[i]&&r.to===to||r.to===nodes[i]&&r.from===to)!);}
function blockers(p:CausalPlan,from:string,to:string,defeated:readonly string[]){const route=planRoute(p,from,to,defeated,false);return route?[...new Set(routeEdges(p,route).flatMap(r=>routeThreats(p,r,defeated).map(t=>t.id)))]:[];}
function jobDone(c:CausalState,p:CausalPlan,ctx:CausalContext,j:CausalJob){if(j.kind==='water')return c.settlements.find(s=>s.id===j.targetId)!.reserve>=6-EPS;if(j.kind==='repair')return c.workplaces.find(w=>w.id===j.targetId)!.operational;return ctx.defeated.includes(j.targetId);}
function terminal(j:CausalJob){return ['completed','resolved','claimed'].includes(j.status);}
function homeIssuer(p:CausalPlan,id:string){return p.agents.find(a=>a.homeId===id&&a.role==='caretaker')!.id;}
function addJob(c:CausalState,p:CausalPlan,input:Omit<CausalJob,'status'|'accepted'|'playerContribution'|'playerEvidence'|'resolvedAt'|'reward'|'createdAt'|'expiresAt'|'reservedReward'|'failureReason'>,reward:number){
 if(c.jobs.some(j=>j.id===input.id))return;
 const used=waterRequestLiability(c,input.settlementId)+c.jobs.filter(j=>j.settlementId===input.settlementId).reduce((n,j)=>n+(j.status==='claimed'?j.reward:j.reservedReward),0),budget=p.settlements.find(s=>s.id===input.settlementId)!.rewardBudget;
 const reserved=Math.min(reward,Math.max(0,budget-used));c.jobs.push({...input,reward:reserved,reservedReward:reserved,status:'offered',accepted:false,playerContribution:false,playerEvidence:[],resolvedAt:null,createdAt:c.elapsed,expiresAt:null,failureReason:null});
}
/** Reconcile unmet predicates, feasibility and completion after every relevant transition. */
function reconcile(c:CausalState,ctx:CausalContext){
 const p=causalPlan(ctx.seed);
 for(const s of c.settlements){const def=p.settlements.find(d=>d.id===s.id)!,issuerId=homeIssuer(p,s.id);
  if(s.reserve<6-EPS&&!s.relief){
   const route=planRoute(p,p.source.nodeId,def.nodeId,ctx.defeated,false)??[];
   addJob(c,p,{id:`${p.id}/episode/water/${def.nodeId}`,kind:'water',settlementId:s.id,targetId:s.id,issuerId,title:`Water for ${def.name}`,cause:`${def.name}'s working households have less than 6 L available. Carriers need a supplied intake and safe roads.`,completion:'Raise the actual household reserve to 6 L',preconditions:['Reach the settlement flag with water, or restore an intake and its carrier route'],capabilities:['deliver canister','repair intake','build modular overflow supply'],route},10);
  }
  // Once a founding need was resolved it cannot be regenerated by draining or dismantling.
  if(s.reserve>=6-EPS)s.relief=true;
 }
 for(const w of c.workplaces){if(w.operational)continue;const def=p.workplaces.find(d=>d.id===w.id)!,home=p.settlements.find(s=>s.id===def.settlementId)!;
  // A real worker must need this workplace. Unassigned spare rooms do not invent jobs.
  if(!p.agents.some(a=>a.workplaceId===w.id))continue;
  addJob(c,p,{id:`${p.id}/episode/repair/${def.nodeId}`,kind:'repair',settlementId:home.id,targetId:w.id,issuerId:homeIssuer(p,home.id),title:`Restore ${def.name}`,cause:`The assigned caretaker cannot work: the workshop mechanism is worn out. Repair consumes ${def.repairCost} scrap.`,completion:'Workplace mechanism operational',preconditions:[`Reach the workshop work point with ${def.repairCost} scrap`],capabilities:['repair workplace'],route:planRoute(p,home.nodeId,def.nodeId,ctx.defeated,false)??[]},6+def.repairCost*2);
 }
 // Only surviving threats that interrupt actual home/source/work routes can issue clearance work.
 for(const actor of p.agents){const home=p.settlements.find(s=>s.id===actor.homeId)!,target=actor.role==='carrier'?p.source.nodeId:actor.workplaceId?p.workplaces.find(w=>w.id===actor.workplaceId)!.nodeId:home.nodeId;
  for(const threatId of blockers(p,home.nodeId,target,ctx.defeated)){
   const threat=p.threats.find(t=>t.id===threatId)!;
   addJob(c,p,{id:`${p.id}/episode/access/${threatId}`,kind:'clear-route',settlementId:home.id,targetId:threatId,issuerId:actor.id,title:`Reopen ${home.name}'s route`,cause:`${actor.name}, the ${actor.role}, avoids a surviving ${threat.label.toLowerCase()} within 16 m of the required route.`,completion:'Disable the specific route threat; carrier/work access resumes',preconditions:['Reach and pulse the surviving sentry'],capabilities:['pulse sentry'],route:planRoute(p,home.nodeId,target,ctx.defeated,false)??[]},8);
  }
 }
 for(const j of c.jobs){if(terminal(j))continue;
  if(jobDone(c,p,ctx,j)){j.status=j.accepted&&j.playerContribution?'completed':'resolved';j.resolvedAt=c.elapsed;j.failureReason=null;if(j.status==='resolved')j.reservedReward=0;continue;}
  let feasible=true;
  if(j.kind==='repair'){const w=p.workplaces.find(w=>w.id===j.targetId)!;feasible=ctx.recoverableScrap>=w.repairCost||c.materials>=w.repairCost;}
  if(j.kind==='water')feasible=c.sourceRepaired||ctx.networkWorking||ctx.caveSupply?.available===true||ctx.recoverableScrap>=3&&ctx.recoverableCore>=1||ctx.recoverableWater*4+(ctx.caveSupply?.connected?c.depot:0)+c.agents.filter(a=>p.agents.find(d=>d.id===a.id)!.homeId===j.targetId).reduce((n,a)=>n+a.cargo,0)>=6-c.settlements.find(s=>s.id===j.targetId)!.reserve;
  j.status=feasible?(j.accepted?'accepted':'offered'):'blocked';j.failureReason=feasible?null:'Waiting for sufficient deliverable water or a restored supply';
 }
 reconcileWaterRequests(c,p);
}
export function reconcileCausal(state:CausalState,ctx:CausalContext):CausalState {const next=clone(state);reconcile(next,ctx);return JSON.stringify(next)===JSON.stringify(state)?state:next;}
function contribute(c:CausalState,kind:CausalJob['kind'],targetId?:string,evidence:CausalJob['playerEvidence'][number]=kind==='repair'?'repair':'pulse'){for(const j of c.jobs)if(j.accepted&&!terminal(j)&&j.kind===kind&&(!targetId||j.targetId===targetId)){j.playerContribution=true;if(!j.playerEvidence.includes(evidence))j.playerEvidence.push(evidence);}}
/** Called only after the authoritative world reducer succeeds, never from a display log. */
export function noteCausalWorldAction(state:CausalState,ctx:CausalContext,action:{kind:'source'|'network'|'defeat';targetId?:string}):CausalState {
 const c=clone(state);if(action.kind==='source'){c.sourceRepaired=true;contribute(c,'water',undefined,'intake');}if(action.kind==='network'){if(!c.networkEverWorking)contribute(c,'water',undefined,'network');c.networkEverWorking=true;}if(action.kind==='defeat')contribute(c,'clear-route',action.targetId);reconcile(c,ctx);return c;
}
function near(ctx:CausalContext,p:Vec3){const valley=worldValley(ctx.seed);return ctx.zone==='valley'&&ctx.player.hp>0&&Math.hypot(ctx.player.x-p.x,ctx.player.z-p.z,valleySurfaceHeight(valley,ctx.player.x,ctx.player.z)-p.y)<=3.5;}
export function applyCausalCommand(state:CausalState,ctx:CausalContext,command:CausalCommand):{state:CausalState;inventory:CausalContext['inventory'];message:string} {
 const unchanged={state,inventory:ctx.inventory,message:''},p=causalPlan(ctx.seed);if(ctx.zone!=='valley'||ctx.player.hp<=0)return unchanged;
 const c=clone(state),inventory={...ctx.inventory};let message='';
 if(command.type==='accept'||command.type==='claim'){
  const j=c.jobs.find(j=>j.id===command.id);if(!j)return unchanged;const home=p.settlements.find(s=>s.id===j.settlementId)!;if(!near(ctx,home.position))return unchanged;
  if(command.type==='accept'){if(j.status!=='offered')return unchanged;j.accepted=true;j.status='accepted';message=`Accepted: ${j.title}. Only your contribution earns its reward.`;}
  else{if(j.status!=='completed'||!j.accepted||!j.playerContribution)return unchanged;j.status='claimed';j.reservedReward=0;c.renown+=j.reward;message=`${j.title}: ${j.reward} community renown claimed once.`;}
 }else if(command.type==='deliver-water'){
  const s=c.settlements.find(s=>s.id===command.settlementId),def=p.settlements.find(s=>s.id===command.settlementId);if(!s||!def||!near(ctx,def.position)||inventory.water<1||s.reserve>def.capacity-4+EPS)return unchanged;
  inventory.water--;c.playerSpent.water++;c.playerWater+=4;s.reserve+=4;s.delivered+=4;s.playerDelivered+=4;contribute(c,'water',s.id,'delivery');message=`Delivered one canister: 4 L added to ${def.name}'s actual household reserve.`;
 }else if(command.type==='repair-workplace'){
  const w=c.workplaces.find(w=>w.id===command.workplaceId),def=p.workplaces.find(w=>w.id===command.workplaceId);if(!w||!def||w.operational||!near(ctx,def.position)||inventory.scrap<def.repairCost)return unchanged;
  inventory.scrap-=def.repairCost;c.playerSpent.scrap+=def.repairCost;w.operational=true;w.repairedBy='player';contribute(c,'repair',w.id);message=`${def.name} repaired. ${def.repairCost} scrap consumed; its caretaker can return to work.`;
 }else{
  if(c.sourceRepaired||!near(ctx,p.source.position)||inventory.scrap<3||inventory.core<1)return unchanged;
  inventory.scrap-=3;inventory.core--;c.playerSpent.scrap+=3;c.playerSpent.core++;c.sourcePaid=true;c.sourceRepaired=true;contribute(c,'water',undefined,'intake');message='Intake repaired with 3 scrap and 1 core. Household carriers can draw from its live reserve.';
 }
 reconcile(c,{...ctx,inventory});return {state:c,inventory,message};
}
function takeWater(c:CausalState,s:CausalState['settlements'][number],litres:number){const n=Math.min(s.reserve,litres);s.reserve-=n;s.consumed+=n;return n;}
function beginTask(a:AgentState,kind:NonNullable<AgentState['task']>['kind'],targetId:string){if(a.task?.kind===kind&&a.task.targetId===targetId)return;a.task={kind,targetId};a.workTime=0;}
function destination(p:CausalPlan,a:AgentState){const task=a.task!;if(task.kind==='fetch')return p.source.nodeId;if(task.kind==='work'||task.kind==='repair')return p.workplaces.find(w=>w.id===task.targetId)!.nodeId;return p.settlements.find(s=>s.id===task.targetId)!.nodeId;}
function moveAgent(a:AgentState,p:CausalPlan,ctx:CausalContext):boolean {
 const target=destination(p,a);
 if(a.nodeId===target&&!a.route.length)return true;
 if(!a.route.length){const route=planRoute(p,a.nodeId,target,ctx.defeated);if(!route){a.status='Waiting: required route threatened';return false;}a.route=route;a.routeIndex=0;a.waypoint=0;}
 let budget=2.6*CAUSAL_STEP;
 // A movement slice has a strict loop budget even for coincident waypoint positions.
 for(let visit=0;visit<32&&a.route.length;visit++){
  const from=a.route[a.routeIndex]!,to=a.route[a.routeIndex+1];if(!to){a.nodeId=from;a.route=[];a.routeIndex=0;a.waypoint=0;return a.nodeId===target;}
  const edge=p.routes.find(r=>r.from===from&&r.to===to||r.to===from&&r.from===to)!;
  if(routeThreats(p,edge,ctx.defeated).length){a.status='Waiting: sentry blocks this route';return false;}
  const points=edge.from===from?edge.points:[...edge.points].reverse(),point=points[a.waypoint];
  if(!point){a.nodeId=to;a.routeIndex++;a.waypoint=0;continue;}
  const distance=dist(a.position,point);if(distance<=budget+EPS){a.position={...point};budget-=distance;a.waypoint++;if(budget<=EPS)return false;continue;}
  const t=budget/distance;a.position={x:a.position.x+(point.x-a.position.x)*t,y:a.position.y+(point.y-a.position.y)*t,z:a.position.z+(point.z-a.position.z)*t};a.fatigue=Math.min(100,a.fatigue+.015);return false;
 }return false;
}
function agentStep(c:CausalState,p:CausalPlan,ctx:CausalContext,a:AgentState){
 const def=p.agents.find(d=>d.id===a.id)!,home=c.settlements.find(s=>s.id===def.homeId)!,homeDef=p.settlements.find(s=>s.id===def.homeId)!;
 a.thirst=Math.min(100,a.thirst+.0225);a.fatigue=Math.min(100,a.fatigue+.008);
 // Finish a route before replanning: physical position cannot jump back to a graph node.
 if(!a.route.length){
  if(a.cargo>EPS)beginTask(a,'deliver',home.id);
  else if(a.thirst>55&&home.reserve>=1)beginTask(a,'drink',home.id);
  // Hysteresis: a tired resident finishes resting at home (down to 30) instead of
  // stopping at the 70 threshold, walking out, and immediately turning back.
  else if(a.fatigue>70||a.fatigue>30&&a.task?.kind==='rest'&&a.nodeId===homeDef.nodeId)beginTask(a,'rest',home.id);
  else if(def.role==='carrier')beginTask(a,home.reserve<14?'fetch':'rest',home.id);
  else if(def.role==='caretaker')beginTask(a,'work',def.workplaceId!);
  else{
   const work=p.workplaces.find(w=>p.agents.some(worker=>worker.workplaceId===w.id)&&!c.workplaces.find(x=>x.id===w.id)!.operational&&c.materials>=w.repairCost&&planRoute(p,a.nodeId,w.nodeId,ctx.defeated));
   if(work)beginTask(a,'repair',work.id);else beginTask(a,'rest',home.id);
  }
 }
 if(!a.task)return;const kind=a.task.kind;
 a.status=`Walking to ${kind==='fetch'?'the intake':kind==='deliver'?'deliver water':kind==='repair'?'repair a workshop':kind==='work'?'the workplace':kind}`;
 if(!moveAgent(a,p,ctx))return;
 if(kind==='fetch'){
  const load=def.carryCapacity!;if(c.depot<load-EPS){a.status=c.sourceRepaired||ctx.networkWorking||ctx.caveSupply?.available?`Waiting for ${load} L at the intake`:'Waiting for intake repair, modular overflow or cave outfall';return;}
  takeCaveCargo(c,a.id,load);c.depot-=load;a.cargo=load;a.status=`Collected ${load} L; returning home`;a.task=null;
 }else if(kind==='deliver'){
  const amount=Math.min(a.cargo,homeDef.capacity-home.reserve);deliverCaveCargo(c,a.id,home.id,amount,a.cargo);home.reserve+=amount;home.delivered+=amount;a.cargo-=amount;a.status=amount>EPS?'Delivered water; households supplied':'Waiting for reserve capacity';if(a.cargo<EPS){a.cargo=0;a.task=null;}
 }else if(kind==='drink'){
  if(takeWater(c,home,1)>1-EPS){a.thirst=Math.max(0,a.thirst-50);a.status='Drinking from the household reserve';}a.task=null;
 }else if(kind==='rest'){
  a.fatigue=Math.max(0,a.fatigue-.3);a.status=def.role==='builder'&&c.workplaces.some(w=>!w.operational)?'Resting; needs materials or a safe repair route':'Resting at home';
 }else if(kind==='repair'){
  const w=c.workplaces.find(w=>w.id===a.task!.targetId)!,wd=p.workplaces.find(w=>w.id===a.task!.targetId)!;
  if(w.operational||c.materials<wd.repairCost){a.task=null;a.workTime=0;return;}
  a.workTime+=CAUSAL_STEP;a.status=`Repairing ${wd.name}`;
  if(a.workTime>=8){c.materials-=wd.repairCost;c.agentMaterialsSpent+=wd.repairCost;w.operational=true;w.repairedBy='agent';a.workTime=0;a.task=null;}
 }else{
  const w=c.workplaces.find(w=>w.id===a.task!.targetId)!;
  if(!w.operational){a.status='Waiting: workplace mechanism damaged';return;}
  if(home.reserve<.015-EPS){a.status='Waiting: household water needed for work';return;}
  const used=takeWater(c,home,.015);w.service+=used/.06;a.fatigue=Math.min(100,a.fatigue+.018);a.status='Working: water supports workshop service';
 }
}
export function advanceCausal(state:CausalState,ctx:CausalContext,dt:number):CausalState {
 if(!Number.isFinite(dt)||dt<=0||ctx.player.hp<=0)return state;
 const c=clone(state);c.accumulator+=Math.min(dt,1);const p=causalPlan(ctx.seed);
 for(let step=0;step<4&&c.accumulator>=CAUSAL_STEP-EPS;step++){
  c.accumulator=Math.max(0,c.accumulator-CAUSAL_STEP);c.elapsed+=CAUSAL_STEP;
  // An out-of-zone visit uses the identical bounded quarter-second ledger and planner.
  // Menus/background never invoke tick; there is no wall-clock/offline catch-up.
  const river=c.sourceRepaired?Math.min(.5*CAUSAL_STEP,20-c.depot):0;c.depot+=river;c.extracted+=river;
  const fresh=Math.max(0,ctx.networkOverflow-c.networkSeen),overflow=Math.min(fresh,20-c.depot);c.depot+=overflow;c.networkCaptured+=overflow;c.networkDiscarded+=fresh-overflow;c.networkSeen=ctx.networkOverflow;
  for(const a of c.agents)agentStep(c,p,ctx,a);
  reconcile(c,ctx);
 }
 return c;
}
export function causalView(c:CausalState,ctx:CausalContext){return {plan:causalPlan(ctx.seed),state:c,source:c.sourceRepaired?'Repaired intake':ctx.networkWorking?'Modular overflow':ctx.caveSupply?.available?'Cave outfall diversion':'No active source',policy:'Quarter-second simulation across all zones; paused in menus/background; no offline catch-up'};}

function segmentDistance(point:Vec3,a:Vec3,b:Vec3){const dx=b.x-a.x,dz=b.z-a.z,dy=b.y-a.y,den=dx*dx+dz*dz+dy*dy,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz+(point.y-a.y)*dy)/(den||1)));return Math.hypot(point.x-a.x-t*dx,point.z-a.z-t*dz,point.y-a.y-t*dy);}
function object(x:unknown):x is Record<string,unknown>{return !!x&&typeof x==='object'&&!Array.isArray(x);}
function bounded(x:unknown,max=1e9){return typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=max;}
function exactIds(values:unknown,ids:string[]):values is {id:string}[]{return Array.isArray(values)&&values.length===ids.length&&values.every((v,i)=>object(v)&&v.id===ids[i]);}
/** Strict identities, durable episode predicates and conservative material/water/reward ledgers. */
export function validCausal(value:unknown,ctx:CausalContext):value is CausalState {try{return validateCausal(value,ctx);}catch{return false;}}
function validateCausal(value:unknown,ctx:CausalContext):value is CausalState {
 if(!object(value)||value.version!==1)return false;const c=value as unknown as CausalState,p=causalPlan(ctx.seed);
 if(c.manifestHash!==CAUSAL_HASH||c.planId!==p.id||!bounded(c.elapsed)||!bounded(c.accumulator,CAUSAL_STEP+EPS)||typeof c.sourceRepaired!=='boolean'||typeof c.sourcePaid!=='boolean'||typeof c.networkEverWorking!=='boolean')return false;
 if(!exactIds(c.agents,p.agents.map(a=>a.id))||!exactIds(c.settlements,p.settlements.map(s=>s.id))||!exactIds(c.workplaces,p.workplaces.map(w=>w.id)))return false;
 if(!['depot','extracted','networkCaptured','networkSeen','networkDiscarded','networkBaseline','playerWater','materials','agentMaterialsSpent','renown'].every(k=>bounded((c as unknown as Record<string,unknown>)[k]))||c.depot>20+EPS||c.networkSeen>ctx.networkOverflow+EPS||Math.abs(c.networkCaptured+c.networkDiscarded+c.networkBaseline-c.networkSeen)>1e-5||!object(c.playerSpent)||!['scrap','core','water'].every(k=>Number.isSafeInteger(c.playerSpent[k as keyof typeof c.playerSpent])&&c.playerSpent[k as keyof typeof c.playerSpent]>=0))return false;
 if(Object.hasOwn(c,'commonsTrade')&&!validCommonsTrade(c.commonsTrade,ctx.seed,c))return false;
 if(c.materials+c.agentMaterialsSpent+(c.commonsTrade?.revision??0)!==p.initialMaterials||c.playerWater!==c.playerSpent.water*4||c.sourceRepaired!==(c.sourcePaid||ctx.historicalPumpRepaired))return false;
 for(const [i,s]of c.settlements.entries()){if(!bounded(s.reserve,20+EPS)||!bounded(s.delivered)||!bounded(s.playerDelivered,s.delivered)||s.playerDelivered%4!==0||!bounded(s.consumed)||typeof s.relief!=='boolean'||Math.abs(s.reserve+s.consumed-p.settlements[i]!.initialWater-s.delivered)>1e-5)return false;}
 let repairPlayer=0,repairAgent=0;
 for(const [i,w]of c.workplaces.entries()){const def=p.workplaces[i]!;if(typeof w.operational!=='boolean'||!bounded(w.service)||!['initial','player','agent',null].includes(w.repairedBy)||w.operational!==(w.repairedBy!==null)||def.initiallyOperational!==(w.repairedBy==='initial'))return false;if(w.repairedBy==='player')repairPlayer+=def.repairCost;if(w.repairedBy==='agent')repairAgent+=def.repairCost;}
 if(c.settlements.some(home=>c.workplaces.filter(w=>p.workplaces.find(d=>d.id===w.id)!.settlementId===home.id).reduce((sum,w)=>sum+w.service*.06,0)>home.consumed+1e-5)||c.settlements.reduce((sum,s)=>sum+s.playerDelivered,0)!==c.playerWater)return false;
 if(repairAgent!==c.agentMaterialsSpent||repairPlayer+(c.sourcePaid?3:0)!==c.playerSpent.scrap||(c.sourcePaid?1:0)!==c.playerSpent.core)return false;
 for(const a of c.agents){
  if(!object(a.position)||!['x','y','z'].every(k=>typeof a.position[k as keyof Vec3]==='number'&&Number.isFinite(a.position[k as keyof Vec3]))||Math.abs(a.position.x)>80||Math.abs(a.position.z)>80||!p.nodes.some(n=>n.id===a.nodeId)||typeof a.status!=='string'||a.status.length>180||!bounded(a.thirst,100)||!bounded(a.fatigue,100)||!bounded(a.cargo,(p.agents.find(d=>d.id===a.id)!.carryCapacity??0)+EPS)||!bounded(a.workTime,8+EPS)||!Array.isArray(a.route)||a.route.length>p.nodes.length||!Number.isInteger(a.routeIndex)||a.routeIndex<0||a.routeIndex>=Math.max(1,a.route.length)||!Number.isInteger(a.waypoint)||a.waypoint<0||a.waypoint>1200)return false;
  const definition=p.agents.find(d=>d.id===a.id)!;
  if(a.cargo>EPS&&definition.role!=='carrier')return false;
  if(a.task!==null&&(!object(a.task)||!['drink','rest','work','fetch','deliver','repair'].includes(a.task.kind)||!p.settlements.some(s=>s.id===a.task!.targetId)&&!p.workplaces.some(w=>w.id===a.task!.targetId)))return false;
  if(a.task){const t=a.task;if(['drink','rest','fetch','deliver'].includes(t.kind)&&t.targetId!==definition.homeId||['fetch','deliver'].includes(t.kind)&&definition.role!=='carrier'||t.kind==='work'&&(definition.role!=='caretaker'||t.targetId!==definition.workplaceId)||t.kind==='repair'&&(definition.role!=='builder'||!p.workplaces.some(w=>w.id===t.targetId)))return false;}
  if(a.route.length){if(!a.task||a.route[a.routeIndex]!==a.nodeId||a.route.some(n=>!p.nodes.some(x=>x.id===n))||routeEdges(p,a.route).some(e=>!e))return false;const edge=routeEdges(p,a.route)[a.routeIndex];if(edge&&a.waypoint>edge.points.length)return false;if(a.route.at(-1)!==destination(p,a))return false;
   if(edge){const points=edge.from===a.nodeId?edge.points:[...edge.points].reverse(),index=Math.min(a.waypoint,points.length-1),end=points[index]!,start=points[Math.max(0,index-1)]!;if(segmentDistance(a.position,start,end)>.03)return false;}
  }else{const node=p.nodes.find(n=>n.id===a.nodeId)!;if(segmentDistance(a.position,node.position,node.position)>.03)return false;}
 }
 const initial=p.settlements.reduce((n,s)=>n+s.initialWater,0),remaining=c.depot+c.agents.reduce((n,a)=>n+a.cargo,0)+c.settlements.reduce((n,s)=>n+s.reserve+s.consumed,0);
 if(Math.abs(initial+c.extracted+c.networkCaptured+c.playerWater+(c.caveReceipts?.received??0)-remaining)>1e-5)return false;
 if(!Array.isArray(c.jobs)||c.jobs.length>p.workplaces.length+p.settlements.length+p.threats.length||new Set(c.jobs.map(j=>j.id)).size!==c.jobs.length)return false;
 for(const j of c.jobs){
  if(!object(j)||!['water','repair','clear-route'].includes(j.kind)||!['offered','accepted','completed','resolved','claimed','blocked'].includes(j.status)||!p.agents.some(a=>a.id===j.issuerId)||!p.settlements.some(s=>s.id===j.settlementId)||typeof j.accepted!=='boolean'||typeof j.playerContribution!=='boolean'||!Number.isInteger(j.reward)||!bounded(j.reward,10)||!Number.isInteger(j.reservedReward)||!bounded(j.reservedReward,10)||j.reservedReward!==(j.status==='claimed'||j.status==='resolved'?0:j.reward)||!bounded(j.createdAt,c.elapsed)||j.expiresAt!==null||j.failureReason!==null&&typeof j.failureReason!=='string'||!Array.isArray(j.route)||j.route.some(n=>!p.nodes.some(x=>x.id===n))||!['title','cause','completion'].every(k=>typeof j[k as 'title']==='string'&&j[k as 'title'].length<600)||!['preconditions','capabilities'].every(k=>Array.isArray(j[k as 'preconditions'])&&j[k as 'preconditions'].length<=8&&j[k as 'preconditions'].every(x=>typeof x==='string'&&x.length<300)))return false;
  if(j.kind==='water'){const home=p.settlements.find(s=>s.id===j.targetId);if(!home||home.initialWater>=6||j.settlementId!==home.id||j.issuerId!==homeIssuer(p,home.id))return false;}
  if(j.kind==='repair'){const work=p.workplaces.find(w=>w.id===j.targetId);if(!work||work.initiallyOperational||j.settlementId!==work.settlementId||j.issuerId!==homeIssuer(p,work.settlementId)||!p.agents.some(a=>a.workplaceId===work.id))return false;}
  if(j.kind==='clear-route'){const issuer=p.agents.find(a=>a.id===j.issuerId)!;if(issuer.homeId!==j.settlementId||!routeEdges(p,j.route).some(edge=>edge&&routeThreats(p,edge,[]).some(t=>t.id===j.targetId)))return false;}
  if(!Array.isArray(j.playerEvidence)||j.playerEvidence.length>(j.playerEvidence.includes('cave')?4:3)||new Set(j.playerEvidence).size!==j.playerEvidence.length||j.playerContribution!==(j.playerEvidence.length>0)||j.status==='resolved'&&j.playerContribution)return false;
  for(const evidence of j.playerEvidence){if(evidence==='delivery'){if(j.kind!=='water'||!c.settlements.find(s=>s.id===j.targetId)!.playerDelivered)return false;}else if(evidence==='intake'){if(j.kind!=='water'||!c.sourceRepaired)return false;}else if(evidence==='network'){if(j.kind!=='water'||!c.networkEverWorking)return false;}else if(evidence==='cave'){if(j.kind!=='water'||!c.caveReceipts?.credits.some(x=>x.jobId===j.id))return false;}else if(evidence==='repair'){if(j.kind!=='repair'||c.workplaces.find(w=>w.id===j.targetId)!.repairedBy!=='player')return false;}else if(evidence==='pulse'){if(j.kind!=='clear-route'||!ctx.defeated.includes(j.targetId))return false;}else return false;}
  const expected=j.kind==='water'?`${p.id}/episode/water/${p.settlements.find(s=>s.id===j.targetId)?.nodeId}`:j.kind==='repair'?`${p.id}/episode/repair/${p.workplaces.find(w=>w.id===j.targetId)?.nodeId}`:`${p.id}/episode/access/${j.targetId}`;
  if(j.id!==expected||j.kind==='clear-route'&&!p.threats.some(t=>t.id===j.targetId)||['completed','claimed'].includes(j.status)&&(!j.accepted||!j.playerContribution)||terminal(j)!==(j.resolvedAt!==null)||j.resolvedAt!==null&&!bounded(j.resolvedAt,c.elapsed)||j.status==='accepted'&&!j.accepted||j.playerContribution&&!j.accepted)return false;
  if(terminal(j)&&!(j.kind==='water'?c.settlements.find(s=>s.id===j.targetId)?.relief:jobDone(c,p,ctx,j)))return false;
 }
 if(!validCaveReceipts(c,ctx))return false;
 if(Object.hasOwn(c,'waterRequests')&&!validWaterRequests(c.waterRequests,ctx.seed,c))return false;
 if(c.renown!==waterRequestRenown(c)+c.jobs.filter(j=>j.status==='claimed').reduce((n,j)=>n+j.reward,0))return false;
 if(p.settlements.some(s=>waterRequestLiability(c,s.id)+c.jobs.filter(j=>j.settlementId===s.id).reduce((n,j)=>n+(j.status==='claimed'?j.reward:j.reservedReward),0)>s.rewardBudget))return false;
 return true;
}
