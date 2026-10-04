import {regionalTradeRoadWeather,regionalTradeWeatherMetres,regionalTradeWeatherArrival,REGIONAL_TRADE_MIN_SPEED} from './regional-trade-weather.ts';
import {REGIONAL_WEATHER_PERIOD_TICKS} from './regional-weather.ts';
import {regionalClockAdvance,regionalClockAdd,regionalClockDifference} from './regional-clock.ts';
import {regionalPlan,regionalHeight,regionalBiomeAt,type RegionalBiomeId,type RegionalBox,type RegionalSite} from './regional-world.ts';
import {regionalRoute,type RegionalRoute} from './regional-routes.ts';
import type {WildernessIdentity} from './wilderness-state.ts';
import type {WildernessObstacle} from './wilderness-geometry.ts';
import type {Vec3} from './procedural.ts';

/** A finite regional overlay. Never reads, spends or credits the wilderness harvest ledger. */
export const REGIONAL_TRADE_STEP=.25;
export const REGIONAL_TRADE_MAX_DT=1;
export const REGIONAL_TRADE_SPEED=1.8;
export const REGIONAL_TRADE_REACH=3;
export const REGIONAL_TRADE_MAX_TICKS=1_000_000_000;
export const REGIONAL_TRADE_MAX_REVISION=15;
export const REGIONAL_TRADE_REPAIR_TICKS=48;
export const REGIONAL_TRADE_BUILD_TICKS=64;
export type RegionalTradeMaterial='quarry-stone'|'deadwood-timber';
export type RegionalTradeSourceKind='quarry'|'forestry';
export type RegionalTradeActivity='idle'|'loading'|'outbound'|'blocked'|'unloading'|'returning'|'finished';
export interface RegionalTradeSourceTemplate {id:string;kind:RegionalTradeSourceKind;material:RegionalTradeMaterial;name:string;geology:string;deposit:number;stockCapacity:number;productionTicks:number;biomes:RegionalBiomeId[]}
export interface RegionalTradeSourcePlan {id:string;siteId:string;name:string;templateId:string;kind:RegionalTradeSourceKind;material:RegionalTradeMaterial;biome:RegionalBiomeId;ownerChunk:string;position:Vec3;interactionPosition:Vec3;workerPosition:Vec3;deposit:number;stockCapacity:number;productionTicks:number;description:string}
export interface RegionalTradeProjectPlan {id:string;siteId:string;name:string;ownerChunk:string;position:Vec3;interactionPosition:Vec3;workerPosition:Vec3;material:RegionalTradeMaterial;cost:number;baseCapacity:number;capacity:number;workTicks:number;benefit:string}
export interface RegionalTradeRoutePlan {id:string;name:string;from:string;to:string;sourceId:string;projectId:string;carrierId:string;carrierName:string;material:RegionalTradeMaterial;cargoCapacity:number;speed:number;roadIds:string[];points:Vec3[];surfaceMetres:number;horizontalMetres:number;maxGrade:number;travelSeconds:number;canonicalRoute:RegionalRoute;obstruction:{id:string;kind:'fallen-cart'|'washed-freight-bed';name:string;description:string;position:Vec3;interactionPosition:Vec3;distance:number;repairTicks:number}}
export interface RegionalTradePlan {version:1;seed:number;sources:RegionalTradeSourcePlan[];projects:RegionalTradeProjectPlan[];routes:RegionalTradeRoutePlan[];budget:{sources:3;routes:3;carriers:3;maxReceipts:15;maxMaterialUnits:36;maxSavedBytes:18000}}
export interface RegionalTradeRouteState {id:string;sourceStartedAt:number|null;remaining:number;stock:number;productionNextAt:number|null;reserved:number;cargo:number;activity:RegionalTradeActivity;activityStartedAt:number;nextEventAt:number|null;distance:number;legStartDistance:number;delivered:number;destinationStock:number;embodied:number;withdrawn:number;repairStartedAt:number|null;clearedAt:number|null;buildStartedAt:number|null;builtAt:number|null;shipments:number}
export type RegionalTradeCommand={type:'start-source'|'clear-route'|'build-store'|'withdraw-reserve';targetId:string;expectedRevision:number};
export interface RegionalTradeReceipt {revision:number;tick:number;type:RegionalTradeCommand['type'];targetId:string}
export type RegionalTradeVersion=1|2;
export interface RegionalTradeState {version:RegionalTradeVersion;seed:number;revision:number;ticks:number;remainder:number;routes:RegionalTradeRouteState[];receipts:RegionalTradeReceipt[]}
/** Food-owned temporal witnesses; these never extend or migrate the V32 save schema. */
export interface RegionalTradeTimelinePoint {ticks:number;remainder:number}
export type RegionalTradeTimelineEvent=({type:'command';command:Pick<RegionalTradeCommand,'type'|'targetId'>}|{type:'rebase'})&RegionalTradeTimelinePoint;
export interface RegionalTradeContext extends WildernessIdentity {zone:string;player:{x:number;z:number;hp:number};feetY?:number;grounded?:boolean}
export interface RegionalTradeSummary {routeId:string;name:string;sourceId:string;projectId:string;sourceName:string;destinationName:string;material:RegionalTradeMaterial;phase:'planned'|'producing'|'shortage'|'blocked'|'repairing'|'in-transit'|'ready'|'building'|'operational'|'exhausted';cause:string;benefit:string;remaining:number;stock:number;reserved:number;cargo:number;delivered:number;destinationStock:number;embodied:number;withdrawn:number;missing:number;capacity:number;deposit:number;productionProgress:number;repairProgress:number;workProgress:number;carrierActivity:RegionalTradeActivity;distance:number;surfaceMetres:number;travelSeconds:number;etaSeconds:number|null;travelRule:'legacy'|'regional';roadWetness:number;travelSpeed:number;travelCondition:'dry'|'wet'|'drying';etaKind:'arrival'|'repair-required'|'none';jobId:string;jobTitle:string}
export interface RegionalTradeInteraction {id:string;targetId:string;routeId:string;kind:RegionalTradeCommand['type'];label:string;description:string;position:Vec3;enabled:boolean;reason:string;command:RegionalTradeCommand}
export interface RegionalTradeActorPose {id:string;routeId:string;siteId:string;name:string;kind:'producer'|'carrier'|'repairer'|'builder';position:Vec3;yaw:number;activity:string;carrying:number;material:RegionalTradeMaterial;progress:number;distance:number;direction:number;speed:number}

const EPS=1e-7,LOAD_TICKS=12,UNLOAD_TICKS=12;
const q=(n:number)=>Math.round(n*1e6)/1e6;
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
function freeze<T>(value:T):T {if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
const certified=new WeakSet<RegionalTradeState>(),plans=new Map<number,RegionalTradePlan>();
function seal(s:RegionalTradeState){freeze(s);certified.add(s);return s;}
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const horizontal=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.z-b.z);
export const REGIONAL_TRADE_SOURCE_TEMPLATES:readonly RegionalTradeSourceTemplate[]=freeze([
 {id:'meadow-surface-seam',kind:'quarry',material:'quarry-stone',name:'Surface-seam quarry',geology:'A surveyed shallow geological seam, separately recorded from loose wilderness stone',deposit:12,stockCapacity:8,productionTicks:16,biomes:['meadow','river-wetland','valley']},
 {id:'pine-deadwood-depot',kind:'forestry',material:'deadwood-timber',name:'Deadwood sorting depot',geology:'Twelve surveyed fallen-timber units in a finite depot; standing trees and player deadwood sources are untouched',deposit:12,stockCapacity:8,productionTicks:20,biomes:['pine-highlands']},
 {id:'redstone-cutting-seam',kind:'quarry',material:'quarry-stone',name:'Redstone cutting quarry',geology:'A finite redstone seam surveyed on the upland landmark pad',deposit:12,stockCapacity:8,productionTicks:24,biomes:['redstone-uplands','windward-heath']},
]);
function segmentDistance(p:Vec3,a:Vec3,b:Vec3){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}
function pathStats(points:Vec3[]){let surfaceMetres=0,horizontalMetres=0,maxGrade=0;for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,h=horizontal(a,b);surfaceMetres+=distance(a,b);horizontalMetres+=h;if(h>EPS)maxGrade=Math.max(maxGrade,Math.abs(a.y-b.y)/h);}return {surfaceMetres:q(surfaceMetres),horizontalMetres:q(horizontalMetres),maxGrade};}
const pathLengths=new WeakMap<Vec3[],Float64Array>();
/** Cached cumulative length makes far-actor metadata O(log route points), with no terrain query. */
function poseOnPath(points:Vec3[],at:number,direction=1){
 let lengths=pathLengths.get(points);if(!lengths){lengths=new Float64Array(points.length);for(let i=1;i<points.length;i++)lengths[i]=lengths[i-1]!+distance(points[i-1]!,points[i]!);pathLengths.set(points,lengths);}
 let lo=1,hi=points.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(lengths[mid]!<at-EPS)lo=mid+1;else hi=mid;}
 const a=points[Math.max(0,lo-1)]!,b=points[lo]??a,start=lengths[Math.max(0,lo-1)]!,d=(lengths[lo]??start)-start,t=Math.max(0,Math.min(1,(at-start)/(d||1)));
 return {position:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},yaw:Math.atan2((b.x-a.x)*direction,(b.z-a.z)*direction)};
}
function sampledLeg(seed:number,from:Vec3,to:Vec3){const count=Math.max(1,Math.ceil(horizontal(from,to)));return Array.from({length:count+1},(_,i)=>{const t=i/count,x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t;return {x,y:regionalHeight(seed,x,z),z};});}
/** Deterministic free sectors of the already reserved 25 m landmark pad. No terrain reseed. */
function utilityPads(seed:number,site:RegionalSite,count:number){
 const region=regionalPlan(seed),shelter={x:site.position.x+site.structureOffset.x,y:site.position.y,z:site.position.z+site.structureOffset.z},chosen:{position:Vec3;interactionPosition:Vec3;workerPosition:Vec3}[]=[];
 const nearby=region.roads.flatMap(r=>r.points.slice(1).map((b,i)=>({a:r.points[i]!,b,width:r.width}))).filter(r=>segmentDistance(site.position,r.a,r.b)<42);
 for(let n=0;n<count;n++){
  let best:{score:number;position:Vec3;interactionPosition:Vec3;workerPosition:Vec3}|undefined;
  for(let i=0;i<72;i++){
   const angle=i*Math.PI*2/72,dx=Math.cos(angle),dz=Math.sin(angle),point=(radius:number):Vec3=>({x:q(site.position.x+dx*radius),y:site.position.y,z:q(site.position.z+dz*radius)}),position=point(18),interactionPosition=point(14.5),workerPosition=point(15.6);
   const roadClear=Math.min(...nearby.map(r=>segmentDistance(position,r.a,r.b)-r.width/2));
   const oldClear=Math.hypot(Math.max(0,Math.abs(position.x-shelter.x)-5.7),Math.max(0,Math.abs(position.z-shelter.z)-4.8));
   const otherClear=chosen.length?Math.min(...chosen.map(p=>horizontal(position,p.position))):30;
   const routeClear=segmentDistance(shelter,site.position,interactionPosition);
   // Footprints fit the guaranteed empty pad; radial access cannot cross the old shelter.
   if(roadClear<3.4||oldClear<3.4||otherClear<7||routeClear<8)continue;
   if(chosen.some(p=>segmentDistance(p.position,site.position,interactionPosition)<3.4||segmentDistance(position,site.position,p.interactionPosition)<3.4))continue;
   const score=Math.min(roadClear,oldClear,otherClear/1.5,routeClear)-i*1e-8;
   if(!best||score>best.score)best={score,position,interactionPosition,workerPosition};
  }
  if(!best)throw new Error(`No safe regional freight pad at ${site.id}`);
  chosen.push({position:best.position,interactionPosition:best.interactionPosition,workerPosition:best.workerPosition});
 }
 return chosen;
}
/** Macro-only metadata and bounded sampled road graph. Cached without feature/chunk generation. */
export function regionalTradePlan(seed:number):RegionalTradePlan {
 const prior=plans.get(seed);if(prior){plans.delete(seed);plans.set(seed,prior);return prior;}
 const region=regionalPlan(seed),outposts=region.sites.filter(s=>s.kind==='outpost'),alder=outposts[0]!,pine=outposts[1]!,north=outposts[4]!,ember=outposts[5]!;
 const definitions=[{from:alder,to:pine,template:REGIONAL_TRADE_SOURCE_TEMPLATES[0]!,name:'Alder stone to Pinewatch',carrier:'Mara',obstruction:'washed-freight-bed' as const},{from:pine,to:alder,template:REGIONAL_TRADE_SOURCE_TEMPLATES[1]!,name:'Pinewatch timber to Alder',carrier:'Ash',obstruction:'washed-freight-bed' as const},{from:ember,to:north,template:REGIONAL_TRADE_SOURCE_TEMPLATES[2]!,name:'Redstone freight to Northreach',carrier:'Rin',obstruction:'washed-freight-bed' as const}];
 const allPads=new Map(region.sites.map(s=>[s.id,utilityPads(seed,s,definitions.filter(d=>d.from.id===s.id||d.to.id===s.id).length)])),used=new Map<string,number>();
 const pad=(site:RegionalSite)=>{const index=used.get(site.id)??0;used.set(site.id,index+1);return allPads.get(site.id)![index]!;};
 const sources:RegionalTradeSourcePlan[]=[],projects:RegionalTradeProjectPlan[]=[],routes:RegionalTradeRoutePlan[]=[];
 for(let i=0;i<definitions.length;i++){
  const d=definitions[i]!,a=pad(d.from),b=pad(d.to),prefix=`region:1:${seed}/trade/${i}`,t=d.template,sourceId=prefix+'/source',projectId=prefix+'/freight-store';
  sources.push({id:sourceId,siteId:d.from.id,name:`${d.from.name.split(' ')[0]} ${t.kind==='quarry'?'Quarry':'Deadwood Depot'}`,templateId:t.id,kind:t.kind,material:t.material,biome:regionalBiomeAt(seed,d.from.position.x,d.from.position.z).id,ownerChunk:`${Math.floor(a.position.x/64)}:${Math.floor(a.position.z/64)}`,...a,deposit:t.deposit,stockCapacity:t.stockCapacity,productionTicks:t.productionTicks,description:t.geology});
  const ux=(b.position.x-d.to.position.x)/18,uz=(b.position.z-d.to.position.z)/18,approach=Math.min(2.05/(Math.abs(ux)||1e-10),1.7/(Math.abs(uz)||1e-10))+.08,workerPosition={x:b.position.x-ux*approach,y:b.position.y,z:b.position.z-uz*approach};
  projects.push({id:projectId,siteId:d.to.id,name:`${d.to.name.split(' ')[0]} Freight Store`,ownerChunk:`${Math.floor(b.position.x/64)}:${Math.floor(b.position.z/64)}`,position:b.position,interactionPosition:b.interactionPosition,workerPosition,material:t.material,cost:4,baseCapacity:4,capacity:12,workTicks:REGIONAL_TRADE_BUILD_TICKS,benefit:'Raises receiving capacity from 4 to 12 units. Take delivered reserve into your raw building supplies for any unfinished outpost rain catchment; the finite source and wilderness harvest ledger stay separate.'});
  const canonicalRoute=regionalRoute(seed,d.from.id,d.to.id);if(!canonicalRoute||canonicalRoute.points.length<2)throw new Error(`Missing canonical freight route ${prefix}`);
  const points=[...sampledLeg(seed,a.interactionPosition,d.from.position),...canonicalRoute.points.slice(1),...sampledLeg(seed,d.to.position,b.interactionPosition).slice(1)],stats=pathStats(points),obstructionDistance=q(Math.min(stats.surfaceMetres-25,Math.max(35,stats.surfaceMetres*.3))),pose=poseOnPath(points,obstructionDistance),side={x:pose.position.x+Math.cos(pose.yaw)*2.1,y:pose.position.y,z:pose.position.z-Math.sin(pose.yaw)*2.1};side.y=regionalHeight(seed,side.x,side.z);
  routes.push({id:prefix+'/route',name:d.name,from:d.from.id,to:d.to.id,sourceId,projectId,carrierId:prefix+'/carrier',carrierName:d.carrier,material:t.material,cargoCapacity:4,speed:REGIONAL_TRADE_SPEED,roadIds:canonicalRoute.roadIds,points,...stats,travelSeconds:stats.surfaceMetres/REGIONAL_TRADE_SPEED,canonicalRoute,obstruction:{id:prefix+'/obstruction',kind:d.obstruction,name:'Washed-out freight bed',description:'Rutted footing is safe to cross unladen, but a heavily loaded pack carrier must wait for the crew to level the freight bed.',position:pose.position,interactionPosition:side,distance:obstructionDistance,repairTicks:REGIONAL_TRADE_REPAIR_TICKS}});
 }
 const result:RegionalTradePlan=freeze({version:1,seed,sources,projects,routes,budget:{sources:3,routes:3,carriers:3,maxReceipts:15,maxMaterialUnits:36,maxSavedBytes:18000}});if(plans.size>=4)plans.delete(plans.keys().next().value!);plans.set(seed,result);return result;
}

function pristine(seed:number,version:RegionalTradeVersion=1):RegionalTradeState {const plan=regionalTradePlan(seed);return {version,seed,revision:0,ticks:0,remainder:0,receipts:[],routes:plan.routes.map((p,i)=>({id:p.id,sourceStartedAt:null,remaining:plan.sources[i]!.deposit,stock:0,productionNextAt:null,reserved:0,cargo:0,activity:'idle',activityStartedAt:0,nextEventAt:null,distance:0,legStartDistance:0,delivered:0,destinationStock:0,embodied:0,withdrawn:0,repairStartedAt:null,clearedAt:null,buildStartedAt:null,builtAt:null,shipments:0}))};}
export function createRegionalTrade(seed:number,version:RegionalTradeVersion=2):RegionalTradeState {if(version!==1&&version!==2)throw new RangeError('Unsupported regional freight version');return seal(pristine(seed,version));}
/** Absence alone opts in; malformed present state must be rejected by the enclosing save parser. */
export function enableRegionalTrade<T extends WildernessIdentity&{frontierTrade?:RegionalTradeState}>(state:T,version:RegionalTradeVersion=2):T {return state.generation!==2||state.regional?.version!==1||Object.hasOwn(state,'frontierTrade')?state:{...state,frontierTrade:createRegionalTrade(state.seed,version)};}
function capacity(p:RegionalTradeProjectPlan,r:RegionalTradeRouteState){return r.builtAt===null?p.baseCapacity:p.capacity;}
function syncDistance(r:RegionalTradeRouteState,p:RegionalTradeRoutePlan,tick:number,seed:number,version:RegionalTradeVersion){if(r.activity!=='outbound'&&r.activity!=='returning')return;const travelled=version===1?(tick-r.activityStartedAt)*REGIONAL_TRADE_STEP*p.speed:regionalTradeWeatherMetres(seed,p,r.activityStartedAt,tick);if(r.activity==='outbound')r.distance=q(Math.min(r.clearedAt===null?p.obstruction.distance:p.surfaceMetres,r.legStartDistance+travelled));else if(r.activity==='returning')r.distance=q(Math.max(0,r.legStartDistance-travelled));}
function activity(r:RegionalTradeRouteState,kind:RegionalTradeActivity,tick:number,next:number|null){r.activity=kind;r.activityStartedAt=tick;r.legStartDistance=r.distance;r.nextEventAt=next;}
function travelTicks(metres:number,p:RegionalTradeRoutePlan){return Math.max(1,Math.ceil((metres-EPS)/(REGIONAL_TRADE_STEP*p.speed)));}
function scheduleProduction(r:RegionalTradeRouteState,s:RegionalTradeSourcePlan,tick:number){if(r.sourceStartedAt!==null&&r.remaining>0&&r.stock<s.stockCapacity&&r.productionNextAt===null)r.productionNextAt=tick+s.productionTicks;}
function beginLoad(r:RegionalTradeRouteState,p:RegionalTradeRoutePlan,s:RegionalTradeSourcePlan,b:RegionalTradeProjectPlan,tick:number){
 if(r.sourceStartedAt===null||r.activity!=='idle')return;
 if(r.remaining===0&&r.stock===0){activity(r,'finished',tick,null);return;}
 const available=capacity(b,r)-r.destinationStock-(r.builtAt===null?r.embodied:0),amount=Math.min(p.cargoCapacity,r.stock,available);
 if(amount<=0||amount<p.cargoCapacity&&r.remaining>0)return;
 r.stock-=amount;r.reserved=amount;activity(r,'loading',tick,tick+LOAD_TICKS);scheduleProduction(r,s,tick);
}
function nextEvent(r:RegionalTradeRouteState,p:RegionalTradeRoutePlan,b:RegionalTradeProjectPlan){return Math.min(r.productionNextAt??Infinity,r.nextEventAt??Infinity,r.repairStartedAt!==null&&r.clearedAt===null?r.repairStartedAt+p.obstruction.repairTicks:Infinity,r.buildStartedAt!==null&&r.builtAt===null?r.buildStartedAt+b.workTicks:Infinity);}
/** Every event either consumes one of twelve atoms, advances one of three trips,
 * or finishes one of two one-time jobs. Long idle clocks are O(1), not tick loops. */
function runRoute(r:RegionalTradeRouteState,p:RegionalTradeRoutePlan,s:RegionalTradeSourcePlan,b:RegionalTradeProjectPlan,end:number,seed:number,version:RegionalTradeVersion){
 const arrival=(tick:number,metres:number)=>version===1?tick+travelTicks(metres,p):regionalTradeWeatherArrival(seed,p,tick,metres);
 for(let tick=nextEvent(r,p,b);tick<=end;tick=nextEvent(r,p,b)){
  syncDistance(r,p,tick,seed,version);
  if(r.repairStartedAt!==null&&r.clearedAt===null&&tick===r.repairStartedAt+p.obstruction.repairTicks){r.clearedAt=tick;if(r.activity==='outbound')activity(r,'outbound',tick,arrival(tick,p.surfaceMetres-r.distance));}
  if(r.buildStartedAt!==null&&r.builtAt===null&&tick===r.buildStartedAt+b.workTicks)r.builtAt=tick;
  if(r.productionNextAt===tick){r.remaining--;r.stock++;r.productionNextAt=null;}
  if(r.nextEventAt===tick){
   if(r.activity==='loading'){r.cargo=r.reserved;r.reserved=0;const finish=r.clearedAt===null?p.obstruction.distance:p.surfaceMetres;activity(r,'outbound',tick,arrival(tick,finish-r.distance));}
   else if(r.activity==='outbound'){
    if(r.clearedAt===null){r.distance=p.obstruction.distance;activity(r,'blocked',tick,null);}
    else{r.distance=p.surfaceMetres;activity(r,'unloading',tick,tick+UNLOAD_TICKS);}
   }else if(r.activity==='unloading'){r.delivered+=r.cargo;r.destinationStock+=r.cargo;r.cargo=0;r.shipments++;activity(r,'returning',tick,arrival(tick,r.distance));}
   else if(r.activity==='returning'){r.distance=0;activity(r,'idle',tick,null);}
  }
  if(r.activity==='blocked'&&r.clearedAt!==null)activity(r,'outbound',tick,arrival(tick,p.surfaceMetres-r.distance));
  scheduleProduction(r,s,tick);beginLoad(r,p,s,b,tick);
 }
 syncDistance(r,p,end,seed,version);
}
function runTo(s:RegionalTradeState,tick:number){const plan=regionalTradePlan(s.seed);for(let i=0;i<s.routes.length;i++)runRoute(s.routes[i]!,plan.routes[i]!,plan.sources[i]!,plan.projects[i]!,tick,s.seed,s.version);s.ticks=tick;}
/** Proven upper bound to drain all currently scheduled work without another command.
 * At most deposit units of production and ceil(deposit/load) trips can occur per
 * route. A trip has two full legs, load/unload, and one extra ceil tick if repair
 * splits a leg. The only other timed jobs are one repair and one store build.
 * These conservative sequential bounds cover concurrent routes by their maximum.
 */
export function regionalTradeDrainTicks(seed:number,version:RegionalTradeVersion=1):number {
 const p=regionalTradePlan(seed),production=Math.max(...p.sources.map(s=>s.deposit*s.productionTicks)),leg=Math.max(...p.routes.map(r=>travelTicks(r.surfaceMetres*(version===1?1:r.speed/REGIONAL_TRADE_MIN_SPEED),r))),trips=Math.max(...p.routes.map((r,i)=>Math.ceil(p.sources[i]!.deposit/r.cargoCapacity)));
 return production+trips*(2*leg+LOAD_TICKS+UNLOAD_TICKS+1)+Math.max(...p.routes.map(r=>r.obstruction.repairTicks))+Math.max(...p.projects.map(b=>b.workTicks))+1;
}
/** Remove only the proven-quiescent tail of each gap between commands. No atom,
 * phase, route distance or pending duration changes. Revision/order remain exact;
 * only active-clock timestamps are translated. Weather-aware histories remove
 * whole seasons only, preserving every action and future forecast phase. With
 * 15 receipts the clock is bounded by 16 × (drain horizon + season). */
function rebaseClock(state:RegionalTradeState):RegionalTradeState {
 const horizon=regionalTradeDrainTicks(state.seed,state.version),p=regionalTradePlan(state.seed),s=pristine(state.seed,state.version);let previous=0;
 const gap=(ticks:number)=>state.version===1?Math.min(ticks,horizon):ticks<=horizon?ticks:horizon+(ticks-horizon)%REGIONAL_WEATHER_PERIOD_TICKS;
 for(const receipt of state.receipts){runTo(s,s.ticks+gap(receipt.tick-previous));execute(s,p,receipt);s.revision=receipt.revision;s.receipts.push({...receipt,tick:s.ticks});previous=receipt.tick;}
 runTo(s,s.ticks+gap(state.ticks-previous));s.remainder=state.remainder;return s;
}
/** Read-only canonical clock for comparing frozen-terminal descendants. This
 * compresses only proven-quiescent gaps and never edits the caller or V32 schema. */
export function regionalTradeCanonical(state:RegionalTradeState):RegionalTradeState|undefined {
 try{const descriptor=Object.getOwnPropertyDescriptor(state,'seed');if(!descriptor||!Object.hasOwn(descriptor,'value')||!validRegionalTrade(state,{generation:2,seed:descriptor.value,regional:{version:1}}))return undefined;return seal(rebaseClock(state));}catch{return undefined;}
}
/** Receives accepted active ticks only: no wall-clock timestamps or offline catch-up. */
export function advanceRegionalTrade(state:RegionalTradeState,dt:number):RegionalTradeState {
 if(!certified.has(state)){try{const descriptor=Object.getOwnPropertyDescriptor(state,'seed');if(!descriptor||!Object.hasOwn(descriptor,'value')||!validRegionalTrade(state,{generation:2,seed:descriptor.value,regional:{version:1}}))return state;}catch{return state;}}
 if(!Number.isFinite(dt)||dt<=0)return state;
 if(state.ticks>=REGIONAL_TRADE_MAX_TICKS-regionalTradeDrainTicks(state.seed,state.version))state=seal(rebaseClock(state));
 // Use the same bounded integer subquarter phase as collectors and food.
 const clock=regionalClockAdvance(state,dt,REGIONAL_TRADE_MAX_TICKS),steps=clock.ticks-state.ticks,remainder=clock.remainder;
 if(steps===0&&remainder===state.remainder)return state;
 const s=copy(state);runTo(s,s.ticks+steps);s.remainder=remainder;return seal(s);
}
function object(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
function exact(v:unknown,names:readonly string[]):v is Record<string,unknown>{if(!object(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))return false;const keys=Reflect.ownKeys(v);return keys.length===names.length&&keys.every(k=>typeof k==='string'&&names.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)!,'value'));}
function array(v:unknown,length:number):v is unknown[]{return Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length===length&&Reflect.ownKeys(v).length===length+1&&Array.from({length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>!!d&&Object.hasOwn(d,'value'));}
function number(v:unknown,min=0,max=REGIONAL_TRADE_MAX_TICKS):v is number{return typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;}
function integer(v:unknown,min=0,max=REGIONAL_TRADE_MAX_TICKS):v is number{return number(v,min,max)&&Number.isSafeInteger(v);}
function identity(ctx:WildernessIdentity){return ctx.generation===2&&integer(ctx.seed,0,0xffffffff)&&exact(ctx.regional,['version'])&&ctx.regional.version===1;}
export function validRegionalTradeCommand(value:unknown):value is RegionalTradeCommand {return exact(value,['type','targetId','expectedRevision'])&&['start-source','clear-route','build-store','withdraw-reserve'].includes(value.type as string)&&typeof value.targetId==='string'&&value.targetId.length>0&&value.targetId.length<=120&&!/[\u0000-\u001f\u007f]/.test(value.targetId)&&integer(value.expectedRevision,0,REGIONAL_TRADE_MAX_REVISION);}
function commandIndex(plan:RegionalTradePlan,command:Pick<RegionalTradeCommand,'type'|'targetId'>){return command.type==='start-source'?plan.sources.findIndex(s=>s.id===command.targetId):command.type==='clear-route'?plan.routes.findIndex(r=>r.id===command.targetId):plan.projects.findIndex(p=>p.id===command.targetId);}
export function regionalTradeCommandPosition(seed:number,command:Pick<RegionalTradeCommand,'type'|'targetId'>):Vec3|undefined {const plan=regionalTradePlan(seed),i=commandIndex(plan,command);if(i<0)return undefined;return command.type==='start-source'?plan.sources[i]!.interactionPosition:command.type==='clear-route'?plan.routes[i]!.obstruction.interactionPosition:plan.projects[i]!.interactionPosition;}
function legalCommand(s:RegionalTradeState,p:RegionalTradePlan,command:Pick<RegionalTradeCommand,'type'|'targetId'>){const i=commandIndex(p,command);if(i<0)return false;const r=s.routes[i]!,b=p.projects[i]!;if(command.type==='start-source')return r.sourceStartedAt===null;if(command.type==='clear-route')return r.sourceStartedAt!==null&&r.repairStartedAt===null;if(command.type==='withdraw-reserve')return r.builtAt!==null&&r.destinationStock>0;return r.buildStartedAt===null&&r.destinationStock>=b.cost;}
function execute(s:RegionalTradeState,plan:RegionalTradePlan,command:Pick<RegionalTradeCommand,'type'|'targetId'>){const i=commandIndex(plan,command),r=s.routes[i]!,p=plan.routes[i]!,source=plan.sources[i]!,project=plan.projects[i]!;if(command.type==='start-source'){r.sourceStartedAt=s.ticks;scheduleProduction(r,source,s.ticks);}else if(command.type==='clear-route')r.repairStartedAt=s.ticks;else if(command.type==='withdraw-reserve'){r.withdrawn+=r.destinationStock;r.destinationStock=0;}else{r.destinationStock-=project.cost;r.embodied=project.cost;r.buildStartedAt=s.ticks;}beginLoad(r,p,source,project,s.ticks);}
export function applyRegionalTradeCommand(state:RegionalTradeState,ctx:RegionalTradeContext,command:RegionalTradeCommand):{state:RegionalTradeState;message:string}{
 const unchanged={state,message:''};if(!validRegionalTradeCommand(command)||!validRegionalTrade(state,ctx)||command.expectedRevision!==state.revision||state.revision>=REGIONAL_TRADE_MAX_REVISION||ctx.zone!=='valley'||ctx.grounded!==true||!ctx.player||![ctx.player.x,ctx.player.z,ctx.player.hp,ctx.feetY].every(v=>typeof v==='number'&&Number.isFinite(v))||ctx.player.hp<=0)return unchanged;
 const plan=regionalTradePlan(state.seed),position=regionalTradeCommandPosition(state.seed,command);if(!position||Math.abs(ctx.feetY!-position.y)>.45||Math.hypot(ctx.player.x-position.x,ctx.player.z-position.z)>REGIONAL_TRADE_REACH||!legalCommand(state,plan,command))return unchanged;
 const s=state.ticks>=REGIONAL_TRADE_MAX_TICKS-regionalTradeDrainTicks(state.seed,state.version)?rebaseClock(state):copy(state);execute(s,plan,command);s.revision++;s.receipts.push({revision:s.revision,tick:s.ticks,type:command.type,targetId:command.targetId});
 const i=commandIndex(plan,command),source=plan.sources[i]!,project=plan.projects[i]!;return {state:seal(s),message:command.type==='start-source'?`${source.name}: the crew is processing its finite ${source.deposit}-unit ${source.material} deposit. First freight needs ${plan.routes[i]!.cargoCapacity} units.`:command.type==='withdraw-reserve'?`${project.name}: ${s.routes[i]!.withdrawn-state.routes[i]!.withdrawn} conserved ${project.material} units moved into your raw building supplies.`:command.type==='clear-route'?'The road crew is repairing the heavy-freight footing. Walkers can still pass; the carrier resumes when the 12-second repair is finished.':`${project.name}: ${project.cost} delivered ${project.material} units are now embodied in the store. Construction will raise freight capacity from ${project.baseCapacity} to ${project.capacity}.`};
}
/** Reconstruct accepted post-baseline freight time without auto-rebasing gaps.
 * Only an explicitly witnessed eligible rebase may translate timestamps. Bounded
 * commands use the ordinary legal/execute paths and cannot manufacture materials. */
export function regionalTradeReplayTimeline(base:RegionalTradeState,events:readonly RegionalTradeTimelineEvent[],end:RegionalTradeTimelinePoint):RegionalTradeState|undefined {
 try{
  const descriptor=Object.getOwnPropertyDescriptor(base,'seed'),clock=(p:RegionalTradeTimelinePoint)=>integer(p.ticks,0,REGIONAL_TRADE_MAX_TICKS)&&number(p.remainder,0,REGIONAL_TRADE_STEP)&&p.remainder<REGIONAL_TRADE_STEP;
  if(!descriptor||!Object.hasOwn(descriptor,'value')||!validRegionalTrade(base,{generation:2,seed:descriptor.value,regional:{version:1}})||!exact(end,['ticks','remainder'])||!clock(end)||!Array.isArray(events)||events.length>18||!array(events,events.length))return undefined;
  let state=copy(base),previous:RegionalTradeTimelinePoint={ticks:0,remainder:0},commands=0,rebases=0;const plan=regionalTradePlan(state.seed);
  const before=(a:RegionalTradeTimelinePoint,b:RegionalTradeTimelinePoint)=>a.ticks<b.ticks||a.ticks===b.ticks&&a.remainder<b.remainder;
  const advanceTo=(point:RegionalTradeTimelinePoint)=>{
   if(!clock(point)||before(point,previous)||before(end,point))return false;
   // Split integer quarter ticks from the subquarter phase. Combining them as
   // one elapsed-second float would lose phase precision near the clock limit.
   const next=regionalClockAdd(state,regionalClockDifference(point,previous));
   if(!integer(next.ticks,state.ticks,REGIONAL_TRADE_MAX_TICKS))return false;
   runTo(state,next.ticks);state.remainder=next.remainder;previous={ticks:point.ticks,remainder:point.remainder};
   return state.remainder<REGIONAL_TRADE_STEP&&(state.ticks!==REGIONAL_TRADE_MAX_TICKS||state.remainder===0);
  };
  for(const event of events){
   if(!(exact(event,['type','ticks','remainder','command'])||exact(event,['type','ticks','remainder']))||!advanceTo(event as unknown as RegionalTradeTimelinePoint))return undefined;
   if(event.type==='rebase'){
    if(!exact(event,['type','ticks','remainder'])||++rebases>3||state.ticks<REGIONAL_TRADE_MAX_TICKS-regionalTradeDrainTicks(state.seed,state.version))return undefined;
    state=rebaseClock(state);
   }else if(event.type==='command'){
    if(!exact(event,['type','ticks','remainder','command'])||!exact(event.command,['type','targetId'])||++commands>15||state.revision>=REGIONAL_TRADE_MAX_REVISION||!validRegionalTradeCommand({...event.command,expectedRevision:state.revision})||!legalCommand(state,plan,event.command as unknown as Pick<RegionalTradeCommand,'type'|'targetId'>))return undefined;
    const command=event.command as unknown as Pick<RegionalTradeCommand,'type'|'targetId'>;execute(state,plan,command);state.revision++;state.receipts.push({revision:state.revision,tick:state.ticks,type:command.type,targetId:command.targetId});
   }else return undefined;
  }
  return advanceTo(end)?seal(state):undefined;
 }catch{return undefined;}
}
const ROUTE_KEYS=['id','sourceStartedAt','remaining','stock','productionNextAt','reserved','cargo','activity','activityStartedAt','nextEventAt','distance','legStartDistance','delivered','destinationStock','embodied','withdrawn','repairStartedAt','clearedAt','buildStartedAt','builtAt','shipments'] as const;
/** Strict finite-event replay proves the whole snapshot; no trusted timestamp or
 * cached certification can launder invented stock, cargo, progress or completion. */
export function validRegionalTrade(value:unknown,ctx:WildernessIdentity):value is RegionalTradeState {try{
 if(!identity(ctx)||!object(value))return false;if(certified.has(value as unknown as RegionalTradeState))return value.seed===ctx.seed;
 if(!exact(value,['version','seed','revision','ticks','remainder','routes','receipts'])||(value.version!==1&&value.version!==2)||value.seed!==ctx.seed||!integer(value.revision,0,REGIONAL_TRADE_MAX_REVISION)||!integer(value.ticks)||!number(value.remainder,0,REGIONAL_TRADE_STEP)||value.remainder>=REGIONAL_TRADE_STEP||value.ticks===REGIONAL_TRADE_MAX_TICKS&&value.remainder!==0||!array(value.routes,3)||!array(value.receipts,value.revision))return false;
 const s=value as unknown as RegionalTradeState,plan=regionalTradePlan(ctx.seed),replay=pristine(ctx.seed,s.version);let previous=0;
 for(let i=0;i<s.routes.length;i++)if(!exact(s.routes[i],ROUTE_KEYS))return false;
 for(let i=0;i<s.receipts.length;i++){
  const r=s.receipts[i]!;if(!exact(r,['revision','tick','type','targetId'])||r.revision!==i+1||!integer(r.tick,previous,s.ticks)||!validRegionalTradeCommand({type:r.type,targetId:r.targetId,expectedRevision:i}))return false;
  runTo(replay,r.tick);if(!legalCommand(replay,plan,r))return false;execute(replay,plan,r);previous=r.tick;
 }
 runTo(replay,s.ticks);
 return s.routes.every((r,i)=>ROUTE_KEYS.every(key=>r[key]===replay.routes[i]![key]));
 }catch{return false;}}
export function immutableRegionalTrade(value:unknown,ctx:WildernessIdentity):RegionalTradeState {if(!validRegionalTrade(value,ctx))throw new Error('Invalid regional trade ledger');return certified.has(value)?value:seal(copy(value));}

/** Potential envelopes, used BEFORE accepting explicit source activation/build. */
export function regionalTradeConstructionBoxes(seed:number,targetId:string):RegionalBox[]{
 const plan=regionalTradePlan(seed),source=plan.sources.find(s=>s.id===targetId);if(source){return [{id:`${source.id}/work-stock`,center:{x:source.position.x,y:source.position.y+.45,z:source.position.z},half:{x:1.35,y:.45,z:1.15},material:source.kind==='quarry'?'regional-trade-stone':'regional-trade-timber',solid:true}];}
 const project=plan.projects.find(p=>p.id===targetId);return project?[{id:`${project.id}/store`,center:{x:project.position.x,y:project.position.y+.8,z:project.position.z},half:{x:1.5,y:.8,z:1.15},material:'regional-trade-store',solid:true}]:[];
}
/** Exact same envelope from safe source/build acceptance through every later phase. */
export function regionalTradeProjectBoxes(seed:number,state:RegionalTradeState|undefined):RegionalBox[]{if(!state||state.seed!==seed)return [];const p=regionalTradePlan(seed);return state.routes.flatMap((r,i)=>[...(r.sourceStartedAt===null?[]:regionalTradeConstructionBoxes(seed,p.sources[i]!.id)),...(r.buildStartedAt===null?[]:regionalTradeConstructionBoxes(seed,p.projects[i]!.id).map(b=>({...b,material:r.builtAt===null?'regional-trade-scaffold':b.material})))]);}
export function regionalTradeProjectSignature(state:RegionalTradeState|undefined):string{return state?`${state.seed}:${state.routes.map(r=>`${r.sourceStartedAt===null?0:1}${r.buildStartedAt===null?0:1}`).join(':')}`:'none';}
export function regionalTradeTargetSignature(seed:number,state:RegionalTradeState|undefined,targetId:string):string {const boxes=regionalTradeProjectBoxes(seed,state).filter(b=>b.id.startsWith(targetId+'/'));return boxes.length?JSON.stringify(boxes.map(({id,center,half,solid})=>({id,center,half,solid}))):'';}
export function regionalTradeObstacles(seed:number,state:RegionalTradeState|undefined):WildernessObstacle[]{return regionalTradeProjectBoxes(seed,state).map(b=>({featureId:b.id,x:b.center.x,y:b.center.y,z:b.center.z,hx:b.half.x,hy:b.half.y,hz:b.half.z}));}
/** Read-only blueprint rings and shallow rut overlays add no collision to old saves. */
export function regionalTradeSiteBoxes(seed:number,state:RegionalTradeState|undefined):RegionalBox[]{
 const plan=regionalTradePlan(seed),boxes=regionalTradeProjectBoxes(seed,state);for(let i=0;i<plan.routes.length;i++){
  const r=state?.seed===seed?state.routes[i]:undefined,source=plan.sources[i]!,project=plan.projects[i]!,route=plan.routes[i]!;
  for(const [target,active]of [[source,r?.sourceStartedAt!==null&&r?.sourceStartedAt!==undefined],[project,r?.buildStartedAt!==null&&r?.buildStartedAt!==undefined]] as const)if(!active)boxes.push({id:`${target.id}/blueprint`,center:{x:target.position.x,y:target.position.y+.025,z:target.position.z},half:{x:1.5,y:.025,z:1.15},material:'regional-trade-blueprint',solid:false});
  if(r?.clearedAt===null||r?.clearedAt===undefined)boxes.push({id:`${route.obstruction.id}/ruts`,center:{x:route.obstruction.position.x,y:route.obstruction.position.y+.035,z:route.obstruction.position.z},half:{x:1.15,y:.025,z:1.6},material:'regional-trade-ruts',solid:false});
 }
 return boxes;
}
function progress(now:number,start:number|null,length:number){return start===null?0:Math.min(1,Math.max(0,(now-start)/length));}
export function regionalTradeSummary(state:RegionalTradeState,seed:number,routeId:string):RegionalTradeSummary|undefined {
 if(state.seed!==seed)return undefined;const plan=regionalTradePlan(seed),i=plan.routes.findIndex(r=>r.id===routeId);if(i<0)return undefined;const p=plan.routes[i]!,s=plan.sources[i]!,b=plan.projects[i]!,r=state.routes[i]!,missing=Math.max(0,b.cost-r.destinationStock-r.embodied);
 let phase:RegionalTradeSummary['phase']='shortage',cause='The freight store needs four delivered units before its crew can build.';
 if(r.sourceStartedAt===null){phase='planned';cause=`The ${s.deposit}-unit ${s.material} deposit is surveyed but its crew has not started. Local activation is required.`;}
 else if(r.repairStartedAt!==null&&r.clearedAt===null){phase='repairing';cause=state.version===1?'The road crew is levelling the freight ruts. Walkers can pass while the loaded carrier waits.':'The road crew is levelling the freight ruts. Walkers can pass; loaded carriers cannot cross this section until the repair is complete.';}
 else if(r.activity==='blocked'){phase='blocked';cause='Real reserved cargo has reached the damaged freight bed and stopped. Repair the marked section locally to resume delivery.';}
 else if(r.buildStartedAt!==null&&r.builtAt===null){phase='building';cause='Four delivered units are embodied in the store; its crew is assembling the larger receiving capacity.';}
 else if(r.builtAt!==null&&r.activity==='finished'){phase='exhausted';cause='The finite source is exhausted. All twelve units are accounted for in the freight store, stored reserve and any reserve taken into raw building supplies.';}
 else if(r.builtAt!==null){phase='operational';cause='The freight store now accepts the remaining finite reserve, with 12 units of receiving capacity.';}
 else if(missing===0){phase='ready';cause='Four real units have arrived. Build the freight store locally to increase receiving capacity and release the remaining reserve.';}
 else if(['outbound','returning','unloading'].includes(r.activity)){phase='in-transit';cause=`${p.carrierName} follows ${p.surfaceMetres.toFixed(0)} m of graded trail ${state.version===2?'with weather-aware road speed':`at ${p.speed.toFixed(1)} m/s`}. Cargo is delivered only after reaching and unloading at the destination.`;}
 else if(r.productionNextAt!==null||r.activity==='loading'){phase='producing';cause=`The crew processes one finite ${s.material} unit every ${s.productionTicks*REGIONAL_TRADE_STEP} seconds. ${p.cargoCapacity} units are reserved for each outbound carrier.`;}
 const target=phase==='planned'?s.id:phase==='blocked'||phase==='repairing'?p.id:b.id,title=phase==='planned'?`Start ${s.name}`:phase==='blocked'||phase==='repairing'?'Repair the freight bed':r.builtAt!==null?'Freight store operational':`Build ${b.name}`;
 const road=state.version===2?regionalTradeRoadWeather(seed,p,state.ticks):{wetness:0,speed:p.speed,condition:'dry' as const};
 const eta=state.version===2?(r.activity==='outbound'&&r.clearedAt!==null?Math.max(0,(r.nextEventAt!-state.ticks+UNLOAD_TICKS)*REGIONAL_TRADE_STEP-state.remainder):r.activity==='unloading'?Math.max(0,(r.nextEventAt!-state.ticks)*REGIONAL_TRADE_STEP-state.remainder):null):r.activity==='outbound'&&r.clearedAt!==null?Math.max(0,(p.surfaceMetres-r.distance)/p.speed+UNLOAD_TICKS*REGIONAL_TRADE_STEP):r.activity==='unloading'?Math.max(0,(r.nextEventAt!-state.ticks)*REGIONAL_TRADE_STEP):null;
 return {routeId:p.id,name:p.name,sourceId:s.id,projectId:b.id,sourceName:s.name,destinationName:b.name,material:p.material,phase,cause,benefit:b.benefit,remaining:r.remaining,stock:r.stock,reserved:r.reserved,cargo:r.cargo,delivered:r.delivered,destinationStock:r.destinationStock,embodied:r.embodied,withdrawn:r.withdrawn,missing,capacity:capacity(b,r),deposit:s.deposit,productionProgress:r.productionNextAt===null?0:1-Math.min(1,(r.productionNextAt-state.ticks)/s.productionTicks),repairProgress:progress(state.ticks,r.repairStartedAt,p.obstruction.repairTicks),workProgress:progress(state.ticks,r.buildStartedAt,b.workTicks),carrierActivity:r.activity,distance:r.distance,surfaceMetres:p.surfaceMetres,travelSeconds:p.travelSeconds,etaSeconds:eta,travelRule:state.version===2?'regional':'legacy',roadWetness:road.wetness,travelSpeed:road.speed,travelCondition:road.condition,etaKind:eta!==null?'arrival':r.cargo>0&&r.clearedAt===null?'repair-required':'none',jobId:`${target}/job`,jobTitle:title};
}
export function regionalTradeInteractions(seed:number,state:RegionalTradeState|undefined):RegionalTradeInteraction[]{
 if(!state||state.seed!==seed)return [];const p=regionalTradePlan(seed);return p.routes.flatMap((route,i)=>{const r=state.routes[i]!,source=p.sources[i]!,project=p.projects[i]!;return (['start-source','clear-route','build-store','withdraw-reserve'] as const).map(kind=>{
  const targetId=kind==='start-source'?source.id:kind==='clear-route'?route.id:project.id,command={type:kind,targetId,expectedRevision:state.revision},enabled=legalCommand(state,p,command),position=regionalTradeCommandPosition(seed,command)!;
  const reason=kind==='start-source'?r.sourceStartedAt===null?'':r.remaining===0?'Finite deposit processed':'Crew already activated':kind==='clear-route'?r.sourceStartedAt===null?'Start the source crew first':r.clearedAt!==null?'Freight bed repaired':r.repairStartedAt!==null?'Road crew repairing':'':kind==='withdraw-reserve'?r.builtAt===null?'Finish the freight store first':r.destinationStock===0?'No delivered reserve to take':'':r.builtAt!==null?'Freight store completed':r.buildStartedAt!==null?'Construction in progress':r.destinationStock<project.cost?`Shortage: needs ${project.cost-r.destinationStock} delivered ${project.material}`:'';
  return {id:`${targetId}/${kind}`,targetId,routeId:route.id,kind,label:kind==='start-source'?`Start ${source.name}`:kind==='clear-route'?'Repair freight bed':kind==='withdraw-reserve'?'Take freight reserve':`Build ${project.name}`,description:kind==='start-source'?source.description:kind==='clear-route'?route.obstruction.description:project.benefit,position,enabled,reason,command};
 });});
}
export function regionalTradeActorPoses(seed:number,state:RegionalTradeState|undefined):RegionalTradeActorPose[]{
 if(!state||state.seed!==seed)return [];const plan=regionalTradePlan(seed),actors:RegionalTradeActorPose[]=[];for(let i=0;i<plan.routes.length;i++){
  const p=plan.routes[i]!,s=plan.sources[i]!,b=plan.projects[i]!,r=state.routes[i]!;
  const direction=r.activity==='returning'?-1:1,pose=poseOnPath(p.points,r.distance,direction);actors.push({id:p.carrierId,routeId:p.id,siteId:direction<0?p.from:p.to,name:p.carrierName,kind:'carrier',...pose,activity:r.activity,carrying:r.cargo,material:p.material,progress:r.distance/p.surfaceMetres,distance:r.distance,direction,speed:r.activity==='outbound'||r.activity==='returning'?(state.version===2?regionalTradeRoadWeather(seed,p,state.ticks).speed:p.speed):0});
  const producerActivity=r.sourceStartedAt===null?'waiting':r.remaining===0?'depleted':r.productionNextAt===null?'stock-full':'working';actors.push({id:`s-${s.id}/worker`,routeId:p.id,siteId:s.siteId,name:s.kind==='quarry'?'Quarry worker':'Timber sorter',kind:'producer',position:s.workerPosition,yaw:Math.atan2(s.position.x-s.workerPosition.x,s.position.z-s.workerPosition.z),activity:producerActivity,carrying:0,material:p.material,progress:r.productionNextAt===null?0:1-(r.productionNextAt-state.ticks)/s.productionTicks,distance:0,direction:1,speed:0});
  actors.push({id:`${p.id}/repairer`,routeId:p.id,siteId:p.from,name:'Road worker',kind:'repairer',position:p.obstruction.interactionPosition,yaw:Math.atan2(p.obstruction.position.x-p.obstruction.interactionPosition.x,p.obstruction.position.z-p.obstruction.interactionPosition.z),activity:r.repairStartedAt===null?'waiting':r.clearedAt===null?'repairing':'complete',carrying:0,material:p.material,progress:progress(state.ticks,r.repairStartedAt,p.obstruction.repairTicks),distance:0,direction:1,speed:0});
  actors.push({id:`${b.id}/builder`,routeId:p.id,siteId:b.siteId,name:'Store builder',kind:'builder',position:b.workerPosition,yaw:Math.atan2(b.position.x-b.workerPosition.x,b.position.z-b.workerPosition.z),activity:r.buildStartedAt===null?'waiting':r.builtAt===null?'building':'complete',carrying:0,material:p.material,progress:progress(state.ticks,r.buildStartedAt,b.workTicks),distance:0,direction:1,speed:0});
 }
 return actors;
}
/** Explicit finite ledger proof, useful for inspection and deterministic labs. */
export function regionalTradeConservation(state:RegionalTradeState):{routeId:string;material:RegionalTradeMaterial;deposit:number;remaining:number;stock:number;reserved:number;inTransit:number;stored:number;embodied:number;withdrawn:number;total:number;balanced:boolean}[]{const p=regionalTradePlan(state.seed);return state.routes.map((r,i)=>{const total=r.remaining+r.stock+r.reserved+r.cargo+r.destinationStock+r.embodied+r.withdrawn,deposit=p.sources[i]!.deposit;return {routeId:r.id,material:p.routes[i]!.material,deposit,remaining:r.remaining,stock:r.stock,reserved:r.reserved,inTransit:r.cargo,stored:r.destinationStock,embodied:r.embodied,withdrawn:r.withdrawn,total,balanced:deposit===total};});}

/** Lifetime credits to the existing raw construction account; never writes wilderness harvest. */
export function regionalTradeWithdrawn(state:RegionalTradeState|undefined):{wood:number;stone:number}{const result={wood:0,stone:0};if(!state)return result;const p=regionalTradePlan(state.seed);for(let i=0;i<state.routes.length;i++)result[p.routes[i]!.material==='deadwood-timber'?'wood':'stone']+=state.routes[i]!.withdrawn;return result;}
