import {causalPlan,type CausalContext,type CausalState} from './causal.ts';
import {worldValley} from './generation.ts';
import {hashSeed} from './procedural.ts';
import {valleySurfaceHeight} from './valley.ts';

/** A finite commission economy. Every kit starts as two real player scrap. */
export const ECONOMY_RULES=Object.freeze({version:1,recipeScrap:2,recipeSeconds:12,stockCapacity:4,queueCapacity:4,playerCapacity:6,maxCommissions:32,maxIncidents:8,incidentRest:120,wearService:24,repairRenown:2,recycleScrap:1});
export const ECONOMY_HASH=hashSeed(JSON.stringify(ECONOMY_RULES)).toString(16).padStart(8,'0');
export const ECONOMY_RECIPES=Object.freeze({repairKit:Object.freeze({id:'repair-kit',inputs:Object.freeze({scrap:2}),output:Object.freeze({repairKit:1}),serviceSeconds:12,queueCapacity:4,stockCapacity:4,preconditions:Object.freeze(['Assigned caretaker', 'Operational workshop', 'Unjammed press', 'Actual water-supported caretaker service']),effects:Object.freeze(['Consume 2 workshop scrap', 'Commit 1 repair kit to local output stock'])})});
export const ECONOMY_ACTIONS=Object.freeze({
 'commission-kit':Object.freeze({inputs:Object.freeze({scrap:2}),duration:0,capacity:4,preconditions:Object.freeze(['Near the assigned workshop', 'Operational workshop and unjammed press', 'Queue has space', 'Commission limit not exhausted']),effects:Object.freeze(['Move 2 player scrap to workshop feedstock'])}),
 'collect-kit':Object.freeze({inputs:Object.freeze({workshopKit:1}),duration:0,capacity:6,preconditions:Object.freeze(['Near the workshop', 'Completed output available', 'Carried kit capacity available']),effects:Object.freeze(['Move 1 workshop kit to player goods'])}),
 'recycle-kit':Object.freeze({inputs:Object.freeze({repairKit:1}),output:Object.freeze({scrap:1}),waste:Object.freeze({scrap:1}),duration:0,preconditions:Object.freeze(['Near an assigned workshop', 'One unreserved kit carried']),effects:Object.freeze(['Consume 1 player kit', 'Return 1 original embodied scrap to player inventory'])}),
 'repair-press':Object.freeze({inputs:Object.freeze({repairKit:1}),duration:0,preconditions:Object.freeze(['Near the affected workshop', 'A committed natural-wear incident is still open', 'Reserved repair kit carried']),effects:Object.freeze(['Consume 1 player kit', 'Resolve the incident once', 'Resume manufacturing', 'Commit 2 finite community renown', 'Begin at least 120 seconds of rest'])})
});
export type EconomyCommand={type:'commission-kit'|'collect-kit'|'recycle-kit';workplaceId:string}|{type:'repair-press';incidentId:string};
export type EconomyRecordKind='commissioned'|'manufactured'|'collected'|'recycled'|'wear'|'repaired';
export interface EconomyRecord {id:string;kind:EconomyRecordKind;workplaceId:string;at:number;service:number}
export interface EconomyIncident {id:string;workplaceId:string;cause:'natural-wear';createdAt:number;serviceAtCreation:number;resolvedAt:number|null}
export interface EconomyWorkshop {id:string;baselineService:number;serviceSeen:number;progress:number;feedstock:number;stock:number;produced:number}
export interface EconomyState {
 version:1;manifestHash:string;planId:string;startedAt:number;elapsed:number;
 workshops:EconomyWorkshop[];kits:number;renown:number;incidents:EconomyIncident[];records:EconomyRecord[];
}
const EPS=1e-6;
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const productionPlaces=(seed:number)=>causalPlan(seed).workplaces.filter(w=>causalPlan(seed).agents.some(a=>a.workplaceId===w.id));
const activeIncident=(s:EconomyState)=>s.incidents.find(i=>i.resolvedAt===null);
const commissioned=(s:EconomyState)=>s.records.filter(r=>r.kind==='commissioned').length;
const recordId=(s:EconomyState)=>`${s.planId}/record/${s.records.length+1}`;
const incidentId=(s:EconomyState)=>`${s.planId}/wear/${s.incidents.length+1}`;
const nextIncidentAt=(s:EconomyState)=>(s.incidents.at(-1)?.resolvedAt??s.startedAt)+ECONOMY_RULES.incidentRest;
const pressJammed=(s:EconomyState,id:string)=>s.incidents.some(i=>i.workplaceId===id&&i.resolvedAt===null);
function record(s:EconomyState,w:EconomyWorkshop,kind:EconomyRecordKind){s.records.push({id:recordId(s),kind,workplaceId:w.id,at:s.elapsed,service:w.serviceSeen});}
function capacity(w:EconomyWorkshop){return Math.min(w.feedstock/2,ECONOMY_RULES.stockCapacity-w.stock)*ECONOMY_RULES.recipeSeconds;}
function credit(s:EconomyState,w:EconomyWorkshop,service:number){
 const delta=service-w.serviceSeen;
 if(delta>0&&!pressJammed(s,w.id))w.progress=Math.min(capacity(w),w.progress+delta);
 w.serviceSeen=service;
}
/** Migration starts at current committed service; old work cannot mint new goods. */
export function createEconomyState(seed:number,causal:CausalState):EconomyState {
 return {version:1,manifestHash:ECONOMY_HASH,planId:`economy:1:${seed}`,startedAt:causal.elapsed,elapsed:causal.elapsed,workshops:productionPlaces(seed).map(w=>({id:w.id,baselineService:causal.workplaces.find(c=>c.id===w.id)!.service,serviceSeen:causal.workplaces.find(c=>c.id===w.id)!.service,progress:0,feedstock:0,stock:0,produced:0})),kits:0,renown:0,incidents:[],records:[]};
}
/** Consume only newly committed caretaker service. No timers or offline catch-up. */
export function advanceEconomy(state:EconomyState,causal:CausalState):EconomyState {
 if(!Number.isFinite(causal.elapsed)||causal.elapsed<state.elapsed||state.workshops.some(w=>{const live=causal.workplaces.find(c=>c.id===w.id);return !live||!Number.isFinite(live.service)||live.service<w.serviceSeen-EPS||live.service-w.serviceSeen>causal.elapsed-state.elapsed+EPS;}))return state;
 const s=clone(state);s.elapsed=causal.elapsed;
 for(const w of s.workshops){
  const live=causal.workplaces.find(c=>c.id===w.id)!;credit(s,w,live.service);
  if(!live.operational||pressJammed(s,w.id))continue;
  while(w.progress>=ECONOMY_RULES.recipeSeconds-EPS&&w.feedstock>=2&&w.stock<ECONOMY_RULES.stockCapacity){
   w.progress=Math.max(0,w.progress-ECONOMY_RULES.recipeSeconds);w.feedstock-=2;w.stock++;w.produced++;record(s,w,'manufactured');
  }
 }
 // A spare carried kit is reserved before a natural incident is offered. There is no
 // damage command, player sabotage reward, random deadline or unpayable material bill.
 if(!activeIncident(s)&&s.incidents.length<ECONOMY_RULES.maxIncidents&&s.kits>0&&s.elapsed>=nextIncidentAt(s)){
  const rotated=[...s.workshops].sort((a,b)=>hashSeed(`${s.planId}/${s.incidents.length}/${a.id}`)-hashSeed(`${s.planId}/${s.incidents.length}/${b.id}`)||a.id.localeCompare(b.id));
  const w=rotated.find(w=>{const previous=s.incidents.filter(i=>i.workplaceId===w.id).at(-1),live=causal.workplaces.find(c=>c.id===w.id)!;return live.operational&&w.produced>0&&w.serviceSeen-(previous?.serviceAtCreation??w.baselineService)>=ECONOMY_RULES.wearService&&w.serviceSeen>(state.workshops.find(p=>p.id===w.id)!.serviceSeen);});
  if(w){s.incidents.push({id:incidentId(s),workplaceId:w.id,cause:'natural-wear',createdAt:s.elapsed,serviceAtCreation:w.serviceSeen,resolvedAt:null});record(s,w,'wear');}
 }
 return JSON.stringify(s)===JSON.stringify(state)?state:s;
}
function nearby(ctx:CausalContext,workplaceId:string){
 const place=causalPlan(ctx.seed).workplaces.find(w=>w.id===workplaceId);if(!place)return false;
 return ctx.zone==='valley'&&ctx.player.hp>0&&Math.hypot(ctx.player.x-place.position.x,ctx.player.z-place.position.z,valleySurfaceHeight(worldValley(ctx.seed),ctx.player.x,ctx.player.z)-place.position.y)<=3.5;
}
/** Pure atomic transaction; apply its state AND inventory together in the world reducer. */
export function applyEconomyCommand(state:EconomyState,causal:CausalState,ctx:CausalContext,command:EconomyCommand):{state:EconomyState;inventory:CausalContext['inventory'];message:string} {
 const unchanged={state,inventory:ctx.inventory,message:''};
 // A reducer must advance first. This prevents spending already elapsed work twice.
 if(causal.elapsed!==state.elapsed||ctx.seed!==Number(state.planId.split(':').at(-1)))return unchanged;
 const incident=command.type==='repair-press'?state.incidents.find(i=>i.id===command.incidentId):undefined;
 const workplaceId=command.type==='repair-press'?incident?.workplaceId:command.workplaceId;
 if(!workplaceId||!nearby(ctx,workplaceId))return unchanged;
 const old=state.workshops.find(w=>w.id===workplaceId),live=causal.workplaces.find(w=>w.id===workplaceId);
 if(!old||!live||Math.abs(old.serviceSeen-live.service)>EPS)return unchanged;
 const s=clone(state),w=s.workshops.find(w=>w.id===workplaceId)!,inventory={...ctx.inventory};let message='';
 if(command.type==='commission-kit'){
  if(!live.operational||pressJammed(s,w.id)||inventory.scrap<2||w.feedstock/2>=ECONOMY_RULES.queueCapacity||commissioned(s)>=ECONOMY_RULES.maxCommissions)return unchanged;
  inventory.scrap-=2;w.feedstock+=2;record(s,w,'commissioned');message='Commissioned one repair kit: 2 scrap moved into workshop feedstock. It needs 12 seconds of actual caretaker work.';
 }else if(command.type==='collect-kit'){
  if(w.stock<1||s.kits>=ECONOMY_RULES.playerCapacity)return unchanged;
  w.stock--;s.kits++;record(s,w,'collected');message='Collected one manufactured repair kit. It can restore a worn production press, or be recycled here for 1 scrap.';
 }else if(command.type==='recycle-kit'){
  if(s.kits<1||(activeIncident(s)&&s.kits<=1))return unchanged;
  s.kits--;inventory.scrap+=ECONOMY_RULES.recycleScrap;record(s,w,'recycled');message='Recycled one kit: recovered 1 scrap; 1 scrap was lost in fabrication and recovery.';
 }else if(command.type==='repair-press'){
  if(!incident||incident.resolvedAt!==null||s.kits<1)return unchanged;
  s.kits--;s.incidents.find(i=>i.id===incident.id)!.resolvedAt=s.elapsed;s.renown+=ECONOMY_RULES.repairRenown;record(s,w,'repaired');message='Production press restored: 1 kit consumed, 2 community renown earned once. At least 120 seconds of quiet before further wear.';
 }else return unchanged;
 return {state:s,inventory,message};
}
/** Add this net cost to canonical world inventory conservation, including pump inference. */
export function economyCost(state:EconomyState|undefined){return {scrap:state?commissioned(state)*2-state.records.filter(r=>r.kind==='recycled').length:0,core:0,water:0};}
/** Already manufactured, unreserved goods can return one real scrap each.
 * Pending feedstock is excluded: obtaining its output still requires future work. */
export function economyRecoverableScrap(state:EconomyState|undefined){return state?Math.max(0,state.kits+state.workshops.reduce((sum,w)=>sum+w.stock,0)-(activeIncident(state)?1:0)):0;}


function object(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
function bounded(v:unknown,max=1e9):v is number{return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;}
function integer(v:unknown,max=1e9):v is number{return bounded(v,max)&&Number.isSafeInteger(v);}
function keys(v:Record<string,unknown>,allowed:string[]){return Object.keys(v).length===allowed.length&&allowed.every(k=>Object.hasOwn(v,k));}
function close(a:number,b:number){return Math.abs(a-b)<=EPS;}
/** Replay the bounded factual transaction log; reject forged goods, rewards and incidents. */
export function validEconomy(value:unknown,seed:number,causal:CausalState):value is EconomyState {try{return validate(value,seed,causal);}catch{return false;}}
function validate(value:unknown,seed:number,causal:CausalState):value is EconomyState {
 if(!object(value)||!keys(value,['version','manifestHash','planId','startedAt','elapsed','workshops','kits','renown','incidents','records'])||value.version!==1||value.manifestHash!==ECONOMY_HASH||value.planId!==`economy:1:${seed}`)return false;
 const s=value as unknown as EconomyState,places=productionPlaces(seed);
 if(!bounded(s.startedAt,causal.elapsed)||s.elapsed!==causal.elapsed||s.elapsed<s.startedAt||!integer(s.kits,ECONOMY_RULES.playerCapacity)||!integer(s.renown,ECONOMY_RULES.maxIncidents*ECONOMY_RULES.repairRenown)||!Array.isArray(s.workshops)||s.workshops.length!==places.length||!Array.isArray(s.incidents)||s.incidents.length>ECONOMY_RULES.maxIncidents||!Array.isArray(s.records)||s.records.length>ECONOMY_RULES.maxCommissions*4+ECONOMY_RULES.maxIncidents*2)return false;
 for(const [i,w]of s.workshops.entries()){
  const live=causal.workplaces.find(c=>c.id===w.id);
  if(!object(w)||!keys(w,['id','baselineService','serviceSeen','progress','feedstock','stock','produced'])||w.id!==places[i]!.id||!live||!bounded(w.baselineService,s.startedAt)||!bounded(w.serviceSeen,live.service)||!close(w.serviceSeen,live.service)||w.serviceSeen<w.baselineService||w.serviceSeen-w.baselineService>s.elapsed-s.startedAt+EPS||!bounded(w.progress,ECONOMY_RULES.recipeSeconds-EPS/2)||!integer(w.feedstock,ECONOMY_RULES.queueCapacity*2)||w.feedstock%2||!integer(w.stock,ECONOMY_RULES.stockCapacity)||!integer(w.produced,ECONOMY_RULES.maxCommissions))return false;
 }
 const replay:EconomyState={version:1,manifestHash:ECONOMY_HASH,planId:s.planId,startedAt:s.startedAt,elapsed:s.startedAt,workshops:s.workshops.map(w=>({id:w.id,baselineService:w.baselineService,serviceSeen:w.baselineService,progress:0,feedstock:0,stock:0,produced:0})),kits:0,renown:0,incidents:[],records:[]};
 const observedAt=new Map(replay.workshops.map(w=>[w.id,s.startedAt]));let count=0;
 for(const r of s.records){
  if(!object(r)||!keys(r,['id','kind','workplaceId','at','service'])||r.id!==recordId(replay)||!['commissioned','manufactured','collected','recycled','wear','repaired'].includes(r.kind)||!bounded(r.at,s.elapsed)||r.at<replay.elapsed||!bounded(r.service))return false;
  const w=replay.workshops.find(w=>w.id===r.workplaceId),final=s.workshops.find(w=>w.id===r.workplaceId);if(!w||!final||r.service<w.serviceSeen||r.service>final.serviceSeen||r.service-w.serviceSeen>r.at-observedAt.get(w.id)!+EPS)return false;
  credit(replay,w,r.service);observedAt.set(w.id,r.at);replay.elapsed=r.at;
  if(r.kind==='commissioned'){
   if(pressJammed(replay,w.id)||w.feedstock/2>=ECONOMY_RULES.queueCapacity||++count>ECONOMY_RULES.maxCommissions)return false;w.feedstock+=2;
  }else if(r.kind==='manufactured'){
   if(pressJammed(replay,w.id)||w.feedstock<2||w.stock>=ECONOMY_RULES.stockCapacity||w.progress<ECONOMY_RULES.recipeSeconds-EPS)return false;w.feedstock-=2;w.stock++;w.produced++;w.progress=Math.max(0,w.progress-ECONOMY_RULES.recipeSeconds);
  }else if(r.kind==='collected'){
   if(w.stock<1||replay.kits>=ECONOMY_RULES.playerCapacity)return false;w.stock--;replay.kits++;
  }else if(r.kind==='recycled'){
   if(replay.kits<1||(activeIncident(replay)&&replay.kits<=1))return false;replay.kits--;
  }else if(r.kind==='wear'){
   const previous=replay.incidents.filter(i=>i.workplaceId===w.id).at(-1);
   if(activeIncident(replay)||replay.incidents.length>=ECONOMY_RULES.maxIncidents||replay.kits<1||w.produced<1||r.at<nextIncidentAt(replay)||w.serviceSeen-(previous?.serviceAtCreation??w.baselineService)<ECONOMY_RULES.wearService)return false;
   replay.incidents.push({id:incidentId(replay),workplaceId:w.id,cause:'natural-wear',createdAt:r.at,serviceAtCreation:w.serviceSeen,resolvedAt:null});
  }else{
   const incident=activeIncident(replay);if(!incident||incident.workplaceId!==w.id||replay.kits<1)return false;replay.kits--;replay.renown+=ECONOMY_RULES.repairRenown;incident.resolvedAt=r.at;
  }
  replay.records.push({...r});
 }
 for(const w of replay.workshops){const final=s.workshops.find(f=>f.id===w.id)!;if(final.serviceSeen-w.serviceSeen>s.elapsed-observedAt.get(w.id)!+EPS)return false;credit(replay,w,final.serviceSeen);if(!close(w.progress,final.progress)||w.feedstock!==final.feedstock||w.stock!==final.stock||w.produced!==final.produced||w.progress>=ECONOMY_RULES.recipeSeconds-EPS)return false;}
 if(replay.kits!==s.kits||replay.renown!==s.renown||JSON.stringify(replay.incidents)!==JSON.stringify(s.incidents))return false;
 // Two units remain embodied in each kit until use/recovery; recovery returns only one.
 const used=s.records.filter(r=>r.kind==='repaired').length,recycled=s.records.filter(r=>r.kind==='recycled').length;
 return count*2===s.workshops.reduce((n,w)=>n+w.feedstock+2*w.stock,0)+2*s.kits+2*used+2*recycled;
}

/** Presentation data only: no invented history, identities, motives or economy transactions. */
export function economyView(state:EconomyState,seed:number){
 const plan=causalPlan(seed),placeName=(id:string)=>plan.workplaces.find(w=>w.id===id)!.name;
 const descriptions:Record<EconomyRecordKind,string>={commissioned:'2 scrap commissioned one repair kit',manufactured:'A caretaker manufactured one repair kit from 2 scrap',collected:'The player collected one completed repair kit',recycled:'One repair kit returned 1 scrap through recycling',wear:'Natural wear jammed the production press; one carried kit was reserved',repaired:'The player consumed one repair kit to restore the press and earned 2 renown'};
 return {kits:state.kits,renown:state.renown,policy:'Finite player-funded commissions; actual caretaker work; one feasible natural-wear request at a time; no offline work.',nextIncidentAt:activeIncident(state)?null:nextIncidentAt(state),workshops:state.workshops.map(w=>({...w,name:placeName(w.id),jammed:pressJammed(state,w.id),queued:w.feedstock/2})),incidents:state.incidents.map(i=>({...i,name:placeName(i.workplaceId),status:i.resolvedAt===null?'Awaiting one reserved repair kit':'Repaired'})),history:state.records.map(r=>({id:r.id,at:r.at,workplaceId:r.workplaceId,text:`${placeName(r.workplaceId)}: ${descriptions[r.kind]}.`})),settlements:plan.settlements.map(t=>{const ids=plan.workplaces.filter(w=>w.settlementId===t.id).map(w=>w.id),records=state.records.filter(r=>ids.includes(r.workplaceId)),made=records.filter(r=>r.kind==='manufactured').length,repaired=records.filter(r=>r.kind==='repaired').length,recycled=records.filter(r=>r.kind==='recycled').length;return {id:t.id,name:t.name,motif:repaired?'Care and repair':recycled?'Salvage and reuse':made?'Workshop craft':'No recorded craft tradition',evidence:{manufactured:made,repaired,recycled},description:records.length?`${t.name}'s recorded workshop history contains ${made} manufactured kits, ${repaired} press repairs and ${recycled} recycled kits.`:'No workshop transactions have been committed here yet.'};})};
}
