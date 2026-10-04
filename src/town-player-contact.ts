/** Moving town residents are kinematic obstacles for the explorer. The physics
 * worker owns this response; accepted NPC roots are never altered here. */
import {slideTownCrowd,TOWN_BODY_RADIUS} from './town-crowd.ts';
interface Point {x:number;z:number}
interface TownObstacle extends Point {facing?:number}
export const TOWN_PLAYER_CONTACT=Object.freeze({radius:.32,skin:.035,recoverySpeed:6,maxRecoveryStep:.12,passes:4});
/** Resolve an already-entering disc before the normal player sweep. A displayed
 * resident may move onto a stationary explorer between input packets. Merely
 * refusing further inward player input cannot repair that overlap. Candidate
 * corrections monotonically reduce penetration and never cross another disc. */
export function townPlayerContactRecovery(from:Point,poses:readonly TownObstacle[],feetY:number,dt:number):Point {
 if(feetY>7.8||feetY<4.1||!Number.isFinite(dt)||dt<=0)return {...from};
 const gap=TOWN_PLAYER_CONTACT.radius+TOWN_BODY_RADIUS+TOWN_PLAYER_CONTACT.skin;
 const local=poses.filter(q=>Number.isFinite(q.x)&&Number.isFinite(q.z)&&Math.hypot(q.x-from.x,q.z-from.z)<gap+1).slice(0,32);
 const overlap=local.filter(q=>Math.hypot(q.x-from.x,q.z-from.z)<gap-1e-7);if(!overlap.length)return {...from};
 const penetration=(p:Point)=>local.reduce((sum,q)=>sum+Math.max(0,gap-Math.hypot(q.x-p.x,q.z-p.z))**2,0);
 let p={...from},budget=Math.min(TOWN_PLAYER_CONTACT.maxRecoveryStep,TOWN_PLAYER_CONTACT.recoverySpeed*dt);
 for(let pass=0;pass<TOWN_PLAYER_CONTACT.passes&&budget>1e-8;pass++){
  let nx=0,nz=0,depth=0;for(const q of local){const dx=p.x-q.x,dz=p.z-q.z,d=Math.hypot(dx,dz),inside=gap-d;if(inside<=1e-7)continue;const angle=q.facing??0;nx+=(d>1e-7?dx/d:Math.sin(angle))*inside;nz+=(d>1e-7?dz/d:Math.cos(angle))*inside;depth=Math.max(depth,inside);}
  if(depth<=1e-7)break;const base=Math.atan2(nx,nz),amount=Math.min(budget,depth+.0001),before=penetration(p);let best:Point|undefined,bestCost=before;
  for(const offset of [0,.35,-.35,.7,-.7,1.1,-1.1,1.57,-1.57,2.1,-2.1,Math.PI]){
   const a=base+offset,q={x:p.x+Math.sin(a)*amount,z:p.z+Math.cos(a)*amount};
   // Existing overlaps may only become shallower. Uninvolved residents retain
   // the same swept-disc exclusion as ordinary player movement.
   if(local.some(o=>{const d=Math.hypot(p.x-o.x,p.z-o.z);return d<gap-1e-7&&Math.hypot(q.x-o.x,q.z-o.z)<d-1e-7;}))continue;
   const swept=slideTownCrowd(p,q,local.filter(o=>Math.hypot(p.x-o.x,p.z-o.z)>=gap-1e-7),feetY,TOWN_PLAYER_CONTACT.radius),cost=penetration(swept);
   if(local.some(o=>{const d=Math.hypot(p.x-o.x,p.z-o.z);return d<gap-1e-7&&Math.hypot(swept.x-o.x,swept.z-o.z)<d-1e-7;}))continue;
   if(cost<bestCost-1e-12){best=swept;bestCost=cost;}
  }
  if(!best)break;const moved=Math.hypot(best.x-p.x,best.z-p.z);p=best;budget-=moved;
 }
 return p;
}
