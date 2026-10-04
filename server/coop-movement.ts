import type {CombatObstacle} from '../src/combat.ts';
export const COOP_BODY=Object.freeze({radius:.32,standingHeight:2.16,crouchingHeight:1.06});
export interface Feet {x:number;y:number;z:number}
const EPS=1e-5;
/** A capsule's support along an outward hull normal, expressed from its feet. */
function capsulePadding(n:{x:number;y:number;z:number},height:number){
  const radius=COOP_BODY.radius;
  return radius*Math.hypot(n.x,n.y,n.z)-n.y*(n.y>=0?radius:height-radius);
}
/** Axial support planes also bound the capsule-expanded hull at sharp extrema. */
function actorPlanes(o:CombatObstacle){return [...o.convexPlanes!,{x:1,y:0,z:0,d:o.hx},{x:-1,y:0,z:0,d:o.hx},{x:0,y:0,z:1,d:o.hz},{x:0,y:0,z:-1,d:o.hz},{x:0,y:1,z:0,d:o.hy!},{x:0,y:-1,z:0,d:o.hy!}];}
/** Convex rocks retain their sloping faces; their bounding boxes only cull work. */
export function convexFeetInterval(x:number,z:number,o:CombatObstacle,crouched=false):{bottom:number;top:number}|null{
  if(!o.convexPlanes?.length)return null;
  const height=crouched?COOP_BODY.crouchingHeight:COOP_BODY.standingHeight;
  let bottom=-Infinity,top=Infinity;
  for(const n of actorPlanes(o)){
    const edge=n.d+capsulePadding(n,height)-n.x*(x-o.x)-n.z*(z-o.z);
    if(Math.abs(n.y)<1e-10){if(edge<=EPS)return null;continue;}
    const y=(o.y??0)+edge/n.y;
    if(n.y>0)top=Math.min(top,y);else bottom=Math.max(bottom,y);
    if(bottom>=top-EPS)return null;
  }
  return {bottom,top};
}
function convexActorIntersects(from:Feet,to:Feet,o:CombatObstacle,height:number){
  let enter=0,exit=1;
  for(const n of actorPlanes(o)){
    const limit=n.d+capsulePadding(n,height)-EPS;
    const start=n.x*(from.x-o.x)+n.y*(from.y-(o.y??0))+n.z*(from.z-o.z);
    const delta=n.x*(to.x-from.x)+n.y*(to.y-from.y)+n.z*(to.z-from.z);
    if(Math.abs(delta)<1e-12){if(start>limit)return false;}
    else{const t=(limit-start)/delta;if(delta>0)exit=Math.min(exit,t);else enter=Math.max(enter,t);}
    if(enter>exit)return false;
  }
  return enter<=exit;
}
/** Conservative swept actor volume, not an eye-height ray. Floors touching feet are support. */
export function actorPathClear(from:Feet,to:Feet,obstacles:readonly CombatObstacle[],crouched:boolean):boolean{
  const height=crouched?COOP_BODY.crouchingHeight:COOP_BODY.standingHeight,radius=COOP_BODY.radius,epsilon=1e-5;
  if(![from.x,from.y,from.z,to.x,to.y,to.z].every(Number.isFinite))return false;
  for(const o of obstacles){
    if(Math.max(from.x,to.x)+radius<o.x-o.hx||Math.min(from.x,to.x)-radius>o.x+o.hx||Math.max(from.z,to.z)+radius<o.z-o.hz||Math.min(from.z,to.z)-radius>o.z+o.hz)continue;
    if(o.convexPlanes?.length){if(convexActorIntersects(from,to,o,height))return false;continue;}
    const bottom=o.hy===undefined?-10000:(o.y??o.hy)-o.hy,top=o.hy===undefined?10000:(o.y??o.hy)+o.hy;
    // Minkowski-expand the solid by the entire standing/crouched actor envelope.
    const lo={x:o.x-o.hx-radius+epsilon,y:bottom-height+epsilon,z:o.z-o.hz-radius+epsilon};
    const hi={x:o.x+o.hx+radius-epsilon,y:top-epsilon,z:o.z+o.hz+radius-epsilon};
    let enter=0,exit=1;
    for(const axis of ['x','y','z'] as const){
      const delta=to[axis]-from[axis];
      if(Math.abs(delta)<1e-12){if(from[axis]<lo[axis]||from[axis]>hi[axis]){enter=2;break;}}
      else{const a=(lo[axis]-from[axis])/delta,b=(hi[axis]-from[axis])/delta;enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));}
      if(enter>exit)break;
    }
    if(enter<=exit)return false;
  }
  return true;
}
