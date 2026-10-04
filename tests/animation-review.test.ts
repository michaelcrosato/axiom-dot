import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {registerHooks} from 'node:module';
import {readFile} from 'node:fs/promises';
import {ANIMATION_CLIPS,ANIMATION_MAX_TICKS,animationClip,animationReviewFrames,animationSampleTicks,advanceAnimationPlayback,createAnimationReviewRunner,type ReviewWorker,type AnimationReviewRun} from '../src/animation-review.ts';
import {validPlayerContact} from '../src/player-contact.ts';

/** Actual production worker + Rapier WASM, with its actual manual-step protocol. */
function realWorkerFactory(counters={created:0,active:0,peak:0,terminated:0}){
 return ()=>{
  counters.created++;counters.active++;counters.peak=Math.max(counters.peak,counters.active);
  const native=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);let ready=false,queue=[];parentPort.on('message',m=>ready?self.onmessage({data:m}):queue.push(m));import(${JSON.stringify(new URL('../src/physics.worker.ts',import.meta.url).href)}).then(()=>{ready=true;for(const m of queue)self.onmessage({data:m});queue=[];});`,{eval:true,execArgv:['--experimental-strip-types']});
  let terminated=false;const worker:ReviewWorker={onmessage:null,onerror:null,postMessage(m){native.postMessage(m);},terminate(){assert.equal(terminated,false,'a worker is terminated exactly once');terminated=true;counters.active--;counters.terminated++;void native.terminate();}};
  native.on('message',data=>worker.onmessage?.({data}));native.on('error',error=>worker.onerror?.({message:error.message}));return worker;
 };
}
const runs=new Map<string,AnimationReviewRun>();

test('all clips are bounded input fixtures; sample ticks are unique, exact and include endpoints',()=>{
 assert.equal(ANIMATION_CLIPS.length,9);assert.equal(animationClip('missing').id,'run-brake');
 for(const clip of ANIMATION_CLIPS){assert.ok(clip.ticks<=ANIMATION_MAX_TICKS);for(const limit of [1,12,24,36]){const ticks=animationSampleTicks(clip.ticks,limit);assert.equal(ticks.length,limit);assert.equal(new Set(ticks).size,limit);assert.equal(ticks[0],1);if(limit>1)assert.equal(ticks.at(-1),clip.ticks);}for(let t=0;t<clip.ticks;t++)assert.deepEqual(clip.input(t),clip.input(t));}
 assert.throws(()=>animationSampleTicks(361));assert.throws(()=>animationSampleTicks(100,37));assert.throws(()=>animationSampleTicks(0));
});

test('timeline playback remains fixed-tick, reversible, repeatable and pausable at different speeds',()=>{
 let state={tick:1,playing:true,remainder:0};state=advanceAnimationPlayback(state,1/120,1,false,180);assert.equal(state.tick,1);state=advanceAnimationPlayback(state,1/120,1,false,180);assert.equal(state.tick,2);
 assert.deepEqual(advanceAnimationPlayback({tick:35,playing:false,remainder:.3},10,2,true,180),{tick:35,playing:false,remainder:.3});
 assert.equal(advanceAnimationPlayback({tick:1,playing:true,remainder:0},1,2,false,180).tick,121);
 assert.equal(advanceAnimationPlayback({tick:1,playing:true,remainder:0},1,.25,false,180).tick,16);
 assert.deepEqual(advanceAnimationPlayback({tick:180,playing:true,remainder:0},1/60,1,false,180),{tick:180,playing:false,remainder:0});
 assert.deepEqual(advanceAnimationPlayback({tick:180,playing:true,remainder:0},1/60,1,true,180),{tick:1,playing:true,remainder:0});
 assert.equal(advanceAnimationPlayback({tick:1,playing:true,remainder:0},6,1,true,180).tick,1);
});

test('all clips replay identical actual worker/Rapier frames, including run, wall, crate push/pull and ledge top-out',{timeout:30000},async()=>{
 const counters={created:0,active:0,peak:0,terminated:0},runner=createAnimationReviewRunner(realWorkerFactory(counters));
 try{for(const clip of ANIMATION_CLIPS){
  const first=await runner.load(clip),second=await runner.load(clip);runs.set(clip.id,first);
  assert.deepEqual(second.frames,first.frames,clip.id+' replays deterministically');assert.equal(first.frames.length,clip.ticks);assert.equal(first.rapierVersion,'0.20.0');assert.equal(first.stepSeconds,1/60);assert.equal(runner.active,false);
  assert.deepEqual(first.frames,animationReviewFrames(clip,first.frames.map(f=>f.physics)));
  first.frames.forEach((f,i)=>{assert.equal(f.tick,i+1);assert.equal(f.seconds,(i+1)*(1/60));assert.equal(validPlayerContact(f.physics.contact),true);assert.deepEqual(f.input,clip.input(i));assert.ok(Object.values(f.animation).filter(v=>typeof v==='number').every(Number.isFinite));});
  assert.equal(first.frames.at(-1)!.physics.step,clip.ticks);
 }
 const run=runs.get('run-brake')!;assert.ok(run.frames.some(f=>f.physics.vz>5.9));assert.ok(Math.abs(run.frames.at(-1)!.physics.vz)<.001);
 const wall=runs.get('wall-contact')!;assert.ok(wall.frames.some(f=>f.physics.contact.mode==='wall'&&f.physics.contact.strength>0&&Math.abs(f.physics.vx)<.01));assert.ok(wall.frames.some(f=>f.physics.contact.desired.x>f.physics.contact.resolved.x));
 const push=runs.get('push-crate')!;assert.ok(push.frames.some(f=>f.physics.contact.mode==='push'));assert.ok(push.frames[110]!.physics.movable[0]!.x>2);assert.equal(push.frames.at(-1)!.physics.contact.mode,'none');
 const pull=runs.get('pull-crate')!;assert.ok(pull.frames.some(f=>f.physics.contact.mode==='pull'));assert.ok(pull.frames[110]!.physics.movable[0]!.x<pull.frames[60]!.physics.movable[0]!.x);assert.equal(pull.frames.at(-1)!.physics.contact.mode,'none');
 const ledge=runs.get('ledge-climb')!;assert.ok(ledge.frames.some(f=>f.physics.contact.mode==='hang'));assert.ok(ledge.frames.some(f=>f.physics.contact.mode==='climb'));assert.ok(ledge.frames.at(-1)!.physics.grounded);assert.ok(Math.abs(ledge.frames.at(-1)!.physics.feetY-2.4)<.01);
 assert.equal(counters.peak,1);assert.equal(counters.active,0);assert.equal(counters.created,ANIMATION_CLIPS.length*2);assert.equal(counters.terminated,ANIMATION_CLIPS.length*2);
 }finally{runner.dispose();}
});

test('superseded loads cancel their own worker and cannot race, append snapshots or terminate the new worker',{timeout:10000},async()=>{
 const counters={created:0,active:0,peak:0,terminated:0},runner=createAnimationReviewRunner(realWorkerFactory(counters));
 const first=runner.load(ANIMATION_CLIPS[0]!).then(()=>null,error=>error),second=runner.load(ANIMATION_CLIPS[1]!);
 assert.match(String(await first),/cancelled/);assert.equal((await second).clip,'wall-contact');assert.equal(counters.peak,1);assert.equal(counters.active,0);assert.equal(counters.created,counters.terminated);runner.dispose();await assert.rejects(runner.load(ANIMATION_CLIPS[0]!),/disposed/);
});

test('worker numeric traces drive production joints identically under arbitrary scrub order without any renderer',{timeout:10000},async()=>{
 const hooks=registerHooks({resolve(specifier,context,next){if(specifier.endsWith('.css'))return {url:'data:text/javascript,export default null',shortCircuit:true};if(specifier.startsWith('.')&&context.parentURL?.includes('/src/')&&!/\.[a-z]+$/i.test(specifier))return next(specifier+'.ts',context);return next(specifier,context);}});
 const {createAnimationReviewModel}=await import('../src/visual-review.ts');hooks.deregister();
 const runner=createAnimationReviewRunner(realWorkerFactory()),model=createAnimationReviewModel();
 try{for(const clip of ANIMATION_CLIPS){const run=runs.get(clip.id)??await runner.load(clip);model.configure(run);const samples=animationSampleTicks(run.frames.length,24),seen=new Map();for(const tick of [...samples,...samples.slice().reverse(),...samples]){const frame=run.frames[tick-1]!;model.update(frame);const evidence=model.evidence();assert.deepEqual(model.avatar.root.position.toArray(),[frame.physics.x,frame.physics.feetY,frame.physics.z]);assert.equal(evidence.contact.mode,frame.physics.contact.mode);if(frame.physics.contact.mode!=='none')assert.deepEqual(evidence.contact,frame.physics.contact);assert.ok(Object.keys(evidence.joints).length>=14);for(const joint of Object.values(evidence.joints)){assert.ok([...joint.local.position,...joint.local.quaternion,...joint.world.position,...joint.world.quaternion].every(Number.isFinite));}if(seen.has(tick))assert.deepEqual(evidence,seen.get(tick),'scrub order cannot change real production matrices');else seen.set(tick,evidence);}assert.throws(()=>animationReviewFrames(clip,[run.frames[2]!.physics]),/contiguous/);}}
 finally{runner.dispose();model.dispose();assert.equal(model.root.children.length,0);}
});

test('review preserves all subjects, exact-tick capture and renderer-independent JSON without game boot',async()=>{
 const source=await readFile(new URL('../src/visual-review.ts',import.meta.url),'utf8');for(const subject of ['humanoid','quadruped','cave','ecology','guard','animation'])assert.ok(source.includes(`value="${subject}"`));
 for(const control of ['animation-tick','animation-prev','animation-next','animation-play','animation-reset','animation-speed','animation-repeat','animation-png','animation-json','animation-count'])assert.ok(source.includes(`id="${control}"`));
 assert.match(source,/new Worker\(new URL\('\.\/physics\.worker\.ts'/);assert.match(source,/animationSampleTicks\(run.frames.length/);assert.match(source,/rendered:rendered!==null/);assert.match(source,/animationRunner.dispose\(\)/);assert.match(source,/initialQuery.get\('clip'\)/);
 assert.doesNotMatch(source,/import[^\n]*from ['"]\.\/main/);assert.doesNotMatch(source,/createGame|loadCampaign/);
});
