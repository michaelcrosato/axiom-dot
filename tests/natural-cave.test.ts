import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {generateNaturalCave,naturalCave,caveWalkable,caveReturnNearby,CAVE_MANIFEST,CAVE_HASH,type CavePlan} from '../src/natural-cave.ts';
import {createCaveWater,caveFloodObstacles,applyCaveWaterCommand,advanceCaveWater,caveRouteOpen,safeCavePosition} from '../src/cave-water.ts';

const geometry=(p:CavePlan)=>JSON.stringify({spine:p.spine,tiles:p.tiles.map(({x,z,basin})=>({x,z,basin})),walls:p.walls.map(({x,z,hx,hz,hy})=>({x,z,hx,hz,hy})),chambers:p.chambers.map(({x,z,radiusX,radiusZ})=>({x,z,radiusX,radiusZ}))});
test('natural caves are immutable seeded sinuous plans with bounded connected floor and independent identities',()=>{
 const variants=new Set<string>();
 for(const seed of [...Array.from({length:256},(_,i)=>i),73129,0xffffffff]){
  const p=generateNaturalCave(seed);assert.deepEqual(p,generateNaturalCave(seed));variants.add(geometry(p));
  assert.ok(p.constraints.every(c=>c.ok));assert.equal(p.hash,CAVE_HASH);assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.basins[0].tiles[0]));
  assert.ok(p.budget.operations<=CAVE_MANIFEST.bounds.maxOperations&&p.tiles.length<=700&&p.walls.length<=700);
  const floor=new Set(p.tiles.map(t=>`${t.x}:${t.z}`)),visited=new Set<string>(),queue=['0:24'];while(queue.length){const key=queue.pop()!;if(!floor.has(key)||visited.has(key))continue;visited.add(key);const [x,z]=key.split(':').map(Number);for(const [dx,dz]of [[2,0],[-2,0],[0,2],[0,-2]])queue.push(`${x!+dx!}:${z!+dz!}`);}assert.equal(visited.size,floor.size);
  assert.equal(p.objects.filter(o=>o.kind==='scrap').length,4);assert.equal(p.objects.filter(o=>o.kind==='core').length,1);assert.equal(p.objects.filter(o=>o.kind==='water').length,1);assert.equal(p.objects.filter(o=>o.kind==='exit').length,2);
  assert.ok(p.objects.every(o=>o.id.startsWith(`cave:1:${seed}:`)&&caveWalkable(p,o.x,o.z)));assert.equal(new Set([...p.objects,...p.tiles,...p.walls,...p.chambers,...p.basins,...p.navigation].map(o=>o.id)).size,p.objects.length+p.tiles.length+p.walls.length+p.chambers.length+p.basins.length+p.navigation.length);
  for(const b of p.basins){assert.equal(b.area,b.tiles.length*4);assert.ok(b.area>=32&&b.area<=160);}
  for(const route of p.navigation)for(let i=1;i<route.points.length;i++){const a=route.points[i-1]!,b=route.points[i]!,steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.2);for(let k=0;k<=steps;k++)assert.ok(caveWalkable(p,a.x+(b.x-a.x)*k/steps,a.z+(b.z-a.z)*k/steps),`Blocked natural route ${seed}`);}
  for(const anchor of p.returnAnchors)assert.ok(caveReturnNearby(p,anchor));assert.equal(caveReturnNearby(p,{x:0,z:0}),false);
 }
 assert.ok(variants.size>=250,'Variation excludes seed-bearing IDs');
 const before=naturalCave(73129);for(let seed=0;seed<12;seed++)naturalCave(seed);assert.deepEqual(naturalCave(73129),before);
 for(const bad of [-1,.5,NaN,Infinity,0x100000000])assert.throws(()=>generateNaturalCave(bad),RangeError);
 assert.equal(caveWalkable(before,NaN,0),false);assert.equal(caveWalkable(before,0,0,-.1),false);assert.equal(caveWalkable(before,39,39),false);
 assert.throws(()=>{before.tiles.push({id:'bad',x:0,z:0,basin:null});},TypeError);
});

test('real standing Rapier capsule is blocked by flood, crosses after drainage, and has dry return on both banks',async()=>{
 await RAPIER.init();
 for(const seed of [0,1,17,73129,0xffffffff]){
  const plan=naturalCave(seed),world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=1/60;
  world.createCollider(RAPIER.ColliderDesc.cuboid(plan.bound,.2,plan.bound).setTranslation(0,-.2,0));
  for(const wall of plan.walls)world.createCollider(RAPIER.ColliderDesc.cuboid(wall.hx,wall.hy,wall.hz).setTranslation(wall.x,wall.hy,wall.z));
  let water=createCaveWater(seed);const flood=caveFloodObstacles(water,plan).map(w=>world.createCollider(RAPIER.ColliderDesc.cuboid(w.hx,w.hy,w.hz).setTranslation(w.x,w.y,w.z)));
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(plan.spawn.x,1.11,plan.spawn.z));const capsule=world.createCollider(RAPIER.ColliderDesc.capsule(.74,.34),body),controller=world.createCharacterController(.02);controller.enableAutostep(.35,.2,true);controller.enableSnapToGround(.3);
  const move=(x:number,z:number)=>{const p=body.translation();controller.computeColliderMovement(capsule,{x,y:-.04,z});const v=controller.computedMovement();body.setNextKinematicTranslation({x:p.x+v.x,y:p.y+v.y,z:p.z+v.z});world.step();};
  const traverse=(target:{x:number;z:number},limit=300)=>{for(let i=0;i<limit;i++){const p=body.translation(),dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz);if(d<.06)return;move(dx/d*Math.min(.12,d),dz/d*Math.min(.12,d));}};
  traverse(plan.spine[0]!);traverse(plan.spine[1]!);traverse(plan.spine[2]!);assert.ok(body.translation().z>=13.3,'Wet course must physically stop the capsule, not just its objective predicate');
  const far=plan.returnAnchors[1]!;assert.deepEqual(safeCavePosition(water,far),far);assert.ok(caveReturnNearby(plan,far));assert.deepEqual(safeCavePosition(water,plan.spine[3]!),plan.returnAnchors.slice().sort((a,b)=>Math.hypot(a.x-plan.spine[3]!.x,a.z-plan.spine[3]!.z)-Math.hypot(b.x-plan.spine[3]!.x,b.z-plan.spine[3]!.z))[0]);
  water=applyCaveWaterCommand(water,{inventory:{scrap:1,core:0,water:0},player:plan.anchors.drain,zone:'cave',hp:100},{type:'clear-drain'}).state;
  for(let t=0;t<120&&!caveRouteOpen(water);t++)water=advanceCaveWater(water,1);assert.ok(caveRouteOpen(water));assert.equal(caveFloodObstacles(water).length,0);
  for(const collider of flood)world.removeCollider(collider,true);
  for(const target of plan.spine.slice(2)){traverse(target);assert.ok(Math.hypot(body.translation().x-target.x,body.translation().z-target.z)<.08,`Drained cave route ${seed} ${JSON.stringify(target)} must be physically passable`);}
  traverse(far);assert.ok(Math.hypot(body.translation().x-far.x,body.translation().z-far.z)<.08);
  for(const target of [...plan.spine].reverse()){traverse(target);assert.ok(Math.hypot(body.translation().x-target.x,body.translation().z-target.z)<.08,`Return route ${seed} blocked`);}
  world.free();
 }
});
