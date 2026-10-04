import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three/webgpu';
import {GUARD_VISUAL_FIXTURES,guardReviewStates,guardReviewCamera,type GuardReviewFrame} from '../src/guard-fixtures.ts';
import {createGuardState,requestGuard,stepGuard,validGuardState,DEFAULT_GUARD_RECIPE,type GuardContext} from '../src/guard.ts';
import {createComboState,stepCombo} from '../src/combat.ts';
import {createEncounters,advanceEncounters,ENEMY_RULES} from '../src/encounters.ts';
import {resolveGuardDamage} from '../src/guard-resolution.ts';
import {normalizeCapturePlan} from '../src/visual-capture.ts';

// Load the unchanged review adapters in Node. CSS is a no-op here and legacy
// extensionless view imports resolve to TS; no DOM, renderer or browser is created.
const hooks=registerHooks({resolve(specifier,context,nextResolve){
 if(specifier.endsWith('.css'))return {url:'data:text/javascript,export default null',shortCircuit:true};
 if(specifier.startsWith('.')&&context.parentURL?.includes('/src/')&&!/\.[a-z]+$/i.test(specifier))return nextResolve(specifier+'.ts',context);
 return nextResolve(specifier,context);
}});
const {createGuardReviewModel,guardReviewEvidence,guardReviewMeshEvidence}=await import('../src/visual-review.ts');
hooks.deregister();

function replay(run:ReturnType<typeof guardReviewStates>['runs']['timed']){
 let encounters=createEncounters([{id:'guard-review-sentry',x:0,y:0,z:2,zone:'valley'}]),guard=createGuardState(),combo=createComboState(),hp=100;
 const context:GuardContext={player:{x:0,y:0,z:0,facing:run.mode==='rear'?Math.PI:0,hp,grounded:true,crouched:false},playing:true,obstacles:[]};
 for(const frame of run.frames){
  let guardEvents:GuardReviewFrame['guardEvents']=[];context.player.hp=hp;
  if(frame.tick===run.pressTick){const cast=requestGuard(guard,combo,context,'review-'+run.mode);guard=cast.state;combo=cast.combo;guardEvents.push(...cast.events);}
  const guarded=stepGuard(guard,run.stepSeconds,context);guard=guarded.state;guardEvents.push(...guarded.events);
  const encounter=advanceEncounters(encounters,run.stepSeconds,{zone:'valley',players:[{id:'review-player',x:0,y:0,z:0,hp}],obstacles:[],height:()=>0,defeated:[]});encounters=encounter.state;
  for(const event of encounter.events)if(event.type==='damage'){const result=resolveGuardDamage(guard,context,event,encounters.enemies[0]);guard=result.guard;guardEvents.push(...result.events);hp=Math.max(0,hp-result.damage);}
  combo=stepCombo(combo,run.stepSeconds,{player:{x:0,y:0,z:0,facing:context.player.facing,hp},targets:[],obstacles:[]}).state;
  assert.deepEqual({tick:frame.tick,seconds:(frame.tick+1)/60,hp,combo,guard,enemy:encounters.enemies[0],events:encounter.events,guardEvents},frame,run.mode+' tick '+frame.tick);
 }
}

test('six guard probes replay all 273 fixed-step production snapshots without synthetic block states',()=>{
 const review=guardReviewStates();assert.deepEqual(review,guardReviewStates());assert.equal(GUARD_VISUAL_FIXTURES.length,6);assert.equal(new Set(GUARD_VISUAL_FIXTURES.map(f=>f.id)).size,6);
 assert.equal(normalizeCapturePlan({scenario:'production-guard',ticks:GUARD_VISUAL_FIXTURES.map((_,i)=>i)}).ticks.length,6);
 for(const run of Object.values(review.runs)){assert.equal(run.frames.length,91);assert.equal(run.maximumTicks,91);assert.equal(run.stepSeconds,1/60);replay(run);for(const frame of run.frames)assert.equal(validGuardState(frame.guard),true);}
 assert.deepEqual(GUARD_VISUAL_FIXTURES.map(f=>review.states[f.id].tick),[33,40,45,53,45,45]);
 for(const fixture of GUARD_VISUAL_FIXTURES){const frame=review.states[fixture.id];assert.equal(frame.combo.stamina,78);assert.equal(frame.enemy.attackId,1);assert.deepEqual([frame.enemy.x,frame.enemy.y,frame.enemy.z],[0,0,2]);assert.equal(frame.guard.receipt?.status,'accepted');}
 assert.deepEqual(GUARD_VISUAL_FIXTURES.map(f=>review.states[f.id].hp),[100,100,100,100,88,88]);
 assert.deepEqual(GUARD_VISUAL_FIXTURES.map(f=>review.states[f.id].enemy.phase),['prepare','prepare','strike','strike','strike','strike']);
});

test('capture evidence keeps exact shared resource, durable receipt, actual contact events and detached full frames',()=>{
 const review=guardReviewStates(),before=structuredClone(review);
 for(const fixture of GUARD_VISUAL_FIXTURES){
  const evidence=guardReviewEvidence(review,fixture.id),frame=review.states[fixture.id];
  assert.deepEqual(evidence.frame,frame);assert.equal(evidence.tick,frame.tick);assert.equal(evidence.seconds,frame.seconds);assert.equal(evidence.sharedStamina,frame.combo.stamina);assert.equal(evidence.phase,frame.guard.phase);assert.deepEqual(evidence.receipt,frame.guard.receipt);assert.deepEqual(evidence.lastBlock,frame.guard.lastBlock);
  assert.deepEqual(evidence.contacts.map(({blocked,appliedDamage,...event})=>event),frame.events.filter(e=>e.type==='damage'));assert.equal(evidence.hpBefore-evidence.hp,evidence.contacts.reduce((n,event)=>n+event.appliedDamage,0));
  evidence.frame.combo.stamina=999;evidence.frame.enemy.phase='idle';evidence.frame.events.length=0;evidence.receipt!.intentId='mutated';evidence.player.x=999;
 }
 const intercepted=guardReviewEvidence(review,'guard-blocked');assert.equal(intercepted.contacts.length,1);assert.equal(intercepted.contacts[0]!.damage,12);assert.equal(intercepted.contacts[0]!.appliedDamage,0);assert.equal(intercepted.contacts[0]!.blocked,true);assert.equal(intercepted.lastBlock?.id,1);assert.ok(intercepted.frame.enemy.hitIds.includes('review-player'));
 for(const id of ['guard-too-early','guard-rear']as const){const failed=guardReviewEvidence(review,id);assert.equal(failed.hp,88);assert.equal(failed.phase,'idle');assert.equal(failed.contacts[0]!.appliedDamage,12);assert.equal(failed.contacts[0]!.blocked,false);assert.equal(failed.lastBlock,null);}
 assert.deepEqual(review,before,'editing a report cannot alter replay state');
});

test('production avatar, sentry and guard follow exact snapshots in forward, reverse and repeated selection',()=>{
 const review=guardReviewStates(),before=structuredClone(review),model=createGuardReviewModel(),geometryById=new Map();
 try{for(const fixture of [...GUARD_VISUAL_FIXTURES,...[...GUARD_VISUAL_FIXTURES].reverse(),...GUARD_VISUAL_FIXTURES]){
  const frame=review.states[fixture.id];model.update(frame);const geometry=guardReviewMeshEvidence(model);
  assert.deepEqual(model.avatar.root.position.toArray(),[0,0,0]);assert.equal(model.avatar.root.rotation.y,frame.guard.facing);assert.deepEqual(model.sentry.root.position.toArray(),[frame.enemy.x,frame.enemy.y,frame.enemy.z]);assert.equal(model.sentry.root.rotation.y,frame.enemy.heading);assert.deepEqual(model.field.root.position.toArray(),[0,0,0]);assert.equal(model.field.root.rotation.y,frame.guard.facing);
  assert.equal(model.field.root.visible,frame.guard.phase!=='idle');assert.equal(geometry.field!==null,frame.guard.phase!=='idle');assert.equal(model.field.root.children[0]!.visible,frame.guard.phase==='windup'||frame.guard.phase==='active'&&!frame.guard.spent);
  const warning=model.sentry.root.children.find(o=>o instanceof THREE.Mesh&&o.geometry instanceof THREE.RingGeometry);assert.equal(warning?.visible,frame.enemy.phase==='prepare'||frame.enemy.phase==='strike');
  assert.ok([...geometry.min,...geometry.max].every(Number.isFinite));assert.ok(geometry.actors.avatar.min[1]!>=-.002);assert.ok(geometry.actors.sentry.min[1]!>-.15);assert.ok(geometry.max[1]!<2.3);assert.ok(geometry.max[2]!<3.4);assert.ok(geometry.min[2]!>-.8);
  if(geometryById.has(fixture.id))assert.deepEqual(geometry,geometryById.get(fixture.id),'selection order does not change model evidence');else geometryById.set(fixture.id,geometry);
 }
 assert.deepEqual(review,before,'presentation cannot tick authority or consume stamina');
 }finally{model.dispose();assert.equal(model.root.children.length,0);}
});

test('field vertices retain the production 2.4 m radius and 120 degree front arc',()=>{
 const review=guardReviewStates(),model=createGuardReviewModel();
 try{model.update(review.states['guard-active']);const boundary=model.field.root.children[1]as THREE.Line,position=boundary.geometry.getAttribute('position');assert.equal(position.count,35);
  for(let i=1;i<position.count-1;i++){assert.ok(Math.abs(Math.hypot(position.getX(i),position.getZ(i))-DEFAULT_GUARD_RECIPE.range)<2e-7);assert.ok(Math.abs(position.getY(i)-.85)<1e-7);assert.ok(Math.abs(Math.atan2(position.getX(i),position.getZ(i)))<=DEFAULT_GUARD_RECIPE.arc/2+1e-7);}
  assert.ok(Math.abs(Math.atan2(position.getX(1),position.getZ(1))+DEFAULT_GUARD_RECIPE.arc/2)<1e-7);assert.ok(Math.abs(Math.atan2(position.getX(position.count-2),position.getZ(position.count-2))-DEFAULT_GUARD_RECIPE.arc/2)<1e-7);
 }finally{model.dispose();}
});

test('all four fixture cameras numerically contain every visible actor, sentry warning and guard vertex',()=>{
 const review=guardReviewStates(),model=createGuardReviewModel();
 try{for(const angle of ['front','side','back','three-quarter']){
  const framing=guardReviewCamera(angle),camera=new THREE.PerspectiveCamera(38,16/10,framing.near,framing.far);assert.deepEqual(framing,guardReviewCamera(angle));assert.equal(framing.near,.01);assert.equal(framing.far,18);camera.position.set(...framing.position);camera.lookAt(new THREE.Vector3(...framing.target));camera.updateMatrixWorld(true);
  for(const fixture of GUARD_VISUAL_FIXTURES){model.update(review.states[fixture.id]);let vertices=0;model.root.traverseVisible(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){const position=o.geometry.getAttribute('position');for(let i=0;i<position.count;i++){const projected=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(o.matrixWorld).project(camera);assert.ok([projected.x,projected.y,projected.z].every(Number.isFinite));assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1&&projected.z>-1&&projected.z<1,`${angle} ${fixture.id}: vertex outside frame (${projected.toArray()})`);vertices++;}}});assert.ok(vertices>1000);}
 }}finally{model.dispose();}
});

test('review UI keeps existing subjects and uses guard production evidence and camera helpers',async()=>{
 const source=await readFile(new URL('../src/visual-review.ts',import.meta.url),'utf8');
 for(const subject of ['humanoid','quadruped','cave','ecology','guard'])assert.ok(source.includes(`value="${subject}"`));
 assert.match(source,/guardStates=guardReviewStates\(\)/);assert.match(source,/guard:guardReviewEvidence\(guardStates!,f\.data\.id\)/);assert.match(source,/framing:guardReviewCamera\(viewSelect\.value\)/);assert.match(source,/guardModel\?\.dispose\(\)/);
 assert.ok(ENEMY_RULES.reach>0,'production sentry rules stay in metadata');
});
