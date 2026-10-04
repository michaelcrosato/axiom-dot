/** Transport boundary for current authoritative life poses. No model imports, clocks or histories. */
import {TOWN_CENTER,TOWN_BOUNDS} from './starting-town.ts';
import {TOWN_RESIDENT_COUNT,type TownResidentPose} from './town-residents.ts';
const POSE_FIELDS=new Set(['x','z','facing','activity','moving','speed','distance','authoritativeMotion','contactResolved','motionPath']);
const ACTIVITIES=new Set<TownResidentPose['activity']>(['at home','walking to work','working','walking to the square','meeting neighbors','walking home','keeping shop','eating','resting','washing','relaxing','gardening','drawing water','cooking','crafting','repairing','receiving care']);
const bounded=(value:unknown,min:number,max:number):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
/** Exactly one bounded record for each roster index. Absence is handled by the caller for legacy packets. */
export function validTownLifePoses(value:unknown):value is readonly TownResidentPose[]{
 return Array.isArray(value)&&value.length===TOWN_RESIDENT_COUNT&&Object.keys(value).length===TOWN_RESIDENT_COUNT&&Array.from(value).every(p=>{
  if(!p||typeof p!=='object'||Array.isArray(p)||![Object.prototype,null].includes(Object.getPrototypeOf(p))||Object.keys(p).some(k=>!POSE_FIELDS.has(k)))return false;
  return bounded(p.x,TOWN_CENTER.x-TOWN_BOUNDS.halfWidth,TOWN_CENTER.x+TOWN_BOUNDS.halfWidth)
   &&bounded(p.z,TOWN_CENTER.z-TOWN_BOUNDS.halfDepth,TOWN_CENTER.z+TOWN_BOUNDS.halfDepth)
   &&bounded(p.facing,-Math.PI*2,Math.PI*2)&&ACTIVITIES.has(p.activity)&&typeof p.moving==='boolean'
   &&(p.speed===undefined||bounded(p.speed,0,10))&&(p.distance===undefined||bounded(p.distance,0,1_000_000_000))
   &&(p.authoritativeMotion===undefined||p.authoritativeMotion===1)&&p.authoritativeMotion===value[0]?.authoritativeMotion
   &&(p.contactResolved===undefined||p.authoritativeMotion===1&&typeof p.contactResolved==='boolean')
   &&(p.motionPath===undefined||p.authoritativeMotion===1&&Array.isArray(p.motionPath)&&p.motionPath.length>=2&&p.motionPath.length<=11&&Object.keys(p.motionPath).length===p.motionPath.length&&p.motionPath.every((q:unknown,i:number)=>{
    if(!q||typeof q!=='object'||Array.isArray(q)||![Object.prototype,null].includes(Object.getPrototypeOf(q))||Object.keys(q).length!==3||!Object.keys(q).every(k=>['x','z','t'].includes(k)))return false;
    const point=q as {x:number;z:number;t:number};return bounded(point.x,TOWN_CENTER.x-TOWN_BOUNDS.halfWidth,TOWN_CENTER.x+TOWN_BOUNDS.halfWidth)&&bounded(point.z,TOWN_CENTER.z-TOWN_BOUNDS.halfDepth,TOWN_CENTER.z+TOWN_BOUNDS.halfDepth)&&bounded(point.t,0,.5)&&(i===0?point.t===0:point.t>p.motionPath[i-1].t);
   })&&p.motionPath.at(-1).t===.5&&Math.hypot(p.motionPath.at(-1).x-p.x,p.motionPath.at(-1).z-p.z)<1e-7);
 });
}
/** Detach accepted packets from their caller. Only canonical pose fields can reach contact projection. */
export function copyTownLifePoses(poses:readonly TownResidentPose[]):TownResidentPose[]{
 return poses.map(p=>({x:p.x,z:p.z,facing:p.facing,activity:p.activity,moving:p.moving,...(p.speed!==undefined?{speed:p.speed}:{}),...(p.distance!==undefined?{distance:p.distance}:{}),...(p.authoritativeMotion?{authoritativeMotion:1 as const}:{}),...(p.contactResolved!==undefined?{contactResolved:p.contactResolved}:{}),...(p.motionPath?{motionPath:p.motionPath.map(q=>({...q}))}:{})}));
}
/** Repeated structured-clone packets may share content even though identity changes. */
export function sameTownLifePoses(a:readonly TownResidentPose[]|undefined,b:readonly TownResidentPose[]):boolean{
 return a!==undefined&&a.length===b.length&&a.every((p,i)=>{const q=b[i]!;return p.x===q.x&&p.z===q.z&&p.facing===q.facing&&p.activity===q.activity&&p.moving===q.moving&&p.speed===q.speed&&p.distance===q.distance&&p.authoritativeMotion===q.authoritativeMotion&&p.contactResolved===q.contactResolved&&JSON.stringify(p.motionPath)===JSON.stringify(q.motionPath);});
}
