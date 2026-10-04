import * as THREE from 'three/webgpu';
import type {ComboPose} from './avatar.ts';
import type {AnimationState} from './locomotion.ts';
import type {EquipmentPlan} from './equipment.ts';
import type {GuardState} from './guard.ts';
import {solveTwoBoneIK,orientEndWorld,type TwoBoneChain} from './contact-animation.ts';

export interface GuardPose {phase:'windup'|'active'|'recovery';progress:number;impact?:number}
export interface CombatRig {
 root:THREE.Object3D;hips:THREE.Object3D;torso:THREE.Object3D;head:THREE.Object3D;
 leftArm:TwoBoneChain;rightArm:TwoBoneChain;leftLeg:TwoBoneChain;rightLeg:TwoBoneChain;
 tool:THREE.Object3D;equipment:EquipmentPlan|null;
}
export interface CombatPoseEvidence {
 kind:'attack'|'guard';weight:number;staffWeight:number;supportWeight:number;dominantWeight:number;
 grips:Record<'left'|'right',{target:number[];actual:number[];error:number;loaded:boolean;clamped:boolean}>;
}
const clamp=(n:number)=>THREE.MathUtils.clamp(Number.isFinite(n)?n:0,0,1);
const ease=(n:number)=>{const t=clamp(n);return t*t*t*(10+t*(-15+t*6));};
const Y_FLIP=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI);

/** Presentation of an accepted guard snapshot. This adapter never advances authority. */
export function guardPoseFromState(s:GuardState):GuardPose|undefined {
 if(s.phase==='idle'||!s.recipe)return undefined;
 const r=s.recipe,start=s.phase==='windup'?0:s.phase==='active'?r.windup:r.windup+r.active;
 const duration=s.phase==='windup'?r.windup:s.phase==='active'?r.active:r.recovery;
 const age=s.lastBlock?.castId===s.castId?s.time-s.lastBlock.at:Infinity;
 const impact=age>=0&&age<.22?Math.sin(Math.PI*age/.22)**2:0;
 return {phase:s.phase,progress:clamp((s.elapsed-start)/duration),impact};
}

/**
 * A deterministic overlay on this frame's ordinary pose and ordinary staff placement.
 * The staff is interpolated around its actual dominant grip, with no parent-space jump.
 * All joint targets come from the snapshot; neither a render clock nor previous pose is used.
 */
export function applyCombatPose(rig:CombatRig,a:AnimationState,combo?:ComboPose,guard?:GuardPose):CombatPoseEvidence|null {
 const attack=combo&&['prep','active','recovery'].includes(combo.phase)?combo:undefined;
 if(attack)guard=undefined;
 if((!attack&&!guard)||a.airborne||a.crouch>=.25)return null;
 const {root,hips,torso,head,tool,equipment}=rig;
 const t=clamp((attack??guard!).progress),phase=attack?.phase??guard!.phase;
 const acquiring=phase==='prep'||phase==='windup',recovering=phase==='recovery';
 const weight=acquiring?ease(t):recovering?1-ease(t):1;
 if(weight<1e-10)return null;
 const side=attack?.stage===2?-1:1,wind=attack?.stage===3?.65:.9;
 const recoveryYaw=t<.16?THREE.MathUtils.lerp(1.15,1.22,ease(t/.16)):1.22*(1-ease((t-.16)/.84));
 const yaw=attack?side*(acquiring?-wind*ease(t):recovering?recoveryYaw:THREE.MathUtils.lerp(-wind,1.15,ease(t))):0;
 const reach=attack?.stage===3&&phase==='active'?Math.sin(Math.PI*t)**2:0;
 const impact=guard?clamp(guard.impact??0):0,still=1-clamp(a.speed/2);
 root.updateWorldMatrix(true,true);
 const feet=[rig.leftLeg,rig.rightLeg].map(leg=>({position:leg.end.getWorldPosition(new THREE.Vector3()),rotation:leg.end.getWorldQuaternion(new THREE.Quaternion())}));
 // Grounded compression and a little pelvis lead keep torque connected to the feet.
 hips.position.y-=weight*(attack?(acquiring?.022:recovering?.008:THREE.MathUtils.lerp(.022,.008,ease(t))):.026+.012*impact);
 hips.position.z+=still*weight*(attack?reach*.018:-impact*.012);
 hips.rotation.y+=still*yaw*.065*weight;
 torso.rotation.y+=yaw*.28*weight;
 torso.rotation.x+=weight*(attack?reach*.055:(.035-.055*impact));
 head.rotation.y-=yaw*.18*weight;
 root.updateWorldMatrix(true,true);
 const rootRotation=root.getWorldQuaternion(new THREE.Quaternion());
 for(const [i,leg] of [rig.leftLeg,rig.rightLeg].entries()){
  solveTwoBoneIK(leg,feet[i]!.position,new THREE.Vector3(0,0,1).applyQuaternion(rootRotation),2.85);
  orientEndWorld(leg.end,feet[i]!.rotation);
 }
 root.updateWorldMatrix(true,true);
 const dominantLocal=new THREE.Vector3(0,equipment?0:-.33,0),supportLocal=new THREE.Vector3(0,equipment?equipment.stats.gripSpacing:-.18,0);
 const baseGrip=torso.worldToLocal(tool.localToWorld(dominantLocal.clone()));
 const baseToolRotation=torso.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(tool.getWorldQuaternion(new THREE.Quaternion()));
 const baseHands=[rig.leftArm,rig.rightArm].map(arm=>({
  position:arm.end.getWorldPosition(new THREE.Vector3()),rotation:arm.end.getWorldQuaternion(new THREE.Quaternion()),
  pole:arm.lower.getWorldPosition(new THREE.Vector3()).sub(arm.upper.getWorldPosition(new THREE.Vector3())),
 }));
 const gripGap=baseHands[1]!.position.distanceTo(torso.localToWorld(baseGrip.clone()));
 const held=gripGap<1e-8;
 // Partial travel stows have a partial hand release. Retrieval time scales
 // continuously with that gap, so crossing a movement speed cannot pop combat.
 const retrieval=.32*ease(gripGap/.45),travelEnd=1-retrieval;
 const targetGrip=new THREE.Vector3(-.025,guard ? .32 : .29,.36+reach*.035-impact*.024);
 // The long shaft stays near the ground plane even during a pitched landing;
 // copying torso pitch into a heavy head would sweep it through the floor.
 const targetWorld=rootRotation.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(guard?-.10:.045,yaw+hips.rotation.y+torso.rotation.y,Math.PI/2,'YXZ')));
 const targetRotation=torso.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(targetWorld);
 // A stowed staff stays on the pack while the right hand reaches its grip.
 // Recovery reverses the order: dock first, release the hand second.
 const staffWeight=held?weight:acquiring?ease((t-retrieval)/travelEnd):recovering?1-ease(t/travelEnd):1;
 const dominantWeight=held?1:acquiring?ease(t/Math.max(1e-12,retrieval)):recovering?1-ease((t-travelEnd)/Math.max(1e-12,retrieval)):1;
 const grip=baseGrip.clone().lerp(targetGrip,staffWeight),rotation=baseToolRotation.slerp(targetRotation,staffWeight);
 if(tool.parent!==torso)torso.add(tool);
 tool.quaternion.copy(rotation);tool.position.copy(grip).sub(dominantLocal.clone().applyQuaternion(rotation));
 root.updateWorldMatrix(true,true);
 const targetL=tool.localToWorld(supportLocal.clone()),targetR=tool.localToWorld(dominantLocal.clone());
 const supportWeight=staffWeight;
 const evidence={} as CombatPoseEvidence['grips'];
 for(const [i,arm] of [rig.leftArm,rig.rightArm].entries()){
  const sideName=i===0?'left':'right',base=baseHands[i]!,target=i===0?targetL:targetR,gripWeight=i===0?supportWeight:dominantWeight;
  const requested=base.position.clone().lerp(target,gripWeight);
  const lateral=new THREE.Vector3(i===0?-.9:.9,-.45,-.15).applyQuaternion(torso.getWorldQuaternion(new THREE.Quaternion()));
  const poleWeight=held||i===0?weight:Math.max(weight,dominantWeight);
  const pole=base.pole.clone().normalize().lerp(lateral.normalize(),poleWeight);
  const solution=solveTwoBoneIK(arm,requested,pole);
  // Ordinary arms use a negative elbow hinge. The equivalent frame avoids a
  // 180-degree upper-arm roll when a just-started overlay has near-zero weight.
  arm.upper.quaternion.multiply(Y_FLIP);arm.lower.rotation.x=-arm.lower.rotation.x;
  orientEndWorld(arm.end,base.rotation.clone().slerp(tool.getWorldQuaternion(new THREE.Quaternion()),gripWeight));
  const actual=arm.end.getWorldPosition(new THREE.Vector3());
  evidence[sideName]={target:target.toArray(),actual:actual.toArray(),error:actual.distanceTo(target),loaded:gripWeight>1-1e-8&&!solution.clamped,clamped:solution.clamped};
 }
 return {kind:attack?'attack':'guard',weight,staffWeight,supportWeight,dominantWeight,grips:evidence};
}


export interface TravelToolEvidence {stowWeight:number;handWeight:number;grip:{target:number[];actual:number[];error:number;loaded:boolean}}
/** A speed-continuous pack transfer. The hand carries the staff until it is parked. */
export function applyTravelToolPose(rig:CombatRig,a:AnimationState):TravelToolEvidence|null {
 const {root,torso,tool,equipment,rightArm:arm}=rig;
 if(!equipment||a.speed<=3||a.airborne||a.crouch>.5||a.slide>.2)return null;
 const t=clamp((a.speed-3)/2),stowWeight=ease(t/.68),handWeight=1-ease((t-.68)/.32);
 root.updateWorldMatrix(true,true);
 const basePosition=torso.worldToLocal(tool.getWorldPosition(new THREE.Vector3()));
 const baseRotation=torso.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(tool.getWorldQuaternion(new THREE.Quaternion()));
 const baseHand=arm.end.getWorldPosition(new THREE.Vector3()),baseHandRotation=arm.end.getWorldQuaternion(new THREE.Quaternion());
 const basePole=arm.lower.getWorldPosition(new THREE.Vector3()).sub(arm.upper.getWorldPosition(new THREE.Vector3())).normalize();
 const targetPosition=new THREE.Vector3((equipment.bounds.minY+equipment.bounds.maxY)/2,.22,-.31);
 const targetRotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,Math.PI/2));
 if(tool.parent!==torso)torso.add(tool);
 tool.position.copy(basePosition).lerp(targetPosition,stowWeight);tool.quaternion.copy(baseRotation).slerp(targetRotation,stowWeight);
 root.updateWorldMatrix(true,true);
 const target=tool.getWorldPosition(new THREE.Vector3());
 if(handWeight>1e-10){
  const poleWeight=stowWeight*handWeight,lateral=new THREE.Vector3(.9,-.45,-.15).applyQuaternion(torso.getWorldQuaternion(new THREE.Quaternion())).normalize();
  const requested=baseHand.clone().lerp(target,handWeight);
  solveTwoBoneIK(arm,requested,basePole.lerp(lateral,poleWeight));
  arm.upper.quaternion.multiply(Y_FLIP);arm.lower.rotation.x=-arm.lower.rotation.x;
  orientEndWorld(arm.end,baseHandRotation.clone().slerp(tool.getWorldQuaternion(new THREE.Quaternion()),poleWeight));
 }
 const actual=arm.end.getWorldPosition(new THREE.Vector3());
 return {stowWeight,handWeight,grip:{target:target.toArray(),actual:actual.toArray(),error:actual.distanceTo(target),loaded:handWeight>1-1e-8}};
}
