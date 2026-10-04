import {obstacleSegmentIntersects,type ConvexPlane} from './wilderness-geometry.ts';
import type {State,WorldObject} from './world.ts';
import {worldHeight} from './generation.ts';
import {INTERACTION_DISTANCE} from './world.ts';
export interface CombatObstacle {x:number;z:number;hx:number;hz:number;y?:number;hy?:number;featureId?:string;convexVertices?:readonly number[];convexPlanes?:readonly ConvexPlane[]}
/** Segment-vs-solid-box test against the same walls/obstacles used by movement. */
export function clearPulsePath(from:{x:number;y?:number;z:number},to:{x:number;y?:number;z:number},obstacles:readonly CombatObstacle[]){
 for(const o of obstacles){
  if(o.convexPlanes?.length){if(obstacleSegmentIntersects({...o,y:o.y??o.hy??0,hy:o.hy??10000},{...from,y:(from.y??0)+1},{...to,y:(to.y??0)+1}))return false;continue;}
  let enter=0,exit=1;
  const a3={...from,y:(from.y??0)+1},b3={...to,y:(to.y??0)+1};
  for(const axis of ['x','y','z'] as const){
   if(axis==='y'&&o.hy===undefined)continue;
   const delta=b3[axis]-a3[axis],half=axis==='x'?o.hx:axis==='z'?o.hz:o.hy!,center=axis==='y'?(o.y??o.hy!):o[axis],lo=center-half,hi=center+half;
   if(Math.abs(delta)<1e-9){if(a3[axis]<lo||a3[axis]>hi){enter=2;break;}}
   else{const a=(lo-a3[axis])/delta,b=(hi-a3[axis])/delta;enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));}
   if(enter>exit)break;
  }
  if(enter<=exit)return false;
 }
 return true;
}
export function pulseTargets(state:State,objects:readonly WorldObject[],obstacles:readonly CombatObstacle[]){
 if(state.player.hp<=0)return [];
 const from={...state.player,y:worldHeight(state,state.player.x,state.player.z)};
 return objects.filter(o=>o.kind==='enemy'&&!state.defeated.includes(o.id)&&Math.hypot(o.x-from.x,o.z-from.z,(o.y??0)-from.y)<=INTERACTION_DISTANCE&&clearPulsePath(from,o,obstacles));
}
export function autoPulseReady(touch:boolean,enabled:boolean,playing:boolean,cooldown:number,targets:number){return touch&&enabled&&playing&&cooldown<=0&&targets>0;}
export const PULSE_COOLDOWN=.55;

/** Transient staff combat. Nothing here belongs in the campaign save schema. */
export type ComboStage = 1 | 2 | 3;
export type ComboPhase = 'idle' | 'prep' | 'active' | 'recovery' | 'stunned';
export type ComboInputSource = 'manual' | 'auto';
export interface StaffAttack {
 name:string; prep:number; active:number; recovery:number;
 /** Metres, and the full horizontal front arc in radians. */
 range:number; arc:number; damage:number; staminaCost:number;
 /** Presentation signals only: these never stop or alter the simulation clock. */
 hitstopSeconds:number; knockback:number;
}
export interface ComboTuning {
 attacks:readonly [Readonly<StaffAttack>,Readonly<StaffAttack>,Readonly<StaffAttack>];
 maxStamina:number; staminaRegenPerSecond:number; staminaRegenDelay:number;
 inputBufferSeconds:number; prepCancelFraction:number; recoveryCancelFraction:number;
 dodgeLockSeconds:number; defaultStunSeconds:number; maxStunSeconds:number;
}
export type ComboTuningInput = Partial<Omit<ComboTuning,'attacks'>> & {attacks?:readonly Partial<StaffAttack>[]};
export const DEFAULT_COMBO_TUNING:Readonly<ComboTuning> = Object.freeze({
 attacks:Object.freeze([
  Object.freeze({name:'Opening sweep',prep:.16,active:.12,recovery:.26,range:2.85,arc:1.95,damage:24,staminaCost:14,hitstopSeconds:.035,knockback:.42}),
  Object.freeze({name:'Reverse sweep',prep:.20,active:.14,recovery:.28,range:3,arc:2.25,damage:32,staminaCost:17,hitstopSeconds:.045,knockback:.6}),
  Object.freeze({name:'Driving finisher',prep:.30,active:.16,recovery:.42,range:3.4,arc:1.2,damage:48,staminaCost:25,hitstopSeconds:.075,knockback:1.1}),
 ]) as ComboTuning['attacks'],
 maxStamina:100,staminaRegenPerSecond:24,staminaRegenDelay:.65,inputBufferSeconds:.30,
 prepCancelFraction:.35,recoveryCancelFraction:.8,dodgeLockSeconds:.18,defaultStunSeconds:.5,maxStunSeconds:2,
});
const COMBO_EPSILON=1e-9;
function comboBound(value:unknown,fallback:number,min:number,max:number):number {
 return typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
}
/** Every live lab slider is bounded here, including NaN/infinity and missing entries. */
export function sanitizeComboTuning(input:ComboTuningInput={}):ComboTuning {
 const d=DEFAULT_COMBO_TUNING,maxStamina=comboBound(input.maxStamina,d.maxStamina,40,200);
 const attacks=d.attacks.map((base,i)=>{
  const a=input.attacks?.[i]??{};
  return {name:typeof a.name==='string'&&a.name.trim()?a.name.trim().slice(0,48):base.name,
   prep:comboBound(a.prep,base.prep,.06,1),active:comboBound(a.active,base.active,.04,.5),recovery:comboBound(a.recovery,base.recovery,.10,1.5),
   range:comboBound(a.range,base.range,.5,INTERACTION_DISTANCE),arc:comboBound(a.arc,base.arc,.2,Math.PI),
   damage:comboBound(a.damage,base.damage,1,100),staminaCost:comboBound(a.staminaCost,base.staminaCost,1,maxStamina),
   hitstopSeconds:comboBound(a.hitstopSeconds,base.hitstopSeconds,0,.12),knockback:comboBound(a.knockback,base.knockback,0,1.5)};
 }) as [StaffAttack,StaffAttack,StaffAttack];
 const maxStunSeconds=comboBound(input.maxStunSeconds,d.maxStunSeconds,.1,3);
 return {attacks,maxStamina,maxStunSeconds,
  staminaRegenPerSecond:comboBound(input.staminaRegenPerSecond,d.staminaRegenPerSecond,1,80),
  staminaRegenDelay:comboBound(input.staminaRegenDelay,d.staminaRegenDelay,0,3),
  inputBufferSeconds:comboBound(input.inputBufferSeconds,d.inputBufferSeconds,.05,.6),
  prepCancelFraction:comboBound(input.prepCancelFraction,d.prepCancelFraction,0,.5),
  recoveryCancelFraction:comboBound(input.recoveryCancelFraction,d.recoveryCancelFraction,.5,1),
  dodgeLockSeconds:comboBound(input.dodgeLockSeconds,d.dodgeLockSeconds,.1,.6),
  defaultStunSeconds:comboBound(input.defaultStunSeconds,d.defaultStunSeconds,.05,maxStunSeconds)};
}
export interface ComboTarget {id:string;x:number;y?:number;z:number;alive?:boolean}
export interface ComboSnapshot {
 /** Authoritative position, ground elevation, and yaw. Zero yaw faces +Z. */
 player:{x:number;y?:number;z:number;facing:number;hp:number};
 targets:readonly ComboTarget[]; obstacles:readonly CombatObstacle[];
}
export interface ComboState {
 time:number; phase:ComboPhase; stage:0|ComboStage; elapsed:number; phaseElapsed:number;
 stamina:number; regenDelay:number; buffered:boolean; attackId:number; hitIds:readonly string[];
 /** Locked for the current attack; renderer rotation never authorizes damage. */
 facing:number; source:ComboInputSource; stunRemaining:number; cancelLockRemaining:number;
 /** Attack timings are latched at start, so editing sliders cannot skip recovery. */
 attack:Readonly<StaffAttack>|null;
}
export type ComboRejectReason='dead'|'invalid-snapshot'|'stunned'|'cooldown'|'stamina'|'too-early'|'already-buffered'|'finisher'|'cancel-window';
interface ComboEventBase {at:number;attackId:number;stage:0|ComboStage}
export type ComboEvent =
 | (ComboEventBase & {type:'stage';stage:ComboStage;name:string;source:ComboInputSource})
 | (ComboEventBase & {type:'phase';phase:ComboPhase})
 | (ComboEventBase & {type:'buffered';nextStage:ComboStage})
 | (ComboEventBase & {type:'rejected';reason:ComboRejectReason})
 | (ComboEventBase & {type:'hit';stage:ComboStage;targetId:string;damage:number;position:{x:number;y:number;z:number};knockback:{x:number;z:number;strength:number};hitstopSeconds:number})
 | (ComboEventBase & {type:'whiff';stage:ComboStage})
 | (ComboEventBase & {type:'cancel';reason:'dodge'|'stun'|'reset'|'dead'});
export interface ComboResult {state:ComboState;events:ComboEvent[]}
export function createComboState(tuning:ComboTuningInput=DEFAULT_COMBO_TUNING):ComboState {
 const t=sanitizeComboTuning(tuning);
 return {time:0,phase:'idle',stage:0,elapsed:0,phaseElapsed:0,stamina:t.maxStamina,regenDelay:0,buffered:false,attackId:0,hitIds:[],facing:0,source:'manual',stunRemaining:0,cancelLockRemaining:0,attack:null};
}
export function comboAttackDuration(attack:Readonly<StaffAttack>):number{return attack.prep+attack.active+attack.recovery;}
function comboEventBase(s:ComboState):ComboEventBase{return {at:s.time,attackId:s.attackId,stage:s.stage};}
function comboRejected(state:ComboState,reason:ComboRejectReason):ComboResult{return {state,events:[{...comboEventBase(state),type:'rejected',reason}]};}
function validComboPlayer(p:ComboSnapshot['player']):boolean{return [p.x,p.y??0,p.z,p.facing,p.hp].every(Number.isFinite);}
function activeCombo(state:ComboState):state is ComboState & {stage:ComboStage;attack:Readonly<StaffAttack>} {
 return state.stage!==0&&state.attack!==null&&(state.phase==='prep'||state.phase==='active'||state.phase==='recovery');
}
export function comboBufferOpen(state:ComboState,tuning:ComboTuningInput=DEFAULT_COMBO_TUNING):boolean {
 if(!activeCombo(state)||state.stage===3||state.buffered)return false;
 const t=sanitizeComboTuning(tuning),a=state.attack;
 // A buffer can never open during preparation, even with the widest tuning.
 return state.elapsed+COMBO_EPSILON>=Math.max(a.prep,comboAttackDuration(a)-t.inputBufferSeconds);
}
function startCombo(state:ComboState,stage:ComboStage,snapshot:ComboSnapshot,t:ComboTuning,source:ComboInputSource):ComboResult {
 const attack={...t.attacks[stage-1]!},available=Math.max(0,Math.min(t.maxStamina,state.stamina));
 if(available+COMBO_EPSILON<attack.staminaCost)return comboRejected(state,'stamina');
 const next:ComboState={...state,phase:'prep',stage,elapsed:0,phaseElapsed:0,stamina:Math.max(0,available-attack.staminaCost),regenDelay:t.staminaRegenDelay,buffered:false,attackId:state.attackId+1,hitIds:[],facing:snapshot.player.facing,source,stunRemaining:0,attack};
 return {state:next,events:[{...comboEventBase(next),type:'stage',stage,name:attack.name,source},{...comboEventBase(next),type:'phase',phase:'prep'}]};
}
/** Input is an edge, not a held button. Manual and auto both enter this exact gate. */
export function requestComboAttack(state:ComboState,snapshot:ComboSnapshot,tuning:ComboTuningInput=DEFAULT_COMBO_TUNING,source:ComboInputSource='manual'):ComboResult {
 if(!validComboPlayer(snapshot.player))return comboRejected(state,'invalid-snapshot');
 if(snapshot.player.hp<=0)return comboRejected(state,'dead');
 if(state.phase==='stunned'||state.stunRemaining>COMBO_EPSILON)return comboRejected(state,'stunned');
 if(state.cancelLockRemaining>COMBO_EPSILON)return comboRejected(state,'cooldown');
 const t=sanitizeComboTuning(tuning);
 if(!activeCombo(state))return startCombo(state,1,snapshot,t,source);
 if(state.stage===3)return comboRejected(state,'finisher');
 if(state.buffered)return comboRejected(state,'already-buffered');
 if(!comboBufferOpen(state,t))return comboRejected(state,'too-early');
 const nextStage=(state.stage+1) as ComboStage;
 if(state.stamina+COMBO_EPSILON<t.attacks[nextStage-1]!.staminaCost)return comboRejected(state,'stamina');
 const next={...state,buffered:true};
 return {state:next,events:[{...comboEventBase(next),type:'buffered',nextStage}]};
}
/** Same range/front-arc/occlusion predicate as hit resolution, useful for auto intent. */
export function comboEligibleTargets(snapshot:ComboSnapshot,attack:Readonly<StaffAttack>=DEFAULT_COMBO_TUNING.attacks[0],facing=snapshot.player.facing):ComboTarget[] {
 if(!validComboPlayer(snapshot.player)||snapshot.player.hp<=0||!Number.isFinite(facing))return [];
 const from=snapshot.player,fx=Math.sin(facing),fz=Math.cos(facing),limit=Math.cos(attack.arc/2),seen=new Set<string>();
 return snapshot.targets.filter(target=>{
  if(target.alive===false||!target.id||seen.has(target.id)||![target.x,target.y??0,target.z].every(Number.isFinite))return false;
  seen.add(target.id);
  const dx=target.x-from.x,dz=target.z-from.z,dy=(target.y??0)-(from.y??0),horizontal=Math.hypot(dx,dz);
  if(Math.hypot(dx,dy,dz)>attack.range+COMBO_EPSILON)return false;
  if(horizontal>COMBO_EPSILON&&(dx*fx+dz*fz)/horizontal<limit-COMBO_EPSILON)return false;
  return clearPulsePath(from,target,snapshot.obstacles);
 });
}
function resolveComboHits(state:ComboState,snapshot:ComboSnapshot):ComboResult {
 if(!activeCombo(state)||state.phase!=='active')return {state,events:[]};
 const {attack,stage}=state,hitIds=new Set(state.hitIds),events:ComboEvent[]=[];
 for(const target of comboEligibleTargets(snapshot,attack,state.facing)){
  if(hitIds.has(target.id))continue;
  hitIds.add(target.id);
  const dx=target.x-snapshot.player.x,dz=target.z-snapshot.player.z,length=Math.hypot(dx,dz),x=length>COMBO_EPSILON?dx/length:Math.sin(state.facing),z=length>COMBO_EPSILON?dz/length:Math.cos(state.facing);
  events.push({...comboEventBase(state),type:'hit',stage,targetId:target.id,damage:attack.damage,position:{x:target.x,y:target.y??0,z:target.z},knockback:{x:x*attack.knockback,z:z*attack.knockback,strength:attack.knockback},hitstopSeconds:attack.hitstopSeconds});
 }
 return events.length?{state:{...state,hitIds:[...hitIds]},events}:{state,events};
}
function clearComboAttack(state:ComboState):ComboState {
 return {...state,phase:'idle',stage:0,elapsed:0,phaseElapsed:0,buffered:false,hitIds:[],attack:null};
}
/**
 * Advances all crossed phase boundaries, including an entire active window in a
 * coarse frame. Geometry uses the supplied authoritative snapshot; callers with
 * moving targets should feed fixed physics snapshots, never cosmetic transforms.
 * Hitstop is deliberately absent from this clock. No dt is silently discarded.
 */
export function stepCombo(state:ComboState,dt:number,snapshot:ComboSnapshot,tuning:ComboTuningInput=DEFAULT_COMBO_TUNING):ComboResult {
 if(!Number.isFinite(dt)||dt<=0||!validComboPlayer(snapshot.player))return {state,events:[]};
 if(snapshot.player.hp<=0){
  if(!activeCombo(state)&&state.phase!=='stunned'&&!state.buffered)return {state,events:[]};
  return {state:{...clearComboAttack(state),stunRemaining:0,cancelLockRemaining:0},events:[{...comboEventBase(state),type:'cancel',reason:'dead'}]};
 }
 const t=sanitizeComboTuning(tuning),events:ComboEvent[]=[];
 let s:ComboState={...state,stamina:Math.max(0,Math.min(t.maxStamina,state.stamina))},remaining=dt;
 const advance=(seconds:number,regenerate:boolean)=>{
  const delay=s.regenDelay;
  s={...s,time:s.time+seconds,regenDelay:Math.max(0,delay-seconds),cancelLockRemaining:Math.max(0,s.cancelLockRemaining-seconds),stamina:regenerate?Math.min(t.maxStamina,s.stamina+Math.max(0,seconds-delay)*t.staminaRegenPerSecond):s.stamina};
  remaining=Math.max(0,remaining-seconds);
 };
 // At most two attacks can occur in a call: current + its single buffered edge.
 while(remaining>COMBO_EPSILON){
  if(s.phase==='stunned'){
   const duration=Math.min(remaining,s.stunRemaining);advance(duration,false);s={...s,stunRemaining:Math.max(0,s.stunRemaining-duration),phaseElapsed:s.phaseElapsed+duration};
   if(s.stunRemaining<=COMBO_EPSILON){s=clearComboAttack(s);events.push({...comboEventBase(s),type:'phase',phase:'idle'});}
   continue;
  }
  if(!activeCombo(s)){
   if(s.cancelLockRemaining>COMBO_EPSILON){const duration=Math.min(remaining,s.cancelLockRemaining);advance(duration,false);continue;}
   advance(remaining,true);break;
  }
  const attack=s.attack;
  if(s.phase==='active'){const hits=resolveComboHits(s,snapshot);s=hits.state;events.push(...hits.events);}
  const end=s.phase==='prep'?attack.prep:s.phase==='active'?attack.prep+attack.active:comboAttackDuration(attack);
  const duration=Math.min(remaining,Math.max(0,end-s.elapsed));
  advance(duration,false);s={...s,elapsed:s.elapsed+duration,phaseElapsed:s.phaseElapsed+duration};
  if(s.elapsed+COMBO_EPSILON<end)continue;
  s={...s,elapsed:end,phaseElapsed:0};
  if(s.phase==='prep'){
   s={...s,phase:'active'};events.push({...comboEventBase(s),type:'phase',phase:'active'});
   const hits=resolveComboHits(s,snapshot);s=hits.state;events.push(...hits.events);
  }else if(s.phase==='active'){
   if(!s.hitIds.length)events.push({...comboEventBase(s),type:'whiff',stage:s.stage as ComboStage});
   s={...s,phase:'recovery'};events.push({...comboEventBase(s),type:'phase',phase:'recovery'});
  }else{
   const stage=s.stage as ComboStage,buffered=s.buffered,source=s.source;
   s=clearComboAttack(s);events.push({...comboEventBase(s),type:'phase',phase:'idle'});
   if(buffered&&stage<3){const start=startCombo(s,(stage+1) as ComboStage,snapshot,t,source);s=start.state;events.push(...start.events);}
  }
 }
 return {state:s,events};
}
/** Drop a retired world's/session's hit and buffer without shortening a paid commitment. */
export function retireComboCommitment(state:ComboState):ComboState {
 const remaining=activeCombo(state)?Math.max(0,comboAttackDuration(state.attack)-state.elapsed):0;
 return {...clearComboAttack(state),phase:state.stunRemaining>0?'stunned':'idle',cancelLockRemaining:Math.max(state.cancelLockRemaining,remaining)};
}
/**
 * Dodge can interrupt early preparation or late recovery, without refunding
 * stamina or shortening the original attack lock. Stun always interrupts and
 * drops buffered intent. Reset is reserved for world/session transitions.
 */
export function cancelCombo(state:ComboState,reason:'dodge'|'stun'|'reset',tuning:ComboTuningInput=DEFAULT_COMBO_TUNING,stunSeconds?:number):ComboResult {
 const t=sanitizeComboTuning(tuning);
 if(reason==='reset')return {state:{...clearComboAttack(state),stunRemaining:0,cancelLockRemaining:0},events:[{...comboEventBase(state),type:'cancel',reason}]};
 if(reason==='stun'){
  const duration=comboBound(stunSeconds,t.defaultStunSeconds,.05,t.maxStunSeconds);
  // A short stun cannot be used to discard a longer committed attack recovery.
  const lock=Math.max(state.cancelLockRemaining,activeCombo(state)?comboAttackDuration(state.attack)-state.elapsed:0);
  const next={...clearComboAttack(state),phase:'stunned' as const,stunRemaining:Math.max(state.stunRemaining,duration),cancelLockRemaining:lock};
  return {state:next,events:[{...comboEventBase(state),type:'cancel',reason},{...comboEventBase(next),type:'phase',phase:'stunned'}]};
 }
 if(state.phase==='stunned')return comboRejected(state,'stunned');
 if(state.cancelLockRemaining>COMBO_EPSILON)return comboRejected(state,'cooldown');
 let lock=t.dodgeLockSeconds;
 if(activeCombo(state)){
  const a=state.attack,early=state.phase==='prep'&&state.elapsed<=a.prep*t.prepCancelFraction+COMBO_EPSILON,late=state.phase==='recovery'&&state.phaseElapsed+COMBO_EPSILON>=a.recovery*t.recoveryCancelFraction;
  if(!early&&!late)return comboRejected(state,'cancel-window');
  lock=Math.max(lock,comboAttackDuration(a)-state.elapsed);
 }
 const next={...clearComboAttack(state),cancelLockRemaining:lock,stunRemaining:0};
 return {state:next,events:[{...comboEventBase(state),type:'cancel',reason},{...comboEventBase(next),type:'phase',phase:'idle'}]};
}
