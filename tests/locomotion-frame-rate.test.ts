import {test} from 'node:test';import assert from 'node:assert/strict';
import {idleAnimation,stepAnimation,stepGroundSupport,GAIT_TRAVEL_SPEED_LIMIT,type AnimationState} from '../src/locomotion.ts';

/** Straight grounded travel along +Z, sampled at a fixed presentation frame rate. */
function run(speed:number,fps:number,seconds:number){
 const dt=1/fps;let a:AnimationState={...idleAnimation(),speed},z=0,carried=0;
 for(let i=0;i<Math.round(seconds*fps);i++){
  const previous=a;z+=speed*dt;
  let next=stepAnimation(a,0,speed,true,false,false,dt,speed*dt);
  next=stepGroundSupport(previous,next,{x:0,y:0,z},'none',dt);
  // A limb that leaves a plant keeps its release offset only when the prior support was carried over.
  for(const k of ['leftFoot','rightFoot'] as const)if(previous.support?.[k].planted&&next.support&&!next.support[k].planted&&next.support[k].release)carried++;
  a=next;
 }
 return {phase:a.phase,travel:a.travel,carried};
}
const cyclic=(a:number,b:number)=>Math.min(Math.abs(a-b),1-Math.abs(a-b));

test('sprint gait phase is the same at 10, 12, 20, 60 and 144 Hz presentation frames',()=>{
 for(const speed of [8,12.8]){
  const reference=run(speed,60,2);
  for(const fps of [10,12,20,144]){
   const r=run(speed,fps,2);
   assert.ok(Math.abs(r.travel-reference.travel)<1e-9);
   assert.ok(cyclic(r.phase,reference.phase)<1e-6,`speed ${speed} at ${fps} Hz: phase ${r.phase} vs ${reference.phase}`);
  }
 }
 assert.ok(12.8*.1<=GAIT_TRAVEL_SPEED_LIMIT*.1);
});

test('a slow sprint frame keeps prior ground support instead of treating ordinary travel as a teleport',()=>{
 assert.ok(run(8,10,2).carried>0);
 // A genuine jump in position still resets support at any frame rate.
 let a:AnimationState={...idleAnimation(),speed:3};
 for(let i=0;i<30;i++){const p=a;a=stepGroundSupport(p,stepAnimation(a,0,3,true,false,false,1/60,.05),{x:0,y:0,z:i*.05},'none',1/60);}
 const p=a,teleported=stepGroundSupport(p,stepAnimation(a,0,3,true,false,false,.1,0),{x:0,y:0,z:30*.05+3},'none',.1);
 for(const k of ['leftFoot','rightFoot'] as const)assert.equal(teleported.support![k].release,null);
});

test('one non-finite velocity sample cannot poison later animation frames',()=>{
 let a=stepAnimation(idleAnimation(),Number.NaN,Number.POSITIVE_INFINITY,true,false,false,1/60,.01);
 assert.ok([a.speed,a.phase,a.heading,a.lean,a.brake].every(Number.isFinite));
 for(let i=0;i<10;i++)a=stepAnimation(a,0,3,true,false,false,1/60,.05);
 assert.ok([a.speed,a.phase,a.heading,a.lean,a.turn,a.brake].every(Number.isFinite));
 assert.ok(a.speed>0);
});
