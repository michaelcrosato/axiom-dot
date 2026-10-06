import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {startingTown,TOWN_CENTER,townTerrainHeight} from '../src/starting-town.ts';
import {townNavigationClear,TOWN_NAV_WALL_RADIUS} from '../src/town-navigation.ts';
import {compileWorkshopDraft,DEFAULT_WORKSHOP_DRAFT} from '../src/workshop-authoring.ts';
import {WORKSHOP_PARCEL,WORKSHOP_BOARD,workshopConstructionBoxes,workshopParcelClear} from '../src/workshop-construction.ts';

test('campaign parcel extrema preserve the entire accepted NPC navigation band and flat foundations',()=>{
 for(const seed of [0,4294967295])for(const rearRooms of [1,2,3])for(const width of [8.4,9.6])for(const depth of [7,8.2])for(const hallDepth of [3.1,3.7])for(const doorwayWidth of [1.4,1.8]){
  const parameters={seed,rearRooms,width,depth,hallDepth,doorwayWidth},boxes=workshopConstructionBoxes({parameters});
  assert.ok(workshopParcelClear(seed,parameters));
  for(const b of boxes){
   // Every legal saved resident, waypoint, departure, detour and trace is z >= center.z-48.
   // Excluding this entire band protects all 100 identities, not one sampled route.
   assert.ok(b.center.z+b.half.z+TOWN_NAV_WALL_RADIUS+.02<TOWN_CENTER.z-48,b.id);
   for(const dx of [-b.half.x,b.half.x])for(const dz of [-b.half.z,b.half.z])for(const original of [-100,100])assert.equal(townTerrainHeight(b.center.x+dx,b.center.z+dz,original),6);
  }
 }
 const plan=startingTown(0);
 assert.ok(townNavigationClear(plan,{x:TOWN_CENTER.x,z:TOWN_CENTER.z-47.8},{x:TOWN_CENTER.x,z:TOWN_CENTER.z-47.8}));
 assert.equal(townNavigationClear(plan,{x:TOWN_CENTER.x,z:TOWN_CENTER.z-48},{x:TOWN_CENTER.x,z:TOWN_CENTER.z-48}),false);
});

test('campaign Rapier capsule reaches northern board and every commissioned room from the existing west trunk',async()=>{
 await RAPIER.init();
 for(const rearRooms of [1,2,3])for(const high of [false,true]){
  const parameters={...DEFAULT_WORKSHOP_DRAFT,rearRooms,width:high?9.6:8.4,depth:high?8.2:7,hallDepth:high?3.7:3.1,doorwayWidth:1.4},compiled=compileWorkshopDraft(parameters),world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=1/60;
  world.createCollider(RAPIER.ColliderDesc.cuboid(65,.2,65).setTranslation(TOWN_CENTER.x,5.8,TOWN_CENTER.z));
  for(const b of [...startingTown(7).boxes,...workshopConstructionBoxes({parameters})].filter(b=>b.solid))world.createCollider(RAPIER.ColliderDesc.cuboid(b.half.x,b.half.y,b.half.z).setTranslation(b.center.x,b.center.y,b.center.z));
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(TOWN_CENTER.x-49.3,7.09,TOWN_CENTER.z));
  const collider=world.createCollider(RAPIER.ColliderDesc.capsule(.75,.32),body),controller=world.createCharacterController(.02);controller.enableAutostep(.35,.2,true);controller.enableSnapToGround(.3);
  const travel=(target:{x:number;z:number})=>{for(let i=0;i<1300;i++){const p=body.translation(),dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz);if(d<.05)break;const step=Math.min(d,.07);controller.computeColliderMovement(collider,{x:dx/d*step,y:-.03,z:dz/d*step});const m=controller.computedMovement();body.setNextKinematicTranslation({x:p.x+m.x,y:p.y+m.y,z:p.z+m.z});world.step();}assert.ok(Math.hypot(body.translation().x-target.x,body.translation().z-target.z)<.09,`blocked ${rearRooms}/${high} at ${JSON.stringify(target)}`);};
  const translated=(p:{x:number;z:number})=>({x:p.x+WORKSHOP_PARCEL.x,z:p.z+WORKSHOP_PARCEL.z});
  try{
   travel({x:TOWN_CENTER.x-49.3,z:WORKSHOP_BOARD.z});travel(WORKSHOP_BOARD);travel(translated(compiled.workshop.spawn));travel(translated(compiled.workshop.doors[0]!.center));travel(translated(compiled.workshop.rooms[0]!.center));
   for(const route of compiled.routes.slice(1)){for(const p of route.points)travel(translated(p));for(const p of [...route.points].reverse())travel(translated(p));}
   travel(translated(compiled.workshop.doors[0]!.center));travel(WORKSHOP_BOARD);travel({x:TOWN_CENTER.x-49.3,z:WORKSHOP_BOARD.z});travel({x:TOWN_CENTER.x-49.3,z:TOWN_CENTER.z});
   assert.ok(body.translation().y>7.06&&body.translation().y<7.12);
  }finally{world.free();}
 }
});
