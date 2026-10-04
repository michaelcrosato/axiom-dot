import test from 'node:test';import assert from 'node:assert/strict';
import {generateDungeon,CAVE_ENTRANCE,DUNGEON_SPAWN} from '../src/dungeon.ts';
import {createState,applyAction,parseSave,serializeSave,validateSave} from '../src/world.ts';
import RAPIER from '@dimforge/rapier3d-compat';
// Exclude seed-bearing IDs and labels: this legacy generator has exactly two mirrored layouts.
const geometrySignature=(seed:number)=>{const d=generateDungeon(seed);return JSON.stringify({rooms:d.rooms.map(({x,z})=>({x,z})),tiles:d.tiles,walls:d.walls,objects:d.objects.map(({x,z})=>({x,z}))});};
const OPPOSITE_GEOMETRY_SEEDS=[1,606] as const;
test('seeded chamber grammar is deterministic, connected and keeps stable unique entity IDs',()=>{
 for(const seed of [0,1,7,42,73129,4294967295]){
  const d=generateDungeon(seed);assert.deepEqual(d,generateDungeon(seed));assert.equal(d.rooms.length,5);
  const tiles=new Set(d.tiles.map(t=>`${t.x}:${t.z}`));const visited=new Set<string>();const queue=[DUNGEON_SPAWN];
  while(queue.length){const t=queue.pop()!,k=`${t.x}:${t.z}`;if(visited.has(k)||!tiles.has(k))continue;visited.add(k);for(const [x,z]of [[2,0],[-2,0],[0,2],[0,-2]])queue.push({x:t.x+x!,z:t.z+z!});}
  assert.equal(visited.size,tiles.size);for(const o of d.objects)assert.ok(visited.has(`${o.x}:${o.z}`));
  assert.equal(new Set(d.objects.map(o=>o.id)).size,d.objects.length);
 }
 assert.equal(geometrySignature(1),geometrySignature(2),'Different IDs alone do not establish geometry variation');
 assert.notEqual(geometrySignature(OPPOSITE_GEOMETRY_SEEDS[0]),geometrySignature(OPPOSITE_GEOMETRY_SEEDS[1]));
 assert.equal(new Set(Array.from({length:2048},(_,seed)=>geometrySignature(seed))).size,2,'Current generator supplies exactly two mirrored geometries');
});
test('entry exit and emergency recall are bounded; loot and encounter tombstones survive reloads',()=>{
 let s=createState(73129);assert.equal(applyAction(s,{type:'enter'}),s);
 s=applyAction(s,{type:'move',...CAVE_ENTRANCE});s=applyAction(s,{type:'enter'});assert.equal(s.zone,'dungeon');
 assert.equal(applyAction(s,{type:'collect',id:'scrap-1'}),s);assert.equal(applyAction(s,{type:'repair'}),s);
 for(const o of generateDungeon(s.seed).objects.filter(o=>o.kind!=='exit')){
  s=applyAction(s,{type:'move',x:o.x,z:o.z});s=applyAction(s,o.kind==='enemy'?{type:'attack',id:o.id}:{type:'collect',id:o.id});
 }
 assert.deepEqual(s.inventory,{scrap:1,core:1,water:1});assert.equal(s.defeated.length,3);assert.ok(validateSave(s));
 s=parseSave(serializeSave(s))!;assert.equal(s.zone,'dungeon');assert.equal(applyAction(s,{type:'exit'}),s);
 s=applyAction(s,{type:'move',...DUNGEON_SPAWN});s=applyAction(s,{type:'exit'});assert.equal(s.zone,'valley');
 s=applyAction(s,{type:'enter'});assert.equal(s.zone,'dungeon');
 for(const o of generateDungeon(s.seed).objects){s=applyAction(s,{type:'move',x:o.x,z:o.z});assert.equal(applyAction(s,{type:'collect',id:o.id}),s);}
 const recalled=applyAction({...s,player:{...s.player,hp:0}},{type:'respawn'});assert.equal(recalled.zone,'valley');assert.deepEqual(recalled.inventory,s.inventory);assert.deepEqual(recalled.defeated,s.defeated);assert.ok(validateSave(recalled));
});
test('v1 migration preserves old progress and rejects unknown IDs; dungeon import recovers wall positions',()=>{
 let old=applyAction(createState(73129),{type:'move',x:-9,z:8});old=applyAction(old,{type:'collect',id:'scrap-1'});
 const {zone,...withoutZone}=old;const migrated=parseSave(JSON.stringify({...withoutZone,schemaVersion:1}))!;
 assert.deepEqual(migrated,old);assert.equal(parseSave(JSON.stringify({...withoutZone,schemaVersion:9})),null);
 const bad={...old,zone:'dungeon',player:{x:45,z:45,hp:80}};const rescued=parseSave(JSON.stringify(bad))!;assert.deepEqual(rescued.player,{...DUNGEON_SPAWN,hp:80});
});
test('real Rapier capsule traverses every corridor and room-center route and remains blocked by perimeter',async()=>{
 await RAPIER.init();for(const seed of OPPOSITE_GEOMETRY_SEEDS){
  const d=generateDungeon(seed),w=new RAPIER.World({x:0,y:-9.81,z:0});w.timestep=1/60;
  w.createCollider(RAPIER.ColliderDesc.cuboid(48,.2,48).setTranslation(0,-.2,0));
  for(const o of d.walls)w.createCollider(RAPIER.ColliderDesc.cuboid(o.hx,o.hy,o.hz).setTranslation(o.x,o.hy,o.z));
  const b=w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,1,24));const c=w.createCollider(RAPIER.ColliderDesc.capsule(.55,.32),b);const controller=w.createCharacterController(.02);controller.enableAutostep(.35,.2,true);controller.enableSnapToGround(.3);
  const move=(x:number,z:number)=>{const p=b.translation();controller.computeColliderMovement(c,{x,y:-.03,z});const v=controller.computedMovement();b.setNextKinematicTranslation({x:p.x+v.x,y:p.y+v.y,z:p.z+v.z});w.step();};
  const route=[d.rooms[1]!,d.rooms[2]!,d.rooms[1]!,d.rooms[3]!,d.rooms[4]!,d.rooms[3]!,d.rooms[1]!,d.rooms[0]!];
  for(const target of route){for(let i=0;i<400;i++){const p=b.translation(),dx=target.x-p.x,dz=target.z-p.z,n=Math.hypot(dx,dz);if(n<.1)break;move(dx/n*.08,dz/n*.08);}assert.ok(Math.hypot(b.translation().x-target.x,b.translation().z-target.z)<.15,`Route blocked ${seed} ${target.name} at ${JSON.stringify(b.translation())}`);}
  for(let i=0;i<150;i++)move(0,.08);assert.ok(b.translation().z<28.7,'Threshold south wall blocks');w.free();
 }
});
