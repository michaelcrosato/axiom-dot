import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {causalPlan} from '../src/causal.ts';
import {worldValley} from '../src/generation.ts';
import {GRID_CELLS,PART_DEFS,validMachine,moduleObstacles,type Part,type Rotation} from '../src/waterworks.ts';

/** Traverse exact agent polylines, not a parallel hand-written route. They are plan-proven
 * kinematic NPC routes, not dynamically colliding multi-agent Rapier characters. */
test('real standing Rapier capsule traverses every causal route both ways despite every legal build footprint',{timeout:60_000},async()=>{
 await RAPIER.init();let traversals=0;
 for(const seed of [0,1,7,42,73129,0xffffffff]){
  const valley=worldValley(seed),plan=causalPlan(seed),world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=1/60;
  world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(valley.terrain.vertices),new Uint32Array(valley.terrain.indices)));
  for(const s of [...valley.bridges,...valley.foundations,...valley.infrastructure,...valley.buildings.flatMap(b=>b.plan.shapes)].filter(s=>s.solid))world.createCollider(RAPIER.ColliderDesc.cuboid(s.half.x,s.half.y,s.half.z).setTranslation(s.center.x,s.center.y,s.center.z));
  for(const tree of valley.decorations.filter(d=>d.kind==='tree'&&d.height/4>1.3))world.createCollider(RAPIER.ColliderDesc.cuboid(.23,1,.23).setTranslation(tree.x,tree.y+1,tree.z));
  // Conservative union: it is stricter than any one legal 12-module layout.
  const fixtures=new Set<string>(),origin=valley.endpoints.buildOrigin;
  for(const cell of GRID_CELLS)for(const kind of Object.keys(PART_DEFS) as Part[])for(const rotation of [0,1,2,3] as Rotation[]){const m={id:'test-module',kind,...cell,rotation};if(!validMachine({parts:[m],links:[],stored:0,extracted:0,delivered:0,drained:0}))continue;
   for(const o of moduleObstacles(m)){const key=JSON.stringify(o);if(fixtures.has(key))continue;fixtures.add(key);world.createCollider(RAPIER.ColliderDesc.cuboid(o.hx,o.hy,o.hz).setTranslation(o.x+origin.x,o.hy+origin.y,o.z+origin.z));}
  }
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()),collider=world.createCollider(RAPIER.ColliderDesc.capsule(.75,.32),body),controller=world.createCharacterController(.02);
  controller.enableAutostep(.35,.2,true);controller.enableSnapToGround(.3);controller.setMaxSlopeClimbAngle(Math.PI/4);controller.setMinSlopeSlideAngle(Math.PI/4);controller.setNormalNudgeFactor(.001);
  const move=(x:number,z:number)=>{const p=body.translation();controller.computeColliderMovement(collider,{x,y:-.05,z});const v=controller.computedMovement();body.setNextKinematicTranslation({x:p.x+v.x,y:p.y+v.y,z:p.z+v.z});world.step();};
  try{for(const route of plan.routes)for(const reverse of [false,true]){
   const points=reverse?[...route.points].reverse():route.points,start=points[0]!;body.setTranslation({x:start.x,y:start.y+1.1,z:start.z},true);body.setNextKinematicTranslation({x:start.x,y:start.y+1.1,z:start.z});world.step();for(let i=0;i<12;i++)move(0,0);
   for(const point of points){let reached=false;for(let i=0;i<450;i++){const pos=body.translation(),dx=point.x-pos.x,dz=point.z-pos.z,d=Math.hypot(dx,dz);if(d<.045){reached=true;break;}const step=Math.min(d,2.6/60);move(dx/d*step,dz/d*step);}assert.ok(reached,`seed ${seed}, ${route.id}, reverse ${reverse}: blocked at ${JSON.stringify(body.translation())} toward ${JSON.stringify(point)}`);}traversals++;
  }}finally{world.free();}
 }
 assert.equal(traversals,156);
});
