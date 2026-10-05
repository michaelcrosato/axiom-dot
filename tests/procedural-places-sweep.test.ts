import test from 'node:test';import assert from 'node:assert/strict';
import {generateDungeonPlan,dungeonPlanWalkable} from '../src/dungeon-plan.ts';
import {encounterClear,ENEMY_RULES} from '../src/encounters.ts';
import {compileWorkshop,workshopWalkable} from '../src/building.ts';
import {compileWorkshopDraft,WORKSHOP_AUTHORING_FIELDS,type WorkshopDraft} from '../src/workshop-authoring.ts';
import {startingTown} from '../src/starting-town.ts';
import {townNavigationClear,townLifeTaskPoint,townLifeTaskStages} from '../src/town-navigation.ts';
import {townLifeFacilities} from '../src/town-life.ts';

/** Seed corpus: uint32 edges plus a fixed multiplicative spread. No wall-clock randomness. */
const EDGE_SEEDS=[0,1,2,606,73129,2147483647,2147483648,4294967294,4294967295];
const corpus=(n:number)=>[...EDGE_SEEDS,...Array.from({length:n},(_,i)=>Math.imul(i+1,2654435761)>>>0)];

test('vault plans over a 409-seed corpus: deterministic, every floor cell and objective reachable, sentries free to move',()=>{
 for(const seed of corpus(400)){
  const d=generateDungeonPlan(seed);assert.equal(JSON.stringify(generateDungeonPlan(seed)),JSON.stringify(d),`seed ${seed} deterministic`);
  assert(d.constraints.every(c=>c.ok));
  const floor=new Set(d.tiles.map(t=>`${t.x}:${t.z}`)),start=`${d.spawn.x}:${d.spawn.z}`,seen=new Set([start]),queue=[d.spawn];assert(floor.has(start),`seed ${seed} spawn on floor`);
  while(queue.length){const c=queue.pop()!;for(const [dx,dz] of [[2,0],[-2,0],[0,2],[0,-2]] as const){const k=`${c.x+dx}:${c.z+dz}`;if(floor.has(k)&&!seen.has(k)){seen.add(k);queue.push({x:c.x+dx,z:c.z+dz});}}}
  assert.equal(seen.size,floor.size,`seed ${seed}: carved floor is one connected region`);
  for(const o of d.objects)assert(dungeonPlanWalkable(d,o.x,o.z),`seed ${seed}: ${o.id} has standing clearance`);
  assert.equal(new Set(d.objects.map(o=>`${o.x}:${o.z}`)).size,d.objects.length,`seed ${seed}: objects do not share a position`);
  for(const o of d.objects.filter(o=>o.kind==='enemy'))for(let a=0;a<8;a++){const angle=a*Math.PI/4;assert(encounterClear({x:o.x,y:0,z:o.z},{x:o.x+Math.sin(angle)*.05,y:0,z:o.z+Math.cos(angle)*.05},d.walls,ENEMY_RULES.radius),`seed ${seed}: ${o.id} spawns clear of walls`);}
 }
});

test('seeded workshops and bounded authoring extremes compile valid plans with clear room, spawn and workplace positions',()=>{
 for(const seed of corpus(200)){const w=compileWorkshop(seed);assert(w.plan.valid,`seed ${seed}`);for(const p of [w.spawn,w.workplace,...w.rooms.map(r=>r.center),...w.doors.map(d=>d.center)])assert(workshopWalkable(w,p),`seed ${seed} ${JSON.stringify(p)}`);}
 const levels=(key:keyof WorkshopDraft)=>{const f=WORKSHOP_AUTHORING_FIELDS.find(f=>f.key===key)!;return [f.min,Math.round((f.min+f.max)/2/f.step)*f.step,f.max].map(v=>Math.round(v*1e6)/1e6);};
 let compiled=0;
 for(const rearRooms of [1,2,3])for(const width of levels('width'))for(const depth of levels('depth'))for(const hallDepth of levels('hallDepth'))for(const doorwayWidth of levels('doorwayWidth')){
  const r=compileWorkshopDraft({seed:4294967295,rearRooms,width,depth,hallDepth,doorwayWidth}),w=r.workshop;compiled++;
  assert(w.plan.valid&&w.rooms.length===rearRooms+1);for(const p of [w.spawn,w.workplace,...w.rooms.map(r=>r.center)])assert(workshopWalkable(w,p,.36),JSON.stringify({rearRooms,width,depth,hallDepth,doorwayWidth,p}));
 }
 assert.equal(compiled,243);
});

test('every Hearthmere life task point is clear and connected to the square by the navigation sweep',()=>{
 for(const seed of [0,4294967295]){
  const plan=startingTown(seed),step=.5,cx=plan.center.x,cz=plan.center.z,key=(i:number,j:number)=>i+','+j,at=(i:number,j:number)=>({x:cx+i*step,z:cz+j*step});
  const seen=new Set([key(0,16)]),queue=[[0,16] as [number,number]];
  while(queue.length){const [i,j]=queue.pop()!;for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]] as const){const k=key(i+di,j+dj);if(!seen.has(k)&&townNavigationClear(plan,at(i,j),at(i+di,j+dj))){seen.add(k);queue.push([i+di,j+dj]);}}}
  let points=0;
  for(const f of townLifeFacilities(seed))for(let slot=0;slot<f.capacity;slot++)for(const action of f.actions)for(let stage=0;stage<townLifeTaskStages(action);stage++){
   const p=townLifeTaskPoint(f,slot,action,stage);points++;assert(townNavigationClear(plan,p,p),`${f.id} ${slot} ${action} ${stage} clear`);
   const i=Math.round((p.x-cx)/step),j=Math.round((p.z-cz)/step);let linked=false;
   for(let di=-2;di<=2&&!linked;di++)for(let dj=-2;dj<=2&&!linked;dj++)linked=seen.has(key(i+di,j+dj))&&townNavigationClear(plan,p,at(i+di,j+dj));
   assert(linked,`${f.id} ${slot} ${action} ${stage} reachable from the square`);
  }
  assert(points>500);
 }
});
