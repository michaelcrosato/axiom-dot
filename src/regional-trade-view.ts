import * as THREE from 'three/webgpu';
import {createAvatar} from './avatar.ts';
import {idleAnimation,stepAnimation,stepGroundSupport,type AnimationState} from './locomotion.ts';
import {regionalHeight,type RegionalBox} from './regional-world.ts';
import type {Vec3} from './procedural.ts';
import {regionalTradePlan,regionalTradeActorPoses,regionalTradeSiteBoxes,regionalTradeTargetSignature,REGIONAL_TRADE_STEP,type RegionalTradeState,type RegionalTradeActorPose,type RegionalTradeRoutePlan} from './regional-trade.ts';

/** Presentation is a bounded projection of committed trade state, never a clock or ledger. */
export const REGIONAL_TRADE_VIEW_DISTANCE=72;
const finitePoint=(point:{x:number;y?:number;z:number})=>[point.x,point.y??0,point.z].every(Number.isFinite);
const clamp01=(value:number)=>Math.max(0,Math.min(1,value));
/** Exactly the physical descriptor, including material-independent collision shape. */
export function regionalTradeBoxSignature(boxes:readonly RegionalBox[]):string {
 return JSON.stringify(boxes.map(box=>[box.id,box.center.x,box.center.y,box.center.z,box.half.x,box.half.y,box.half.z,box.solid]));
}
/** Scalar progress never races to catch up, snaps, extrapolates, or cuts corners.
 * A newly mounted visual starts at committed progress; mounted visuals are capped
 * at the same walking speed even after a delayed authoritative snapshot. */
export function regionalTradeDisplayProgress(current:number,target:number,dt:number,speed=1.8):number {
 const from=Number.isFinite(current)?Math.max(0,current):0,to=Number.isFinite(target)?Math.max(0,target):from;
 const seconds=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0)),metres=seconds*Math.max(0,Math.min(2,Number.isFinite(speed)?speed:0));
 return from+Math.sign(to-from)*Math.min(Math.abs(to-from),metres);
}
/** Immutable canonical roads keep one weakly-held cumulative-distance index. */
const routeLengths=new WeakMap<readonly Vec3[],Float64Array>();
/** Sample canonical road arc length, clamped to the last committed route point. */
export function regionalTradeDisplayPose(path:readonly Vec3[],progress:number,backwards=false):{position:Vec3;yaw:number} {
 if(!path.length)return {position:{x:0,y:0,z:0},yaw:0};
 if(path.length===1)return {position:{...path[0]!},yaw:0};
 let lengths=routeLengths.get(path);if(!lengths){lengths=new Float64Array(path.length);for(let i=1;i<path.length;i++){const a=path[i-1]!,b=path[i]!;lengths[i]=lengths[i-1]!+Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);}routeLengths.set(path,lengths);}
 const distance=Math.max(0,Math.min(lengths.at(-1)!,Number.isFinite(progress)?progress:0));let lo=1,hi=path.length-1;
 while(lo<hi){const mid=(lo+hi)>>1;if(lengths[mid]!<distance)lo=mid+1;else hi=mid;}
 while(lo<path.length-1&&lengths[lo]===lengths[lo-1])lo++;
 const a=path[lo-1]!,b=path[lo]!,length=lengths[lo]!-lengths[lo-1]!;
 if(length<1e-9)return {position:{...b},yaw:0};
 const t=clamp01((distance-lengths[lo-1]!)/length),direction=backwards?-1:1;
 return {position:{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},yaw:Math.atan2((b.x-a.x)*direction,(b.z-a.z)*direction)};
}
function release(root:THREE.Object3D):void {
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();root.removeFromParent();
 root.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.LineSegments){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});
 for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();root.clear();
}
function material(color:string){return new THREE.MeshStandardMaterial({color,flatShading:true,roughness:.88});}
function cube(parent:THREE.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,color:string){const mesh=new THREE.Mesh<THREE.BoxGeometry,THREE.Material|THREE.Material[]>(new THREE.BoxGeometry(w,h,d),material(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
/** Shared rig support anchors remain on the exact regional surface under each sole. */
function groundFeet(animation:AnimationState,position:THREE.Vector3,seed:number):AnimationState {
 const support=animation.support;if(!support)return animation;const cos=Math.cos(animation.heading),sin=Math.sin(animation.heading);
 for(const foot of [support.leftFoot,support.rightFoot]){
  const worldX=position.x+foot.target.x*cos+foot.target.z*sin,worldZ=position.z-foot.target.x*sin+foot.target.z*cos,lift=foot.planted?0:Math.max(0,foot.target.y-.09);
  foot.target.y=regionalHeight(seed,worldX,worldZ)-position.y+.07+lift;
  if(foot.anchor)foot.anchor.y=regionalHeight(seed,foot.anchor.x,foot.anchor.z)+.07;
 }
 return animation;
}

export interface RegionalTradeViewContext {
 zone:string;
 player:{x:number;z:number};
 /** Exact target solid envelope, acknowledged by the physics worker, not merely requested. */
 isConfirmed:(targetId:string,signature:string)=>boolean;
 /** Independent ground receipt: freight can be far from either endpoint. */
 isTerrainConfirmed:(position:{x:number;z:number})=>boolean;
}
type Avatar=ReturnType<typeof createAvatar>;
interface ActorVisual {root:THREE.Group;avatar:Avatar;animation:AnimationState;last:THREE.Vector3;distance:number;travelSpeed:number;cargo:THREE.Group;units:THREE.Object3D[];tool:THREE.Group}
interface TargetVisual {root:THREE.Group;geometry:THREE.Group;signature:string;kind:'resource'|'project'|'repair'}
interface Target {id:string;position:Vec3;interactionPosition:Vec3;kind:TargetVisual['kind'];routeId:string}
function marker(root:THREE.Group,position:Vec3,color:string,name:string){
 const group=new THREE.Group();group.name=name;group.position.set(position.x,position.y+.025,position.z);group.userData.interactionPoint=true;
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.52,.028,4,20),material(color));ring.rotation.x=-Math.PI/2;const glyph=new THREE.Mesh(new THREE.OctahedronGeometry(.1),material(color));glyph.position.y=.55;group.add(ring,glyph);root.add(group);return group;
}
function outline(parent:THREE.Group,box:RegionalBox,color:string){
 const y=box.center.y-box.half.y+.018,x=box.center.x,z=box.center.z,hx=box.half.x,hz=box.half.z,geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([x-hx,y,z-hz,x+hx,y,z-hz,x+hx,y,z-hz,x+hx,y,z+hz,x+hx,y,z+hz,x-hx,y,z+hz,x-hx,y,z+hz,x-hx,y,z-hz],3));
 const lines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color}));lines.name=box.id;lines.userData.regionalTradeBlueprint=true;parent.add(lines);
}
function actor(pose:RegionalTradeActorPose,distance:number):ActorVisual {
 const root=new THREE.Group(),avatar=createAvatar(),cargo=new THREE.Group(),tool=new THREE.Group();root.name=pose.id;root.userData.regionalTradeActor=true;root.userData.actorKind=pose.kind;root.add(avatar.root);
 cargo.name='regional-freight-cargo';cargo.position.set(0,.11,-.025);avatar.root.getObjectByName('back')!.add(cargo);
 // Every displayed bundle corresponds to one actual ledger unit. Timber and
 // quarry stone have different shapes as well as different colors.
 const units:THREE.Object3D[]=[];
 for(let i=0;i<4;i++){
  const x=(i%2-.5)*.25,y=Math.floor(i/2)*.22,unit=new THREE.Group();unit.name=`freight-unit-${i+1}`;unit.userData.material=pose.material;
  if(pose.material==='deadwood-timber'){
   cube(unit,0,0,0,.215,.15,.43,'#b99a67');cube(unit,0,.08,0,.22,.015,.06,'#526d5d');
  }else cube(unit,0,0,0,.215,.19,.22,'#a3aaa0');
  unit.position.set(x,y,-.16);cargo.add(unit);units.push(unit);
 }
 cargo.visible=false;tool.name='regional-work-tool';avatar.root.getObjectByName('rightHand')!.add(tool);cube(tool,0,-.015,0,.045,.33,.045,'#b49360');
 cube(tool,0,.15,0,pose.kind==='repairer'?.16:.23,pose.kind==='repairer'?.17:.075,.07,pose.material==='quarry-stone'?'#9eafa7':'#769082');tool.visible=false;
 root.position.set(pose.position.x,pose.position.y,pose.position.z);
 return {root,avatar,animation:idleAnimation(),last:root.position.clone(),distance,travelSpeed:pose.speed,cargo,units,tool};
}
function updateActor(visual:ActorVisual,pose:RegionalTradeActorPose,route:RegionalTradeRoutePlan,modelDistance:number,seed:number,dt:number,clock:number,reducedMotion:boolean):void {
 const beforeDistance=visual.distance,isCarrier=pose.kind==='carrier';
 if(isCarrier)visual.distance=regionalTradeDisplayProgress(visual.distance,modelDistance,dt,visual.travelSpeed);
 const returning=pose.activity==='returning',sampled=isCarrier?regionalTradeDisplayPose(route.points,visual.distance,visual.distance<beforeDistance||returning):{position:pose.position,yaw:pose.yaw};
 const p=sampled.position;visual.root.position.set(p.x,regionalHeight(seed,p.x,p.z),p.z);
 const dx=visual.root.position.x-visual.last.x,dz=visual.root.position.z-visual.last.z,distance=Math.hypot(dx,dz),seconds=Math.max(1/120,dt),previous=visual.animation;
 let next=stepAnimation(previous,dx/seconds,dz/seconds,true,false,false,dt,distance);next.heading=sampled.yaw;
 next=groundFeet(stepGroundSupport(previous,next,visual.root.position,'none',dt),visual.root.position,seed);visual.animation=next;
 const atAuthority=!isCarrier||Math.abs(visual.distance-modelDistance)<1e-5;
 const working=pose.kind==='producer'&&['extracting','producing','working'].includes(pose.activity),repairing=pose.kind==='repairer'&&['repairing','working'].includes(pose.activity),building=pose.kind==='builder'&&['building','working'].includes(pose.activity);
 const phase=reducedMotion?.5:(clock*REGIONAL_TRADE_STEP/1.8)%1;visual.avatar.update(next,working?'gather':repairing||building?'repair':null,phase);
 const staff=visual.avatar.root.getObjectByName('surveyStaff');if(staff)staff.visible=false;visual.tool.visible=working||repairing||building;
 const carrying=isCarrier?Math.max(0,Math.min(route.cargoCapacity,Math.floor(pose.carrying))):0;visual.cargo.visible=carrying>0;for(let i=0;i<visual.units.length;i++)visual.units[i]!.visible=i<carrying;
 if(carrying>0){const shoulder=visual.avatar.root.getObjectByName('leftShoulder')!,elbow=visual.avatar.root.getObjectByName('leftElbow')!;shoulder.rotation.x=-.2;elbow.rotation.x=-.7;}
 visual.root.userData.activity=atAuthority?pose.activity:visual.distance<beforeDistance?'returning':'outbound';visual.root.userData.modelActivity=pose.activity;visual.root.userData.modelPosition={...pose.position};visual.root.userData.displayedDistance=visual.distance;visual.root.userData.modelDistance=modelDistance;visual.root.userData.modelSpeed=pose.speed;visual.root.userData.cargo=carrying;visual.root.userData.destinationId=route.projectId;visual.root.userData.material=pose.material;visual.root.userData.workProgress=pose.progress;visual.last.copy(visual.root.position);
}
/** Only nearby, ground-confirmed resources/crews/carriers allocate Three objects. */
export function createRegionalTradeView(seed:number){
 const plan=regionalTradePlan(seed),root=new THREE.Group(),targets=new Map<string,TargetVisual>(),actors=new Map<string,ActorVisual>();let disposed=false,lastAuthorityTick:number|null=null,pausedAtTick:number|null=null,topology='',boxes:readonly RegionalBox[]=[],signatures=new Map<string,string>();
 root.name='regional-trade-resources-and-freight';
 const definitions:Target[]=plan.routes.flatMap(route=>{const source=plan.sources.find(s=>s.id===route.sourceId)!,project=plan.projects.find(p=>p.id===route.projectId)!;return [{id:source.id,position:source.position,interactionPosition:source.interactionPosition,kind:'resource' as const,routeId:route.id},{id:project.id,position:project.position,interactionPosition:project.interactionPosition,kind:'project' as const,routeId:route.id},{id:route.obstruction.id,position:route.obstruction.position,interactionPosition:route.obstruction.interactionPosition,kind:'repair' as const,routeId:route.id}];});
 const removeTarget=(id:string)=>{const visual=targets.get(id);if(visual)release(visual.root);targets.delete(id);},removeActor=(id:string)=>{const visual=actors.get(id);if(visual)release(visual.root);actors.delete(id);};
 const clear=()=>{for(const id of [...targets.keys()])removeTarget(id);for(const id of [...actors.keys()])removeActor(id);};
 return {root,
  sync(state:RegionalTradeState|undefined,context:RegionalTradeViewContext,dt=0,reducedMotion=false){
   if(disposed)return;if(!state||state.seed!==seed||context.zone!=='valley'||!finitePoint(context.player)){clear();return;}
   const seconds=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0)),near=(p:{x:number;z:number})=>Math.hypot(p.x-context.player.x,p.z-context.player.z)<=REGIONAL_TRADE_VIEW_DISTANCE;
   // Menus may pause solo presentation, but an online room can keep advancing.
   // After hidden/reconnect gaps, rebuild the render-only projection at the
   // accepted pose rather than accelerate cargo or preserve an unbounded lag.
   const discontinuity=lastAuthorityTick!==null&&Math.abs(state.ticks-lastAuthorityTick)>2/REGIONAL_TRADE_STEP;
   if(discontinuity||seconds>0&&pausedAtTick!==null&&state.ticks!==pausedAtTick)for(const [id,visual] of actors)if(visual.root.userData.actorKind==='carrier')removeActor(id);
   if(seconds===0){if(pausedAtTick===null)pausedAtTick=state.ticks;}else pausedAtTick=null;
   lastAuthorityTick=state.ticks;
   const nextTopology=state.routes.map(r=>`${r.id}:${r.sourceStartedAt}:${r.buildStartedAt}:${r.builtAt}:${r.clearedAt}`).join('|');if(nextTopology!==topology){boxes=regionalTradeSiteBoxes(seed,state);signatures=new Map(definitions.map(target=>[target.id,regionalTradeTargetSignature(seed,state,target.id)]));topology=nextTopology;}
   const confirmed=(id:string)=>{const signature=signatures.get(id);return signature!==undefined&&(signature===''||context.isConfirmed(id,signature));};
   const eligible=definitions.filter(target=>near(target.position)&&context.isTerrainConfirmed(target.position)&&confirmed(target.id)),presentTargets=new Set(eligible.map(t=>t.id));
   for(const id of [...targets.keys()])if(!presentTargets.has(id))removeTarget(id);
   for(const target of eligible){
    const saved=state.routes.find(r=>r.id===target.routeId)!;let visual=targets.get(target.id);if(!visual){const group=new THREE.Group(),geometry=new THREE.Group();group.name=target.id;group.userData.regionalTradeTarget=target.id;group.add(geometry);marker(group,target.interactionPosition,target.kind==='resource'?'#dab372':target.kind==='project'?'#8dc4b7':'#dd946c',`regional-trade-point:${target.id}`);root.add(group);visual={root:group,geometry,signature:'',kind:target.kind};targets.set(target.id,visual);}
    const local=boxes.filter(b=>b.id.startsWith(`${target.id}/`)),complete=target.kind==='project'&&saved.builtAt!==null,signature=`${regionalTradeBoxSignature(local)}:${complete}`;
    if(visual.signature!==signature){release(visual.geometry);visual.geometry=new THREE.Group();visual.geometry.name='regional-trade-physical-geometry';visual.root.add(visual.geometry);visual.signature=signature;
     for(const box of local){
      if(!box.solid){if(target.kind==='repair'){
        // Walkable ground scuffs indicate load-unsafe footing; there is no
        // deceptive solid cart or boulder which the player walks through.
        const mesh=cube(visual.geometry,box.center.x,regionalHeight(seed,box.center.x,box.center.z)+.012,box.center.z,box.half.x*2,.018,box.half.z*2,'#776c57');mesh.name=box.id;mesh.userData.regionalTradeRoadCondition=true;
       }else outline(visual.geometry,box,target.kind==='project'?'#99c5ac':'#d4b878');continue;}
      const color=target.kind==='project'?complete?'#6e9689':'#b9925f':box.material.includes('stone')?'#9ba99c':box.material.includes('timber')?'#a78961':'#687c65';
      const mesh=cube(visual.geometry,box.center.x,box.center.y,box.center.z,box.half.x*2,box.half.y*2,box.half.z*2,color);mesh.name=box.id;mesh.userData.regionalTradeSolid={id:box.id,center:{...box.center},half:{...box.half},solid:box.solid};
      if((target.kind==='resource'||target.kind==='project'&&complete)&&/stock|bin|store/.test(box.id)){const body=mesh.material as THREE.Material,top=material('#546456');mesh.material=[body,body,top,body,body,body];mesh.userData.stockTop=top;mesh.userData.stockOrigin=target.kind;}
     }
    }
    visual.root.userData.stage=target.kind==='resource'?saved.sourceStartedAt===null?'planned':saved.remaining>0?'extraction':'exhausted':target.kind==='project'?complete?'complete':saved.buildStartedAt===null?'planned':'construction':saved.clearedAt!==null?'repaired':saved.repairStartedAt!==null?'repairing':'blocked';visual.root.userData.stock=saved.stock;visual.root.userData.reserved=saved.reserved;visual.root.userData.remaining=saved.remaining;visual.root.userData.destinationStock=saved.destinationStock;visual.root.userData.embodied=saved.embodied;visual.root.userData.withdrawn=saved.withdrawn;
    visual.geometry.traverse(object=>{const top=object.userData.stockTop as THREE.MeshStandardMaterial|undefined;if(top){const units=object.userData.stockOrigin==='project'?saved.destinationStock:saved.stock,capacity=object.userData.stockOrigin==='project'?12:8;top.color.set('#546456').lerp(new THREE.Color(object.userData.stockOrigin==='project'?'#8ecea4':'#d4bb79'),clamp01(units/capacity));top.userData.stock=units;top.userData.reserved=object.userData.stockOrigin==='resource'?saved.reserved:0;}});
   }
   const poses=regionalTradeActorPoses(seed,state),presentActors=new Set<string>();
   for(const pose of poses){
    if(!finitePoint(pose.position)||!Number.isFinite(pose.yaw)||!near(pose.position)||!context.isTerrainConfirmed(pose.position))continue;
    const route=plan.routes.find(r=>r.id===pose.routeId),saved=state.routes.find(r=>r.id===pose.routeId);if(!route||!saved)continue;
    const targetId=pose.kind==='producer'?route.sourceId:pose.kind==='builder'?route.projectId:pose.kind==='repairer'?route.obstruction.id:null;if(targetId&&!confirmed(targetId))continue;
    if(pose.kind==='carrier'&&definitions.some(target=>target.routeId===route.id&&target.kind!=='repair'&&Math.hypot(target.position.x-pose.position.x,target.position.z-pose.position.z)<9&&!confirmed(target.id)))continue;
    let visual=actors.get(pose.id);if(!visual){visual=actor(pose,pose.distance);root.add(visual.root);actors.set(pose.id,visual);}
    // The model owns weather-boundary changes. Retain the last moving rate only
    // while settling a visual into an already committed stop; zero pose speed
    // must not strand a lagging carrier before its repair or unloading point.
    if(pose.kind==='carrier'&&pose.speed>0)visual.travelSpeed=pose.speed;
    // Do not show a smoothed point over pending ground when the authoritative
    // endpoint is in a newly confirmed neighboring chunk.
    const preview=pose.kind==='carrier'?regionalTradeDisplayPose(route.points,regionalTradeDisplayProgress(visual.distance,saved.distance,seconds,visual.travelSpeed)).position:pose.position;
    if(!context.isTerrainConfirmed(preview)){removeActor(pose.id);continue;}
    presentActors.add(pose.id);updateActor(visual,pose,route,pose.distance,seed,seconds,state.ticks+state.remainder/REGIONAL_TRADE_STEP,reducedMotion);
   }
   for(const id of [...actors.keys()])if(!presentActors.has(id))removeActor(id);
  },clear,
  get count(){return targets.size;},get actorCount(){return actors.size;},get carrierCount(){return [...actors.values()].filter(actor=>actor.root.userData.actorKind==='carrier').length;},
  dispose(){if(disposed)return;clear();root.removeFromParent();disposed=true;}
 };
}
