import {LAB_OBSTACLES} from './dev-lab.ts';
import {hashSeed} from './procedural.ts';
import {advanceEncounters,createEncounters,hitEncounter,ENEMY_RULES,type Encounters,type EncounterEvent,type EnemyState} from './encounters.ts';
import {createComboState,requestComboAttack,stepCombo,cancelCombo,retireComboCommitment,sanitizeComboTuning,type ComboState,type ComboTuning,type ComboTuningInput,type ComboEvent,type ComboSnapshot,type ComboInputSource} from './combat.ts';
import {createGuardState,requestGuard,stepGuard,interruptGuard,guardBusy,type GuardState,type GuardContext,type GuardEvent} from './guard.ts';
import {resolveGuardDamage,SENTRY_HIT_STUN_SECONDS} from './guard-resolution.ts';

/** Separate from LAB_CASES: this is disposable interactive practice, never a tenth measured case. */
export const LIVE_SENTRY_CASE_ID='live-sentry' as const;
export const LIVE_SENTRY_STEP=1/60;
export const LIVE_SENTRY_ARENA=Object.freeze({
 caseId:LIVE_SENTRY_CASE_ID,bound:18,
 player:Object.freeze({x:8,y:0,z:5.5,facing:0}),
 enemy:Object.freeze({id:'lab-live-sentry',x:8,y:0,z:8,zone:'lab-live-sentry'}),
});
// Snapshot the unchanged course boxes. Callers cannot replace geometry for damage claims.
const obstacles=Object.freeze(LAB_OBSTACLES.map(o=>Object.freeze({...o})));
const PLAYER_ID='lab-live-player';
export type LivePracticeStatus='ready'|'active'|'paused'|'dead'|'defeated'|'disabled';
export type LivePracticePause='menu'|'blur'|'hidden'|'resize'|'snapshot-gap'|'invalid-frame';
export interface LivePracticePose {x:number;z:number;feetY:number;facing:number;grounded:boolean;crouched:boolean;stance:number}
/** One observed production worker reply, not an interpolated render transform. */
export interface LivePracticeFrame extends LivePracticePose {epoch:number;step:number}
export interface LivePracticeOptions {seed:number;epoch:number;tuning?:ComboTuningInput;enemyDamageScale?:number}
export interface LivePracticeState {
 readonly version:1;readonly caseId:typeof LIVE_SENTRY_CASE_ID;readonly seed:number;readonly bodySeed:number;
 readonly epoch:number;readonly tick:number;readonly lastStep:number|null;readonly status:LivePracticeStatus;
 readonly pause:LivePracticePause|null;readonly disabledBy:'suite'|'exit'|null;
 readonly hp:number;readonly pose:LivePracticePose|null;readonly encounters:Encounters;
 readonly enemyDamageScale:number;readonly combo:ComboState;readonly guard:GuardState;readonly tuning:ComboTuning;
}
export interface LivePracticeContact {
 tick:number;event:Extract<EncounterEvent,{type:'damage'}>;blocked:boolean;damage:number;hp:number;
}
export interface LivePracticeResult {
 state:LivePracticeState;accepted:boolean;reason:string|null;
 comboEvents:ComboEvent[];guardEvents:GuardEvent[];
 /** Contains hurt only when not intercepted, matching the production solo adapter. */
 encounterEvents:EncounterEvent[];
 /** Real sentry contacts, including an intercepted contact, for inspection/replay evidence. */
 contacts:LivePracticeContact[];
}
const result=(state:LivePracticeState,accepted=false,reason:string|null=null):LivePracticeResult=>({state,accepted,reason,comboEvents:[],guardEvents:[],encounterEvents:[],contacts:[]});
const counter=(n:number)=>Number.isSafeInteger(n)&&n>=0;
function validFrame(s:LivePracticeState,f:LivePracticeFrame){
 return !!f&&counter(f.epoch)&&f.epoch===s.epoch&&counter(f.step)&&
  [f.x,f.z,f.feetY,f.facing,f.stance].every(Number.isFinite)&&
  Math.abs(f.x)<=LIVE_SENTRY_ARENA.bound+.1&&Math.abs(f.z)<=LIVE_SENTRY_ARENA.bound+.1&&
  f.feetY>=-.1&&f.feetY<=12&&f.stance>=0&&f.stance<=1&&typeof f.grounded==='boolean'&&typeof f.crouched==='boolean';
}
function pose(f:LivePracticeFrame):LivePracticePose{return {x:f.x,z:f.z,feetY:f.feetY,facing:f.facing,grounded:f.grounded,crouched:f.crouched,stance:f.stance};}
const canStand=(p:LivePracticePose)=>p.grounded&&!p.crouched&&p.stance<=0;
function context(s:LivePracticeState):GuardContext{
 const p=s.pose!;
 return {player:{x:p.x,y:p.feetY,z:p.z,facing:p.facing,hp:s.hp,grounded:p.grounded,crouched:p.crouched||p.stance>0},playing:s.status==='active',obstacles};
}
function combatSnapshot(s:LivePracticeState):ComboSnapshot{
 const p=s.pose!,e=s.encounters.enemies[0]!;
 return {player:{x:p.x,y:p.feetY,z:p.z,facing:p.facing,hp:s.hp},targets:[{id:e.id,x:e.x,y:e.y,z:e.z,alive:s.status==='active'&&canStand(p)&&e.hp>0}],obstacles};
}
function unavailable(s:LivePracticeState){return s.status==='active'?null:s.status;}
export function createLiveSentryPractice(options:LivePracticeOptions):LivePracticeState{
 if(!options||!Number.isInteger(options.seed)||options.seed<0||options.seed>0xffffffff||!counter(options.epoch))throw new RangeError('Practice requires a uint32 seed and a nonnegative worker epoch');
 const tuning=sanitizeComboTuning(options.tuning),enemyDamageScale=typeof options.enemyDamageScale==='number'&&Number.isFinite(options.enemyDamageScale)?Math.max(.1,Math.min(3,options.enemyDamageScale)):1;
 return {version:1,caseId:LIVE_SENTRY_CASE_ID,seed:options.seed,bodySeed:hashSeed(`creature:${options.seed}:${LIVE_SENTRY_ARENA.enemy.id}`),epoch:options.epoch,tick:0,lastStep:null,status:'ready',enemyDamageScale,pause:null,disabledBy:null,hp:100,pose:null,encounters:createEncounters([LIVE_SENTRY_ARENA.enemy]),combo:createComboState(tuning),guard:createGuardState(),tuning};
}
/** Reset is explicit and only practice-owned data is replaced. A fresh physics epoch rejects old replies. */
export function resetLiveSentryPractice(s:LivePracticeState,options:LivePracticeOptions):LivePracticeResult{
 if(s.status==='disabled')return result(s,false,'disabled');
 if(!options||!counter(options.epoch)||options.epoch<=s.epoch)return result(s,false,'invalid-reset');
 return result(createLiveSentryPractice(options),true);
}
/** Arm a currently observed pose without advancing time or replaying a background interval. */
export function resumeLiveSentryPractice(s:LivePracticeState,f:LivePracticeFrame):LivePracticeResult{
 if(s.status!=='ready'&&s.status!=='paused')return result(s,false,s.status);
 if(!validFrame(s,f))return result(s,false,'invalid-frame');
 if(s.lastStep!==null&&f.step<s.lastStep)return result(s,false,'stale-frame');
 return result({...s,status:'active',pause:null,pose:pose(f),lastStep:f.step},true);
}
/** Cancel the interception and queued staff hit, but retain paid cost, stun and original recovery lock. */
export function suspendLiveSentryPractice(s:LivePracticeState,reason:LivePracticePause):LivePracticeResult{
 if(s.status!=='active')return result(s,false,s.status);
 const guard=interruptGuard(s.guard,reason==='menu'?'menu':'pause');
 const r=result({...s,status:'paused',pause:reason,guard:guard.state,combo:retireComboCommitment(s.combo)},true);
 r.guardEvents=guard.events;return r;
}
/** Terminal: entering the measured suite or leaving the lab cannot resume this instance later. */
export function disableLiveSentryPractice(s:LivePracticeState,reason:'suite'|'exit'):LivePracticeResult{
 if(s.status==='disabled')return result(s,false,'disabled');
 const guard=interruptGuard(s.guard,'zone');
 const r=result({...s,status:'disabled',disabledBy:reason,pause:null,guard:guard.state,combo:retireComboCommitment(s.combo)},true);
 r.guardEvents=guard.events;return r;
}
/** Immediate jump/crouch edges remove guard before the next physics reply; no invulnerability is added. */
export function cancelLiveSentryAction(s:LivePracticeState,reason:'jump'|'crouch'):LivePracticeResult{
 const blocked=unavailable(s);if(blocked)return result(s,false,blocked);
 const guard=interruptGuard(s.guard,reason);
 const combo=s.combo.phase==='idle'?{state:s.combo,events:[]}:cancelCombo(s.combo,'dodge',s.tuning);
 const r=result({...s,guard:guard.state,combo:combo.state},true);r.guardEvents=guard.events;r.comboEvents=combo.events;return r;
}
export function requestLiveSentryAttack(s:LivePracticeState,source:ComboInputSource='manual'):LivePracticeResult{
 const blocked=unavailable(s);if(blocked)return result(s,false,blocked);
 if(!s.pose||!canStand(s.pose))return result(s,false,'posture');
 if(guardBusy(s.guard))return result(s,false,'guard-busy');
 const combo=requestComboAttack(s.combo,combatSnapshot(s),s.tuning,source),rejected=combo.events.find(e=>e.type==='rejected');
 const r=result({...s,combo:combo.state},!rejected,rejected?.type==='rejected'?rejected.reason:null);r.comboEvents=combo.events;return r;
}
export function requestLiveSentryGuard(s:LivePracticeState,intentId:string):LivePracticeResult{
 const blocked=unavailable(s);if(blocked)return result(s,false,blocked);
 const guard=requestGuard(s.guard,s.combo,context(s),intentId,undefined,s.tuning),rejected=guard.events.find(e=>e.type==='rejected');
 const r=result({...s,guard:guard.state,combo:guard.combo},!rejected,rejected?.type==='rejected'?rejected.reason:null);r.guardEvents=guard.events;return r;
}
/**
 * Exactly one authoritative physics tick. The worker emits every simulated tick;
 * duplicate paused replies do not advance, and missing replies pause instead of
 * inventing intermediate positions (particularly a jump over an unseen contact).
 */
export function stepLiveSentryPractice(s:LivePracticeState,f:LivePracticeFrame):LivePracticeResult{
 const blocked=unavailable(s);if(blocked)return result(s,false,blocked);
 if(f?.epoch!==s.epoch)return result(s,false,'stale-frame');
 if(!validFrame(s,f)){const r=suspendLiveSentryPractice(s,'invalid-frame');r.accepted=false;r.reason='invalid-frame';return r;}
 if(s.lastStep!==null&&f.step<=s.lastStep)return result(s,false,f.step===s.lastStep?'duplicate-frame':'stale-frame');
 if(s.lastStep===null||f.step!==s.lastStep+1){const r=suspendLiveSentryPractice(s,'snapshot-gap');r.accepted=false;r.reason='snapshot-gap';return r;}
 let next:LivePracticeState={...s,tick:s.tick+1,lastStep:f.step,pose:pose(f)};
 const r=result(next,true),c=context(next),guard=stepGuard(next.guard,LIVE_SENTRY_STEP,c);
 next={...next,guard:guard.state};r.guardEvents.push(...guard.events);
 const encounter=advanceEncounters(next.encounters,LIVE_SENTRY_STEP,{zone:LIVE_SENTRY_ARENA.enemy.zone,players:[{id:PLAYER_ID,...c.player}],obstacles,height:()=>0,defeated:[],damageScale:next.enemyDamageScale});
 next={...next,encounters:encounter.state};
 for(const event of encounter.events){
  if(event.type!=='damage'){r.encounterEvents.push(event);continue;}
  const hit=resolveGuardDamage(next.guard,context(next),event,next.encounters.enemies[0]);
  next={...next,guard:hit.guard,hp:Math.max(0,next.hp-hit.damage)};r.guardEvents.push(...hit.events);
  r.contacts.push({tick:next.tick,event,blocked:hit.blocked,damage:hit.damage,hp:next.hp});
  if(!hit.blocked){
   r.encounterEvents.push(event);
   const stunned=cancelCombo(next.combo,'stun',next.tuning,SENTRY_HIT_STUN_SECONDS);next={...next,combo:stunned.state};r.comboEvents.push(...stunned.events);
  }
 }
 if(!canStand(next.pose!)&&next.combo.phase!=='idle'){
  const cancelled=cancelCombo(next.combo,'dodge',next.tuning);next={...next,combo:cancelled.state};r.comboEvents.push(...cancelled.events);
 }
 const combo=stepCombo(next.combo,LIVE_SENTRY_STEP,combatSnapshot(next),next.tuning);next={...next,combo:combo.state};r.comboEvents.push(...combo.events);
 // Only events issued by the shared combo authority in THIS tick may apply damage.
 // Its hitIds own one contact per swing; no exported raw hit/damage command exists.
 for(const event of combo.events)if(event.type==='hit'){
  const hit=hitEncounter(next.encounters,event.targetId,event.damage);next={...next,encounters:hit.state};r.encounterEvents.push(...hit.events);
 }
 if(next.hp<=0||next.encounters.enemies[0]!.hp<=0){
  const dead=next.hp<=0,interrupted=interruptGuard(next.guard,dead?'dead':'zone');
  next={...next,status:dead?'dead':'defeated',guard:interrupted.state,combo:retireComboCommitment(next.combo)};r.guardEvents.push(...interrupted.events);
 }
 r.state=next;return r;
}
/** Copied output is safe for renderer projection. Mutating it cannot refill authoritative stamina. */
export function liveSentrySnapshot(s:LivePracticeState){
 const e=s.encounters.enemies[0]!;
 return structuredClone({version:s.version,caseId:s.caseId,seed:s.seed,bodySeed:s.bodySeed,epoch:s.epoch,tick:s.tick,lastStep:s.lastStep,status:s.status,pause:s.pause,disabledBy:s.disabledBy,hp:s.hp,enemyDamageScale:s.enemyDamageScale,pose:s.pose,combo:s.combo,guard:s.guard,enemy:e as EnemyState,
  target:{id:e.id,x:e.x,y:e.y,z:e.z,alive:s.status==='active'&&e.hp>0&&s.hp>0},
  collision:{x:e.x,y:e.y,z:e.z,radius:ENEMY_RULES.radius},
 });
}
export type LivePracticeSnapshot=ReturnType<typeof liveSentrySnapshot>;
