import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {createRegionalFoodView,regionalFoodDisplayPose,regionalFoodDisplayProgress,REGIONAL_FOOD_VIEW_DISTANCE} from '../src/regional-food-view.ts';
import {createRegionalFood,regionalFoodPlan,regionalFoodActorPoses,type RegionalFoodState} from '../src/regional-food.ts';
import {createRegionalSupply,regionalSupplyActorPoses} from '../src/regional-supply.ts';
import {createRegionalTrade,regionalTradeActorPoses} from '../src/regional-trade.ts';
import {regionalHeight,regionalCacheStats} from '../src/regional-world.ts';
const seed=73129,fresh=():RegionalFoodState=>structuredClone(createRegionalFood(seed,createRegionalSupply(seed),createRegionalTrade(seed)));
function objects(root:THREE.Object3D){const result:THREE.Object3D[]=[];root.traverse(o=>result.push(o));return result;}
function finite(root:THREE.Object3D){root.updateMatrixWorld(true);root.traverse(o=>assert([...o.position.toArray(),...o.rotation.toArray().slice(0,3),...o.scale.toArray(),...o.matrixWorld.elements].every(Number.isFinite),o.name));}
function context(state:RegionalFoodState,index=0){return {zone:'valley',player:regionalFoodPlan(seed).farms[index]!.position,isTerrainConfirmed:()=>true,isStoreConfirmed:()=>true};}
const path=[{x:0,y:0,z:0},{x:4,y:0,z:0},{x:4,y:0,z:4},{x:4,y:1,z:8}];
function onRoute(p:{x:number;y:number;z:number},points=path){let nearest=Infinity;for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,ab=new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z),ap=new THREE.Vector3(p.x-a.x,p.y-a.y,p.z-a.z),t=Math.max(0,Math.min(1,ap.dot(ab)/(ab.lengthSq()||1)));nearest=Math.min(nearest,ap.sub(ab.multiplyScalar(t)).length());}return nearest<1e-8;}

test('food projection follows full arc distance at actual speed, never a chord or catch-up warp',()=>{
 let distance=0;for(let frame=0;frame<720;frame++){const target=Math.min(12,Math.floor(frame/15)*.35),before=distance;distance=regionalFoodDisplayProgress(distance,target,1/60,1.4);assert(distance>=before&&distance<=target);assert(distance-before<=1.4/60+1e-9);assert(onRoute(regionalFoodDisplayPose(path,distance).position));}assert(Math.abs(distance-12)<1e-8);
 assert(Math.abs(regionalFoodDisplayProgress(0,1000,90,1.4)-.14)<1e-9);assert.equal(regionalFoodDisplayProgress(3,9,NaN),3);assert.equal(regionalFoodDisplayProgress(3,9,0),3);assert.equal(regionalFoodDisplayProgress(0,1000,1/60,99),2/60);
 assert.deepEqual(regionalFoodDisplayPose(path,-2).position,path[0]);assert.deepEqual(regionalFoodDisplayPose(path,1e8).position,path.at(-1));assert.deepEqual(regionalFoodDisplayPose([path[0]!,path[0]!],9).position,path[0]);assert.deepEqual(regionalFoodDisplayPose([],10).position,{x:0,y:0,z:0});
 assert.equal(regionalFoodDisplayPose(path,2).yaw,Math.PI/2);assert.equal(regionalFoodDisplayPose(path,2,true).yaw,-Math.PI/2);
});
test('food plots and rigs require accepted visible ground and pantry uses the existing exact store receipt',()=>{
 const state=fresh(),farm=regionalFoodPlan(seed).farms[0]!,view=createRegionalFoodView(seed),ctx=context(state),before=JSON.stringify(state);
 view.sync(state,{...ctx,isTerrainConfirmed:()=>false});assert.equal(view.count,0);assert.equal(view.actorCount,0);
 view.sync(state,{...ctx,isStoreConfirmed:()=>false});assert.equal(view.count,1);assert.equal(view.actorCount,2);const pantry=view.root.getObjectByName(`regional-food-pantry:${farm.id}`)!;assert.equal(pantry.visible,false);
 view.sync(state,ctx);assert.equal(pantry.visible,true);assert.equal(view.root.getObjectByName(`regional-food-point:${farm.id}`)!.userData.interactionPoint,true);
 const farCorner={x:farm.position.x+1.55,z:farm.position.z+1.25};view.sync(state,{...ctx,isTerrainConfirmed:p=>Math.hypot(p.x-farCorner.x,p.z-farCorner.z)>.01});assert.equal(view.count,0,'patch cannot cross into an uncommitted adjacent ground cell');assert.equal(view.root.getObjectByName(farm.farmerId),undefined);
 view.sync(state,ctx);assert.equal(JSON.stringify(state),before);assert.equal(objects(view.root).filter(o=>o.userData.regionalSupplySolid||o.userData.regionalTradeSolid).length,0,'food does not duplicate shelter/store solid envelopes');finite(view.root);view.dispose();
});
test('crop stage, source units, loaded food and each held meal come only from the latest ledger',()=>{
 const state=fresh(),saved=state.farms[0]!,farm=regionalFoodPlan(seed).farms[0]!,view=createRegionalFoodView(seed),ctx=context(state);saved.startedAt=0;saved.crop='growing';saved.growth=60;saved.water=3;saved.stock=3;saved.store=2;saved.cargo=4;saved.returnMeal=1;saved.activity='outbound';saved.distance=10;
 const before=JSON.stringify(state);view.sync(state,ctx,1/60);const patch=view.root.getObjectByName(farm.id)!,carrier=view.root.getObjectByName(farm.carrierId)!,farmer=view.root.getObjectByName(farm.farmerId)!;
 assert.equal(patch.userData.crop,'growing');assert.equal(patch.getObjectByName('ripe-crop')!.visible,false);assert.equal(objects(patch).filter(o=>o.name.startsWith('regional-food-source-unit-')&&o.visible).length,3);assert.equal(objects(patch).filter(o=>o.name.startsWith('regional-food-store-unit-')&&o.visible).length,2);
 assert.equal(carrier.userData.cargo,4);assert.equal(carrier.getObjectByName('regional-food-cargo')!.children.filter(o=>o.visible).length,4);assert.equal(carrier.getObjectByName('regional-food-carried-meal')!.visible,true);assert.equal(farmer.getObjectByName('regional-food-carried-meal')!.visible,false);assert.equal(carrier.getObjectByName('surveyStaff')!.visible,false);assert.equal(farmer.getObjectByName('surveyStaff')!.visible,false);
 assert.equal(JSON.stringify(state),before);saved.reserved=4;saved.cargo=0;view.sync(state,ctx,1/60);assert.equal(objects(patch).filter(o=>o.name.startsWith('regional-food-reserved-unit-')&&o.visible).length,4);assert.equal(carrier.getObjectByName('regional-food-cargo')!.visible,false,'reserved loading stock is not also displayed as loaded cargo');saved.reserved=0;saved.crop='ripe';saved.growth=farm.growWork;saved.cargo=0;saved.returnMeal=0;saved.carrierMeal=1;saved.farmerMeal=1;saved.activity='eating';saved.distance=farm.surfaceMetres;state.ticks+=12;view.sync(state,ctx,1/60);
 assert.equal(patch.getObjectByName('ripe-crop')!.visible,true);const newCarrier=view.root.getObjectByName(farm.carrierId)!,newFarmer=view.root.getObjectByName(farm.farmerId)!;assert.equal(newCarrier.getObjectByName('regional-food-cargo')!.visible,false);assert.equal(newCarrier.userData.meal,1);assert.equal(newFarmer.userData.meal,1);assert.equal(newCarrier.userData.activity,'eating');finite(view.root);view.dispose();
});
test('unloading at a stopped authority endpoint can finish interpolation without losing ground support or inventing work',()=>{
 const state=fresh(),saved=state.farms[0]!,farm=regionalFoodPlan(seed).farms[0]!,view=createRegionalFoodView(seed),ctx=context(state);saved.startedAt=0;saved.activity='outbound';saved.cargo=4;saved.distance=farm.surfaceMetres-.35;view.sync(state,ctx,1/60);
 const carrier=view.root.getObjectByName(farm.carrierId)!;saved.activity='unloading';saved.distance=farm.surfaceMetres;state.ticks++;
 for(let frame=0;frame<30;frame++){const before=carrier.userData.displayedDistance;view.sync(state,ctx,1/60);assert(carrier.userData.displayedDistance-before<=farm.speed/60+1e-8);assert(carrier.userData.displayedDistance<=saved.distance+1e-8);assert(onRoute(regionalFoodDisplayPose(farm.path,carrier.userData.displayedDistance).position,farm.path));assert.equal(carrier.position.y,regionalHeight(seed,carrier.position.x,carrier.position.z));if(carrier.userData.displayedDistance<saved.distance-1e-5)assert.equal(carrier.userData.activity,'outbound');}
 assert(Math.abs(carrier.userData.displayedDistance-farm.surfaceMetres)<1e-7);assert.equal(carrier.userData.activity,'unloading');
 carrier.updateWorldMatrix(true,true);for(const name of ['leftAnkle','rightAnkle']){const ankle=carrier.getObjectByName(name)!,boot=ankle.children[0] as THREE.Mesh,bounds=new THREE.Box3().setFromObject(boot),p=ankle.getWorldPosition(new THREE.Vector3());assert(bounds.min.y>=regionalHeight(seed,p.x,p.z)-.009,`${name} below exact regional ground`);}view.dispose();
});
test('menu, resume, reconnect, backwards clock and explicit bfcache clear discard stale interpolation',()=>{
 const state=fresh(),saved=state.farms[0]!,farm=regionalFoodPlan(seed).farms[0]!,view=createRegionalFoodView(seed),ctx=context(state);saved.startedAt=0;saved.activity='outbound';saved.cargo=4;saved.distance=2;view.sync(state,ctx,1/60);let carrier=view.root.getObjectByName(farm.carrierId)!;
 saved.distance=6;state.ticks+=12;view.sync(state,ctx,0);let next=view.root.getObjectByName(farm.carrierId)!;assert.notEqual(carrier,next);assert.equal(next.userData.displayedDistance,6);
 carrier=next;saved.distance=8;state.ticks+=4;view.sync(state,ctx,0);next=view.root.getObjectByName(farm.carrierId)!;assert.notEqual(carrier,next);assert.equal(next.userData.displayedDistance,8,'an online menu never leaves old loaded actors behind updated stock');
 carrier=next;view.sync(state,ctx,1/60);next=view.root.getObjectByName(farm.carrierId)!;assert.notEqual(carrier,next);assert.equal(next.userData.displayedDistance,8);
 const before=JSON.stringify(state);state.ticks=1;saved.distance=1;view.sync(state,ctx,1/60);assert.equal(view.root.getObjectByName(farm.carrierId)!.userData.displayedDistance,1);view.clear();assert.equal(view.root.children.length,0);view.sync(state,ctx,1/60);assert.equal(view.root.getObjectByName(farm.carrierId)!.userData.displayedDistance,1);assert.notEqual(JSON.stringify(state),before);view.dispose();
});
test('interpolated points and humanoid support patches cannot render over unconfirmed terrain',()=>{
 const state=fresh(),saved=state.farms[0]!,farm=regionalFoodPlan(seed).farms[0]!,view=createRegionalFoodView(seed),ctx=context(state);saved.startedAt=0;saved.activity='outbound';saved.distance=3;view.sync(state,ctx,1/60);const prior=view.root.getObjectByName(farm.carrierId)!,old={x:prior.position.x,z:prior.position.z};saved.distance=5;state.ticks++;
 view.sync(state,{...ctx,isTerrainConfirmed:p=>Math.hypot(p.x-old.x,p.z-old.z)>.2},1/60);assert.equal(view.root.getObjectByName(farm.carrierId),undefined,'new authoritative point does not license a stale interpolated point');
 view.sync(state,ctx,1/60);const current=view.root.getObjectByName(farm.carrierId)!;assert.equal(current.userData.displayedDistance,5);const foot={x:current.position.x+.55,z:current.position.z};view.sync(state,{...ctx,isTerrainConfirmed:p=>Math.hypot(p.x-foot.x,p.z-foot.z)>.01},1/60);assert.equal(view.root.getObjectByName(farm.carrierId),undefined,'root receipt alone cannot leave the foot over pending ground');view.dispose();
});
test('farm residency is bounded, IDs never duplicate existing residents and all GPU resources release',()=>{
 const state=fresh(),plan=regionalFoodPlan(seed),view=createRegionalFoodView(seed),before=JSON.stringify(state),cache=regionalCacheStats();
 const oldIds=new Set([...regionalSupplyActorPoses(seed,createRegionalSupply(seed)),...regionalTradeActorPoses(seed,createRegionalTrade(seed))].map(p=>p.id));for(const pose of regionalFoodActorPoses(seed,state))assert(!oldIds.has(pose.id));
 for(let i=0;i<3;i++){view.sync(state,context(state,i),1/60);assert(view.count<=3&&view.actorCount<=6);finite(view.root);}
 assert.equal(regionalCacheStats().featureCompilations,cache.featureCompilations);const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();for(const o of objects(view.root))if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}let disposedG=0,disposedM=0;for(const g of geometries)g.addEventListener('dispose',()=>disposedG++);for(const m of materials)m.addEventListener('dispose',()=>disposedM++);
 view.sync(state,{...context(state,2),player:{x:plan.farms[2]!.position.x+REGIONAL_FOOD_VIEW_DISTANCE+200,z:plan.farms[2]!.position.z+300}});assert.equal(view.root.children.length,0);assert.equal(disposedG,geometries.size);assert.equal(disposedM,materials.size);assert.equal(JSON.stringify(state),before);
 view.sync(state,context(state));view.sync(state,{...context(state),zone:'cave'});assert.equal(view.actorCount,0);view.dispose();view.dispose();view.sync(state,context(state));assert.equal(view.root.children.length,0);
});
