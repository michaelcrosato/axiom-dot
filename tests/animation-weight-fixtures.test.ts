import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {
 ANIMATION_CLIPS,ANIMATION_MAX_TICKS,ANIMATION_STEP_SECONDS,animationClip,
 createAnimationReviewRunner,type AnimationClipId,type AnimationReviewRun,type ReviewWorker,
} from '../src/animation-review.ts';

const weightClipIds:readonly AnimationClipId[]=['walk-accelerate-turn-stop','jump-land','crouch-crawl-stand','run-slide-recover'];

/** The production worker owns every root displacement and contact in these tests. */
function realWorker():ReviewWorker{
 const native=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);let ready=false,queue=[];parentPort.on('message',m=>ready?self.onmessage({data:m}):queue.push(m));import(${JSON.stringify(new URL('../src/physics.worker.ts',import.meta.url).href)}).then(()=>{ready=true;for(const m of queue)self.onmessage({data:m});queue=[];});`,{eval:true,execArgv:['--experimental-strip-types']});
 const worker:ReviewWorker={onmessage:null,onerror:null,postMessage(message){native.postMessage(message);},terminate(){void native.terminate();}};
 native.on('message',data=>worker.onmessage?.({data}));native.on('error',error=>worker.onerror?.({message:error.message}));
 return worker;
}

async function replay(id:AnimationClipId):Promise<AnimationReviewRun>{
 const clip=animationClip(id),runner=createAnimationReviewRunner(realWorker);
 try{
  const first=await runner.load(clip),second=await runner.load(clip);
  assert.deepEqual(second.frames,first.frames,`${id} uses repeatable actual worker snapshots`);
  assert.equal(first.fixture.bound,16);assert.equal(first.stepSeconds,ANIMATION_STEP_SECONDS);
  assert.equal(first.rapierVersion,'0.20.0');assert.equal(first.frames.length,clip.ticks);
  assert.equal(first.maximumTicks,clip.ticks);assert.ok(clip.ticks<=ANIMATION_MAX_TICKS);
  assert.deepEqual(first.fixture.obstacles,[]);assert.deepEqual(first.fixture.movable,[]);
  assert.ok(first.scope.some(text=>text.includes('No pixels reviewed')),'physical phase evidence is not visual approval');
  for(const [i,frame] of first.frames.entries()){
   assert.equal(frame.tick,i+1);assert.equal(frame.physics.step,i+1);assert.equal(frame.physics.epoch,0);
   assert.equal(frame.seconds,(i+1)*ANIMATION_STEP_SECONDS);assert.deepEqual(frame.input,clip.input(i));
   assert.ok(Math.abs(frame.physics.x)<15.5&&Math.abs(frame.physics.z)<15.5,'the clip never hits the inspection boundary');
   assert.equal(frame.physics.contact.mode,'none');assert.deepEqual(frame.physics.movable,[]);
   assert.ok([frame.physics.x,frame.physics.feetY,frame.physics.z,frame.physics.vx,frame.physics.vy,frame.physics.vz,frame.physics.stance].every(Number.isFinite));
  }
  const end=first.frames.at(-1)!;
  assert.ok(end.physics.grounded);assert.equal(end.physics.crouched,false);assert.equal(end.physics.sliding,false);
  assert.equal(end.physics.stance,0);assert.ok(Math.hypot(end.physics.vx,end.physics.vz)<.001);
  assert.equal(end.animation.gait,'idle');assert.equal(runner.active,false);
  return first;
 }finally{runner.dispose();}
}

test('weight review adds four input-only clips without replacing the contact fixtures',()=>{
 assert.deepEqual(ANIMATION_CLIPS.slice(0,5).map(clip=>clip.id),['run-brake','wall-contact','push-crate','pull-crate','ledge-climb']);
 assert.deepEqual(ANIMATION_CLIPS.slice(5).map(clip=>clip.id),weightClipIds);
 for(const id of weightClipIds){
  const clip=animationClip(id);assert.equal(clip.id,id);
  assert.deepEqual(Object.keys(clip).sort(),['id','input','label','movable','obstacles','spawn','ticks','watch']);
  assert.ok(clip.watch.length>80,'include an explicit support/weight inspection prompt');
  for(let tick=0;tick<clip.ticks;tick++){
   const input=clip.input(tick);assert.ok(Math.hypot(input.x,input.z)<=1);
   assert.equal(input.grab,false);assert.equal(input.paused,false);assert.deepEqual(input,clip.input(tick));
  }
 }
});

test('actual worker walk clip accelerates, transfers to a quarter-turn and brakes to a supported stop',{timeout:10000},async()=>{
 const {frames}=await replay('walk-accelerate-turn-stop');
 assert.ok(frames.slice(0,30).every(f=>Math.hypot(f.physics.vx,f.physics.vz)<.001));
 const acceleration=frames.slice(30,60).map(f=>Math.hypot(f.physics.vx,f.physics.vz));
 assert.ok(acceleration[0]!<.1&&acceleration.at(-1)!>1.9);
 assert.ok(acceleration.every((speed,i)=>i===0||speed>=acceleration[i-1]!-.001));
 assert.ok(frames.slice(65,115).every(f=>f.animation.gait==='walk'&&f.physics.vz>1.9&&Math.abs(f.physics.vx)<.001));
 assert.ok(frames.slice(120,130).some(f=>f.physics.vx>.1&&f.physics.vz>.1),'the motor resolves a turn rather than teleporting directions');
 assert.ok(frames.slice(145,175).every(f=>f.physics.vx>1.9&&Math.abs(f.physics.vz)<.001));
 assert.ok(Math.abs(frames[175]!.animation.heading-Math.PI/2)<.01);
 assert.ok(frames.slice(180,190).some(f=>f.animation.brake>.1));
 assert.ok(frames.every(f=>f.physics.grounded&&!f.physics.crouched&&!f.physics.sliding));
 assert.ok(frames[179]!.physics.x>frames[119]!.physics.x+1.7);
});

test('actual worker jump clip includes grounded approach, push-off, ascent, descent, touchdown and settling',{timeout:10000},async()=>{
 const {frames}=await replay('jump-land'),air=frames.filter(f=>!f.physics.grounded),landing=frames.find(f=>f.physics.landing>0)!;
 assert.ok(frames.slice(0,60).every(f=>f.physics.grounded));assert.equal(air[0]!.tick,61);
 assert.ok(air.length>30&&air.length<60);assert.ok(air.some(f=>f.physics.vy>3));assert.ok(air.some(f=>f.physics.vy<-3));
 assert.ok(Math.max(...air.map(f=>f.physics.feetY))>.8);
 assert.ok(air.every(f=>f.animation.airborne&&f.physics.contact.mode==='none'));
 assert.ok(air[0]!.animation.takeoff>0);assert.ok(landing&&landing.tick>air.at(-1)!.tick);
 assert.ok(landing.physics.grounded&&landing.physics.landingSpeed>5&&landing.physics.feetY<.01);
 assert.ok(landing.animation.landing>0);assert.ok(frames.slice(landing.tick).every(f=>f.physics.grounded));
 assert.equal(frames.at(-1)!.physics.landing,0);assert.equal(frames.at(-1)!.animation.landing,0);
});

test('actual worker crouch clip lowers, crawls, stops while low and then recovers upright',{timeout:10000},async()=>{
 const {frames}=await replay('crouch-crawl-stand');
 assert.ok(frames.slice(30,40).some(f=>f.physics.stance>0&&f.physics.stance<1));
 assert.ok(frames.slice(45,60).every(f=>f.physics.crouched&&f.physics.stance===1&&Math.abs(f.physics.vz)<.001));
 assert.ok(frames.slice(65,140).every(f=>f.physics.crouched&&f.animation.gait==='crawl'&&f.physics.vz>1));
 assert.ok(frames[144]!.physics.z>frames[59]!.physics.z+1.4);
 assert.ok(frames.slice(150,160).every(f=>f.physics.crouched&&Math.abs(f.physics.vz)<.001));
 assert.ok(frames.slice(160,170).some(f=>f.physics.stance>0&&f.physics.stance<1));
 assert.ok(frames.slice(175).every(f=>!f.physics.crouched&&f.physics.stance===0));
 assert.ok(frames.every(f=>f.physics.grounded&&!f.physics.sliding&&f.physics.feetY<.01));
});

test('actual worker slide clip earns the slide from running momentum and recovers after slowing',{timeout:10000},async()=>{
 const {frames}=await replay('run-slide-recover'),slide=frames.filter(f=>f.physics.sliding);
 assert.ok(frames.slice(40,90).every(f=>f.animation.gait==='run'&&f.physics.vz>5.9));
 assert.equal(slide[0]!.tick,91);assert.ok(slide.length>=30&&slide.length<=60);
 assert.ok(slide[0]!.physics.vz>5.4&&slide.at(-1)!.physics.vz<2);
 assert.ok(slide.every((f,i)=>f.animation.gait==='slide'&&f.input.z===0&&(i===0||f.physics.vz<=slide[i-1]!.physics.vz+.001)));
 assert.ok(slide.at(-1)!.physics.z>slide[0]!.physics.z+1.5);
 assert.ok(slide.some(f=>f.physics.crouched&&f.physics.stance===1));
 assert.ok(frames.slice(135,150).every(f=>!f.physics.sliding&&f.physics.crouched&&Math.abs(f.physics.vz)<.001));
 assert.ok(frames.slice(150,160).some(f=>f.physics.stance>0&&f.physics.stance<1));
 assert.ok(frames.every(f=>f.physics.grounded&&f.physics.feetY<.01));
});
