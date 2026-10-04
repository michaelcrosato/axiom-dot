import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {idleAnimation,stepAnimation} from '../src/locomotion.ts';
import {MANTLE_PHASES, MANTLE_TICKS} from '../src/ledge-mantle.ts';
import {validPlayerContact, type PlayerContact, type Vec3} from '../src/player-contact.ts';

type Obstacle = {x:number;y:number;z:number;hx:number;hy:number;hz:number};
type Snapshot = {
 type:'snapshot';epoch:number;step:number;x:number;y:number;z:number;feetY:number;
 vx:number;vy:number;vz:number;grounded:boolean;crouched:boolean;stance:number;contact:PlayerContact;
};
const RADIUS=.32, STAND_HALF=.75, LOW_HALF=.2;
const ledge:Obstacle={x:1.5,y:1.2,z:0,hx:.8,hy:1.2,hz:2};
const floor:Obstacle={x:0,y:-.2,z:0,hx:48,hy:.2,hz:48};
const close=(actual:number,expected:number,tolerance=.00002,message='')=>assert.ok(Math.abs(actual-expected)<=tolerance,`${message}: ${actual} versus ${expected}`);
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

/** Exercise the shipped worker, including its real Rapier collider and input edge handling. */
async function physics(t:TestContext,config:Record<string,unknown>={}){
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);parentPort.on('message',m=>self.onmessage({data:m}));import(${JSON.stringify(new URL('../src/physics.worker.ts',import.meta.url).href)}).then(()=>parentPort.postMessage({type:'boot'}));`,{eval:true,execArgv:['--experimental-strip-types']});
 t.after(()=>worker.terminate());
 const messages:any[]=[],snapshots:Snapshot[]=[];
 let error:Error|undefined,epoch=0,requestId=0,latest:Snapshot;
 worker.on('error',e=>{error=e;});
 worker.on('message',m=>{messages.push(m);if(m.type==='error')error=new Error(m.message);if(m.type==='snapshot'){latest=m;snapshots.push(m);}});
 const take=async(type:string)=>{
  const deadline=Date.now()+5000;
  for(;;){if(error)throw error;const index=messages.findIndex(m=>m.type===type);if(index>=0)return messages.splice(index,1)[0];assert.ok(Date.now()<deadline,`Waiting for ${type}`);await new Promise(resolve=>setTimeout(resolve,2));}
 };
 const send=(message:Record<string,unknown>)=>worker.postMessage({epoch,...message});
 const tick=async(ticks=1)=>{
  const start=snapshots.length;
  for(let remaining=ticks;remaining>0;remaining-=120){send({type:'step',ticks:Math.min(120,remaining),requestId:++requestId});await take('stepped');}
  return snapshots.slice(start);
 };
 const input=(values:Record<string,unknown>={})=>send({type:'input',x:0,z:0,...values});
 await take('boot');
 send({type:'init',x:0,z:0,obstacles:[],manual:true,interactionEnabled:true,...config});await take('ready');await tick(3);
 return {send,input,tick,get latest(){return latest!;},async zone(values:Record<string,unknown>={}){epoch++;send({type:'zone',x:0,z:0,obstacles:[],manual:true,interactionEnabled:true,...values});await take('ready');await tick(3);},async cell(type:'cell-load'|'cell-unload',key:string,revision:number,obstacles:Obstacle[]=[]){send({type,key,revision,obstacles});await take('cell-ack');}};
}
type Physics=Awaited<ReturnType<typeof physics>>;
async function hang(p:Physics,direction={x:.7,z:0}){
 p.input({...direction,jump:true,grab:true});await p.tick(30);
 assert.equal(p.latest.contact.mode,'hang','the fixture must acquire a real two-hand hang');
 assert.ok(!p.latest.grounded&&p.latest.contact.leftHand&&p.latest.contact.rightHand);
 p.input({grab:true});await p.tick();
 return structuredClone(p.latest);
}
function climb(p:Physics){p.input({jump:true,grab:true});}

/** Exact capsule/axis-aligned-box distance; no reliance on the worker's own collision claims. */
function assertCapsuleClear(snapshot:Snapshot,obstacles:Obstacle[],label=''){
 const half=snapshot.contact.mantle?.capsuleHalfHeight??(snapshot.y-snapshot.feetY-RADIUS-.02);
 assert.ok(half>=LOW_HALF-.0002&&half<=STAND_HALF+.0002,'snapshot must describe a valid actual collision height');
 for(const obstacle of [floor,...obstacles]){
  const dx=Math.max(0,Math.abs(snapshot.x-obstacle.x)-obstacle.hx);
  const dy=Math.max(0,Math.abs(snapshot.y-obstacle.y)-half-obstacle.hy);
  const dz=Math.max(0,Math.abs(snapshot.z-obstacle.z)-obstacle.hz);
  assert.ok(Math.hypot(dx,dy,dz)>=RADIUS-.0002,`${label}: capsule overlaps obstacle at step ${snapshot.step}, progress ${snapshot.contact.mantle?.progress}, position ${JSON.stringify({x:snapshot.x,y:snapshot.y,z:snapshot.z,half})}`);
 }
}
function assertBodyClear(snapshot:Snapshot,obstacles:Obstacle[]){
 const mantle=snapshot.contact.mantle!;
 for(const [along,radius] of [[.3,.26],[.77,.27],[.99,.34]]){
  const normal=snapshot.contact.normal;
  const center={x:snapshot.x-normal.x*Math.sin(mantle.lean)*along!,y:snapshot.feetY+mantle.hipHeight+Math.cos(mantle.lean)*along!,z:snapshot.z-normal.z*Math.sin(mantle.lean)*along!};
  for(const obstacle of obstacles){
   const d=Math.hypot(Math.max(0,Math.abs(center.x-obstacle.x)-obstacle.hx),Math.max(0,Math.abs(center.y-obstacle.y)-obstacle.hy),Math.max(0,Math.abs(center.z-obstacle.z)-obstacle.hz));
   assert.ok(d>=radius!-.0002,`torso/head overlap at progress ${mantle.progress}`);
  }
 }
}
const compress=<T>(values:T[])=>values.filter((value,index)=>index===0||value!==values[index-1]);

test('worker mantle visits every phase and transfers real support before releasing both hands',async t=>{
 const p=await physics(t,{obstacles:[ledge]});await hang(p);climb(p);
 const motion=await p.tick(MANTLE_TICKS);
 assert.equal(motion.length,MANTLE_TICKS);
 assert.deepEqual(compress(motion.map(s=>s.contact.mantle?.phase)),[...MANTLE_PHASES]);
 for(const [index,s] of motion.entries()){
  assert.equal(s.contact.mode,'climb');assert.ok(validPlayerContact(s.contact));
  const m=s.contact.mantle!;close(m.progress,(index+1)/MANTLE_TICKS);
  assert.equal(s.contact.supported,m.leftKnee!==null||m.leftFootSupport||m.rightFootSupport);
  if(m.leftHandSupport)assert.ok(s.contact.leftHand,'a load-bearing left palm has a world anchor');
  if(m.rightHandSupport)assert.ok(s.contact.rightHand,'a load-bearing right palm has a world anchor');
  if(m.leftKnee)close(m.leftKnee.y,2.505,.00002,'knee belongs to the real ledge top');
  if(m.leftFootSupport)close(m.leftFoot.y,2.49,.00002,'left boot belongs to the real ledge top');
  if(m.rightFootSupport)close(m.rightFoot.y,2.49,.00002,'right boot belongs to the real ledge top');
  if(!s.contact.leftHand&&!s.contact.rightHand)assert.ok(m.rightFootSupport,'hands cannot both release before a boot is supported');
 }
 const firstKnee=motion.findIndex(s=>s.contact.mantle!.leftKnee!==null);
 const firstRightBoot=motion.findIndex(s=>s.contact.mantle!.rightFootSupport);
 const firstLeftBoot=motion.findIndex(s=>s.contact.mantle!.leftFootSupport);
 const leftHandReleased=motion.findIndex(s=>s.contact.leftHand===null),rightHandReleased=motion.findIndex(s=>s.contact.rightHand===null);
 assert.ok(firstKnee>0&&firstKnee<firstRightBoot&&firstRightBoot<firstLeftBoot);
 assert.ok(leftHandReleased<rightHandReleased&&rightHandReleased>firstRightBoot);
 assert.ok(motion.slice(0,-1).every(s=>!s.grounded),'only the completed stand is ordinary grounded locomotion');
 assert.equal(p.latest.grounded,true);close(p.latest.feetY,2.4);close(p.latest.contact.mantle!.capsuleHalfHeight,STAND_HALF);
 p.input();const settled=await p.tick(24);
 assert.ok(settled.every(s=>s.grounded&&!s.contact.mantle));assert.equal(p.latest.contact.mode,'none');
});

test('mantle is a bounded nonballistic root transfer with independently clear body and capsule',async t=>{
 const p=await physics(t,{obstacles:[ledge]});const start=await hang(p);climb(p);
 const motion=await p.tick(MANTLE_TICKS);let previous=start;
 for(const s of motion){
  assertCapsuleClear(s,[ledge]);assertBodyClear(s,[ledge]);
  const verticalSpeed=(s.y-previous.y)*60,horizontalSpeed=Math.hypot(s.x-previous.x,s.z-previous.z)*60;
  assert.ok(Math.abs(verticalSpeed)<2.3,`no ballistic rise, fall or root pop: ${verticalSpeed} m/s`);
  assert.ok(horizontalSpeed<1.1,`bounded forward transfer: ${horizontalSpeed} m/s`);
  assert.equal(s.vy,0,'authored contact motion must not inherit jump velocity');
  close(s.y-s.feetY,1.09,.00001,'capsule compaction never changes the rendered root datum');
  close(s.vx,(s.x-previous.x)*60,.0001,'reported horizontal speed is actual movement');
  if(s.contact.mantle!.progress<=.37)close(s.x,start.x,.00001,'body pulls upward before crossing the lip');
  previous=s;
 }
 assert.ok(motion.some(s=>s.contact.mantle!.capsuleHalfHeight<=.201),'the worker truly compacts the collision shape');
 assert.ok(motion.some(s=>s.contact.mantle!.lean>1.2),'transfer includes an over-the-lip body lean');
 close(p.latest.x-start.x,.825,.0001);close(p.latest.feetY-start.feetY,1.9,.0001);
});

test('pause freezes a compact mantle and its resumed sequence is deterministic',async t=>{
 const p=await physics(t,{obstacles:[ledge]});
 const record=async(paused:boolean)=>{
  await p.zone({obstacles:[ledge]});await hang(p);climb(p);const pauseAt=Math.round(MANTLE_TICKS*.49),first=await p.tick(pauseAt);
  if(paused){
   const before=structuredClone(p.latest);p.input({paused:true,jump:true,grab:true});const frozen=await p.tick(75);
   for(const s of frozen){assert.equal(s.step,before.step);assert.equal(s.x,before.x);assert.equal(s.y,before.y);assert.equal(s.z,before.z);assert.deepEqual(s.contact,before.contact);assertCapsuleClear(s,[ledge]);}
   p.send({type:'contact-grab'});p.input({jump:true,grab:true});
  }
  const rest=await p.tick(MANTLE_TICKS-pauseAt+18);
  return [...first,...rest].map(s=>({...s,epoch:0}));
 };
 const baseline=await record(false),resumed=await record(true);
 assert.equal(resumed.length,baseline.length);
 for(let index=0;index<baseline.length;index++)assert.deepEqual(resumed[index],baseline[index],`pause and ignored menu requests cannot change physical frame ${index}`);
 assert.ok(p.latest.grounded);close(p.latest.feetY,2.4,.001);
});

for(const [phase,progress] of [['brace',.05],['compact pull',.30],['knee',.49],['transfer',.68],['final stand',.94]] as const){
 for(const action of ['release','crouch'] as const){
  test(`${action} during ${phase} keeps the actual body continuous and collision safe`,async t=>{
   const p=await physics(t,{obstacles:[ledge]});await hang(p);climb(p);await p.tick(Math.round(MANTLE_TICKS*progress));const before=structuredClone(p.latest);
   assert.equal(before.contact.mode,'climb');
   if(action==='release')p.send({type:'contact-release'});
   p.input(action==='crouch'?{crouch:true}:{});
   const stopped=await p.tick(1),after=stopped[0]!;
   assert.ok(distance(before,after)<.065,`cancelling mantle cannot teleport the body: ${distance(before,after)} m`);
   assert.ok(after.y<=before.y+.001,'cancelling cannot invent an upward root boost');
   assert.ok(!['hang','climb'].includes(after.contact.mode));assert.equal(after.contact.mantle,undefined);
   assert.equal(after.contact.leftHand,null);assert.equal(after.contact.rightHand,null);
   assertCapsuleClear(after,[ledge],`${action} first frame`);
   const recovery=await p.tick(90);
   let previous=after;
   for(const s of recovery){assert.ok(!['hang','climb'].includes(s.contact.mode));assertCapsuleClear(s,[ledge],`${action} recovery`);assert.ok(s.y-previous.y<.06,'recovery must stand gradually rather than pop upwards');previous=s;}
   assert.ok(p.latest.grounded,'released mantle eventually resolves onto real support');
  });
 }
}

test('removing the supporting cell during transfer releases safely rather than finishing on air',async t=>{
 const p=await physics(t);await p.cell('cell-load','ledge',1,[ledge]);await p.tick(2);await hang(p);climb(p);await p.tick(Math.round(MANTLE_TICKS*.67));
 const before=structuredClone(p.latest);assert.equal(before.contact.mantle?.phase,'transfer');
 await p.cell('cell-unload','ledge',2);const frames=await p.tick(120);
 assert.ok(distance(before,frames[0]!)<.065,'support removal cannot teleport the body');
 for(const s of frames){assert.ok(!['hang','climb'].includes(s.contact.mode));assertCapsuleClear(s,[]);}
 assert.ok(frames.some(s=>s.vy<0),'removed support causes gravity to resume');assert.ok(p.latest.grounded);close(p.latest.feetY,0,.001);
});

test('a roof streamed in during the compact transfer blocks growth and cannot be tunneled through',async t=>{
 const p=await physics(t,{obstacles:[ledge]});await hang(p);climb(p);await p.tick(Math.round(MANTLE_TICKS*.68));
 const roof:Obstacle={x:1.5,y:4.16,z:0,hx:2,hy:.1,hz:3};
 assertCapsuleClear(p.latest,[ledge,roof],'new roof starts clear');
 await p.cell('cell-load','roof',1,[roof]);const frames=await p.tick(120);
 for(const s of frames)assertCapsuleClear(s,[ledge,roof],'late roof');
 assert.ok(frames.some(s=>s.contact.mode!=='climb'),'the now-impossible full-height finish must be cancelled');
 assert.ok(frames.every(s=>s.contact.mantle?.progress!==1),'cannot report a completed upright landing under a low roof');
 assert.ok(p.latest.y+LOW_HALF+RADIUS<roof.y-roof.hy+.001,'body remains below the roof');
});

test('axis-rotated approaches and reachable ledge heights preserve the mantle safety contract',async t=>{
 const p=await physics(t);
 for(const [axis,sign,height] of [['x',1,2.15],['x',-1,2.4],['z',1,2.65],['z',-1,2.8]] as const){
  const obstacle:Obstacle=axis==='x'?{...ledge,x:sign*1.5,y:height/2,hy:height/2}:{...ledge,x:0,z:sign*1.5,hx:2,hz:.8,y:height/2,hy:height/2};
  await p.zone({obstacles:[obstacle]});await hang(p,{x:axis==='x'?sign*.7:0,z:axis==='z'?sign*.7:0});climb(p);
  const frames=await p.tick(MANTLE_TICKS);
  assert.deepEqual(compress(frames.map(s=>s.contact.mantle?.phase)),[...MANTLE_PHASES]);
  for(const s of frames){assertCapsuleClear(s,[obstacle]);assertBodyClear(s,[obstacle]);assert.ok(validPlayerContact(s.contact));}
  assert.ok(p.latest.grounded);close(p.latest.feetY,height,.0001);close(p.latest[axis],sign*1.15,.0001);
 }
});

test('default-off and online worlds retain ordinary jumps without explicit mantle traversal',async t=>{
 const p=await physics(t,{interactionEnabled:undefined,obstacles:[ledge]});
 for(const config of [{interactionEnabled:undefined},{interactionEnabled:false},{interactionEnabled:true,online:true}]){
  await p.zone({...config,obstacles:[ledge]});p.send({type:'contact-grab'});p.input({x:.7,jump:true,grab:true});
  const flight=await p.tick(100);
  assert.ok(flight.some(s=>s.vy>4),'ordinary jumping remains available');
  for(const s of flight){assert.ok(!['hang','climb'].includes(s.contact.mode));assert.equal(s.contact.mantle,undefined);assertCapsuleClear(s,[ledge]);}
  assert.ok(p.latest.grounded);close(p.latest.feetY,0,.001);
 }
});


test('a lip that fits the original catch cannot claim wider later palm supports outside its edges',async t=>{
 const p=await physics(t,{obstacles:[{...ledge,hz:.25}]});p.input({x:.7,jump:true,grab:true});const frames=await p.tick(90);
 assert.ok(frames.every(s=>s.contact.mode!=='hang'&&s.contact.mode!=='climb'),'preflight checks the actual widened palms, not just the original catch probes');
});


for(const fraction of [.30,.50,.68,.94])test(`cancel at ${fraction} fully recovers to standing with matching intermediate visual stance`,async t=>{
 const p=await physics(t,{obstacles:[ledge]});await hang(p);climb(p);await p.tick(Math.round(MANTLE_TICKS*fraction));p.input({crouch:true});await p.tick();p.input();const recovery=await p.tick(240);
 const middle=recovery.filter(s=>s.stance>0&&s.stance<1);assert.ok(middle.length>5,'recovery uses a continuous physical height');
 for(const s of middle){const animation=stepAnimation(idleAnimation(),s.vx,s.vz,s.grounded,s.crouched,false,1/60,0,s.stance,s.vy,0);close(animation.crouch,s.stance,.000001,'the rendered crouch follows real capsule growth');assertCapsuleClear(s,[ledge]);}
 assert.equal(p.latest.grounded,true);assert.equal(p.latest.crouched,false);assert.equal(p.latest.stance,0);
});

test('crouch can be re-pressed halfway through recovery and released again',async t=>{
 const p=await physics(t,{obstacles:[ledge]});await hang(p);climb(p);await p.tick(Math.round(MANTLE_TICKS*.94));p.input({crouch:true});await p.tick();p.input();
 for(let i=0;i<120&&!(p.latest.stance<.75&&p.latest.stance>.25);i++)await p.tick();assert.ok(p.latest.stance<.75&&p.latest.stance>.25);
 p.input({crouch:true});const lower=await p.tick(30);assert.ok(lower.every(s=>s.crouched));assert.equal(p.latest.stance,1);close(p.latest.y-p.latest.feetY-RADIUS-.02,LOW_HALF);assertCapsuleClear(p.latest,[ledge]);
 p.input();await p.tick(60);assert.equal(p.latest.crouched,false);assert.equal(p.latest.stance,0);assertCapsuleClear(p.latest,[ledge]);
});
