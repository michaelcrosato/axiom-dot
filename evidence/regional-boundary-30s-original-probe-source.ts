import test from 'node:test';
import assert from 'node:assert/strict';
import {regionalPhysics,REGION_BOUND,type PhysicsSnapshot} from './helpers/regional-physics.ts';
import {generateRegionalChunk,regionalHeight} from '../src/regional-world.ts';
import {generateValley,valleySurfaceHeight} from '../src/valley.ts';
import {wildernessFeatures} from '../src/wilderness.ts';

const seed=42,RADIUS=.32;
const close=(a:number,b:number,tolerance=.045)=>assert.ok(Math.abs(a-b)<tolerance,`${a} within ${tolerance} of ${b}`);
function cell(cx:number,cz:number,revision=1){const c=generateRegionalChunk(seed,cx,cz);return {key:`region:${cx}:${cz}`,revision,bounds:c.bounds,terrain:c.terrain,obstacles:[...c.features.flatMap(f=>f.solids),...c.structures.filter(s=>s.solid).map(s=>({x:s.center.x,y:s.center.y,z:s.center.z,hx:s.half.x,hy:s.half.y,hz:s.half.z}))],features:c.features.length,structures:c.structures.filter(s=>s.solid).length};}
function nearby(x:number,z:number){const cx=Math.floor(x/64),cz=Math.floor(z/64),out=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const xx=cx+dx,zz=cz+dz;if(xx*64>=REGION_BOUND||(xx+1)*64<=-REGION_BOUND||zz*64>=REGION_BOUND||(zz+1)*64<=-REGION_BOUND)continue;out.push(cell(xx,zz));}return out;}
function supported(samples:PhysicsSnapshot[]){assert.ok(samples.every(s=>s.grounded));assert.ok(samples.every(s=>Math.abs(s.x)<REGION_BOUND-RADIUS+.05&&Math.abs(s.z)<REGION_BOUND-RADIUS+.05),`capsule center stays inside both physical world edges: ${JSON.stringify(samples.filter(s=>Math.abs(s.x)>=REGION_BOUND-RADIUS+.05||Math.abs(s.z)>=REGION_BOUND-RADIUS+.05).slice(-3))}`);for(const s of samples)close(s.feetY,regionalHeight(seed,s.x,s.z));}
function counts(cells:ReturnType<typeof cell>[],snapshot:PhysicsSnapshot){return {terrainCells:cells.length,terrainVertices:cells.reduce((n,c)=>n+c.terrain.vertices.length/3,0),terrainTriangles:cells.reduce((n,c)=>n+c.terrain.indices.length/3,0),featureObjects:cells.reduce((n,c)=>n+c.features,0),structureObjects:cells.reduce((n,c)=>n+c.structures,0),solidColliders:cells.reduce((n,c)=>n+c.obstacles.length,0),collisionInputBufferBytes:cells.reduce((n,c)=>n+(c.terrain.vertices.length+c.terrain.indices.length)*4,0),actualCellColliders:snapshot.streaming!.cellColliders,actualTotalColliders:snapshot.streaming!.totalColliders};}

test('all four generated clipped corners cold-spawn grounded and block sustained diagonal sprint at both boundaries',async t=>{
 const summaries=[];let p:Awaited<ReturnType<typeof regionalPhysics>>|undefined;
 for(const [sx,sz]of [[-1,-1],[1,-1],[-1,1],[1,1]]){
  const x=sx!*(REGION_BOUND-1),z=sz!*(REGION_BOUND-1),c=cell(Math.floor(x/64),Math.floor(z/64));
  if(!p)p=await regionalPhysics(t,{x,z,initialCells:[c]});else await p.zone({x,z,initialCells:[c]});
  assert.ok(p.latest.grounded);close(p.latest.x,x,.004);close(p.latest.z,z,.004);close(p.latest.feetY,regionalHeight(seed,x,z));
  p.input({x:sx,z:sz,analog:true});const motion=await p.tick(1800);supported(motion);assert.ok(Math.abs(p.latest.x)>REGION_BOUND-.39);assert.ok(Math.abs(p.latest.z)>REGION_BOUND-.39);assert.ok(Math.hypot(p.latest.vx,p.latest.vz)<2,'sustained input resolves to a physical corner stop');
  assert.equal(p.latest.streaming!.terrainCells,1);assert.equal(p.latest.streaming!.cellColliders,c.obstacles.length+1);assert.equal(p.latest.streaming!.totalColliders,c.obstacles.length+6);
  summaries.push({maxCapsuleEnvelopeBeyondBoundary:Math.max(...motion.map(s=>Math.max(Math.abs(s.x),Math.abs(s.z))+RADIUS-REGION_BOUND)),maxFeetError:Math.max(...motion.map(s=>Math.abs(s.feetY-regionalHeight(seed,s.x,s.z)))),finalVelocity:{x:p.latest.vx,z:p.latest.vz},steadyBoundaryRange:Math.max(...motion.slice(-120).map(s=>Math.max(Math.abs(s.x),Math.abs(s.z))))-Math.min(...motion.slice(-120).map(s=>Math.max(Math.abs(s.x),Math.abs(s.z)))),corner:[sx,sz],x:p.latest.x,z:p.latest.z,feetY:p.latest.feetY,groundedFraction:motion.filter(s=>s.grounded).length/motion.length,...counts([c],p.latest)});
 }
 t.diagnostic(JSON.stringify({scope:'Production generated clipped corners, real 60Hz Rapier; diagonal input magnitude is capped at1',seed,corners:summaries}));
});

test('all four generated perimeter edges retain true terrain support while sustained sprint cannot leave the region',async t=>{
 const summaries=[];let p:Awaited<ReturnType<typeof regionalPhysics>>|undefined;
 for(const direction of [{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}]){
  const x=direction.x*(REGION_BOUND-1)+(direction.x===0?32:0),z=direction.z*(REGION_BOUND-1)+(direction.z===0?32:0),c=cell(Math.floor(x/64),Math.floor(z/64));
  if(!p)p=await regionalPhysics(t,{x,z,initialCells:[c]});else await p.zone({x,z,initialCells:[c]});p.input({...direction,analog:true});const motion=await p.tick(1800);supported(motion);const boundary=direction.x?p.latest.x:p.latest.z;assert.ok(Math.abs(boundary)>REGION_BOUND-.39);assert.ok(Math.hypot(p.latest.vx,p.latest.vz)<2);
  summaries.push({maxCapsuleEnvelopeBeyondBoundary:Math.max(...motion.map(s=>Math.max(Math.abs(s.x),Math.abs(s.z))+RADIUS-REGION_BOUND)),maxFeetError:Math.max(...motion.map(s=>Math.abs(s.feetY-regionalHeight(seed,s.x,s.z)))),finalVelocity:{x:p.latest.vx,z:p.latest.vz},steadyBoundaryRange:Math.max(...motion.slice(-120).map(s=>Math.abs(direction.x?s.x:s.z)))-Math.min(...motion.slice(-120).map(s=>Math.abs(direction.x?s.x:s.z))),direction,x:p.latest.x,z:p.latest.z,feetY:p.latest.feetY,...counts([c],p.latest)});
 }
 t.diagnostic(JSON.stringify({scope:'Production generated clipped perimeter, full analog input1 toward each boundary',seed,edges:summaries}));
});

test('legacy actual valley to distant regional corner to core region and back to legacy restores correct collision without duplicates',async t=>{
 const valley=generateValley(seed),spawn=valley.endpoints.spawn,fixed=[...valley.bridges,...valley.foundations,...valley.buildings.flatMap(b=>b.plan.shapes)].filter(s=>s.solid).map(s=>({x:s.center.x,y:s.center.y,z:s.center.z,hx:s.half.x,hy:s.half.y,hz:s.half.z})),features=wildernessFeatures({generation:2,seed}),coreSolids={key:'legacy-core-features',revision:1,obstacles:features.flatMap(f=>f.solids)};
 const legacy={x:spawn.x,z:spawn.z,streamedTerrain:false,bound:80,terrain:valley.terrain,obstacles:fixed,initialCells:[coreSolids]},p=await regionalPhysics(t,legacy);assert.ok(p.latest.grounded);assert.equal(p.latest.streaming,undefined);close(p.latest.feetY,valleySurfaceHeight(valley,p.latest.x,p.latest.z));
 p.input({paused:true});p.send({type:'capture',requestId:'legacy'});const checkpoint=(await p.take('captured')).checkpoint;
 const distant={x:REGION_BOUND-1,z:-REGION_BOUND+1},corner=cell(Math.floor(distant.x/64),Math.floor(distant.z/64));
 // A mismatched preload is rejected before old state is touched; the same epoch
 // can subsequently install the correctly generated destination.
 p.send({type:'zone',epoch:1,...distant,streamedTerrain:true,bound:REGION_BOUND,obstacles:[],initialCells:[cell(0,0)],manual:true});p.input();await p.tick(3);assert.equal(p.latest.epoch,0);assert.equal(p.latest.streaming,undefined);close(p.latest.feetY,checkpoint.feetY);
 const summaries=[];
 for(let cycle=0;cycle<3;cycle++){
  await p.zone({...distant,initialCells:[corner]});assert.ok(p.latest.grounded);close(p.latest.feetY,regionalHeight(seed,distant.x,distant.z));assert.equal(p.latest.streaming!.terrainCells,1);assert.equal(p.latest.streaming!.cellColliders,corner.obstacles.length+1);assert.equal(p.latest.streaming!.totalColliders,corner.obstacles.length+6);
  const regionCells=nearby(spawn.x,spawn.z),expectedCells=regionCells.length+1,expectedCellColliders=regionCells.reduce((n,c)=>n+1+c.obstacles.length,coreSolids.obstacles.length),expectedTotal=expectedCellColliders+fixed.length+5;
  await p.zone({x:spawn.x,z:spawn.z,obstacles:fixed,initialCells:[coreSolids,...regionCells],checkpoint});assert.equal(p.latest.streaming!.activeCells,expectedCells);assert.equal(p.latest.streaming!.terrainCells,regionCells.length);assert.equal(p.latest.streaming!.cellColliders,expectedCellColliders);assert.equal(p.latest.streaming!.totalColliders,expectedTotal);close(p.latest.x,checkpoint.x,.0001);close(p.latest.z,checkpoint.z,.0001);close(p.latest.feetY,checkpoint.feetY,.0001);assert.ok(p.latest.grounded);
  p.input({x:.36,analog:true});const resumed=await p.tick(30);assert.ok(resumed.every(s=>s.grounded));assert.ok(p.latest.x>checkpoint.x+.5);assert.equal(p.latest.streaming!.totalColliders,expectedTotal);
  summaries.push({cycle,...counts(regionCells,p.latest),coreFeatureObjects:features.length,coreFeatureColliders:coreSolids.obstacles.length,fixedCoreColliders:fixed.length,expectedTotalColliders:expectedTotal});
  await p.zone({...legacy,checkpoint});p.send({type:'capture',requestId:`restored:${cycle}`});const restored=(await p.take('captured')).checkpoint;for(const field of ['x','z','feetY','grounded','crouched','stance'])assert.equal(restored[field],checkpoint[field],field);assert.equal(p.latest.streaming,undefined);p.input();assert.ok((await p.tick(5)).every(s=>s.grounded));
 }
 t.diagnostic(JSON.stringify({scope:'Three real-worker legacy→distant-region→starting-region→legacy cycles, exact native collider counts and checkpoint restore; includes rejected missing-destination preload recovery',seed,cycles:summaries}));
});
