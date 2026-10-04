import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import * as THREE from 'three/webgpu';
import {validPlayerContact} from '../src/player-contact.ts';
import {createAvatar} from '../src/avatar.ts';
import {createAnimationReviewRunner,animationClip,type ReviewWorker} from '../src/animation-review.ts';
const runner=createAnimationReviewRunner(()=>{
 const native=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);let ready=false,q=[];parentPort.on('message',m=>ready?self.onmessage({data:m}):q.push(m));import(${JSON.stringify(new URL('../src/physics.worker.ts',import.meta.url).href)}).then(()=>{ready=true;for(const m of q)self.onmessage({data:m});});`,{eval:true,execArgv:['--experimental-strip-types']});
 const bridge:ReviewWorker={onmessage:null,onerror:null,postMessage:m=>native.postMessage(m),terminate(){void native.terminate();}};native.on('message',data=>bridge.onmessage?.({data}));native.on('error',e=>bridge.onerror?.({message:e.message}));return bridge;
});
const run=await runner.load(animationClip('ledge-climb'));runner.dispose();
const avatar=createAvatar();
const frames=run.frames.map(frame=>{const p=frame.physics;avatar.root.position.set(p.x,p.feetY,p.z);avatar.update(frame.animation,null,0,undefined,p.contact);return {frame,pose:avatar.getPoseEvidence()};});
const mantle=frames.filter(f=>f.frame.physics.contact.mantle);
const distance=(a:number[],b:number[])=>new THREE.Vector3().fromArray(a).distanceTo(new THREE.Vector3().fromArray(b));
const xyz=(p:{x:number;y:number;z:number})=>[p.x,p.y,p.z];
const angle=(a:number[],b:number[])=>new THREE.Quaternion().fromArray(a).angleTo(new THREE.Quaternion().fromArray(b));

test('every loaded palm, knee and boot has exact production-rig contact, never a stretched limb',()=>{
 for(const {frame,pose} of mantle){const c=frame.physics.contact,m=c.mantle!;
  assert.ok(m.leftHandSupport||m.rightHandSupport||m.leftKnee||m.leftFootSupport||m.rightFootSupport,`unsupported tick ${frame.tick}`);
  for(const side of ['left','right'] as const){
   if(c[side==='left'?'leftHand':'rightHand']){assert.ok(pose.anchors[side].error!<.000001);assert.equal(pose.anchors[side].clamped,false);}
   assert.ok(distance(pose.joints[side+'Ankle']!.world.position,xyz(m[side==='left'?'leftFoot':'rightFoot']))<.000001,`unreachable ${side} foot at ${frame.tick}`);
   for(const [start,end,length] of [['Shoulder','Elbow',.35],['Elbow','Hand',.33],['Hip','Knee',.45],['Knee','Ankle',.45]] as const)assert.ok(Math.abs(distance(pose.joints[side+start]!.world.position,pose.joints[side+end]!.world.position)-length)<1e-7);
  }
  if(m.leftKnee)assert.ok(distance(pose.joints.leftKnee!.world.position,xyz(m.leftKnee))<.000002,`loaded knee slides at tick ${frame.tick}`);
 }
});

test('supports stay still until unloaded, with a real knee-to-boot weight transfer',()=>{
 for(let i=1;i<mantle.length;i++){
  const a=mantle[i-1]!,b=mantle[i]!,ac=a.frame.physics.contact,bc=b.frame.physics.contact,am=ac.mantle!,bm=bc.mantle!;
  for(const side of ['left','right'] as const){const support=side==='left'?'leftHandSupport':'rightHandSupport',anchor=side==='left'?'leftHand':'rightHand';if(am[support]&&bm[support])assert.deepEqual(bc[anchor],ac[anchor]);const footSupport=side==='left'?'leftFootSupport':'rightFootSupport',foot=side==='left'?'leftFoot':'rightFoot';if(am[footSupport]&&bm[footSupport])assert.deepEqual(bm[foot],am[foot]);}
  if(am.leftKnee&&bm.leftKnee)assert.deepEqual(am.leftKnee,bm.leftKnee);
 }
 const loadedKnee=mantle.filter(f=>f.frame.physics.contact.mantle!.leftKnee);assert.ok(loadedKnee.length>30);
 const first=loadedKnee[0]!,last=loadedKnee.at(-1)!;
 assert.ok(last.pose.joints.hips!.world.position[0]!-first.pose.joints.hips!.world.position[0]!>.19,'pelvis moves over the stationary knee');
 assert.ok(mantle.some(f=>f.pose.joints.leftShoulder!.world.position[0]!>.7&&f.frame.physics.x<.7&&f.frame.physics.feetY<2.4),'chest comes over the edge before standing root transfer');
});

test('real 60 Hz transition has no elbow/knee flip and meets the ordinary idle at completion',()=>{
 for(let i=1;i<mantle.length;i++){
  const a=mantle[i-1]!,b=mantle[i]!;
  for(const name of ['leftShoulder','rightShoulder','leftElbow','rightElbow','leftHip','rightHip','leftKnee','rightKnee'])assert.ok(angle(a.pose.joints[name]!.local.quaternion,b.pose.joints[name]!.local.quaternion)<.25,`${name} flips at tick ${b.frame.tick}`);
  for(const name of ['leftElbow','rightElbow'])assert.ok(distance(a.pose.joints[name]!.world.position,b.pose.joints[name]!.world.position)<.045,`${name} jumps at tick ${b.frame.tick}`);
 }
 const first=mantle[0]!,before=frames[first.frame.tick-2]!,last=mantle.at(-1)!,after=frames[last.frame.tick]!;
 assert.equal(before.frame.physics.contact.mode,'hang');assert.equal(after.frame.physics.contact.mode,'none');
 for(const name of Object.keys(first.pose.joints))assert.ok(distance(first.pose.joints[name]!.world.position,before.pose.joints[name]!.world.position)<.025,`hang→brace pops ${name}`);
 for(const name of Object.keys(last.pose.joints))assert.ok(distance(last.pose.joints[name]!.world.position,after.pose.joints[name]!.world.position)<.008,`stand→idle pops ${name}`);
});


test('malformed mantle evidence cannot pass the snapshot boundary',()=>{
 const valid=structuredClone(mantle[20]!.frame.physics.contact);assert.equal(validPlayerContact(valid),true);
 for(const patch of [{hipHeight:NaN},{hipHeight:4},{lean:NaN},{leftRelease:-1},{rightRelease:2},{progress:Infinity}])assert.equal(validPlayerContact({...valid,mantle:{...valid.mantle!,...patch}}),false);
 assert.equal(validPlayerContact({...valid,point:null}),false);
});
