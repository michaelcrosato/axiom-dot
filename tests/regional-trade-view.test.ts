import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {regionalTradeDisplayProgress,regionalTradeDisplayPose} from '../src/regional-trade-view.ts';

const path=[{x:0,y:0,z:0},{x:4,y:0,z:0},{x:4,y:0,z:4},{x:4,y:1,z:8}];
function onRoute(p:{x:number;y:number;z:number},points=path){let nearest=Infinity;for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,ab=new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z),ap=new THREE.Vector3(p.x-a.x,p.y-a.y,p.z-a.z),t=Math.max(0,Math.min(1,ap.dot(ab)/ab.lengthSq()));nearest=Math.min(nearest,ap.sub(ab.multiplyScalar(t)).length());}return nearest<1e-8;}
test('freight display walks the scalar road authority without corner cutting or catch-up speed',()=>{
 let current=0;for(let frame=0;frame<600;frame++){const target=Math.min(12,Math.floor(frame/15)*.45),before=current;current=regionalTradeDisplayProgress(current,target,1/60);assert.ok(current>=before&&current<=target);assert.ok(current-before<=1.8/60+1e-9);assert.ok(onRoute(regionalTradeDisplayPose(path,current).position));}
 assert.ok(Math.abs(current-12)<1e-9);assert.ok(Math.abs(regionalTradeDisplayProgress(0,1000,1/60)-1.8/60)<1e-10,'no long-snapshot teleport');assert.ok(Math.abs(regionalTradeDisplayProgress(0,1000,90)-.18)<1e-10,'frame stall cannot accelerate');assert.equal(regionalTradeDisplayProgress(3,9,NaN),3);assert.equal(regionalTradeDisplayProgress(3,9,0),3);assert.equal(regionalTradeDisplayProgress(3,9,1/60,100),2/60+3,'untrusted visual speed capped at 2 m/s');
 for(let frame=0;frame<600;frame++){const target=Math.max(0,12-Math.floor(frame/15)*.45),before=current;current=regionalTradeDisplayProgress(current,target,1/60);assert.ok(current<=before&&current>=target);assert.ok(before-current<=1.8/60+1e-9);assert.ok(onRoute(regionalTradeDisplayPose(path,current,true).position));}assert.ok(current<1e-9);
});
test('route sampling clamps both endpoints, supports repeated points and never extrapolates',()=>{
 assert.deepEqual(regionalTradeDisplayPose(path,-10).position,path[0]);assert.deepEqual(regionalTradeDisplayPose(path,1e8).position,path.at(-1));assert.deepEqual(regionalTradeDisplayPose([path[0]!,path[0]!],9).position,path[0]);assert.deepEqual(regionalTradeDisplayPose([],10).position,{x:0,y:0,z:0});
 assert.equal(regionalTradeDisplayPose(path,2).yaw,Math.PI/2);assert.equal(regionalTradeDisplayPose(path,2,true).yaw,-Math.PI/2);
});

test('weather-aware carrier projection consumes model speed at wet and drying boundaries and settles into stops',()=>{
 const route=regionalTradePlan(seed).routes[0]!;let drying=0;while(drying<10000&&regionalTradeRoadWeather(seed,route,drying).condition!=='drying')drying++;assert.ok(drying<10000);
 for(const boundary of [0,drying,drying+120,drying+240,drying+360,drying+480]){
  const state=structuredClone(createRegionalTrade(seed)),saved=state.routes[0]!,view=createRegionalTradeView(seed);state.ticks=Math.max(0,boundary-1);saved.sourceStartedAt=0;saved.activity='outbound';saved.cargo=4;saved.distance=120;
  const context={zone:'valley',player:regionalTradeDisplayPose(route.points,120).position,isConfirmed:()=>true,isTerrainConfirmed:()=>true};view.sync(state,context,1/60);const actor=view.root.getObjectByName(route.carrierId)!;assert.ok(actor);
  state.ticks=boundary;saved.distance=121;const before=JSON.stringify(state);view.sync(state,context,1/60);const speed=regionalTradeActorPoses(seed,state).find(p=>p.id===route.carrierId)!.speed;
  assert.equal(actor.userData.modelSpeed,speed);assert.ok(Math.abs(actor.userData.displayedDistance-120-speed/60)<1e-8,`boundary ${boundary} obeys ${speed} m/s`);assert.equal(JSON.stringify(state),before);
  saved.activity='blocked';const held=JSON.stringify(state);for(let frame=0;frame<100;frame++){const prior=actor.userData.displayedDistance;view.sync(state,context,1/60);assert.ok(actor.userData.displayedDistance-prior<=speed/60+1e-8);assert.ok(actor.userData.displayedDistance<=saved.distance+1e-8);}
  assert.equal(actor.userData.displayedDistance,saved.distance,'a zero-speed stopped pose does not freeze interpolation short of authority');assert.equal(actor.userData.modelSpeed,0);assert.equal(JSON.stringify(state),held);view.dispose();
 }
});

import {createRegionalTradeView,regionalTradeBoxSignature,REGIONAL_TRADE_VIEW_DISTANCE} from '../src/regional-trade-view.ts';
import {createRegionalTrade,regionalTradePlan,regionalTradeProjectBoxes,regionalTradeTargetSignature,regionalTradeActorPoses,regionalTradeCommandPosition,applyRegionalTradeCommand,advanceRegionalTrade,type RegionalTradeState,type RegionalTradeCommand} from '../src/regional-trade.ts';
import {regionalHeight,regionalCacheStats} from '../src/regional-world.ts';
import {regionalTradeRoadWeather} from '../src/regional-trade-weather.ts';
const seed=73129;
const fresh=():RegionalTradeState=>structuredClone(createRegionalTrade(seed));
function objects(root:THREE.Object3D){const result:THREE.Object3D[]=[];root.traverse(object=>result.push(object));return result;}
function finite(root:THREE.Object3D){root.updateMatrixWorld(true);root.traverse(object=>assert.ok([...object.position.toArray(),...object.rotation.toArray().slice(0,3),...object.scale.toArray(),...object.matrixWorld.elements].every(Number.isFinite),object.name));}
function command(state:RegionalTradeState,type:RegionalTradeCommand['type'],targetId:string){const point=regionalTradeCommandPosition(seed,{type,targetId})!;return applyRegionalTradeCommand(state,{generation:2,seed,regional:{version:1},zone:'valley',grounded:true,feetY:point.y,player:{...point,hp:100}},{type,targetId,expectedRevision:state.revision}).state;}

test('trade residency waits for exact solid and ground receipts, is bounded, and releases every GPU resource',()=>{
 const state=fresh(),plan=regionalTradePlan(seed),source=plan.sources[0]!,view=createRegionalTradeView(seed),context={zone:'valley',player:source.position,isConfirmed:()=>false,isTerrainConfirmed:()=>false};
 const before=JSON.stringify(state);view.sync(state,context);assert.equal(view.count,0);assert.equal(view.actorCount,0);view.sync(state,{...context,isTerrainConfirmed:()=>true});assert.ok(view.count>0);assert.ok(view.actorCount>0);assert.equal(objects(view.root).filter(o=>o.userData.regionalTradeSolid).length,0,'unactivated sites are outline-only blueprints');assert.equal(JSON.stringify(state),before);finite(view.root);
 const activated=command(state,'start-source',source.id);view.sync(activated,{...context,isTerrainConfirmed:()=>true});assert.equal(view.root.getObjectByName(source.id),undefined,'pending activation does not render a new solid');assert.equal(view.root.getObjectByName(plan.routes[0]!.carrierId),undefined,'near-source carrier waits for its target envelope');
 const signature=regionalTradeTargetSignature(seed,activated,source.id);view.sync(activated,{...context,isTerrainConfirmed:()=>true,isConfirmed:(id,actual)=>id===source.id&&actual===signature});assert.ok(view.root.getObjectByName(source.id));assert.ok(view.root.getObjectByName(plan.routes[0]!.carrierId));assert.equal(view.root.getObjectByName(`regional-trade-point:${source.id}`)!.userData.interactionPoint,true);
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();for(const o of objects(view.root))if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}let disposedG=0,disposedM=0;for(const g of geometries)g.addEventListener('dispose',()=>disposedG++);for(const m of materials)m.addEventListener('dispose',()=>disposedM++);
 view.sync(activated,{...context,zone:'cave',isTerrainConfirmed:()=>true,isConfirmed:()=>true});assert.equal(view.root.children.length,0);assert.equal(disposedG,geometries.size);assert.equal(disposedM,materials.size);assert.equal(view.actorCount,0);
 for(const site of [...plan.sources,...plan.projects]){view.sync(activated,{...context,player:site.position,isTerrainConfirmed:()=>true,isConfirmed:()=>true});assert.ok(view.count<=9&&view.actorCount<=12);finite(view.root);}view.dispose();view.dispose();view.sync(activated,{...context,isTerrainConfirmed:()=>true,isConfirmed:()=>true});assert.equal(view.root.children.length,0);
});
test('source, construction and complete store geometry copy the acknowledged physical envelopes exactly',()=>{
 const state=fresh(),plan=regionalTradePlan(seed),source=plan.sources[0]!,project=plan.projects[0]!,view=createRegionalTradeView(seed);state.routes[0]!.sourceStartedAt=0;state.routes[0]!.buildStartedAt=0;
 const context={zone:'valley',player:source.position,isTerrainConfirmed:()=>true,isConfirmed:()=>true};
 const check=(id:string)=>{const boxes=regionalTradeProjectBoxes(seed,state).filter(b=>b.id.startsWith(`${id}/`)),solids=objects(view.root).filter(o=>o.userData.regionalTradeSolid&&o.name.startsWith(`${id}/`)) as THREE.Mesh[];assert.equal(solids.length,boxes.length);for(const box of boxes){const mesh=solids.find(o=>o.name===box.id)!;assert.deepEqual(mesh.position.toArray(),[box.center.x,box.center.y,box.center.z]);assert.deepEqual(mesh.userData.regionalTradeSolid,{id:box.id,center:box.center,half:box.half,solid:true});const geometry=mesh.geometry as THREE.BoxGeometry;assert.equal(geometry.parameters.width,box.half.x*2);assert.equal(geometry.parameters.height,box.half.y*2);assert.equal(geometry.parameters.depth,box.half.z*2);}return regionalTradeBoxSignature(boxes);};
 view.sync(state,context);check(source.id);assert.equal(view.root.getObjectByName(source.id)!.userData.stage,'extraction');view.sync(state,{...context,player:project.position});const shape=check(project.id);assert.equal(view.root.getObjectByName(project.id)!.userData.stage,'construction');state.routes[0]!.builtAt=64;state.routes[0]!.destinationStock=8;view.sync(state,{...context,player:project.position});assert.equal(check(project.id),shape);assert.equal(view.root.getObjectByName(project.id)!.userData.stage,'complete');assert.equal(view.root.getObjectByName(project.id)!.userData.destinationStock,8);view.dispose();
});
test('real source loading produces bounded exact cargo, grounded shared rig feet and no renderer ledger changes',()=>{
 const plan=regionalTradePlan(seed),route=plan.routes[0]!,source=plan.sources[0]!,view=createRegionalTradeView(seed),context={zone:'valley',player:source.position,isConfirmed:()=>true,isTerrainConfirmed:()=>true};let state=command(createRegionalTrade(seed),'start-source',source.id),sawLoading=false,sawCargo=false;
 for(let tick=0;tick<140;tick++){
  state=advanceRegionalTrade(state,.25);sawLoading||=state.routes[0]!.activity==='loading';const before=JSON.stringify(state);
  for(let frame=0;frame<15;frame++){
   view.sync(state,context,1/60);finite(view.root);const actor=view.root.getObjectByName(route.carrierId)!;assert.ok(actor);assert.equal(actor.userData.cargo,state.routes[0]!.cargo);assert.equal(actor.getObjectByName('surveyStaff')!.visible,false);const visibleUnits=actor.getObjectByName('regional-freight-cargo')!.children.filter(o=>o.visible).length;assert.equal(visibleUnits,state.routes[0]!.cargo);
   if(state.routes[0]!.cargo>0){sawCargo=true;assert.ok(actor.userData.displayedDistance<=state.routes[0]!.distance+1e-8);const sampled=regionalTradeDisplayPose(route.points,actor.userData.displayedDistance).position;assert.equal(actor.position.x,sampled.x);assert.equal(actor.position.z,sampled.z);assert.equal(actor.position.y,regionalHeight(seed,actor.position.x,actor.position.z));}
   actor.updateWorldMatrix(true,true);for(const name of ['leftAnkle','rightAnkle']){const ankle=actor.getObjectByName(name)!,boot=ankle.children[0] as THREE.Mesh,bounds=new THREE.Box3().setFromObject(boot),p=ankle.getWorldPosition(new THREE.Vector3());assert.ok(bounds.min.y>=regionalHeight(seed,p.x,p.z)-.008,`${name} sole below ground by ${bounds.min.y-regionalHeight(seed,p.x,p.z)}`);}
  }
  assert.equal(JSON.stringify(state),before);
 }
 assert.equal(sawLoading,true);assert.equal(sawCargo,true);view.dispose();
});
test('remote carrier remains on canonical road with capped speed across packet delay, unload and reload',()=>{
 const state=structuredClone(createRegionalTrade(seed,1)),route=regionalTradePlan(seed).routes[0]!,saved=state.routes[0]!,view=createRegionalTradeView(seed);saved.sourceStartedAt=0;saved.activity='outbound';saved.remaining=8;saved.cargo=4;saved.distance=120;
 const at=regionalTradeDisplayPose(route.points,120).position,context={zone:'valley',player:at,isConfirmed:()=>false,isTerrainConfirmed:()=>true},cache=regionalCacheStats();view.sync(state,context);let actor=view.root.getObjectByName(route.carrierId)!;assert.ok(actor,'a far-route carrier needs ground receipt, not unloaded endpoint receipt');assert.equal(actor.userData.displayedDistance,120);
 saved.distance=140;view.sync(state,context,1/60);assert.ok(Math.abs(actor.userData.displayedDistance-120-1.8/60)<1e-8);assert.equal(regionalCacheStats().featureCompilations,cache.featureCompilations);
 view.sync(state,{...context,isTerrainConfirmed:()=>false},1/60);assert.equal(view.carrierCount,0);view.sync(state,context);actor=view.root.getObjectByName(route.carrierId)!;assert.equal(actor.userData.displayedDistance,140,'remount begins at the latest committed route point, never an old local sim');
 saved.activity='blocked';const held=actor.userData.displayedDistance;for(let frame=0;frame<20;frame++)view.sync(state,context,1/60);assert.equal(actor.userData.displayedDistance,held);assert.equal(actor.userData.cargo,4);
 view.sync(state,{...context,player:{x:at.x+REGIONAL_TRADE_VIEW_DISTANCE+400,z:at.z+REGIONAL_TRADE_VIEW_DISTANCE+400}},1/60);assert.equal(view.carrierCount,0);assert.equal(state.routes[0]!.distance,140);view.dispose();
});
test('repair is a walkable ground condition with no phantom solid obstacle and truthful crew activity',()=>{
 const state=fresh(),route=regionalTradePlan(seed).routes[0]!,saved=state.routes[0]!,view=createRegionalTradeView(seed),context={zone:'valley',player:route.obstruction.position,isConfirmed:()=>true,isTerrainConfirmed:()=>true};view.sync(state,context);
 assert.ok(objects(view.root).some(o=>o.userData.regionalTradeRoadCondition));assert.equal(objects(view.root).filter(o=>o.userData.regionalTradeSolid).length,0);const repairer=view.root.getObjectByName(`${route.id}/repairer`)!;assert.equal(repairer.userData.modelActivity,'waiting');assert.equal(repairer.getObjectByName('regional-work-tool')!.visible,false);
 saved.repairStartedAt=0;saved.sourceStartedAt=0;state.ticks=24;view.sync(state,context,1/60);assert.equal(repairer.userData.modelActivity,'repairing');assert.equal(repairer.getObjectByName('regional-work-tool')!.visible,true);
 saved.clearedAt=48;state.ticks=48;view.sync(state,context,1/60);assert.equal(objects(view.root).some(o=>o.userData.regionalTradeRoadCondition),false);assert.equal(repairer.userData.modelActivity,'complete');assert.equal(repairer.getObjectByName('regional-work-tool')!.visible,false);view.dispose();
});

 test('real carrier projection resumes at authority after paused or interrupted presentation without changing transport',()=>{
 const plan=regionalTradePlan(seed),route=plan.routes[0]!,source=plan.sources[0]!,view=createRegionalTradeView(seed);let state=command(createRegionalTrade(seed,1),'start-source',source.id);state=command(state,'clear-route',route.id);while(state.routes[0]!.distance<100)state=advanceRegionalTrade(state,.25);
 const context={zone:'valley',player:regionalTradeActorPoses(seed,state).find(p=>p.id===route.carrierId)!.position,isConfirmed:()=>true,isTerrainConfirmed:()=>true};view.sync(state,context,1/60);
 const initial=view.root.getObjectByName(route.carrierId)!;assert.equal(initial.userData.displayedDistance,state.routes[0]!.distance);
 // A suspended projection observes authority advancing while rendering is paused.
 for(let tick=0;tick<80;tick++){state=advanceRegionalTrade(state,.25);view.sync(state,context,0);}const pausedDistance=initial.userData.displayedDistance,accepted=state.routes[0]!.distance,before=JSON.stringify(state);assert(accepted-pausedDistance>35);
 view.sync(state,context,1/60);let current=view.root.getObjectByName(route.carrierId)!;assert.notEqual(current,initial);assert.equal(current.userData.displayedDistance,accepted);assert.equal(current.userData.cargo,state.routes[0]!.cargo);assert.equal(JSON.stringify(state),before);
 // A disconnected snapshot can also arrive without intermediate frames.
 for(let tick=0;tick<24;tick++)state=advanceRegionalTrade(state,.25);const late=JSON.stringify(state);view.sync(state,context,1/60);current=view.root.getObjectByName(route.carrierId)!;assert.equal(current.userData.displayedDistance,state.routes[0]!.distance);assert.equal(JSON.stringify(state),late);
 const prior=current.userData.displayedDistance;state=advanceRegionalTrade(state,.25);view.sync(state,context,1/60);assert(current.userData.displayedDistance-prior<=1.8/60+1e-8,'ordinary packets still interpolate at physical speed');view.dispose();
});
