import {hashSeed} from './procedural.ts';
import {naturalCave} from './natural-cave.ts';
import {advanceCaveWater,CAVE_WATER_STEP,type CaveWaterState,type CaveWaterContext,type CaveInventory} from './cave-water.ts';
import {advanceCausal,causalPlan,CAUSAL_STEP,type CausalState,type CausalContext} from './causal.ts';
import {receiveCaveWater} from './cave-receipts.ts';

export const CAVE_SUPPLY_MANIFEST=Object.freeze({version:1,algorithm:'metered-outfall/1',litresPerCubicMetre:1000,litresPerSecond:.5,scrapCost:2,control:'drain',depotCapacity:20,overflowPolicy:'discard-immediately'});
export const CAVE_SUPPLY_HASH=hashSeed(JSON.stringify(CAVE_SUPPLY_MANIFEST)).toString(16).padStart(8,'0');
/** Every stream counter is m³. Baseline predates this optional bridge and is unrecoverable. */
export interface CaveSupplyStream {baseline:number;seen:number;captured:number;discarded:number}
export interface CaveSupplyState {
 version:1;hash:string;seed:number;connected:boolean;connectedAt:number|null;
 baselineElapsed:number;elapsed:number;pumped:CaveSupplyStream;drained:CaveSupplyStream;
}
export type CaveSupplyCommand={type:'connect-outfall'};
const EPS=1e-8;
export function createCaveSupply(seed:number,cave:CaveWaterState):CaveSupplyState {
 const stream=(total:number):CaveSupplyStream=>({baseline:total,seen:total,captured:0,discarded:0});
 return {version:1,hash:CAVE_SUPPLY_HASH,seed,connected:false,connectedAt:null,baselineElapsed:cave.elapsed,elapsed:cave.elapsed,pumped:stream(cave.pumped),drained:stream(cave.drained)};
}
export function caveSupplyCost(state:CaveSupplyState|undefined):CaveInventory {return {scrap:state?.connected?CAVE_SUPPLY_MANIFEST.scrapCost:0,core:0,water:0};}
export function caveSupplyContext(state:CaveSupplyState,cave:CaveWaterState):NonNullable<CausalContext['caveSupply']> {
 return {received:(state.pumped.captured+state.drained.captured)*1000,connected:state.connected,available:state.connected&&cave.sourceOpen};
}
/** Paid once at the existing dry drain control. No water, goods or contribution is created here. */
export function applyCaveSupplyCommand(state:CaveSupplyState,cave:CaveWaterState,ctx:CaveWaterContext,command:CaveSupplyCommand):{state:CaveSupplyState;inventory:CaveInventory;message:string} {
 const no=(message:string)=>({state,inventory:ctx.inventory,message});
 if(command.type!=='connect-outfall'||state.connected)return no('The outfall connection is already installed.');
 if(ctx.zone!=='cave'||!Number.isFinite(ctx.hp)||ctx.hp<=0)return no('Enter the river cave to connect the outfall.');
 const anchor=naturalCave(state.seed).anchors.drain;
 if(!Number.isFinite(ctx.player.x)||!Number.isFinite(ctx.player.z)||Math.hypot(ctx.player.x-anchor.x,ctx.player.z-anchor.z)>3.5)return no('Reach the dry-bank drain control to connect the outfall.');
 if(cave.seed!==state.seed||cave.elapsed!==state.elapsed||cave.pumped!==state.pumped.seen||cave.drained!==state.drained.seen)return no('Wait for the cave flow record to synchronize.');
 if(![ctx.inventory.scrap,ctx.inventory.core,ctx.inventory.water].every(n=>Number.isSafeInteger(n)&&n>=0)||ctx.inventory.scrap<2)return no('The metered outfall connection requires 2 scrap.');
 return {state:{...state,connected:true,connectedAt:cave.elapsed+cave.remainder},inventory:{...ctx.inventory,scrap:ctx.inventory.scrap-2},message:'Spent 2 scrap connecting the cave outfall. New pumped or drained water can supply the household loading depot at up to 0.5 L/s; carriers must still deliver it.'};
}
/** Consume only a newly committed cave step. Capture/discard partition the exact two physical sinks. */
function captureStep(state:CaveSupplyState,cave:CaveWaterState,causal:CausalState):{supply:CaveSupplyState;causal:CausalState} {
 if(cave.elapsed<=state.elapsed)return {supply:state,causal};
 const pumped=Math.max(0,cave.pumped-state.pumped.seen),drained=Math.max(0,cave.drained-state.drained.seen),fresh=pumped+drained;
 const capacity=state.connected?Math.max(0,Math.min(.5*Math.max(0,cave.elapsed-Math.max(state.elapsed,state.connectedAt??cave.elapsed)),20-causal.depot))/1000:0;
 const captured=Math.min(fresh,capacity),pumpCapture=fresh>0?Math.min(pumped,captured,captured*(pumped/fresh)):0,drainCapture=Math.min(drained,Math.max(0,captured-pumpCapture));
 const stream=(old:CaveSupplyStream,total:number,amount:number,kept:number):CaveSupplyStream=>({...old,seen:total,captured:old.captured+kept,discarded:old.discarded+amount-kept});
 const supply={...state,elapsed:cave.elapsed,pumped:stream(state.pumped,cave.pumped,pumped,pumpCapture),drained:stream(state.drained,cave.drained,drained,drainCapture)};
 return {supply,causal:receiveCaveWater(causal,(pumpCapture+drainCapture)*1000)};
}
/**
 * Host tick adapter. Owns BOTH cave and causal advancement when this bridge is present.
 * Splits only at existing clock boundaries, never rewrites their remainders or catches up offline.
 * Input above one second is dropped, matching both legacy simulation budgets.
 */
export function advanceCaveSettlement(cave:CaveWaterState,supply:CaveSupplyState,causal:CausalState,ctx:CausalContext,dt:number):{cave:CaveWaterState;supply:CaveSupplyState;causal:CausalState} {
 const unchanged={cave,supply,causal};
 if(!Number.isFinite(dt)||dt<=0||!Number.isFinite(ctx.player.hp)||ctx.player.hp<=0||ctx.seed!==cave.seed||ctx.seed!==supply.seed||supply.elapsed!==cave.elapsed||supply.pumped.seen!==cave.pumped||supply.drained.seen!==cave.drained)return unchanged;
 let remaining=Math.min(1,dt),next=unchanged;
 // At most four cave boundaries and four causal boundaries plus the final partial slice.
 for(let event=0;event<12&&remaining>1e-12;event++){
  const slice=Math.min(remaining,Math.max(1e-10,CAVE_WATER_STEP-next.cave.remainder),Math.max(1e-10,CAUSAL_STEP-next.causal.accumulator));
  const wet=advanceCaveWater(next.cave,slice),captured=captureStep(next.supply,wet,next.causal);
  const residents=advanceCausal(captured.causal,{...ctx,caveSupply:caveSupplyContext(captured.supply,wet)},slice);
  next={cave:wet,supply:captured.supply,causal:residents};remaining=Math.max(0,remaining-slice);
 }
 return next;
}
function obj(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
const num=(v:unknown,max=1e9):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;
const keys=(v:Record<string,unknown>,expected:string[])=>Object.keys(v).sort().join('|')===[...expected].sort().join('|');
/** Present malformed bridge data is rejected. Optional absence is migrated by the host only. */
export function validCaveSupply(value:unknown,seed:number,cave:CaveWaterState):value is CaveSupplyState {try{
 if(!obj(value)||!keys(value,['version','hash','seed','connected','connectedAt','baselineElapsed','elapsed','pumped','drained'])||value.version!==1||value.hash!==CAVE_SUPPLY_HASH||value.seed!==seed||cave.seed!==seed||typeof value.connected!=='boolean'||!num(value.baselineElapsed,cave.elapsed)||value.elapsed!==cave.elapsed||!Number.isInteger(value.baselineElapsed/CAVE_WATER_STEP))return false;
 const s=value as unknown as CaveSupplyState;
 if(s.connected?(!num(s.connectedAt,cave.elapsed+cave.remainder+EPS)||s.connectedAt<s.baselineElapsed):s.connectedAt!==null)return false;
 for(const kind of ['pumped','drained'] as const){const stream=s[kind];if(!obj(stream)||!keys(stream,['baseline','seen','captured','discarded'])||!['baseline','seen','captured','discarded'].every(k=>num(stream[k as keyof CaveSupplyStream]))||stream.seen!==cave[kind]||stream.baseline>stream.seen)return false;
  if(Math.abs(stream.baseline+stream.captured+stream.discarded-stream.seen)>EPS+1e-10*stream.seen||stream.captured>stream.seen-stream.baseline+EPS||!s.connected&&stream.captured!==0)return false;
 }
 return (s.pumped.captured+s.drained.captured)*1000<=.5*(s.connected?Math.max(0,cave.elapsed-s.connectedAt!):0)+EPS;
 }catch{return false;}}
export function caveSupplyView(supply:CaveSupplyState){return {connected:supply.connected,rate:.5,capturedLitres:(supply.pumped.captured+supply.drained.captured)*1000,discardedCubicMetres:supply.pumped.discarded+supply.drained.discarded,historicalCubicMetres:supply.pumped.baseline+supply.drained.baseline};}

/** Combined cave + household boundary balance in litres; captured water is internal transfer. */
export function caveSettlementWaterBalance(cave:CaveWaterState,causal:CausalState):number {
 const initialHouseholds=causalPlan(cave.seed).settlements.reduce((n,s)=>n+s.initialWater,0);
 const inputs=1000*(cave.initial+cave.extracted)+initialHouseholds+causal.extracted+causal.networkCaptured+causal.playerWater;
 const outside=1000*(cave.pumped+cave.drained+cave.spilled)-(causal.caveReceipts?.received??0);
 const inside=1000*cave.volume.reduce((n,v)=>n+v,0)+causal.depot+causal.agents.reduce((n,a)=>n+a.cargo,0)+causal.settlements.reduce((n,s)=>n+s.reserve+s.consumed,0);
 return inputs-outside-inside;
}
