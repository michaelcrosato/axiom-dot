import test from 'node:test';
import assert from 'node:assert/strict';
import {regionalPhysics,REGION_BOUND,type PhysicsSnapshot} from './helpers/regional-physics.ts';
import {generateRegionalChunk,regionalHeight} from '../src/regional-world.ts';
import {generateValley,valleySurfaceHeight} from '../src/valley.ts';
import {wildernessFeatures} from '../src/wilderness.ts';
import {regionalCenterBound,clampRegionalCoordinate} from '../src/regional-bounds.ts';

const seed=42,RADIUS=.32;
const close=(a:number,b:number,tolerance=.045)=>assert.ok(Math.abs(a-b)<tolerance,`${a} within ${tolerance} of ${b}`);
function cell(cx:number,cz:number,revision=1){const c=generateRegionalChunk(seed,cx,cz);return {key:`region:${cx}:${cz}`,revision,bounds:c.bounds,terrain:c.terrain,obstacles:[...c.features.flatMap(f=>f.solids),...c.structures.filter(s=>s.solid).map(s=>({x:s.center.x,y:s.center.y,z:s.center.z,hx:s.half.x,hy:s.half.y,hz:s.half.z}))],features:c.features.length,structures:c.structures.filter(s=>s.solid).length};}
function nearby(x:number,z:number){const cx=Math.floor(x/64),cz=Math.floor(z/64),out=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const xx=cx+dx,zz=cz+dz;if(xx*64>=REGION_BOUND||(xx+1)*64<=-REGION_BOUND||zz*64>=REGION_BOUND||(zz+1)*64<=-REGION_BOUND)continue;out.push(cell(xx,zz));}return out;}
// The regional outer plane is an explicit geometric constraint. Every actual
// native capsule center must retain radius+skin clearance; float32 rounding is
// accounted for by the shared inward-rounded limit, with no penetration allowance.
const normalRange=(samples:PhysicsSnapshot[],coordinate:(s:PhysicsSnapshot)=>number)=>Math.max(...samples.slice(-120).map(coordinate))-Math.min(...samples.slice(-120).map(coordinate));
function supported(samples:PhysicsSnapshot[]){assert.ok(samples.every(s=>s.grounded));assert.ok(samples.every(s=>Math.abs(s.x)<REGION_BOUND&&Math.abs(s.z)<REGION_BOUND),'center never escapes the world');assert.ok(samples.every(s=>Math.abs(s.x)<regionalCenterBound(REGION_BOUND)+1e-7&&Math.abs(s.z)<regionalCenterBound(REGION_BOUND)+1e-7),`capsule center stays inside both physical world edges: ${JSON.stringify(samples.filter(s=>Math.abs(s.x)>=regionalCenterBound(REGION_BOUND)+1e-7||Math.abs(s.z)>=regionalCenterBound(REGION_BOUND)+1e-7).slice(-3))}`);for(const s of samples)close(s.feetY,regionalHeight(seed,s.x,s.z));}
function counts(cells:ReturnType<typeof cell>[],snapshot:PhysicsSnapshot){return {terrainCells:cells.length,terrainVertices:cells.reduce((n,c)=>n+c.terrain.vertices.length/3,0),terrainTriangles:cells.reduce((n,c)=>n+c.terrain.indices.length/3,0),featureObjects:cells.reduce((n,c)=>n+c.features,0),structureObjects:cells.reduce((n,c)=>n+c.structures,0),solidColliders:cells.reduce((n,c)=>n+c.obstacles.length,0),collisionInputBufferBytes:cells.reduce((n,c)=>n+(c.terrain.vertices.length+c.terrain.indices.length)*4,0),actualCellColliders:snapshot.streaming!.cellColliders,actualTotalColliders:snapshot.streaming!.totalColliders};}

test('all four generated clipped corners cold-spawn grounded and block sustained diagonal sprint at both boundaries',async t=>{
 const summaries=[];let p:Awaited<ReturnType<typeof regionalPhysics>>|undefined;
 for(const [sx,sz]of [[-1,-1],[1,-1],[-1,1],[1,1]]){
  const x=sx!*(REGION_BOUND-1),z=sz!*(REGION_BOUND-1),c=cell(Math.floor(x/64),Math.floor(z/64));
  if(!p)p=await regionalPhysics(t,{x,z,initialCells:[c]});else await p.zone({x,z,initialCells:[c]});
  assert.ok(p.latest.grounded);close(p.latest.x,x,.004);close(p.latest.z,z,.004);close(p.latest.feetY,regionalHeight(seed,x,z));
  p.input({x:sx,z:sz,analog:true});const motion=await p.tick(1800);supported(motion);assert.ok(Math.abs(p.latest.x)>REGION_BOUND-.39);assert.ok(Math.abs(p.latest.z)>REGION_BOUND-.39);assert.ok(normalRange(motion,s=>s.x)<=.04&&normalRange(motion,s=>s.z)<=.04,'last2s remain within a4cm solver contact envelope on both axes');
  assert.equal(p.latest.streaming!.terrainCells,1);assert.equal(p.latest.streaming!.cellColliders,c.obstacles.length+1);assert.equal(p.latest.streaming!.totalColliders,c.obstacles.length+6);
  summaries.push({maxCapsuleEnvelopeBeyondBoundary:Math.max(...motion.map(s=>Math.max(Math.abs(s.x),Math.abs(s.z))+RADIUS-REGION_BOUND)),maxFeetError:Math.max(...motion.map(s=>Math.abs(s.feetY-regionalHeight(seed,s.x,s.z)))),finalVelocity:{x:p.latest.vx,z:p.latest.vz},steadyBoundaryRange:Math.max(normalRange(motion,s=>s.x),normalRange(motion,s=>s.z)),corner:[sx,sz],x:p.latest.x,z:p.latest.z,feetY:p.latest.feetY,groundedFraction:motion.filter(s=>s.grounded).length/motion.length,...counts([c],p.latest)});
 }
 t.diagnostic(JSON.stringify({scope:'Production generated clipped corners, real 60Hz Rapier; diagonal input magnitude is capped at1',boundaryTicks:1800,seed,corners:summaries}));
});

test('all four generated perimeter edges retain true terrain support while sustained sprint cannot leave the region',async t=>{
 const summaries=[];let p:Awaited<ReturnType<typeof regionalPhysics>>|undefined;
 for(const direction of [{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}]){
  const x=direction.x*(REGION_BOUND-1)+(direction.x===0?32:0),z=direction.z*(REGION_BOUND-1)+(direction.z===0?32:0),c=cell(Math.floor(x/64),Math.floor(z/64));
  if(!p)p=await regionalPhysics(t,{x,z,initialCells:[c]});else await p.zone({x,z,initialCells:[c]});p.input({...direction,analog:true});const motion=await p.tick(1800);supported(motion);const boundary=direction.x?p.latest.x:p.latest.z;assert.ok(Math.abs(boundary)>REGION_BOUND-.39);assert.ok(normalRange(motion,s=>direction.x?s.x:s.z)<=.04,'last2s remain within a4cm normal contact envelope');
  summaries.push({maxCapsuleEnvelopeBeyondBoundary:Math.max(...motion.map(s=>Math.max(Math.abs(s.x),Math.abs(s.z))+RADIUS-REGION_BOUND)),maxFeetError:Math.max(...motion.map(s=>Math.abs(s.feetY-regionalHeight(seed,s.x,s.z)))),finalVelocity:{x:p.latest.vx,z:p.latest.vz},steadyBoundaryRange:Math.max(...motion.slice(-120).map(s=>Math.abs(direction.x?s.x:s.z)))-Math.min(...motion.slice(-120).map(s=>Math.abs(direction.x?s.x:s.z))),direction,x:p.latest.x,z:p.latest.z,feetY:p.latest.feetY,...counts([c],p.latest)});
 }
 t.diagnostic(JSON.stringify({scope:'Production generated clipped perimeter, full analog input1 toward each boundary',boundaryTicks:1800,seed,edges:summaries}));
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

const assertCenterDomain=(samples:PhysicsSnapshot[])=>{const limit=regionalCenterBound(REGION_BOUND);for(const s of samples)assert.ok(Math.abs(s.x)<=limit+1e-7&&Math.abs(s.z)<=limit+1e-7,`regional capsule left radius+skin domain: ${JSON.stringify(s)}`);};
const boundaryCases=[...[-1,1].flatMap(x=>[-1,1].map(z=>({x,z}))),{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}];
test('all eight outer-boundary cases retain radius+skin clearance during prolonged crouch and repeated outward jumps',async t=>{
 let p:Awaited<ReturnType<typeof regionalPhysics>>|undefined;const cases=[];
 for(const direction of boundaryCases){const x=direction.x*(REGION_BOUND-1)+(direction.x===0?32:0),z=direction.z*(REGION_BOUND-1)+(direction.z===0?32:0),c=cell(Math.floor(x/64),Math.floor(z/64));if(!p)p=await regionalPhysics(t,{x,z,initialCells:[c]});else await p.zone({x,z,initialCells:[c]});
  p.input({...direction,analog:true,crouch:true});const crouch=await p.tick(1800);assertCenterDomain(crouch);assert.ok(crouch.every(s=>s.grounded));assert.ok(crouch.slice(12).every(s=>s.crouched));
  p.input({...direction,analog:true});await p.tick(30);let jumpSamples=0,maxJumpHeight=0;for(let jump=0;jump<6;jump++){const baseline=p.latest.feetY;p.input({...direction,analog:true,jump:true});const flight=await p.tick(90);assertCenterDomain(flight);assert.ok(flight.some(s=>!s.grounded&&s.vy>0),`real jump launches against boundary ${JSON.stringify({direction,jump,first:flight.slice(0,3),maxFeet:Math.max(...flight.map(s=>s.feetY)),baseline})}`);assert.ok(p.latest.grounded);maxJumpHeight=Math.max(maxJumpHeight,...flight.map(s=>s.feetY-baseline));jumpSamples+=flight.length;p.input({...direction,analog:true,jump:false});await p.tick(2);}
  cases.push({direction,crouchTicks:crouch.length,jumpTicks:jumpSamples,jumps:6,maxJumpHeight,finalX:p.latest.x,finalZ:p.latest.z});
 }
 t.diagnostic(JSON.stringify({scope:'All8 generated boundary cases,30s full outward crouch plus6 actual jumps; strict radius+skin domain',cases}));
});

test('regional schema-valid outer-edge spawn teleport and grounded or airborne checkpoints normalize consistently',async t=>{
 const limit=regionalCenterBound(REGION_BOUND),x=REGION_BOUND,z=REGION_BOUND,c=cell(24,24),p=await regionalPhysics(t,{x,z,initialCells:[c]});assertCenterDomain([p.latest]);close(p.latest.x,limit,.003);close(p.latest.z,limit,.003);assert.ok(p.latest.grounded);
 p.send({type:'teleport',x,z});await p.tick(5);assertCenterDomain([p.latest]);close(p.latest.feetY,regionalHeight(seed,p.latest.x,p.latest.z));
 const checkpoint={x,z,feetY:99,vy:0,grounded:true,crouched:true,stance:1,coyote:.1,landing:0,landingSpeed:0,motor:{vx:0,vz:0,slide:0,wasCrouched:true}};
 await p.zone({x,z,initialCells:[c],checkpoint});p.send({type:'capture',requestId:'normalized-ground'});const restored=(await p.take('captured')).checkpoint;assert.equal(restored.x,limit);assert.equal(restored.z,limit);assert.equal(restored.crouched,true);assert.equal(restored.grounded,true);close(restored.feetY,regionalHeight(seed,limit,limit),.00002);assertCenterDomain(await p.tick(120));
 const airborne={...checkpoint,feetY:regionalHeight(seed,x,z)+3,vy:4.5,grounded:false,coyote:0,motor:{vx:2,vz:2,slide:0,wasCrouched:true}};await p.zone({x,z,initialCells:[c],checkpoint:airborne});p.send({type:'capture',requestId:'normalized-air'});const air=(await p.take('captured')).checkpoint;assert.equal(air.x,limit);assert.equal(air.z,limit);assert.equal(air.grounded,false);assert.equal(air.vy,4.5);close(air.feetY,airborne.feetY,.00002);assert.equal(air.crouched,true);assertCenterDomain(await p.tick(120));p.input({x:1,z:1,analog:true});const landing=await p.tick(180);assertCenterDomain(landing);assert.ok(p.latest.grounded);
 // An actual legacy world still accepts its original bound rules and has no
 // regional diagnostics/normalization when the stream flag is disabled.
 await p.zone({streamedTerrain:false,bound:48,x:47.65,z:0,initialCells:[],obstacles:[]});assert.equal(p.latest.streaming,undefined);assert.ok(p.latest.x>47.64);p.input({x:1,analog:true});await p.tick(120);assert.ok(p.latest.x>47.64&&p.latest.x<47.70);
 t.diagnostic(JSON.stringify({scope:'Exact±B schema poses normalize to shared inward-float32 limit; grounded feet resampled, paused airborne height/vy preserved, legacy48m extent unchanged',limit,groundedFeetY:restored.feetY,airborneFeetY:air.feetY,airborneVy:air.vy}));
});

test('regional online motion receipts cannot bypass the shared capsule center domain',async t=>{
 const limit=regionalCenterBound(REGION_BOUND),c=cell(24,0),p=await regionalPhysics(t,{x:limit-10,z:32,initialCells:[c],online:true});
 p.send({type:'online-motion',revision:1,x:REGION_BOUND,z:32,motion:{feetY:regionalHeight(seed,REGION_BOUND,32),vy:0,grounded:true,crouched:false,jumpId:0,landingId:0}});const first=await p.take('online-motion-ack');assert.equal(first.applied,true);assert.ok(first.checkpoint.x<=limit);assert.ok(first.checkpoint.x>limit-.01);close(first.checkpoint.feetY,regionalHeight(seed,limit,32),.00003);p.input({x:1,analog:true});assertCenterDomain(await p.tick(1800));
 p.send({type:'online-motion',revision:2,x:REGION_BOUND,z:32,motion:{feetY:regionalHeight(seed,limit,32)+2,vy:3,grounded:false,crouched:true,jumpId:1,landingId:0}});const jump=await p.take('online-motion-ack');assert.equal(jump.applied,true);assert.ok(jump.checkpoint.x<=limit);assert.equal(jump.checkpoint.vy,3);p.input({x:1,analog:true});assertCenterDomain(await p.tick(180));assert.ok(p.latest.grounded);
 t.diagnostic(JSON.stringify({scope:'Grounded and airborne online-equivalent receipts at schema extent normalize before local application;30s outward prediction retains bound',limit,groundedX:first.checkpoint.x,airborneX:jump.checkpoint.x}));
});

test('full tangential sprint remains real8m/s travel along every outer plane with enough resident terrain',async t=>{
 const limit=regionalCenterBound(REGION_BOUND),measurements=[];let p:Awaited<ReturnType<typeof regionalPhysics>>|undefined;
 for(const direction of [{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}]){
  const x=direction.x?direction.x*limit:256,z=direction.z?direction.z*limit:256,cells=[];for(let i=3;i<=8;i++)cells.push(direction.x?cell(Math.floor(x/64),i):cell(i,Math.floor(z/64)));
  if(!p)p=await regionalPhysics(t,{x,z,initialCells:cells});else await p.zone({x,z,initialCells:cells});const start=p.latest;
  p.input({x:direction.z?1:0,z:direction.x?1:0,analog:true});const samples=await p.tick(1800);assertCenterDomain(samples);assert.ok(samples.every(s=>s.grounded));assert.ok(samples.every(s=>!s.streaming!.blocked),'no missing-terrain guard is allowed to masquerade as friction');
  const axis=(s:PhysicsSnapshot)=>direction.x?s.z:s.x,metres=axis(p.latest)-axis(start),steady=(axis(p.latest)-axis(samples[1199]!))/10;assert.ok(metres>220,`${JSON.stringify(direction)} tangent travel ${metres}`);assert.ok(steady>7.7&&steady<8.05,`tangent steady speed ${steady}`);
  let previous=start;for(const s of samples){close(s.vx,(s.x-previous.x)*60,.00001);close(s.vz,(s.z-previous.z)*60,.00001);previous=s;}measurements.push({direction,metres,seconds:30,steadySpeed:steady,residentCells:cells.length,groundedFraction:1,blocked:0});
 }
 t.diagnostic(JSON.stringify({scope:'Full analog tangent1 along four actual generated outer planes,30s each; complete6-chunk strips preloaded and native displacement velocities verified',measurements}));
});

test('explicit old-coordinate terrain heights normalize before edge spawn and teleport without changing intentional airborne heights',async t=>{
 const x=REGION_BOUND,z=REGION_BOUND,limit=regionalCenterBound(REGION_BOUND),oldGround=regionalHeight(seed,x,z),newGround=regionalHeight(seed,limit,limit),c=cell(24,24),p=await regionalPhysics(t,{x,z,y:oldGround,initialCells:[c]});
 close(p.latest.x,limit,.003);close(p.latest.z,limit,.003);assert.ok(p.latest.grounded);close(p.latest.feetY,newGround,.003);
 p.send({type:'teleport',x,z,y:oldGround});p.send({type:'capture',requestId:'normalized-explicit-ground'});const ground=(await p.take('captured')).checkpoint;assert.equal(ground.x,limit);assert.equal(ground.z,limit);close(ground.feetY,newGround,.00002);await p.tick(5);assert.ok(p.latest.grounded);
 p.send({type:'teleport',x,z,y:oldGround+3});p.send({type:'capture',requestId:'explicit-air'});const air=(await p.take('captured')).checkpoint;assert.equal(air.x,limit);assert.equal(air.z,limit);close(air.feetY,oldGround+3,.00002);assert.equal(air.grounded,false);assertCenterDomain(await p.tick(180));assert.ok(p.latest.grounded);
 t.diagnostic(JSON.stringify({scope:'Main-style explicit oldXZ terrain-height spawn and teleport resample at accepted normalizedXZ; deliberate airborne height remains unchanged',oldGround,newGround,acceptedX:ground.x,acceptedZ:ground.z,groundedFeetY:ground.feetY,airborneFeetY:air.feetY}));
});
