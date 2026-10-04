import {hashSeed} from './procedural.ts';
import {causalPlan,type CausalState,type CausalPlan,type CausalContext} from './causal.ts';
import {worldValley} from './generation.ts';
import {valleySurfaceHeight} from './valley.ts';

/** Additive request pack; founding identities, reward budgets and water remain canonical. */
export const WATER_REQUEST_RULES=Object.freeze({version:1,receiptEncoding:'event-code-tuple-1',relief:8,shortage:3,consumption:5,completion:6,reward:4,deadline:180,claimWindow:180,maxPerHome:8,maxRecords:82});
export const WATER_REQUEST_HASH=hashSeed(JSON.stringify(WATER_REQUEST_RULES)).toString(16).padStart(8,'0');
export type WaterRequestCommand={type:'accept'|'claim';id:string;expectedRevision:number};
export interface WaterReceipt {reserve:number;delivered:number;playerDelivered:number;consumed:number}
const RECORD_KINDS=['arm','open','accept','complete','resolve','claim','expire'] as const;
export type WaterRequestKind=typeof RECORD_KINDS[number];
/** Compact persisted [kind, canonical home index, active time, water tuple]. */
export type WaterRequestRecord=[kind:number,home:number,at:number,water:[number,number,number,number]];
export interface WaterRequestEvidence {kind:WaterRequestKind;home:number;settlementId:string;episode:number;at:number;water:WaterReceipt}
export interface WaterRequests {
 version:1;hash:string;planId:string;startedAt:number;
 baseline:({id:string}&WaterReceipt)[];revision:number;records:WaterRequestRecord[];
}
export interface WaterRequestEpisode {
 id:string;settlementId:string;issuerId:string;episode:number;status:'offered'|'accepted'|'completed'|'resolved'|'claimed'|'expired';
 createdAt:number;expiresAt:number;acceptedAt:number|null;completedAt:number|null;claimBy:number|null;resolvedAt:number|null;
 reward:4;reservedReward:number;failureReason:'Relief deadline missed'|'Claim deadline missed'|null;
 relief:WaterRequestEvidence;need:WaterRequestEvidence;acceptance:WaterRequestEvidence|null;outcome:WaterRequestEvidence|null;claim:WaterRequestEvidence|null;
}
interface HomeProjection {id:string;count:number;armed:WaterRequestEvidence|null;active:WaterRequestEpisode|null;water:WaterReceipt;at:number}
interface Projection {homes:HomeProjection[];episodes:WaterRequestEpisode[];history:WaterRequestEvidence[]}
const EPS=1e-7;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,expected:string[])=>{const proto=Object.getPrototypeOf(v),own=Reflect.ownKeys(v);return (proto===Object.prototype||proto===null)&&own.length===expected.length&&own.every(k=>typeof k==='string'&&expected.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)!,'value'));};
const number=(v:unknown,max=1e9):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;
const integer=(v:unknown,max=1e9):v is number=>number(v,max)&&Number.isSafeInteger(v);
const time=(v:unknown,max=1e9):v is number=>number(v,max)&&Number.isInteger(v*4);
const same=(a:number,b:number)=>Math.abs(a-b)<=EPS;
const packed=(s:WaterReceipt):WaterRequestRecord[3]=>[s.reserve,s.delivered,s.playerDelivered,s.consumed];
const unpacked=(w:WaterRequestRecord[3]):WaterReceipt=>({reserve:w[0],delivered:w[1],playerDelivered:w[2],consumed:w[3]});
const receipt=(s:WaterReceipt):WaterReceipt=>({reserve:s.reserve,delivered:s.delivered,playerDelivered:s.playerDelivered,consumed:s.consumed});
const inactive=(e:WaterRequestEpisode)=>['resolved','claimed','expired'].includes(e.status);
const used=(episodes:WaterRequestEpisode[],id:string)=>episodes.filter(e=>e.settlementId===id).reduce((n,e)=>n+(e.status==='claimed'?e.reward:e.reservedReward),0);
/** A founding claim moves reserved to spent, so it does not change this historical liability. */
function foundingUsed(c:CausalState,id:string,at=c.elapsed){return c.jobs.filter(j=>j.settlementId===id&&j.createdAt<=at&&!(j.status==='resolved'&&j.resolvedAt!==null&&j.resolvedAt<=at)).reduce((n,j)=>n+j.reward,0);}
function initial(r:WaterRequests):Projection{return {homes:r.baseline.map(h=>({id:h.id,count:0,armed:null,active:null,water:receipt(h),at:r.startedAt})),episodes:[],history:[]};}
function identity(r:WaterRequests,homeId:string,episode:number){return `${r.planId}/water/${homeId}/${episode}`;}
/** The same bounded state machine constructs runtime views and replays persisted receipts. */
function reduceRecord(view:Projection,r:WaterRequests,stored:WaterRequestRecord,p:CausalPlan,c:CausalState,validate=false):boolean {
 const home=view.homes[stored[1]];if(!home)return false;
 const record:WaterRequestEvidence={kind:RECORD_KINDS[stored[0]]!,home:stored[1],settlementId:home.id,episode:stored[0]===0||stored[0]===1?home.count+1:home.active?.episode??0,at:stored[2],water:unpacked(stored[3])};
 const active=home.active,w=record.water,rule=WATER_REQUEST_RULES;
 if(record.kind==='arm'){
  if(active||home.armed||home.count>=rule.maxPerHome||record.episode!==home.count+1||w.reserve<rule.relief-EPS)return false;
  home.armed=record;
 }else if(record.kind==='open'){
  const arm=home.armed;if(active||!arm||record.episode!==home.count+1||record.at<=arm.at||w.reserve>=rule.shortage-EPS||w.consumed-arm.water.consumed<rule.consumption-EPS)return false;
  if(validate&&foundingUsed(c,home.id,record.at)+used(view.episodes,home.id)+rule.reward>p.settlements.find(s=>s.id===home.id)!.rewardBudget)return false;
  const e:WaterRequestEpisode={id:identity(r,home.id,record.episode),settlementId:home.id,issuerId:p.agents.find(a=>a.homeId===home.id&&a.role==='caretaker')!.id,episode:record.episode,status:'offered',createdAt:record.at,expiresAt:record.at+rule.deadline,acceptedAt:null,completedAt:null,claimBy:null,resolvedAt:null,reward:4,reservedReward:4,failureReason:null,relief:arm,need:record,acceptance:null,outcome:null,claim:null};
  home.count++;home.armed=null;home.active=e;view.episodes.push(e);
 }else{
  if(!active||record.episode!==active.episode)return false;
  if(record.kind==='accept'){
   if(active.status!=='offered'||record.at>=active.expiresAt||w.reserve>=rule.completion-EPS)return false;
   active.status='accepted';active.acceptedAt=record.at;active.acceptance=record;
  }else if(record.kind==='complete'||record.kind==='resolve'){
   if(!['offered','accepted'].includes(active.status)||record.at>=active.expiresAt||w.reserve<rule.completion-EPS)return false;
   const earned=!!active.acceptance&&w.playerDelivered-active.acceptance.water.playerDelivered>=4;
   if((record.kind==='complete')!==earned)return false;
   active.status=earned?'completed':'resolved';active.completedAt=record.at;active.claimBy=earned?record.at+rule.claimWindow:null;active.resolvedAt=record.at;active.outcome=record;if(!earned)active.reservedReward=0;
  }else if(record.kind==='claim'){
   if(active.status!=='completed'||active.claimBy===null||record.at>=active.claimBy)return false;
   active.status='claimed';active.reservedReward=0;active.claim=record;
  }else if(record.kind==='expire'){
   const deadline=active.status==='completed'?active.claimBy:active.expiresAt;
   if(deadline===null||record.at!==deadline)return false;
   active.failureReason=active.status==='completed'?'Claim deadline missed':'Relief deadline missed';active.status='expired';active.reservedReward=0;active.resolvedAt=record.at;active.outcome=record;
  }else return false;
  if(inactive(active))home.active=null;
 }
 home.water=receipt(w);home.at=record.at;view.history.push(record);return true;
}
function projection(r:WaterRequests,p:CausalPlan,c:CausalState):Projection {const view=initial(r);for(const record of r.records)reduceRecord(view,r,record,p,c);return view;}
/** Explicit activation takes a current baseline, never historical relief or elapsed-time catch-up. */
export function createWaterRequests(seed:number,c:CausalState):WaterRequests {
 const r:WaterRequests={version:1,hash:WATER_REQUEST_HASH,planId:`water-requests:1:${seed}`,startedAt:c.elapsed,baseline:c.settlements.map(s=>({id:s.id,...receipt(s)})),revision:0,records:[]};
 reconcileWaterRequests({...c,waterRequests:r},causalPlan(seed));return r;
}
function append(c:CausalState,p:CausalPlan,view:Projection,homeId:string,kind:WaterRequestKind){
 const r=c.waterRequests!,record:WaterRequestRecord=[RECORD_KINDS.indexOf(kind),view.homes.findIndex(h=>h.id===homeId),c.elapsed,packed(c.settlements.find(s=>s.id===homeId)!)];
 if(!reduceRecord(view,r,record,p,c))throw new Error('Invalid water-request transition');r.records.push(record);r.revision++;
}
/** Called on the causal clone after each complete quarter-second and every real transition. */
export function reconcileWaterRequests(c:CausalState,p:CausalPlan):void {
 const r=c.waterRequests;if(!r)return;const view=projection(r,p,c),rule=WATER_REQUEST_RULES;
 for(const h of view.homes){
  const live=c.settlements.find(s=>s.id===h.id)!,e=h.active;
  if(e){
   const deadline=e.status==='completed'?e.claimBy!:e.expiresAt;
   // Deadline equality always fails before inspecting same-step water relief or a claim.
   if(c.elapsed>=deadline)append(c,p,view,h.id,'expire');
   else if(e.status!=='completed'&&live.reserve>=rule.completion-EPS)append(c,p,view,h.id,e.acceptance&&live.playerDelivered-e.acceptance.water.playerDelivered>=4?'complete':'resolve');
  }
  if(h.active||h.count>=rule.maxPerHome)continue;
  if(!h.armed&&live.reserve>=rule.relief-EPS)append(c,p,view,h.id,'arm');
  if(h.armed&&c.elapsed>h.armed.at&&live.reserve<rule.shortage-EPS&&live.consumed-h.armed.water.consumed>=rule.consumption-EPS&&foundingUsed(c,h.id)+used(view.episodes,h.id)+rule.reward<=p.settlements.find(s=>s.id===h.id)!.rewardBudget)append(c,p,view,h.id,'open');
 }
}
/** Current episode commitments share the original issuer's finite budget. */
export function waterRequestLiability(c:CausalState,id:string):number{return c.waterRequests?used(projection(c.waterRequests,causalPlanFromState(c),c).episodes,id):0;}
function causalPlanFromState(c:CausalState){return causalPlan(Number(c.planId.split(':').at(-1)));}
export function waterRequestRenown(c:CausalState):number {return c.waterRequests?projection(c.waterRequests,causalPlanFromState(c),c).episodes.filter(e=>e.status==='claimed').reduce((n,e)=>n+e.reward,0):0;}
export function validWaterRequestCommand(command:unknown):command is WaterRequestCommand {return object(command)&&keys(command,['type','id','expectedRevision'])&&(command.type==='accept'||command.type==='claim')&&typeof command.id==='string'&&command.id.length>0&&command.id.length<=180&&!/[\u0000-\u001f]/.test(command.id)&&integer(command.expectedRevision,WATER_REQUEST_RULES.maxRecords);}
/** Commands never modify stock. Reward, receipt and current revision commit atomically. */
export function applyWaterRequestCommand(state:CausalState,ctx:CausalContext,command:WaterRequestCommand):{state:CausalState;message:string} {
 const unchanged={state,message:''},r=state.waterRequests;
 if(!r||!validWaterRequests(r,ctx.seed,state)||!validWaterRequestCommand(command)||command.expectedRevision!==r.revision||ctx.zone!=='valley'||!number(ctx.player.hp,100)||ctx.player.hp<=0||!Number.isFinite(ctx.player.x)||!Number.isFinite(ctx.player.z))return unchanged;
 const p=causalPlan(ctx.seed),view=projection(r,p,state),episode=view.episodes.find(e=>e.id===command.id);if(!episode)return unchanged;
 const home=p.settlements.find(h=>h.id===episode.settlementId)!,height=valleySurfaceHeight(worldValley(ctx.seed),ctx.player.x,ctx.player.z);
 if(Math.hypot(ctx.player.x-home.position.x,ctx.player.z-home.position.z,height-home.position.y)>3.5)return unchanged;
 if(command.type==='accept'?(episode.status!=='offered'||state.elapsed>=episode.expiresAt):(episode.status!=='completed'||episode.claimBy===null||state.elapsed>=episode.claimBy))return unchanged;
 const c=structuredClone(state);append(c,p,projection(c.waterRequests!,p,c),home.id,command.type);if(command.type==='claim')c.renown+=episode.reward;reconcileWaterRequests(c,p);
 return {state:c,message:command.type==='accept'?`Accepted water relief for ${home.name}. Raise the reserve to 6 L before ${episode.expiresAt} seconds of active world time; only fresh player delivery earns its reserved reward.`:`${home.name}: 4 community renown claimed once from its existing issuer budget.`};
}
function validReceipt(w:unknown,def:CausalPlan['settlements'][number],before:WaterReceipt|undefined,final:WaterReceipt):w is WaterReceipt {
 if(!object(w)||!keys(w,['reserve','delivered','playerDelivered','consumed'])||!number(w.reserve,def.capacity+EPS)||!number(w.delivered,final.delivered+EPS)||!integer(w.playerDelivered,final.playerDelivered)||w.playerDelivered%4||w.playerDelivered>w.delivered+EPS||!number(w.consumed,final.consumed+EPS)||Math.abs(w.reserve+w.consumed-def.initialWater-w.delivered)>1e-5)return false;
 return !before||w.delivered+EPS>=before.delivered&&w.playerDelivered>=before.playerDelivered&&w.consumed+EPS>=before.consumed&&w.delivered-before.delivered+EPS>=w.playerDelivered-before.playerDelivered;
}
/** Exact-shaped bounded receipt replay, final-counter checks and historical reward conservation. */
export function validWaterRequests(value:unknown,seed:number,c:CausalState):value is WaterRequests {try{
 if(!object(value)||!keys(value,['version','hash','planId','startedAt','baseline','revision','records'])||value.version!==1||value.hash!==WATER_REQUEST_HASH||value.planId!==`water-requests:1:${seed}`)return false;
 const r=value as unknown as WaterRequests,p=causalPlan(seed),rule=WATER_REQUEST_RULES;
 if(!time(r.startedAt,c.elapsed)||!time(c.elapsed)||!Array.isArray(r.baseline)||r.baseline.length!==p.settlements.length||!integer(r.revision,rule.maxRecords)||!Array.isArray(r.records)||r.records.length!==r.revision)return false;
 for(const [i,base]of r.baseline.entries()){if(!object(base)||!keys(base,['id','reserve','delivered','playerDelivered','consumed'])||base.id!==p.settlements[i]!.id||!validReceipt(receipt(base),p.settlements[i]!,undefined,c.settlements[i]!))return false;}
 const view=initial(r);let at=r.startedAt;
 for(const record of r.records){
  if(!Array.isArray(record)||record.length!==4||Reflect.ownKeys(record).length!==5||![0,1,2,3].every(i=>Object.hasOwn(Object.getOwnPropertyDescriptor(record,String(i))??{},'value'))||!integer(record[0],RECORD_KINDS.length-1)||!integer(record[1],p.settlements.length-1)||!time(record[2],c.elapsed)||record[2]<at)return false;
  const home=view.homes[record[1]],def=p.settlements[record[1]],live=c.settlements[record[1]],tuple=record[3];
  if(!home||!def||!live||!Array.isArray(tuple)||tuple.length!==4||Reflect.ownKeys(tuple).length!==5||![0,1,2,3].every(i=>Object.hasOwn(Object.getOwnPropertyDescriptor(tuple,String(i))??{},'value')))return false;
  const water=unpacked(tuple);if(!validReceipt(water,def,home.water,live))return false;
  // No resident work, drinking or hauling can occur twice at the same committed clock.
  if(record[2]===home.at&&(!same(water.consumed,home.water.consumed)||!same(water.delivered-home.water.delivered,water.playerDelivered-home.water.playerDelivered)))return false;
  if(!reduceRecord(view,r,record,p,c,true))return false;at=record[2];
 }
 for(const home of view.homes){
  const live=c.settlements.find(s=>s.id===home.id)!,def=p.settlements.find(s=>s.id===home.id)!;
  if(!validReceipt(receipt(live),def,home.water,live)||foundingUsed(c,home.id)+used(view.episodes,home.id)>def.rewardBudget)return false;
  const e=home.active;if(e&&(c.elapsed>=(e.status==='completed'?e.claimBy!:e.expiresAt)||e.status!=='completed'&&live.reserve>=rule.completion-EPS))return false;
  if(!e&&home.count<rule.maxPerHome){
   if(!home.armed&&live.reserve>=rule.relief-EPS)return false;
   if(home.armed&&c.elapsed>home.armed.at&&live.reserve<rule.shortage-EPS&&live.consumed-home.armed.water.consumed>=rule.consumption-EPS&&foundingUsed(c,home.id)+used(view.episodes,home.id)+rule.reward<=def.rewardBudget)return false;
  }
 }
 return true;
 }catch{return false;}}
/** All presentation copy derives from the replayed records and original seeded identities. */
export function waterRequestView(c:CausalState,seed:number){
 const p=causalPlan(seed),r=c.waterRequests,view=r?projection(r,p,c):{homes:[],episodes:[],history:[]} as Projection;
 return {revision:r?.revision??0,episodes:view.episodes,households:p.settlements.map(h=>({...h,reserve:c.settlements.find(s=>s.id===h.id)!.reserve,availableReward:Math.max(0,h.rewardBudget-foundingUsed(c,h.id)-used(view.episodes,h.id)),episodeCount:view.homes.find(x=>x.id===h.id)?.count??0,armed:!!view.homes.find(x=>x.id===h.id)?.armed})),history:view.history};
}
