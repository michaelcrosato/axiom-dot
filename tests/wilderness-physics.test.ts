import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {DodecahedronGeometry,PlaneGeometry} from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {wildernessFeatures,wildernessObstacles,wildernessFeatureRemaining,nearestWildernessSolidPoint,type WildernessFeature,type WildernessObstacle} from '../src/wilderness.ts';
import {dodecahedronObstacle,nearestObstaclePoint,obstacleSegmentIntersects} from '../src/wilderness-geometry.ts';
import {worldValley} from '../src/generation.ts';
import {generateObjects} from '../src/world.ts';
import {withinBuildArea} from '../src/waterworks.ts';
import {WORKSHOP_CLEARANCE} from '../src/building.ts';
import {valleyHeight} from '../src/valley.ts';
type Snapshot={epoch:number;step:number;x:number;y:number;z:number;feetY:number;vx:number;vz:number;vy:number;grounded:boolean;crouched:boolean;sliding:boolean;movable:{x:number;y:number;z:number;hx:number;hy:number;hz:number}[]};
async function physics(t:TestContext,config:Record<string,unknown>={}){
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);parentPort.on('message',m=>self.onmessage({data:m}));import(${JSON.stringify(new URL('../src/physics.worker.ts',import.meta.url).href)}).then(()=>parentPort.postMessage({type:'boot'}));`,{eval:true,execArgv:['--experimental-strip-types']});
 t.after(()=>worker.terminate());let epoch=0,error:Error|undefined,latest:Snapshot;const messages:any[]=[],snapshots:Snapshot[]=[];
 worker.on('error',e=>error=e);worker.on('message',m=>{messages.push(m);if(m.type==='error')error=new Error(m.message);if(m.type==='snapshot'){latest=m;snapshots.push(m);}});
 const take=async(type:string)=>{const deadline=Date.now()+5000;for(;;){if(error)throw error;const index=messages.findIndex(m=>m.type===type);if(index>=0)return messages.splice(index,1)[0];assert.ok(Date.now()<deadline,`Waiting ${type}`);await new Promise(r=>setTimeout(r,2));}};
 const send=(m:Record<string,unknown>)=>worker.postMessage({epoch,...m});
 const tick=async(ticks=1)=>{const start=snapshots.length;for(let left=ticks;left>0;left-=120){send({type:'step',ticks:Math.min(left,120)});await take('stepped');}return snapshots.slice(start);};
 const input=(values:Record<string,unknown>={})=>send({type:'input',x:0,z:0,...values});
 await take('boot');send({type:'init',x:0,z:0,obstacles:[],manual:true,...config});await take('ready');await tick(4);
 return {send,tick,input,take,messages,get latest(){return latest!;},async zone(next:Record<string,unknown>){epoch++;send({type:'zone',x:0,z:0,obstacles:[],manual:true,...next});await take('ready');await tick(4);}};
}
function grid(height:(x:number,z:number)=>number,bound=16,step=2){const vertices:number[]=[],indices:number[]=[],n=2*bound/step+1;for(let zi=0;zi<n;zi++)for(let xi=0;xi<n;xi++){const x=xi*step-bound,z=zi*step-bound;vertices.push(x,height(x,z),z);}for(let z=0;z<n-1;z++)for(let x=0;x<n-1;x++){const a=z*n+x,b=a+1,c=a+n,d=c+1;indices.push(a,c,b,b,c,d);}return {vertices,indices,bound,step};}
function legacyOracle(seed:number){
 let n=seed;const rnd=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};const result:{kind:string;source:string;x:number;y:number;z:number;size:number}[]=[];
 const terrain=new PlaneGeometry(112,112,56,56);terrain.rotateX(-Math.PI/2);const positions=terrain.attributes.position!;
 for(let i=0;i<positions.count;i++){if(Math.abs(positions.getX(i))>=3)rnd();rnd();}terrain.dispose();
 for(let i=0;i<37;i++)for(const side of [-1,1]){const size=.5+rnd()*.8,x=side*(3+rnd()*.8);result.push({kind:'rock',source:'river-rock',x,y:.15,z:-48+i*2.7,size});}
 const objects=generateObjects(seed),clear=(x:number,z:number,margin:number)=>Math.abs(x-WORKSHOP_CLEARANCE.x)<WORKSHOP_CLEARANCE.hx+margin&&Math.abs(z-WORKSHOP_CLEARANCE.z)<WORKSHOP_CLEARANCE.hz+margin;
 for(let i=0;i<130;i++){const x=(rnd()-.5)*96,z=(rnd()-.5)*96;if(withinBuildArea(x,z,.75)||Math.abs(x)<6||Math.abs(z-2)<4||Math.hypot(x+16,z+4)<14||Math.hypot(x-21,z+16)<11||Math.hypot(x+13,z-12)<4||objects.some(o=>Math.hypot(x-o.x,z-o.z)<3))continue;const size=.9+rnd()*1.6;if(clear(x,z,1))continue;result.push({kind:'tree',source:'tree',x,y:0,z,size});}
 for(let i=0;i<34;i++){rnd();rnd();rnd();rnd();}
 for(let i=0;i<90;i++){const x=(rnd()-.5)*85,z=(rnd()-.5)*85;if(Math.abs(x)<4||withinBuildArea(x,z,.5))continue;const size=.25+rnd()*.5;if(clear(x,z,.5))continue;result.push({kind:'rock',source:'field-rock',x,y:.12,z,size});}
 return result;
}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
test('legacy catalog exactly replays actual renderer RNG, conditional draws and stable world-qualified ownership',()=>{
 for(const seed of [0,1,73129,0xffffffff]){const identity={generation:1 as const,seed},features=wildernessFeatures(identity),actual=features.filter(f=>f.source!=='cave-rock').map(f=>({kind:f.kind,source:f.source,x:f.x,y:f.y,z:f.z,size:f.treeScale??f.radius}));assert.deepEqual(actual,legacyOracle(seed));assert.ok(Object.isFrozen(features)&&features.every(f=>Object.isFrozen(f)&&Object.isFrozen(f.solids)));assert.equal(new Set(features.map(f=>f.id)).size,features.length);assert.ok(features.every(f=>f.id.startsWith(`world:1:${seed}/wilderness:`)));assert.equal(features.filter(f=>f.source==='cave-rock').length,7);assert.ok(!features.some(f=>/^rock-\d+$/.test(f.sourceId)),'worldObjects ghost rings are not invisible solids');}
 assert.equal(wildernessFeatures({generation:1,seed:1}).filter(f=>f.kind==='tree').some(f=>f.treeScale!<=1.3&&f.solids.length===1),true,'small trees now have actual trunks');
});
test('connected catalog preserves every pinned decoration and matches terrain footings without canopy boxes',()=>{
 for(const seed of [0,73129,0xffffffff]){const plan=worldValley(seed),before=digest(plan),features=wildernessFeatures({generation:2,seed});assert.equal(features.length,plan.decorations.length+7);for(const d of plan.decorations){const f=features.find(f=>f.sourceId===d.id)!;assert.ok(f);assert.equal(f.x,d.x);assert.equal(f.z,d.z);assert.equal(f.y,d.kind==='tree'?d.y:d.y+d.radius*.35);assert.equal(f.solids.length,1);if(f.kind==='tree'){const o=f.solids[0]!;assert.equal(o.hx,.175);assert.equal(o.hz,.175);assert.ok(Math.abs(o.y!+o.hy-(d.y+d.height*.4))<1e-10);for(const dx of [-.175,.175])for(const dz of [-.175,.175])assert.ok(o.y!-o.hy<=valleyHeight(plan,d.x+dx,d.z+dz));}}
 assert.equal(digest(plan),before,'catalog does not mutate or regenerate pinned plan');}
});
test('rock hulls use visible Dodecahedron vertices, tight bounds and exact closest points instead of empty AABB corners',()=>{
 for(const f of wildernessFeatures({generation:1,seed:1}).filter(f=>f.kind==='rock')){const geometry=new DodecahedronGeometry(f.radius,0),p=geometry.attributes.position!,o=f.solids[0]!,hull=o.convexVertices!;for(let i=0;i<p.count;i++){const x=p.getX(i)*f.scale.x,y=p.getY(i)*f.scale.y,z=p.getZ(i)*f.scale.z;assert.ok(Array.from({length:hull.length/3},(_,j)=>Math.hypot(hull[j*3]!-x,hull[j*3+1]!-y,hull[j*3+2]!-z)).some(d=>d<1e-6));}geometry.dispose();assert.equal(o.convexPlanes!.length,12);assert.ok(o.convexPlanes!.every(plane=>Array.from({length:hull.length/3},(_,j)=>plane.x*hull[j*3]!+plane.y*hull[j*3+1]!+plane.z*hull[j*3+2]!<=plane.d+1e-6).every(Boolean)));}
 const o=dodecahedronObstacle('probe',0,1,0,1,{x:1,y:1,z:1}),corner={x:o.hx*.99,y:1+o.hy*.99,z:o.hz*.99};assert.ok(nearestObstaclePoint(o,corner).distance>.4);assert.equal(obstacleSegmentIntersects(o,corner,{...corner,y:corner.y+.1}),false);assert.equal(obstacleSegmentIntersects(o,{x:-2,y:1,z:0},{x:2,y:1,z:0}),true);
});
test('depletion projection removes only collected small stones and retains trunk and structural hulls',()=>{
 const identity={generation:1 as const,seed:1},features=wildernessFeatures(identity),small=features.find(f=>f.removable)!,tree=features.find(f=>f.kind==='tree')!,large=features.find(f=>f.source==='river-rock')!;assert.ok(small.radius!<=.75);const state={harvested:[small.id,tree.id,large.id]};assert.equal(wildernessFeatureRemaining(small,state),false);assert.equal(wildernessFeatureRemaining(tree,state),true);assert.equal(wildernessFeatureRemaining(large,state),true);assert.equal(wildernessObstacles(identity,state).length,features.length-1);assert.ok(nearestWildernessSolidPoint(tree,{x:tree.x+1,y:tree.y+1,z:tree.z}).distance>.8);
});
const flatTree:WildernessObstacle={x:0,y:1.6,z:0,hx:.175,hy:1.6,hz:.175};
async function noPenetration(snapshots:Snapshot[],obstacle:WildernessObstacle){
 await RAPIER.init();const shape=obstacle.convexVertices?new RAPIER.ConvexPolyhedron(new Float32Array(obstacle.convexVertices)):new RAPIER.Cuboid(obstacle.hx,obstacle.hy,obstacle.hz),rotation={x:0,y:0,z:0,w:1};
 for(const s of snapshots){const capsule=new RAPIER.Capsule(s.crouched?.2:.75,.30);assert.equal(shape.intersectsShape({x:obstacle.x,y:obstacle.y??obstacle.hy,z:obstacle.z},rotation,capsule,{x:s.x,y:s.y,z:s.z},rotation),false,`solid penetration at ${JSON.stringify(s)}`);}
}
test('actual worker blocks walk, sprint, jump, crawl and slide at all trunk sizes without a canopy-sized barrier',async t=>{
 const p=await physics(t,{x:-4,initialCells:[{key:'tree',revision:1,obstacles:[flatTree]}]});
 for(const action of ['walk','sprint','jump','crawl','slide']){
  await p.zone({x:-4,initialCells:[{key:'tree',revision:1,obstacles:[flatTree]}]});let samples:Snapshot[]=[];
  if(action==='slide'){p.input({x:1,sprint:true});samples.push(...await p.tick(23));p.input({x:1,crouch:true});}
  else if(action==='jump'){p.input({x:1,sprint:true});samples.push(...await p.tick(22));p.input({x:1,sprint:true,jump:true});}
  else p.input({x:1,sprint:action==='sprint',crouch:action==='crawl'});
  samples.push(...await p.tick(200));assert.ok(p.latest.x<-.49&&p.latest.x>-.7,`${action} blocked by .35m visible trunk, x=${p.latest.x}`);await noPenetration(samples,flatTree);if(action==='slide')assert.ok(samples.some(s=>s.sliding));if(action==='jump')assert.ok(samples.some(s=>s.feetY>.4));
 }
 await p.zone({x:-4,z:.65,initialCells:[{key:'tree',revision:1,obstacles:[flatTree]}]});p.input({x:1});await p.tick(110);assert.ok(p.latest.x>3,'passes only .65m from trunk center, well under canopy');
 const small={...flatTree,y:.72,hy:.72};await p.zone({x:-3,initialCells:[{key:'sapling',revision:1,obstacles:[small]}]});p.input({x:1,crouch:true});await p.tick(180);assert.ok(p.latest.x<-.49,'old s<=1.3 trees are solid to crawling');
});
test('exact rock hulls retain real collision across walk sprint jump crawl slide on elevated uneven terrain',async t=>{
 const terrain=grid((x,z)=>4+.08*x+.025*Math.abs(z)),o=dodecahedronObstacle('stone',0,4.5,0,1.5,{x:1,y:.65,z:1}),p=await physics(t,{terrain,x:-4,initialCells:[{key:'rock',revision:2,obstacles:[o]}]});
 for(const action of ['walk','sprint','jump','crawl','slide']){await p.zone({terrain,x:-4,initialCells:[{key:'rock',revision:2,obstacles:[o]}]});let samples:Snapshot[]=[];if(action==='slide'||action==='jump'){p.input({x:1,sprint:true});samples.push(...await p.tick(20));p.input({x:1,sprint:true,crouch:action==='slide',jump:action==='jump'});}else p.input({x:1,sprint:action==='sprint',crouch:action==='crawl'});samples.push(...await p.tick(180));await noPenetration(samples,o);assert.ok(samples.every(s=>s.feetY>3),'elevated ground is retained');assert.ok(samples.some(s=>s.x> -3),'actually approaches stone');if(samples.some(s=>s.x>0))assert.ok(samples.some(s=>s.feetY>4.7),'crossing is over the stone, never through it');}
});
test('actual generated terrain has no low-crawl gap beneath trunks and no phantom canopy on slopes',async t=>{
 const identity={generation:2 as const,seed:73129},plan=worldValley(identity.seed),feature=wildernessFeatures(identity).filter(f=>f.kind==='tree').sort((a,b)=>b.y-a.y)[0]!,o=feature.solids[0]!;
 const p=await physics(t,{terrain:plan.terrain,bound:80,x:feature.x-2,z:feature.z,initialCells:[{key:'real-tree',revision:1,obstacles:[o]}]});p.input({x:1,crouch:true});const samples=await p.tick(160);await noPenetration(samples,o);assert.ok(p.latest.x<feature.x-.49,'trunk foot extends below downhill corner');assert.ok(p.latest.feetY>3,'test uses genuinely elevated generation terrain');
});
test('preloaded cells resolve old-save overlaps before ready; teleport sees newly loaded hulls and stale packets never resurrect them',async t=>{
 const o=dodecahedronObstacle('stone',0,.5,0,1.3,{x:1,y:.65,z:1}),p=await physics(t,{x:0,z:0,initialCells:[{key:'cell',revision:7,obstacles:[o]}]});assert.ok(Math.hypot(p.latest.x,p.latest.z)>1,'old save moved beside solid before first snapshot');await noPenetration([p.latest],o);assert.ok(p.latest.feetY<.04,'does not teleport onto stone canopy/top');
 p.send({type:'cell-unload',key:'cell',revision:8});await p.take('cell-ack');p.send({type:'cell-load',key:'cell',revision:7,obstacles:[o]});p.send({type:'teleport',x:0,z:0});await p.tick(4);assert.ok(Math.abs(p.latest.x)<.01&&Math.abs(p.latest.z)<.01,'stale reload cannot resurrect depleted solid');
 p.send({type:'cell-load',key:'cell',revision:9,obstacles:[o]});await p.take('cell-ack');p.send({type:'teleport',x:0,z:0});await p.tick(4);await noPenetration([p.latest],o);assert.ok(Math.hypot(p.latest.x,p.latest.z)>1);
 await p.zone({x:-3,initialCells:[{key:'cell',revision:1,obstacles:[flatTree]}]});p.send({type:'cell-unload',epoch:0,key:'cell',revision:100});p.send({type:'cell-load',key:'cell',revision:0,obstacles:[]});p.input({x:1});await p.tick(100);assert.ok(p.latest.x<-.49,'epoch and preload revision retained');
 p.send({type:'cell-unload',key:'cell',revision:2});await p.take('cell-ack');p.input({x:1});await p.tick(90);assert.ok(p.latest.x>2,'valid unload releases only its owner solid');
});
test('invalid preloads and degenerate hull packets cannot mutate a live world',async t=>{
 const p=await physics(t,{x:-3,initialCells:[{key:'tree',revision:1,obstacles:[flatTree]}]});const bad={...flatTree,convexVertices:[0,0,0,.1,0,0,0,.1,0,.1,.1,0]};
 p.send({type:'cell-load',key:'tree',revision:2,obstacles:[bad]});p.send({type:'zone',epoch:1,x:0,z:0,obstacles:[],initialCells:[{key:'x',revision:0,obstacles:[bad]}]});p.send({type:'zone',epoch:1,x:0,z:0,obstacles:[],initialCells:[{key:'x',revision:0,obstacles:[]},{key:'x',revision:1,obstacles:[]}]});p.input({x:1});await p.tick(120);assert.equal(p.latest.epoch,0);assert.ok(p.latest.x<-.49);assert.ok(!p.messages.some(m=>m.type==='cell-ack'));
});
test('real movable crates stop against narrow trunks and exact rocks instead of pushing through wilderness',async t=>{
 const crate={id:'crate',x:1,y:.6,z:0,hx:.5,hy:.6,hz:.5},tree={...flatTree,x:2.3},rock=dodecahedronObstacle('rock',3,.5,0,1.3,{x:1,y:.65,z:1}),p=await physics(t,{movable:[crate],interactionEnabled:true,initialCells:[{key:'tree',revision:1,obstacles:[tree]}]});
 for(const o of [tree,rock]){await p.zone({movable:[crate],interactionEnabled:true,initialCells:[{key:'solid',revision:1,obstacles:[o]}]});p.send({type:'contact-grab'});p.input({x:1});await p.tick(180);const c=p.latest.movable[0]!;assert.ok(c.x<1.7,`crate stopped before solid: ${JSON.stringify(c)}`);assert.ok(p.latest.x+.32<c.x-c.hx+.01,'player does not overlap crate');}
});
test('new solid legacy bank stones leave the essential bridge center walkable in both directions',async t=>{
 const p=await physics(t);
 for(const seed of [0,1,73129,0xffffffff]){const obstacles=wildernessObstacles({generation:1,seed});await p.zone({x:-5,z:2,initialCells:[{key:'wilderness',revision:1,obstacles}]});p.input({x:1});const across=await p.tick(140);assert.ok(p.latest.x>5,`seed ${seed} eastward bridge blocked at ${p.latest.x},${p.latest.z}`);assert.ok(across.every(s=>Math.abs(s.z-2)<.95),`seed ${seed} stays within the bridge walking lane: drift ${Math.max(...across.map(s=>Math.abs(s.z-2)))}`);p.send({type:'teleport',x:5,z:2});await p.tick(3);p.input({x:-1});await p.tick(140);assert.ok(p.latest.x<-5,`seed ${seed} westward bridge blocked at ${p.latest.x},${p.latest.z}`);}
});
test('restored crouched checkpoint uses native capsule dimensions and keeps its exact ground skin under a low roof',async t=>{
 const roof={x:0,y:1.5,z:0,hx:3,hy:.3,hz:3},p=await physics(t,{obstacles:[roof]});p.input({crouch:true});await p.tick(20);p.input({paused:true});p.send({type:'capture',requestId:'low'});const checkpoint=(await p.take('captured')).checkpoint;assert.equal(checkpoint.crouched,true);
 await p.zone({x:8,z:8});await p.zone({obstacles:[roof],checkpoint,initialCells:[{key:'nearby-tree',revision:1,obstacles:[{...flatTree,x:4}]}]});p.send({type:'capture',requestId:'restored'});const restored=(await p.take('captured')).checkpoint;
 for(const field of ['x','z','feetY','crouched','stance','vy','grounded'])assert.equal(restored[field],checkpoint[field],`${field} unchanged by restore overlap query`);
 p.input();await p.tick(30);assert.equal(p.latest.crouched,true);assert.ok(Math.abs(p.latest.feetY-checkpoint.feetY)<.025,`ground skin stays bounded after resumed contact: ${p.latest.feetY} vs ${checkpoint.feetY}`);
});
