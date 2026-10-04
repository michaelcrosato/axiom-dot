import * as THREE from 'three/webgpu';
import {createAvatar} from './avatar.ts';
import {idleAnimation,stepAnimation,stepGroundSupport,type AnimationState} from './locomotion.ts';
import {regionalHeight,type RegionalBox} from './regional-world.ts';
import type {Vec3} from './procedural.ts';
import {regionalSupplyPlan,regionalSupplyActorPoses,regionalSupplyProjectBoxes,REGIONAL_SUPPLY_STEP,type RegionalSupplyState} from './regional-supply.ts';

/** Presentation has no timer, resource ledger or authority to start a project. */
export const REGIONAL_SUPPLY_VIEW_DISTANCE=72;
export interface RegionalSupplyViewContext {
 zone:string;
 player:{x:number;z:number};
 /** The owner chunk must have acknowledged precisely this project's activation.
  * Do not substitute requested/pending collision, or merely a loaded mesh. */
 isConfirmed:(outpostId:string,projectStarted:boolean)=>boolean;
}
type Pose=ReturnType<typeof regionalSupplyActorPoses>[number];
type Avatar=ReturnType<typeof createAvatar>;
interface ResidentVisual {root:THREE.Group;avatar:Avatar;animation:AnimationState;last:THREE.Vector3;progress:number;cup:THREE.Group;hammer:THREE.Group}
interface OutpostVisual {root:THREE.Group;project:THREE.Group;beacon:THREE.Group;residents:Map<string,ResidentVisual>;signature:string}
const clamp01=(value:number)=>Math.max(0,Math.min(1,value));
const finitePoint=(point:{x:number;y?:number;z:number})=>[point.x,point.y??0,point.z].every(Number.isFinite);
/** Full physical descriptor, useful to assert renderer/physics parity in tests. */
export function regionalSupplyBoxSignature(boxes:readonly RegionalBox[]):string {
 return JSON.stringify(boxes.map(box=>[box.id,box.center.x,box.center.y,box.center.z,box.half.x,box.half.y,box.half.z,box.solid]));
}
function release(root:THREE.Object3D):void {
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
 root.removeFromParent();root.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});
 for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();root.clear();
}
function material(color:string){return new THREE.MeshStandardMaterial({color,flatShading:true,roughness:.88});}
function cube(parent:THREE.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,color:string){const mesh=new THREE.Mesh<THREE.BoxGeometry,THREE.Material|THREE.Material[]>(new THREE.BoxGeometry(w,h,d),material(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function resident(pose:Pose,progress:number):ResidentVisual {
 const root=new THREE.Group(),avatar=createAvatar();root.name=pose.id;root.userData.regionalResident=true;root.userData.residentName=pose.name;root.add(avatar.root);
 // The existing humanoid/feet/limbs are reused; residents carry a small work tool,
 // never the explorer's glowing staff or an invented cargo resource.
 const cup=new THREE.Group();cup.name='resident-water-cup';cube(cup,0,0,0,.14,.17,.14,'#78bfc4');cube(cup,.09,.02,0,.055,.07,.05,'#cfb17b');avatar.root.getObjectByName('leftHand')!.add(cup);cup.position.set(0,-.025,.05);cup.visible=false;
 const hammer=new THREE.Group();hammer.name='resident-build-hammer';cube(hammer,0,-.03,0,.045,.26,.045,'#b69561');cube(hammer,0,.12,0,.19,.085,.075,'#849791');avatar.root.getObjectByName('rightHand')!.add(hammer);hammer.visible=false;
 root.position.set(pose.position.x,pose.position.y,pose.position.z);
 return {root,avatar,animation:idleAnimation(),last:root.position.clone(),progress,cup,hammer};
}
/** Keep the shared rig's planted soles on the exact regional triangle authority.
 * No constant shelter-height interpolation and no root bobbing above the ground. */
function groundFeet(animation:AnimationState,position:THREE.Vector3,seed:number):AnimationState {
 const support=animation.support;if(!support)return animation;
 const cos=Math.cos(animation.heading),sin=Math.sin(animation.heading);
 for(const foot of [support.leftFoot,support.rightFoot]){
  const worldX=position.x+foot.target.x*cos+foot.target.z*sin,worldZ=position.z-foot.target.x*sin+foot.target.z*cos;
  const lift=foot.planted?0:Math.max(0,foot.target.y-.09);
  foot.target.y=regionalHeight(seed,worldX,worldZ)-position.y+.07+lift;
  if(foot.anchor)foot.anchor.y=regionalHeight(seed,foot.anchor.x,foot.anchor.z)+.07;
 }
 return animation;
}
/** Scalar interpolation follows every corner of the canonical cleared route.
 * It never extrapolates beyond committed route progress, or integrates gameplay. */
export function regionalSupplyDisplayProgress(current:number,target:number,dt:number):number {
 if(!Number.isFinite(current)||!Number.isFinite(target))return Number.isFinite(target)?target:0;
 // Initial mounting starts at the committed pose. A large relocation (restore /
 // reconnect) snaps to another valid route point instead of racing through town.
 if(Math.abs(target-current)>2)return target;
 const step=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0))*1.6;
 return current+Math.sign(target-current)*Math.min(Math.abs(target-current),step);
}
export function regionalSupplyDisplayPose(path:readonly Vec3[],progress:number,backwards=false):{position:Vec3;yaw:number}{
 if(!path.length)return {position:{x:0,y:0,z:0},yaw:0};
 let remaining=Math.max(0,progress);
 for(let i=1;i<path.length;i++){const a=path[i-1]!,b=path[i]!,length=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);if(remaining<=length||i===path.length-1){const t=Math.max(0,Math.min(1,remaining/Math.max(length,.000001)));return {position:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},yaw:Math.atan2((b.x-a.x)*(backwards?-1:1),(b.z-a.z)*(backwards?-1:1))};}remaining-=length;}
 return {position:{...path[0]!},yaw:0};
}
function updateResident(visual:ResidentVisual,pose:Pose,path:readonly Vec3[],targetProgress:number,seed:number,dt:number,tick:number,reducedMotion:boolean){
 const oldProgress=visual.progress;visual.progress=regionalSupplyDisplayProgress(oldProgress,targetProgress,dt);
 const arrived=Math.abs(visual.progress-targetProgress)<.00001,sampled=regionalSupplyDisplayPose(path,visual.progress,visual.progress<oldProgress||pose.activity==='returning');
 const p=sampled.position;visual.root.position.set(p.x,regionalHeight(seed,p.x,p.z),p.z);
 const dx=p.x-visual.last.x,dz=p.z-visual.last.z,distance=Math.hypot(dx,dz),continuous=distance<.8;
 const before=continuous?visual.animation:idleAnimation(),seconds=Math.max(1/120,dt);
 // Positions are sampled along the actual polyline, never a corner-cutting lerp
 // between two endpoints. The exact terrain authority supplies every root/sole.
 let next=stepAnimation(before,continuous?dx/seconds:0,continuous?dz/seconds:0,true,false,false,dt,continuous?distance:0);
 next.heading=arrived?pose.yaw:sampled.yaw;next=groundFeet(stepGroundSupport(before,next,visual.root.position,'none',dt),visual.root.position,seed);visual.animation=next;
 const activity=arrived?pose.activity:pose.activity==='drinking'?'returning':pose.activity==='gathering'?'to-water':pose.activity==='working'?'to-work':pose.activity;
 const work=activity==='working',drinking=activity==='drinking',gathering=activity==='gathering';
 const phase=reducedMotion?.5:(tick*REGIONAL_SUPPLY_STEP/1.8)%1;
 visual.avatar.update(next,work?'repair':gathering?'gather':null,phase);
 const staff=visual.avatar.root.getObjectByName('surveyStaff');if(staff)staff.visible=false;
 visual.hammer.visible=work;visual.cup.visible=drinking||gathering||pose.carrying>0;
 if(drinking){
  // A cup-to-mouth gesture belongs only to actual model drinking at its endpoint.
  const shoulder=visual.avatar.root.getObjectByName('leftShoulder')!,elbow=visual.avatar.root.getObjectByName('leftElbow')!,head=visual.avatar.root.getObjectByName('head')!;
  const sip=reducedMotion?.7:.55+.2*Math.sin(phase*Math.PI*2);
  shoulder.rotation.x=-.85;shoulder.rotation.z=-.12;elbow.rotation.x=-1.3;head.rotation.x=-.08*sip;visual.cup.rotation.x=-.12;
 }else visual.cup.rotation.x=0;
 visual.root.userData.activity=activity;visual.root.userData.modelActivity=pose.activity;visual.root.userData.thirst=pose.thirst;visual.root.userData.modelPosition={...pose.position};visual.root.userData.displayedProgress=visual.progress;visual.root.userData.modelProgress=targetProgress;visual.last.copy(visual.root.position);
}

/** Only active, nearby, collision-confirmed outposts allocate Three resources. */
export function createRegionalSupplyView(seed:number){
 const plan=regionalSupplyPlan(seed),root=new THREE.Group(),outposts=new Map<string,OutpostVisual>();let disposed=false;
 root.name='regional-supply-communities';
 const remove=(id:string)=>{const visual=outposts.get(id);if(visual)release(visual.root);outposts.delete(id);};
 const clear=()=>{for(const id of [...outposts.keys()])remove(id);};
 function project(visual:OutpostVisual,boxes:readonly RegionalBox[],completed:boolean,water:number,capacity:number){
  const signature=`${completed?'complete':'construction'}:${regionalSupplyBoxSignature(boxes)}`;
  if(visual.signature!==signature){release(visual.project);visual.project=new THREE.Group();visual.project.name='regional-project';visual.root.add(visual.project);visual.signature=signature;
   for(const box of boxes){
    // Every solid is a full, exact-sized visible box in both stages. Construction
    // is timber formwork occupying the reserved volume, not invisible collision
    // behind a thin decorative scaffold. Completion changes the surface only.
    const color=completed?(box.material.includes('stone')?'#85998c':'#548d88'):'#b79564';
    const mesh=cube(visual.project,box.center.x,box.center.y,box.center.z,box.half.x*2,box.half.y*2,box.half.z*2,color);
    mesh.name=box.id;mesh.userData.regionalSupplySolid={id:box.id,center:{...box.center},half:{...box.half},solid:box.solid};
    if(completed&&box.half.x>.3&&box.half.z>.3){
     // A different top-face material displays the contained water without adding
     // geometry, changing the collider envelope or hiding a plane inside a box.
     const body=mesh.material as THREE.MeshStandardMaterial,top=material('#557c78');
     mesh.material=[body,body,top,body,body,body];mesh.userData.waterTop=top;
    }
   }
  }
  for(const child of visual.project.children){const top=child.userData.waterTop as THREE.MeshStandardMaterial|undefined;if(top){const fill=clamp01(water/Math.max(.001,capacity));top.color.set(water>.0001?'#8ddbd2':'#557c78');top.roughness=water>.0001?.35:.88;top.userData.fill=fill;}}
  visual.project.userData.stage=completed?'complete':'construction';visual.project.userData.water=water;
 }
 return {root,
  sync(state:RegionalSupplyState|undefined,context:RegionalSupplyViewContext,dt=0,reducedMotion=false){
   if(disposed)return;
   if(!state||state.seed!==seed||context.zone!=='valley'||!finitePoint(context.player)){clear();return;}
   const seconds=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
   const eligible=plan.outposts.filter(p=>{const s=state.outposts.find(o=>o.id===p.id);return !!s&&Math.hypot(p.position.x-context.player.x,p.position.z-context.player.z)<=REGIONAL_SUPPLY_VIEW_DISTANCE&&context.isConfirmed(p.id,s.buildStartedAt!==null);});
   const ids=new Set(eligible.map(p=>p.id));for(const id of outposts.keys())if(!ids.has(id))remove(id);
   if(!eligible.length)return;
   const boxes=regionalSupplyProjectBoxes(seed,state),poses=regionalSupplyActorPoses(seed,state);
   for(const outpost of eligible){const saved=state.outposts.find(s=>s.id===outpost.id)!;let visual=outposts.get(outpost.id);if(!visual){const group=new THREE.Group(),build=new THREE.Group(),beacon=new THREE.Group();group.name=outpost.id;beacon.name='regional-supply-point';beacon.position.set(outpost.deliveryPosition.x,outpost.deliveryPosition.y,outpost.deliveryPosition.z);beacon.userData.interactionPoint=true;const ring=new THREE.Mesh(new THREE.TorusGeometry(.65,.04,4,24),material('#e5c887'));ring.rotation.x=-Math.PI/2;ring.position.y=.045;const glyph=new THREE.Mesh(new THREE.OctahedronGeometry(.13),material('#e5c887'));glyph.position.y=.7;beacon.add(ring,glyph);group.add(build,beacon);root.add(group);visual={root:group,project:build,beacon,residents:new Map(),signature:''};outposts.set(outpost.id,visual);}
    project(visual,boxes.filter(b=>b.id.startsWith(`${outpost.id}/`)),saved.builtAt!==null,saved.water,outpost.capacity);
    const present=new Set<string>();
    for(const pose of poses.filter(p=>p.outpostId===outpost.id).slice(0,outpost.residents.length)){const identity=outpost.residents.find(r=>r.id===pose.id),residentState=saved.residents.find(r=>r.id===pose.id);if(!identity||!residentState||!finitePoint(pose.position)||!Number.isFinite(pose.yaw))continue;present.add(pose.id);let actor=visual.residents.get(pose.id);if(!actor){actor=resident(pose,residentState.routeProgress);visual.root.add(actor.root);visual.residents.set(pose.id,actor);}updateResident(actor,pose,identity.path,residentState.routeProgress,seed,seconds,state.ticks+state.remainder/REGIONAL_SUPPLY_STEP,reducedMotion);}
    for(const [id,actor]of visual.residents)if(!present.has(id)){release(actor.root);visual.residents.delete(id);}
   }
  },clear,
  get count(){return outposts.size;},get residentCount(){return [...outposts.values()].reduce((total,v)=>total+v.residents.size,0);},
  dispose(){if(disposed)return;clear();root.removeFromParent();disposed=true;}
 };
}
