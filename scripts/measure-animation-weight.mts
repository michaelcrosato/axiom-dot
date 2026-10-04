import * as THREE from 'three/webgpu';
import {Worker} from 'node:worker_threads';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {createAnimationReviewRunner,ANIMATION_CLIPS,type ReviewWorker} from '../src/animation-review.ts';
import {createAvatar} from '../src/avatar.ts';

const runner=createAnimationReviewRunner(()=>{
 const native=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);let ready=false,q=[];parentPort.on('message',m=>ready?self.onmessage({data:m}):q.push(m));import(${JSON.stringify(new URL('../src/physics.worker.ts',import.meta.url).href)}).then(()=>{ready=true;for(const m of q)self.onmessage({data:m});});`,{eval:true,execArgv:['--experimental-strip-types']});
 const worker:ReviewWorker={onmessage:null,onerror:null,postMessage:m=>native.postMessage(m),terminate(){void native.terminate();}};
 native.on('message',data=>worker.onmessage?.({data}));native.on('error',e=>worker.onerror?.({message:e.message}));return worker;
});
const summaries:any[]=[],traces:any[]=[],issues:any[]=[];
for(const clip of ANIMATION_CLIPS){
 const run=await runner.load(clip),avatar=createAvatar();
 let previous:ReturnType<typeof avatar.getPoseEvidence>|null=null,plants=0,maxPlantDrift=0,maxSupportError=0,maxHandError=0,maxSwingStep=0,maxFlightBrake=0,minRelativeFloor=Infinity,maxRelativeTop=-Infinity;
 for(const frame of run.frames){
  const p=frame.physics;avatar.root.position.set(p.x,p.feetY,p.z);avatar.update(frame.animation,null,0,undefined,p.contact);const evidence=avatar.getPoseEvidence();
  minRelativeFloor=Math.min(minRelativeFloor,evidence.bounds.min[1]!-p.feetY);maxRelativeTop=Math.max(maxRelativeTop,evidence.bounds.max[1]!-p.feetY);if(frame.animation.airborne)maxFlightBrake=Math.max(maxFlightBrake,frame.animation.brake);
  const floor=p.contact.mantle?0:p.feetY;
  if(evidence.bounds.min[1]!<floor-.002)issues.push({clip:clip.id,tick:frame.tick,type:'mesh-floor',minimum:evidence.bounds.min[1],floor});
  if(evidence.bounds.max[1]!>p.feetY+(p.stance===1?1.06:2.16))issues.push({clip:clip.id,tick:frame.tick,type:'mesh-clearance',maximum:evidence.bounds.max[1]});
  for(const side of ['left','right'])for(const [start,end,length] of [['Hip','Knee',.45],['Knee','Ankle',.45],['Shoulder','Elbow',.35],['Elbow','Hand',.33]] as const){
   const actual=new THREE.Vector3().fromArray(evidence.joints[side+start]!.world.position).distanceTo(new THREE.Vector3().fromArray(evidence.joints[side+end]!.world.position));
   if(Math.abs(actual-length)>1e-7)issues.push({clip:clip.id,tick:frame.tick,type:'bone-length',side,start,end,actual,length});
  }
  for(const [name,joint] of [['leftFoot','leftAnkle'],['rightFoot','rightAnkle'],['leftHand','leftHand'],['rightHand','rightHand']] as const){
   const support=evidence.groundSupport?.[name],old=previous?.groundSupport?.[name];if(!support)continue;
   const actual=new THREE.Vector3().fromArray(evidence.joints[joint]!.world.position),target=avatar.root.localToWorld(new THREE.Vector3(support.target.x,support.target.y,support.target.z));
   const error=actual.distanceTo(target);maxSupportError=Math.max(maxSupportError,error);
   if(error>.002)issues.push({clip:clip.id,tick:frame.tick,limb:name,type:'support-target-error',error});
   if(support.planted&&old?.planted&&support.anchor&&old.anchor&&Math.hypot(support.anchor.x-old.anchor.x,support.anchor.y-old.anchor.y,support.anchor.z-old.anchor.z)<1e-8){
    const drift=actual.distanceTo(new THREE.Vector3().fromArray(previous!.joints[joint]!.world.position));plants++;maxPlantDrift=Math.max(maxPlantDrift,drift);if(drift>.002)issues.push({clip:clip.id,tick:frame.tick,limb:name,type:'plant-drift',drift});
   }else if(previous)maxSwingStep=Math.max(maxSwingStep,actual.distanceTo(new THREE.Vector3().fromArray(previous.joints[joint]!.world.position)));
  }
  for(const hand of Object.values(evidence.anchors))if(hand.target&&p.contact.mode!=='wall')maxHandError=Math.max(maxHandError,hand.error??0);
  if(process.argv.includes('--trace'))traces.push({clip:clip.id,...frame,rig:evidence});previous=evidence;
 }
 summaries.push({clip:clip.id,frames:run.frames.length,retainedPlantSamples:plants,maxPlantDrift,maxSupportTargetError:maxSupportError,maxContactHandError:maxHandError,maxNonPlantFrameDisplacement:maxSwingStep,maxFlightBrake,minRelativeFloor,maxRelativeTop});
}
runner.dispose();
let sourceRevision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();if(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim())sourceRevision+='-working';
const report={sourceRevision,source:'Actual 60 Hz production physics.worker + Rapier + animationReviewFrames + createAvatar transforms',rendered:false,visualReview:'not-reviewed',scope:['Numeric support, joint and motion evidence only','Mantle preserves its dedicated contact solver and root datum','No browser retry, screenshot, live-network or device-performance certification'],summaries,issues,...(traces.length?{frames:traces}:{})};
const file=process.argv.find(a=>a.endsWith('.json'))??'/tmp/axiom-animation-weight.json';await writeFile(file,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,frames:traces.length,file},null,2));
if(issues.length)process.exitCode=1;
