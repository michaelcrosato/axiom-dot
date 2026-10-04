import {clearPulsePath,type CombatObstacle,type ComboState,type ComboTuningInput,DEFAULT_COMBO_TUNING,sanitizeComboTuning} from './combat.ts';

/** One finite ability contract. It owns no stamina, damage, input slot, or campaign save. */
export const GUARD_VERSION=1 as const;
export type GuardPhase='idle'|'windup'|'active'|'recovery';
export interface GuardRecipe {
 version:1;id:'resonant-guard';
 windup:number;active:number;recovery:number;cooldown:number;staminaCost:number;
 /** Same full front arc and horizontal source distance used by field geometry and authority. */
 range:number;arc:number;verticalReach:number;color:string;
}
export const DEFAULT_GUARD_RECIPE:Readonly<GuardRecipe>=Object.freeze({version:1,id:'resonant-guard',windup:.12,active:.22,recovery:.38,cooldown:1.15,staminaCost:22,range:2.4,arc:Math.PI*2/3,verticalReach:.85,color:'#92eadb'});
const EPS=1e-9;
const exact=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(v,k));
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function validGuardRecipe(v:unknown):v is GuardRecipe {
 return record(v)&&exact(v,Object.keys(DEFAULT_GUARD_RECIPE))&&Object.entries(DEFAULT_GUARD_RECIPE).every(([key,value])=>v[key]===value);
}
export type GuardRejectReason='invalid'|'dead'|'paused'|'airborne'|'crouched'|'busy'|'cooldown'|'stamina';
export type GuardInterruptReason='jump'|'crouch'|'damage'|'dead'|'menu'|'zone'|'session'|'pause';
export interface GuardReceipt {intentId:string;status:'accepted'|'rejected';reason:GuardRejectReason|null;castId:number}
export interface GuardBlock {id:number;castId:number;enemyId:string;attackId:number;at:number}
export interface GuardState {
 version:1;time:number;phase:GuardPhase;elapsed:number;facing:number;castId:number;
 cooldownRemaining:number;spent:boolean;recipe:Readonly<GuardRecipe>|null;
 receipt:GuardReceipt|null;lastBlock:GuardBlock|null;
}
export interface GuardContext {player:{x:number;y:number;z:number;facing:number;hp:number;grounded:boolean;crouched:boolean};playing:boolean;obstacles:readonly CombatObstacle[]}
export type GuardEvent={type:'phase';phase:GuardPhase;castId:number;at:number}|{type:'blocked';block:GuardBlock;castId:number;at:number}|{type:'interrupted';reason:GuardInterruptReason;castId:number;at:number}|{type:'rejected';reason:GuardRejectReason;castId:number;at:number};
export interface GuardResult {state:GuardState;events:GuardEvent[]}
export function createGuardState():GuardState{return {version:1,time:0,phase:'idle',elapsed:0,facing:0,castId:0,cooldownRemaining:0,spent:false,recipe:null,receipt:null,lastBlock:null};}
export function guardDuration(recipe:Readonly<GuardRecipe>){return recipe.windup+recipe.active+recipe.recovery;}
export function guardBusy(s:GuardState){return s.phase!=='idle';}
export function validGuardIntent(id:unknown):id is string{return typeof id==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(id);}
function validContext(c:GuardContext){return [c.player.x,c.player.y,c.player.z,c.player.facing,c.player.hp].every(Number.isFinite)&&typeof c.player.grounded==='boolean'&&typeof c.player.crouched==='boolean'&&typeof c.playing==='boolean';}
function base(s:GuardState){return {castId:s.castId,at:s.time};}
function clear(s:GuardState):GuardState{return {...s,phase:'idle',elapsed:0,recipe:null,spent:false};}
/** An edge consumes the SAME stamina owned by staff combat; there is no second meter. */
export function requestGuard(s:GuardState,combo:ComboState,c:GuardContext,intentId:string,recipe:Readonly<GuardRecipe>=DEFAULT_GUARD_RECIPE,tuning:ComboTuningInput=DEFAULT_COMBO_TUNING):GuardResult&{combo:ComboState}{
 if(validGuardIntent(intentId)&&s.receipt?.intentId===intentId)return {state:s,combo,events:[]};
 const reason:GuardRejectReason|null=!validGuardIntent(intentId)||!validContext(c)||!validGuardRecipe(recipe)?'invalid':c.player.hp<=0?'dead':!c.playing?'paused':!c.player.grounded?'airborne':c.player.crouched?'crouched':guardBusy(s)||combo.phase!=='idle'||combo.buffered||combo.stunRemaining>EPS?'busy':s.cooldownRemaining>EPS||combo.cancelLockRemaining>EPS?'cooldown':!Number.isFinite(combo.stamina)||combo.stamina+EPS<recipe.staminaCost?'stamina':null;
 if(reason){const state=validGuardIntent(intentId)?{...s,receipt:{intentId,status:'rejected' as const,reason,castId:s.castId}}:s;return {state,combo,events:[{...base(s),type:'rejected',reason}]};}
 const duration=guardDuration(recipe),t=sanitizeComboTuning(tuning),state:GuardState={...s,phase:'windup',elapsed:0,facing:Math.atan2(Math.sin(c.player.facing),Math.cos(c.player.facing)),castId:s.castId+1,cooldownRemaining:duration+recipe.cooldown,spent:false,recipe:Object.freeze({...recipe}),receipt:{intentId,status:'accepted',reason:null,castId:s.castId+1}};
 return {state,combo:{...combo,stamina:Math.max(0,Math.min(combo.stamina,t.maxStamina)-recipe.staminaCost),regenDelay:Math.max(combo.regenDelay,duration+t.staminaRegenDelay),cancelLockRemaining:Math.max(combo.cancelLockRemaining,duration)},events:[{...base(state),type:'phase',phase:'windup'}]};
}
/** Interrupt removes interception immediately; cost, cooldown, receipt and hit history survive. */
export function interruptGuard(s:GuardState,reason:GuardInterruptReason):GuardResult {return guardBusy(s)?{state:clear(s),events:[{...base(s),type:'interrupted',reason}]}:{state:s,events:[]};}
/** Called with the same fixed 60Hz snapshots as the sentry clock. No wall-clock catch-up. */
export function stepGuard(s:GuardState,dt:number,c:GuardContext):GuardResult {
 if(!Number.isFinite(dt)||dt<=0||dt>1||!validContext(c))return {state:s,events:[]};
 const reason:GuardInterruptReason|null=c.player.hp<=0?'dead':!c.playing?'pause':!c.player.grounded?'jump':c.player.crouched?'crouch':null;
 const interrupted=reason?interruptGuard(s,reason):{state:s,events:[]};let state=interrupted.state;const events=[...interrupted.events];
 // Menus freeze solo clocks. Online menus must send guard-cancel; the room keeps ticking.
 if(!c.playing)return {state,events};
 const before=state.elapsed;state={...state,time:state.time+dt,cooldownRemaining:Math.max(0,state.cooldownRemaining-dt)};
 if(state.phase==='idle'||!state.recipe)return {state,events};
 const r=state.recipe,end=before+dt,boundaries=[{at:r.windup,phase:'active' as const},{at:r.windup+r.active,phase:'recovery' as const},{at:guardDuration(r),phase:'idle' as const}];
 for(const boundary of boundaries)if(before+EPS<boundary.at&&end+EPS>=boundary.at)events.push({type:'phase',phase:boundary.phase,castId:state.castId,at:s.time+boundary.at-before});
 state=end+EPS>=guardDuration(r)?clear(state):{...state,elapsed:end,phase:end+EPS>=r.windup+r.active?'recovery':end+EPS>=r.windup?'active':'windup'};
 return {state,events};
}
export interface GuardContact {enemyId:string;attackId:number;source:{x:number;y:number;z:number};damage:number}
/** Must receive an actual sentry damage event AFTER its own reach/arc/wall check. */
export function resolveGuardContact(s:GuardState,c:GuardContext,contact:GuardContact):GuardResult&{blocked:boolean;damage:number}{
 const r=s.recipe,p=c.player,dx=contact.source.x-p.x,dz=contact.source.z-p.z,horizontal=Math.hypot(dx,dz);
 const eligible=validContext(c)&&c.playing&&p.hp>0&&p.grounded&&!p.crouched&&s.phase==='active'&&!s.spent&&r&&typeof contact.enemyId==='string'&&contact.enemyId.length>0&&contact.enemyId.length<=180&&Number.isSafeInteger(contact.attackId)&&contact.attackId>0&&[contact.source.x,contact.source.y,contact.source.z,contact.damage].every(Number.isFinite)&&contact.damage>0&&contact.damage<=100&&Math.abs(contact.source.y-p.y)<=r.verticalReach&&horizontal<=r.range+EPS&&(horizontal<=EPS||(dx*Math.sin(s.facing)+dz*Math.cos(s.facing))/horizontal>=Math.cos(r.arc/2)-EPS)&&clearPulsePath(p,contact.source,c.obstacles);
 if(!eligible)return {state:s,events:[],blocked:false,damage:Number.isFinite(contact.damage)&&contact.damage>0&&contact.damage<=100?contact.damage:0};
 const block:GuardBlock={id:(s.lastBlock?.id??0)+1,castId:s.castId,enemyId:contact.enemyId,attackId:contact.attackId,at:s.time};
 return {state:{...s,spent:true,lastBlock:block},events:[{...base(s),type:'blocked',block}],blocked:true,damage:0};
}
/** Strict persisted optional room-state validation; unknown fields fail closed. */
export function validGuardState(v:unknown):v is GuardState {
 if(!record(v)||!exact(v,['version','time','phase','elapsed','facing','castId','cooldownRemaining','spent','recipe','receipt','lastBlock'])||v.version!==1||!finite(v.time,0,Number.MAX_SAFE_INTEGER)||!finite(v.elapsed,0,1)||!finite(v.facing,-Math.PI*2,Math.PI*2)||!Number.isSafeInteger(v.castId)||Number(v.castId)<0||!finite(v.cooldownRemaining,0,guardDuration(DEFAULT_GUARD_RECIPE)+DEFAULT_GUARD_RECIPE.cooldown+EPS)||typeof v.spent!=='boolean'||!['idle','windup','active','recovery'].includes(String(v.phase)))return false;
 const s=v as unknown as GuardState;
 if(s.castId===0&&(s.cooldownRemaining>0||s.spent)||s.castId>0&&s.receipt===null||s.elapsed>s.time+EPS)return false;
 if(s.phase==='idle'){if(s.recipe!==null||s.elapsed!==0||s.spent)return false;}else{if(!validGuardRecipe(s.recipe)||s.castId===0)return false;const r=s.recipe,expected=s.elapsed+EPS>=r.windup+r.active?'recovery':s.elapsed+EPS>=r.windup?'active':'windup';if(s.elapsed>=guardDuration(r)||s.phase!==expected||s.spent&&s.phase==='windup'||Math.abs(s.cooldownRemaining-(guardDuration(r)+r.cooldown-s.elapsed))>1e-7)return false;}
 if(s.receipt!==null){const q=s.receipt;if(!record(q)||!exact(q,['intentId','status','reason','castId'])||!validGuardIntent(q.intentId)||!Number.isSafeInteger(q.castId)||Number(q.castId)<0||Number(q.castId)>s.castId||!['accepted','rejected'].includes(q.status)||q.status==='accepted'&&(q.reason!==null||q.castId!==s.castId||q.castId===0)||q.status==='rejected'&&!['invalid','dead','paused','airborne','crouched','busy','cooldown','stamina'].includes(String(q.reason)))return false;}
 if(s.lastBlock!==null){const b=s.lastBlock;if(!record(b)||!exact(b,['id','castId','enemyId','attackId','at'])||![b.id,b.castId,b.attackId].every(n=>Number.isSafeInteger(n)&&n>0)||b.castId>s.castId||typeof b.enemyId!=='string'||!b.enemyId.length||b.enemyId.length>180||!finite(b.at,0,s.time))return false;}
 if(s.spent&&(!s.lastBlock||s.lastBlock.castId!==s.castId))return false;
 return true;
}
