import * as THREE from 'three/webgpu';
import type {PlayerContact,Vec3} from './player-contact.ts';

export interface TwoBoneChain {upper:THREE.Object3D;lower:THREE.Object3D;end:THREE.Object3D}
export interface IKSolution {clamped:boolean;requestedDistance:number;solvedDistance:number;error:number}
const EPS=1e-8;
export const finitePoint=(p:Vec3|null|undefined):p is Vec3=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
export const vector=(p:Vec3)=>new THREE.Vector3(p.x,p.y,p.z);
/** Smooth bounded response to measured contact pressure, never to a render clock. */
export function contactWeight(contact:PlayerContact|undefined){
 if(!contact||contact.mode==='none'||!finitePoint(contact.normal)||!Number.isFinite(contact.strength))return 0;
 const n=Math.hypot(contact.normal.x,contact.normal.z);
 if(n<EPS)return 0;
 const t=THREE.MathUtils.clamp(contact.strength,0,1);return t*t*(3-2*t);
}

/**
 * Analytic 3-D two-bone IK. Bones point down local Y; the elbow/knee bends only
 * around its local X axis. The upper joint's orthonormal frame chooses that
 * hinge plane from a world-space pole direction, retaining exact bone lengths.
 * Limits avoid a locked elbow and folded-through limb, even for remote anchors.
 */
export function solveTwoBoneIK(chain:TwoBoneChain,targetWorld:THREE.Vector3,poleWorld:THREE.Vector3,maxBend=2.72):IKSolution{
 const parent=chain.upper.parent!;parent.updateWorldMatrix(true,false);
 const inverse=parent.matrixWorld.clone().invert();
 const start=chain.upper.position,target=targetWorld.clone().applyMatrix4(inverse),delta=target.sub(start);
 const l1=chain.lower.position.length(),l2=chain.end.position.length(),requestedDistance=delta.length();
 const direction=requestedDistance>EPS?delta.divideScalar(requestedDistance):new THREE.Vector3(0,-1,0);
 const minDistance=Math.sqrt(l1*l1+l2*l2+2*l1*l2*Math.cos(maxBend));
 const maxDistance=l1+l2-1e-5,solvedDistance=THREE.MathUtils.clamp(requestedDistance,minDistance,maxDistance);
 const bendDirection=poleWorld.clone().transformDirection(inverse);
 bendDirection.addScaledVector(direction,-bendDirection.dot(direction));
 if(bendDirection.lengthSq()<EPS){bendDirection.set(Math.abs(direction.x)<.8?1:0,Math.abs(direction.x)<.8?0:1,0);bendDirection.addScaledVector(direction,-bendDirection.dot(direction));}
 bendDirection.normalize();
 const along=THREE.MathUtils.clamp((l1*l1+solvedDistance*solvedDistance-l2*l2)/(2*solvedDistance),-l1,l1);
 const elbow=direction.clone().multiplyScalar(along).addScaledVector(bendDirection,Math.sqrt(Math.max(0,l1*l1-along*along)));
 const upperDirection=elbow.clone().divideScalar(l1),lowerDirection=direction.clone().multiplyScalar(solvedDistance).sub(elbow).divideScalar(l2);
 const axis=new THREE.Vector3().crossVectors(upperDirection,lowerDirection).normalize();
 const y=upperDirection.clone().negate(),z=new THREE.Vector3().crossVectors(axis,y).normalize();
 chain.upper.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(axis,y,z));
 const bend=Math.acos(THREE.MathUtils.clamp(upperDirection.dot(lowerDirection),-1,1));
 chain.lower.rotation.set(bend,0,0,'XYZ');
 chain.end.updateWorldMatrix(true,false);
 return {clamped:Math.abs(solvedDistance-requestedDistance)>1e-6,requestedDistance,solvedDistance,error:chain.end.getWorldPosition(new THREE.Vector3()).distanceTo(targetWorld)};
}

/** Keep a sole level or turn a palm toward its actual support, in world space. */
export function orientEndWorld(end:THREE.Object3D,worldRotation:THREE.Quaternion){
 end.parent!.updateWorldMatrix(true,false);
 end.quaternion.copy(end.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(worldRotation));
}
