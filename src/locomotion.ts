import {DEFAULT_TUNING,type LabTuning} from './tuning.ts';
/** Continuous thumb travel, metres/second. Zones describe gait; they never toggle speed. */
export const SPEED_POINTS = [[0,0],[.16,.65],[.36,2],[.58,4],[.8,6],[1,8]] as const;
export function analogSpeed(strength:number){
 const m=Math.max(0,Math.min(1,Number.isFinite(strength)?strength:0));
 for(let i=1;i<SPEED_POINTS.length;i++){const a=SPEED_POINTS[i-1]!,b=SPEED_POINTS[i]!;if(m<=b[0])return a[1]+(b[1]-a[1])*(m-a[0])/(b[0]-a[0]);}return 8;
}
export function movementInput(kx:number,kz:number,tx:number,tz:number,orbit:number,shift=false){
 // A digital direction is a normal run (5 m/s), with Shift reaching the analog maximum.
 const kn=Math.hypot(kx,kz),strength=shift?1:.69;
 let x=(kn?kx/kn*strength:0)+tx,z=(kn?kz/kn*strength:0)+tz;
 const cap=Math.max(1,Math.hypot(x,z));x/=cap;z/=cap;
 return {x:x*Math.cos(orbit)+z*Math.sin(orbit),z:-x*Math.sin(orbit)+z*Math.cos(orbit)};
}
export interface MotionInput{x:number;z:number;analog:boolean;sprint:boolean;crouch:boolean;jump?:boolean;paused:boolean}
export interface Motor {vx:number;vz:number;slide:number;wasCrouched:boolean}
export const idleMotor=():Motor=>({vx:0,vz:0,slide:0,wasCrouched:false});
export function stepMotor(m:Motor,input:MotionInput,dt:number,grounded=true,tuning:LabTuning=DEFAULT_TUNING):Motor{
 dt=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
 if(input.paused)return idleMotor();
 const n=Math.hypot(input.x,input.z),strength=Math.min(1,n),speed=Math.hypot(m.vx,m.vz);
 let slide=input.crouch&&grounded?m.slide:0;
 if(grounded&&input.crouch&&!m.wasCrouched&&speed>=5.4)slide=tuning.slideDuration;
 if(slide>0){const nextSpeed=Math.max(0,speed-tuning.slideFriction*dt);return {vx:speed?m.vx/speed*nextSpeed:0,vz:speed?m.vz/speed*nextSpeed:0,slide:Math.max(0,slide-dt),wasCrouched:input.crouch};}
 const targetSpeed=input.crouch?strength*1.45:(input.analog?analogSpeed(strength):strength*(input.sprint?8:5))*tuning.speedScale;
 const tx=n?input.x/n*targetSpeed:0,tz=n?input.z/n*targetSpeed:0;
 const dx=tx-m.vx,dz=tz-m.vz,d=Math.hypot(dx,dz),reversing=m.vx*tx+m.vz*tz<0;
 const accel=(reversing?tuning.reversal:targetSpeed<speed?tuning.braking:tuning.acceleration)*(grounded?1:tuning.airControl),blend=d?Math.min(1,accel*dt/d):0;
 return {vx:m.vx+dx*blend,vz:m.vz+dz*blend,slide:0,wasCrouched:input.crouch};
}
export function strideFor(speed:number,crouch:number){
 const velocity=Math.max(0,speed),walk=Math.min(1,velocity/2.5),stance=Math.max(0,Math.min(1,crouch));
 const upright=.24+.56*walk*walk*(3-2*walk),crawl=.32+.10*Math.min(1,velocity/1.45);
 return (upright+(crawl-upright)*stance)*Math.min(1,velocity/.45);
}
/** Fraction of one leg cycle spent supporting the body: walking has double
 * support; running has a real recovery/flight interval instead of rapid shuffles. */
export function supportDutyFor(speed:number,crouch:number){
 const v=Math.max(0,Number.isFinite(speed)?speed:0),stance=Math.max(0,Math.min(1,Number.isFinite(crouch)?crouch:0));
 const upright=v<=2?.6:v<=4?.6-(v-2)*.1:v<=6?.4-(v-4)*.05:.3-Math.min(2,v-6)*.025;
 return upright+(.6-upright)*stance;
}
/** Presentation only: actual impact speed scales the existing contact envelope. */
export function landingForImpact(envelope:number,impactSpeed:number){
 const weight=Math.max(0,Math.min(1,Number.isFinite(envelope)?envelope:0)),speed=Number.isFinite(impactSpeed)?impactSpeed:0;
 return weight*Math.max(.2,Math.min(1,speed/6.3));
}
export type Gait='idle'|'tiptoe'|'walk'|'jog'|'run'|'sprint'|'crawl'|'slide';
export function gaitFor(speed:number,crouched=false,sliding=false):Gait{return sliding?'slide':crouched?'crawl':speed<.08?'idle':speed<1.15?'tiptoe':speed<3?'walk':speed<4.8?'jog':speed<6.8?'run':'sprint';}
export interface GroundPoint{x:number;y:number;z:number}
export interface GroundLimbSupport{target:GroundPoint;anchor:GroundPoint|null;heading:number;planted:boolean;release:GroundPoint|null;releaseHeading:number;recovery:number}
export interface GroundSupportState{position:GroundPoint;heading:number;leftFoot:GroundLimbSupport;rightFoot:GroundLimbSupport;leftHand:GroundLimbSupport|null;rightHand:GroundLimbSupport|null}
export interface AnimationState{speed:number;phase:number;heading:number;lean:number;turn:number;crouch:number;slide:number;travel:number;gait:Gait;airborne:boolean;vertical:number;landing:number;takeoff:number;brake:number;support:GroundSupportState|null}
export const idleAnimation=():AnimationState=>({speed:0,phase:0,heading:0,lean:0,turn:0,crouch:0,slide:0,travel:0,gait:'idle',airborne:false,vertical:0,landing:0,takeoff:0,brake:0,support:null});
export function angleDelta(a:number,b:number){return Math.atan2(Math.sin(b-a),Math.cos(b-a));}
export function stepAnimation(a:AnimationState,vx:number,vz:number,grounded:boolean,crouched:boolean,sliding:boolean,dt:number,distance:number,physicalStance?:number,verticalVelocity=0,landing=0,tuning:LabTuning=DEFAULT_TUNING):AnimationState{
 dt=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
 distance=Math.max(0,Number.isFinite(distance)?distance:0);
 // Horizontal momentum survives flight. Zeroing it manufactured a braking impulse
 // at takeoff and another acceleration impulse on touchdown. Only support changes.
 const actualSpeed=Math.hypot(vx,vz),speed=grounded?actualSpeed:0,blend=1-Math.exp(-dt*14),smooth=a.speed+(actualSpeed-a.speed)*blend;
 const delta=actualSpeed>.08?angleDelta(a.heading,Math.atan2(vx,vz)):0,turnStep=Math.max(-dt*tuning.turnRate,Math.min(dt*tuning.turnRate,delta));
 const nextCrouch=physicalStance===undefined?a.crouch+((crouched?1:0)-a.crouch)*blend:Math.max(0,Math.min(1,physicalStance)),stride=strideFor(smooth,nextCrouch);
 // Distance, not a wall-clock oscillator, advances foot contact. Collisions stop the gait.
 const phase=(a.phase+(grounded&&!sliding?Math.min(distance,.6)*supportDutyFor(smooth,nextCrouch)/Math.max(1e-6,stride):0))%1;
 const acceleration=grounded&&!a.airborne?(smooth-a.speed)/Math.max(dt,.001):0,leanTarget=Math.max(-.18,Math.min(.28,acceleration*.014+smooth*.015));
 const takeoff=!grounded&&!a.airborne&&verticalVelocity>.1?1:Math.max(0,a.takeoff-dt*7);
 return {support:null,takeoff,brake:a.brake+(Math.max(0,Math.min(1,-acceleration/18))-a.brake)*blend,speed:smooth,phase,heading:a.heading+turnStep,lean:a.lean+(leanTarget-a.lean)*blend,turn:a.turn+(Math.max(-.13,Math.min(.13,-turnStep/Math.max(dt,.001)*.014))-a.turn)*blend,crouch:nextCrouch,slide:a.slide+((sliding?1:0)-a.slide)*blend,travel:a.travel+distance,gait:gaitFor(speed,crouched,sliding),airborne:!grounded,vertical:Number.isFinite(verticalVelocity)?verticalVelocity:0,landing:grounded?Math.max(0,Math.min(1,landing)):0};
}
/** Local foot trajectory: flat support interval, eased airborne recovery. */
export function footContact(phase:number,stride:number,lift:number,duty=.6){
 duty=Math.max(.2,Math.min(.8,Number.isFinite(duty)?duty:.6));
 const p=((phase%1)+1)%1;if(p<duty)return {z:stride*(.5-p/duty),y:0,planted:true};
 const t=(p-duty)/(1-duty),smooth=(x:number)=>x*x*x*(10+x*(-15+6*x)),e=smooth(t);
 // Brief toe-off/heel-settle corrections match support speed and acceleration
 // without extending the backward push over the entire (longer) running swing.
 const roll=(x:number)=>x<.14?x*(1-smooth(x/.14)):0,ratio=(1-duty)/duty;
 return {z:stride*(-.5+e-ratio*roll(t)+ratio*roll(1-t)),y:Math.sin(Math.PI*t)**2*lift,planted:false};
}

/** Fixed-step gameplay facing; render cadence cannot authorize attack direction. */
export function stepFacing(heading:number,vx:number,vz:number,dt:number,turnRate=10){if(Math.hypot(vx,vz)<.08)return heading;const delta=angleDelta(heading,Math.atan2(vx,vz)),limit=Math.max(0,dt)*turnRate;return heading+Math.max(-limit,Math.min(limit,delta));}

/** A gripped backward step keeps its facing but reverses foot travel instead of skating. */
export function contactAnimationPhase(previous:AnimationState,next:AnimationState,mode:string,distance:number):AnimationState{
 if((mode!=='pull'&&mode!=='push'&&mode!=='wall')||next.airborne||next.slide>.01)return next;
 const travel=Math.max(0,Math.min(.6,Number.isFinite(distance)?distance:0)),stride=Math.min(.4,strideFor(next.speed,next.crouch));
 const phase=((previous.phase+(mode==='pull'?-1:1)*travel*.6/Math.max(1e-6,stride))%1+1)%1;
 return {...next,phase};
}


const groundToWorld=(point:GroundPoint,position:GroundPoint,heading:number):GroundPoint=>({x:position.x+point.x*Math.cos(heading)+point.z*Math.sin(heading),y:position.y+point.y,z:position.z-point.x*Math.sin(heading)+point.z*Math.cos(heading)});
const groundToLocal=(point:GroundPoint,position:GroundPoint,heading:number):GroundPoint=>{const x=point.x-position.x,z=point.z-position.z;return {x:x*Math.cos(heading)-z*Math.sin(heading),y:point.y-position.y,z:x*Math.sin(heading)+z*Math.cos(heading)};};
/**
 * Serialized visual contact state, reduced after the final presentation heading.
 * Targets are root-local ankle/palm positions, anchors and yaw are world-space.
 * A planted limb does not get rebuilt from a changing stride, stance or heading.
 * This never translates the motor/root, authorizes gameplay, or probes terrain.
 */
export function stepGroundSupport(previous:AnimationState,next:AnimationState,position:GroundPoint,mode='none',dt=1/60):AnimationState{
 dt=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
 // The approved mantle owns its root path. Do not retain its presentation
 // displacement as walking momentum after the planted standing finish.
 if(mode==='climb')return {...next,support:null,speed:0,phase:0,brake:0,lean:0,turn:0,takeoff:0,landing:0};
 if(next.airborne||next.slide>.01||mode==='slide'||mode==='hang'||mode==='climb'||![position.x,position.y,position.z,next.heading].every(Number.isFinite))return {...next,support:null};
 const old=previous.support,continuous=!!old&&Math.hypot(position.x-old.position.x,position.z-old.position.z)<=.75&&Math.abs(position.y-old.position.y)<=.3;
 const prior=continuous?old:null,move=Math.min(1,Math.max(0,next.speed)/.45),run=Math.min(1,Math.max(0,(next.speed-2)/6));
 const effort=mode==='push'||mode==='pull'||mode==='wall',duty=effort?.6:supportDutyFor(next.speed,next.crouch),stride=Math.min(effort?.4:Infinity,strideFor(next.speed,next.crouch)),lift=(.055+run*.16)*(1-next.crouch*.45),backward=mode==='pull';
 const limb=(phase:number,x:number,height:number,zOffset:number,clearance:number,reach:number,neutralZ:number,oldLimb:GroundLimbSupport|null|undefined):GroundLimbSupport=>{
  const foot=footContact(phase,stride,clearance,duty),nominal={x,y:height+foot.y*move,z:foot.z+zOffset},world=groundToWorld(nominal,position,next.heading);
  const lastAnchor=oldLimb?.planted&&oldLimb.anchor?groundToLocal(oldLimb.anchor,position,next.heading):null;
  const overreach=!!lastAnchor&&(Math.hypot(lastAnchor.x-x,lastAnchor.z-neutralZ)>reach||Math.abs(angleDelta(oldLimb!.heading,next.heading))>Math.PI/3||effort&&lastAnchor.z>.10);
  const recovery=overreach?Math.max(0,1-dt/.16):Math.max(0,(oldLimb?.recovery??0)-dt/.16);
  const planted=(foot.planted||move<.015)&&!overreach&&recovery===0;
  if(planted){
   const anchor=oldLimb?.planted&&oldLimb.anchor?{...oldLimb.anchor}:world;
   return {target:groundToLocal(anchor,position,next.heading),anchor,heading:oldLimb?.planted?oldLimb.heading:next.heading,planted:true,release:null,releaseHeading:next.heading,recovery:0};
  }
  // Preserve the last plant at release, then recover toward the upcoming plant.
  // A reach/twist limit visibly releases support before relocating the limb;
  // an unreachable anchor is never dragged along while labeled as planted.
  const p=((phase%1)+1)%1,t=recovery>0?1-recovery:Math.max(0,Math.min(1,backward?(1-p)/(1-duty):(p-duty)/(1-duty))),ease=t*t*(3-2*t);
  const finishedRecovery=(oldLimb?.recovery??0)>0&&recovery===0;
  const release=finishedRecovery?null:oldLimb?.planted&&oldLimb.anchor?{x:oldLimb.anchor.x-world.x,y:oldLimb.anchor.y-(position.y+height),z:oldLimb.anchor.z-world.z}:oldLimb?.release??null;
  const releaseHeading=oldLimb?.planted?oldLimb.heading:oldLimb?.releaseHeading??next.heading;
  const target=release?groundToLocal({x:world.x+release.x*(1-ease),y:world.y+release.y*(1-ease),z:world.z+release.z*(1-ease)},position,next.heading):{...nominal};
  if(recovery>0||overreach){
   target.y=Math.max(target.y,height+Math.sin(Math.PI*t)**2*Math.max(.055,clearance));
  }
  // Swing is free to recover within reach; never ask IK to stretch a rigid leg.
  const dx=target.x-x,dz=target.z-neutralZ,r=Math.hypot(dx,dz);if(r>reach){target.x=x+dx*reach/r;target.z=neutralZ+dz*reach/r;}
  if(effort)target.z=Math.min(.10,target.z);
  return {target,anchor:null,heading:releaseHeading+angleDelta(releaseHeading,next.heading)*ease,planted:false,release,releaseHeading,recovery};
 };
 const offset=effort?-.14:next.crouch*.16+next.brake*.1*(1-next.crouch),hands=next.crouch>=.95;
 return {...next,support:{position:{...position},heading:next.heading,
  leftFoot:limb(next.phase,-.19,.09,offset,lift,.40+next.crouch*.2,0,prior?.leftFoot),rightFoot:limb(next.phase+.5,.19,.09,offset,lift,.40+next.crouch*.2,0,prior?.rightFoot),
  leftHand:hands?limb(next.phase+.5,-.43,.08,.47,.055,.34,.47,prior?.leftHand):null,rightHand:hands?limb(next.phase,.43,.08,.47,.055,.34,.47,prior?.rightHand):null}};
}

/** Presentation footfalls follow actual support acquisition, never a second cadence clock. */
export function groundStepContacts(previous:AnimationState,next:AnimationState){
 if(!previous.support||!next.support||next.airborne||next.slide>.01)return 0;
 return Number(next.support.leftFoot.planted&&!previous.support.leftFoot.planted)+Number(next.support.rightFoot.planted&&!previous.support.rightFoot.planted);
}
