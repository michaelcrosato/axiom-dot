import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {compileWorkshop,workshopRecipe,workshopRegistry,workshopWalkable,safeWorkshopSpawn,WORKSHOP_ORIGIN,WORKSHOP_CLEARANCE,WORKSHOP_BUDGET,type CompiledWorkshop,type WorkshopPoint} from '../src/building.ts';
import {compileRecipe,type Recipe} from '../src/procedural.ts';

const geometry=(w:CompiledWorkshop)=>w.plan.shapes.map(s=>({center:s.center,half:s.half,solid:s.solid})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
const distance=(a:WorkshopPoint,b:WorkshopPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
function assertSegmentClear(workshop:CompiledWorkshop,a:WorkshopPoint,b:WorkshopPoint){
 const steps=Math.max(1,Math.ceil(distance(a,b)/.08));
 for(let i=0;i<=steps;i++){const t=i/steps,p={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};assert.ok(workshopWalkable(workshop,p),`Blocked navigation segment at ${JSON.stringify(p)}`);}
}

test('workshop recipes are reproducible, serializable, independently seeded and geometrically varied',()=>{
 const seenRooms=new Set<number>(),seenWidths=new Set<number>(),seenDepths=new Set<number>(),seenDoors=new Set<number>(),seenShapes=new Set<string>();
 for(let seed=0;seed<96;seed++){
  const w=compileWorkshop(seed);assert.equal(w.plan.valid,true,JSON.stringify(w.plan.constraints.filter(c=>!c.ok)));
  assert.deepEqual(w,compileWorkshop(seed));
  assert.deepEqual(w.plan,compileRecipe(workshopRegistry,JSON.parse(JSON.stringify(workshopRecipe(seed))) as Recipe,{seed,owner:w.plan.owner,bounds:w.bounds}));
  seenRooms.add(w.rooms.length);seenWidths.add(w.width);seenDepths.add(w.depth);seenDoors.add(w.doorwayWidth);seenShapes.add(JSON.stringify(geometry(w)));
  assert.equal(new Set(w.plan.nodes.map(n=>n.id)).size,w.plan.nodes.length);
  assert.equal(new Set(w.plan.shapes.map(n=>n.id)).size,w.plan.shapes.length);
  assert.ok(w.plan.operations<=3000);assert.ok(w.plan.nodes.length<=64);
 }
 assert.deepEqual([...seenRooms].sort(),[2,3,4]);assert.equal(seenWidths.size,3);assert.equal(seenDepths.size,3);assert.equal(seenDoors.size,3);
 assert.ok(seenShapes.size>70,'Variation must change real geometry, not only IDs or tint');
 const before=compileWorkshop(73129);compileWorkshop(0xffffffff);compileWorkshop(0);assert.deepEqual(compileWorkshop(73129),before,'No load-order dependent random stream');
 // Changing only the cosmetic choice must leave every collision cuboid unchanged.
 const recipe=JSON.parse(JSON.stringify(workshopRecipe(73129))) as Recipe;
 assert.equal(recipe.expression.op,'group');
 if(recipe.expression.op==='group'){
  const finish=recipe.expression.children.find(e=>e.op==='choose');assert.ok(finish&&finish.op==='choose');
  const replacement={...finish,purpose:'other-wall-finish'};
  recipe.expression={op:'group',children:recipe.expression.children.map(e=>e===finish?replacement:e)};
 }
 const changed=compileRecipe(workshopRegistry,recipe,{seed:73129,owner:before.plan.owner,bounds:before.bounds});assert.equal(changed.valid,true);
 assert.deepEqual(geometry({...before,plan:changed}),geometry(before));
});

test('workshop graph, room programs and real doorway clearances stay reachable over seed corpus',()=>{
 for(let seed=0;seed<256;seed++){
  const w=compileWorkshop(seed),hall=w.rooms[0]!;
  assert.ok(w.rooms.length>=2&&w.rooms.length<=4);assert.equal(w.doors.length,w.rooms.length);
  assert.equal(w.doors[0]!.from,'outside');assert.equal(w.doors[0]!.to,hall.id);
  const reached=new Set(['outside']);for(let pass=0;pass<w.rooms.length;pass++)for(const door of w.doors)if(reached.has(door.from))reached.add(door.to);
  assert.ok(w.rooms.every(r=>reached.has(r.id)));
  assertSegmentClear(w,w.spawn,w.doors[0]!.center);assertSegmentClear(w,w.doors[0]!.center,hall.center);
  for(const room of w.rooms.slice(1)){
   const door=w.doors.find(d=>d.to===room.id)!;
   assert.ok(door.width>=1.4&&door.height>=2.6);
   assert.ok(room.max.x-room.min.x>=2.79);assert.ok(room.max.z-room.min.z>=3.29);
   assert.equal(door.center.z,room.max.z);
   assertSegmentClear(w,hall.center,{x:door.center.x,z:hall.center.z});
   assertSegmentClear(w,{x:door.center.x,z:hall.center.z},door.center);
   assertSegmentClear(w,door.center,room.center);
  }
  assertSegmentClear(w,hall.center,{x:w.workplace.x,z:hall.center.z});
  assertSegmentClear(w,{x:w.workplace.x,z:hall.center.z},w.workplace);
  const port=w.plan.exposed.find(p=>p.key==='workplace')!.port;
  assert.equal(port.type,'work');assert.equal(port.capacity,1);assert.equal(port.unit,'worker');
  assert.deepEqual(port.position,{...w.workplace,y:0});
  assert.ok(w.plan.constraints.find(c=>c.key==='all-rooms-reachable')?.ok);
 }
});

test('footprint reservations, resources and compiler failures are enforced rather than silently ignored',()=>{
 for(const seed of [0,1,2,42,73129,0xffffffff]){
  const w=compileWorkshop(seed);assert.equal(w.plan.valid,true);
  for(const [resource,max]of Object.entries(WORKSHOP_BUDGET))assert.ok((w.plan.costs[resource]??0)<=max);
  assert.ok(w.width<=9.6&&w.depth<=8.2);
  for(const s of w.plan.shapes){
   assert.ok(s.half.x>0&&s.half.y>0&&s.half.z>0);
   assert.ok(Math.abs(s.center.x-WORKSHOP_CLEARANCE.x)+s.half.x<=WORKSHOP_CLEARANCE.hx);
   assert.ok(Math.abs(s.center.z-WORKSHOP_CLEARANCE.z)+s.half.z<=WORKSHOP_CLEARANCE.hz);
   assert.deepEqual(w.plan.nodes.find(n=>n.id===s.nodeId)!.shapes[0],s,'One authoritative solid serves the render and physics adapters');
  }
  assert.ok(distance(w.spawn,{x:WORKSHOP_CLEARANCE.x,z:WORKSHOP_CLEARANCE.z})<7);
 }
 const materialBudget=compileWorkshop(1,{maxCost:{timber:1}});assert.equal(materialBudget.plan.valid,false);assert.ok(materialBudget.plan.constraints.some(c=>c.key==='context/budget/timber'&&!c.ok));
 const footprintBudget=compileWorkshop(1,{bounds:{key:'small-lot',...WORKSHOP_ORIGIN,hx:2,hz:2}});assert.equal(footprintBudget.plan.valid,false);assert.ok(footprintBudget.plan.constraints.some(c=>c.key.endsWith('/bounds')&&!c.ok));
 const blocked=compileWorkshop(1,{reservations:[{key:'protected-road',...WORKSHOP_ORIGIN,hx:1,hz:8}]});assert.equal(blocked.plan.valid,false);assert.ok(blocked.plan.constraints.some(c=>c.key.endsWith('/reservation/protected-road')&&!c.ok));
 for(const seed of [-1,1.1,0x100000000,NaN,Infinity])assert.throws(()=>compileWorkshop(seed),RangeError);
 assert.throws(()=>compileWorkshop(1,{origin:{x:Infinity,z:0}}),RangeError);
 const moved=compileWorkshop(73129,{origin:{x:10,z:12}});assert.equal(moved.plan.valid,true);assert.deepEqual(moved.origin,{x:10,z:12});
});

test('legacy positions are only rescued when new physical solids occupy them',()=>{
 const w=compileWorkshop(73129),wall=w.plan.shapes.find(s=>s.center.y===1.6)!;
 assert.deepEqual(safeWorkshopSpawn(w,{x:wall.center.x,z:wall.center.z}),w.spawn);
 for(const p of [w.spawn,w.rooms[0]!.center,w.workplace,{x:-13,z:12},{x:17,z:-19}])assert.deepEqual(safeWorkshopSpawn(w,p),p);
});

test('real full-height Rapier capsule enters every room, reaches workplace, exits and is stopped by walls',async()=>{
 await RAPIER.init();assert.equal(RAPIER.version(),'0.20.0');
 for(const seed of [...Array.from({length:24},(_,i)=>i),42,73129,0xffffffff]){
  const building=compileWorkshop(seed),hall=building.rooms[0]!,world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=1/60;
  world.createCollider(RAPIER.ColliderDesc.cuboid(48,.2,48).setTranslation(0,-.2,0));
  for(const s of building.plan.shapes.filter(s=>s.solid))world.createCollider(RAPIER.ColliderDesc.cuboid(s.half.x,s.half.y,s.half.z).setTranslation(s.center.x,s.center.y,s.center.z));
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(building.spawn.x,1.09,building.spawn.z));
  const collider=world.createCollider(RAPIER.ColliderDesc.capsule(.75,.32),body),controller=world.createCharacterController(.02);
  controller.enableAutostep(.35,.2,true);controller.enableSnapToGround(.3);
  const move=(x:number,z:number)=>{const p=body.translation();controller.computeColliderMovement(collider,{x,y:-.03,z});const v=controller.computedMovement();body.setNextKinematicTranslation({x:p.x+v.x,y:p.y+v.y,z:p.z+v.z});world.step();};
  const travel=(target:WorkshopPoint)=>{
   for(let i=0;i<400;i++){const p=body.translation(),dx=target.x-p.x,dz=target.z-p.z,n=Math.hypot(dx,dz);if(n<.055)break;const step=Math.min(n,.07);move(dx/n*step,dz/n*step);}
   assert.ok(distance(body.translation(),target)<.09,`seed ${seed} route blocked at ${JSON.stringify(body.translation())}, target ${JSON.stringify(target)}`);
  };
  try {
   travel(building.doors[0]!.center);travel(hall.center);
   for(const room of building.rooms.slice(1)){
    const door=building.doors.find(d=>d.to===room.id)!;
    travel({x:door.center.x,z:hall.center.z});travel(door.center);travel(room.center);
    travel(door.center);travel({x:door.center.x,z:hall.center.z});travel(hall.center);
   }
   travel({x:building.workplace.x,z:hall.center.z});travel(building.workplace);travel(hall.center);
   // An entrance route is physically open, while an ordinary perimeter span is not.
   for(let i=0;i<160;i++)move(-.07,0);
   const west=building.origin.x-building.width/2;
   assert.ok(body.translation().x>west+.40&&body.translation().x<west+.49,`west wall failed: ${JSON.stringify(body.translation())}`);
   travel(hall.center);travel(building.doors[0]!.center);travel(building.spawn);
   assert.ok(body.translation().y>1.06&&body.translation().y<1.12,'Standing capsule keeps its full height through door lintels');
  }finally{world.free();}
 }
});
