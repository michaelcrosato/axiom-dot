import {idleAnimation,stepAnimation,stepFacing,contactAnimationPhase,stepGroundSupport,landingForImpact,type AnimationState,type MotionInput} from './locomotion.ts';
import {validPlayerContact,validMovableBodies,type PlayerContact,type MovableBody} from './player-contact.ts';

export const ANIMATION_REVIEW_VERSION=1;
export const ANIMATION_STEP_SECONDS=1/60;
export const ANIMATION_MAX_TICKS=360;
export type AnimationClipId='run-brake'|'wall-contact'|'push-crate'|'pull-crate'|'ledge-climb'|'walk-accelerate-turn-stop'|'jump-land'|'crouch-crawl-stand'|'run-slide-recover';
export interface ReviewObstacle{x:number;z:number;y?:number;hx:number;hy:number;hz:number}
export interface ReviewInput extends MotionInput{grab:boolean}
export interface AnimationClip{id:AnimationClipId;label:string;watch:string;ticks:number;spawn:{x:number;z:number};obstacles:ReviewObstacle[];movable:MovableBody[];input:(tick:number)=>ReviewInput}
const command=(value:Partial<ReviewInput>={}):ReviewInput=>({x:0,z:0,analog:true,sprint:false,crouch:false,jump:false,paused:false,grab:false,...value});
const crate=():MovableBody=>({id:'review-crate',x:1,y:.62,z:0,hx:.5,hy:.6,hz:.5});
/** Inputs and simple collider fixtures only. Poses and contacts must come from physics.worker. */
export const ANIMATION_CLIPS:readonly AnimationClip[]=[
 {id:'run-brake',label:'Run → brake',watch:'Follow distance-driven foot plants, acceleration lean and the actual stop.',ticks:180,spawn:{x:0,z:-5},obstacles:[],movable:[],input:t=>command({z:t<120?.8:0})},
 {id:'wall-contact',label:'Run → wall → release',watch:'Compare desired and resolved travel. Hands should meet the worker-reported wall while the gait stops.',ticks:180,spawn:{x:0,z:0},obstacles:[{x:1,z:0,hx:.2,hy:3,hz:2}],movable:[],input:t=>command({x:t<135?1:0})},
 {id:'push-crate',label:'Grip → push crate → release',watch:'The crate and player move through actual sweeps. Inspect the hand anchors, stance and release.',ticks:180,spawn:{x:0,z:0},obstacles:[],movable:[crate()],input:t=>command({x:t<120?1:0,grab:t===0||t===120})},
 {id:'pull-crate',label:'Grip → push → pull → release',watch:'A real attached crate follows collision-tested backward travel. Compare the target and actual hand positions.',ticks:180,spawn:{x:0,z:0},obstacles:[],movable:[crate()],input:t=>command({x:t<60?1:t<120?-1:0,grab:t===0||t===120})},
 {id:'ledge-climb',label:'Jump → ledge catch → climb',watch:'Follow lead-palm brace, elbow pull, knee plant, trailing boot, weight transfer and the supported stand. Each phase uses real worker sweeps.',ticks:320,spawn:{x:0,z:0},obstacles:[{x:1.5,y:1.2,z:0,hx:.8,hy:1.2,hz:2}],movable:[],input:t=>command({x:t<30?.7:0,jump:t<30||t>=31&&t<80,grab:t<80})},
 {id:'walk-accelerate-turn-stop',label:'Walk → accelerate → turn → stop',watch:'Watch the pelvis transfer over the supporting foot as steps lengthen, the outside leg catch the turn, and the final plant accept the stop without sole drift.',ticks:240,spawn:{x:-2,z:-3},obstacles:[],movable:[],input:t=>command({z:t>=30&&t<120?Math.min(.36,(t-29)*.012):0,x:t>=120&&t<180?.36:0})},
 {id:'jump-land',label:'Walk → jump → land → settle',watch:'Follow the last supported push-off into flight, then the first touchdown, knee and hip compression, and the return of body weight over planted soles.',ticks:180,spawn:{x:0,z:-2},obstacles:[],movable:[],input:t=>command({z:t>=30&&t<120?.36:0,jump:t===60})},
 {id:'crouch-crawl-stand',label:'Crouch → crawl → stop → stand',watch:'Inspect how the body lowers over its supports, how hands and feet share the crawling load, and how the stopped body rises without dragging its contact points.',ticks:220,spawn:{x:0,z:-2},obstacles:[],movable:[],input:t=>command({crouch:t>=30&&t<160,z:t>=60&&t<145?.8:0})},
 {id:'run-slide-recover',label:'Run → slide → recover → stand',watch:'Track the running plant into the low slide, the slowing body over its low supports, and the recovery onto stable feet before standing.',ticks:220,spawn:{x:0,z:-5},obstacles:[],movable:[],input:t=>command({z:t>=15&&t<90?.8:0,crouch:t>=90&&t<150})},
];
export function animationClip(id:string){return ANIMATION_CLIPS.find(c=>c.id===id)??ANIMATION_CLIPS[0]!;}
export interface AnimationWorkerSnapshot {type:'snapshot';epoch:number;step:number;x:number;y:number;z:number;feetY:number;vx:number;vy:number;vz:number;grounded:boolean;crouched:boolean;stance:number;sliding:boolean;landing:number;landingSpeed:number;contact:PlayerContact;movable:MovableBody[]}
export interface AnimationReviewFrame{tick:number;seconds:number;input:ReviewInput;physics:AnimationWorkerSnapshot;animation:AnimationState}
export interface AnimationReviewRun{version:number;clip:AnimationClipId;label:string;stepSeconds:number;maximumTicks:number;startedAt:string;completedAt:string;rapierVersion:string;source:string;fixture:{spawn:{x:number;z:number};bound:number;obstacles:ReviewObstacle[];movable:MovableBody[]};frames:AnimationReviewFrame[];scope:string[]}
export function validAnimationSnapshot(value:unknown):value is AnimationWorkerSnapshot{
 if(!value||typeof value!=='object')return false;const s=value as AnimationWorkerSnapshot;
 return s.type==='snapshot'&&Number.isSafeInteger(s.epoch)&&Number.isSafeInteger(s.step)&&s.step>0&&[s.x,s.y,s.z,s.feetY,s.vx,s.vy,s.vz,s.stance,s.landing,s.landingSpeed].every(Number.isFinite)&&['grounded','crouched','sliding'].every(k=>typeof s[k as keyof AnimationWorkerSnapshot]==='boolean')&&validPlayerContact(s.contact)&&validMovableBodies(s.movable);
}
/** Production animation reducer, advanced exactly once for each real worker snapshot. */
export function animationReviewFrames(clip:AnimationClip,snapshots:readonly AnimationWorkerSnapshot[]):AnimationReviewFrame[]{
 let animation=idleAnimation(),previous={...clip.spawn};
 return snapshots.map((physics,index)=>{
  if(!validAnimationSnapshot(physics)||physics.step!==index+1)throw new Error('Animation review requires contiguous real physics ticks beginning at 1');
  const distance=Math.hypot(physics.x-previous.x,physics.z-previous.z);previous=physics;
  const previousAnimation=animation;animation=stepAnimation(animation,physics.vx,physics.vz,physics.grounded,physics.crouched,physics.sliding,ANIMATION_STEP_SECONDS,distance,physics.stance,physics.vy,landingForImpact(physics.landing,physics.landingSpeed));
  animation=contactAnimationPhase(previousAnimation,animation,physics.contact.mode,distance);
  // Contact facing is fixed by a real collision normal, including backward crate travel.
  if(physics.contact.mode!=='none'&&Math.hypot(physics.contact.normal.x,physics.contact.normal.z)>.5)animation={...animation,heading:physics.contact.mode==='wall'?stepFacing(animation.heading,-physics.contact.normal.x,-physics.contact.normal.z,ANIMATION_STEP_SECONDS,10):Math.atan2(-physics.contact.normal.x,-physics.contact.normal.z)};
  animation=stepGroundSupport(previousAnimation,animation,{x:physics.x,y:physics.feetY,z:physics.z},physics.contact.mode,ANIMATION_STEP_SECONDS);
  return {tick:physics.step,seconds:physics.step*ANIMATION_STEP_SECONDS,input:clip.input(index),physics:structuredClone(physics),animation:{...animation}};
 });
}
export function animationSampleTicks(count:number,limit=24){
 if(!Number.isSafeInteger(count)||count<1||count>ANIMATION_MAX_TICKS||!Number.isSafeInteger(limit)||limit<1||limit>36)throw new Error('Use a bounded clip and 1–36 sheet frames');
 const n=Math.min(count,limit);return Array.from({length:n},(_,i)=>n===1?1:1+Math.round(i*(count-1)/(n-1)));
}
export interface AnimationPlayback{tick:number;playing:boolean;remainder:number}
export function advanceAnimationPlayback(state:AnimationPlayback,elapsed:number,speed:number,repeat:boolean,lastTick:number):AnimationPlayback{
 if(!state.playing)return {...state};
 const amount=state.remainder+Math.max(0,Number.isFinite(elapsed)?elapsed:0)*60*Math.max(.1,Math.min(4,Number.isFinite(speed)?speed:1)),steps=Math.floor(amount+1e-9),next=state.tick+steps;
 return next>lastTick?repeat?{tick:1+(next-1)%lastTick,playing:true,remainder:amount-steps}:{tick:lastTick,playing:false,remainder:0}:{tick:next,playing:true,remainder:amount-steps};
}
export interface ReviewWorker {postMessage(message:unknown):void;terminate():void;onmessage:((event:{data:any})=>void)|null;onerror:((event:{message:string})=>void)|null}
/** One on-demand worker, one request in flight; replacement and disposal reject stale work. */
export function createAnimationReviewRunner(makeWorker:()=>ReviewWorker,now=()=>new Date().toISOString()){
 let worker:ReviewWorker|null=null,abort:((error:Error)=>void)|null=null,generation=0,disposed=false;
 function cancel(){generation++;const old=worker;worker=null;abort?.(new Error('Animation review cancelled'));abort=null;if(old){old.onmessage=null;old.onerror=null;old.terminate();}}
 async function load(clip:AnimationClip):Promise<AnimationReviewRun>{
  if(disposed)throw new Error('Animation review disposed');
  cancel();const token=generation,startedAt=now(),current=makeWorker();worker=current;
  const snapshots:AnimationWorkerSnapshot[]=[];let request=0,pending:{type:string;id:number|null;resolve:(m:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}|null=null;
  const fail=(error:Error)=>{if(pending){clearTimeout(pending.timer);pending.reject(error);pending=null;}};abort=fail;
  const exchange=(message:Record<string,unknown>,type:string,id:number|null=null)=>new Promise<any>((resolve,reject)=>{if(token!==generation){reject(new Error('Animation review cancelled'));return;}pending={type,id,resolve,reject,timer:setTimeout(()=>fail(new Error('Animation physics worker did not respond')),20_000)};current.postMessage(message);});
  current.onerror=e=>fail(new Error(e.message||'Animation physics worker failed'));
  current.onmessage=({data:m})=>{
   if(token!==generation)return;
   if(m.type==='error'){fail(new Error(m.message||'Animation physics failure'));return;}
   if(m.type==='snapshot'){
    if(!validAnimationSnapshot(m)||m.epoch!==0||m.step!==snapshots.length+1||snapshots.length>=clip.ticks){fail(new Error('Unexpected, duplicate or invalid animation physics snapshot'));return;}
    snapshots.push(structuredClone(m));
   }else if(pending&&m.type===pending.type&&(pending.id===null||m.requestId===pending.id)){
    const p=pending;pending=null;clearTimeout(p.timer);p.resolve(m);
   }
  };
  try{
   if(!Number.isSafeInteger(clip.ticks)||clip.ticks<1||clip.ticks>ANIMATION_MAX_TICKS)throw new Error('Animation clip exceeds its bounded inspection budget');
   const fixture={spawn:{...clip.spawn},bound:16,obstacles:structuredClone(clip.obstacles),movable:structuredClone(clip.movable)};
   const ready=await exchange({type:'init',epoch:0,...clip.spawn,bound:fixture.bound,obstacles:fixture.obstacles,movable:fixture.movable,manual:true,interactionEnabled:true,online:false},'ready');
   if(ready.epoch!==0||ready.step!==0||typeof ready.version!=='string')throw new Error('Animation worker did not initialize an exact manual clock');
   for(let tick=0;tick<clip.ticks;){
    const input=clip.input(tick),key=JSON.stringify(input);let ticks=1;
    while(ticks<120&&tick+ticks<clip.ticks&&JSON.stringify(clip.input(tick+ticks))===key)ticks++;
    current.postMessage({type:'input',epoch:0,...input});const ack=await exchange({type:'step',epoch:0,ticks,requestId:++request},'stepped',request);tick+=ticks;
    if(ack.epoch!==0||ack.step!==tick||snapshots.length!==tick)throw new Error('Animation worker did not acknowledge the exact requested tick');
   }
   return {version:ANIMATION_REVIEW_VERSION,clip:clip.id,label:clip.label,stepSeconds:ANIMATION_STEP_SECONDS,maximumTicks:clip.ticks,startedAt,completedAt:now(),rapierVersion:String(ready.version??'not-recorded'),source:'Actual physics.worker.ts manual clock + Rapier collision snapshots + production stepAnimation and createAvatar',fixture,frames:animationReviewFrames(clip,snapshots),scope:['Tiny flat inspection world; no campaign or generated valley boot','Real worker/Rapier snapshots, not authored contact poses','Fixed 60 Hz animation sampling; gameplay render interpolation is not sampled','No pixels reviewed, live network test or device/full-world performance claim']};
  }finally{if(pending)clearTimeout((pending as {timer:ReturnType<typeof setTimeout>}).timer);if(worker===current){worker=null;abort=null;current.onmessage=null;current.onerror=null;current.terminate();}}
 }
 return {load,cancel,dispose(){disposed=true;cancel();},get active(){return worker!==null;}};
}
