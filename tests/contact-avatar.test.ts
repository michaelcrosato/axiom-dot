import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {createAvatar,rigProfile} from '../src/avatar.ts';
import {idleAnimation,footContact} from '../src/locomotion.ts';
import {compileEquipment} from '../src/equipment.ts';
import {emptyPlayerContact,type PlayerContact} from '../src/player-contact.ts';
import {solveTwoBoneIK} from '../src/contact-animation.ts';

const v=(a:THREE.Vector3)=>({x:a.x,y:a.y,z:a.z});
function contactFor(mode:PlayerContact['mode'],heading=0,root=new THREE.Vector3(0,0,0)):PlayerContact{
 const normal=new THREE.Vector3(-Math.sin(heading),0,-Math.cos(heading)),tangent=new THREE.Vector3(Math.cos(heading),0,-Math.sin(heading));
 const y=mode==='hang'||mode==='climb'?1.9:1.33;
 const point=root.clone().addScaledVector(normal,-.38);point.y+=y;
 const palm=point.clone().addScaledVector(normal,.07);
 return {...emptyPlayerContact(),mode,strength:1,normal:v(normal),point:v(point),leftHand:v(palm.clone().addScaledVector(tangent,-.27)),rightHand:v(palm.clone().addScaledVector(tangent,.27)),targetId:'support',desired:{x:-normal.x*4,z:-normal.z*4},resolved:{x:0,z:0},supported:true};
}
function allFinite(o:THREE.Object3D){o.updateWorldMatrix(true,true);o.traverse(j=>assert.ok(j.matrixWorld.elements.every(Number.isFinite),`Finite transform ${j.name}`));}
function meshMinAlong(root:THREE.Object3D,normal:THREE.Vector3,origin:THREE.Vector3,excludeHands=false){
 let minimum=Infinity;root.updateWorldMatrix(true,true);root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;if(excludeHands&&(o.parent?.name==='leftHand'||o.parent?.name==='rightHand'))return;const a=o.geometry.getAttribute('position');for(let i=0;i<a.count;i++){const p=new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);minimum=Math.min(minimum,p.sub(origin).dot(normal));}});return minimum;
}

test('all advertised joints are real, serializable transforms',()=>{
 const avatar=createAvatar();avatar.update(idleAnimation(),null,0);const e=avatar.getPoseEvidence();
 assert.deepEqual(Object.keys(e.joints),rigProfile.joints);
 for(const name of rigProfile.joints){assert.equal(avatar.root.getObjectsByProperty('name',name).length,1);assert.equal(e.joints[name]!.local.quaternion.length,4);}
 assert.doesNotThrow(()=>JSON.stringify(e));
});

test('3-D two bone solver preserves physical lengths, exact reachable anchors, and hinge limits',()=>{
 const parent=new THREE.Group(),upper=new THREE.Group(),lower=new THREE.Group(),end=new THREE.Group();parent.add(upper);upper.position.set(.4,.5,.1);upper.add(lower);lower.position.y=-.35;lower.add(end);end.position.y=-.33;
 parent.position.set(3,2,-4);parent.rotation.set(.2,.65,-.1);
 for(const target of [new THREE.Vector3(.2,.2,.35),new THREE.Vector3(.25,.9,-.25),new THREE.Vector3(.7,.6,.3)]){
  const world=parent.localToWorld(target.clone()),result=solveTwoBoneIK({upper,lower,end},world,new THREE.Vector3(-1,-1,1));
  assert.ok(result.error<1e-8);assert.equal(result.clamped,false);assert.ok(lower.rotation.x>=0&&lower.rotation.x<=2.72);assert.ok(Math.abs(lower.rotation.y)<1e-8&&Math.abs(lower.rotation.z)<1e-8);
  assert.ok(Math.abs(upper.getWorldPosition(new THREE.Vector3()).distanceTo(lower.getWorldPosition(new THREE.Vector3()))-.35)<1e-8);
  assert.ok(Math.abs(lower.getWorldPosition(new THREE.Vector3()).distanceTo(end.getWorldPosition(new THREE.Vector3()))-.33)<1e-8);
 }
 const remote=solveTwoBoneIK({upper,lower,end},new THREE.Vector3(100,100,100),new THREE.Vector3(0,-1,0));assert.equal(remote.clamped,true);assert.ok(remote.solvedDistance<.68);allFinite(parent);
});

test('wall, push and pull use real world anchors across rotated normals with planted soles and bounded body',()=>{
 for(const mode of ['wall','push','pull'] as const)for(const heading of [0,.63,Math.PI/2,Math.PI,-2.3])for(const equipment of [null,compileEquipment(0),compileEquipment(5)]){
  const avatar=createAvatar(),position=new THREE.Vector3(5,2,-3);avatar.root.position.copy(position);avatar.setEquipment(equipment);
  const c=contactFor(mode,heading,position);avatar.update({...idleAnimation(),heading,speed:4,phase:.82,lean:.2},null,0,undefined,c);
  const e=avatar.getPoseEvidence();assert.ok(e.anchors.left.error!<1e-7,`${mode} left error ${e.anchors.left.error}`);assert.ok(e.anchors.right.error!<1e-7,`${mode} right error ${e.anchors.right.error}`);assert.equal(e.equipment.stowed,true);assert.equal(e.equipment.parent,'back');
  for(const [side,phase] of [['left',.82],['right',1.32]] as const){const sole=e.joints[side+'Ankle']!.world.position[1]!-position.y;if(mode==='wall'||footContact(phase,1,1).planted)assert.ok(Math.abs(sole-.09)<1e-7);else assert.ok(sole>.09,'moving effort must recover the unloaded foot');}
  assert.ok(e.bounds.min[1]!>=position.y-.001);assert.ok(e.bounds.max[1]!<=position.y+2.16);allFinite(avatar.root);
  assert.ok(meshMinAlong(avatar.root,new THREE.Vector3(c.normal.x,0,c.normal.z),new THREE.Vector3(c.point!.x,c.point!.y,c.point!.z),true)>-.025,`${mode} visible support penetration`);
 }
});

test('hang keeps both palms fixed to ledge anchors and tucks feet outside the support wall',()=>{
 for(const heading of [0,.7,Math.PI/2,Math.PI,-2.3])for(const equipment of [null,compileEquipment(0),compileEquipment(5)]){
  const avatar=createAvatar(),position=new THREE.Vector3(-7,3,4);avatar.root.position.copy(position);avatar.setEquipment(equipment);
  const c=contactFor('hang',heading,position);avatar.update({...idleAnimation(),heading,airborne:true,vertical:-2},null,0,undefined,c);const e=avatar.getPoseEvidence();
  for(const side of ['left','right'] as const){assert.ok(e.anchors[side].error!<1e-7,`${side} hang error ${e.anchors[side].error}`);assert.ok(e.joints[side+'Ankle']!.world.position[1]!>position.y+.3);}
  const n=new THREE.Vector3(c.normal.x,0,c.normal.z),point=new THREE.Vector3(c.point!.x,c.point!.y,c.point!.z);
  assert.ok(meshMinAlong(avatar.root,n,point,true)>-.025,'suspended body and stowed weapon outside wall');allFinite(avatar.root);
 }
});

test('pose is snapshot deterministic, contact release and mode transitions reset every joint idempotently',()=>{
 const avatar=createAvatar();const a={...idleAnimation(),phase:.83,heading:.6};const baseline=createAvatar();baseline.update(a,null,0);
 const expected=baseline.getPoseEvidence();
 for(const mode of ['wall','hang','climb','push','pull'] as const){const c=contactFor(mode,.6);avatar.update(a,null,0,undefined,c);const first=avatar.getPoseEvidence();avatar.update(a,null,0,undefined,c);assert.deepEqual(avatar.getPoseEvidence(),first);avatar.update(a,null,0);assert.deepEqual(avatar.getPoseEvidence(),expected);}
 avatar.update(a,null,0);assert.deepEqual(avatar.getPoseEvidence(),expected);
});

test('weak, invalid, missing and remote evidence cannot cause NaNs, stretch, or override low clearance',()=>{
 const avatar=createAvatar();
 for(const strength of [0,.1,.5,1])for(const crouch of [0,1]){
  const c=contactFor('wall');c.strength=strength;c.leftHand={x:1000,y:2000,z:-2000};c.rightHand=null;
  avatar.update({...idleAnimation(),crouch},null,0,undefined,c);const e=avatar.getPoseEvidence();allFinite(avatar.root);assert.ok(e.bounds.min[1]!>=-.002);assert.ok(e.bounds.max[1]!<=(crouch?1.06:2.16));
  if(strength&&crouch===0)assert.equal(e.anchors.left.clamped,true);
 }
 const bad=contactFor('wall');bad.normal.x=NaN;avatar.update(idleAnimation(),null,0,undefined,bad);allFinite(avatar.root);assert.equal(avatar.getPoseEvidence().contact.mode,'none');
});

test('climb pose follows worker-authorized displacement, not phase or repeated updates',()=>{
 const avatar=createAvatar(),contact=contactFor('climb');
 for(const height of [0,.25,.5,.75]){
  avatar.root.position.y=height;avatar.update({...idleAnimation(),airborne:true},null,0,undefined,contact);const e=avatar.getPoseEvidence();
  for(const side of ['left','right'] as const)assert.ok(e.anchors[side].error!<.04,`${height} climb ${side} error ${e.anchors[side].error}`);
  assert.ok(e.bounds.min[1]!>=height-.002);allFinite(avatar.root);
 }
});

test('world anchors follow translated and rotated player ancestors without a stale matrix prerequisite',()=>{
 const avatar=createAvatar(),player=new THREE.Group(),scene=new THREE.Group();scene.add(player);player.add(avatar.root);avatar.root.position.set(.15,0,-.1);
 for(const playerYaw of [0,.8,-1.4])for(const localHeading of [0,.4,-.25])for(const mode of ['wall','push','pull','hang'] as const){
  player.position.set(9,2,-6);player.rotation.y=playerYaw;scene.position.set(-3,0,7);scene.rotation.y=.3;
  // Deliberately do not update either ancestor's matrix before avatar.update.
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),playerYaw),sceneQ=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.3);
  const rootWorld=avatar.root.position.clone().applyQuaternion(q).add(player.position).applyQuaternion(sceneQ).add(scene.position);
  const contact=contactFor(mode,playerYaw+localHeading+.3,rootWorld);
  avatar.update({...idleAnimation(),heading:localHeading,airborne:mode==='hang'},null,0,undefined,contact);const e=avatar.getPoseEvidence();
  for(const side of ['left','right'] as const)assert.ok(e.anchors[side].error!<1e-7,`${mode} nested ${side}: ${e.anchors[side].error}`);
  allFinite(avatar.root);
 }
});

test('pressure blends preserve sole clearance and never change physical segment lengths',()=>{
 const avatar=createAvatar();
 for(const mode of ['wall','push','pull'] as const)for(let strength=0;strength<=1;strength+=.025)for(const phase of [0,.4,.85]){
  const c=contactFor(mode);c.strength=strength;avatar.update({...idleAnimation(),phase,speed:2},null,0,undefined,c);const e=avatar.getPoseEvidence();
  assert.ok(e.bounds.min[1]!>=-.002,`${mode} ${strength} sole floor ${e.bounds.min[1]}`);
  for(const side of ['left','right'])for(const [a,b,length] of [['Shoulder','Elbow',.35],['Elbow','Hand',.33],['Hip','Knee',.45],['Knee','Ankle',.45]] as const){
   const p=e.joints[side+a]!.world.position,q=e.joints[side+b]!.world.position;
   assert.ok(Math.abs(new THREE.Vector3().fromArray(p).distanceTo(new THREE.Vector3().fromArray(q))-length)<1e-7);
  }
 }
});

import {Worker} from 'node:worker_threads';
import {ANIMATION_CLIPS,createAnimationReviewRunner,type ReviewWorker} from '../src/animation-review.ts';
function actualReviewWorker():ReviewWorker{
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);let ready=false,queue=[];parentPort.on('message',m=>ready?self.onmessage({data:m}):queue.push(m));import(${JSON.stringify(new URL('../src/physics.worker.ts',import.meta.url).href)}).then(()=>{ready=true;for(const m of queue)self.onmessage({data:m});queue=[];});`,{eval:true,execArgv:['--experimental-strip-types']});
 const bridge:ReviewWorker={onmessage:null,onerror:null,postMessage:m=>worker.postMessage(m),terminate:()=>{void worker.terminate();}};
 worker.on('message',data=>bridge.onmessage?.({data}));worker.on('error',e=>bridge.onerror?.({message:e.message}));return bridge;
}
test('exact production review fixtures retain real world grips, bounds and support clearance throughout every real worker frame',async t=>{
 const runner=createAnimationReviewRunner(actualReviewWorker);t.after(()=>runner.dispose());
 const observed=new Set<string>(),summary:Record<string,{poses:number;anchors:number;clamped:number;minError:number|null;maxError:number;strongMaxError:number;minRelativeY:number;maxRelativeY:number}>={};
 for(const clip of ANIMATION_CLIPS){
  const run=await runner.load(clip);
  for(const seed of [null,0,5]){
   const avatar=createAvatar(),player=new THREE.Group();player.add(avatar.root);avatar.setEquipment(seed===null?null:compileEquipment(seed));
   for(const frame of run.frames){
    const p=frame.physics,c=p.contact;observed.add(c.mode);player.position.set(p.x,p.feetY,p.z);avatar.update(frame.animation,null,0,undefined,c);
    const e=avatar.getPoseEvidence(),metric=summary[c.mode]??={poses:0,anchors:0,clamped:0,minError:null,maxError:0,strongMaxError:0,minRelativeY:Infinity,maxRelativeY:-Infinity};
    metric.poses++;metric.minRelativeY=Math.min(metric.minRelativeY,e.bounds.min[1]!-p.feetY);metric.maxRelativeY=Math.max(metric.maxRelativeY,e.bounds.max[1]!-p.feetY);
    allFinite(avatar.root);assert.ok(e.bounds.min[1]!>=(c.mantle?0:p.feetY-.002),`${clip.id} tick ${frame.tick}: floor (mantle root datum is not a foot support plane)`);assert.ok(e.bounds.max[1]!<=p.feetY+2.16,`${clip.id} tick ${frame.tick}: ceiling`);
    for(const side of ['left','right'] as const){
     const hand=e.anchors[side];
     if(c.mode==='hang')assert.ok(hand.target,`${clip.id} tick ${frame.tick}: hang requires both actual hand anchors`);
     if(!hand.target)continue;metric.anchors++;metric.minError=Math.min(metric.minError??Infinity,hand.error!);metric.maxError=Math.max(metric.maxError,hand.error!);if(c.strength>.99)metric.strongMaxError=Math.max(metric.strongMaxError,hand.error!);if(hand.clamped)metric.clamped++;
     if(c.mode!=='wall')assert.ok(hand.error!<.015,`${clip.id} tick ${frame.tick} ${side}: error ${hand.error}`);
     else if(c.strength>.99)assert.ok(hand.error!<.003,`settled wall ${side}: ${hand.error}`);
     assert.equal(hand.clamped,false,`${clip.id} tick ${frame.tick} unexpected ${side} reach clamp`);
    }
    if(c.mode==='hang'||c.mode==='climb'){
     // Check transformed mesh vertices against the real ledge solid, below its top.
     avatar.root.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const positions=object.geometry.getAttribute('position');for(let i=0;i<positions.count;i++){const point=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld);assert.ok(!(point.y<2.38&&point.x>.72&&point.x<2.28&&Math.abs(point.z)<1.98),`${clip.id} tick ${frame.tick} ${object.parent?.name}: mesh inside support`);}});
    }
   }
  }
 }
 for(const mode of ['none','wall','hang','climb','push','pull'])assert.ok(observed.has(mode),`Measured ${mode}`);
 assert.equal(Object.values(summary).reduce((sum,m)=>sum+m.poses,0),ANIMATION_CLIPS.reduce((sum,c)=>sum+c.ticks*3,0));
 t.diagnostic(JSON.stringify({source:'Actual production physics.worker + animationReviewFrames + createAvatar matrix measurements',summary}));
});

test('incidental wall brace yields to explicit actions and combos without hiding their actual rendered pose',()=>{
 const active=createAvatar(),baseline=createAvatar(),a={...idleAnimation(),phase:.72,speed:3,heading:.6};active.setEquipment(compileEquipment(5));baseline.setEquipment(compileEquipment(5));
 const contact=contactFor('wall',a.heading);
 for(const action of ['gather','repair','pulse','enter'] as const)for(const progress of [.1,.5,.9]){
  active.update(a,action,progress,undefined,contact);baseline.update(a,action,progress);assert.deepEqual(active.getPoseEvidence(),baseline.getPoseEvidence(),action);
 }
 for(const stage of [1,2,3] as const)for(const phase of ['prep','active','recovery'])for(const progress of [.1,.5,.9]){
  const combo={stage,phase,progress};active.update(a,null,0,combo,contact);baseline.update(a,null,0,combo);assert.deepEqual(active.getPoseEvidence(),baseline.getPoseEvidence(),`${stage} ${phase}`);assert.equal(active.getPoseEvidence().equipment.stowed,false);
 }
});

test('intentional grip and suspension retain hand priority over stale action/combo overlays',()=>{
 const a={...idleAnimation(),heading:.6},active=createAvatar(),baseline=createAvatar();
 for(const mode of ['push','pull','hang','climb'] as const)for(const strength of [.3,1]){
  const contact={...contactFor(mode,a.heading),strength};active.update(a,'pulse',.5,{stage:3,phase:'active',progress:.5},contact);baseline.update(a,null,0,undefined,contact);assert.deepEqual(active.getPoseEvidence(),baseline.getPoseEvidence(),mode);
 }
});
