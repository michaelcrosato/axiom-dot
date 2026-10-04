import test from 'node:test';import assert from 'node:assert/strict';import {generateRegionalChunk,REGION_BOUND,regionalTownRoads,regionalHeight} from '../src/regional-world.ts';import {startingTown,TOWN_SPAWN,TOWN_CENTER} from '../src/starting-town.ts';import {regionalPhysics} from './helpers/regional-physics.ts';
const packet=(seed:number,cx:number,cz:number)=>{const c=generateRegionalChunk(seed,cx,cz);return {key:'region:'+c.key,revision:1,bounds:c.bounds,terrain:c.terrain,obstacles:[...c.structures.filter(s=>s.solid).map(s=>({x:s.center.x,y:s.center.y,z:s.center.z,hx:s.half.x,hy:s.half.y,hz:s.half.z})),...c.features.flatMap(f=>f.solids)]};};
const cells=(x:number,z:number)=>{const out=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)out.push(packet(73129,Math.floor(x/64)+dx,Math.floor(z/64)+dz));return out;};
test('real Rapier initial town preload remains paused, has clear square spawn and moves after explicit input',async t=>{const physics=await regionalPhysics(t,{x:TOWN_SPAWN.x,z:TOWN_SPAWN.z,y:6,initialCells:cells(TOWN_SPAWN.x,TOWN_SPAWN.z),bound:REGION_BOUND,startPaused:true});const before=physics.latest;await physics.tick(30);assert.equal(physics.latest.step,0);assert(Math.hypot(physics.latest.x-TOWN_SPAWN.x,physics.latest.z-TOWN_SPAWN.z)<.05);assert(Math.abs(physics.latest.feetY-6)<.05);assert.equal(physics.latest.streaming?.terrainCells,9);physics.input({x:1,z:0,paused:false});await physics.tick(90);assert(physics.latest.x>before.x+3);assert(Math.abs(physics.latest.feetY-6)<.07);});
test('real controller recovers old new-wall overlap before ready and open-front shop entrance is physically walkable',async t=>{const shop=startingTown(73129).shops[0]!,wall=shop.boxes[0]!,physics=await regionalPhysics(t,{x:wall.center.x,z:wall.center.z,y:6,initialCells:cells(wall.center.x,wall.center.z),bound:REGION_BOUND,startPaused:true});assert(Math.hypot(physics.latest.x-wall.center.x,physics.latest.z-wall.center.z)>.35);await physics.zone({x:shop.entry.x,z:shop.entry.z,y:6,initialCells:cells(shop.entry.x,shop.entry.z),startPaused:true});physics.input({x:0,z:-1,paused:false});await physics.tick(70);assert(physics.latest.z<shop.entry.z-4);assert(Math.abs(physics.latest.x-shop.entry.x)<.1);assert(physics.latest.grounded);});
test('town connector centerline is continuous, terrain-matched and below the 30% walking grade across representative seeds',()=>{for(const seed of [0,1,42,73129,0xffffffff]){const road=regionalTownRoads(seed).find(r=>r.id.endsWith('valley-access'))!;let max=0;for(let j=1;j<road.points.length;j++){const a=road.points[j-1]!,b=road.points[j]!,distance=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(distance/.5);let last=regionalHeight(seed,a.x,a.z);for(let i=1;i<=steps;i++){const t=i/steps,y=regionalHeight(seed,a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t);max=Math.max(max,Math.abs(y-last)/(distance/steps));last=y;}}assert(max<.3,`seed ${seed} grade ${max}`);}});

test('real Rapier recovers added-house wall overlaps before ready and walks both outer-row doorways',async t=>{
 const plan=startingTown(73129);
 for(const homeIndex of [20,39]){
  const house=plan.homes[homeIndex]!,wall=house.boxes.find(b=>b.id.endsWith('/back'))!;
  assert(Math.abs(house.center.z-TOWN_CENTER.z)===50);
  const physics=await regionalPhysics(t,{x:wall.center.x,z:wall.center.z,y:6,initialCells:cells(wall.center.x,wall.center.z),bound:REGION_BOUND,startPaused:true});
  assert(Math.hypot(physics.latest.x-wall.center.x,physics.latest.z-wall.center.z)>.35,'old save overlap is recovered before movement');
  assert.equal(physics.latest.step,0);await physics.tick(30);assert.equal(physics.latest.step,0);
  await physics.zone({x:house.entry.x,z:house.entry.z,y:6,initialCells:cells(house.entry.x,house.entry.z),startPaused:true});
  const inward=Math.sign(house.center.z-house.entry.z);physics.input({x:0,z:inward,paused:false});await physics.tick(60);
  assert((physics.latest.z-house.entry.z)*inward>3.5,'open doorway admits the actual capsule');
  assert(Math.abs(physics.latest.x-house.entry.x)<.1);assert(physics.latest.grounded);assert(Math.abs(physics.latest.feetY-6)<.07);
 }
});
