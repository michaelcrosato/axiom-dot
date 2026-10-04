import type {MantleContact} from './ledge-mantle.ts';
/** Serializable collision evidence. Every anchor is an absolute world-space point. */
export interface Vec3 { x:number; y:number; z:number }
export interface PlayerContact {
 mode:'none'|'wall'|'push'|'pull'|'hang'|'climb';
 strength:number;
 normal:Vec3;
 point:Vec3|null;
 leftHand:Vec3|null;
 rightHand:Vec3|null;
 targetId:string|null;
 desired:{x:number;z:number};
 resolved:{x:number;z:number};
 supported:boolean;
 mantle?:MantleContact;
}
/** Centre and positive half-extents of a deliberately movable, worker-owned crate. */
export interface MovableBody { id:string; x:number; y:number; z:number; hx:number; hy:number; hz:number }
export const emptyPlayerContact=():PlayerContact=>({mode:'none',strength:0,normal:{x:0,y:0,z:0},point:null,leftHand:null,rightHand:null,targetId:null,desired:{x:0,z:0},resolved:{x:0,z:0},supported:false});
export const isFiniteVec3=(v:unknown):v is Vec3=>!!v&&typeof v==='object'&&['x','y','z'].every(k=>Number.isFinite((v as Record<string,unknown>)[k]));
export function validMovableBodies(v:unknown):v is MovableBody[]{
 if(!Array.isArray(v)||v.length>128)return false;
 const ids=new Set<string>();
 return v.every(b=>b&&typeof b.id==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(b.id)&&!ids.has(b.id)&&!!ids.add(b.id)&&[b.hx,b.hy,b.hz].every(n=>Number.isFinite(n)&&n>=.1&&n<=4)&&isFiniteVec3(b)&&Math.max(Math.abs(b.x),Math.abs(b.y),Math.abs(b.z))<=4096);
}
export function validPlayerContact(v:unknown):v is PlayerContact {
 if(!v||typeof v!=='object')return false;const c=v as PlayerContact;
 return (!c.mantle||(c.mode==='climb'&&isFiniteVec3(c.point)&&Number.isFinite(c.mantle.progress)&&c.mantle.progress>=0&&c.mantle.progress<=1&&['brace','pull','knee','transfer','stand'].includes(c.mantle.phase)&&[c.mantle.lean,c.mantle.hipHeight,c.mantle.capsuleHalfHeight,c.mantle.leftRelease,c.mantle.rightRelease].every(Number.isFinite)&&c.mantle.leftRelease>=0&&c.mantle.leftRelease<=1&&c.mantle.rightRelease>=0&&c.mantle.rightRelease<=1&&c.mantle.hipHeight>=.8&&c.mantle.hipHeight<=1&&c.mantle.capsuleHalfHeight>=.2&&c.mantle.capsuleHalfHeight<=.75&&isFiniteVec3(c.mantle.leftFoot)&&isFiniteVec3(c.mantle.rightFoot)&&(c.mantle.leftKnee===null||isFiniteVec3(c.mantle.leftKnee))&&[c.mantle.leftHandSupport,c.mantle.rightHandSupport,c.mantle.leftFootSupport,c.mantle.rightFootSupport].every(v=>typeof v==='boolean'))) && ['none','wall','push','pull','hang','climb'].includes(c.mode)&&Number.isFinite(c.strength)&&c.strength>=0&&c.strength<=1&&isFiniteVec3(c.normal)&&[c.point,c.leftHand,c.rightHand].every(p=>p===null||isFiniteVec3(p))&&(c.targetId===null||typeof c.targetId==='string')&&!!c.desired&&!!c.resolved&&[c.desired.x,c.desired.z,c.resolved.x,c.resolved.z].every(Number.isFinite)&&typeof c.supported==='boolean';
}
