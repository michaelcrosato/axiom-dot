import * as THREE from 'three/webgpu';
import {createAvatar} from './avatar.ts';
import {idleAnimation,stepAnimation,stepGroundSupport,type AnimationState} from './locomotion.ts';
import {regionalHeight} from './regional-world.ts';
import type {Vec3} from './procedural.ts';
import {regionalFoodPlan,regionalFoodActorPoses,REGIONAL_FOOD_STEP,type RegionalFoodState} from './regional-food.ts';

/** All stock, work and clock changes belong to the authoritative food model. */
export const REGIONAL_FOOD_VIEW_DISTANCE=72;
const clamp01=(value:number)=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
const finitePoint=(point:{x:number;y?:number;z:number})=>[point.x,point.y??0,point.z].every(Number.isFinite);
/** Bounded display distance, with no endpoint lerp, extrapolation or catch-up speed. */
export function regionalFoodDisplayProgress(current:number,target:number,dt:number,speed=1.8):number {
 const from=Number.isFinite(current)?Math.max(0,current):0,to=Number.isFinite(target)?Math.max(0,target):from;
 const seconds=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0)),metres=seconds*Math.max(0,Math.min(2,Number.isFinite(speed)?speed:0));
 return from+Math.sign(to-from)*Math.min(Math.abs(to-from),metres);
}
const routeLengths=new WeakMap<readonly Vec3[],Float64Array>();
/** Canonical polyline arc length is shared by loaded and empty road journeys. */
export function regionalFoodDisplayPose(path:readonly Vec3[],progress:number,backwards=false):{position:Vec3;yaw:number} {
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
 root.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.LineSegments){geometries.add(object.geometry);for(const m of Array.isArray(object.material)?object.material:[object.material])materials.add(m);}});
 for(const geometry of geometries)geometry.dispose();for(const m of materials)m.dispose();root.clear();
}
function material(color:string){return new THREE.MeshStandardMaterial({color,flatShading:true,roughness:.88});}
function cube(parent:THREE.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,color:string){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
/** Same world-locked humanoid support as existing regional residents. */
function groundFeet(animation:AnimationState,position:THREE.Vector3,seed:number):AnimationState {
 const support=animation.support;if(!support)return animation;const cos=Math.cos(animation.heading),sin=Math.sin(animation.heading);
 for(const foot of [support.leftFoot,support.rightFoot]){
  const x=position.x+foot.target.x*cos+foot.target.z*sin,z=position.z-foot.target.x*sin+foot.target.z*cos,lift=foot.planted?0:Math.max(0,foot.target.y-.09);
  foot.target.y=regionalHeight(seed,x,z)-position.y+.07+lift;
  if(foot.anchor)foot.anchor.y=regionalHeight(seed,foot.anchor.x,foot.anchor.z)+.07;
 }
 return animation;
}

export interface RegionalFoodViewContext {
 zone:string;
 player:{x:number;z:number};
 /** Both the worker's terrain receipt AND its committed visible mesh must exist.
  * A pending replacement/collider without visible terrain is insufficient. */
 isTerrainConfirmed:(position:{x:number;z:number})=>boolean;
 /** The existing V32 store envelope is committed. Food never draws another store. */
 isStoreConfirmed?:(storeId:string)=>boolean;
}
type Farm=ReturnType<typeof regionalFoodPlan>['farms'][number];
type FarmState=RegionalFoodState['farms'][number];
type Pose=ReturnType<typeof regionalFoodActorPoses>[number];
type Avatar=ReturnType<typeof createAvatar>;
interface ActorVisual {root:THREE.Group;avatar:Avatar;animation:AnimationState;last:THREE.Vector3;distance:number;pathId:string;cargo:THREE.Group;units:THREE.Object3D[];tool:THREE.Group;meal:THREE.Group}
interface FarmVisual {root:THREE.Group;soil:THREE.Mesh;plants:THREE.Group[];source:THREE.Group[];reserved:THREE.Group[];water:THREE.Mesh;pantry:THREE.Group;stored:THREE.Group[]}
function marker(parent:THREE.Group,position:Vec3,name:string,color:string){
 const group=new THREE.Group();group.name=name;group.position.set(position.x,position.y+.025,position.z);group.userData.interactionPoint=true;
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.48,.022,4,20),material(color));ring.rotation.x=-Math.PI/2;const glyph=new THREE.Mesh(new THREE.OctahedronGeometry(.08),material(color));glyph.position.y=.5;group.add(ring,glyph);parent.add(group);return group;
}
/** Reuse the field-garden's five-sided stem, faceted leaf and ripe bulb vocabulary.
 * These are low walkable crop/stock decorations, never new unacknowledged solids. */
function crop(parent:THREE.Group,name:string){
 const group=new THREE.Group();group.name=name;
 const stem=new THREE.Mesh(new THREE.CylinderGeometry(.025,.04,1,5),material('#65a76a'));stem.position.y=.5;
 const leaf=new THREE.Mesh(new THREE.OctahedronGeometry(.23,0),material('#8fba63'));leaf.position.y=.72;leaf.scale.set(.9,.45,.7);
 const fruit=new THREE.Mesh(new THREE.IcosahedronGeometry(.13,0),material('#e3c96e'));fruit.position.y=1;fruit.name='ripe-crop';
 for(const mesh of [stem,leaf,fruit]){mesh.castShadow=true;mesh.receiveShadow=true;}group.add(stem,leaf,fruit);parent.add(group);return group;
}
function foodUnit(parent:THREE.Group,name:string){
 const group=new THREE.Group();group.name=name;const bulb=new THREE.Mesh(new THREE.IcosahedronGeometry(.095,0),material('#e3c96e'));bulb.scale.set(1,.85,1);bulb.castShadow=true;group.add(bulb);parent.add(group);return group;
}
function groundPoint(seed:number,x:number,z:number,offset=.026){return new THREE.Vector3(x,regionalHeight(seed,x,z)+offset,z);}
/** Sample each patch edge before mounting: no crops on an uncommitted neighbor. */
function farmGroundPoints(farm:Farm):{x:number;z:number}[]{return [farm.position,farm.workerPosition,farm.interactionPosition,farm.cisternPosition,...[-1,1].flatMap(x=>[-1,1].map(z=>({x:farm.interactionPosition.x+x*.6,z:farm.interactionPosition.z+z*.6}))),...[-1,1].flatMap(x=>[-1,1].map(z=>({x:farm.position.x+x*1.55,z:farm.position.z+z*1.25})))];}
function makeFarm(seed:number,farm:Farm):FarmVisual {
 const root=new THREE.Group();root.name=farm.id;root.userData.regionalFoodFarm=true;
 const vertices:number[]=[],indices:number[]=[],divisions=4,halfX=1.5,halfZ=1.2;
 for(let z=0;z<=divisions;z++)for(let x=0;x<=divisions;x++){const p=groundPoint(seed,farm.position.x-halfX+x*halfX*2/divisions,farm.position.z-halfZ+z*halfZ*2/divisions);vertices.push(p.x,p.y,p.z);}
 for(let z=0;z<divisions;z++)for(let x=0;x<divisions;x++){const a=z*(divisions+1)+x,b=a+1,c=a+divisions+1,d=c+1;indices.push(a,c,b,b,c,d);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const soil=new THREE.Mesh(geometry,material('#65513d'));soil.name='regional-food-soil';soil.receiveShadow=true;root.add(soil);
 const plants=Array.from({length:4},(_,i)=>{const plant=crop(root,`regional-food-crop-${i}`);plant.position.copy(groundPoint(seed,farm.position.x+(i%2-.5)*.72,farm.position.z+(Math.floor(i/2)-.5)*.72));return plant;});
 const source=Array.from({length:farm.capacity.source},(_,i)=>{const unit=foodUnit(root,`regional-food-source-unit-${i}`);unit.position.copy(groundPoint(seed,farm.position.x-.62+(i%4)*.16,farm.position.z-.67,.08+Math.floor(i/4)*.13));return unit;});
 const reserved=Array.from({length:farm.capacity.cargo},(_,i)=>{const unit=foodUnit(root,`regional-food-reserved-unit-${i}`);unit.position.copy(groundPoint(seed,farm.interactionPosition.x-.25+(i%2)*.18,farm.interactionPosition.z-.3,.08+Math.floor(i/2)*.15));return unit;});
 const water=new THREE.Mesh(new THREE.CircleGeometry(.27,16),material('#86cbd1'));water.rotation.x=-Math.PI/2;water.position.copy(groundPoint(seed,farm.cisternPosition.x,farm.cisternPosition.z));water.name='regional-food-overflow-water';root.add(water);
 // A flat catchment outline cannot masquerade as a second physical tank.
 const outline=new THREE.Mesh(new THREE.TorusGeometry(.29,.014,3,20),material('#879b87'));outline.rotation.x=-Math.PI/2;outline.position.copy(water.position);outline.name='regional-food-cistern-liner';root.add(outline);
 marker(root,{...farm.interactionPosition,y:regionalHeight(seed,farm.interactionPosition.x,farm.interactionPosition.z)},`regional-food-point:${farm.id}`,'#bed788');
 const pantry=new THREE.Group();pantry.name=`regional-food-pantry:${farm.id}`;pantry.userData.existingStoreId=farm.storeId;root.add(pantry);
 marker(pantry,{...farm.storeInteractionPosition,y:regionalHeight(seed,farm.storeInteractionPosition.x,farm.storeInteractionPosition.z)},`regional-food-store-point:${farm.id}`,'#edc785');
 const stored=Array.from({length:farm.capacity.store},(_,i)=>{const unit=foodUnit(pantry,`regional-food-store-unit-${i}`);unit.position.copy(groundPoint(seed,farm.storeInteractionPosition.x-.26+(i%4)*.17,farm.storeInteractionPosition.z-.35,.08+Math.floor(i/4)*.13));return unit;});
 return {root,soil,plants,source,reserved,water,pantry,stored};
}
function updateFarm(visual:FarmVisual,farm:Farm,saved:FarmState,storeConfirmed:boolean){
 const fraction=clamp01(saved.growth/farm.growWork),height=saved.crop==='empty'?0:saved.crop==='ripe'?.78:.08+fraction*.7;
 for(const plant of visual.plants){plant.visible=height>0;plant.scale.set(1,height,1);const fruit=plant.getObjectByName('ripe-crop')!;fruit.visible=saved.crop==='ripe';}
 const units=Math.max(0,Math.min(farm.capacity.source,Math.floor(saved.stock)));
 for(let i=0;i<visual.source.length;i++)visual.source[i]!.visible=i<units;
 for(let i=0;i<visual.reserved.length;i++)visual.reserved[i]!.visible=i<Math.max(0,Math.floor(saved.reserved));
 for(let i=0;i<visual.stored.length;i++)visual.stored[i]!.visible=i<Math.max(0,Math.floor(saved.store));
 const fill=clamp01(saved.water/farm.capacity.water);visual.water.visible=fill>0;visual.water.scale.setScalar(Math.sqrt(fill));visual.water.userData.litres=saved.water;
 (visual.soil.material as THREE.MeshStandardMaterial).color.set('#806445').lerp(new THREE.Color('#3a5144'),fill);
 visual.pantry.visible=storeConfirmed;visual.pantry.userData.stock=saved.store;
 Object.assign(visual.root.userData,{startedAt:saved.startedAt,crop:saved.crop,growth:saved.growth,sourceStock:saved.stock,reserved:saved.reserved,cargo:saved.cargo,storeStock:saved.store,seeds:saved.seeds,water:saved.water,waterCaptured:saved.waterCaptured,waterUsed:saved.waterUsed,harvested:saved.harvested,meals:saved.meals});
}
function makeActor(pose:Pose,farm:Farm):ActorVisual {
 const root=new THREE.Group(),avatar=createAvatar(),cargo=new THREE.Group(),tool=new THREE.Group(),meal=new THREE.Group();root.name=pose.id;root.userData.regionalFoodActor=true;root.userData.actorKind=pose.kind;root.add(avatar.root);
 cargo.name='regional-food-cargo';cargo.position.set(0,.13,-.18);avatar.root.getObjectByName('back')!.add(cargo);
 const units=Array.from({length:farm.capacity.cargo},(_,i)=>{const unit=foodUnit(cargo,`regional-food-cargo-unit-${i}`);unit.position.set((i%2-.5)*.2,Math.floor(i/2)*.19,0);return unit;});
 tool.name='regional-food-hand-tool';cube(tool,0,-.025,0,.035,.28,.035,'#b49360');cube(tool,0,.11,.055,.12,.045,.12,'#8fa28a');avatar.root.getObjectByName('rightHand')!.add(tool);tool.visible=false;
 meal.name='regional-food-carried-meal';foodUnit(meal,'regional-food-meal-unit');meal.position.set(0,-.025,.045);avatar.root.getObjectByName('leftHand')!.add(meal);meal.visible=false;
 root.position.set(pose.position.x,pose.position.y,pose.position.z);
 return {root,avatar,animation:idleAnimation(),last:root.position.clone(),distance:pose.distance,pathId:pose.pathId,cargo,units,tool,meal};
}
function updateActor(visual:ActorVisual,pose:Pose,farm:Farm,saved:FarmState,seed:number,dt:number,clock:number,reducedMotion:boolean){
 const old=visual.distance,isCarrier=pose.kind==='carrier';if(isCarrier)visual.distance=regionalFoodDisplayProgress(old,pose.distance,dt,farm.speed);
 const sampled=isCarrier?regionalFoodDisplayPose(farm.path,visual.distance,visual.distance<old||Math.abs(visual.distance-pose.distance)<1e-5&&pose.direction<0):{position:pose.position,yaw:pose.yaw},p=sampled.position;
 visual.root.position.set(p.x,regionalHeight(seed,p.x,p.z),p.z);
 const dx=visual.root.position.x-visual.last.x,dz=visual.root.position.z-visual.last.z,distance=Math.hypot(dx,dz),seconds=Math.max(1/120,dt),previous=visual.animation;
 let next=stepAnimation(previous,dx/seconds,dz/seconds,true,false,false,dt,distance);next.heading=sampled.yaw;next=groundFeet(stepGroundSupport(previous,next,visual.root.position,'none',dt),visual.root.position,seed);visual.animation=next;
 const arrived=!isCarrier||Math.abs(visual.distance-pose.distance)<1e-5,activity=arrived?pose.activity:pose.direction<0?'returning':'outbound';
 const working=arrived&&pose.kind==='farmer'&&['planting','growing','tending','harvesting','harvest'].includes(activity),transferring=arrived&&['loading','unloading'].includes(activity),phase=reducedMotion?.5:(clock*REGIONAL_FOOD_STEP/1.8)%1;
 visual.avatar.update(next,working||transferring?'gather':null,phase);const staff=visual.avatar.root.getObjectByName('surveyStaff');if(staff)staff.visible=false;visual.tool.visible=working;
 const carrying=isCarrier?Math.max(0,Math.min(farm.capacity.cargo,Math.floor(saved.cargo))):0;
 visual.cargo.visible=carrying>0;for(let i=0;i<visual.units.length;i++)visual.units[i]!.visible=i<carrying;
 // Meals leave pantry stock in the model before appearing in a hand. They never
 // also appear in the loaded freight bundle or create a second resident.
 const mealUnits=isCarrier?saved.returnMeal+saved.carrierMeal:saved.farmerMeal;visual.meal.visible=mealUnits>0;
 if(mealUnits>0&&arrived&&(activity==='eating'||saved.farmerEating&&pose.kind==='farmer')){avatarEat(visual,phase,reducedMotion);}else if(carrying>0){visual.avatar.root.getObjectByName('leftShoulder')!.rotation.x=-.2;visual.avatar.root.getObjectByName('leftElbow')!.rotation.x=-.7;}
 Object.assign(visual.root.userData,{activity,modelActivity:pose.activity,modelPosition:{...pose.position},displayedDistance:visual.distance,modelDistance:pose.distance,cargo:carrying,meal:mealUnits,hunger:pose.hunger,workRate:pose.workRate,workProgress:pose.progress,destinationId:farm.storeId,pathId:pose.pathId});visual.last.copy(visual.root.position);
}
function avatarEat(visual:ActorVisual,phase:number,reducedMotion:boolean){const shoulder=visual.avatar.root.getObjectByName('leftShoulder')!,elbow=visual.avatar.root.getObjectByName('leftElbow')!,head=visual.avatar.root.getObjectByName('head')!;shoulder.rotation.x=-.9;shoulder.rotation.z=-.1;elbow.rotation.x=-1.25;head.rotation.x=reducedMotion?-.04:-.04-.025*Math.sin(phase*Math.PI*2);}
/** At most three walkable crop patches and six shared modular humanoids.
 * Discontinuities remount at accepted authority; they never interpolate through
 * stale terrain, across a leg change, or along an invented shortcut. */
export function createRegionalFoodView(seed:number){
 const plan=regionalFoodPlan(seed),root=new THREE.Group(),farms=new Map<string,FarmVisual>(),actors=new Map<string,ActorVisual>();let disposed=false,lastTick:number|null=null,pausedAtTick:number|null=null;
 root.name='regional-food-farms-and-meals';
 const removeFarm=(id:string)=>{const visual=farms.get(id);if(visual)release(visual.root);farms.delete(id);},removeActor=(id:string)=>{const visual=actors.get(id);if(visual)release(visual.root);actors.delete(id);};
 const clear=()=>{for(const id of [...farms.keys()])removeFarm(id);for(const id of [...actors.keys()])removeActor(id);lastTick=null;pausedAtTick=null;};
 return {root,
  sync(state:RegionalFoodState|undefined,context:RegionalFoodViewContext,dt=0,reducedMotion=false){
   if(disposed)return;if(!state||state.seed!==seed||context.zone!=='valley'||!finitePoint(context.player)){clear();return;}
   const seconds=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0)),near=(point:{x:number;z:number})=>Math.hypot(point.x-context.player.x,point.z-context.player.z)<=REGIONAL_FOOD_VIEW_DISTANCE;
   const discontinuity=lastTick!==null&&(state.ticks<lastTick||state.ticks-lastTick>2/REGIONAL_FOOD_STEP),resume=seconds>0&&pausedAtTick!==null&&state.ticks!==pausedAtTick;
   if(discontinuity||resume||seconds===0&&lastTick!==null&&state.ticks!==lastTick)for(const id of [...actors.keys()])removeActor(id);
   if(seconds===0){if(pausedAtTick===null)pausedAtTick=state.ticks;}else pausedAtTick=null;lastTick=state.ticks;
   const actorGroundConfirmed=(point:{x:number;z:number})=>[point,{x:point.x-.55,z:point.z},{x:point.x+.55,z:point.z},{x:point.x,z:point.z-.55},{x:point.x,z:point.z+.55}].every(context.isTerrainConfirmed);
   const presentFarms=new Set<string>(),presentActors=new Set<string>(),storeConfirmed=(farm:Farm)=>!!context.isStoreConfirmed?.(farm.storeId)&&context.isTerrainConfirmed(farm.storeInteractionPosition);
   for(const farm of plan.farms){const saved=state.farms.find(f=>f.id===farm.id);if(!saved||!near(farm.position)||!farmGroundPoints(farm).every(context.isTerrainConfirmed))continue;presentFarms.add(farm.id);let visual=farms.get(farm.id);if(!visual){visual=makeFarm(seed,farm);farms.set(farm.id,visual);root.add(visual.root);}updateFarm(visual,farm,saved,storeConfirmed(farm));}
   for(const id of [...farms.keys()])if(!presentFarms.has(id))removeFarm(id);
   for(const pose of regionalFoodActorPoses(seed,state)){
    const farm=plan.farms.find(f=>f.id===pose.farmId),saved=state.farms.find(f=>f.id===pose.farmId);if(!farm||!saved||!finitePoint(pose.position)||!Number.isFinite(pose.yaw)||!near(pose.position)||!actorGroundConfirmed(pose.position))continue;
    if(pose.kind==='farmer'&&!presentFarms.has(farm.id))continue;
    if(pose.kind==='carrier'&&Math.hypot(pose.position.x-farm.storeInteractionPosition.x,pose.position.z-farm.storeInteractionPosition.z)<1.2&&!storeConfirmed(farm))continue;
    let visual=actors.get(pose.id);if(visual&&visual.pathId!==pose.pathId){removeActor(pose.id);visual=undefined;}
    if(!visual){visual=makeActor(pose,farm);actors.set(pose.id,visual);root.add(visual.root);}
    const preview=pose.kind==='carrier'?regionalFoodDisplayPose(farm.path,regionalFoodDisplayProgress(visual.distance,pose.distance,seconds,farm.speed),pose.direction<0).position:pose.position;
    if(!near(preview)||!actorGroundConfirmed(preview)){removeActor(pose.id);continue;}
    presentActors.add(pose.id);updateActor(visual,pose,farm,saved,seed,seconds,state.ticks+state.remainder/REGIONAL_FOOD_STEP,reducedMotion);
   }
   for(const id of [...actors.keys()])if(!presentActors.has(id))removeActor(id);
  },clear,get count(){return farms.size;},get actorCount(){return actors.size;},get carrierCount(){return [...actors.values()].filter(a=>a.root.userData.actorKind==='carrier').length;},
  dispose(){if(disposed)return;clear();root.removeFromParent();disposed=true;}
 };
}
