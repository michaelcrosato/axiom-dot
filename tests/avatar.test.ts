import {test} from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three/webgpu';
import {createAvatar} from '../src/avatar.ts';import {idleAnimation,footContact,strideFor,stepAnimation,supportDutyFor} from '../src/locomotion.ts';
test('actual joint transforms keep planted soles and crawl palms on their ground targets',()=>{
 const avatar=createAvatar();const point=new THREE.Vector3();
 for(const speed of [.4,2,4,6,8])for(const crawl of [0,1])for(let phase=0;phase<1;phase+=.025){
  avatar.update({...idleAnimation(),speed,phase,crouch:crawl},null,0);avatar.root.updateMatrixWorld(true);
  for(const [side,p] of [['left',phase],['right',phase+.5]] as const)if(footContact(p,1,1,supportDutyFor(speed,crawl)).planted){const y=avatar.root.getObjectByName(side+'Ankle')!.getWorldPosition(point).y;assert.ok(Math.abs(y-.09)<.002,`${side} planted ankle ${y}`);}
  if(crawl)for(const [side,p] of [['left',phase+.5],['right',phase]] as const)if(footContact(p,1,1,supportDutyFor(speed,crawl)).planted){const y=avatar.root.getObjectByName(side+'Hand')!.getWorldPosition(point).y;assert.ok(Math.abs(y-.08)<.003,`${side} planted palm ${y}`);}
 }
});
test('low posture envelope, including hat and stowed staff, fits the low collider throughout motion',()=>{
 const avatar=createAvatar();
 for(const slide of [0,.5,1])for(const lean of [-.18,0,.28])for(const turn of [-.13,0,.13])for(let phase=0;phase<1;phase+=.1){
  avatar.update({...idleAnimation(),speed:slide?6:1.45,phase,crouch:1,slide,lean,turn},null,0);avatar.root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(avatar.root);assert.ok(bounds.max.y<=1.06,`Low avatar top ${bounds.max.y}`);
 }
});
test('duck transition stays within standing clearance until physical low stance is reached',()=>{
 const avatar=createAvatar();let a=idleAnimation();
 for(let step=0;step<=10;step++){const stance=Math.min(1,step/10);a=stepAnimation(a,7,0,true,stance===1,true,1/60,.1,stance);avatar.update(a,null,0);avatar.root.updateMatrixWorld(true);const top=new THREE.Box3().setFromObject(avatar.root).max.y;assert.ok(top<=(stance===1?1.06:2.16),`Transition ${stance}: ${top}`);assert.equal(a.crouch,stance);}
});
test('stride shared by phase advance and low foot/hand paths prevents normalized crawl sliding',()=>{
 for(const crawl of [0,1])for(const speed of [.05,.1,.4,1.45,6]){const dt=1/1000,base={...idleAnimation(),speed,crouch:crawl,phase:.2},next=stepAnimation(base,0,speed,true,!!crawl,false,dt,speed*dt,crawl);const stride=strideFor(speed,crawl);const a=footContact(base.phase,stride,.1,supportDutyFor(speed,crawl)),b=footContact(next.phase,stride,.1,supportDutyFor(speed,crawl));assert.ok(Math.abs((b.z-a.z)+speed*dt)<1e-9);}
});

test('slide/crawl transitions and action overlays keep actual mesh vertices above the floor',()=>{
 const avatar=createAvatar();
 for(const crouch of [0,.5,.75,.9,1])for(const slide of [0,.5,1])for(const speed of [.1,1.45,6,8])for(const action of [null,'gather','repair','pulse','enter'] as const)for(const lean of [-.18,.28])for(let phase=0;phase<1;phase+=.1){
  avatar.update({...idleAnimation(),speed,phase,crouch,slide,lean,turn:.13},action,.5);avatar.root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(avatar.root,true);assert.ok(bounds.min.y>=-.002,`Floor penetration ${bounds.min.y}: ${JSON.stringify({crouch,slide,speed,action,lean,phase})}`);
  if(crouch===1)assert.ok(bounds.max.y<=1.06,`Low pose too high: ${bounds.max.y}`);
 }
});

test('airborne pose tucks actual ankles and landing compresses hips while planted soles stay on floor',()=>{
 const avatar=createAvatar(),point=new THREE.Vector3();avatar.update(idleAnimation(),null,0);const idleHip=avatar.root.children[0]!.position.y;
 avatar.update({...idleAnimation(),airborne:true,vertical:6.3},null,0);avatar.root.updateMatrixWorld(true);
 for(const side of ['left','right'])assert.ok(avatar.root.getObjectByName(side+'Ankle')!.getWorldPosition(point).y>.18,'airborne foot lifts out of ground gait');
 avatar.update({...idleAnimation(),landing:1},null,0);avatar.root.updateMatrixWorld(true);assert.ok(avatar.root.children[0]!.position.y<idleHip-.1,'hips absorb impact');
 for(const side of ['left','right'])assert.ok(Math.abs(avatar.root.getObjectByName(side+'Ankle')!.getWorldPosition(point).y-.09)<.002,'landing keeps sole planted');
});

test('jump and landing poses preserve the visible body envelope for standing and low ceiling clearance',()=>{
 const avatar=createAvatar();
 for(const airborne of [false,true])for(const vertical of [-8,0,6.3])for(const landing of [0,.5,1])for(const crouch of [0,.5,1])for(const slide of [0,.5,1])for(const phase of [0,.4,.8])for(const lean of [-.18,.28])for(const action of [null,'gather','repair','pulse','enter'] as const){
  avatar.update({...idleAnimation(),speed:8,phase,slide,airborne,vertical,landing:airborne?0:landing,crouch,lean},action,.5);avatar.root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(avatar.root,true);assert.ok(bounds.min.y>=-.002,`Jump floor ${bounds.min.y}: ${JSON.stringify({airborne,vertical,landing,crouch,slide,phase,lean,action})}`);
  assert.ok(bounds.max.y<=(crouch===1?1.06:2.16),`Jump ceiling ${bounds.max.y}: ${JSON.stringify({airborne,vertical,landing,crouch,slide,phase,lean,action})}`);
 }
});

test('stationary and slow crouch jump keeps the entire visible rig above its own feet plane',()=>{
 const avatar=createAvatar();for(const speed of [0,.1,1.45])for(const takeoff of [0,.5,1])for(const vertical of [-6,0,6.3])for(const slide of [0,1]){avatar.update({...idleAnimation(),speed,takeoff,vertical,airborne:true,crouch:1,slide},null,0);avatar.root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(avatar.root,true);assert.ok(bounds.min.y>=-.002,`low airborne floor ${bounds.min.y}`);assert.ok(bounds.max.y<=1.06,`low airborne top ${bounds.max.y}`);}
});
