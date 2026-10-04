import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import * as THREE from 'three/webgpu';
import {createAvatar,interactionPose} from '../src/avatar.ts';
import {idleAnimation} from '../src/locomotion.ts';
import {ANIMATION_CLIPS,createAnimationReviewRunner,type ReviewWorker} from '../src/animation-review.ts';
import {compileEquipment} from '../src/equipment.ts';

const factory=():ReviewWorker=>{
 const native=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);let ready=false,q=[];parentPort.on('message',m=>ready?self.onmessage({data:m}):q.push(m));import(${JSON.stringify(new URL('../src/physics.worker.ts',import.meta.url).href)}).then(()=>{ready=true;for(const m of q)self.onmessage({data:m});});`,{eval:true,execArgv:['--experimental-strip-types']});
 const worker:ReviewWorker={onmessage:null,onerror:null,postMessage:m=>native.postMessage(m),terminate(){void native.terminate();}};
 native.on('message',data=>worker.onmessage?.({data}));native.on('error',e=>worker.onerror?.({message:e.message}));return worker;
};

test('real worker motion retains world supports through the complete production rig and contact overlay',async t=>{
 const runner=createAnimationReviewRunner(factory);t.after(()=>runner.dispose());let measured=0;
 for(const clip of ANIMATION_CLIPS){
  const run=await runner.load(clip);
  for(const equipment of [null,compileEquipment(5)]){
   const avatar=createAvatar();avatar.setEquipment(equipment);let previous:ReturnType<typeof avatar.getPoseEvidence>|null=null;
   for(const frame of run.frames){
    const p=frame.physics;avatar.root.position.set(p.x,p.feetY,p.z);avatar.update(frame.animation,null,0,undefined,p.contact);const e=avatar.getPoseEvidence();
    for(const [key,name] of [['leftFoot','leftAnkle'],['rightFoot','rightAnkle'],['leftHand','leftHand'],['rightHand','rightHand']] as const){
     const support=e.groundSupport?.[key],old=previous?.groundSupport?.[key];if(!support)continue;
     const point=new THREE.Vector3().fromArray(e.joints[name]!.world.position),target=avatar.root.localToWorld(new THREE.Vector3(support.target.x,support.target.y,support.target.z));
     assert.ok(point.distanceTo(target)<.002,`${clip.id} ${frame.tick} ${key} reachable support ${point.distanceTo(target)}`);
     if(support.planted&&old?.planted&&support.anchor&&old.anchor&&Math.hypot(support.anchor.x-old.anchor.x,support.anchor.y-old.anchor.y,support.anchor.z-old.anchor.z)<1e-8){
      measured++;assert.ok(point.distanceTo(new THREE.Vector3().fromArray(previous!.joints[name]!.world.position))<.002,`${clip.id} ${frame.tick} ${key} stance skating`);
     }
    }
    for(const side of ['left','right'])for(const [from,to,length] of [['Hip','Knee',.45],['Knee','Ankle',.45],['Shoulder','Elbow',.35],['Elbow','Hand',.33]] as const){
     const distance=new THREE.Vector3().fromArray(e.joints[side+from]!.world.position).distanceTo(new THREE.Vector3().fromArray(e.joints[side+to]!.world.position));assert.ok(Math.abs(distance-length)<1e-7);
    }
    assert.ok(e.bounds.min[1]!>=(p.contact.mantle?0:p.feetY-.002),`${clip.id} ${frame.tick}: visible ground penetration`);
    assert.ok(e.bounds.max[1]!<=p.feetY+(p.stance===1?1.06:2.16),`${clip.id} ${frame.tick}: physical clearance`);
    previous=e;
   }
  }
 }
 assert.ok(measured>2000,'measure many actual retained support frames, not sparse authored poses');
});

test('work gestures prepare, hold a reachable working beat and recover with zero endpoint offsets',()=>{
 const avatar=createAvatar();avatar.update(idleAnimation(),null,0);const rest=avatar.getPoseEvidence();
 for(const action of ['gather','repair'] as const){
  assert.deepEqual(interactionPose(action,0),{reach:0,anticipation:0,stroke:0});assert.deepEqual(interactionPose(action,1),{reach:0,anticipation:0,stroke:0});
  assert.ok(interactionPose(action,.14).anticipation>.9);assert.equal(interactionPose(action,.5).reach,1);assert.equal(interactionPose(action,.6).reach,1);
  for(let i=0;i<=60;i++){avatar.update(idleAnimation(),action,i/60);const e=avatar.getPoseEvidence();for(const side of ['left','right'])assert.ok(Math.abs(e.joints[side+'Ankle']!.world.position[1]!-.09)<1e-7);assert.ok(e.bounds.min[1]!>=-.002);}
  for(const side of ['left','right'])assert.deepEqual(avatar.getPoseEvidence().joints[side+'Hand'],rest.joints[side+'Hand']);
 }
 assert.notEqual(interactionPose('repair',.46).stroke,interactionPose('gather',.46).stroke);
});

test('oblique actual wall impact has no forced quarter-turn or large shoulder teleport',async t=>{
 const runner=createAnimationReviewRunner(factory);t.after(()=>runner.dispose());
 const run=await runner.load({id:'wall-contact',label:'Oblique contact',watch:'Impact and release',ticks:120,spawn:{x:0,z:0},obstacles:[{x:.7,z:0,hx:.12,hy:2,hz:4}],movable:[],input:tick=>({x:tick<75?.5:0,z:tick<75?.5:0,analog:true,sprint:false,crouch:false,jump:false,paused:false,grab:false})});
 const avatar=createAvatar();let previous:ReturnType<typeof avatar.getPoseEvidence>|null=null,contacts=0;
 for(const frame of run.frames){const p=frame.physics;avatar.root.position.set(p.x,p.feetY,p.z);avatar.update(frame.animation,null,0,undefined,p.contact);const e=avatar.getPoseEvidence();
  if(previous&&p.contact.mode==='wall'){
   contacts++;for(const joint of ['leftShoulder','rightShoulder','leftHand','rightHand'])assert.ok(new THREE.Vector3().fromArray(e.joints[joint]!.world.position).distanceTo(new THREE.Vector3().fromArray(previous.joints[joint]!.world.position))<.25,`oblique ${joint} jumps at ${frame.tick}`);
   const angle=new THREE.Quaternion().fromArray(e.joints.spine!.world.quaternion).angleTo(new THREE.Quaternion().fromArray(previous.joints.spine!.world.quaternion));assert.ok(angle<.5,`oblique torso forced turn at ${frame.tick}`);
  }previous=e;
 }
 assert.ok(contacts>20);
});
