/** Finite valley scrap escrow. Cargo has canonical pickup tombstones, never a second source of scrap. */
import {townLifeFacilities,receiveTownSupplyDelivery,validTownLife,type TownLifeState} from './town-life.ts';
export const TOWN_SUPPLY_CARRY_CAP=4;
export const TOWN_SUPPLY_SOURCE_CAP=7;
export const TOWN_SUPPLY_DELIVERY_SIZE=2;
export const TOWN_SUPPLY_MATERIAL_YIELD=12;
export interface TownSupplySource {id:string;kind:string;x:number;z:number;y?:number;label?:string}
export interface TownSupplyState {version:1;revision:number;sources:string[];carried:number;unloaded:number;deliveries:number}
export interface TownSupplyCommand {kind:'load'|'unload'|'deliver';targetId:string;expectedRevision:number}
export interface TownSupplyContext {seed:number;zone:string;player:{x:number;z:number;hp:number;feetY?:number};inventory:{scrap:number;core:number;water:number};collected:readonly string[]}
function keys(v:unknown,names:readonly string[]):v is Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))return false;const own=Reflect.ownKeys(v);return own.length===names.length&&names.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)!,'value'));}
const integer=(v:unknown,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
function array(v:unknown,max:number):v is unknown[]{return Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value'));}
function freeze<T>(v:T):T{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
function canonicalSources(sources:readonly TownSupplySource[]){const scrap=sources.filter(s=>s.kind==='scrap');return scrap.length<=7&&new Set(scrap.map(s=>s.id)).size===scrap.length&&scrap.every(s=>typeof s.id==='string'&&s.id.length>0&&s.id.length<=128&&[s.x,s.z,s.y??0].every(Number.isFinite));}
export function validTownSupplyCommand(v:unknown):v is TownSupplyCommand{return keys(v,['kind','targetId','expectedRevision'])&&['load','unload','deliver'].includes(v.kind as string)&&typeof v.targetId==='string'&&v.targetId.length>0&&v.targetId.length<=128&&integer(v.expectedRevision,14);}
export function validTownSupply(v:unknown,sources:readonly TownSupplySource[],collected:readonly string[],life:TownLifeState):v is TownSupplyState {
 if(!Array.isArray(collected)||!collected.every(c=>typeof c==='string')||!keys(v,['version','revision','sources','carried','unloaded','deliveries'])||v.version!==1||!integer(v.revision,14)||!integer(v.carried,4)||!integer(v.unloaded,7)||!integer(v.deliveries,3)||!array(v.sources,7)||!canonicalSources(sources))return false;
 const ids=v.sources;if(new Set(ids).size!==ids.length||!ids.every(id=>typeof id==='string'&&sources.some(s=>s.kind==='scrap'&&s.id===id)&&collected.filter(c=>c===id).length===1))return false;
 return ids.length===v.carried+v.unloaded+2*v.deliveries&&v.revision===ids.length+v.unloaded+v.deliveries&&v.deliveries===(life.supplyDeliveries??0);
}
export function immutableTownSupply(v:unknown,sources:readonly TownSupplySource[],collected:readonly string[],life:TownLifeState):TownSupplyState {if(!validTownSupply(v,sources,collected,life))throw RangeError('Invalid town supply cargo ledger.');return freeze(structuredClone(v));}
export function townSupplyPosition(seed:number,sources:readonly TownSupplySource[],command:Pick<TownSupplyCommand,'kind'|'targetId'>):{x:number;y:number;z:number}|null {
 if(command.kind==='load'){const s=sources.find(s=>s.kind==='scrap'&&s.id===command.targetId);return s?{x:s.x,y:s.y??0,z:s.z}:null;}
 if((command.kind!=='unload'&&command.kind!=='deliver')||command.targetId!=='workshop'||!integer(seed,0xffffffff))return null;
 const f=townLifeFacilities(seed).find(f=>f.id==='workshop')!;return {x:f.x,y:6,z:f.z};
}
export function townSupplyBlockReason(supply:TownSupplyState|undefined,sources:readonly TownSupplySource[],life:TownLifeState,ctx:TownSupplyContext,command:TownSupplyCommand):string|null {
 if(!validTownSupplyCommand(command)||!canonicalSources(sources)||ctx.seed!==life.seed||!validTownLife(life,ctx.seed))return 'Unsupported town supply delivery.';
 if(supply?!validTownSupply(supply,sources,ctx.collected,life):(life.supplyDeliveries??0)!==0)return 'The town supply cargo ledger is incomplete.';
 if(command.expectedRevision!==(supply?.revision??0))return 'The cargo changed; inspect the current load before acting.';
 const target=townSupplyPosition(ctx.seed,sources,command),p=ctx.player;
 if(ctx.zone!=='valley'||![p.x,p.z,p.hp].every(Number.isFinite)||p.hp<=0||p.hp>100||!target||Math.hypot(p.x-target.x,p.z-target.z)>3.5||p.feetY!==undefined&&(!Number.isFinite(p.feetY)||Math.abs(p.feetY-target.y)>.45))return 'Reach this salvage cache or the town workshop on foot.';
 if(!(['scrap','core','water']as const).every(k=>integer(ctx.inventory[k],1_000_000_000)))return 'Invalid explorer inventory.';
 if(command.kind==='load'){
  if(ctx.collected.includes(command.targetId)||supply?.sources.includes(command.targetId))return 'This finite salvage cache was already collected.';
  if((supply?.carried??0)>=4)return 'The supply load holds four scrap. Deliver or unload it at Second Life Salvage.';
  if((supply?.sources.length??0)>=7)return 'All eligible valley salvage sources have been used.';
 }else if(command.kind==='unload'){
  if(!supply||supply.carried<1)return 'There is no carried scrap to unload.';
  if(ctx.inventory.scrap>=1_000_000_000)return 'Your ordinary scrap inventory is full.';
 }else {
  if(!supply||supply.carried<2)return 'A workshop delivery needs two carried scrap.';
  if(supply.deliveries>=3)return 'This finite valley supply route is exhausted.';
  if(life.cooldowns.donate>0)return 'The shared donation station is cooling down; wait before delivering.';
  if(life.resources.materials>588)return 'The town material store needs room for twelve portions.';
  if(ctx.inventory.scrap>999_999_998||life.revision>=1_000_000_000||life.playerSpent.scrap>999_999_998)return 'The shared donation accounting limit has been reached.';
 }
 return null;
}
export function applyTownSupply(supply:TownSupplyState|undefined,sources:readonly TownSupplySource[],life:TownLifeState,ctx:TownSupplyContext,command:TownSupplyCommand):{supply:TownSupplyState;life:TownLifeState;inventory:TownSupplyContext['inventory'];collected:string[];message:string}|null {
 if(townSupplyBlockReason(supply,sources,life,ctx,command))return null;
 const state:TownSupplyState=supply??{version:1,revision:0,sources:[],carried:0,unloaded:0,deliveries:0};
 if(command.kind==='load')return {supply:freeze({...state,revision:state.revision+1,sources:[...state.sources,command.targetId],carried:state.carried+1}),life,inventory:{...ctx.inventory},collected:[...ctx.collected,command.targetId],message:'Loaded one finite valley scrap for town supply. It is carried cargo until delivered or unloaded at Second Life Salvage.'};
 if(command.kind==='unload')return {supply:freeze({...state,revision:state.revision+1,carried:state.carried-1,unloaded:state.unloaded+1}),life,inventory:{...ctx.inventory,scrap:ctx.inventory.scrap+1},collected:[...ctx.collected],message:'Unloaded one carried scrap into your ordinary inventory. Its source stays collected.'};
 // The existing donation kernel spends these two escrow units exactly once;
 // its playerSpent ledger accounts for them, leaving ordinary inventory intact.
 const result=receiveTownSupplyDelivery(life,{...ctx,inventory:{...ctx.inventory,scrap:ctx.inventory.scrap+2}});if(!result)return null;
 return {supply:freeze({...state,revision:state.revision+1,carried:state.carried-2,deliveries:state.deliveries+1}),life:result.life,inventory:result.inventory,collected:[...ctx.collected],message:'Delivered two carried scrap: twelve shared town materials are ready for construction and maintenance.'};
}
export const TOWN_SUPPLY_ENGINE=Object.freeze({kind:'axiom-town-supply' as const,apply:applyTownSupply,validate:validTownSupply,immutable:immutableTownSupply,command:validTownSupplyCommand,position:townSupplyPosition,blockReason:townSupplyBlockReason});
