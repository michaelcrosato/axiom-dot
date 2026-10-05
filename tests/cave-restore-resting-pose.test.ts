import test from 'node:test';import assert from 'node:assert/strict';import RAPIER from '@dimforge/rapier3d-compat';
import {naturalCave} from '../src/natural-cave.ts';
import {createCaveWater,safeCavePosition} from '../src/cave-water.ts';
import {createState,serializeSave,parseSave} from '../src/world.ts';

/** Actual Rapier 0.20 explorer controller (capsule 0.75/0.32, skin 0.02) pressed into cave walls. */
function restingPose(boxes:readonly {x:number;z:number;hx:number;hz:number}[],start:{x:number;z:number},dx:number,dz:number){
 const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=1/60;
 try{
  world.createCollider(RAPIER.ColliderDesc.cuboid(200,.2,200).setTranslation(start.x,-.2,start.z));
  for(const b of boxes)world.createCollider(RAPIER.ColliderDesc.cuboid(b.hx,1.5,b.hz).setTranslation(b.x,1.5,b.z));
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x,1.09,start.z));
  const collider=world.createCollider(RAPIER.ColliderDesc.capsule(.75,.32),body),controller=world.createCharacterController(.02);controller.enableAutostep(.35,.2,true);controller.enableSnapToGround(.3);
  for(let i=0;i<100;i++){const p=body.translation();controller.computeColliderMovement(collider,{x:dx*.1,y:-.03,z:dz*.1});const v=controller.computedMovement();body.setNextKinematicTranslation({x:p.x+v.x,y:p.y+v.y,z:p.z+v.z});world.step();}
  const p=body.translation();return {x:p.x,z:p.z};
 }finally{world.free();}
}
const directions=[[-1,0],[1,0],[0,-1],[0,1],[.7,.7],[-.7,.7],[-.7,-.7],[.7,-.7]] as const;

test('a controller resting against river-cave walls or corners keeps its saved position',async()=>{
 await RAPIER.init();
 // Seeds 1, 42 and 73129 previously sent a corner/wall-resting pose back to the cave spawn.
 for(const seed of [1,42,73129]){
  const plan=naturalCave(seed),water=createCaveWater(seed);
  for(const [dx,dz] of directions){
   const p=restingPose(plan.walls,plan.spawn,dx,dz);
   assert.deepEqual(safeCavePosition(water,p,plan),p,`cave ${seed} ${dx},${dz}`);
  }
 }
 // The same pose survives a real save round trip in the cave zone.
 const s=createState(1),plan=naturalCave(1),p=restingPose(plan.walls,plan.spawn,.7,.7),cave={...s,zone:'cave' as const,caveWater:createCaveWater(1),player:{...s.player,...p}};
 const loaded=parseSave(serializeSave(cave));if(loaded?.zone==='cave')assert.deepEqual({x:loaded.player.x,z:loaded.player.z},p);
});

test('genuine cave wall overlaps are still relocated to a dry bank',()=>{
 const plan=naturalCave(1),water=createCaveWater(1),wall=plan.walls.find(w=>w.hx<=1.2&&w.hz<=1.2)!;
 const inside={x:wall.x,z:wall.z},safe=safeCavePosition(water,inside,plan);
 assert.notDeepEqual(safe,inside);
 assert.deepEqual(safeCavePosition(water,{x:NaN,z:0},plan),safeCavePosition(water,{x:NaN,z:1},plan));
});
