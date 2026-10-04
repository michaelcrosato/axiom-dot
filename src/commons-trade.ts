import {applyCausalCommand,causalPlan,type CausalContext,type CausalState} from './causal.ts';
import {hashSeed} from './procedural.ts';

/** A transfer of finite NPC repair stock, never a new resource grant or currency. */
export const COMMONS_TRADE_RULES=Object.freeze({version:1,canisterLitres:4,scrapPerCanister:1,demandBelowLitres:6,maxExchanges:4});
export const COMMONS_TRADE_HASH=hashSeed(JSON.stringify(COMMONS_TRADE_RULES)).toString(16).padStart(8,'0');
export type CommonsTradeCommand={type:'water-for-scrap';settlementId:string;expectedRevision:number};
export interface CommonsTradeReceipt {
 id:string;revision:number;at:number;settlementId:string;
 water:{playerCanisters:1;householdLitres:4};scrap:{communalDebit:1;playerCredit:1};
 before:{materials:number;agentMaterialsSpent:number;playerWater:number;reserve:number;delivered:number;playerDelivered:number;consumed:number};
}
export interface CommonsTradeState {
 version:1;hash:string;planId:string;startedAt:number;revision:number;
 baseline:{materials:number;agentMaterialsSpent:number;playerWater:number;homes:{id:string;playerDelivered:number}[]};
 records:CommonsTradeReceipt[];
}
const EPS=1e-6;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,list:string[])=>Object.keys(v).length===list.length&&list.every(k=>Object.hasOwn(v,k));
const number=(v:unknown,max=1e9):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;
const integer=(v:unknown,max=1e9):v is number=>number(v,max)&&Number.isSafeInteger(v);
const same=(a:number,b:number)=>Math.abs(a-b)<=EPS;
/** Explicit activation records only the present baseline; past deliveries earn nothing. */
export function createCommonsTrade(seed:number,c:CausalState):CommonsTradeState {
 return {version:1,hash:COMMONS_TRADE_HASH,planId:`commons-trade:1:${seed}`,startedAt:c.elapsed,revision:0,baseline:{materials:c.materials,agentMaterialsSpent:c.agentMaterialsSpent,playerWater:c.playerWater,homes:c.settlements.map(s=>({id:s.id,playerDelivered:s.playerDelivered}))},records:[]};
}
/** Validate the bounded receipts before deriving any world-resource credit. */
export function validCommonsTrade(value:unknown,seed:number,c:CausalState):value is CommonsTradeState {try{return validate(value,seed,c);}catch{return false;}}
function validate(value:unknown,seed:number,c:CausalState):value is CommonsTradeState {
 if(!object(value)||!keys(value,['version','hash','planId','startedAt','revision','baseline','records'])||value.version!==1||value.hash!==COMMONS_TRADE_HASH||value.planId!==`commons-trade:1:${seed}`)return false;
 const s=value as unknown as CommonsTradeState,p=causalPlan(seed),base=s.baseline;
 if(!number(c.elapsed)||!integer(c.materials,p.initialMaterials)||!integer(c.agentMaterialsSpent,p.initialMaterials)||!integer(c.playerWater)||c.playerWater%4||!number(s.startedAt,c.elapsed)||!integer(s.revision,COMMONS_TRADE_RULES.maxExchanges)||!Array.isArray(s.records)||s.records.length!==s.revision||!object(base)||!keys(base,['materials','agentMaterialsSpent','playerWater','homes']))return false;
 if(!integer(base.materials,p.initialMaterials)||!integer(base.agentMaterialsSpent,c.agentMaterialsSpent)||base.materials+base.agentMaterialsSpent!==p.initialMaterials||!integer(base.playerWater,c.playerWater)||base.playerWater%4||!Array.isArray(base.homes)||base.homes.length!==p.settlements.length||!Array.isArray(c.settlements)||c.settlements.length!==p.settlements.length)return false;
 if(c.materials+c.agentMaterialsSpent+s.revision!==p.initialMaterials)return false;
 const homes=new Map<string,{playerDelivered:number;delivered:number;consumed:number}>();
 for(const [i,home]of base.homes.entries()){
  const live=c.settlements[i];if(!object(home)||!keys(home,['id','playerDelivered'])||home.id!==p.settlements[i]!.id||!live||live.id!==home.id||!integer(live.playerDelivered)||!number(live.delivered)||!number(live.consumed)||!integer(home.playerDelivered,live.playerDelivered)||home.playerDelivered%4)return false;
  homes.set(home.id,{playerDelivered:home.playerDelivered,delivered:home.playerDelivered,consumed:0});
 }
 if(base.homes.reduce((n,h)=>n+h.playerDelivered,0)!==base.playerWater)return false;
 let at=s.startedAt,agentSpent=base.agentMaterialsSpent,playerWater=base.playerWater;
 for(const [i,r]of s.records.entries()){
  if(!object(r)||!keys(r,['id','revision','at','settlementId','water','scrap','before'])||r.id!==`${s.planId}/exchange/${i+1}`||r.revision!==i+1||!number(r.at,c.elapsed)||r.at<at||!homes.has(r.settlementId)||!object(r.water)||!keys(r.water,['playerCanisters','householdLitres'])||r.water.playerCanisters!==1||r.water.householdLitres!==4||!object(r.scrap)||!keys(r.scrap,['communalDebit','playerCredit'])||r.scrap.communalDebit!==1||r.scrap.playerCredit!==1||!object(r.before)||!keys(r.before,['materials','agentMaterialsSpent','playerWater','reserve','delivered','playerDelivered','consumed']))return false;
  const b=r.before,home=homes.get(r.settlementId)!,def=p.settlements.find(h=>h.id===r.settlementId)!;
  if(!integer(b.materials,base.materials)||b.materials<1||!integer(b.agentMaterialsSpent,c.agentMaterialsSpent)||b.agentMaterialsSpent<agentSpent||b.materials+b.agentMaterialsSpent+i!==p.initialMaterials||!integer(b.playerWater,c.playerWater-4)||b.playerWater%4||b.playerWater<playerWater||!number(b.reserve)||b.reserve>=COMMONS_TRADE_RULES.demandBelowLitres||!number(b.delivered)||b.delivered<home.delivered||!integer(b.playerDelivered,b.delivered)||b.playerDelivered%4||b.playerDelivered<home.playerDelivered||!number(b.consumed)||b.consumed<home.consumed||!same(b.reserve+b.consumed,def.initialWater+b.delivered))return false;
  if(b.playerWater<b.playerDelivered+[...homes].filter(([id])=>id!==r.settlementId).reduce((n,[,h])=>n+h.playerDelivered,0))return false;
  homes.set(r.settlementId,{playerDelivered:b.playerDelivered+4,delivered:b.delivered+4,consumed:b.consumed});at=r.at;agentSpent=b.agentMaterialsSpent;playerWater=b.playerWater+4;
 }
 if(playerWater>c.playerWater)return false;
 for(const live of c.settlements){const h=homes.get(live.id);if(!h||live.playerDelivered<h.playerDelivered||live.delivered+EPS<h.delivered||live.consumed+EPS<h.consumed)return false;}
 return true;
}
/** Invalid optional data never produces a spendable credit, even during context construction. */
export function commonsTradeExports(c:CausalState|undefined,seed:number):number {return c&&Object.hasOwn(c,'commonsTrade')&&validCommonsTrade(c.commonsTrade,seed,c)?c.commonsTrade!.revision:0;}
/** Commit causal water, communal debit, player credit and receipt together, or do nothing. */
export function applyCommonsTrade(c:CausalState,ctx:CausalContext,command:CommonsTradeCommand):{state:CausalState;inventory:CausalContext['inventory'];message:string} {
 const unchanged={state:c,inventory:ctx.inventory,message:''},s=c.commonsTrade;
 if(ctx.zone!=='valley'||!Number.isFinite(ctx.player.x)||!Number.isFinite(ctx.player.z)||!number(ctx.player.hp,100)||ctx.player.hp<=0)return unchanged;
 if(!s||!validCommonsTrade(s,ctx.seed,c)||!object(command)||!keys(command,['type','settlementId','expectedRevision'])||command.type!=='water-for-scrap'||!integer(command.expectedRevision,COMMONS_TRADE_RULES.maxExchanges)||command.expectedRevision!==s.revision||s.revision>=COMMONS_TRADE_RULES.maxExchanges||c.materials<1||!integer(ctx.inventory.water)||!integer(ctx.inventory.scrap))return unchanged;
 const home=c.settlements.find(h=>h.id===command.settlementId);if(!home||home.reserve>=COMMONS_TRADE_RULES.demandBelowLitres)return unchanged;
 const delivered=applyCausalCommand(c,ctx,{type:'deliver-water',settlementId:home.id});if(delivered.state===c)return unchanged;
 const revision=s.revision+1,receipt:CommonsTradeReceipt={id:`${s.planId}/exchange/${revision}`,revision,at:c.elapsed,settlementId:home.id,water:{playerCanisters:1,householdLitres:4},scrap:{communalDebit:1,playerCredit:1},before:{materials:c.materials,agentMaterialsSpent:c.agentMaterialsSpent,playerWater:c.playerWater,reserve:home.reserve,delivered:home.delivered,playerDelivered:home.playerDelivered,consumed:home.consumed}};
 const state={...delivered.state,materials:c.materials-1,commonsTrade:{...s,revision,records:[...s.records,receipt]}},inventory={...delivered.inventory,scrap:delivered.inventory.scrap+1};
 return {state,inventory,message:`Exchanged one canister: 4 L reached ${causalPlan(ctx.seed).settlements.find(h=>h.id===home.id)!.name}; 1 communal repair scrap transferred to expedition inventory. ${state.materials} communal scrap remains for builders.`};
}
/** Factual grammar derives solely from committed receipts; no invented historical lore. */
export function commonsTradeView(c:CausalState,seed:number){
 const p=causalPlan(seed),s=c.commonsTrade,valid=s!==undefined&&validCommonsTrade(s,seed,c);
 return {materials:c.materials,exports:valid?s.revision:0,revision:valid?s.revision:0,history:valid?s.records.map(r=>({id:r.id,at:r.at,text:`${p.settlements.find(h=>h.id===r.settlementId)!.name} received ${r.water.householdLitres} L from one expedition canister and transferred ${r.scrap.playerCredit} communal repair scrap to the expedition. ${r.before.materials-r.scrap.communalDebit} communal scrap remained immediately after this exchange.`})):[],households:p.settlements.map(h=>({...h,reserve:c.settlements.find(live=>live.id===h.id)!.reserve}))};
}
