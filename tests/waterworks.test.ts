import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {PADS,LINKS,emptyWaterworks,build,flow,validMachine,supplyWorking,machineObstacles} from '../src/waterworks.ts';
import {createState,generateObjects,applyAction,serializeSave,parseSave,validateSave} from '../src/world.ts';
import {generateDungeon} from '../src/dungeon.ts';
const player={x:-10,z:10};
function assembled(){let machine=emptyWaterworks(),inventory={scrap:3,core:1,water:0};for(const p of PADS)({machine,inventory}=build(machine,inventory,{type:'place',pad:p.id,kind:p.kind,x:p.x,z:p.z},player,'valley'));for(const link of LINKS)({machine,inventory}=build(machine,inventory,{type:'connect',link},player,'valley'));return {machine,inventory};}
test('assembly consumes exact cost, socket joins require matching modules, invalid placements leave state unchanged',()=>{
 const w=emptyWaterworks(),inv={scrap:3,core:1,water:0};const p=PADS[0];
 for(const [command,pos,zone] of [
  [{type:'place',pad:p.id,kind:p.kind,x:0,z:0},player,'valley'],
  [{type:'place',pad:p.id,kind:'pipe',x:p.x,z:p.z},player,'valley'],
  [{type:'place',pad:p.id,kind:p.kind,x:p.x,z:p.z},p,'valley'],
  [{type:'place',pad:p.id,kind:p.kind,x:p.x,z:p.z},{x:40,z:40},'valley'],
  [{type:'place',pad:p.id,kind:p.kind,x:p.x,z:p.z},player,'dungeon'],
  [{type:'connect',link:LINKS[0]},player,'valley'],
 ] as const){assert.equal(build(w,inv,command,pos,zone).machine,w);}
 const a=assembled();assert.deepEqual(a.inventory,{scrap:0,core:0,water:0});assert.equal(a.machine.parts.length,4);assert.equal(a.machine.links.length,3);assert.ok(validMachine(a.machine));
 assert.equal(build(a.machine,a.inventory,{type:'place',pad:p.id,kind:p.kind,x:p.x,z:p.z},player,'valley').machine,a.machine);
});
test('flow conserves every litre, clamps time/capacity, disconnected tank drains, empty outlet stops supply',()=>{
 let {machine,inventory}=assembled();for(let i=0;i<60;i++)machine=flow(machine,1);
 assert.equal(machine.stored,20);assert.equal(machine.extracted,machine.delivered+machine.stored);assert.ok(supplyWorking(machine));
 ({machine}=build(machine,inventory,{type:'disconnect',link:LINKS[0]},player,'valley'));
 const extracted=machine.extracted;for(let i=0;i<30;i++)machine=flow(machine,1);
 assert.equal(machine.extracted,extracted);assert.equal(machine.stored,0);assert.equal(supplyWorking(machine),false);assert.equal(machine.extracted,machine.delivered);
 for(const dt of [NaN,Infinity,-1,0])assert.equal(flow(machine,dt),machine);
 const a=assembled().machine;assert.deepEqual(flow(a,1e8),flow(a,1));let fine=a,coarse=a;for(let i=0;i<3600;i++)fine=flow(fine,1/60);for(let i=0;i<60;i++)coarse=flow(coarse,1);for(const key of ['stored','extracted','delivered'] as const)assert.ok(Math.abs(fine[key]-coarse[key])<1e-8);
 let tank=build(a,inventory,{type:'disconnect',link:LINKS[2]},player,'valley').machine;for(let i=0;i<40;i++)tank=flow(tank,1);assert.equal(tank.stored,20);assert.equal(tank.extracted,20);assert.equal(tank.delivered,0);let varied=assembled().machine;for(let i=0;i<10000;i++){varied=flow(varied,(i%17+1)/29);assert.ok(validMachine(varied));}
});
test('dismantle drains conservatively, removes incident edges, refunds once and rebuild cannot duplicate resources',()=>{
 let {machine,inventory}=assembled();machine=flow(machine,1);
 const removed=build(machine,inventory,{type:'dismantle',pad:'tank'},player,'valley');assert.equal(removed.machine.stored,0);assert.equal(removed.machine.drained,1);assert.equal(removed.inventory.scrap,1);assert.deepEqual(removed.machine.links,['intake.out>transfer.in']);assert.ok(validMachine(removed.machine));
 assert.equal(build(removed.machine,removed.inventory,{type:'dismantle',pad:'tank'},player,'valley').machine,removed.machine);
 ({machine,inventory}=removed);for(const p of PADS)({machine,inventory}=build(machine,inventory,{type:'dismantle',pad:p.id},player,'valley'));assert.deepEqual(inventory,{scrap:3,core:1,water:0});assert.ok(validMachine(machine));
});
test('legacy payments and discoveries migrate, construction accounts for resources and survives roundtrip',()=>{
 let s=createState(9);for(const o of generateObjects(s.seed).filter(o=>['scrap','core'].includes(o.kind))){s=applyAction(s,{type:'move',x:o.x,z:o.z});s=applyAction(s,{type:'collect',id:o.id});}
 s=applyAction(s,{type:'move',x:0,z:16});s=applyAction(s,{type:'repair'});
 const legacy={...s,schemaVersion:2,waterworks:undefined};const recovered=parseSave(JSON.stringify({...legacy,zone:'dungeon',player:{x:47,z:47,hp:100}}))!;assert.ok(recovered);assert.notEqual(recovered.player.x,47);const migrated=parseSave(JSON.stringify(legacy))!;assert.ok(migrated);assert.equal(migrated.waterRestored,true);assert.deepEqual(migrated.inventory,s.inventory);assert.deepEqual(migrated.waterworks,emptyWaterworks());
 // Remaining dungeon core and new yard salvage make both old repair and construction feasible.
 const core=generateDungeon(s.seed).objects.find(o=>o.kind==='core')!;s={...s,zone:'dungeon',player:{...s.player,x:core.x,z:core.z}};s=applyAction(s,{type:'collect',id:core.id});s={...s,zone:'valley',player:{...s.player,...player}};
 for(const p of PADS)s=applyAction(s,{type:'build',command:{type:'place',pad:p.id,kind:p.kind,x:p.x,z:p.z}});
 for(const link of LINKS)s=applyAction(s,{type:'build',command:{type:'connect',link}});
 s=applyAction(s,{type:'tick',dt:1});assert.ok(validateSave(s));assert.equal(s.waterworks.parts.length,4);assert.deepEqual(parseSave(serializeSave(s)),s);
 assert.equal(validateSave({...s,inventory:{...s.inventory,scrap:s.inventory.scrap+1}}),false);
 for(const machine of [{...s.waterworks,stored:21},{...s.waterworks,delivered:100},{...s.waterworks,parts:['intake','intake']},{...emptyWaterworks(),links:[LINKS[0]]}])assert.equal(validMachine(machine),false);
 const noMachine={...s,waterworks:undefined};assert.equal(validateSave(noMachine),false);
});
test('actual Rapier capsule is blocked by installed reservoir and can pass after removal',async()=>{
 await RAPIER.init();const world=new RAPIER.World({x:0,y:-9.81,z:0});world.timestep=1/60;
 try{world.createCollider(RAPIER.ColliderDesc.cuboid(48,.2,48).setTranslation(0,-.2,0));const o=machineObstacles({...emptyWaterworks(),parts:[{...PADS[2],rotation:0}]})[0]!;const wall=world.createCollider(RAPIER.ColliderDesc.cuboid(o.hx,o.hy,o.hz).setTranslation(o.x,o.hy,o.z));const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(-11,1,10));const capsule=world.createCollider(RAPIER.ColliderDesc.capsule(.55,.32),body);const controller=world.createCharacterController(.02);controller.enableAutostep(.35,.2,true);controller.enableSnapToGround(.3);
 const step=()=>{controller.computeColliderMovement(capsule,{x:0,y:-.03,z:-5/60});const p=body.translation(),v=controller.computedMovement();body.setNextKinematicTranslation({x:p.x+v.x,y:p.y+v.y,z:p.z+v.z});world.step();};for(let i=0;i<100;i++)step();assert.ok(body.translation().z>7.15);world.removeCollider(wall,true);for(let i=0;i<60;i++)step();assert.ok(body.translation().z<4);
 }finally{world.free();}
});
