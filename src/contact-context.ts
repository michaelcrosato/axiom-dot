import type {MovableBody,PlayerContact,Vec3} from './player-contact.ts';
export interface ContactContext {label:string;hint:string;kind:'release'|'crate'|'reach';targetId:string|null}
/** UI is advisory only; the worker independently checks support, range and occlusion. */
export function playerContactContext(contact:PlayerContact,bodies:readonly MovableBody[],feet:Vec3,grounded:boolean,enabled:boolean):ContactContext|null{
 if(!enabled)return null;
 if(contact.mode==='push'||contact.mode==='pull')return {label:'Release',hint:'move to push / pull · tap to let go',kind:'release',targetId:contact.targetId};
 if(contact.mode==='hang'||contact.mode==='climb')return {label:'Let go',hint:'Jump to climb · Crouch to drop',kind:'release',targetId:contact.targetId};
 if(!grounded)return {label:'Reach',hint:'tap near a clear ledge to hang',kind:'reach',targetId:null};
 const nearby=bodies.map(b=>({b,d:Math.hypot(Math.max(0,Math.abs(feet.x-b.x)-b.hx),Math.max(0,Math.abs(feet.z-b.z)-b.hz))})).filter(({b,d})=>d<.95&&Math.abs(feet.y-(b.y-b.hy))<.22).sort((a,b)=>a.d-b.d||a.b.id.localeCompare(b.b.id))[0];
 return nearby?{label:'Grip crate',hint:'move to push / pull · tap to let go',kind:'crate',targetId:nearby.b.id}:null;
}
