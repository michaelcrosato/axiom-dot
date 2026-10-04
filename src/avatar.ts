import type {EquipmentPlan} from './equipment.ts';
import * as THREE from 'three/webgpu';
import {footContact,strideFor,supportDutyFor,type AnimationState} from './locomotion.ts';
import {applyCombatPose,applyTravelToolPose,type GuardPose,type CombatPoseEvidence} from './avatar-combat.ts';
import {emptyPlayerContact,type PlayerContact} from './player-contact.ts';
import {mantleSample,mantleWorld} from './ledge-mantle.ts';
import {contactWeight,finitePoint,vector,solveTwoBoneIK,orientEndWorld} from './contact-animation.ts';
export const rigProfile={version:6,family:'humanoid',forward:'+Z',joints:['hips','spine','neck','head','leftHip','leftKnee','leftAnkle','rightHip','rightKnee','rightAnkle','leftShoulder','leftElbow','rightShoulder','rightElbow','leftHand','rightHand','back'],sockets:{tool:'rightHand',stowedTool:'back'}};
export type AvatarAction='gather'|'repair'|'pulse'|'enter'|null;
export interface ComboPose{stage:1|2|3;phase:string;progress:number}
/** Distinct ease curves preserve anticipation, a sharp contact beat, and unhurried settle. */
export function attackPose(p:ComboPose){const t=THREE.MathUtils.clamp(p.progress,0,1),e=t*t*(3-2*t),side=p.stage===2?-1:1;const wind=p.stage===3?.65:.9;const swing=p.phase==='prep'?-wind*e:p.phase==='active'?-wind+(wind+1.15)*(1-Math.pow(1-t,3)):1.15*(1-e);return {weight:p.phase==='prep'?Math.min(1,e*3):p.phase==='recovery'?1-e:1,yaw:side*swing,compression:p.phase==='prep'?.055*e:p.phase==='active'?.055*(1-e):0,reach:p.stage===3?(p.phase==='active'?Math.sin(Math.PI*t):p.phase==='recovery'?(1-e)*.1:0):0};}
/** Small work gestures use a preparation, reach/working beat and settled return.
 * They are not object-contact IK: gameplay currently supplies no work-surface anchor. */
export function interactionPose(action:AvatarAction,progress:number){
 const t=THREE.MathUtils.clamp(Number.isFinite(progress)?progress:0,0,1);
 const ramp=(lo:number,hi:number)=>THREE.MathUtils.smoothstep(t,lo,hi);
 if(action!=='gather'&&action!=='repair')return {reach:0,anticipation:0,stroke:0};
 const reach=ramp(.12,.46)*(1-ramp(.68,1));
 const anticipation=ramp(0,.14)*(1-ramp(.14,.34));
 const stroke=action==='repair'&&t>.38&&t<.72?Math.sin((t-.38)/.34*Math.PI*4)*Math.sin((t-.38)/.34*Math.PI)**2*.12:0;
 return {reach,anticipation,stroke};
}
export function createAvatar(){
 const root=new THREE.Group(),hips=new THREE.Group(),torso=new THREE.Group(),neck=new THREE.Group(),back=new THREE.Group();root.name='avatarRoot';hips.name='hips';torso.name='spine';neck.name='neck';back.name='back';root.add(hips);hips.add(torso);torso.add(neck,back);neck.position.y=.64;back.position.set(0,.22,-.31);
 const material=new Map<string,THREE.MeshStandardMaterial>();
 const add=(g:THREE.BufferGeometry,color:string,parent:THREE.Object3D,x=0,y=0,z=0)=>{let m=material.get(color);if(!m){m=new THREE.MeshStandardMaterial({color,flatShading:true,roughness:1});material.set(color,m);}const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
 const box=(p:THREE.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,c:string)=>add(new THREE.BoxGeometry(w,h,d),c,p,x,y,z);
 add(new THREE.CylinderGeometry(.31,.39,.62,6),'#eee4c2',torso,0,.3,0);
 box(torso,0,.53,0,.82,.18,.43,'#4b9991');box(torso,0,.25,-.26,.4,.42,.17,'#4d7265');
 const head=new THREE.Group();head.name='head';head.position.y=.13;neck.add(head);add(new THREE.IcosahedronGeometry(.25,1),'#dcc59a',head);
 add(new THREE.ConeGeometry(.37,.32,6),'#e3d9b5',head,0,.25,0);box(head,0,.01,.21,.28,.07,.06,'#456759');
 const makeLeg=(x:number)=>{const upper=new THREE.Group(),lower=new THREE.Group(),foot=new THREE.Group();hips.add(upper);upper.position.x=x;upper.add(lower);lower.position.y=-.45;lower.add(foot);foot.position.y=-.45;
  add(new THREE.CylinderGeometry(.105,.095,.45,5),'#405b50',upper,0,-.225,0);add(new THREE.CylinderGeometry(.095,.09,.45,5),'#354f47',lower,0,-.225,0);box(foot,0,0,.07,.22,.14,.37,'#304941');return {upper,lower,foot};};
 const left=makeLeg(-.19),right=makeLeg(.19);for(const [name,leg] of [['left',left],['right',right]] as const){leg.upper.name=name+'Hip';leg.lower.name=name+'Knee';leg.foot.name=name+'Ankle';}
 const makeArm=(x:number)=>{const upper=new THREE.Group(),lower=new THREE.Group(),hand=new THREE.Group();torso.add(upper);upper.position.set(x,.51,0);upper.add(lower);lower.position.y=-.35;lower.add(hand);hand.position.y=-.33;
  add(new THREE.CylinderGeometry(.09,.075,.35,5),'#d1caa8',upper,0,-.175,0);add(new THREE.CylinderGeometry(.075,.06,.33,5),'#416f66',lower,0,-.165,0);add(new THREE.IcosahedronGeometry(.08,0),'#dcc59a',hand);return {upper,lower,hand};};
 const armL=makeArm(-.43),armR=makeArm(.43);for(const [name,arm] of [['left',armL],['right',armR]] as const){arm.upper.name=name+'Shoulder';arm.lower.name=name+'Elbow';arm.hand.name=name+'Hand';}const tool=new THREE.Group();tool.name='surveyStaff';armR.hand.add(tool);let equipment:EquipmentPlan|null=null;
 const setEquipment=(plan:EquipmentPlan|null)=>{if(equipment?.ref.recipeHash===plan?.ref.recipeHash&&tool.children.length)return;equipment=plan;for(const child of [...tool.children]){child.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});tool.remove(child);}if(!plan){box(tool,0,0,0,.07,.95,.07,'#c7a15d');add(new THREE.OctahedronGeometry(.13),'#a0efdd',tool,0,.53,0);return;}for(const s of plan.plan.shapes){const mesh=box(tool,s.center.x,s.center.y,s.center.z,s.half.x*2,s.half.y*2,s.half.z*2,s.material==='equipment-crystal'?'#a0efdd':s.material==='equipment-grip'?'#416f66':s.material==='equipment-metal'?'#9aaeb4':'#c7a15d');mesh.name=s.id;}for(const p of plan.plan.exposed){const marker=new THREE.Object3D();marker.name='grip-'+p.key;marker.position.set(p.port.position.x,p.port.position.y,p.port.position.z);tool.add(marker);}};setEquipment(null);
 const solveLeg=(leg:typeof left,z:number,footY:number,hipY:number)=>{
  const y=footY-hipY,d=THREE.MathUtils.clamp(Math.hypot(z,y),.12,.898),dir=Math.atan2(-z,-y),bend=Math.acos(THREE.MathUtils.clamp(d/.9,-1,1));
  leg.upper.rotation.x=dir-bend;leg.lower.rotation.x=2*bend;leg.foot.rotation.x=-dir-bend;
 };
 const applyContact=(contact:PlayerContact,weight:number,a:AnimationState)=>{
  const mantle=contact.mode==='climb'?contact.mantle:undefined;
  const hanging=contact.mode==='hang'||contact.mode==='climb',effort=contact.mode==='push'||contact.mode==='pull';
  // A low collider must retain the established crawl envelope; contact still stows the staff.
  if(!hanging&&a.crouch>.25)return;
  root.updateWorldMatrix(true,true);
  const normal=vector(contact.normal).setY(0).normalize(),localNormal=normal.clone().transformDirection(root.matrixWorld.clone().invert());
  const localToward=localNormal.clone().negate(),side=new THREE.Vector3(localToward.z,0,-localToward.x),rootWorldRotation=root.getWorldQuaternion(new THREE.Quaternion());
  const ledgeHeight=finitePoint(contact.point)?root.worldToLocal(vector(contact.point)).y:1.915;
  const climbRise=contact.mode==='climb'?THREE.MathUtils.clamp((1.915-ledgeHeight)/1.94,0,1):0;
  const blend=hanging?1:weight,baseHip=hips.position.y,baseFeet=[left.foot.getWorldPosition(new THREE.Vector3()),right.foot.getWorldPosition(new THREE.Vector3())],baseSoles=[left.foot.getWorldQuaternion(new THREE.Quaternion()),right.foot.getWorldQuaternion(new THREE.Quaternion())];
  const pull=contact.mode==='pull',shift=mantle?0:hanging?.012:effort?(pull?.075:.045):.035;
  const wallResponse=contact.mode==='wall'&&finitePoint(contact.point)?THREE.MathUtils.smoothstep(contact.strength,0,.08):0;
  const supportShift=Math.max(.052*wallResponse,shift*blend);
  hips.position.x=localNormal.x*supportShift;hips.position.z=localNormal.z*supportShift;
  hips.position.y=THREE.MathUtils.lerp(baseHip,mantle?mantle.hipHeight:hanging?THREE.MathUtils.lerp(.925,.88,climbRise):effort?.79:.855,blend);
  // Small lean and counterbalanced pelvis convey pressure without a theatrical wall dance.
  const lean=mantle?mantle.lean:hanging?-.018:effort?(pull?-.075:.085):.052;
  torso.rotation.x=THREE.MathUtils.lerp(torso.rotation.x,localToward.z*lean,blend);
  torso.rotation.z=THREE.MathUtils.lerp(torso.rotation.z,-localToward.x*lean,blend);
  // A measured wall blocks forward upper-body travel on the impact frame too.
  // Pressure may ease the palms in, but it must not let acceleration lean drive
  // the hat through the solid while that pressure is still ramping up.
  if(contact.mode==='wall'&&finitePoint(contact.point)){
   const forwardLean=torso.rotation.x*localToward.z-torso.rotation.z*localToward.x;
   if(forwardLean>.012){torso.rotation.x-=localToward.z*(forwardLean-.012)*wallResponse;torso.rotation.z+=localToward.x*(forwardLean-.012)*wallResponse;}
  }
  torso.rotation.y*=1-blend;head.rotation.set(-torso.rotation.x*.45,0,-torso.rotation.z*.45);
  root.updateWorldMatrix(true,true);
  const soleWorld=root.getWorldQuaternion(new THREE.Quaternion());
  for(const [index,leg] of [left,right].entries()){
   const sign=index===0?-1:1;
   const base=baseFeet[index]!.clone();
   // During suspension the tucked legs stay on the outside of the support plane.
   const stagger=effort?(index===0?.14:-.13):index===0?.055:-.045;
   const target=new THREE.Vector3(sign*(effort?.225:.19),hanging?THREE.MathUtils.lerp(.33,.09,climbRise):.09,0);
   target.addScaledVector(hanging?localNormal:localToward,hanging?.24*(1-climbRise):stagger);
   // A leading knee clears the lip, then soles settle as the worker lifts the root onto it.
   if(contact.mode==='climb')target.y+=Math.sin(Math.PI*climbRise)*(index===0?.14:.07);
   root.localToWorld(target);
   // Load passes through the walking soles. A moving grip must not replace the
   // gait with a static root-relative stagger, which dragged both feet together.
   if(effort&&!a.support){
    const gait=footContact(a.phase+(index===1?.5:0),Math.min(.4,strideFor(a.speed,a.crouch)),.055);
    const effortFoot=root.localToWorld(new THREE.Vector3(sign*.19,.09+gait.y*Math.min(1,a.speed/.45),gait.z-.14));
    base.copy(effortFoot);
   }else if(!effort&&!a.support)base.lerp(target,blend);
   if(mantle)base.copy(vector(index===0?mantle.leftFoot:mantle.rightFoot));
   const pole=normal.clone().negate().add(new THREE.Vector3(side.x*sign*(hanging?0:.08),0,side.z*sign*(hanging?0:.08)).applyQuaternion(rootWorldRotation));
   solveTwoBoneIK({upper:leg.upper,lower:leg.lower,end:leg.foot},base,pole,2.65);
   orientEndWorld(leg.foot,effort||a.support&&!hanging?baseSoles[index]!:soleWorld);
  }
  root.updateWorldMatrix(true,true);
  // Stow across the actual support tangent, even while facing is catching up.
  // This keeps the entire weapon on the body side of a wall, rather than its tip through it.
  if(tool.parent!==back)back.add(tool);
  const stowWorld=hips.getWorldPosition(new THREE.Vector3()).addScaledVector(normal,.31).add(new THREE.Vector3(0,.22,0));
  back.position.copy(torso.worldToLocal(stowWorld));
  const tangent=new THREE.Vector3(normal.z,0,-normal.x);
  const stowRotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),tangent);
  orientEndWorld(back,stowRotation);
  tool.position.set(0,-(equipment?(equipment.bounds.minY+equipment.bounds.maxY)/2:.0925),0);tool.rotation.set(0,0,0,'XYZ');
  root.updateWorldMatrix(true,true);
  for(const [name,arm,target] of [['left',armL,contact.leftHand],['right',armR,contact.rightHand]] as const){
   if(mantle&&!finitePoint(target)){
    // Ease an unloaded arm from its last brace toward this frame's ordinary rest pose.
    // The other hand, planted knee or boot carries the body while this arm recovers.
    const release=name==='left'?mantle.leftRelease:mantle.rightRelease;
    const restUpper=arm.upper.quaternion.clone(),restLower=arm.lower.quaternion.clone();
    const s=mantleSample(name==='left'?.55:.68),p=name==='left'?s.leftHand:s.rightHand;
    const last=vector(mantleWorld(contact.point!,contact.normal,p.depth,p.height,name==='left'?.30:-.30));
    const pole=normal.clone().multiplyScalar(.45).add(new THREE.Vector3(name==='left'?-.9:.9,-.3,0).applyQuaternion(rootWorldRotation));
    const freeTarget=last.lerp(arm.hand.getWorldPosition(new THREE.Vector3()),release);
    solveTwoBoneIK({upper:arm.upper,lower:arm.lower,end:arm.hand},freeTarget,pole);
    const restBlend=THREE.MathUtils.smoothstep(release,.65,1);
    arm.upper.quaternion.slerp(restUpper,restBlend);arm.lower.quaternion.slerp(restLower,restBlend);
    continue;
   }
   if(!finitePoint(target)){
    if(contact.mode==='climb'){arm.upper.rotation.set(-.75,0,name==='left'?-.15:.15,'XYZ');arm.lower.rotation.set(-1.05,0,0,'XYZ');}
    continue;
   }
   const desired=vector(target),shoulder=arm.upper.getWorldPosition(new THREE.Vector3());
   // A stale/remote contact never pulls the body or lengthens either limb.
   const far=desired.distanceTo(shoulder)>.86;
   if(far){anchorClamped[name]=true;continue;}
   const start=arm.hand.getWorldPosition(new THREE.Vector3()),handTarget=start.lerp(desired,hanging||effort?1:blend);
   const lateral=new THREE.Vector3(name==='left'?-.55:.55,-.7,.05).transformDirection(root.matrixWorld);
   const pole=hanging?normal.clone().multiplyScalar(.45).add(new THREE.Vector3(name==='left'?-.9:.9,-.3,0).applyQuaternion(rootWorldRotation)):normal.clone().multiplyScalar(.25).add(lateral);
   const solution=solveTwoBoneIK({upper:arm.upper,lower:arm.lower,end:arm.hand},handTarget,pole);
   anchorClamped[name]=solution.clamped;
   const palmNormal=mantle?normal.clone().negate().lerp(new THREE.Vector3(0,-1,0),Math.min(1,mantle.progress/.35)).normalize():normal.clone().negate();
   const palm=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),palmNormal);
   orientEndWorld(arm.hand,palm);
  }
 };
 let travelEvidence:ReturnType<typeof applyTravelToolPose>=null;
 let combatEvidence:CombatPoseEvidence|null=null;
 let supportSnapshot:AnimationState['support']=null;
 let contactSnapshot:PlayerContact=emptyPlayerContact(),anchorClamped={left:false,right:false},equipmentStowed=false;
 const getPoseEvidence=()=>{
  root.updateWorldMatrix(true,true);
  const joints:Record<string,{local:{position:number[];quaternion:number[]};world:{position:number[];quaternion:number[]}}>={};
  for(const name of rigProfile.joints){const joint=root.getObjectByName(name)!;joints[name]={local:{position:joint.position.toArray(),quaternion:joint.quaternion.toArray()},world:{position:joint.getWorldPosition(new THREE.Vector3()).toArray(),quaternion:joint.getWorldQuaternion(new THREE.Quaternion()).toArray()}};}
  const anchor=(side:'left'|'right',hand:THREE.Object3D)=>{const targetCandidate=contactSnapshot[side==='left'?'leftHand':'rightHand'],target=finitePoint(targetCandidate)?targetCandidate:null,actual=hand.getWorldPosition(new THREE.Vector3());return {target:target?vector(target).toArray():null,actual:actual.toArray(),error:target?actual.distanceTo(vector(target)):null,clamped:anchorClamped[side]};};
  const bounds=new THREE.Box3().setFromObject(root,true);
  return {contact:structuredClone(contactSnapshot),groundSupport:structuredClone(supportSnapshot),combat:structuredClone(combatEvidence),travelTool:structuredClone(travelEvidence),joints,anchors:{left:anchor('left',armL.hand),right:anchor('right',armR.hand)},bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},equipment:{parent:tool.parent?.name??null,stowed:equipmentStowed}};
 };
 return {root,setEquipment,getPoseEvidence,update(a:AnimationState,action:AvatarAction,progress:number,combo?:ComboPose,contact?:PlayerContact,guard?:GuardPose){
  // Incidental wall bracing yields to explicit work/combat; a real grip or ledge owns the hands.
  const pressure=contact?.mode==='wall'&&(combo||action||guard)?0:contactWeight(contact);
  if(pressure&&contact?.mode!=='wall')action=null;
  if(pressure&&contact?.mantle)a={...a,airborne:false,vertical:0,speed:0,landing:0,takeoff:0,brake:0,lean:0,turn:0};
  supportSnapshot=a.support?structuredClone(a.support):null;
  contactSnapshot=pressure&&contact?structuredClone(contact):emptyPlayerContact();anchorClamped={left:false,right:false};
  // Rebuild every joint from the snapshot. Contact, IK and combat never leak into the next pose.
  back.position.set(0,.22,-.31);back.rotation.set(0,0,0,'XYZ');
  hips.position.set(0,0,0);hips.rotation.set(0,0,0,'XYZ');torso.position.set(0,0,0);neck.rotation.set(0,0,0,'XYZ');
  for(const joint of [torso,head,left.upper,left.lower,left.foot,right.upper,right.lower,right.foot,armL.upper,armL.lower,armL.hand,armR.upper,armR.lower,armR.hand])joint.rotation.set(0,0,0,'XYZ');
  combatEvidence=null;travelEvidence=null;
  const air=a.airborne?1:0,landing=a.landing,ascent=THREE.MathUtils.clamp(a.vertical/6.6,-1,1);
  const move=Math.min(1,a.speed/.45)*(1-air),run=Math.min(1,Math.max(0,(a.speed-2)/6)),crawl=a.crouch,slide=a.slide,upright=Math.max(0,1-crawl*2);
  const step=Math.sin(a.phase*Math.PI*2),bob=Math.abs(Math.sin(a.phase*Math.PI*2));
  const actionEnvelope=action?Math.sin(Math.PI*Math.min(1,progress)):0;
  const work=interactionPose(action,progress),gather=work.reach*(1-crawl),prepare=work.anticipation*(1-crawl)*(1-air),pulse=action==='pulse'?actionEnvelope:0;
  root.rotation.set(0,a.heading,0);hips.position.y=.88-crawl*.5-slide*.08-bob*.035*move-gather*.1-prepare*.025-air*.035*(1-crawl)-landing*.12*(1-crawl)-a.brake*.035*(1-crawl);
  torso.position.y=slide*.12;
  torso.rotation.set(a.lean*(1-crawl)+crawl*1.02+gather*.35+prepare*.09+slide*.1-air*.08*(1-crawl)+landing*.12*(1-crawl),step*.065*move*upright+pulse*.38*upright,a.turn*upright);
  neck.position.set(0,.64-crawl*.27,crawl*.18);head.position.set(0,.13,0);
  head.rotation.set(-crawl*.1-a.lean*.35*(1-crawl)+a.brake*.025*(1-crawl),Math.sin(a.phase*Math.PI*2)*.025*move,0);
  const stride=strideFor(a.speed,crawl),lift=(.055+run*.16)*(1-crawl*.45);
  const duty=supportDutyFor(a.speed,crawl),fL=footContact(a.phase,stride,lift,duty),fR=footContact(a.phase+.5,stride,lift,duty);
  // Foot targets retain a flat planted portion, with knee recovery in the airborne portion.
  // Extend toward the upcoming support as descent accelerates, instead of
  // keeping a full tuck until the collision tick and snapping both feet down.
  const descent=air*THREE.MathUtils.smoothstep(-a.vertical,0,6.3)*(1-crawl);
  const tuck=air*(.14+Math.max(0,ascent)*.09)*(1-crawl*.8)*(1-a.takeoff*.8)*(1-descent);
  const airRecovery=descent*Math.min(1,a.speed/.45);
  solveLeg(left,(fL.z*(1-air+descent)+crawl*.16+a.brake*.1*(1-crawl))*(1-slide)+slide*.35+air*.09*(1-crawl)*(1-descent),.09+fL.y*(move+airRecovery)*(1-slide)+tuck,hips.position.y);
  solveLeg(right,(fR.z*(1-air+descent)+crawl*.16+a.brake*.1*(1-crawl))*(1-slide)+slide*.2-air*.04*(1-crawl)*(1-descent),.09+fR.y*(move+airRecovery)*(1-slide)+slide*.04+tuck*.75,hips.position.y);
  left.upper.rotation.z=-slide*.16;right.upper.rotation.z=slide*.16;
  const swing=step*(.2+run*.55)*move*(1-crawl);
  armL.upper.rotation.set(-swing-crawl*.8-gather*.55-air*.32*(1-crawl),0,-.08-slide*.2);
  armR.upper.rotation.set(swing*.75-crawl*.8-gather*.9-pulse*1.5-air*.32*(1-crawl),0,.08+slide*.15);
  armL.lower.rotation.x=-.25-run*.6-crawl*.35-Math.max(0,-step)*crawl*.4;
  armR.lower.rotation.x=-.25-run*.6-crawl*.35-Math.max(0,step)*crawl*.4-pulse*.4+work.stroke*(1-crawl);
  if(crawl>.35&&!air){
   // Hands reach down as the physical stance lowers, then carry alternating
   // support. Positive hinge IK and outward poles keep elbows off the rib cage.
   const handWeight=THREE.MathUtils.smoothstep(crawl,.35,.95);
   root.updateWorldMatrix(true,true);
   for(const [arm,phase,sign] of [[armL,a.phase+.5,-1],[armR,a.phase,1]] as const){
    const f=footContact(phase,stride,.055,duty),target=new THREE.Vector3(sign*.43,.08+slide*.14+f.y*move*(1-slide),.47+f.z*(1-slide)-slide*.12);
    root.localToWorld(target);const start=arm.hand.getWorldPosition(new THREE.Vector3());
    const pole=new THREE.Vector3(sign*.6,.05,-1).transformDirection(root.matrixWorld);
    solveTwoBoneIK({upper:arm.upper,lower:arm.lower,end:arm.hand},start.lerp(target,handWeight),pole);
    orientEndWorld(arm.hand,new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,a.heading,0,'YXZ')));
   }
  }
  if(a.support&&!air&&slide<.01){
   root.updateWorldMatrix(true,true);
   for(const [leg,support,sign] of [[left,a.support.leftFoot,-1],[right,a.support.rightFoot,1]] as const){
    const target=root.localToWorld(vector(support.target));
    const pole=new THREE.Vector3(sign*crawl*.85,crawl*.8,1-crawl*.6).transformDirection(root.matrixWorld);
    solveTwoBoneIK({upper:leg.upper,lower:leg.lower,end:leg.foot},target,pole,2.65);
    orientEndWorld(leg.foot,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),support.heading));
   }
   for(const [arm,support,sign] of [[armL,a.support.leftHand,-1],[armR,a.support.rightHand,1]] as const){
    if(!support)continue;
    const target=root.localToWorld(vector(support.target));
    const pole=new THREE.Vector3(sign*.6,.05,-1).transformDirection(root.matrixWorld);
    solveTwoBoneIK({upper:arm.upper,lower:arm.lower,end:arm.hand},target,pole);
    orientEndWorld(arm.hand,new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,support.heading,0,'YXZ')));
   }
  }
  if(air){armL.upper.rotation.x+=a.takeoff*.25;armR.upper.rotation.x+=a.takeoff*.25;if(crawl>.5){armL.lower.rotation.x=-1.35;armR.lower.rotation.x=-1.35;}}
  // Low traversal stows the staff on the pack instead of dragging it through the ground.
  equipmentStowed=!!(pressure||crawl>.5||air||equipment&&(slide>.2||action==='gather'||action==='repair'));
  if(equipmentStowed){if(tool.parent!==torso)torso.add(tool);tool.position.set(equipment?(equipment.bounds.minY+equipment.bounds.maxY)/2:.27,.22,-.31);tool.rotation.set(0,0,Math.PI/2);}
  else{if(tool.parent!==armR.hand)armR.hand.add(tool);tool.position.set(0,equipment?0:.33,0);tool.rotation.set(-pulse*.6,0,0);}
  const heldRig={root,hips,torso,head,leftArm:{upper:armL.upper,lower:armL.lower,end:armL.hand},rightArm:{upper:armR.upper,lower:armR.lower,end:armR.hand},leftLeg:{upper:left.upper,lower:left.lower,end:left.foot},rightLeg:{upper:right.upper,lower:right.lower,end:right.foot},tool,equipment};
  if(!equipmentStowed){travelEvidence=applyTravelToolPose(heldRig,a);equipmentStowed=travelEvidence?.stowWeight===1;}
  combatEvidence=applyCombatPose(heldRig,a,!pressure?combo:undefined,!pressure?guard:undefined);
  if(combatEvidence?.weight)equipmentStowed=false;
  if(pressure&&contact)applyContact(contact,pressure,a);
  tool.visible=true;
 }};
}
