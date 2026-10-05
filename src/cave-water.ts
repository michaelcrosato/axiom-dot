import {hashSeed} from './procedural.ts';
import {CAVE_HASH,naturalCave,caveWalkable,type CavePlan,type CavePoint} from './natural-cave.ts';
import {RESTORE_CAPSULE_RADIUS} from './building.ts';

/** Finite-volume compartment water, not a pressure / Navier–Stokes fluid solver. */
export const CAVE_WATER_VERSION=1;
export const CAVE_FLOOD_DEPTH=.45;
export const CAVE_WATER_STEP=.25;
export const CAVE_MAX_STEPS=4;
export const CAVE_WATER_RATES=Object.freeze({source:2,seep:1.1,clearedDrain:5.5,pump:7,conductance:20});
export const CAVE_REPAIR_COSTS=Object.freeze({valve:Object.freeze({scrap:2,core:0}),pump:Object.freeze({scrap:1,core:1}),drain:Object.freeze({scrap:1,core:0})});
export const CAVE_WATER_HASH=hashSeed(JSON.stringify([CAVE_HASH,CAVE_WATER_VERSION,CAVE_FLOOD_DEPTH,CAVE_WATER_STEP,CAVE_MAX_STEPS,CAVE_WATER_RATES,CAVE_REPAIR_COSTS])).toString(16).padStart(8,'0');
export interface CaveInventory {scrap:number;core:number;water:number}
export interface CaveWaterState {
 version:1;hash:string;seed:number;volume:[number,number,number];
 initial:number;extracted:number;pumped:number;drained:number;spilled:number;
 valveRepaired:boolean;sourceOpen:boolean;pumpRepaired:boolean;pumpOn:boolean;drainCleared:boolean;
 playerSpent:CaveInventory;elapsed:number;remainder:number;
}
export type CaveWaterCommand={type:'repair-valve'|'repair-pump'|'clear-drain'}|{type:'set-source'|'set-pump';on:boolean};
export interface CaveWaterContext {inventory:CaveInventory;player:CavePoint;zone:string;hp:number}
export interface CaveFloodObstacle extends CavePoint {id:string;hx:number;hz:number;hy:number;y:number;depth:number;basin:0|1|2}
export interface CaveWaterSurface extends CavePoint {id:string;y:number;hx:number;hz:number;depth:number;basin:0|1|2}
const sum=(v:readonly number[])=>v.reduce((a,b)=>a+b,0);
export function createCaveWater(seed:number):CaveWaterState {
 const plan=naturalCave(seed),volume=plan.basins.map(b=>b.area*.9) as [number,number,number];
 return {version:1,hash:CAVE_WATER_HASH,seed,volume,initial:sum(volume),extracted:0,pumped:0,drained:0,spilled:0,valveRepaired:false,sourceOpen:true,pumpRepaired:false,pumpOn:false,drainCleared:false,playerSpent:{scrap:0,core:0,water:0},elapsed:0,remainder:0};
}
export function caveWaterCost(state:CaveWaterState|undefined):CaveInventory {
 return {scrap:(state?.valveRepaired?2:0)+(state?.pumpRepaired?1:0)+(state?.drainCleared?1:0),core:state?.pumpRepaired?1:0,water:0};
}
export function caveDepth(state:CaveWaterState,basin:0|1|2,plan=naturalCave(state.seed)):number {return state.volume[basin]/plan.basins[basin].area;}
export function caveRouteOpen(state:CaveWaterState,plan=naturalCave(state.seed)):boolean {return plan.basins.every(b=>caveDepth(state,b.index,plan)<=CAVE_FLOOD_DEPTH);}
export function caveWaterBalance(state:CaveWaterState):number {return state.initial+state.extracted-sum(state.volume)-state.pumped-state.drained-state.spilled;}

/** Conservation-preserving simultaneous edge transfers: donor and receiver budgets are scaled before application. */
function stepWater(state:CaveWaterState,plan:CavePlan):CaveWaterState {
 const dt=CAVE_WATER_STEP,volume=[...state.volume] as [number,number,number],capacities=plan.basins.map(b=>b.area*b.maxDepth),source=state.sourceOpen?CAVE_WATER_RATES.source*dt:0;
 volume[0]+=source;const spill=Math.max(0,volume[0]-capacities[0]!);volume[0]-=spill;
 const transfers:{from:0|1|2;to:0|1|2;amount:number}[]=[];
 for(const [a,b]of [[0,1],[1,2]] as const){
  const da=volume[a]/plan.basins[a].area,db=volume[b]/plan.basins[b].area,diff=da-db;
  if(Math.abs(diff)<1e-12)continue;
  const from=diff>0?a:b,to=diff>0?b:a;
  const amount=Math.min(Math.abs(diff)*CAVE_WATER_RATES.conductance*dt,Math.abs(diff)/(1/plan.basins[a].area+1/plan.basins[b].area));
  transfers.push({from,to,amount});
 }
 const out=[0,0,0],incoming=[0,0,0];for(const t of transfers)out[t.from]!+=t.amount;
 for(const t of transfers)t.amount*=Math.min(1,volume[t.from]/out[t.from]!);
 for(const t of transfers)incoming[t.to]!+=t.amount;
 for(const t of transfers)t.amount*=Math.min(1,Math.max(0,capacities[t.to]!-volume[t.to])/incoming[t.to]!);
 for(const t of transfers){volume[t.from]-=t.amount;volume[t.to]+=t.amount;}
 const drained=Math.min(volume[2],(CAVE_WATER_RATES.seep+(state.drainCleared?CAVE_WATER_RATES.clearedDrain:0))*dt);volume[2]-=drained;
 const pumped=state.pumpRepaired&&state.pumpOn?Math.min(volume[1],CAVE_WATER_RATES.pump*dt):0;volume[1]-=pumped;
 return {...state,volume,extracted:state.extracted+source,spilled:state.spilled+spill,drained:state.drained+drained,pumped:state.pumped+pumped,elapsed:state.elapsed+dt};
}
/** At most four quarter-second steps per call. Time beyond one second is intentionally not caught up. */
export function advanceCaveWater(state:CaveWaterState,dt:number):CaveWaterState {
 if(!Number.isFinite(dt)||dt<=0||state.elapsed>=1e8)return state;
 const plan=naturalCave(state.seed);let remaining=state.remainder+Math.min(dt,CAVE_WATER_STEP*CAVE_MAX_STEPS),next=state,steps=0;
 while(remaining+1e-10>=CAVE_WATER_STEP&&steps<CAVE_MAX_STEPS&&next.elapsed<1e8){next=stepWater(next,plan);remaining-=CAVE_WATER_STEP;steps++;}
 return {...next,remainder:Math.max(0,Math.min(CAVE_WATER_STEP-Number.EPSILON,remaining))};
}

/** Reducer returns unchanged references on denial. It can run in a future authoritative server. */
export function applyCaveWaterCommand(state:CaveWaterState,ctx:CaveWaterContext,command:CaveWaterCommand):{state:CaveWaterState;inventory:CaveInventory;message:string} {
 const no=(message:string)=>({state,inventory:ctx.inventory,message});
 if(ctx.zone!=='cave'||!Number.isFinite(ctx.hp)||ctx.hp<=0)return no('Enter the river cave to operate its machinery.');
 const plan=naturalCave(state.seed),kind=command.type==='repair-valve'||command.type==='set-source'?'valve':command.type==='repair-pump'||command.type==='set-pump'?'pump':command.type==='clear-drain'?'drain':null;
 if(!kind)return no('Unknown cave machinery command.');
 const anchor=plan.anchors[kind];if(!Number.isFinite(ctx.player.x)||!Number.isFinite(ctx.player.z)||Math.hypot(ctx.player.x-anchor.x,ctx.player.z-anchor.z)>3.5)return no('Move within reach of the machinery in Fernlight cavern.');
 if(command.type==='set-source'){
  if(typeof command.on!=='boolean'||!state.valveRepaired||state.sourceOpen===command.on)return no('Repair the source valve before changing the gate.');
  return {state:{...state,sourceOpen:command.on},inventory:ctx.inventory,message:command.on?'Source gate opened. The narrows will flood again unless drainage keeps up.':'Source gate closed. The natural sump continues draining.'};
 }
 if(command.type==='set-pump'){
  if(typeof command.on!=='boolean'||!state.pumpRepaired||state.pumpOn===command.on)return no('Repair the pump before changing its power.');
  return {state:{...state,pumpOn:command.on},inventory:ctx.inventory,message:command.on?'Cave pump switched on. Water is discharged outside the cave.':'Cave pump switched off.'};
 }
 if((kind==='valve'&&state.valveRepaired)||(kind==='pump'&&state.pumpRepaired)||(kind==='drain'&&state.drainCleared))return no('That repair is already complete.');
 const cost=CAVE_REPAIR_COSTS[kind];
 if(![ctx.inventory.scrap,ctx.inventory.core,ctx.inventory.water].every(n=>Number.isSafeInteger(n)&&n>=0)||ctx.inventory.scrap<cost.scrap||ctx.inventory.core<cost.core)return no(`Requires ${cost.scrap} scrap${cost.core?' and 1 core':''}.`);
 let next={...state};if(kind==='valve')next={...next,valveRepaired:true,sourceOpen:false};else if(kind==='pump')next={...next,pumpRepaired:true,pumpOn:true};else next={...next,drainCleared:true};
 next.playerSpent=caveWaterCost(next);
 return {state:next,inventory:{...ctx.inventory,scrap:ctx.inventory.scrap-cost.scrap,core:ctx.inventory.core-cost.core},message:kind==='valve'?'Source valve repaired and closed. Spent 2 scrap; wait for the natural sump to drain.':kind==='pump'?'Cave pump repaired and running. Spent 1 scrap and 1 core; floodwater is pumping outside.':'Sump drain cleared. Spent 1 scrap; the lower watercourse can now carry the source flow.'};
}

/** Physical access gates cover the actual wet tile footprints; tall risk barriers prevent a jump bypass. */
export function caveFloodObstacles(state:CaveWaterState,plan=naturalCave(state.seed)):CaveFloodObstacle[] {
 return plan.basins.flatMap(b=>{const depth=caveDepth(state,b.index,plan);return depth>CAVE_FLOOD_DEPTH?b.tiles.map(t=>({id:`${b.id}/flood/${t.x}/${t.z}`,...t,hx:1,hz:1,hy:2.4,y:2.4,depth,basin:b.index})):[];});
}
export function caveWaterSurfaces(state:CaveWaterState,plan=naturalCave(state.seed)):CaveWaterSurface[] {
 return plan.basins.flatMap(b=>{const depth=caveDepth(state,b.index,plan);return depth>.002?b.tiles.map(t=>({id:`${b.id}/surface/${t.x}/${t.z}`,...t,y:b.floorY+depth,hx:1,hz:1,depth,basin:b.index})):[];});
}
export function caveNavigable(state:CaveWaterState,point:CavePoint,radius=.34,plan=naturalCave(state.seed)):boolean {
 return caveWalkable(plan,point.x,point.z,radius)&&!caveFloodObstacles(state,plan).some(o=>Math.abs(point.x-o.x)<o.hx+radius&&Math.abs(point.z-o.z)<o.hz+radius);
}
/** Loading or newly rising water cannot embed or trap a player. Dry far-bank return remains available. */
/** Restore-only check with a round 0.33 m footprint: the controller rests 0.02 m (skin)
 * from walls and Rapier settles a few 1e-5 m inside that, so the square 0.34 m
 * navigation test rejected legitimate wall- and corner-resting saved poses. */
function caveRestorable(state:CaveWaterState,point:CavePoint,plan:CavePlan):boolean {
 if(!Number.isFinite(point.x)||!Number.isFinite(point.z)||!plan.tiles.some(t=>Math.abs(t.x-point.x)<=1&&Math.abs(t.z-point.z)<=1))return false;
 const touches=(o:{x:number;z:number;hx:number;hz:number})=>Math.hypot(Math.max(0,Math.abs(o.x-point.x)-o.hx),Math.max(0,Math.abs(o.z-point.z)-o.hz))<RESTORE_CAPSULE_RADIUS;
 return !plan.walls.some(touches)&&!caveFloodObstacles(state,plan).some(touches);
}
export function safeCavePosition(state:CaveWaterState,point:CavePoint,plan=naturalCave(state.seed)):CavePoint {
 if(caveRestorable(state,point,plan))return point;
 const banks=plan.returnAnchors.filter(p=>caveNavigable(state,p,.34,plan));
 banks.sort((a,b)=>Math.hypot(point.x-a.x,point.z-a.z)-Math.hypot(point.x-b.x,point.z-b.z));
 return {...(banks[0]??plan.spawn)};
}
function object(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
const bounded=(v:unknown,max=1e9):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;
/** Optional absence is handled by the parent save migration, never by accepting malformed present data. */
export function validCaveWater(value:unknown,seed:number):value is CaveWaterState {
 if(!object(value)||value.version!==1||value.hash!==CAVE_WATER_HASH||value.seed!==seed||!Number.isInteger(seed)||seed<0||seed>0xffffffff)return false;
 const plan=naturalCave(seed);
 if(!Array.isArray(value.volume)||value.volume.length!==3||!value.volume.every((v,i)=>bounded(v,plan.basins[i]!.area*plan.basins[i]!.maxDepth)))return false;
 if(!['initial','extracted','pumped','drained','spilled'].every(k=>bounded(value[k]))||!bounded(value.elapsed,1e8)||!bounded(value.remainder,CAVE_WATER_STEP)||value.remainder===CAVE_WATER_STEP||Math.abs(value.elapsed/CAVE_WATER_STEP-Math.round(value.elapsed/CAVE_WATER_STEP))>1e-6)return false;
 if(!['valveRepaired','sourceOpen','pumpRepaired','pumpOn','drainCleared'].every(k=>typeof value[k]==='boolean')||(!value.valveRepaired&&!value.sourceOpen)||(!value.pumpRepaired&&value.pumpOn))return false;
 if(!object(value.playerSpent))return false;
 const state=value as unknown as CaveWaterState,cost=caveWaterCost(state),initial=createCaveWater(seed).initial,spent=value.playerSpent;
 if(value.initial!==initial||!(['scrap','core','water'] as const).every(k=>spent[k]===cost[k]))return false;
 const tolerance=1e-7+1e-10*(state.initial+state.extracted);
 if((!state.pumpRepaired&&state.pumped!==0)||(!state.valveRepaired&&Math.abs(state.extracted-CAVE_WATER_RATES.source*state.elapsed)>tolerance))return false;
 if(Math.abs(caveWaterBalance(state))>tolerance||state.extracted>CAVE_WATER_RATES.source*state.elapsed+tolerance||state.pumped>(state.pumpRepaired?CAVE_WATER_RATES.pump*state.elapsed:0)+tolerance||state.drained>(CAVE_WATER_RATES.seep+(state.drainCleared?CAVE_WATER_RATES.clearedDrain:0))*state.elapsed+tolerance)return false;
 if(state.elapsed===0&&(state.volume.some((v,i)=>v!==plan.basins[i]!.area*.9)||state.extracted!==0||state.pumped!==0||state.drained!==0||state.spilled!==0))return false;
 return true;
}
