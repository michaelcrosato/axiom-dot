import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {createRegionalSupplyView,regionalSupplyBoxSignature,regionalSupplyDisplayProgress,regionalSupplyDisplayPose,REGIONAL_SUPPLY_VIEW_DISTANCE} from '../src/regional-supply-view.ts';
import {createRegionalSupply,advanceRegionalSupply,applyRegionalSupplyCommand,regionalSupplyLocalSources,regionalSupplyConstructionBoxes,regionalSupplyPlan,regionalSupplyProjectBoxes,regionalSupplyActorPoses,type RegionalSupplyState} from '../src/regional-supply.ts';
import {regionalHeight} from '../src/regional-world.ts';

const seed=73129;
function fresh():RegionalSupplyState {return structuredClone(createRegionalSupply(seed));}
function objects(root:THREE.Object3D){const result:THREE.Object3D[]=[];root.traverse(object=>result.push(object));return result;}
function finite(root:THREE.Object3D){root.updateMatrixWorld(true);root.traverse(object=>assert.ok([...object.position.toArray(),...object.rotation.toArray().slice(0,3),...object.scale.toArray(),...object.matrixWorld.elements].every(Number.isFinite),object.name));}

test('nearby confirmed outposts alone allocate residents; unload and dispose release every resource once',()=>{
 const state=fresh(),view=createRegionalSupplyView(seed),plan=regionalSupplyPlan(seed),site=plan.outposts[0]!,context={zone:'valley',player:site.position,isConfirmed:()=>false};
 const before=JSON.stringify(state);view.sync(state,context);assert.equal(view.count,0);view.sync(state,{...context,isConfirmed:()=>true});assert.equal(view.count,1);assert.equal(view.residentCount,site.residents.length);const beacon=view.root.getObjectByName('regional-supply-point')!;assert.deepEqual(beacon.position.toArray(),[site.deliveryPosition.x,site.deliveryPosition.y,site.deliveryPosition.z]);assert.equal(beacon.userData.interactionPoint,true);finite(view.root);assert.equal(JSON.stringify(state),before);
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();for(const object of objects(view.root))if(object instanceof THREE.Mesh){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}
 let disposedGeometries=0,disposedMaterials=0;for(const geometry of geometries)geometry.addEventListener('dispose',()=>disposedGeometries++);for(const material of materials)material.addEventListener('dispose',()=>disposedMaterials++);
 view.sync(state,{...context,player:{x:site.position.x+REGIONAL_SUPPLY_VIEW_DISTANCE+2,z:site.position.z},isConfirmed:()=>true});assert.equal(view.count,0);assert.equal(view.residentCount,0);assert.equal(disposedGeometries,geometries.size);assert.equal(disposedMaterials,materials.size);
 view.sync(state,{...context,isConfirmed:()=>true});assert.equal(view.count,1);view.sync(state,{...context,zone:'cave',isConfirmed:()=>true});assert.equal(view.count,0);
 view.sync(state,{...context,isConfirmed:()=>true});view.dispose();view.dispose();view.sync(state,{...context,isConfirmed:()=>true});assert.equal(view.count,0);assert.equal(view.root.children.length,0);
});

test('construction and completion copy exact acknowledged solids and never materialize a pending footprint',()=>{
 const state=fresh(),site=regionalSupplyPlan(seed).outposts[0]!,saved=state.outposts[0]!,view=createRegionalSupplyView(seed);let ackStarted=false;
 const context={zone:'valley',player:site.position,isConfirmed:(_id:string,started:boolean)=>started===ackStarted};
 view.sync(state,context);assert.equal(objects(view.root).filter(o=>o.userData.regionalSupplySolid).length,0);saved.delivered={...site.cost};saved.buildStartedAt=0;
 view.sync(state,context);assert.equal(view.count,0,'unacknowledged project also gates residents at its site');ackStarted=true;view.sync(state,context);
 const check=()=>{const boxes=regionalSupplyProjectBoxes(seed,state).filter(b=>b.id.startsWith(`${site.id}/`)),solids=objects(view.root).filter(o=>o.userData.regionalSupplySolid) as THREE.Mesh[];assert.ok(boxes.length>0);assert.equal(solids.length,boxes.length);for(const box of boxes){const mesh=solids.find(mesh=>mesh.name===box.id)!;assert.deepEqual(mesh.position.toArray(),[box.center.x,box.center.y,box.center.z]);const geometry=mesh.geometry as THREE.BoxGeometry;assert.equal(geometry.parameters.width,box.half.x*2);assert.equal(geometry.parameters.height,box.half.y*2);assert.equal(geometry.parameters.depth,box.half.z*2);assert.deepEqual(mesh.userData.regionalSupplySolid,{id:box.id,center:box.center,half:box.half,solid:box.solid});}return regionalSupplyBoxSignature(boxes);};
 const during=check();assert.equal(view.root.getObjectByName('regional-project')!.userData.stage,'construction');saved.builtAt=1;saved.water=4;saved.captured=4;view.sync(state,context);assert.equal(check(),during,'completion changes the skin inside the existing collision envelope');assert.equal(view.root.getObjectByName('regional-project')!.userData.stage,'complete');finite(view.root);view.dispose();
});

test('resident roots follow committed paths and exact terrain, with physical work and drinking state only',()=>{
 const state=fresh(),site=regionalSupplyPlan(seed).outposts[0]!,saved=state.outposts[0]!,view=createRegionalSupplyView(seed),context={zone:'valley',player:site.position,isConfirmed:()=>true};
 saved.delivered={...site.cost};saved.buildStartedAt=0;
 for(const activity of ['waiting','to-work','working','to-water','gathering','returning','drinking'] as const){
  saved.residents[0]!.activity=activity;saved.residents[0]!.routeProgress=activity==='to-work'||activity==='to-water'||activity==='returning'?.4:0;saved.residents[0]!.carrying=activity==='returning'||activity==='drinking'?.5:0;state.ticks+=4;
  for(const dt of [0,1/60,.1,NaN,60]){view.sync(state,context,dt);finite(view.root);const poses=regionalSupplyActorPoses(seed,state).filter(p=>p.outpostId===site.id);for(const pose of poses){const actor=view.root.getObjectByName(pose.id)!;const identity=site.residents.find(r=>r.id===pose.id)!,displayed=regionalSupplyDisplayPose(identity.path,actor.userData.displayedProgress);assert.equal(actor.position.x,displayed.position.x);assert.equal(actor.position.z,displayed.position.z);assert.equal(actor.position.y,regionalHeight(seed,actor.position.x,actor.position.z));assert.equal(actor.userData.modelActivity,pose.activity);assert.equal(actor.getObjectByName('surveyStaff')!.visible,false);assert.equal(actor.getObjectByName('resident-build-hammer')!.visible,actor.userData.activity==='working');assert.equal(actor.getObjectByName('resident-water-cup')!.visible,actor.userData.activity==='drinking'||actor.userData.activity==='gathering'||pose.carrying>0);}}
 }
 view.sync(state,context,1/60,true);finite(view.root);assert.equal(view.residentCount,site.residents.length);view.dispose();
});

test('travelling through every site keeps population bounded and the render never rewrites a snapshot',()=>{
 const state=fresh(),view=createRegionalSupplyView(seed),plan=regionalSupplyPlan(seed),before=JSON.stringify(state);
 for(let round=0;round<3;round++)for(const site of plan.outposts){view.sync(state,{zone:'valley',player:site.position,isConfirmed:()=>true},1/60);assert.equal(view.count,1);assert.equal(view.residentCount,site.residents.length);assert.equal(view.root.children.length,1);finite(view.root);}
 assert.equal(JSON.stringify(state),before);view.sync({...state,seed:12},{zone:'valley',player:plan.outposts[0]!.position,isConfirmed:()=>true});assert.equal(view.count,0);view.dispose();
});


test('real conserved delivery drives visible construction, water collection and resident drinking',()=>{
 const site=regionalSupplyPlan(seed).outposts[0]!,sources=regionalSupplyLocalSources(seed,site.id),wood=sources.wood.slice(0,site.cost.wood),stone=sources.stone.slice(0,site.cost.stone),wilderness={version:1 as const,generation:2 as const,seed,harvested:[...wood,...stone],wood:wood.length,stone:stone.length};
 assert.equal(wood.length,site.cost.wood);assert.equal(stone.length,site.cost.stone);let state=createRegionalSupply(seed);
 const context={generation:2 as const,seed,regional:{version:1 as const},zone:'valley',player:{...site.deliveryPosition,hp:100},wilderness};
 state=applyRegionalSupplyCommand(state,context,{type:'deliver',outpostId:site.id,expectedRevision:state.revision}).state;state=applyRegionalSupplyCommand(state,context,{type:'build',outpostId:site.id,expectedRevision:state.revision}).state;assert.notEqual(state.outposts[0]!.buildStartedAt,null);
 const view=createRegionalSupplyView(seed),seen=new Set<string>(),viewContext={zone:'valley',player:site.position,isConfirmed:()=>true};let completed=false;
 for(let tick=0;tick<1400;tick++){
  state=advanceRegionalSupply(state,.25);for(let frame=0;frame<15;frame++)view.sync(state,viewContext,1/60);const saved=state.outposts[0]!;for(const resident of saved.residents){seen.add(resident.activity);const actor=view.root.getObjectByName(resident.id)!;assert.equal(actor.userData.modelActivity,resident.activity);const feet=['leftAnkle','rightAnkle'].map(name=>actor.getObjectByName(name)!);actor.updateWorldMatrix(true,true);for(const foot of feet){const boot=foot.children[0] as THREE.Mesh,bounds=new THREE.Box3().setFromObject(boot),center=foot.getWorldPosition(new THREE.Vector3());assert.ok(bounds.min.y>=regionalHeight(seed,center.x,center.z)-.006,`boot penetrated exact terrain by ${bounds.min.y-regionalHeight(seed,center.x,center.z)}`);}}
  if(saved.consumed>=2&&seen.has('gathering')&&seen.has('drinking')){completed=true;assert.ok(saved.captured>=saved.consumed);assert.equal(view.root.getObjectByName('regional-project')!.userData.stage,'complete');break;}
 }
 assert.equal(completed,true);for(const activity of ['to-work','working','gathering','returning','drinking'])assert.ok(seen.has(activity),activity);view.dispose();
});


test('display interpolation samples each polyline corner and never overshoots authoritative progress',()=>{
 for(const site of regionalSupplyPlan(seed).outposts)for(const resident of site.residents){
  const path=resident.path,total=path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-path[i]!.x,p.y-path[i]!.y,p.z-path[i]!.z),0);let current=0;
  for(let frame=0;frame<400;frame++){
   const target=Math.min(total,Math.floor(frame/15)*.4),previous=current;current=regionalSupplyDisplayProgress(current,target,1/60);assert.ok(current<=target+1e-10);assert.ok(current>=previous-1e-10);assert.ok(current-previous<=1.6/60+1e-9);
   const pose=regionalSupplyDisplayPose(path,current);let nearest=Infinity;for(let i=1;i<path.length;i++){const a=path[i-1]!,b=path[i]!,dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((pose.position.x-a.x)*dx+(pose.position.z-a.z)*dz)/(dx*dx+dz*dz)));nearest=Math.min(nearest,Math.hypot(pose.position.x-a.x-t*dx,pose.position.z-a.z-t*dz));}assert.ok(nearest<1e-8,'every display point lies on a canonical route segment');
   const tank={x:site.storagePosition.x,z:site.storagePosition.z,hx:.75,hz:.75};assert.ok(Math.abs(pose.position.x-tank.x)>=tank.hx+.55||Math.abs(pose.position.z-tank.z)>=tank.hz+.55,'body clearance from storage');
   const bench={x:site.position.x-2,z:site.position.z-2.7,hx:1.7,hz:.5};assert.ok(Math.abs(pose.position.x-bench.x)>=bench.hx+.55||Math.abs(pose.position.z-bench.z)>=bench.hz+.55,'body clearance from existing bench');
   assert.ok(pose.position.z>=site.position.z-3.65+.18+.55,'body clearance from existing back wall');for(const dx of [-4.5,4.5])for(const dz of [-3.5,3.5])assert.ok(Math.abs(pose.position.x-site.position.x-dx)>=.24+.55||Math.abs(pose.position.z-site.position.z-dz)>=.24+.55,'body clearance from existing posts');
  }
  assert.ok(Math.abs(current-total)<1e-8);const back=regionalSupplyDisplayProgress(current,current-.4,1/60);assert.ok(back>=current-.4);assert.ok(back<current);
 }
 assert.equal(regionalSupplyDisplayProgress(0,.4,NaN),0);assert.equal(regionalSupplyDisplayProgress(0,.4,0),0);assert.equal(regionalSupplyDisplayProgress(0,4,1/60),4,'large restore snaps to an authoritative route point');
});


test('roof downpipe joins the existing roof underside and tank top without a floating gap',()=>{
 for(const site of regionalSupplyPlan(seed).outposts){const boxes=regionalSupplyConstructionBoxes(seed,site.id),tank=boxes.find(b=>b.id.endsWith('/storage'))!,pipe=boxes.find(b=>b.id.endsWith('/downpipe'))!;assert.ok(Math.abs(pipe.center.y-pipe.half.y-tank.center.y-tank.half.y)<1e-8);assert.ok(Math.abs(pipe.center.y+pipe.half.y-(site.position.y+3.7-.22))<1e-8);assert.ok(Math.abs(pipe.center.x-tank.center.x)+pipe.half.x<=tank.half.x);assert.ok(Math.abs(pipe.center.z-tank.center.z)+pipe.half.z<=tank.half.z);}
});
