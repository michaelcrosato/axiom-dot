import type {CombatObstacle} from '../src/combat.ts';
import type {CoopMotion} from '../src/coop-protocol.ts';
import {actorPathClear,convexFeetInterval,COOP_BODY,type Feet} from './coop-movement.ts';

/** Pinned campaign physics values; client lab tuning never reaches this authority. */
export const COOP_VERTICAL=Object.freeze({step:1/60,gravity:18,jumpSpeed:6.6,terminalSpeed:30,coyoteTime:.1,bufferTime:.12});
export interface VerticalState extends Omit<CoopMotion,'jumpQueued'> {coyote:number;buffer:number}
export interface MotionGeometry {obstacles:readonly CombatObstacle[];height:(x:number,z:number)=>number}
const EPS=1e-5;
export function createVertical(feetY:number,crouched=false):VerticalState{return {feetY,vy:0,grounded:true,crouched,jumpId:0,landingId:0,coyote:COOP_VERTICAL.coyoteTime,buffer:0,lastJumpIntent:null,jumpStatus:null};}
export function publicMotion(m:VerticalState):CoopMotion{return {feetY:m.feetY,vy:m.vy,grounded:m.grounded,crouched:m.crouched,jumpId:m.jumpId,landingId:m.landingId,jumpQueued:m.buffer>0,lastJumpIntent:m.lastJumpIntent,jumpStatus:m.jumpStatus};}
export function validVertical(v:unknown):v is VerticalState{
  if(!v||typeof v!=='object')return false;const m=v as VerticalState;
  return [m.feetY,m.vy,m.coyote,m.buffer].every(Number.isFinite)&&Math.abs(m.feetY)<2000&&Math.abs(m.vy)<=COOP_VERTICAL.terminalSpeed&&m.coyote>=0&&m.coyote<=COOP_VERTICAL.coyoteTime+EPS&&m.buffer>=0&&m.buffer<=COOP_VERTICAL.bufferTime+EPS&&typeof m.grounded==='boolean'&&typeof m.crouched==='boolean'&&(!m.grounded||m.vy===0)&&Number.isSafeInteger(m.jumpId)&&m.jumpId>=0&&Number.isSafeInteger(m.landingId)&&m.landingId>=0&&(m.lastJumpIntent===null||typeof m.lastJumpIntent==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(m.lastJumpIntent))&&[null,'launched','queued','rejected'].includes(m.jumpStatus);
}
function overlapsXZ(x:number,z:number,o:CombatObstacle){return Math.hypot(Math.max(0,Math.abs(x-o.x)-o.hx),Math.max(0,Math.abs(z-o.z)-o.hz))<COOP_BODY.radius-EPS;}
/** Highest actual supporting surface at or below the actor's feet. */
export function supportBelow(x:number,z:number,feetY:number,g:MotionGeometry){
  let support=g.height(x,z);
  for(const o of g.obstacles){if(o.hy===undefined||!overlapsXZ(x,z,o))continue;const interval=o.convexPlanes?.length?convexFeetInterval(x,z,o):null;if(o.convexPlanes?.length&&!interval)continue;const top=interval?.top??((o.y??o.hy)+o.hy);if(top<=feetY+EPS&&top>support)support=top;}
  return support;
}
function launch(m:VerticalState){m.vy=COOP_VERTICAL.jumpSpeed;m.grounded=false;m.coyote=0;m.buffer=0;m.jumpId++;m.jumpStatus='launched';}
/** A reliable edge supplies intent, never a caller-selected height or impulse. */
export function requestJump(m:VerticalState,intentId:string){m.lastJumpIntent=intentId;m.jumpStatus='queued';m.buffer=COOP_VERTICAL.bufferTime;if(m.grounded||m.coyote>0)launch(m);}
export function setCrouch(m:VerticalState,x:number,z:number,wanted:boolean,g:MotionGeometry){
  const feet={x,y:m.feetY,z};m.crouched=wanted||!actorPathClear(feet,feet,g.obstacles,false);
}
/** One pinned 60 Hz vertical step with ground, raised-platform and ceiling contacts. */
export function stepVertical(m:VerticalState,x:number,z:number,g:MotionGeometry){
  const dt=COOP_VERTICAL.step,wasGrounded=m.grounded,support=supportBelow(x,z,m.feetY,g);
  if(m.grounded&&m.feetY>support+.015)m.grounded=false;
  if(m.grounded){m.feetY=support;m.coyote=COOP_VERTICAL.coyoteTime;}else m.coyote=Math.max(0,m.coyote-dt);
  if(m.buffer>0&&(m.grounded||m.coyote>0))launch(m);
  m.buffer=Math.max(0,m.buffer-dt);
  if(m.buffer===0&&m.jumpStatus==='queued')m.jumpStatus='rejected';
  if(m.grounded){m.vy=0;return;}
  m.vy=Math.max(-COOP_VERTICAL.terminalSpeed,m.vy-COOP_VERTICAL.gravity*dt);
  const height=m.crouched?COOP_BODY.crouchingHeight:COOP_BODY.standingHeight;
  let next=m.feetY+m.vy*dt;
  if(m.vy>0){
    let ceiling=Infinity;
    for(const o of g.obstacles){if(o.hy===undefined||!overlapsXZ(x,z,o))continue;const interval=o.convexPlanes?.length?convexFeetInterval(x,z,o,m.crouched):null;if(o.convexPlanes?.length&&!interval)continue;const stop=interval?.bottom??((o.y??o.hy)-o.hy-height);if(stop>=m.feetY-EPS)ceiling=Math.min(ceiling,stop);}
    if(next>ceiling){next=Math.max(m.feetY,ceiling);m.vy=0;}
  }else{
    const floor=supportBelow(x,z,m.feetY,g);
    if(next<=floor+EPS){next=floor;m.vy=0;m.grounded=true;m.coyote=COOP_VERTICAL.coyoteTime;if(!wasGrounded)m.landingId++;}
  }
  m.feetY=next;
}
/** Horizontal motion is checked at the server's current vertical trajectory. */
export function moveVertical(m:VerticalState,from:{x:number;z:number},to:{x:number;z:number},g:MotionGeometry):boolean{
  const distance=Math.hypot(to.x-from.x,to.z-from.z),count=Math.max(1,Math.min(64,Math.ceil(distance/.2))),trial={...m};
  const minX=Math.min(from.x,to.x)-COOP_BODY.radius,maxX=Math.max(from.x,to.x)+COOP_BODY.radius,minZ=Math.min(from.z,to.z)-COOP_BODY.radius,maxZ=Math.max(from.z,to.z)+COOP_BODY.radius;
  const nearby={...g,obstacles:g.obstacles.filter(o=>o.x+o.hx>=minX&&o.x-o.hx<=maxX&&o.z+o.hz>=minZ&&o.z-o.hz<=maxZ)};
  let previous={...from};
  for(let i=1;i<=count;i++){
    const next={x:from.x+(to.x-from.x)*i/count,z:from.z+(to.z-from.z)*i/count},start:Feet={...previous,y:trial.feetY};let y=trial.feetY;
    const ground=g.height(next.x,next.z);
    if(trial.grounded){
      if(ground-trial.feetY>distance/count+.02)return false; // 45-degree terrain climb limit.
      const support=supportBelow(next.x,next.z,trial.feetY+.35,nearby),rise=support-trial.feetY;
      if(rise>.35+EPS)return false;
      if(rise>=-.3)y=support;
    }else if(ground>y+EPS)return false;
    const finish={...next,y};
    if(!actorPathClear(start,finish,nearby.obstacles,trial.crouched)){
      // A grounded .35m auto-step still needs full overhead and forward body clearance.
      const raised={...start,y};if(!trial.grounded||y<=start.y||y-start.y>.35||!actorPathClear(start,raised,nearby.obstacles,trial.crouched)||!actorPathClear(raised,finish,nearby.obstacles,trial.crouched))return false;
    }
    trial.feetY=y;const support=supportBelow(next.x,next.z,y,nearby);
    if(y>support+.015)trial.grounded=false;else if(trial.vy<=0){trial.feetY=support;trial.grounded=true;trial.vy=0;}
    previous=next;
  }
  Object.assign(m,trial);
  return true;
}
