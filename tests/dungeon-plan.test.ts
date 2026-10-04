import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {generateDungeonPlan,dungeonPlanWalkable,DUNGEON_RECIPE_MANIFEST,type DungeonPlan} from '../src/dungeon-plan.ts';
import {seedSample} from '../src/procedural.ts';
const SEEDS=[...Array.from({length:128},(_,i)=>i),73129,0x80000000,0xffffffff];
const geometry=(d:DungeonPlan)=>JSON.stringify({rooms:d.rooms.map(({x,z,hx,hz})=>({x,z,hx,hz})),tiles:d.tiles,walls:d.walls,edges:d.edges.map(e=>({a:d.rooms.findIndex(r=>r.id===e.from),b:d.rooms.findIndex(r=>r.id===e.to),width:e.width})),objects:d.objects.map(({kind,x,z})=>({kind,x,z}))});

test('dungeon v2 has immutable deterministic geometry and genuinely non-isomorphic branching/cyclic graphs',()=>{
 const geometries=new Set<string>(),invariants=new Set<string>(),counts=new Set<number>(),loops=new Set<number>(),footprints=new Set<string>();let branched=false;
 for(const seed of SEEDS){const d=generateDungeonPlan(seed);assert.deepEqual(d,generateDungeonPlan(seed));assert.ok(Object.isFrozen(d)&&Object.isFrozen(d.rooms[0])&&Object.isFrozen(d.graph.nodes[0]!.neighbors));assert.ok(d.constraints.every(c=>c.ok));geometries.add(geometry(d));
  const degrees=d.graph.nodes.map(n=>n.neighbors.length).sort((a,b)=>a-b);invariants.add(JSON.stringify([d.rooms.length,d.edges.length,degrees]));counts.add(d.rooms.length);loops.add(d.edges.length-d.rooms.length+1);branched ||= degrees.at(-1)!>=3;
  for(const r of d.rooms)footprints.add(`${r.hx}:${r.hz}`);
  assert.ok(d.budget.operations<=DUNGEON_RECIPE_MANIFEST.budgets.operations);assert.ok(d.tiles.length<=1100&&d.walls.length<=1600);
 }
 assert.ok(geometries.size>125,'Geometry excludes seed-bearing IDs');assert.ok(invariants.size>25,'Different degree sequences/counts prove non-isomorphic graph variants');assert.equal(counts.size,6);assert.equal(loops.size,4);assert.equal(footprints.size,9);assert.ok(branched);
 const before=generateDungeonPlan(73129);for(const seed of [...SEEDS].reverse())generateDungeonPlan(seed);seedSample(73129,2,'dungeon','unrelated-new-feature','color');assert.deepEqual(generateDungeonPlan(73129),before);
 assert.throws(()=>{before.tiles.push({x:80,z:80});},TypeError);for(const seed of [-1,.5,NaN,Infinity,0x100000000])assert.throws(()=>generateDungeonPlan(seed),RangeError);
});

test('every room, actual carved tile and objective is connected with real capsule-clear passages',()=>{
 for(const seed of SEEDS){const d=generateDungeonPlan(seed),tiles=new Set(d.tiles.map(t=>`${t.x}:${t.z}`)),seen=new Set<string>(),queue=[d.spawn];
  while(queue.length){const t=queue.pop()!,key=`${t.x}:${t.z}`;if(seen.has(key)||!tiles.has(key))continue;seen.add(key);for(const [dx,dz]of [[2,0],[-2,0],[0,2],[0,-2]])queue.push({x:t.x+dx!,z:t.z+dz!});}
  assert.equal(seen.size,tiles.size);const rooms=new Set([d.graph.entry]);for(let i=0;i<d.rooms.length;i++)for(const e of d.edges){if(rooms.has(e.from))rooms.add(e.to);if(rooms.has(e.to))rooms.add(e.from);}assert.equal(rooms.size,d.rooms.length);
  for(const t of d.tiles){assert.ok(Math.abs(t.x)+1.12<d.bound&&Math.abs(t.z)+1.12<d.bound);assert.ok(dungeonPlanWalkable(d,t.x,t.z));}
  for(const e of d.edges){const a=e.points[0]!,b=e.points[1]!,steps=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.2);assert.ok(a.x===b.x||a.z===b.z);for(let i=0;i<=steps;i++)assert.ok(dungeonPlanWalkable(d,a.x+(b.x-a.x)*i/steps,a.z+(b.z-a.z)*i/steps),`Blocked edge ${seed}: ${e.id}`);}
  for(let i=0;i<d.rooms.length;i++)for(let j=i+1;j<d.rooms.length;j++){const a=d.rooms[i]!,b=d.rooms[j]!;assert.ok(Math.abs(a.x-b.x)>a.hx+b.hx+2||Math.abs(a.z-b.z)>a.hz+b.hz+2,'Room footprints cannot overlap');}
  assert.equal(d.objects.length,7);assert.equal(d.objects.filter(o=>o.kind==='enemy').length,3);for(const kind of ['scrap','water','core','exit'])assert.equal(d.objects.filter(o=>o.kind===kind).length,1);
  assert.equal(new Set([...d.rooms,...d.edges,...d.objects,...d.objectives].map(v=>v.id)).size,d.rooms.length+d.edges.length+d.objects.length+d.objectives.length);
  for(const objective of d.objectives){const o=d.objects.find(o=>o.id===objective.objectId)!;assert.ok(o&&rooms.has(objective.roomId));assert.ok(seen.has(`${o.x}:${o.z}`));assert.ok(dungeonPlanWalkable(d,o.x,o.z));}
  assert.ok(dungeonPlanWalkable(seed,0,24));assert.equal(dungeonPlanWalkable(d,NaN,0),false);assert.equal(dungeonPlanWalkable(d,70,70),false);
 }
});

test('real full-height Rapier capsule traverses every generated passage both ways across varied graph seeds',async()=>{
 await RAPIER.init();
 for(const seed of [0,1,2,7,19,42,73129,0xffffffff]){
  const d=generateDungeonPlan(seed),world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=1/60;
  world.createCollider(RAPIER.ColliderDesc.cuboid(d.bound,.2,d.bound).setTranslation(0,-.2,0));
  for(const wall of d.walls)world.createCollider(RAPIER.ColliderDesc.cuboid(wall.hx,wall.hy,wall.hz).setTranslation(wall.x,wall.hy,wall.z));
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(d.spawn.x,1.11,d.spawn.z));const collider=world.createCollider(RAPIER.ColliderDesc.capsule(.74,.34),body),controller=world.createCharacterController(.02);controller.enableAutostep(.35,.2,true);controller.enableSnapToGround(.3);
  const move=(x:number,z:number)=>{const p=body.translation();controller.computeColliderMovement(collider,{x,y:-.04,z});const v=controller.computedMovement();body.setNextKinematicTranslation({x:p.x+v.x,y:p.y+v.y,z:p.z+v.z});world.step();};
  for(const edge of d.edges)for(const [a,b]of [[edge.points[0]!,edge.points[1]!],[edge.points[1]!,edge.points[0]!]]){
   body.setTranslation({x:a.x,y:1.11,z:a.z},true);body.setNextKinematicTranslation({x:a.x,y:1.11,z:a.z});world.propagateModifiedBodyPositionsToColliders();world.step();for(let i=0;i<4;i++)move(0,0);
   for(let i=0;i<400;i++){const p=body.translation(),dx=b.x-p.x,dz=b.z-p.z,length=Math.hypot(dx,dz);if(length<.06)break;move(dx/length*Math.min(.12,length),dz/length*Math.min(.12,length));}
   assert.ok(Math.hypot(body.translation().x-b.x,body.translation().z-b.z)<.08,`Standing route blocked seed ${seed}: ${edge.id}`);assert.ok(Math.abs(body.translation().y-1.1)<.07,`Unexpected ground height ${JSON.stringify(body.translation())}, seed ${seed}, edge ${edge.id}`);
  }
  body.setTranslation({x:d.spawn.x,y:1.11,z:d.spawn.z},true);body.setNextKinematicTranslation({x:d.spawn.x,y:1.11,z:d.spawn.z});world.propagateModifiedBodyPositionsToColliders();world.step();for(let i=0;i<180;i++)move(0,.12);assert.ok(body.translation().z<d.spawn.z+d.rooms[0]!.hz+.65,'Threshold perimeter must block the standing capsule');world.free();
 }
});
