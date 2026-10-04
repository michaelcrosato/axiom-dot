import {TownSnapshotContinuity} from '../src/town-life-runtime.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {TownCrowd,TownRenderMotion,clearTownBody,townPathClear,slideTownCrowd} from '../src/town-crowd.ts';
import {validTownLifePoses,copyTownLifePoses} from '../src/town-life-projection.ts';
import {townResidents,townResidentPose,type TownResidentPose} from '../src/town-residents.ts';
import {startingTown,TOWN_CENTER,TOWN_BOUNDS} from '../src/starting-town.ts';
import {createTownView} from '../src/town-view.ts';
import {DEFAULT_TOWN_TUNING} from '../src/town-population.ts';
import {terrainCell} from './helpers/regional-physics.ts';
import {townLifePhysics as regionalPhysics} from './helpers/town-life-physics.ts';
const seed=73129;
const distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
function life():TownResidentPose[]{return townResidents(seed).map(r=>townResidentPose(r,0,startingTown(seed)));}
const trace=(p:{messages:any[]})=>p.messages.filter(m=>m.type==='town-projection').at(-1);
const cells=()=>[terrainCell(-3,-3,()=>6),terrainCell(-3,-2,()=>6),terrainCell(-2,-3,()=>6),terrainCell(-2,-2,()=>6)];
function squareLife(offset=0){const poses=life();poses[0]={x:TOWN_CENTER.x+offset,z:TOWN_CENTER.z+10,facing:0,activity:'working',moving:false,speed:0,distance:0};return poses;}
function matrices(view:ReturnType<typeof createTownView>){return view.root.children.map((m:any)=>Array.from(m.instanceMatrix.array));}

test('life pose boundary requires a complete dense bounded roster with only known pose fields',()=>{
 const p=life();assert(validTownLifePoses(p));assert(validTownLifePoses(copyTownLifePoses(p)));
 for(const invalid of [undefined,null,{},[],p.slice(1),[...p,p[0]],new Array(100),Object.assign(new Array(100),{filler:0}),p.map((q,i)=>i===0?{...q,x:NaN}:q),p.map((q,i)=>i===0?{...q,z:Infinity}:q),p.map((q,i)=>i===0?{...q,x:TOWN_CENTER.x+TOWN_BOUNDS.halfWidth+.001}:q),p.map((q,i)=>i===0?{...q,facing:7}:q),p.map((q,i)=>i===0?{...q,activity:'unrecognized activity'}:q),p.map((q,i)=>i===0?{...q,moving:1}:q),p.map((q,i)=>i===0?{...q,speed:-1}:q),p.map((q,i)=>i===0?{...q,distance:1e9+1}:q),p.map((q,i)=>i===0?{...q,secret:'not a pose'}:q)]){
  assert.equal(validTownLifePoses(invalid),false);
 }
 const detached=copyTownLifePoses(p);detached[0]!.x++;assert.notEqual(detached[0]!.x,p[0]!.x);
});

test('life projection changes at the same clock and ignores routine query history without mutating input',()=>{
 const c=new TownCrowd(seed),a=squareLife(),b=squareLife(6),before=JSON.stringify(a);
 const original=c.sample(40,100,1),first=c.sample(40,100,1,[],a),second=c.sample(40,100,1,[],b);
 assert(distance(first[0]!,second[0]!)>5);
 assert.equal(first[0]!.activity,'working');
 c.sample(900);c.sample(1,100,1,[],b);
 assert.deepEqual(c.sample(40,100,1,[],a),first);
 assert.deepEqual(new TownCrowd(seed).sample(500,100,1,[],a),first,'life clock does not substitute the fixed route');
 assert.deepEqual(c.sample(40),original,'omitting life preserves the exact old behavior');
 assert.equal(JSON.stringify(a),before);
 assert.throws(()=>c.sample(40,100,1,[],[]),/Invalid authoritative/);
});

test('life poses receive wall clipped body separation and deterministically ordered actor clearance',()=>{
 const c=new TownCrowd(seed),a=squareLife();a[1]={...a[0]!,x:a[0]!.x+.08};const frozen=Object.freeze(a.map(p=>Object.freeze({...p})));
 const actors=[{id:'b',x:TOWN_CENTER.x+1,z:TOWN_CENTER.z+10,feetY:6},{id:'a',x:TOWN_CENTER.x-1,z:TOWN_CENTER.z+10,feetY:6}];
 const projected=c.sample(0,100,1,actors,frozen);assert.deepEqual(projected,c.sample(0,100,1,[...actors].reverse(),frozen));
 for(let i=0;i<projected.length;i++){const p=projected[i]!;assert(distance(p,clearTownBody(c.plan,p))<1e-8);for(const actor of actors)assert(distance(p,actor)>=.685-1e-8);for(let j=i+1;j<projected.length;j++)assert(distance(p,projected[j]!)>=.605-1e-8);}
 assert.equal(c.unresolvedActorContacts,0);
});

test('life root motion remains render smooth and wall clipped between current snapshots',()=>{
 for(const hz of [30,60,120]){
  const c=new TownCrowd(seed),motion=new TownRenderMotion(),p=squareLife();let last=motion.update(c.sample(0,100,1,[],p),0,c.plan,true),moved=0;
  for(let n=1;n<=hz;n++){p[0]={...p[0]!,x:TOWN_CENTER.x+n/hz,moving:true,speed:1,distance:n/hz};const next=motion.update(c.sample(0,100,1,[],p),1/hz,c.plan);for(let i=0;i<100;i++){assert(distance(next[i]!,last[i]!)<=10/hz+1e-8);assert(townPathClear(c.plan,last[i]!,next[i]!));}if(distance(next[0]!,last[0]!)>1e-5)moved++;last=next;}
  assert(moved>hz*.9);
 }
});

test('view uses canonical life activity for gait, selected detail and nearest conversation target',()=>{
 const a=createTownView(seed),b=createTownView(seed),p=squareLife(),q=copyTownLifePoses(p);q[0]!.activity='at home';
 const observer={x:TOWN_CENTER.x,z:TOWN_CENTER.z+10};
 try{
  a.update(1,observer,()=>true,true,DEFAULT_TOWN_TUNING,true,0,[],false,p);
  b.update(1,observer,()=>true,true,DEFAULT_TOWN_TUNING,true,0,[],false,q);
  assert.equal(a.poses[0]!.activity,'working');assert.equal(a.population.poses[0]!.activity,'working');
  assert.notDeepEqual(matrices(a),matrices(b),'working action reaches procedural gestures rather than keeping shop');
  assert.equal(a.nearest(a.poses[0]!,.01)?.resident.index,0);
  assert.equal(a.stats.activitySource,'authoritative life snapshot');assert.equal(a.stats.nearHz,null);
  const moved=copyTownLifePoses(p);moved[0]!.x+=5;moved[0]!.activity='meeting neighbors';
  a.update(1,observer,()=>true,true,DEFAULT_TOWN_TUNING,false,1/60,[],false,moved);
  assert.equal(a.poses[0]!.activity,'meeting neighbors');assert.equal(a.population.poses[0]!.x,moved[0]!.x);
  const frozen=a.poses.map(p=>({x:p.x,z:p.z}));moved[0]!.activity='at home';a.update(1,observer,()=>true,true,DEFAULT_TOWN_TUNING,false,0,[],false,moved);
  assert.deepEqual(a.poses.map(p=>({x:p.x,z:p.z})),frozen);assert.equal(a.poses[0]!.activity,'at home');
  a.update(1,observer,()=>true,true,DEFAULT_TOWN_TUNING,false,0,[],false);
  assert.equal(a.stats.activitySource,'fixed routine');assert.equal(a.stats.nearHz,10);
 }finally{a.dispose();b.dispose();}
});

test('real worker uses life snapshot contact and keeps the last snapshot for invalid or omitted input',async t=>{
 const lifePoses=squareLife(),c=new TownCrowd(seed),p=await regionalPhysics(t,{x:TOWN_CENTER.x,z:TOWN_CENTER.z+12,y:6,startPaused:true,initialCells:cells(),town:{seed,time:0,selfId:'solo',actors:[],lifePoses}});
 assert.equal((p.latest as any).town.source,'life');assert.deepEqual(trace(p).first,lifePoses[0]);p.input({x:0,z:-1,paused:false,townLifePoses:[]});
 let prior=p.latest;
 for(let tick=0;tick<70;tick++){await p.tick();const next=p.latest,poses=c.sample(0,100,1,[{id:'solo',x:prior.x,z:prior.z,feetY:prior.feetY}],lifePoses),safe=slideTownCrowd(prior,next,poses,prior.feetY);assert(distance(next,safe)<.002,'actual worker movement obeys the passed snapshot');prior=next;}
 assert.equal((p.latest as any).town.source,'life');assert.deepEqual(trace(p).first,lifePoses[0]);
});

test('real worker accepts new life poses at unchanged time and restores them on failed zone replacement',async t=>{
 const first=squareLife(),p=await regionalPhysics(t,{x:TOWN_CENTER.x,z:TOWN_CENTER.z+12,y:6,startPaused:true,initialCells:cells(),online:true,town:{seed,time:0,selfId:'solo',actors:[],lifePoses:first}});
 const next=squareLife(6);p.input({townTime:0,townLifePoses:next,paused:true});await p.tick();assert.equal(p.latest.step,0);
 p.send({type:'test-fail-allocation',after:0});await p.take('test-fault-ready');
 p.send({type:'zone',epoch:1,x:TOWN_CENTER.x,z:TOWN_CENTER.z+12,y:6,obstacles:[],streamedTerrain:true,bound:Math.sqrt(10_000_000)/2,initialCells:cells(),manual:true,startPaused:true,town:{seed,time:999,selfId:'solo',actors:[],lifePoses:first}});
 const rejected=await p.take('zone-rejected');assert.equal(rejected.epoch,0);p.input({x:0,z:-1,paused:false});const c=new TownCrowd(seed);let prior=p.latest;
 for(let tick=0;tick<45;tick++){await p.tick();const current=p.latest,poses=c.sample(0,100,1,[{id:'solo',x:prior.x,z:prior.z,feetY:prior.feetY}],next);assert(distance(slideTownCrowd(prior,current,poses,prior.feetY),current)<.002);prior=current;}
 assert.equal((p.latest as any).town.source,'life');assert((p.latest as any).town.time<=.3);assert.deepEqual(trace(p).first,next[0],'same-clock update survives a replacement allocation failure');
});

test('legacy worker packet stays on fixed routines and world replacement clears life snapshot',async t=>{
 const p=await regionalPhysics(t,{x:TOWN_CENTER.x,z:TOWN_CENTER.z+12,y:6,startPaused:true,initialCells:cells(),town:{seed,time:0,selfId:'solo',actors:[]}});
 assert.equal((p.latest as any).town.source,'routine');p.input({townLifePoses:squareLife(),paused:false});await p.tick();assert.equal((p.latest as any).town.source,'life');
 await p.zone({x:TOWN_CENTER.x,z:TOWN_CENTER.z+12,y:6,startPaused:true,initialCells:cells(),town:{seed,time:0,selfId:'solo',actors:[]}});
 assert.equal((p.latest as any).town.source,'routine');
});

test('invalid replacement life pose packets are rejected before the current worker world changes',async t=>{
 const poses=squareLife(),p=await regionalPhysics(t,{x:TOWN_CENTER.x,z:TOWN_CENTER.z+12,y:6,startPaused:true,initialCells:cells(),town:{seed,time:0,selfId:'solo',actors:[],lifePoses:poses}});
 p.send({type:'zone',epoch:1,x:TOWN_CENTER.x,z:TOWN_CENTER.z+12,y:6,obstacles:[],streamedTerrain:true,bound:Math.sqrt(10_000_000)/2,initialCells:cells(),manual:true,startPaused:true,town:{seed,time:999,selfId:'solo',actors:[],lifePoses:poses.slice(1)}});
 p.input({paused:false,townTime:0,townLifePoses:poses.map((q,i)=>i===0?{...q,x:Infinity}:q)});await p.tick();
 assert.equal(p.latest.epoch,0);assert.equal((p.latest as any).town.source,'life');assert.deepEqual(trace(p).first,poses[0]);
});

test('life baseline cache reuses one snapshot but invalidates identity, content and tuning independently',()=>{
 const c=new TownCrowd(seed),p=squareLife(),first=c.sample(0,100,1,[],p),checks=c.pairChecks;
 assert(checks>0);assert.deepEqual(c.sample(0,100,1,[],p),first);assert.equal(c.pairChecks,checks);
 const actor={id:'solo',x:first[0]!.x,z:first[0]!.z,feetY:6};c.sample(0,100,1,[actor],p);
 assert.deepEqual(c.sample(0,100,1,[],p),first,'actor projection never contaminates the cached baseline');
 const beforeClone=c.pairChecks;assert.deepEqual(c.sample(0,100,1,[],copyTownLifePoses(p)),first);assert(c.pairChecks>beforeClone,'new snapshot identity invalidates at unchanged clock');
 c.sample(0,100,1,[],p);const beforeChange=c.pairChecks;p[0]!.x+=5;p[0]!.activity='meeting neighbors';const changed=c.sample(0,100,1,[],p);
 assert(c.pairChecks>beforeChange);assert(distance(changed[0]!,first[0]!)>4);assert.equal(changed[0]!.activity,'meeting neighbors');
 const low=c.sample(0,7,.25,[],p);assert.equal(low.length,7);assert.deepEqual(low,new TownCrowd(seed).sample(0,7,.25,[],p));
});

test('worker duplicate snapshot packets retain cache identity but same-time action changes replace it',async t=>{
 const poses=squareLife(),p=await regionalPhysics(t,{x:TOWN_CENTER.x,z:TOWN_CENTER.z+12,y:6,startPaused:true,initialCells:cells(),town:{seed,time:0,selfId:'solo',actors:[],lifePoses:poses}});
 p.input({paused:false,townTime:0,townLifePoses:copyTownLifePoses(poses)});await p.tick();
 assert.equal(trace(p).sameSnapshot,true,'structured clone identity alone does not force a baseline rebuild');
 const changed=copyTownLifePoses(poses);changed[0]!.activity='meeting neighbors';
 p.input({townTime:0,townLifePoses:changed});await p.tick();
 assert.equal(trace(p).sameSnapshot,false);assert.deepEqual(trace(p).first,changed[0]);
});


test('online life presentation resynchronizes an interrupted snapshot without ghost catch-up',()=>{
 const view=createTownView(seed),continuity=new TownSnapshotContinuity(),old=squareLife(),next=squareLife(12);try{
  view.update(0,TOWN_CENTER,()=>true,true,undefined,true,0,[],true,old);
  continuity.note('reconnecting');continuity.note('connected');view.update(30,TOWN_CENTER,()=>true,true,undefined,continuity.take(30),1/60,[],true,next);
  const canonical=new TownCrowd(seed).sample(30,100,1,[],next);assert.deepEqual(view.poses,canonical);assert(distance(view.poses[0]!,old[0]!)>10);
  view.update(0,TOWN_CENTER,()=>true,true,undefined,true,0,[],true,old);view.update(0,TOWN_CENTER,()=>true,true,undefined,false,0,[],true,squareLife(6));assert(distance(view.poses[0]!,old[0]!)<.01);continuity.note('paused');continuity.note('connected');view.update(30,TOWN_CENTER,()=>true,true,undefined,continuity.take(30),0,[],true,next);assert.deepEqual(view.poses,canonical,'an explicit connection-resume lifecycle resynchronizes instead of treating ordinary render lag as a reconnect');
 }finally{view.dispose();}
});
