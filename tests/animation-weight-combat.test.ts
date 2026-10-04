import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {createAvatar,type ComboPose} from '../src/avatar.ts';
import {guardPoseFromState,type GuardPose} from '../src/avatar-combat.ts';
import {idleAnimation,type AnimationState} from '../src/locomotion.ts';
import {compileEquipment,type EquipmentPlan} from '../src/equipment.ts';
import {createGuardState,requestGuard,stepGuard,DEFAULT_GUARD_RECIPE} from '../src/guard.ts';
import {createComboState,requestComboAttack,stepCombo,comboBufferOpen} from '../src/combat.ts';
import {equipmentCombat} from '../src/equipment-combat.ts';
import {emptyPlayerContact,type PlayerContact} from '../src/player-contact.ts';

const names=['hips','spine','leftHand','rightHand','leftElbow','rightElbow','leftAnkle','rightAnkle','surveyStaff'];
function fixture(equipment:EquipmentPlan|null){
 const avatar=createAvatar();avatar.setEquipment(equipment);
 const joint=(name:string)=>avatar.root.getObjectByName(name)!;
 return {avatar,update(a:AnimationState,combo?:ComboPose,guard?:GuardPose){
  avatar.update(a,null,0,combo,undefined,guard);
  const evidence=avatar.getPoseEvidence().combat;
  avatar.root.updateWorldMatrix(true,true);
  const joints=Object.fromEntries(names.map(name=>[name,{position:joint(name).getWorldPosition(new THREE.Vector3()),rotation:joint(name).getWorldQuaternion(new THREE.Quaternion())}]));
  return {evidence,joints,bounds:new THREE.Box3().setFromObject(avatar.root,true)};
 }};
}
const gears=[null,compileEquipment(0),compileEquipment(5)];

test('combat and guard have exact base endpoints, continuous near-endpoint limbs and no parent-space weapon jump',()=>{
 for(const gear of gears)for(const speed of [0,2,6])for(const phase of [0,.3,.6]){
  const f=fixture(gear),a={...idleAnimation(),speed,phase,lean:.1,turn:.04},base=f.update(a);
  for(const combo of [{stage:1,phase:'prep',progress:0},{stage:1,phase:'recovery',progress:1}] as const){
   const edge=f.update(a,combo);assert.deepEqual(edge.joints,base.joints);
   const near=f.update(a,{...combo,progress:combo.progress===0?.001:.999});
   for(const name of names){assert.ok(near.joints[name]!.position.distanceTo(base.joints[name]!.position)<.0001,`${gear?.name} ${speed} ${name} near endpoint`);assert.ok(near.joints[name]!.rotation.angleTo(base.joints[name]!.rotation)<.0001,`${name} near-endpoint roll`);}
  }
  for(const guard of [{phase:'windup',progress:0},{phase:'recovery',progress:1}] as const)assert.deepEqual(f.update(a,undefined,guard).joints,base.joints);
 }
});

test('dense grounded combat/guard sweeps preserve reachable loaded grips, exact lengths, soles and full equipment bounds',()=>{
 for(const gear of gears)for(const speed of [0,2,6])for(const gaitPhase of [0,.25,.6]){
  const f=fixture(gear),a={...idleAnimation(),speed,phase:gaitPhase,lean:.15,turn:.06},base=f.update(a);
  for(const kind of ['attack','guard'])for(const stage of [1,2,3] as const)for(const phase of ['prep','active','recovery'] as const){
   if(kind==='guard'&&stage!==1)continue;
   let last:ReturnType<typeof f.update>|undefined;
   for(let i=0;i<=120;i++){
    const p=i/120,pose=f.update(a,kind==='attack'?{stage,phase,progress:p}:undefined,kind==='guard'?{phase:phase==='prep'?'windup':phase,progress:p}:undefined);
    assert.ok(pose.bounds.min.y>=-.002,`${gear?.name} ${kind} ${speed} ${stage} ${phase} ${p}: floor ${pose.bounds.min.y}`);
    assert.ok(pose.bounds.max.y<=2.16,`${gear?.name} ${kind} ${speed} ${stage} ${phase} ${p}: ceiling ${pose.bounds.max.y}`);
    for(const side of ['left','right'] as const){
     assert.ok(pose.joints[side+'Ankle']!.position.distanceTo(base.joints[side+'Ankle']!.position)<1e-7,'base ankle target remains fixed');
     const g=pose.evidence?.grips[side];if(g)assert.equal(g.clamped,false,`${side} arm target remains reachable`);if(g?.loaded)assert.ok(g.error<1e-7,`${side} loaded grip ${g.error}`);
     const shoulder=f.avatar.root.getObjectByName(side+'Shoulder')!.getWorldPosition(new THREE.Vector3());
     assert.ok(Math.abs(shoulder.distanceTo(pose.joints[side+'Elbow']!.position)-.35)<1e-8);
     assert.ok(Math.abs(pose.joints[side+'Elbow']!.position.distanceTo(pose.joints[side+'Hand']!.position)-.33)<1e-8);
    }
    if(last)for(const name of names)assert.ok(pose.joints[name]!.position.distanceTo(last.joints[name]!.position)<.04,`${gear?.name} ${kind} ${speed} ${stage} ${phase} ${p}: discontinuous ${name}`);
    last=pose;
   }
  }
 }
});

test('combat phase seams are continuous, preparation winds up, and support hands deliberately acquire and release',()=>{
 for(const gear of gears){const f=fixture(gear),a=idleAnimation();
  for(const stage of [1,2,3] as const)for(const [before,after] of [['prep','active'],['active','recovery']] as const){
   const p=f.update(a,{stage,phase:before,progress:1}),q=f.update(a,{stage,phase:after,progress:0});
   for(const name of names){assert.ok(p.joints[name]!.position.distanceTo(q.joints[name]!.position)<1e-8,`${name} phase seam`);assert.ok(p.joints[name]!.rotation.angleTo(q.joints[name]!.rotation)<1e-7);}
  }
  const early=f.update(a,{stage:1,phase:'prep',progress:.1}),loaded=f.update(a,{stage:1,phase:'active',progress:.5}),late=f.update(a,{stage:1,phase:'recovery',progress:.9});
  assert.ok(early.evidence!.supportWeight<.05);assert.equal(loaded.evidence!.supportWeight,1);assert.ok(late.evidence!.supportWeight<.05);
 }
});

test('guard adapter uses accepted production phases and time, leaving authority and costs unchanged',()=>{
 const context={player:{x:0,y:0,z:0,facing:0,hp:100,grounded:true,crouched:false},playing:true,obstacles:[]};
 const cast=requestGuard(createGuardState(),createComboState(),context,'pose-test');let s=cast.state;
 assert.equal(guardPoseFromState(createGuardState()),undefined);assert.equal(cast.combo.stamina,78);
 for(let tick=0;tick<50;tick++){const before=structuredClone(s),pose=guardPoseFromState(s);assert.deepEqual(s,before);if(pose){assert.equal(pose.phase,s.phase);assert.ok(pose.progress>=0&&pose.progress<=1);}s=stepGuard(s,1/60,context).state;}
 assert.equal(s.phase,'idle');assert.equal(DEFAULT_GUARD_RECIPE.windup,.12);
});

test('integrated overlay is snapshot deterministic, resets after interruptions and yields hands to explicit contacts',()=>{
 const a={...idleAnimation(),speed:2,phase:.3},combo={stage:3,phase:'active',progress:.55} as const,guard={phase:'active',progress:.4} as const;
 const base=createAvatar(),subject=createAvatar();base.update(a,null,0);const ordinary=base.getPoseEvidence();
 const contact:PlayerContact={...emptyPlayerContact(),mode:'push',targetId:'audit-crate',point:{x:0,y:1.2,z:.55},normal:{x:0,y:0,z:-1},leftHand:{x:-.25,y:1.25,z:.55},rightHand:{x:.25,y:1.25,z:.55},strength:1,desired:{x:0,z:.1},resolved:{x:0,z:0}};
 subject.update(a,null,0,combo);const first=subject.getPoseEvidence();subject.update(a,null,0,undefined,undefined,guard);subject.update(a,null,0,combo);assert.deepEqual(subject.getPoseEvidence(),first);
 subject.update(a,null,0);assert.deepEqual(subject.getPoseEvidence(),ordinary,'cancellation cannot leak the previous overlay');
 subject.update(a,null,0,combo,contact,guard);assert.equal(subject.getPoseEvidence().combat,null);assert.equal(subject.getPoseEvidence().contact.mode,'push');
 subject.update({...a,airborne:true},null,0,combo,undefined,guard);assert.equal(subject.getPoseEvidence().combat,null);
 subject.update({...a,crouch:1},null,0,combo,undefined,guard);assert.equal(subject.getPoseEvidence().combat,null);
});

test('guard adds a braced body silhouette while retaining the base root and planted ankles',()=>{
 for(const gear of gears){const f=fixture(gear),a=idleAnimation(),rest=f.update(a),guard=f.update(a,undefined,{phase:'active',progress:.5,impact:.8});
  assert.equal(guard.evidence!.kind,'guard');assert.ok(guard.joints.hips!.position.y<rest.joints.hips!.position.y-.03);
  assert.ok(guard.joints.rightHand!.position.distanceTo(rest.joints.rightHand!.position)>.2);
  assert.ok(guard.joints.leftHand!.position.distanceTo(rest.joints.leftHand!.position)>.2);
  assert.deepEqual(f.avatar.root.position.toArray(),[0,0,0]);
  for(const side of ['left','right'])assert.ok(guard.joints[side+'Ankle']!.position.distanceTo(rest.joints[side+'Ankle']!.position)<1e-8);
 }
});

test('partial stance and landing overlays keep all gear above the floor and within standing clearance',()=>{
 for(const gear of gears)for(const crouch of [0,.12,.24])for(const landing of [0,1])for(const lean of [-.18,.28])for(const phase of ['prep','active','recovery'] as const){
  const f=fixture(gear),a={...idleAnimation(),speed:6,phase:.73,crouch,landing,lean,turn:.13,brake:.7};
  for(const progress of [0,.2,.5,.8,1]){const p=f.update(a,{stage:3,phase,progress});assert.ok(p.bounds.min.y>=-.002,JSON.stringify({gear:gear?.name,crouch,landing,lean,phase,progress,min:p.bounds.min.y}));assert.ok(p.bounds.max.y<=2.16);}
 }
});

test('moving generated equipment is carried to the pack, parked before release, and remains continuous across speed thresholds',()=>{
 for(const gear of gears.filter(p=>p!==null))for(const gaitPhase of [0,.25,.6]){
  const avatar=createAvatar();avatar.setEquipment(gear);let last:ReturnType<typeof avatar.getPoseEvidence>|undefined;
  for(let i=0;i<=220;i++){
   const speed=2.9+i*.01;avatar.update({...idleAnimation(),speed,phase:gaitPhase,lean:.15,turn:.06},null,0);
   const pose=avatar.getPoseEvidence(),travel=pose.travelTool;
   if(travel){if(travel.stowWeight<1)assert.equal(travel.grip.loaded,true,'right hand carries the moving staff');if(travel.grip.loaded)assert.ok(travel.grip.error<1e-7);if(travel.handWeight<1)assert.equal(travel.stowWeight,1,'staff is docked before release');}
   assert.ok(pose.bounds.min[1]!>=-.002);assert.ok(pose.bounds.max[1]!<=2.16);
   if(last)for(const name of ['leftHand','rightHand','rightElbow'])assert.ok(new THREE.Vector3(...pose.joints[name]!.world.position).distanceTo(new THREE.Vector3(...last.joints[name]!.world.position))<.035,`${gear.name} ${speed} ${name}`);
   last=pose;
  }
 }
});

test('partial attacks and guards stay continuous across travel stow boundaries',()=>{
 for(const gear of gears.filter(p=>p!==null))for(const speed of [3,4,4.36,5])for(const phase of ['prep','active','recovery'] as const)for(const progress of [.1,.5,.9]){
  const f=fixture(gear),a={...idleAnimation(),phase:.31,lean:.1},before=f.update({...a,speed:speed-1e-7},{stage:1,phase,progress}),after=f.update({...a,speed:speed+1e-7},{stage:1,phase,progress});
  for(const name of names){assert.ok(before.joints[name]!.position.distanceTo(after.joints[name]!.position)<1e-5,`${speed} ${phase} ${progress} ${name} speed boundary`);assert.ok(before.joints[name]!.rotation.angleTo(after.joints[name]!.rotation)<1e-5);}
  const guardPhase=phase==='prep'?'windup':phase,p=f.update({...a,speed:speed-1e-7},undefined,{phase:guardPhase,progress}),q=f.update({...a,speed:speed+1e-7},undefined,{phase:guardPhase,progress});
  for(const name of names)assert.ok(p.joints[name]!.position.distanceTo(q.joints[name]!.position)<1e-5);
 }
});

test('combat retrieves stowed equipment with the right hand before moving it and redocks before release',()=>{
 for(const gear of gears.filter(p=>p!==null))for(const speed of [4.4,4.7,5,6])for(const phase of ['prep','recovery'] as const){
  const f=fixture(gear),a={...idleAnimation(),speed,phase:.3};
  for(let i=1;i<100;i++){const p=f.update(a,{stage:1,phase,progress:i/100}),e=p.evidence!;
   if(e.staffWeight>0&&e.staffWeight<1){assert.equal(e.grips.right.loaded,true,`${speed} ${phase} ${i}: moving staff is held`);assert.ok(e.grips.right.error<1e-7);}
   if(!e.grips.right.loaded)assert.equal(e.staffWeight,0,'unloaded staff remains parked');
  }
 }
});


test('production 60 Hz full chains retain real attack timing and bounded grip motion for every generated assembly',()=>{
 const builds=new Map<string,EquipmentPlan>();for(let seed=0;seed<128;seed++){const p=compileEquipment(seed);builds.set(JSON.stringify(p.spec),p);}
 for(const gear of [null,...builds.values()])for(const speed of [0,4,4.5,6]){
  const avatar=createAvatar();avatar.setEquipment(gear);const tuning=equipmentCombat(gear);
  const world={player:{x:0,y:0,z:0,facing:0,hp:100},targets:[],obstacles:[]};
  let state=requestComboAttack(createComboState(tuning),world,tuning).state;
  let last:ReturnType<typeof avatar.getPoseEvidence>|undefined;
  const seen=new Set<number>();
  for(let tick=0;tick<240;tick++){
   if(comboBufferOpen(state,tuning))state=requestComboAttack(state,world,tuning).state;
   const phase=state.phase,attack=state.attack,combo=attack&&state.stage?{stage:state.stage,phase,progress:state.phaseElapsed/(phase==='prep'?attack.prep:phase==='active'?attack.active:attack.recovery)}:undefined;
   const saved=structuredClone(state);avatar.update({...idleAnimation(),speed,phase:.3,lean:.12},null,0,combo);assert.deepEqual(state,saved,'presentation never changes hit windows or stamina');
   const pose=avatar.getPoseEvidence();if(state.stage)seen.add(state.stage);
   assert.ok(pose.bounds.min[1]!>=-.002);assert.ok(pose.bounds.max[1]!<=2.16);
   for(const g of Object.values(pose.combat?.grips??{}))if(g.loaded)assert.ok(g.error<1e-7);
   if(last)for(const name of ['leftHand','rightHand','leftElbow','rightElbow'])assert.ok(new THREE.Vector3(...pose.joints[name]!.world.position).distanceTo(new THREE.Vector3(...last.joints[name]!.world.position))<.42,`${gear?.name} ${speed} tick ${tick} ${name} 60 Hz displacement`);
   last=pose;state=stepCombo(state,1/60,world,tuning).state;
  }
  assert.deepEqual([...seen],[1,2,3]);assert.equal(state.phase,'idle');
 }
});
