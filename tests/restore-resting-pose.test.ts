import test from 'node:test';import assert from 'node:assert/strict';import RAPIER from '@dimforge/rapier3d-compat';
import {createState,createConnectedState,serializeSave,parseSave,type State} from '../src/world.ts';
import {worldDungeon,worldWorkshop,worldValley} from '../src/generation.ts';
import {RESTORE_CAPSULE_RADIUS,restoreClear,safeWorkshopSpawn,workshopWalkable} from '../src/building.ts';
import {dungeonPlanWalkable,dungeonRestoreClear} from '../src/dungeon-plan.ts';
import {dungeonWalkable} from '../src/dungeon.ts';

type Box={x:number;y:number;z:number;hx:number;hy:number;hz:number};
/** Actual Rapier 0.20 explorer controller (capsule 0.75/0.32, skin 0.02) pressed into solids. */
function restingPose(boxes:readonly Box[],start:{x:number;y:number;z:number},dx:number,dz:number){
 const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=1/60;
 try{
  world.createCollider(RAPIER.ColliderDesc.cuboid(200,.2,200).setTranslation(start.x,start.y-.2,start.z));
  for(const b of boxes)world.createCollider(RAPIER.ColliderDesc.cuboid(b.hx,b.hy,b.hz).setTranslation(b.x,b.y,b.z));
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x,start.y+1.09,start.z));
  const collider=world.createCollider(RAPIER.ColliderDesc.capsule(.75,.32),body),controller=world.createCharacterController(.02);controller.enableAutostep(.35,.2,true);controller.enableSnapToGround(.3);
  for(let i=0;i<100;i++){const p=body.translation();controller.computeColliderMovement(collider,{x:dx*.1,y:-.03,z:dz*.1});const v=controller.computedMovement();body.setNextKinematicTranslation({x:p.x+v.x,y:p.y+v.y,z:p.z+v.z});world.step();}
  const p=body.translation();return {x:p.x,z:p.z};
 }finally{world.free();}
}
const reload=(s:State)=>{const loaded=parseSave(serializeSave(s));assert(loaded,'save must load');return loaded.player;};
const directions=[[-1,0],[1,0],[0,-1],[.7,.7],[-.7,.7],[-.7,-.7],[.7,-.7]] as const;

test('a controller resting against workshop or vault walls keeps its saved position on reload',async()=>{
 await RAPIER.init();assert.equal(RAPIER.version(),'0.20.0');assert(RESTORE_CAPSULE_RADIUS>.32&&RESTORE_CAPSULE_RADIUS<.34);
 // Generation 1: the pinned valley workshop. Previously every wall-resting pose was moved outside.
 for(const seed of [1,2,606]){
  const s=createState(seed),w=worldWorkshop(seed),hall=w.rooms[0]!,boxes=w.plan.shapes.filter(b=>b.solid&&b.center.y>0).map(b=>({x:b.center.x,y:b.center.y,z:b.center.z,hx:b.half.x,hy:b.half.y,hz:b.half.z}));
  for(const [dx,dz] of directions){const p=restingPose(boxes,{x:hall.center.x,y:0,z:hall.center.z},dx,dz);assert.deepEqual(reload({...s,player:{...s.player,...p}}),{...s.player,...p},`gen1 workshop ${seed} ${dx},${dz}`);}
 }
 // Generation 2: elevated valley workshops share the same restore radius.
 {const s=createConnectedState(73129),b=worldValley(73129).buildings[0]!,hall=b.rooms[0]!,boxes=b.plan.shapes.filter(q=>q.solid&&q.center.y>b.elevation+.05).map(q=>({x:q.center.x,y:q.center.y,z:q.center.z,hx:q.half.x,hy:q.half.y,hz:q.half.z}));
  for(const [dx,dz] of directions){const p=restingPose(boxes,{x:hall.center.x,y:b.elevation,z:hall.center.z},dx,dz);assert.deepEqual(reload({...s,player:{...s.player,...p}}),{...s.player,...p},`gen2 workshop ${dx},${dz}`);}}
 // Generation 2 vault threshold corners. Previously a diagonal corner pose reset to the entrance.
 for(const seed of [0,73129]){
  const s=createConnectedState(seed),d=worldDungeon(s),boxes=d.walls.map(w=>({x:w.x,y:w.hy,z:w.z,hx:w.hx,hy:w.hy,hz:w.hz}));
  for(const [dx,dz] of directions){const p=restingPose(boxes,{x:d.spawn.x,y:0,z:d.spawn.z},dx,dz);assert.deepEqual(reload({...s,zone:'dungeon',player:{...s.player,...p}}),{...s.player,...p},`gen2 vault ${seed} ${dx},${dz}`);}
 }
 // Generation 1 vault.
 {const s=createState(1),d=worldDungeon(s),boxes=d.walls.map(w=>({x:w.x,y:w.hy,z:w.z,hx:w.hx,hy:w.hy,hz:w.hz}));
  for(const [dx,dz] of directions){const p=restingPose(boxes,{x:0,y:0,z:24},dx,dz);assert.deepEqual(reload({...s,zone:'dungeon',player:{...s.player,...p}}),{...s.player,...p},`gen1 vault ${dx},${dz}`);}}
});

test('restore recovery still rejects genuine overlaps; design clearance helpers stay conservative',()=>{
 const w=worldWorkshop(1),wall=w.plan.shapes.find(s=>s.id.includes('west-wall'))!,hallZ=w.rooms[0]!.center.z;
 // 0.1 m half-thick wall + 0.32 m capsule: a centre 0.41 m away genuinely overlaps.
 const inside={x:wall.center.x+wall.half.x+.31,z:hallZ};assert.equal(restoreClear(w.plan.shapes,inside),false);assert.deepEqual(safeWorkshopSpawn(w,inside),w.spawn);
 const s=createState(1);assert.deepEqual(reload({...s,player:{...s.player,...inside}}),{...s.player,...w.spawn});
 assert.equal(restoreClear(w.plan.shapes,{x:NaN,z:0}),false);
 const c=createConnectedState(73129),d=worldDungeon(c),dw=d.walls.find(q=>q.hx<.2&&d.tiles.some(t=>t.x===q.x+1&&t.z===q.z))!,overlap={x:dw.x+dw.hx+.31,z:dw.z};
 assert.equal(dungeonRestoreClear(d,overlap.x,overlap.z,RESTORE_CAPSULE_RADIUS),false);assert.equal(dungeonRestoreClear(d,70,70,RESTORE_CAPSULE_RADIUS),false);
 assert.deepEqual(reload({...c,zone:'dungeon',player:{...c.player,...overlap}}),{...c.player,...d.spawn});
 // Navigation/design checks keep their conservative square 0.34 m clearance.
 const edge={x:dw.x+dw.hx+.335,z:dw.z};assert.equal(dungeonPlanWalkable(d,edge.x,edge.z),false);assert.equal(dungeonRestoreClear(d,edge.x,edge.z,RESTORE_CAPSULE_RADIUS),true);
 assert.equal(dungeonWalkable(1,-4.53,24),true);assert.equal(dungeonWalkable(1,-4.545,24),false);
 const near={x:wall.center.x+wall.half.x+.335,z:hallZ};assert.equal(workshopWalkable(w,near),false);assert.equal(restoreClear(w.plan.shapes,near),true);
});
