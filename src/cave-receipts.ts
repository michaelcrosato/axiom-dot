import {hashSeed} from './procedural.ts';
import type {CausalState,CausalContext} from './causal.ts';

/** An additive provenance ledger. All amounts here are litres, never inventory items. */
export const CAVE_RECEIPT_HASH=hashSeed('cave-household-receipt/1/proportional-mixing/actual-delivery').toString(16).padStart(8,'0');
export interface CaveReceipts {
 version:1;hash:string;received:number;depot:number;
 carriers:{id:string;litres:number}[];
 households:{id:string;litres:number}[];
 credits:{jobId:string;litres:number;at:number}[];
}
const EPS=1e-7;
/** Independent m³/L and mixing sums: 1e-10 relative allowance, capped at 0.1 millilitre. */
export const caveReceiptTolerance=(litres:number)=>Math.min(1e-4,EPS+Math.max(0,litres)*1e-10);
export function receiveCaveWater(state:CausalState,litres:number):CausalState {
 if(!Number.isFinite(litres)||litres<=0||litres>20-state.depot+EPS)return state;
 const c=structuredClone(state),r=c.caveReceipts??{version:1 as const,hash:CAVE_RECEIPT_HASH,received:0,depot:0,carriers:c.agents.filter(a=>a.id.endsWith('/carrier')).map(a=>({id:a.id,litres:0})),households:c.settlements.map(s=>({id:s.id,litres:0})),credits:[]};
 c.caveReceipts=r;r.received+=litres;r.depot+=litres;c.depot+=litres;return c;
}
/** Called before the existing depot withdrawal, on the already cloned causal state. */
export function takeCaveCargo(c:CausalState,agentId:string,litres:number):void {
 const r=c.caveReceipts;if(!r)return;const carrier=r.carriers.find(a=>a.id===agentId);if(!carrier)return;
 const taken=Math.min(r.depot,litres===c.depot?r.depot:litres*r.depot/c.depot);r.depot-=taken;carrier.litres+=taken;
}
/** Called before the existing cargo withdrawal. A receipt is evidence only after actual delivery. */
export function deliverCaveCargo(c:CausalState,agentId:string,homeId:string,litres:number,cargoBefore:number):void {
 const r=c.caveReceipts;if(!r||litres<=0||cargoBefore<=0)return;const carrier=r.carriers.find(a=>a.id===agentId),home=r.households.find(s=>s.id===homeId);if(!carrier||!home)return;
 const delivered=Math.min(carrier.litres,litres===cargoBefore?carrier.litres:litres*carrier.litres/cargoBefore);carrier.litres-=delivered;home.litres+=delivered;
 if(delivered<=EPS)return;
 for(const j of c.jobs)if(j.kind==='water'&&j.targetId===homeId&&j.accepted&&!['completed','claimed','resolved'].includes(j.status)&&!j.playerEvidence.includes('cave')){
  j.playerContribution=true;j.playerEvidence.push('cave');r.credits.push({jobId:j.id,litres:delivered,at:c.elapsed});
 }
}
function obj(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
const num=(v:unknown,max=1e12):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;
const keys=(v:Record<string,unknown>,expected:string[])=>Object.keys(v).sort().join('|')===[...expected].sort().join('|');
/** Cross-check against the separately validated cave bridge; old causal saves need no receipt. */
export function validCaveReceipts(c:CausalState,ctx:CausalContext):boolean {try{
 const r=c.caveReceipts,external=ctx.caveSupply;
 if(external&&(!num(external.received)||typeof external.connected!=='boolean'||typeof external.available!=='boolean'||external.available&&!external.connected))return false;
 if(r===undefined)return !external||external.received===0;
 if(!external||!external.connected||!obj(r)||!keys(r,['version','hash','received','depot','carriers','households','credits'])||r.version!==1||r.hash!==CAVE_RECEIPT_HASH||!num(r.received)||!num(r.depot,c.depot+EPS)||Math.abs(r.received-external.received)>caveReceiptTolerance(r.received))return false;
 const carriers=c.agents.filter(a=>a.id.endsWith('/carrier'));
 if(!Array.isArray(r.carriers)||r.carriers.length!==carriers.length||r.carriers.some((a,i)=>!obj(a)||!keys(a,['id','litres'])||a.id!==carriers[i]!.id||!num(a.litres,carriers[i]!.cargo+EPS)))return false;
 if(!Array.isArray(r.households)||r.households.length!==c.settlements.length||r.households.some((s,i)=>!obj(s)||!keys(s,['id','litres'])||s.id!==c.settlements[i]!.id||!num(s.litres,c.settlements[i]!.delivered-c.settlements[i]!.playerDelivered+EPS)))return false;
 if(Math.abs(r.received-r.depot-r.carriers.reduce((n,a)=>n+a.litres,0)-r.households.reduce((n,s)=>n+s.litres,0))>caveReceiptTolerance(r.received))return false;
 if(!Array.isArray(r.credits)||r.credits.length>c.settlements.length||new Set(r.credits.map(x=>x.jobId)).size!==r.credits.length)return false;
 for(const credit of r.credits){const j=c.jobs.find(j=>j.id===credit.jobId),home=j&&r.households.find(s=>s.id===j.targetId);if(!obj(credit)||!keys(credit,['jobId','litres','at'])||!j||j.kind!=='water'||!j.accepted||!j.playerEvidence.includes('cave')||!home||!num(credit.litres,home.litres+EPS)||credit.litres<=EPS||!num(credit.at,c.elapsed)||credit.at<j.createdAt||j.resolvedAt!==null&&credit.at>j.resolvedAt)return false;}
 return c.jobs.every(j=>j.playerEvidence.includes('cave')===r.credits.some(x=>x.jobId===j.id));
 }catch{return false;}}
