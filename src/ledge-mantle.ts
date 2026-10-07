import type {Vec3} from './player-contact.ts';

export const MANTLE_TICKS=252;
export const MANTLE_PHASES=['brace','pull','knee','transfer','stand'] as const;
export type MantlePhase=typeof MANTLE_PHASES[number];
export interface MantleContact {
 progress:number;phase:MantlePhase;capsuleHalfHeight:number;lean:number;hipHeight:number;
 leftFoot:Vec3;rightFoot:Vec3;leftKnee:Vec3|null;
 leftHandSupport:boolean;rightHandSupport:boolean;leftFootSupport:boolean;rightFootSupport:boolean;
 leftRelease:number;rightRelease:number;
}
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
/** C2 easing: the load settles at each change of support, with no velocity/acceleration jumps. */
export const mantleEase=(x:number)=>{const t=clamp(x);return t*t*t*(t*(t*6-15)+10);};
const blend=(a:number,b:number,t:number)=>a+(b-a)*mantleEase(t);
const ramp=(t:number,a:number,b:number)=>mantleEase((t-a)/(b-a));
const curve=(t:number,knots:readonly (readonly [number,number])[])=>{for(let i=1;i<knots.length;i++){const a=knots[i-1]!,b=knots[i]!;if(t<=b[0])return blend(a[1],b[1],(t-a[0])/(b[0]-a[0]));}return knots.at(-1)![1];};
const kneeDepth=.08,kneeHeight=.105,ankleDepth=-.32,ankleHeight=kneeHeight-Math.sqrt(.45**2-(kneeDepth-ankleDepth)**2);
const hipOnKnee=(depth:number)=>kneeHeight+Math.sqrt(.45**2-(depth-kneeDepth)**2);
/** Shared authored body mechanics in the ledge's forward/up plane, never a ballistic arc. */
export function mantleSample(progress:number,rise=1.9){
 const t=clamp(progress),depth=curve(t,[[0,-.375],[.37,-.375],[.51,-.24],[.65,-.04],[.82,.27],[1,.45]]);
 const height=t>=.51&&t<=.65?hipOnKnee(depth)-.88:curve(t,[[0,-rise],[.13,-rise+.15],[.37,-.58],[.43,-.40],[.51,hipOnKnee(-.24)-.88],[.65,hipOnKnee(-.04)-.88],[.82,-.24],[1,0]]);
 const lean=curve(t,[[0,-.018],[.13,rise<1.5?.12:-.018],[.23,rise<1.5?.65:0],[.37,1.04],[.43,1.16],[.51,1.12],[.65,1.25],[.82,.72],[1,0]]);
 // Outside: shorten around the same root datum. On top: grow upward with the stand.
 const half= t<.51?curve(t,[[0,.75],[.13,.75],[.37,.2],[.51,.2]]):Math.max(.2,Math.min(.75,height+.75));
 const leftDepth=curve(t,[[0,-.05],[.03,-.05],[.13,.12],[1,.12]]),rightDepth=curve(t,[[0,-.05],[.18,-.05],[.30,.23],[.52,.23],[.62,.4],[1,.4]]);
 const arc=(a:number,b:number)=>t>a&&t<b?Math.sin(Math.PI*ramp(t,a,b))*.10:0;
 const leftHand={depth:leftDepth,height:.06+arc(.03,.13)*.20},rightHand={depth:rightDepth,height:.06+arc(.18,.30)+arc(.52,.62)};
 const leftFoot={depth:curve(t,[[0,rise<1.5?-.5:-.615],[.13,rise<1.5?-.5:-.615],[.37,-.64],[.43,-.56],[.51,ankleDepth],[.65,ankleDepth],[.71,ankleDepth],[.83,.45],[1,.45]]),height:curve(t,[[0,rise<1.5?-rise+.09:-1.57],[.13,rise<1.5?-rise+.09:-1.42],[.37,-.4],[.43,-.2],[.51,ankleHeight],[.65,ankleHeight],[.71,.28],[.83,.09],[1,.09]])};
 const rightFoot={depth:curve(t,[[0,rise<1.5?-.5:-.615],[.13,rise<1.5?-.5:-.615],[.37,-.62],[.51,-.62],[.56,-.48],[.65,.45],[1,.45]]),height:curve(t,[[0,rise<1.5?-rise+.09:-1.57],[.13,rise<1.5?-rise+.09:-1.42],[.37,-.52],[.43,-.25],[.51,-.15],[.56,.28],[.65,.09],[1,.09]])};
 return {progress:t,phase:t<.13?'brace':t<.43?'pull':t<.51?'knee':t<.83?'transfer':'stand',depth,height,lean,hipHeight:rise<1.5?.925-.125*ramp(t,0,.13)+.08*ramp(t,.13,.37):.925-.045*ramp(t,0,.13),half,leftHand,rightHand,leftFoot,rightFoot,
 leftKnee:t>=.51&&t<=.65?{depth:kneeDepth,height:kneeHeight}:null,
 leftHandSupport:(t<=.03||t>=.13)&&t<=.55,rightHandSupport:(t<=.18||t>=.30&&t<=.52||t>=.62)&&t<=.68,
 leftFootSupport:t>=.83||rise<1.5&&t<=.13,rightFootSupport:t>=.65||rise<1.5&&t<=.13,leftRelease:ramp(t,.55,.78),rightRelease:ramp(t,.68,.88)} as const;
}
export function mantleWorld(point:Vec3,normal:Vec3,depth:number,height:number,lateral=0):Vec3{
 // Contact point is .01 m inside the face and .015 above the true top.
 return {x:point.x+normal.x*(.01-depth)+normal.z*lateral,y:point.y-.015+height,z:point.z+normal.z*(.01-depth)-normal.x*lateral};
}
export function mantleContact(point:Vec3,normal:Vec3,progress:number,rise=1.9):MantleContact{
 const s=mantleSample(progress,rise),at=(p:{depth:number;height:number},lateral:number)=>mantleWorld(point,normal,p.depth,p.height,lateral);
 return {progress:s.progress,phase:s.phase,capsuleHalfHeight:s.half,lean:s.lean,hipHeight:s.hipHeight,leftFoot:at(s.leftFoot,.19),rightFoot:at(s.rightFoot,-.19),leftKnee:s.leftKnee?at(s.leftKnee,.19):null,leftHandSupport:s.leftHandSupport,rightHandSupport:s.rightHandSupport,leftFootSupport:s.leftFootSupport,rightFootSupport:s.rightFootSupport,leftRelease:s.leftRelease,rightRelease:s.rightRelease};
}
