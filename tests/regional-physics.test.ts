import test from 'node:test';
import assert from 'node:assert/strict';
import {regionalPhysics,terrainCell,REGION_BOUND,type PhysicsSnapshot} from './helpers/regional-physics.ts';
const close=(actual:number,expected:number,tolerance=.035)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} within ${tolerance} of ${expected}`);
function supported(samples:PhysicsSnapshot[],height:(x:number,z:number)=>number){assert.ok(samples.every(s=>s.grounded),'every resolved step keeps real support');for(const s of samples)close(s.feetY,height(s.x,s.z));}

test('streamed triangle chunks cross positive, negative and zero seams in both directions without a universal floor',async t=>{
 const height=(x:number,z:number)=>-8+x*.05+z*.025,cells=[];for(let cx=-2;cx<=1;cx++)for(let cz=-1;cz<=0;cz++)cells.push(terrainCell(cx,cz,height));
 const p=await regionalPhysics(t,{x:-90,z:16,initialCells:cells});close(p.latest.feetY,height(-90,16));
 p.input({x:1,analog:true});const east=await p.tick(1400);assert.ok(p.latest.x>90);supported(east,height);
 p.input({x:-1,analog:true});const west=await p.tick(1450);assert.ok(p.latest.x<-90);supported(west,height);
 assert.equal(p.latest.streaming!.terrainCells,8);assert.equal(p.latest.streaming!.totalColliders,13,'only 8 terrains, four edge walls and one player, no giant floor');
 p.send({type:'teleport',x:16,z:-30});await p.tick(4);p.input({z:1,analog:true});supported(await p.tick(480),height);assert.ok(p.latest.z>30);
 p.input({z:-1,analog:true});supported(await p.tick(500),height);assert.ok(p.latest.z<-30);
});

test('missing chunk stops the safety disk, late collision readiness resumes movement, and unsafe unload defers',async t=>{
 const p=await regionalPhysics(t,{x:50});p.input({x:1,analog:true});const blocked=await p.tick(240);
 assert.ok(p.latest.x<64-.6&&p.latest.x>60,`stops short of missing floor: ${p.latest.x}`);supported(blocked,()=>0);assert.ok(p.latest.streaming!.blocked);
 const next=terrainCell(1,0);p.send({type:'cell-load',...next});const ack=await p.take('cell-ack');assert.equal(ack.terrainReady,true);assert.equal(ack.count,1);
 const crossed=await p.tick(90);assert.ok(p.latest.x>70);supported(crossed,()=>0);
 p.send({type:'cell-unload',key:next.key,revision:2});assert.equal((await p.take('cell-pending')).reason,'player-safety');await p.tick(5);assert.equal(p.latest.streaming!.pendingUnloads,1);assert.equal(p.latest.streaming!.terrainCells,2);
 p.send({type:'teleport',x:32,z:32});await p.tick(4);const unloaded=await p.take('cell-ack');assert.equal(unloaded.loaded,false);assert.equal(p.latest.streaming!.terrainCells,1);
 p.send({type:'teleport',x:90,z:32});assert.equal((await p.take('teleport-rejected')).reason,'terrain-not-ready');await p.tick();close(p.latest.x,32);
 p.send({type:'cell-load',...next,revision:1});await p.tick();assert.equal(p.latest.streaming!.terrainCells,1,'stale pre-unload generation cannot return');
 p.send({type:'cell-load',...next,revision:3});await p.take('cell-ack');p.send({type:'teleport',x:90,z:32});await p.tick(5);close(p.latest.x,90);close(p.latest.feetY,0);assert.ok(p.latest.grounded);
});

test('cold distant spawn, negative elevation teleport, and exact paused checkpoint restoration sample resident triangles',async t=>{
 const height=(x:number,z:number)=>-40+.003*x+.005*z,cell=terrainCell(15,-16,height),p=await regionalPhysics(t,{x:1000,z:-1000,initialCells:[cell]});
 close(p.latest.feetY,height(1000,-1000));assert.equal(p.latest.grounded,true);
 p.send({type:'teleport',x:1008,z:-1004});await p.tick(5);close(p.latest.feetY,height(1008,-1004));
 p.input({crouch:true});await p.tick(15);p.input({paused:true});p.send({type:'capture',requestId:'distant'});const checkpoint=(await p.take('captured')).checkpoint;
 await p.zone({x:1000,z:-1000,initialCells:[cell],checkpoint});p.send({type:'capture',requestId:'restored'});const restored=(await p.take('captured')).checkpoint;
 for(const field of ['x','z','feetY','crouched','stance','grounded','vy'])assert.equal(restored[field],checkpoint[field],field);
 p.input();await p.tick(30);assert.equal(p.latest.grounded,true);close(p.latest.feetY,height(p.latest.x,p.latest.z));
});

test('invalid and stale terrain packets leave both old triangles and solid collision intact',async t=>{
 const original=terrainCell(0,0);original.obstacles=[{x:40,z:32,y:2,hx:.5,hy:2,hz:4}];
 const p=await regionalPhysics(t,{x:36,initialCells:[original]});
 const invalid=[{...original,terrain:{...original.terrain,indices:[0,0,0]}},{...original,bounds:{...original.bounds,maxX:65}},{...original,terrain:{...original.terrain,vertices:[Infinity,...original.terrain.vertices.slice(1)]}},{...original,terrain:{...original.terrain,bound:100}},{...original,terrain:{...original.terrain,step:0}}];
 for(const bad of invalid){p.send({type:'cell-load',...bad,revision:2});await p.take('cell-rejected');await p.tick();assert.equal(p.latest.streaming!.cellColliders,2);}
 p.send({type:'cell-load',...terrainCell(0,0),revision:1});p.send({type:'cell-unload',epoch:99,key:original.key,revision:99});p.input({x:1});const samples=await p.tick(120);supported(samples,()=>0);assert.ok(p.latest.x<39.2,'old solid survived rejected replacement');
 p.send({type:'cell-load',...terrainCell(0,0),revision:2});await p.take('cell-ack');await p.tick(90);assert.ok(p.latest.x>44,'same new revision remains valid after rejected allocation');assert.equal(p.latest.streaming!.cellColliders,1);
 const before=p.latest;for(const extra of [{streamedTerrain:1},{streamedTerrain:true,terrain:original.terrain},{streamedTerrain:true,initialCells:[{...original,bounds:undefined}]}]){p.send({type:'zone',epoch:1,x:32,z:32,obstacles:[],bound:REGION_BOUND,manual:true,...extra});await p.tick();assert.equal(p.latest.epoch,before.epoch);}
});

test('bounded real collider unload/revisit soak never leaks shapes or loses negative-coordinate support',async t=>{
 const p=await regionalPhysics(t);let previous=terrainCell(0,0),revision=2;
 for(let visit=0;visit<160;visit++){
  const cx=visit%20-10,cz=(visit%3)-1;if(cx===0&&cz===0)continue;
  const next=terrainCell(cx,cz,(x,z)=>-3+x*.002+z*.001,revision++);
  p.send({type:'cell-load',...next});await p.take('cell-ack',m=>m.key===next.key&&m.revision===next.revision);
  p.send({type:'teleport',x:cx*64+32,z:cz*64+32});await p.tick(3);
  p.send({type:'cell-unload',key:previous.key,revision:revision++});await p.take('cell-ack',m=>m.key===previous.key&&!m.loaded);await p.tick();
  assert.equal(p.latest.streaming!.terrainCells,1);assert.equal(p.latest.streaming!.cellColliders,1);assert.equal(p.latest.streaming!.totalColliders,6);assert.ok(p.latest.grounded);previous=next;
 }
 assert.ok(p.latest.streaming!.revisionKeys<=61);
});

test('active-cell and history budgets fail closed without evicting stale-revision protection',async t=>{
 const p=await regionalPhysics(t);
 for(let i=0;i<127;i++)p.send({type:'cell-load',key:`empty:${i}`,revision:1,obstacles:[]});await p.tick();assert.equal(p.latest.streaming!.activeCells,128);
 p.send({type:'cell-load',key:'overflow',revision:1,obstacles:[]});assert.equal((await p.take('cell-rejected')).reason,'collider-capacity');
 for(let i=0;i<127;i++)p.send({type:'cell-unload',key:`empty:${i}`,revision:2});
 for(let i=127;i<4095;i++)p.send({type:'cell-unload',key:`empty:${i}`,revision:2});await p.tick();assert.equal(p.latest.streaming!.revisionKeys,4096);assert.equal(p.latest.streaming!.activeCells,1);
 p.send({type:'cell-load',key:'history-overflow',revision:1,obstacles:[]});assert.equal((await p.take('cell-rejected')).reason,'revision-capacity');
 p.send({type:'cell-load',key:'empty:0',revision:1,obstacles:[]});await p.tick();assert.equal(p.latest.streaming!.activeCells,1);
 p.send({type:'cell-load',key:'empty:0',revision:3,obstacles:[]});await p.take('cell-ack',m=>m.key==='empty:0'&&m.loaded);await p.tick();assert.equal(p.latest.streaming!.activeCells,2,'existing history keys still reload at the cap');
});


test('native allocation failure rolls back staged terrain and retains the previous cell revision and generation',async t=>{
 const p=await regionalPhysics(t),replacement=terrainCell(0,0,()=>0,2);replacement.obstacles=[{x:50,z:32,y:2,hx:.5,hy:2,hz:4}];
 p.send({type:'test-fail-allocation',after:1});await p.take('test-fault-ready');p.send({type:'cell-load',...replacement});assert.equal((await p.take('cell-rejected')).reason,'allocation-failed');await p.tick();assert.equal(p.latest.streaming!.cellColliders,1);assert.equal(p.latest.streaming!.totalColliders,6);assert.ok(p.latest.grounded);
 p.send({type:'cell-load',...replacement});await p.take('cell-ack');await p.tick();assert.equal(p.latest.streaming!.cellColliders,2);
 p.send({type:'test-fail-allocation',after:0});await p.take('test-fault-ready');p.send({type:'zone',epoch:1,x:32,z:32,obstacles:[],streamedTerrain:true,bound:REGION_BOUND,initialCells:[terrainCell(0,0)],manual:true});assert.equal((await p.take('zone-rejected')).requestedEpoch,1);await p.tick();assert.equal(p.latest.epoch,0);assert.equal(p.latest.streaming!.cellColliders,2);assert.ok(p.latest.grounded);
 p.input({x:1});await p.tick(260);assert.ok(p.latest.x<49.2&&p.latest.x>49,'old generation retained real obstacle collision');
 p.send({type:'zone',epoch:1,x:32,z:32,obstacles:[{x:32,z:32,y:100,hx:20,hy:100,hz:20}],streamedTerrain:true,bound:REGION_BOUND,initialCells:[terrainCell(0,0)],manual:true});assert.match((await p.take('zone-rejected')).reason,/No clear spawn/);await p.tick();assert.equal(p.latest.epoch,0);assert.ok(p.latest.x<49.2);assert.equal(p.latest.streaming!.totalColliders,7);
});

test('malformed missing-spawn worlds and terrain-removal replacements cannot turn a live streamed floor into air',async t=>{
 const p=await regionalPhysics(t);const start=p.latest;
 p.send({type:'zone',epoch:1,x:500,z:500,obstacles:[],streamedTerrain:true,bound:REGION_BOUND,initialCells:[terrainCell(0,0)],manual:true});await p.tick();assert.equal(p.latest.epoch,0);close(p.latest.x,start.x);
 p.send({type:'cell-load',key:'region:0:0',revision:2,obstacles:[]});assert.equal((await p.take('cell-rejected')).reason,'terrain-not-ready');await p.tick(20);assert.equal(p.latest.streaming!.terrainCells,1);assert.ok(p.latest.grounded);
 p.send({type:'cell-unload',key:'region:0:0',revision:3});await p.take('cell-pending');p.send({type:'cell-load',...terrainCell(0,0,()=>0,4)});await p.take('cell-ack');await p.tick();assert.equal(p.latest.streaming!.pendingUnloads,0);assert.equal(p.latest.streaming!.terrainCells,1);
 p.send({type:'cell-unload',key:'region:0:0',revision:3});await p.tick();assert.equal(p.latest.streaming!.pendingUnloads,0,'stale deferred-unload replay stays ignored');
});


test('float32 seam rounding at distant coordinates cannot create a false residency gap',async t=>{
 const cells=[];for(let cx=8;cx<=10;cx++)for(let cz=-1;cz<=1;cz++)cells.push(terrainCell(cx,cz));
 const p=await regionalPhysics(t,{x:639.5474243164062,z:32.009796142578125,initialCells:cells});p.input({x:-1,analog:true});const samples=await p.tick(300);assert.ok(p.latest.x<602);assert.ok(samples.every(s=>!s.streaming!.blocked));supported(samples,()=>0);
});
