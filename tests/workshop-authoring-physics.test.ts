import test from 'node:test';import assert from 'node:assert/strict';import RAPIER from '@dimforge/rapier3d-compat';
import {compileWorkshopDraft,DEFAULT_WORKSHOP_DRAFT} from '../src/workshop-authoring.ts';
import type {WorkshopPoint} from '../src/building.ts';
test('Rapier 0.20 full-height capsule traverses authored doorways, rooms and workplace at bounded extremes',async()=>{
 await RAPIER.init();assert.equal(RAPIER.version(),'0.20.0');
 for(const rearRooms of [1,2,3])for(const high of [false,true])for(const narrow of [false,true]){
  const result=compileWorkshopDraft({...DEFAULT_WORKSHOP_DRAFT,rearRooms,width:high?9.6:8.4,depth:high?8.2:7,hallDepth:high?3.7:3.1,doorwayWidth:narrow?1.4:1.8}),building=result.workshop,world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=1/60;
  world.createCollider(RAPIER.ColliderDesc.cuboid(20,.2,20).setTranslation(0,-.2,0));for(const s of building.plan.shapes.filter(s=>s.solid))world.createCollider(RAPIER.ColliderDesc.cuboid(s.half.x,s.half.y,s.half.z).setTranslation(s.center.x,s.center.y,s.center.z));
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(building.spawn.x,1.09,building.spawn.z));const collider=world.createCollider(RAPIER.ColliderDesc.capsule(.75,.32),body),controller=world.createCharacterController(.02);controller.enableAutostep(.35,.2,true);controller.enableSnapToGround(.3);
  const move=(x:number,z:number)=>{const p=body.translation();controller.computeColliderMovement(collider,{x,y:-.03,z});const v=controller.computedMovement();body.setNextKinematicTranslation({x:p.x+v.x,y:p.y+v.y,z:p.z+v.z});world.step();};
  const travel=(target:WorkshopPoint)=>{for(let i=0;i<400;i++){const p=body.translation(),dx=target.x-p.x,dz=target.z-p.z,n=Math.hypot(dx,dz);if(n<.055)break;const step=Math.min(n,.07);move(dx/n*step,dz/n*step);}assert(Math.hypot(body.translation().x-target.x,body.translation().z-target.z)<.09,`Blocked ${rearRooms}/${high}/${narrow} at ${JSON.stringify(target)}`);};
  try{const hall=building.rooms[0]!;travel(building.doors[0]!.center);travel(hall.center);for(const route of result.routes.slice(1)){for(const point of route.points)travel(point);for(const point of [...route.points].reverse())travel(point);}for(let i=0;i<160;i++)move(-.07,0);assert(body.translation().x>-building.width/2+.4);travel(hall.center);travel(building.doors[0]!.center);travel(building.spawn);assert(body.translation().y>1.06&&body.translation().y<1.12);}finally{world.free();}
 }
});
