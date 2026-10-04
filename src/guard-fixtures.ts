import {createComboState,stepCombo,type ComboState} from './combat.ts';
import {createEncounters,advanceEncounters,type EnemyState,type EncounterEvent} from './encounters.ts';
import {createGuardState,requestGuard,stepGuard,DEFAULT_GUARD_RECIPE,type GuardState,type GuardContext,type GuardEvent} from './guard.ts';
import {resolveGuardDamage} from './guard-resolution.ts';
export type GuardReviewSubject='guard-windup'|'guard-active'|'guard-blocked'|'guard-recovery'|'guard-too-early'|'guard-rear';
export const GUARD_VISUAL_FIXTURES=Object.freeze([
 {id:'guard-windup',label:'Guard · committed windup',watch:'Amber boundary is still vulnerable; 22 stamina is already spent.'},
 {id:'guard-active',label:'Guard · active front sector',watch:'Mint 120° boundary has exactly 2.4m reach; the player faces the approaching sentry.'},
 {id:'guard-blocked',label:'Guard · one intercepted contact',watch:'The same authority records one block, consumes the guard and keeps HP intact; subsequent contacts remain harmful.'},
 {id:'guard-recovery',label:'Guard · committed recovery',watch:'Faded sector cannot intercept; staff shares the spent stamina and original commitment.'},
 {id:'guard-too-early',label:'Guard · early timing failure',watch:'A real sentry contact arrives after the active window and damages the player.'},
 {id:'guard-rear',label:'Guard · rear-facing failure',watch:'A real sentry contact approaches behind the locked facing; the front field does not grant invulnerability.'},
] as const);
export interface GuardReviewFrame {tick:number;seconds:number;hp:number;combo:ComboState;guard:GuardState;enemy:EnemyState;events:EncounterEvent[];guardEvents:GuardEvent[]}
/** Disposable production clocks and actual sentry contacts; no campaign reads, writes or fabricated hits. */
export function guardReviewRun(mode:'timed'|'early'|'rear'='timed'){
 let encounters=createEncounters([{id:'guard-review-sentry',x:0,y:0,z:2,zone:'valley'}]),guard=createGuardState(),combo=createComboState(),hp=100;
 const context:GuardContext={player:{x:0,y:0,z:0,facing:mode==='rear'?Math.PI:0,hp,grounded:true,crouched:false},playing:true,obstacles:[]},frames:GuardReviewFrame[]=[];
 const pressTick=mode==='early'?0:33;
 for(let tick=0;tick<=90;tick++){
  let guardEvents:GuardEvent[]=[];context.player.hp=hp;
  if(tick===pressTick){const request=requestGuard(guard,combo,context,'review-'+mode);guard=request.state;combo=request.combo;guardEvents.push(...request.events);}
  const updated=stepGuard(guard,1/60,context);guard=updated.state;guardEvents.push(...updated.events);
  const result=advanceEncounters(encounters,1/60,{zone:'valley',players:[{id:'review-player',x:0,y:0,z:0,hp}],obstacles:[],height:()=>0,defeated:[]});encounters=result.state;
  for(const event of result.events)if(event.type==='damage'){const hit=resolveGuardDamage(guard,context,event,encounters.enemies[0]);guard=hit.guard;guardEvents.push(...hit.events);hp=Math.max(0,hp-hit.damage);}
  combo=stepCombo(combo,1/60,{player:{x:0,y:0,z:0,facing:context.player.facing,hp},targets:[],obstacles:[]}).state;
  frames.push(structuredClone({tick,seconds:(tick+1)/60,hp,combo,guard,enemy:encounters.enemies[0]!,events:result.events,guardEvents}));
 }
 return {version:1 as const,mode,recipe:DEFAULT_GUARD_RECIPE,pressTick,stepSeconds:1/60,maximumTicks:91,frames,scope:'Disposable fixed-step production guard + sentry; no campaign mutation, screenshot, latency or device-performance claim'};
}
export function guardReviewStates(){
 const timed=guardReviewRun(),early=guardReviewRun('early'),rear=guardReviewRun('rear');
 const find=(run:ReturnType<typeof guardReviewRun>,predicate:(f:GuardReviewFrame)=>boolean)=>{const frame=run.frames.find(predicate);if(!frame)throw new Error('Guard review production state not reached');return frame;};
 return {runs:{timed,early,rear},states:{
  'guard-windup':find(timed,f=>f.guard.phase==='windup'),
  'guard-active':find(timed,f=>f.guard.phase==='active'&&!f.guard.spent),
  'guard-blocked':find(timed,f=>f.guardEvents.some(e=>e.type==='blocked')),
  'guard-recovery':find(timed,f=>f.guard.phase==='recovery'),
  'guard-too-early':find(early,f=>f.hp<100),
  'guard-rear':find(rear,f=>f.hp<100),
 } satisfies Record<GuardReviewSubject,GuardReviewFrame>};
}
export function guardReviewCamera(angle='three-quarter'){
 const position=angle==='front'?[0,3.8,6.5]:angle==='side'?[6.5,3.8,0]:angle==='back'?[0,3.8,-6.5]:[4.6,3.8,5.1];
 return {position:position as [number,number,number],target:[0,.65,1] as [number,number,number],near:.01,far:18};
}
/** Numeric lab assertions reuse exact fixture production results; never stand in for raster review. */
export function guardSystemChecks(){
 const r=guardReviewStates(),s=r.states;return [
  {name:'Timed guard intercepts one real sentry strike',pass:s['guard-blocked'].hp===100&&s['guard-blocked'].guard.lastBlock?.id===1&&s['guard-blocked'].combo.stamina===78,actual:`${s['guard-blocked'].hp} HP; ${s['guard-blocked'].guard.lastBlock?.id??0} blocks; ${s['guard-blocked'].combo.stamina} stamina`,expected:'100 HP; one authoritative interception; 78 shared stamina'},
  {name:'Early and rear timing remain vulnerable',pass:s['guard-too-early'].hp===88&&s['guard-rear'].hp===88&&s['guard-too-early'].guard.lastBlock===null&&s['guard-rear'].guard.lastBlock===null,actual:`early ${s['guard-too-early'].hp} HP; rear ${s['guard-rear'].hp} HP`,expected:'88 HP in both actual sentry-contact failures'},
 ];
}
