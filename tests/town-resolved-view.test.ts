import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TownCrowd,TownLifeRenderBuffer,townPathClear} from '../src/town-crowd.ts';
import {copyTownLifePoses,sameTownLifePoses,validTownLifePoses} from '../src/town-life-projection.ts';
import {createTownLife,createTownLifeOpening,advanceTownLife} from '../src/town-life.ts';
import {townLifePoses,townLifeClock} from '../src/town-life-runtime.ts';
import {createTownView} from '../src/town-view.ts';
import {startingTown,TOWN_CENTER} from '../src/starting-town.ts';
import type {TownResidentPose} from '../src/town-residents.ts';

/** Unit fixtures are accepted transport trajectories, not a substitute for the
 * navigation engine's authority/collision integration tests. */
function accepted():TownResidentPose[]{return townLifePoses(createTownLife(73129))!.map(p=>({...p,authoritativeMotion:1,contactResolved:true,motionPath:[{x:p.x,z:p.z,t:0},{x:p.x,z:p.z,t:.5}]}));}
const crowd=(p:readonly TownResidentPose[])=>new TownCrowd(73129).sample(0,100,1,[],p);
function corner(){const a=accepted();a[0]={...a[0]!,x:TOWN_CENTER.x-12,z:TOWN_CENTER.z+10,facing:Math.PI/2,activity:'walking to work',moving:true,speed:1.8,motionPath:undefined};const b=copyTownLifePoses(a);b[0]={...b[0]!,x:a[0]!.x+.45,z:a[0]!.z+.45,activity:'crafting',moving:false,speed:0,distance:.9,motionPath:[{x:a[0]!.x,z:a[0]!.z,t:0},{x:a[0]!.x+.45,z:a[0]!.z,t:.25},{x:a[0]!.x+.45,z:a[0]!.z+.45,t:.5}]};return {a,b};}

test('achieved authority poses cross transport intact and bypass every crowd packing input',()=>{
 const poses=accepted(),before=JSON.stringify(poses),c=new TownCrowd(73129),actors=[{id:'explorer',x:poses[0]!.x,z:poses[0]!.z,feetY:6}];
 assert(validTownLifePoses(poses));assert.deepEqual(c.sample(200,100,1,actors,poses).map(({yielding,...p})=>p),poses);assert.equal(c.pairChecks,0);assert.equal(JSON.stringify(poses),before);
 const detached=copyTownLifePoses(poses);assert(sameTownLifePoses(poses,detached));(detached[0]!.motionPath![0] as {x:number}).x+=.1;assert.notEqual(detached[0]!.motionPath![0]!.x,poses[0]!.motionPath![0]!.x);assert(!sameTownLifePoses(poses,detached));
 for(const invalid of [poses.map((p,i)=>i? p:{...p,authoritativeMotion:undefined}),poses.map((p,i)=>i?p:{...p,motionPath:[{x:p.x,z:p.z,t:0},{x:p.x,z:p.z,t:0}]}),poses.map((p,i)=>i?p:{...p,motionPath:[{x:p.x,z:p.z,t:0},{x:p.x+1,z:p.z,t:.5}]})])assert(!validTownLifePoses(invalid));
});

test('temporary unresolved clearance never hands authoritative roots back to the legacy packing solver',()=>{
 const poses=accepted().map(p=>({...p,contactResolved:false})),c=new TownCrowd(73129);assert(validTownLifePoses(poses));assert.deepEqual(copyTownLifePoses(poses),poses);const shown=c.sample(0,100,1,[{id:'overlap',x:poses[0]!.x,z:poses[0]!.z,feetY:6}],poses);assert.equal(shown[0]!.x,poses[0]!.x);assert.equal(shown[0]!.z,poses[0]!.z);assert.equal(shown[0]!.contactResolved,false);assert.equal(c.pairChecks,0);
});

test('resolved playback follows accepted corner and waits for visible arrival before switching to work',()=>{
 const {a,b}=corner(),buffer=new TownLifeRenderBuffer(),plan=startingTown(73129);buffer.accept(crowd(a),a,0,true);buffer.accept(crowd(b),b,.5);
 const first=buffer.sample(.625,plan)[0]!;assert(Math.abs(first.x-a[0]!.x-.225)<1e-8);assert.equal(first.z,a[0]!.z);assert.equal(first.activity,'walking to work');
 const second=buffer.sample(.875,plan)[0]!;assert.equal(second.x,b[0]!.x);assert(Math.abs(second.z-a[0]!.z-.225)<1e-8);assert.equal(second.activity,'walking to work');
 const arrived=buffer.sample(1,plan)[0]!;assert.equal(arrived.activity,'crafting');assert.equal(arrived.x,b[0]!.x);assert.equal(arrived.z,b[0]!.z);assert.equal(arrived.contactResolved,true);assert.equal(arrived.motionPath,undefined);
});

test('resolved view derives gait from replayed roots and cannot actor-repack an accepted trajectory',()=>{
 const {a,b}=corner(),view=createTownView(73129),actor={id:'explorer',x:a[0]!.x,z:a[0]!.z,feetY:6};
 try{view.update(0,TOWN_CENTER,()=>true,true,undefined,true,0,[actor],false,a);view.acceptLife(.5,b);let last={...view.poses[0]!};
  for(let n=1;n<=60;n++){const time=n/60;view.update(Math.min(time,.5),TOWN_CENTER,()=>true,true,undefined,false,1/60,[actor],false,time<.5?a:b);const p=view.poses[0]!;assert(Math.hypot(p.x-last.x,p.z-last.z)<=3/60+1e-8);assert(p.contactResolved);last={...p};}
  assert(Math.abs(view.poses[0]!.x-a[0]!.x-.09)<.000001,'stale authority limits presentation to the accepted time plus bounded lead');
  const frozen=view.poses.map(p=>[p.x,p.z]);view.update(.5,TOWN_CENTER,()=>true,true,undefined,false,0,[actor],false,b);assert.deepEqual(view.poses.map(p=>[p.x,p.z]),frozen);
 }finally{view.dispose();}
});

test('hand evidence reads emitted arm matrices rather than breathing hashes or intended gait',()=>{
 const view=createTownView(73129),poses=accepted();try{view.update(0,TOWN_CENTER,()=>true,true,undefined,true,0,[],false,poses);const before=view.matrixEvidence()[0]!,arms=(view.root.children[0] as any).instanceMatrix.array;assert.equal(before.handOffsets?.length,6);arms[8*16+12]+=.4;const after=view.matrixEvidence()[0]!;assert(Math.hypot(...after.handOffsets!.map((v,i)=>v-before.handOffsets![i]!))>.39);assert.equal(after.x,before.x);assert.equal(after.z,before.z);}finally{view.dispose();}
});

test('one missing accepted step recovers continuously and rejoins subsequent healthy delivery',()=>{
 const poses=accepted(),p=poses[0]!;p.x=TOWN_CENTER.x-12;p.z=TOWN_CENTER.z+10;p.motionPath=undefined;const buffer=new TownLifeRenderBuffer(),plan=startingTown(73129);buffer.accept(crowd(poses),poses,0,true);let shown=buffer.sample(0,plan,false,0),maxStep=0,sawRecovery=false;
 for(let n=1;n<=300;n++){const now=n*.05,endpoint=Math.floor((now+1e-8)*2)/2;if(endpoint>=1&&n%10===0){const next=copyTownLifePoses(poses);next[0]={...next[0]!,x:p.x+endpoint*1.8,distance:endpoint*1.8,moving:true,speed:1.8,motionPath:[{x:p.x+(endpoint-.5)*1.8,z:p.z,t:0},{x:p.x+endpoint*1.8,z:p.z,t:.5}]};buffer.accept(crowd(next),next,endpoint);}const previous=shown;shown=buffer.sample(now,plan,false,.05);sawRecovery||=buffer.recoveringIds.length>0;for(let i=0;i<100;i++){maxStep=Math.max(maxStep,Math.hypot(shown[i]!.x-previous[i]!.x,shown[i]!.z-previous[i]!.z));assert(townPathClear(plan,previous[i]!,shown[i]!));}}
 assert(sawRecovery);assert(buffer.recoverySeconds>0);assert.equal(buffer.historyIncomplete,false);assert.equal(buffer.recoveringIds.length,0);assert(maxStep<=.15+1e-7);assert(Math.abs(shown[0]!.x-(p.x+14.5*1.8))<1e-6);
});

test('more than 32 seconds of undrawn accepted history recovers instead of dropping all new packets',()=>{
 const poses=accepted(),p=poses[0]!;p.x=TOWN_CENTER.x-12;p.z=TOWN_CENTER.z+10;p.motionPath=undefined;const buffer=new TownLifeRenderBuffer(),plan=startingTown(73129);buffer.accept(crowd(poses),poses,0,true);let shown=buffer.sample(0,plan,false,0);
 for(let tick=1;tick<=80;tick++){const time=tick*.5,next=copyTownLifePoses(poses),x=p.x+Math.min(time,8)*1.8,prior=p.x+Math.min(time-.5,8)*1.8;next[0]={...p,x,motionPath:[{x:prior,z:p.z,t:0},{x,z:p.z,t:.5}]};buffer.accept(crowd(next),next,time);}
 const before=shown.map(p=>[p.x,p.z]);shown=buffer.sample(40,plan,false,0);assert.deepEqual(shown.map(p=>[p.x,p.z]),before,'paused recovery cannot move any root');
 for(let n=0;n<1200;n++){const previous=shown;shown=buffer.sample(40,plan,false,.05);for(let i=0;i<100;i++){assert(Math.hypot(shown[i]!.x-previous[i]!.x,shown[i]!.z-previous[i]!.z)<=.15+1e-7);assert(townPathClear(plan,previous[i]!,shown[i]!));}if(!buffer.historyIncomplete&&buffer.delay<=.50001)break;}
 assert.equal(buffer.historyIncomplete,false);assert.equal(buffer.recoveringIds.length,0);assert(buffer.delay<=.50001);assert(Math.abs(shown[0]!.x-(p.x+14.4))<1e-6);
});

test('missing-history opposed connectors use one coordinated swept-body recovery without crossing peers',()=>{
 const poses=accepted(),z=TOWN_CENTER.z+10;for(let i=0;i<2;i++)poses[i]={...poses[i]!,x:TOWN_CENTER.x+(i?2:-2),z,motionPath:undefined};const next=copyTownLifePoses(poses);for(let i=0;i<2;i++){const x=poses[1-i]!.x;next[i]={...next[i]!,x,motionPath:[{x,z,t:0},{x,z,t:.5}]};}
 const buffer=new TownLifeRenderBuffer(),plan=startingTown(73129);buffer.accept(crowd(poses),poses,0,true);let shown=buffer.sample(0,plan,false,0);buffer.accept(crowd(next),next,2);let minimum=Infinity;
 for(let n=0;n<800;n++){const previous=shown;shown=buffer.sample(3,plan,false,.05);for(let i=0;i<100;i++){assert(townPathClear(plan,previous[i]!,shown[i]!));for(let j=i+1;j<100;j++)minimum=Math.min(minimum,Math.hypot(shown[i]!.x-shown[j]!.x,shown[i]!.z-shown[j]!.z));}if(n>10&&!buffer.historyIncomplete)break;}
 assert(minimum>=.60-1e-7);assert.equal(buffer.historyIncomplete,false);assert.equal(buffer.recoveringIds.length,0);assert(Math.abs(shown[0]!.x-next[0]!.x)<1e-6);assert(Math.abs(shown[1]!.x-next[1]!.x)<1e-6);
});

test('an explorer occupying an obsolete join point cannot hold the entire recovering population',()=>{
 const poses=accepted(),z=TOWN_CENTER.z+10,x=TOWN_CENTER.x-12;for(let i=0;i<2;i++)poses[i]={...poses[i]!,x,z:z+i*5,motionPath:undefined};const actor={id:'explorer',x:x+.5,z,feetY:6},buffer=new TownLifeRenderBuffer(),plan=startingTown(73129);buffer.accept(crowd(poses),poses,0,true);let shown=buffer.sample(0,plan,false,0,[actor]),minActor=Infinity;
 for(let n=1;n<=600;n++){const now=n*.05,time=Math.floor((now+1e-8)*2)/2;if(n%10===0&&time>=1){const next=copyTownLifePoses(poses);for(let i=0;i<2;i++)next[i]={...next[i]!,x:x+time,moving:true,speed:1,distance:time,motionPath:[{x:x+time-.5,z:z+i*5,t:0},{x:x+time,z:z+i*5,t:.5}]};buffer.accept(crowd(next),next,time);}shown=buffer.sample(now,plan,false,.05,[actor]);if(n>30)minActor=Math.min(minActor,Math.hypot(shown[0]!.x-actor.x,shown[0]!.z-actor.z));}
 assert(shown[1]!.x>x+20,'unblocked peer rejoins healthy traffic');assert(shown[0]!.x>x+20,'blocked stale join advances to a newer accepted trace');assert.equal(buffer.historyIncomplete,false);assert.equal(buffer.recoveringIds.length,0);assert(minActor>=.66-1e-7);
});

test('a stationary resident at the legal actor clearance cannot veto newer recovery joins',()=>{
 const poses=accepted(),z=TOWN_CENTER.z+10,x=TOWN_CENTER.x-12;poses[0]={...poses[0]!,x:x-1,z,motionPath:undefined};poses[1]={...poses[1]!,x:x+.72,z,motionPath:undefined};const actor={id:'explorer',x,z,feetY:6},buffer=new TownLifeRenderBuffer(),plan=startingTown(73129);buffer.accept(crowd(poses),poses,0,true);let shown=buffer.sample(0,plan,false,0,[actor]);
 for(let n=1;n<=600;n++){const now=n*.05,time=Math.floor((now+1e-8)*2)/2;if(n%10===0&&time>=1){const next=copyTownLifePoses(poses),end=x-.72-.3*(time-1),start=time===1?x:x-.72-.3*(time-1.5);next[0]={...next[0]!,x:end,motionPath:[{x:start,z,t:0},{x:end,z,t:.5}]};next[1]={...next[1]!,motionPath:[{x:x+.72,z,t:0},{x:x+.72,z,t:.5}]};buffer.accept(crowd(next),next,time);}shown=buffer.sample(now,plan,false,.05,[actor]);}
 assert.equal(buffer.historyIncomplete,false);assert.equal(buffer.recoveringIds.length,0);assert(shown[0]!.x<x-7);assert(Math.abs(shown[1]!.x-x-.72)<1e-6);
});

for(const online of [false,true])test(`real navigation snapshots replay exact accepted roots at solo authority boundaries ${online?'with shared packets':'locally'}`,()=>{
 let life=createTownLifeOpening(73129),input=townLifePoses(life)!,authority=0;const view=createTownView(73129),states=new Map([[0,life]]);let previous:ReturnType<typeof view.matrixEvidence>=[],maxStep=0;
 try{for(let n=0;n<=300;n++){if(n)life=advanceTownLife(life,.05);const time=townLifeClock(life);states.set(life.tick,life);if(!online||n%5===0){input=townLifePoses(life)!;authority=time;view.acceptLife(authority,input);}view.update(authority,TOWN_CENTER,()=>true,true,undefined,!n,n?.05:0,[],online,input);const matrices=view.matrixEvidence();assert.equal(matrices.length,100);
   for(const m of matrices){const p=view.poses[m.index]!;assert(Math.hypot(m.x-p.x,m.z-p.z)<.00003);if(n){const last=previous[m.index]!;maxStep=Math.max(maxStep,Math.hypot(m.x-last.x,m.z-last.z));assert(townPathClear(view.population.plan,last,m));}}
   if(n>=10&&n%10===0){const expected=states.get(life.tick-1)!;for(const p of matrices){const r=expected.residents[p.index]!;assert(Math.hypot(p.x-r.x,p.z-r.z)<.00003,'rendered roots equal the prior accepted endpoint, without contact reprojection');}}
   assert.equal(view.stats.lifeRecoveringIds.length,0);previous=matrices;
  }assert(maxStep<.2);assert.equal(view.stats.lifeHistoryIncomplete,false);
 }finally{view.dispose();}
});

for(const fixture of ['150','175'])test(`retained crowded save ${fixture} adopts navigation without moving old displayed bodies discontinuously`,()=>{
 let life=JSON.parse(readFileSync(new URL(`./fixtures/town-motion-v11/${fixture}.json`,import.meta.url),'utf8'));const bytes=JSON.stringify(life),view=createTownView(73129);let previous:{x:number;z:number}[]=[];let maxStep=0;
 try{view.update(townLifeClock(life),TOWN_CENTER,()=>true,true,undefined,true,0,[],false,townLifePoses(life));previous=view.poses.map(p=>({...p}));assert.equal(JSON.stringify(life),bytes);for(let i=0;i<100;i++){assert.equal(view.poses[i]!.x,life.residents[i].x);assert.equal(view.poses[i]!.z,life.residents[i].z);assert.equal(view.poses[i]!.authoritativeMotion,1);assert.equal(view.poses[i]!.contactResolved,false);}
  for(let frame=0;frame<900;frame++){life=advanceTownLife(life,1/60);view.acceptLife(townLifeClock(life),townLifePoses(life));view.update(townLifeClock(life),TOWN_CENTER,()=>true,true,undefined,false,1/60,[],false,townLifePoses(life));for(let i=0;i<100;i++){const p=view.poses[i]!,old=previous[i]!;maxStep=Math.max(maxStep,Math.hypot(p.x-old.x,p.z-old.z));assert(townPathClear(view.population.plan,old,p));}assert.equal(view.stats.lifeRecoveringIds.length,0,'legacy adoption is ordinary exact-source playback');previous=view.poses.map(p=>({...p}));}
  assert(maxStep<=.05+1e-6,`migration/recovery must stay below3m/s: ${maxStep}`);
 }finally{view.dispose();}
});

test('bounded replay cannot cross a healthy endpoint into a later missing trajectory in one sample',()=>{
 const input=(time:number)=>{const p=accepted(),x=TOWN_CENTER.x-20+time*1.8,z=TOWN_CENTER.z+10;p[0]={...p[0]!,x,z,moving:true,speed:1.8,distance:time*1.8,activity:'walking to work',motionPath:[{x:x-.9,z,t:0},{x,z,t:.5}]};return p;};
 const buffer=new TownLifeRenderBuffer(),plan=startingTown(73129),zero=input(0);buffer.accept(crowd(zero),zero,0,true);buffer.sample(0,plan,false,0);const half=input(.5);buffer.accept(crowd(half),half,.5);let prior=buffer.sample(.99,plan,false,.5)[0]!;const later=input(2.5);buffer.accept(crowd(later),later,2.5);
 for(let step=0;step<30;step++){const next=buffer.sample(3+step*.05,plan,false,.05)[0]!;assert(Math.hypot(next.x-prior.x,next.z-prior.z)<=.150001,'missing history must never teleport to its future trail start');assert(townPathClear(plan,prior,next));prior=next;}
 assert(buffer.recoverySeconds>0);
});
