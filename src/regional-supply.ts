import {REGIONAL_WEATHER_PERIOD_TICKS,regionalWeatherAt,regionalWeatherRainUnits} from './regional-weather.ts';
import {regionalClockAdvance} from './regional-clock.ts';
import {regionalTradeWithdrawn,validRegionalTrade,type RegionalTradeState} from './regional-trade.ts';
import {regionalPlan,regionalBiomeAt,regionalFeaturesNear,type RegionalBiomeId,type RegionalBox} from './regional-world.ts';
import {validWildernessState,type WildernessState,type WildernessIdentity} from './wilderness-state.ts';
import type {Vec3} from './procedural.ts';
import type {WildernessObstacle} from './wilderness-geometry.ts';

/** Finite opt-in overlay: existing terrain, shelter coordinates and source IDs stay authoritative. */
export const REGIONAL_SUPPLY_STEP=.25;
export const REGIONAL_SUPPLY_MAX_DT=1;
export const REGIONAL_SUPPLY_MAX_REVISION=256;
export const REGIONAL_SUPPLY_WORK_TICKS=48;
export const REGIONAL_SUPPLY_REACH=3;
const MAX_TICKS=1_000_000_000,EPS=.00001,SPEED=1.6,THIRST_PER_TICK=.03,DRINK_BENEFIT=25;
export type RegionalSupplyMaterial='wood'|'stone';
export type RegionalSupplyActivity='waiting'|'to-work'|'working'|'to-water'|'gathering'|'returning'|'drinking';
export interface RegionalSupplyOutpostPlan {
 id:string;name:string;ownerChunk:string;biome:RegionalBiomeId;position:Vec3;cost:{wood:number;stone:number};capacity:number;rainRate:number;rainOffset:number;
 deliveryPosition:Vec3;buildPosition:Vec3;storagePosition:Vec3;
 residents:{id:string;name:string;homePosition:Vec3;workPosition:Vec3;path:Vec3[]}[];roadIds:string[];
}
export interface RegionalSupplyPlan {version:1;seed:number;outposts:RegionalSupplyOutpostPlan[];budget:{outposts:6;residents:12;sourceChunks:54;maxSavedBytes:15000}}
export interface RegionalSupplyResident {id:string;activity:RegionalSupplyActivity;routeProgress:number;actionTicks:number;thirst:number;thirstOverflow:number;drunk:number;carrying:number;service:number}
export interface RegionalSupplyOutpost {id:string;delivered:{wood:number;stone:number};buildStartedAt:number|null;builtAt:number|null;workTicks:number;water:number;precipitation:number;captured:number;spilled:number;consumed:number;residents:RegionalSupplyResident[]}
export interface RegionalSupplyReceipt {revision:number;tick:number;outpostId:string;kind:'deliver'|'build';wood:number;stone:number}
export interface RegionalSupplyState {version:1|2;seed:number;revision:number;ticks:number;remainder:number;outposts:RegionalSupplyOutpost[];receipts:RegionalSupplyReceipt[]}
export type RegionalSupplyCommand={type:'deliver'|'build';outpostId:string;expectedRevision:number};
export interface RegionalSupplyContext extends WildernessIdentity {zone:string;player:{x:number;z:number;hp:number};wilderness?:WildernessState;frontierTrade?:RegionalTradeState;feetY?:number;grounded?:boolean}
export interface RegionalSupplySummary {
 outpostId:string;name:string;phase:'shortage'|'ready'|'building'|'operational';jobId:string;jobTitle:string;cause:string;
 missing:{wood:number;stone:number};available:{wood:number;stone:number};localRemaining:{wood:number;stone:number};alternatives:{wood:string|null;stone:string|null};
 water:number;capacity:number;collected:number;consumed:number;workProgress:number;hydration:number;roadNames:string[];rainRate:number;benefit:string;weather:RegionalSupplyWeather;
}
const q=(n:number)=>Math.round(n*1e6)/1e6;
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
function freeze<T>(v:T):T {if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
const plans=new Map<number,RegionalSupplyPlan>(),certified=new WeakSet<RegionalSupplyState>();
const replayCache=new Map<string,{tick:number;outpost:RegionalSupplyOutpost}>();
// Food observes a few ticks behind the live collector. Keep its bounded historical
// cursor separate from seal()'s newest snapshot so live ticks cannot evict it.
const historicalReplayCache=new Map<string,{tick:number;outpost:RegionalSupplyOutpost}[]>();
const replayKey=(seed:number,o:RegionalSupplyOutpost,version:1|2)=>`${version}:${seed}:${o.id}:${o.buildStartedAt}`;
function cacheReplay(seed:number,tick:number,outpost:RegionalSupplyOutpost,version:1|2){const key=replayKey(seed,outpost,version);replayCache.delete(key);if(replayCache.size>=24)replayCache.delete(replayCache.keys().next().value!);replayCache.set(key,{tick,outpost});}
function cacheHistoricalReplay(seed:number,tick:number,outpost:RegionalSupplyOutpost,version:1|2){const key=replayKey(seed,outpost,version),samples=(historicalReplayCache.get(key)??[]).filter(s=>s.tick!==tick);samples.push({tick,outpost});if(samples.length>16)samples.shift();historicalReplayCache.delete(key);if(historicalReplayCache.size>=24)historicalReplayCache.delete(historicalReplayCache.keys().next().value!);historicalReplayCache.set(key,samples);}
function seal(s:RegionalSupplyState){freeze(s);certified.add(s);for(const o of s.outposts)if(o.buildStartedAt!==null)cacheReplay(s.seed,s.ticks,o,s.version);return s;}
const RULES:Record<RegionalBiomeId,{wood:number;stone:number;rain:number;capacity:number}>={valley:{wood:4,stone:3,rain:.24,capacity:12},meadow:{wood:4,stone:3,rain:.24,capacity:12},'pine-highlands':{wood:5,stone:3,rain:.32,capacity:14},'redstone-uplands':{wood:3,stone:5,rain:.16,capacity:18},'river-wetland':{wood:4,stone:5,rain:.36,capacity:12},'windward-heath':{wood:6,stone:4,rain:.2,capacity:16}};
/** Macro-only: safe for atlas, map and every frame. No feature/terrain chunk compilation. */
export function regionalSupplyPlan(seed:number):RegionalSupplyPlan {
 const cached=plans.get(seed);if(cached){plans.delete(seed);plans.set(seed,cached);return cached;}
 const region=regionalPlan(seed),outposts:RegionalSupplyOutpostPlan[]=region.sites.filter(s=>s.kind==='outpost').map((site,index)=>{
  const position={x:site.position.x+site.structureOffset.x,y:site.position.y,z:site.position.z+site.structureOffset.z},local=(x:number,z:number):Vec3=>({x:position.x+x,y:position.y,z:position.z+z});
  const biome=regionalBiomeAt(seed,site.position.x,site.position.z).id,rules=RULES[biome];
  const residents=[{id:`${site.id}/resident/0`,name:['Ada','Bryn','Cora','Dara','Eli','Finn'][index]!,homePosition:local(-1.4,.1),workPosition:local(1.25,-1.6),path:[local(-1.4,.1),local(1.25,.1),local(1.25,-1.6)]},{id:`${site.id}/resident/1`,name:['Joss','Kira','Lena','Mika','Niko','Orla'][index]!,homePosition:local(-.6,1.4),workPosition:local(2.7,.1),path:[local(-.6,1.4),local(2.7,1.4),local(2.7,.1)]}];
  const queue:[string,string[]][]=[[region.gateways[site.position.x<0?0:1]!.coreSiteId,[]]],seen=new Set<string>();let roadIds:string[]=[];
  for(let cursor=0;cursor<queue.length;cursor++){const [at,path]=queue[cursor]!;if(at===site.id){roadIds=path;break;}if(seen.has(at))continue;seen.add(at);for(const road of region.roads){const to=road.from===at?road.to:road.to===at?road.from:null;if(to&&!seen.has(to))queue.push([to,[...path,road.id]]);}}
  return {id:site.id,name:site.name,ownerChunk:site.ownerChunk,biome,position,cost:{wood:rules.wood,stone:rules.stone+(roadIds.length>3?1:0)},capacity:rules.capacity,rainRate:rules.rain,rainOffset:(seed%120+index*17)%120,deliveryPosition:local(0,2),buildPosition:local(0,2),storagePosition:local(2.7,-1.6),residents,roadIds};
 });
 const result:RegionalSupplyPlan=freeze({version:1,seed,outposts,budget:{outposts:6,residents:12,sourceChunks:54,maxSavedBytes:15000}});
 if(plans.size>=4)plans.delete(plans.keys().next().value!);plans.set(seed,result);return result;
}
const sources=new Map<string,{wood:string[];stone:string[]}>();
/** Explicit panel/initialization query only: at most 3×3 chunks per outpost, 54 across all six. */
export function regionalSupplyLocalSources(seed:number,outpostId:string):{wood:string[];stone:string[]} {
 const key=`${seed}:${outpostId}`,cached=sources.get(key);if(cached){sources.delete(key);sources.set(key,cached);return cached;}
 const site=regionalPlan(seed).sites.find(s=>s.id===outpostId&&s.kind==='outpost');if(!site)return {wood:[],stone:[]};
 const nearby=regionalFeaturesNear(seed,site.position.x,site.position.z,1).filter(f=>f.harvestable&&Math.hypot(f.x-site.position.x,f.z-site.position.z)<=80);
 const result=freeze({wood:nearby.filter(f=>f.kind==='tree').map(f=>f.id),stone:nearby.filter(f=>f.kind==='rock').map(f=>f.id)});if(sources.size>=24)sources.delete(sources.keys().next().value!);sources.set(key,result);return result;
}
/** Explicit model version keeps old fixtures/replays stable; new-world enable uses 2. */
export function createRegionalSupply(seed:number,version:1|2=1):RegionalSupplyState {
 return seal({version,seed,revision:0,ticks:0,remainder:0,receipts:[],outposts:regionalSupplyPlan(seed).outposts.map(p=>({id:p.id,delivered:{wood:0,stone:0},buildStartedAt:null,builtAt:null,workTicks:0,water:0,precipitation:0,captured:0,spilled:0,consumed:0,residents:p.residents.map(a=>({id:a.id,activity:'waiting',routeProgress:0,actionTicks:0,thirst:60,thirstOverflow:0,drunk:0,carrying:0,service:0}))}))});
}
/** Idempotent opt-in preserves location and does not enable the overlay in legacy/nonregional worlds. */
export function enableRegionalSupply<T extends WildernessIdentity&{frontierSupply?:RegionalSupplyState}>(state:T):T {if(state.generation!==2||state.regional?.version!==1||state.frontierSupply)return state;return {...state,frontierSupply:createRegionalSupply(state.seed,2)};}
/** Delivered atoms remain embodied in the staged/built retrofit. No exchange rewards or replenishment. */
export function regionalSupplySpent(state:RegionalSupplyState|undefined):{wood:number;stone:number}{return state?state.outposts.reduce((sum,p)=>({wood:sum.wood+p.delivered.wood,stone:sum.stone+p.delivered.stone}),{wood:0,stone:0}):{wood:0,stone:0};}
/** Carried raw stock combines unchanged lifetime harvest and withdrawn finite freight,
 * minus every collector allocation. Freight still in a store or carrier is unavailable. */
export function regionalSupplyAvailable(state:RegionalSupplyState|undefined,wilderness:Pick<WildernessState,'wood'|'stone'>|undefined,frontierTrade?:RegionalTradeState){const spent=regionalSupplySpent(state),freight=regionalTradeWithdrawn(frontierTrade);return {wood:Math.max(0,(wilderness?.wood??0)+freight.wood-spent.wood),stone:Math.max(0,(wilderness?.stone??0)+freight.stone-spent.stone)};}
function pathLength(points:Vec3[]){return points.slice(1).reduce((n,p,i)=>n+distance(points[i]!,p),0);}
function productivity(a:RegionalSupplyResident){return a.thirst>=80?.25:a.thirst>=50?.5:1;}
function wet(tick:number,offset:number){return (tick+offset)%120<80;}
function rainTicks(end:number,offset:number){const n=end+offset;return Math.floor(n/120)*80+Math.min(n%120,80)-(Math.floor(offset/120)*80+Math.min(offset%120,80));}
export function regionalSupplyWeatherPeriod(state:Pick<RegionalSupplyState,'version'>):number{return state.version===2?REGIONAL_WEATHER_PERIOD_TICKS:120;}
function potentialRain(p:RegionalSupplyOutpostPlan,start:number,end:number,version:1|2){const units=version===2?regionalWeatherRainUnits(seedOf(p),p.position.x,p.position.z,start,end):rainTicks(end,p.rainOffset)-rainTicks(start,p.rainOffset);return q(units*p.rainRate*REGIONAL_SUPPLY_STEP);}
const seedOf=(p:RegionalSupplyOutpostPlan)=>Number(p.id.split(':')[2]!.split('/')[0]);
export interface RegionalSupplyWeather {model:'legacy'|'regional';phase:string;intensity:number;drySeconds:number;secondsUntilChange:number;description:string}
/** A projection of the existing active supply clock, never a second weather clock. */
export function regionalSupplyWeather(state:RegionalSupplyState,outpostId:string):RegionalSupplyWeather|undefined {
 const p=regionalSupplyPlan(state.seed).outposts.find(o=>o.id===outpostId);if(!p)return undefined;
 if(state.version===1){const phase=(state.ticks+p.rainOffset)%120,raining=phase<80;return {model:'legacy',phase:raining?'rain':'dry',intensity:raining?1:0,drySeconds:raining?0:(phase-80)*.25,secondsUntilChange:(raining?80-phase:120-phase)*.25,description:'Legacy collector rainfall: 20 wet / 10 dry seconds. This saved model stays unchanged; try regional weather in the disposable system workbench.'};}
 const weather=regionalWeatherAt(state.seed,p.position.x,p.position.z,state.ticks);
 return {model:'regional',phase:weather.phase,intensity:weather.intensity,drySeconds:weather.drySeconds,secondsUntilChange:weather.secondsUntilChange,description:`Regional ${weather.phase} · ${weather.zoneId}. ${weather.phase==='dry'?`No roof input for ${weather.drySeconds.toFixed(0)} active seconds.`:`Roof input ×${weather.intensity}; actual capture still requires resident work.`} Next ${weather.nextCondition} in ${weather.secondsUntilChange.toFixed(0)} active seconds.`};
}
function setActivity(a:RegionalSupplyResident,activity:RegionalSupplyActivity){a.activity=activity;a.actionTicks=0;}
function tickOutpost(p:RegionalSupplyOutpostPlan,o:RegionalSupplyOutpost,tick:number,version:1|2){
 for(const a of o.residents){const thirst=q(a.thirst+THIRST_PER_TICK);a.thirstOverflow=q(a.thirstOverflow+Math.max(0,thirst-100));a.thirst=Math.min(100,thirst);}
 if(o.buildStartedAt===null)return;
 if(o.builtAt!==null){
  const intensity=version===2?regionalWeatherAt(seedOf(p),p.position.x,p.position.z,tick-1).intensity:wet(tick-1,p.rainOffset)?1:0,input=q(intensity*p.rainRate*REGIONAL_SUPPLY_STEP);o.precipitation=q(o.precipitation+input);
  const effort=o.residents.reduce((n,a)=>n+(a.activity==='working'?productivity(a):0),0)/o.residents.length,captured=q(input*effort),accepted=Math.min(captured,q(p.capacity-o.water));o.captured=q(o.captured+captured);o.water=q(o.water+accepted);o.spilled=q(o.spilled+captured-accepted);
 }
 for(let i=0;i<o.residents.length;i++){
  const a=o.residents[i]!,length=pathLength(p.residents[i]!.path),rate=productivity(a);
  if(a.activity==='waiting')setActivity(a,'to-work');
  else if(a.activity==='to-work'||a.activity==='to-water'){a.routeProgress=q(Math.min(length,a.routeProgress+SPEED*REGIONAL_SUPPLY_STEP));if(a.routeProgress>=length-EPS){a.routeProgress=length;setActivity(a,a.activity==='to-water'?'gathering':'working');}}
  else if(a.activity==='working'){if(o.builtAt===null)o.workTicks=Math.min(REGIONAL_SUPPLY_WORK_TICKS,o.workTicks+rate);else{a.service=q(a.service+REGIONAL_SUPPLY_STEP*rate);if(a.thirst>=45&&o.water>=1)setActivity(a,'gathering');}}
  else if(a.activity==='gathering'){if(o.builtAt===null||o.water<1){setActivity(a,'working');continue;}a.actionTicks++;if(a.actionTicks>=4){o.water=q(o.water-1);a.carrying=1;setActivity(a,'returning');}}
  else if(a.activity==='returning'){a.routeProgress=q(Math.max(0,a.routeProgress-SPEED*REGIONAL_SUPPLY_STEP));if(a.routeProgress<=EPS){a.routeProgress=0;setActivity(a,a.carrying>0?'drinking':'to-work');}}
  else if(a.activity==='drinking'){a.actionTicks++;if(a.actionTicks>=8){a.drunk=q(a.drunk+a.carrying);o.consumed=q(o.consumed+a.carrying);a.thirst=q(a.thirst-DRINK_BENEFIT*a.carrying);a.carrying=0;setActivity(a,'to-work');}}
 }
 if(o.builtAt===null&&o.workTicks>=REGIONAL_SUPPLY_WORK_TICKS)o.builtAt=tick;
}
/** One bounded quarter-second clock whether visible or away; no wall-clock/offline catch-up. */
export function advanceRegionalSupply(state:RegionalSupplyState,dt:number):RegionalSupplyState {
 // Import/network snapshots cannot become certified merely by advancing a fractional frame.
 if(!certified.has(state)){try{if(!validate(state,{generation:2,seed:state.seed,regional:{version:1}},false))return state;}catch{return state;}}
 if(!Number.isFinite(dt)||dt<=0||state.ticks>=MAX_TICKS)return state;
 // Integer subquarter phase prevents rounding dust accumulating differently in
 // the old source and new food clocks when their rollout remainders differ.
 const clock=regionalClockAdvance(state,dt,MAX_TICKS),steps=clock.ticks-state.ticks,remainder=clock.remainder;
 if(steps===0&&remainder===state.remainder)return state;const s=copy(state);s.remainder=remainder;const plan=regionalSupplyPlan(s.seed);
 for(let i=0;i<steps;i++){s.ticks++;for(let n=0;n<s.outposts.length;n++)tickOutpost(plan.outposts[n]!,s.outposts[n]!,s.ticks,s.version);}return seal(s);
}
function object(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
function exact(v:unknown,names:readonly string[]):v is Record<string,unknown>{if(!object(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))return false;const keys=Reflect.ownKeys(v);return keys.length===names.length&&keys.every(k=>typeof k==='string'&&names.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)!,'value'));}
function array(v:unknown,length:number):v is unknown[]{return Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length===length&&Reflect.ownKeys(v).length===length+1&&Array.from({length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>!!d&&Object.hasOwn(d,'value'));}
function number(v:unknown,min=0,max=MAX_TICKS):v is number{return typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;}
function integer(v:unknown,min=0,max=MAX_TICKS):v is number{return number(v,min,max)&&Number.isSafeInteger(v);}
const close=(a:number,b:number)=>Math.abs(a-b)<=EPS;
export function validRegionalSupplyCommand(v:unknown):v is RegionalSupplyCommand {return exact(v,['type','outpostId','expectedRevision'])&&(v.type==='deliver'||v.type==='build')&&typeof v.outpostId==='string'&&v.outpostId.length>0&&v.outpostId.length<=100&&!/[\u0000-\u001f\u007f]/.test(v.outpostId)&&integer(v.expectedRevision,0,REGIONAL_SUPPLY_MAX_REVISION);}
function validIdentity(ctx:WildernessIdentity){return ctx.generation===2&&Number.isInteger(ctx.seed)&&ctx.seed>=0&&ctx.seed<=0xffffffff&&exact(ctx.regional,['version'])&&ctx.regional.version===1;}
function validMaterials(s:RegionalSupplyState,ctx:WildernessIdentity&{wilderness?:WildernessState;frontierTrade?:RegionalTradeState}){if(ctx.wilderness!==undefined&&!validWildernessState(ctx.wilderness,ctx))return false;if(ctx.frontierTrade!==undefined&&!validRegionalTrade(ctx.frontierTrade,ctx))return false;const spent=regionalSupplySpent(s),freight=regionalTradeWithdrawn(ctx.frontierTrade);return spent.wood<=(ctx.wilderness?.wood??0)+freight.wood&&spent.stone<=(ctx.wilderness?.stone??0)+freight.stone;}
export function applyRegionalSupplyCommand(state:RegionalSupplyState,ctx:RegionalSupplyContext,command:RegionalSupplyCommand):{state:RegionalSupplyState;message:string}{
 const unchanged={state,message:''};if(!validRegionalSupplyCommand(command)||!validRegionalSupply(state,ctx)||command.expectedRevision!==state.revision||ctx.zone!=='valley'||ctx.grounded===false||!ctx.player||![ctx.player.x,ctx.player.z,ctx.player.hp].every(Number.isFinite)||ctx.player.hp<=0)return unchanged;
 const p=regionalSupplyPlan(state.seed).outposts.find(p=>p.id===command.outpostId),old=state.outposts.find(p=>p.id===command.outpostId);if(!p||!old)return unchanged;
 const feetY=ctx.feetY??p.deliveryPosition.y;if(!Number.isFinite(feetY)||Math.abs(feetY-p.deliveryPosition.y)>.45||Math.hypot(ctx.player.x-p.deliveryPosition.x,ctx.player.z-p.deliveryPosition.z)>REGIONAL_SUPPLY_REACH||old.buildStartedAt!==null)return unchanged;
 const available=regionalSupplyAvailable(state,ctx.wilderness,ctx.frontierTrade),wood=Math.min(p.cost.wood-old.delivered.wood,available.wood),stone=Math.min(p.cost.stone-old.delivered.stone,available.stone);
 if(command.type==='deliver'&&wood+stone===0||command.type==='build'&&(old.delivered.wood!==p.cost.wood||old.delivered.stone!==p.cost.stone))return unchanged;
 const s=copy(state),outpost=s.outposts.find(p=>p.id===old.id)!;s.revision++;
 if(command.type==='deliver'){outpost.delivered.wood+=wood;outpost.delivered.stone+=stone;}else{outpost.buildStartedAt=s.ticks;for(const actor of outpost.residents)setActivity(actor,'to-work');}
 s.receipts.push({revision:s.revision,tick:s.ticks,outpostId:p.id,kind:command.type,wood:command.type==='deliver'?wood:0,stone:command.type==='deliver'?stone:0});
 return {state:seal(s),message:command.type==='deliver'?`${p.name}: ${wood} wood and ${stone} stone moved from your pack into the rain-catchment project.`:`${p.name}: residents are building the stocked rain catchment. Its scaffold now occupies the storage footprint.`};
}
export function regionalSupplyConstructionBoxes(seed:number,outpostId:string):RegionalBox[]{const p=regionalSupplyPlan(seed).outposts.find(p=>p.id===outpostId);if(!p)return [];return [{id:`${p.id}/supply/storage`,center:{x:p.storagePosition.x,y:p.position.y+.7,z:p.storagePosition.z},half:{x:.75,y:.7,z:.75},material:'regional-supply-storage',solid:true},{id:`${p.id}/supply/downpipe`,center:{x:p.storagePosition.x+.54,y:p.position.y+2.44,z:p.storagePosition.z-.54},half:{x:.08,y:1.04,z:.08},material:'regional-supply-timber',solid:true}];}
/** Same envelopes from scaffold authorization through completed tank. */
export function regionalSupplyProjectBoxes(seed:number,state:RegionalSupplyState|undefined):RegionalBox[]{if(!state||state.seed!==seed)return [];return state.outposts.filter(o=>o.buildStartedAt!==null).flatMap(o=>regionalSupplyConstructionBoxes(seed,o.id).map(b=>({...b,material:o.builtAt===null?'regional-supply-scaffold':b.material})));}
export function regionalSupplyProjectSignature(state:RegionalSupplyState|undefined):string{return state?`${state.seed}:${state.outposts.map(o=>o.buildStartedAt===null?'0':'1').join('')}`:'none';}
export function regionalSupplyObstacles(seed:number,state:RegionalSupplyState|undefined):WildernessObstacle[]{return regionalSupplyProjectBoxes(seed,state).map(b=>({featureId:b.id,x:b.center.x,y:b.center.y,z:b.center.z,hx:b.half.x,hy:b.half.y,hz:b.half.z}));}
function poseOnPath(path:Vec3[],progress:number,backwards:boolean){let remaining=progress;for(let i=1;i<path.length;i++){const a=path[i-1]!,b=path[i]!,length=distance(a,b);if(remaining<=length+EPS||i===path.length-1){const t=Math.max(0,Math.min(1,remaining/length));return {position:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},yaw:Math.atan2((b.x-a.x)*(backwards?-1:1),(b.z-a.z)*(backwards?-1:1))};}remaining-=length;}return {position:{...path[0]!},yaw:0};}
export function regionalSupplyActorPoses(seed:number,state:RegionalSupplyState|undefined):{id:string;outpostId:string;name:string;position:Vec3;yaw:number;activity:RegionalSupplyActivity;thirst:number;carrying:number}[]{if(!state||state.seed!==seed)return [];const plan=regionalSupplyPlan(seed);return state.outposts.flatMap((o,i)=>o.residents.map((a,n)=>{const p=plan.outposts[i]!,pose=poseOnPath(p.residents[n]!.path,a.routeProgress,a.activity==='returning');if(a.activity==='working'||a.activity==='gathering')pose.yaw=Math.atan2(p.storagePosition.x-pose.position.x,p.storagePosition.z-pose.position.z);return {id:a.id,outpostId:o.id,name:p.residents[n]!.name,...pose,activity:a.activity,thirst:a.thirst,carrying:a.carrying};}));}
const remainingCache=new WeakMap<readonly string[],Map<string,{wood:number;stone:number}>>();
function remaining(seed:number,p:RegionalSupplyOutpostPlan,harvested:readonly string[]){let cache=Object.isFrozen(harvested)?remainingCache.get(harvested):undefined;if(!cache){cache=new Map();remainingCache.set(harvested,cache);}const key=`${seed}:${p.id}`,old=cache.get(key);if(old)return old;const local=regionalSupplyLocalSources(seed,p.id),depleted=new Set(harvested),result={wood:local.wood.filter(id=>!depleted.has(id)).length,stone:local.stone.filter(id=>!depleted.has(id)).length};cache.set(key,result);return result;}
const EMPTY_HARVESTED:string[]=Object.freeze([]) as unknown as string[];
export function regionalSupplySummary(state:RegionalSupplyState,seed:number,outpostId:string,wilderness?:WildernessState,frontierTrade?:RegionalTradeState):RegionalSupplySummary|undefined {
 if(state.seed!==seed)return undefined;const plan=regionalSupplyPlan(seed),p=plan.outposts.find(p=>p.id===outpostId),o=state.outposts.find(o=>o.id===outpostId);if(!p||!o)return undefined;
 const harvested=wilderness?.harvested??EMPTY_HARVESTED,missing={wood:p.cost.wood-o.delivered.wood,stone:p.cost.stone-o.delivered.stone},phase=o.builtAt!==null?'operational':o.buildStartedAt!==null?'building':missing.wood+missing.stone===0?'ready':'shortage';
 const alternative=(material:RegionalSupplyMaterial)=>plan.outposts.filter(other=>other.id!==p.id&&remaining(seed,other,harvested)[material]>0).sort((a,b)=>distance(a.position,p.position)-distance(b.position,p.position)||a.id.localeCompare(b.id))[0]?.name??null;
 const region=regionalPlan(seed),roadNames=p.roadIds.map(id=>{const road=region.roads.find(r=>r.id===id)!;return region.sites.find(s=>s.id===road.to)?.name??'Valley gateway';});
 return {outpostId,name:p.name,phase,jobId:`${p.id}/job/rain-catchment`,jobTitle:phase==='operational'?'Shelter rain catchment completed':'Build a shelter rain catchment',cause:phase==='operational'?`The collector is built. ${o.water.toFixed(1)} L is stored. ${o.water<1&&o.residents.some(a=>a.thirst>=45&&a.carrying===0)?'Drinking-water shortage: thirsty residents are waiting for collectable rainfall.': 'Residents use the reserve to drink when thirsty.'} ${state.version===2?regionalSupplyWeather(state,outpostId)!.description:''}`:phase==='building'?'Real delivered timber and stone are being assembled into the shelter catchment.':phase==='ready'?'All required timber and stone is staged; residents still need the catchment assembled.':'Two residents have no stored drinking water; their existing shelter roof can collect rain once fitted with a tank and gutter.',missing,available:regionalSupplyAvailable(state,wilderness,frontierTrade),localRemaining:remaining(seed,p,harvested),alternatives:{wood:alternative('wood'),stone:alternative('stone')},water:o.water,capacity:p.capacity,collected:o.captured,consumed:o.consumed,workProgress:o.workTicks/REGIONAL_SUPPLY_WORK_TICKS,hydration:q(o.residents.reduce((n,a)=>n+100-a.thirst,0)/o.residents.length),roadNames,rainRate:p.rainRate,weather:regionalSupplyWeather(state,outpostId)!,benefit:o.consumed>0?`${o.consumed.toFixed(0)} L drunk. Hydrated residents tend the catchment up to 4× faster than severely thirsty residents.`:'Deliver real wood and stone, start construction, then residents collect roof rainfall and drink from their own flasks.'};
}
/** Replays only active simulation time. Once the finite dynamic state repeats at a rain-cycle
 * boundary, skip complete cycles while adding their conserved cumulative counters exactly.
 * No untrusted timestamp can cause an unbounded replay or offline production. */
function replayOutpost(p:RegionalSupplyOutpostPlan,start:number|null,end:number,delivered:{wood:number;stone:number},version:1|2=1):RegionalSupplyOutpost|undefined {
 const seed=Number(p.id.split(':')[2]!.split('/')[0]),base:RegionalSupplyOutpost={id:p.id,delivered:{...delivered},buildStartedAt:start,builtAt:null,workTicks:0,water:0,precipitation:0,captured:0,spilled:0,consumed:0,residents:p.residents.map(a=>({id:a.id,activity:start===null?'waiting':'to-work',routeProgress:0,actionTicks:0,thirst:Math.min(100,q(60+(start??end)*THIRST_PER_TICK)),thirstOverflow:Math.max(0,q(60+(start??end)*THIRST_PER_TICK-100)),drunk:0,carrying:0,service:0}))};
 if(start===null)return base;
 let o=base,tick=start;const key=replayKey(seed,base,version),latest=replayCache.get(key),candidates=[...(historicalReplayCache.get(key)??[]),...(latest?[latest]:[])],cached=candidates.filter(item=>item.tick>=start&&item.tick<=end).sort((a,b)=>b.tick-a.tick)[0];if(cached){o=copy(cached.outpost);o.delivered={...delivered};tick=cached.tick;}
 const seen=new Map<string,{tick:number;outpost:RegionalSupplyOutpost}>();let steps=0;
 while(tick<end){
  if(o.builtAt!==null&&tick%regionalSupplyWeatherPeriod({version})===0){
   const key=[o.water,...o.residents.flatMap(a=>[a.activity,a.routeProgress,a.actionTicks,a.thirst,a.carrying])].join('|'),prior=seen.get(key);
   if(prior){const cycle=tick-prior.tick,count=Math.floor((end-tick)/cycle);if(count>0){for(const field of ['precipitation','captured','spilled','consumed'] as const)o[field]=q(o[field]+(o[field]-prior.outpost[field])*count);for(let i=0;i<o.residents.length;i++)for(const field of ['thirstOverflow','drunk','service'] as const)o.residents[i]![field]=q(o.residents[i]![field]+(o.residents[i]![field]-prior.outpost.residents[i]![field])*count);tick+=count*cycle;continue;}}
   else seen.set(key,{tick,outpost:copy(o)});
  }
  // Only equal dynamic state at an equal model-specific weather phase may skip.
  // Retain a bounded transient budget, including maximally thirsty arrivals.
  if(++steps>120_000)return undefined;
  tick++;tickOutpost(p,o,tick,version);
 }
 return o;
}
/** Read a deterministic historical collector snapshot without spending, resetting
 * or certifying the input ledger. Callers must validate external supply ownership
 * first. Receipts after the requested tick cannot leak into earlier snapshots. */
export function regionalSupplyOutpostAt(state:RegionalSupplyState,outpostId:string,tick:number):RegionalSupplyOutpost|undefined {
 try{
  // This helper has no external material context. It still rejects malformed
  // dynamics and accessor payloads; its caller validates material ownership.
  if(!certified.has(state)){const descriptor=Object.getOwnPropertyDescriptor(state,'seed');if(!descriptor||!Object.hasOwn(descriptor,'value')||!validate(state,{generation:2,seed:descriptor.value,regional:{version:1}},false))return undefined;state=seal(copy(state));}
  if(!integer(tick,0,state.ticks))return undefined;
  const plan=regionalSupplyPlan(state.seed).outposts.find(p=>p.id===outpostId);if(!plan)return undefined;
  if(tick===state.ticks){const current=state.outposts.find(o=>o.id===outpostId)!;cacheHistoricalReplay(state.seed,tick,current,state.version);return current;}
  let started:number|null=null;const delivered={wood:0,stone:0};
  for(const receipt of state.receipts){if(receipt.tick>tick)break;if(receipt.outpostId!==outpostId)continue;if(receipt.kind==='deliver'){delivered.wood+=receipt.wood;delivered.stone+=receipt.stone;}else if(receipt.kind==='build')started=receipt.tick;}
  const replayed=replayOutpost(plan,started,tick,delivered,state.version);if(!replayed)return undefined;
  const snapshot=freeze(replayed);cacheHistoricalReplay(state.seed,tick,snapshot,state.version);return snapshot;
 }catch{return undefined;}
}
function sameOutpost(a:RegionalSupplyOutpost,b:RegionalSupplyOutpost){
 for(const key of ['id','buildStartedAt','builtAt','workTicks','water','precipitation','captured','spilled','consumed'] as const)if(a[key]!==b[key])return false;
 if(a.delivered.wood!==b.delivered.wood||a.delivered.stone!==b.delivered.stone)return false;
 return a.residents.every((actor,i)=>Object.keys(actor).every(key=>actor[key as keyof RegionalSupplyResident]===b.residents[i]![key as keyof RegionalSupplyResident]));
}
/** Strict import boundary rejects accessor payloads, extra keys, wrong worlds, replayed receipts and creation of material/water. */
export function validRegionalSupply(value:unknown,ctx:WildernessIdentity&{wilderness?:WildernessState;frontierTrade?:RegionalTradeState}):value is RegionalSupplyState {try{return validate(value,ctx);}catch{return false;}}
function validate(value:unknown,ctx:WildernessIdentity&{wilderness?:WildernessState;frontierTrade?:RegionalTradeState},checkMaterials=true):value is RegionalSupplyState {
 if(!validIdentity(ctx)||!object(value))return false;if(certified.has(value as unknown as RegionalSupplyState))return value.seed===ctx.seed&&(!checkMaterials||validMaterials(value as unknown as RegionalSupplyState,ctx));
 if(!exact(value,['version','seed','revision','ticks','remainder','outposts','receipts'])||value.seed!==ctx.seed||(value.version!==1&&value.version!==2)||!integer(value.revision,0,REGIONAL_SUPPLY_MAX_REVISION)||!integer(value.ticks)||!number(value.remainder,0,REGIONAL_SUPPLY_STEP)||value.remainder>=REGIONAL_SUPPLY_STEP||!array(value.outposts,6)||!array(value.receipts,value.revision))return false;
 const s=value as unknown as RegionalSupplyState,plan=regionalSupplyPlan(ctx.seed),replayed=plan.outposts.map(p=>({id:p.id,wood:0,stone:0,started:null as number|null}));let previous=0;
 for(let i=0;i<s.receipts.length;i++){
  const r=s.receipts[i]!;if(!exact(r,['revision','tick','outpostId','kind','wood','stone'])||r.revision!==i+1||!integer(r.tick,previous,s.ticks)||!integer(r.wood,0,12)||!integer(r.stone,0,12))return false;previous=r.tick;
  const n=plan.outposts.findIndex(p=>p.id===r.outpostId);if(n<0)return false;const p=plan.outposts[n]!,o=replayed[n]!;if(o.started!==null)return false;
  if(r.kind==='deliver'){if(r.wood+r.stone===0)return false;o.wood+=r.wood;o.stone+=r.stone;if(o.wood>p.cost.wood||o.stone>p.cost.stone)return false;}
  else if(r.kind==='build'){if(r.wood!==0||r.stone!==0||o.wood!==p.cost.wood||o.stone!==p.cost.stone)return false;o.started=r.tick;}else return false;
 }
 for(let i=0;i<s.outposts.length;i++){
  const o=s.outposts[i]!,p=plan.outposts[i]!,r=replayed[i]!;
  if(!exact(o,['id','delivered','buildStartedAt','builtAt','workTicks','water','precipitation','captured','spilled','consumed','residents'])||o.id!==p.id||!exact(o.delivered,['wood','stone'])||o.delivered.wood!==r.wood||o.delivered.stone!==r.stone||o.buildStartedAt!==r.started||!number(o.workTicks,0,REGIONAL_SUPPLY_WORK_TICKS)||o.workTicks*4%1!==0||!number(o.water,0,p.capacity)||![o.precipitation,o.captured,o.spilled,o.consumed].every(v=>number(v,0,MAX_TICKS))||!array(o.residents,2))return false;
  if(o.builtAt!==null&&(!integer(o.builtAt,0,s.ticks)||o.buildStartedAt===null||o.builtAt<=o.buildStartedAt||o.workTicks!==REGIONAL_SUPPLY_WORK_TICKS))return false;
  if(o.builtAt===null&&(o.workTicks>=REGIONAL_SUPPLY_WORK_TICKS||o.precipitation!==0||o.captured!==0||o.spilled!==0||o.water!==0||o.consumed!==0))return false;
  if(o.buildStartedAt===null&&o.workTicks!==0||o.buildStartedAt!==null&&o.workTicks>(s.ticks-o.buildStartedAt)*2)return false;
  if(o.builtAt!==null&&(!close(o.precipitation,potentialRain(p,o.builtAt,s.ticks,s.version))||o.captured>o.precipitation+EPS))return false;
  let cargo=0,drunk=0;
  for(let n=0;n<o.residents.length;n++){
   const a=o.residents[n]!,path=pathLength(p.residents[n]!.path);
   if(!exact(a,['id','activity','routeProgress','actionTicks','thirst','thirstOverflow','drunk','carrying','service'])||a.id!==p.residents[n]!.id||!['waiting','to-work','working','to-water','gathering','returning','drinking'].includes(a.activity)||!number(a.routeProgress,0,path+EPS)||!integer(a.actionTicks,0,7)||!number(a.thirst,0,100)||!number(a.thirstOverflow)||!integer(a.drunk)||!(a.carrying===0||a.carrying===1)||!number(a.service,0,s.ticks*REGIONAL_SUPPLY_STEP))return false;
   if(a.thirstOverflow>Math.max(0,60+s.ticks*THIRST_PER_TICK-100)+EPS||!close(a.thirst,60+s.ticks*THIRST_PER_TICK-a.drunk*DRINK_BENEFIT-a.thirstOverflow))return false;
   if(o.buildStartedAt===null&&(a.activity!=='waiting'||a.routeProgress!==0)||o.buildStartedAt!==null&&a.activity==='waiting')return false;
   if((a.activity==='working'||a.activity==='gathering')&&!close(a.routeProgress,path)||a.activity==='drinking'&&a.routeProgress!==0)return false;
   if(a.activity==='gathering'&&a.actionTicks>3||!['gathering','drinking'].includes(a.activity)&&a.actionTicks!==0)return false;
   if(a.carrying!==((a.activity==='returning'||a.activity==='drinking')?1:0))return false;
   if(o.builtAt===null&&(a.carrying!==0||a.drunk!==0||a.service!==0||['gathering','returning','drinking','to-water'].includes(a.activity)))return false;
   if(o.builtAt!==null&&a.service>(s.ticks-o.builtAt)*REGIONAL_SUPPLY_STEP+EPS)return false;cargo+=a.carrying;drunk+=a.drunk;
  }
  if(drunk!==o.consumed||!close(o.water+cargo+o.consumed+o.spilled,o.captured))return false;
  // Reconstruct the entire deterministic actor/water snapshot, including exact construction time.
  const expected=replayOutpost(p,o.buildStartedAt,s.ticks,o.delivered,s.version);if(!expected||!sameOutpost(o,expected))return false;
  cacheReplay(ctx.seed,s.ticks,freeze(expected),s.version);
 }
 return !checkMaterials||validMaterials(s,ctx);
}
export function immutableRegionalSupply(value:unknown,ctx:WildernessIdentity&{wilderness?:WildernessState;frontierTrade?:RegionalTradeState}):RegionalSupplyState {if(!validRegionalSupply(value,ctx))throw new Error('Invalid regional supply ledger');return certified.has(value)?value:seal(copy(value));}
