import {MANTLE_TICKS} from '../src/ledge-mantle.ts';
import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {validPlayerContact,validMovableBodies,emptyPlayerContact,type PlayerContact,type MovableBody} from '../src/player-contact.ts';
type Snapshot={type:string;epoch:number;step:number;x:number;y:number;z:number;feetY:number;vx:number;vy:number;vz:number;grounded:boolean;contact:PlayerContact;movable:MovableBody[]};
async function physics(t:TestContext,config:Record<string,unknown>={}){
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);parentPort.on('message',m=>self.onmessage({data:m}));import(${JSON.stringify(process.env.AXIOM_CONTACT_WORKER??new URL('../src/physics.worker.ts',import.meta.url).href)}).then(()=>parentPort.postMessage({type:'boot'}));`,{eval:true,execArgv:['--experimental-strip-types']});
 t.after(()=>worker.terminate());const messages:any[]=[],snapshots:Snapshot[]=[];let error:Error|undefined,epoch=0,latest:Snapshot;
 worker.on('error',e=>error=e);worker.on('message',m=>{messages.push(m);if(m.type==='error')error=new Error(m.message);if(m.type==='snapshot'){latest=m;snapshots.push(m);}});
 const take=async(type:string)=>{const end=Date.now()+5000;for(;;){if(error)throw error;const i=messages.findIndex(m=>m.type===type);if(i>=0)return messages.splice(i,1)[0];assert.ok(Date.now()<end,`Waiting ${type}`);await new Promise(r=>setTimeout(r,2));}};
 const send=(m:Record<string,unknown>)=>worker.postMessage({epoch,...m});
 const tick=async(ticks=1)=>{const n=snapshots.length;for(let left=ticks;left>0;left-=120){send({type:'step',ticks:Math.min(120,left),requestId:Math.random()});await take('stepped');}return snapshots.slice(n);};
 const input=(values:Record<string,unknown>={})=>send({type:'input',x:0,z:0,...values});
 await take('boot');send({type:'init',x:0,z:0,obstacles:[],manual:true,interactionEnabled:true,...config});await take('ready');await tick(3);
 return {send,input,tick,get latest(){return latest!;},async zone(config:Record<string,unknown>={}){epoch++;send({type:'zone',x:0,z:0,obstacles:[],manual:true,interactionEnabled:true,...config});await take('ready');await tick(3);}};
}
import {createRegionalState,createConnectedState,parseSave,serializeSave,validateSave} from '../src/world.ts';
import {traversalBodies,traversalFromBodies,traversalObstacles} from '../src/traversal-world.ts';
import {townYards,constrainTownCrate} from '../src/town-yards.ts';
import {startingTown,TOWN_CENTER} from '../src/starting-town.ts';
import {townResidents} from '../src/town-residents.ts';
import {createAvatar as sourceAvatar} from '../src/avatar.ts';
const createAvatar:typeof sourceAvatar=process.env.AXIOM_CONTACT_AVATAR? (await import(process.env.AXIOM_CONTACT_AVATAR))[process.env.AXIOM_CONTACT_AVATAR_EXPORT!]:sourceAvatar;
import {idleAnimation} from '../src/locomotion.ts';
import * as THREE from 'three/webgpu';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {mainFunction} from './helpers/main-source.ts';
import {CONTACT_COURSE} from '../src/contact-course.ts';
const ledge={x:1.5,y:1.2,z:0,hx:.8,hy:1.2,hz:2};

test('fresh yards are seeded, bounded and moved crates roundtrip while old occupied geometry stays absent',()=>{
 for(const seed of [0,1,42,73129,4294967295]){
  const s=createRegionalState(seed),bodies=traversalBodies(s);assert.equal(bodies.length,4);assert.deepEqual(townYards(seed),townYards(seed));
  const old={...s};delete old.traversal;assert.equal(traversalBodies(parseSave(serializeSave(old))!).length,1);assert.equal(traversalObstacles(old).length,1);
  for(const b of bodies.slice(1)){b.x+=.3;b.z-=.1;}
  const next={...s,traversal:traversalFromBodies(bodies,s)!};assert.ok(validateSave(next));assert.deepEqual(parseSave(serializeSave(next)),next);assert.deepEqual(traversalBodies(next),bodies);
  const embedded=structuredClone(s);if(embedded.traversal?.version===2){const l=townYards(seed).yards[0]!.ledge;embedded.traversal.yards[0]={x:l.x,y:6.57,z:l.z};assert.equal(validateSave(embedded),false);embedded.traversal.yards=new Array(3);assert.equal(validateSave(embedded),false);}
  bodies[1]!.z=TOWN_CENTER.z;assert.equal(traversalFromBodies(bodies,s),null);
  assert.equal(traversalFromBodies(traversalBodies(s).reverse(),s),null);
 }
 assert.notDeepEqual(townYards(1),townYards(2));assert.equal(traversalBodies(createConnectedState(1)).length,1);
});

test('yard solids and every allowed crate location stay beyond all existing buildings and resident navigation domain',()=>{
 for(const seed of [0,1,42,73129,4294967295]){
  const plan=startingTown(seed);assert.equal(townResidents(seed).length,100);
  for(const y of townYards(seed).yards){
   assert.ok(y.bounds.minZ>TOWN_CENTER.z+54);assert.ok(y.bounds.maxZ<=TOWN_CENTER.z+62);
   for(const b of plan.boxes)assert.ok(b.center.z+b.half.z<y.bounds.minZ||b.center.x+b.half.x<y.bounds.minX||b.center.x-b.half.x>y.bounds.maxX);
   for(const x of [-1e6,1e6])for(const z of [-1e6,1e6]){const p=constrainTownCrate(y.crate,{x,y:6.57,z});assert.ok(p.x-y.crate.hx>y.bounds.minX&&p.x+y.crate.hx<y.bounds.maxX);assert.ok(p.z-y.crate.hz>y.bounds.minZ&&p.z+y.crate.hz<y.bounds.maxZ);}
  }
 }
});

test('production worker reverses the supported mantle into a hang, holds on button release and drops on explicit release',async t=>{
 const p=await physics(t,{obstacles:[ledge]});p.input({x:.7,jump:true,grab:true});await p.tick(30);assert.equal(p.latest.contact.mode,'hang');p.input();await p.tick();p.input({jump:true});await p.tick(MANTLE_TICKS+4);assert.ok(p.latest.grounded&&p.latest.feetY>2.38);
 p.input({x:-.7});p.send({type:'contact-grab'});const descent=await p.tick(MANTLE_TICKS);assert.ok(descent.some(s=>s.contact.mode==='climb'&&s.contact.mantle!.progress<.9));assert.equal(descent.at(-1)!.contact.mantle?.progress,0);assert.ok(descent.every(s=>validPlayerContact(s.contact)));verifyDescent(descent);
 p.input();await p.tick(20);assert.equal(p.latest.contact.mode,'hang');assert.ok(Math.abs(p.latest.feetY-.5)<.02);p.send({type:'contact-release'});const drop=await p.tick(60);assert.ok(drop.some(s=>s.vy<0));assert.ok(p.latest.grounded);
});

test('new roof blocks descent acquisition and an interrupted reverse mantle safely recovers',async t=>{
 const p=await physics(t,{x:1.15,y:2.4,obstacles:[ledge]});p.input({x:-.7});p.send({type:'contact-grab'});const descent=await p.tick(110);assert.ok(descent.some(s=>s.contact.mode==='climb'));
 p.send({type:'contact-release'});p.input();const recovery=await p.tick(200);assert.ok(recovery.every(s=>[s.x,s.y,s.z].every(Number.isFinite)));assert.ok(p.latest.grounded);assert.equal(p.latest.contact.mode,'none');
 await p.zone({x:1.15,y:2.4,obstacles:[ledge,{x:.5,y:3.5,z:0,hx:.13,hy:.2,hz:1}]});p.input({x:-.7});p.send({type:'contact-grab'});const blocked=await p.tick(2);assert.ok(blocked.every(s=>s.contact.mode!=='climb'));
});

test('disposable course accepts actual sandbox grip and jump landing while online keeps authority gate',async t=>{
 const crate=CONTACT_COURSE.movable[0]!;
 const p=await physics(t,{x:crate.x+.95,z:crate.z,sandbox:true,movable:[crate]});p.input({x:-1});p.send({type:'contact-grab'});await p.tick(30);assert.ok(p.latest.movable[0]!.x<crate.x-.2,JSON.stringify(p.latest));assert.equal(p.latest.contact.mode,'push');
 await p.zone({x:crate.x+1.2,z:crate.z,movable:[crate]});p.input({jump:true});const jump=await p.tick(10);p.input({x:-1});jump.push(...await p.tick(12));p.input();jump.push(...await p.tick(50));assert.ok(jump.some(s=>s.grounded&&s.feetY>1.09),JSON.stringify(jump.map(s=>[s.x,s.feetY,s.grounded])));
 await p.zone({x:crate.x+.95,z:crate.z,sandbox:true,online:true,movable:[crate]});p.input({x:-1});p.send({type:'contact-grab'});await p.tick(60);assert.equal(p.latest.movable[0]!.x,crate.x);assert.notEqual(p.latest.contact.mode,'push');
});

function verifyDescent(frames:Snapshot[]){
 const avatar=createAvatar();let previous:number|undefined;
 for(const s of frames){const m=s.contact.mantle;if(!m)continue;
  if(previous!==undefined)assert.ok(m.progress<previous);previous=m.progress;
  for(const b of [ledge,{x:0,y:-.2,z:0,hx:48,hy:.2,hz:48}]){const d=Math.hypot(Math.max(0,Math.abs(s.x-b.x)-b.hx),Math.max(0,Math.abs(s.y-b.y)-m.capsuleHalfHeight-b.hy),Math.max(0,Math.abs(s.z-b.z)-b.hz));assert.ok(d>=.3198,'independent capsule clearance');}
  avatar.root.position.set(s.x,s.feetY,s.z);avatar.update({...idleAnimation(),heading:Math.PI/2,grounded:false},null,0,undefined,s.contact);const pose=avatar.getPoseEvidence();
  for(const side of ['left','right'] as const){if(s.contact[side==='left'?'leftHand':'rightHand']){assert.equal(pose.anchors[side].clamped,false);assert.ok(pose.anchors[side].error!<1e-6);}const foot=m[side==='left'?'leftFoot':'rightFoot'];assert.ok(new THREE.Vector3().fromArray(pose.joints[side+'Ankle']!.world.position).distanceTo(new THREE.Vector3(foot.x,foot.y,foot.z))<1e-6);}
  avatar.root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const points=o.geometry.getAttribute('position');for(let i=0;i<points.count;i++){const v=new THREE.Vector3().fromBufferAttribute(points,i).applyMatrix4(o.matrixWorld);assert.ok(!(v.y<2.38&&v.x>.72&&v.x<2.28&&Math.abs(v.z)<1.98),'real mesh clearance at '+m.progress);}});
 }
 assert.ok(previous===0);
}

test('actual main contact-course entry clears old combat aids, gates transitions and resets bounded evidence',()=>{
 const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),sent:unknown[]=[],label={textContent:''},point={set(){},copy(){}};let resets=0;
 const deps={labActive:true,transitioning:false,physicsReady:true,coop:{active:false},coopPending:false,interruptLab:()=>{},stopLivePractice:()=>{},clearRestorationPractice:()=>{},clearInput:()=>{},labRoot:{visible:true},resetLabTargets:()=>{resets++;},emptyPlayerContact,createComboState:()=>({}),combatTuning:()=>({}),createGuardState:()=>({}),idleAnimation,targetPosition:point,player:{position:point},cameraTarget:point,sendPhysics:(m:unknown)=>sent.push(m),CONTACT_COURSE,$:()=>label,closePanel:()=>{},focusGameplay:()=>{}};
 const declarations="let contactPractice=false,labRunning=true,labTargets=[{}],labAutoCombo=true,labUnlimitedStamina=true,labInfiniteTargets=true,labCaptureOnly=true,labWarmup=1,labTicks=9,labFrames=[{}],labMetrics={},contactEvidence=[{}],contactDiagnostic='',playerContact={},contactRequestId='old',movableBodies=[{}],contactGeometryKey='old',zoneEpoch=1,lastPhysicsStep=8,lastLabStep=8,combo={},guard={},animation={},avatarAction='gather';";
 const body=stripTypeScriptTypes(declarations+mainFunction(source,'startContactPractice'))+';return {start:startContactPractice,get:()=>({contactPractice,labTargets,labAutoCombo,labUnlimitedStamina,contactEvidence,zoneEpoch,contactRequestId}),ready:()=>{physicsReady=true;transitioning=false;}};';
 const run=new Function(...Object.keys(deps),body)(...Object.values(deps));run.start();assert.deepEqual(run.get(),{contactPractice:true,labTargets:[],labAutoCombo:false,labUnlimitedStamina:false,contactEvidence:[],zoneEpoch:2,contactRequestId:null});assert.equal(resets,1);assert.equal(sent.length,1);assert.deepEqual((sent[0] as any).movable,CONTACT_COURSE.movable);assert.equal((sent[0] as any).sandbox,true);run.start();assert.equal(sent.length,1);run.ready();run.start();assert.equal(sent.length,2);assert.equal(run.get().zoneEpoch,3);
});

import {terrainCell,REGION_BOUND} from './helpers/town-life-physics.ts';
test('streamed worker respects another actor in landing clearance and paired crate travel',async t=>{
 const crate={id:'test-crate',x:33,y:.62,z:32,hx:.5,hy:.6,hz:.5},ledgeAt={...ledge,x:33.5,z:32},town={seed:1,time:0,selfId:'solo',actors:[{id:'other',x:33.2,z:32,feetY:2.4}]};
 const config={x:32,z:32,bound:REGION_BOUND,streamedTerrain:true,initialCells:[terrainCell(0,0)],town,obstacles:[ledgeAt]};
 const p=await physics(t,config);p.input({x:.7,jump:true,grab:true});const blocked=await p.tick(80);assert.ok(blocked.every(s=>!['hang','climb'].includes(s.contact.mode)),'occupied top cannot authorize traversal');
 await p.zone({...config,town:{...town,actors:[]}});p.input({x:.7,jump:true,grab:true});await p.tick(30);assert.equal(p.latest.contact.mode,'hang','same unoccupied ledge accepts real catch');
 await p.zone({...config,obstacles:[],movable:[crate],town:{...town,actors:[{id:'other',x:34.6,z:32,feetY:0}]}});p.input({x:1});p.send({type:'contact-grab'});await p.tick(180);assert.ok(p.latest.movable[0]!.x>33.1);assert.ok(p.latest.movable[0]!.x+.5<=34.6-.36+.001,'crate never overlaps second actor');
});

test('low crate uses supported hand-climb and reverse ground descent with safe release and blocked head clearance',async t=>{
 for(const hy of [.55]){const crate={id:'course-crate',x:1.5,y:hy+.02,z:0,hx:.58,hy,hz:.58};
 const p=await physics(t,{x:.545,movable:[crate]});p.send({type:'contact-grab'});await p.tick();assert.equal(p.latest.contact.mode,'push');p.input({jump:true});const up=await p.tick(MANTLE_TICKS+4);assert.ok(up.some(s=>s.contact.mode==='climb'),JSON.stringify(up.slice(0,3)));assert.ok(p.latest.grounded&&p.latest.feetY>1.09,JSON.stringify(p.latest));
 p.input({x:-.7});p.send({type:'contact-grab'});const down=await p.tick(MANTLE_TICKS);assert.ok(down.some(s=>s.contact.mode==='climb'&&s.contact.mantle!.progress<.9));p.input();await p.tick(5);assert.ok(p.latest.grounded&&Math.abs(p.latest.feetY)<.03,JSON.stringify(p.latest));
 const rig=createAvatar();
 for(const frame of [...up,...down]){assert.ok(validPlayerContact(frame.contact));if(frame.contact.mantle){const half=frame.contact.mantle.capsuleHalfHeight;const d=Math.hypot(Math.max(0,Math.abs(frame.x-crate.x)-crate.hx),Math.max(0,Math.abs(frame.y-crate.y)-half-crate.hy),Math.max(0,Math.abs(frame.z-crate.z)-crate.hz));assert.ok(d>=.3198,'low climb independent capsule clearance');
 rig.root.position.set(frame.x,frame.feetY,frame.z);rig.update({...idleAnimation(),heading:Math.PI/2,grounded:frame.grounded},null,0,undefined,frame.contact);const pose=rig.getPoseEvidence();
 for(const side of ['left','right'] as const){const hand=frame.contact[side==='left'?'leftHand':'rightHand'];if(hand){assert.equal(pose.anchors[side].clamped,false,'low hand reach at '+frame.contact.mantle.progress);assert.ok(pose.anchors[side].error!<1e-6);}const foot=frame.contact.mantle[side==='left'?'leftFoot':'rightFoot'];assert.ok(new THREE.Vector3().fromArray(pose.joints[side+'Ankle']!.world.position).distanceTo(new THREE.Vector3(foot.x,foot.y,foot.z))<1e-6,'low foot reach at '+frame.contact.mantle.progress);}
 rig.root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const points=o.geometry.getAttribute('position');for(let i=0;i<points.count;i++){const v=new THREE.Vector3().fromBufferAttribute(points,i).applyMatrix4(o.matrixWorld);assert.ok(!(v.y<crate.y+crate.hy-.02&&v.y>0&&v.x>crate.x-crate.hx+.02&&v.x<crate.x+crate.hx-.02&&Math.abs(v.z)<crate.hz-.02),'low real mesh clearance at '+frame.contact.mantle!.progress);}});
}}
 await p.zone({x:.545,movable:[crate],obstacles:[{x:1.5,y:2.95,z:0,hx:1,hy:.1,hz:1}]});p.send({type:'contact-grab'});await p.tick();p.input({jump:true});const blocked=await p.tick(20);assert.ok(blocked.every(s=>s.contact.mode!=='climb'));assert.ok(p.latest.grounded);
 await p.zone({x:.545,movable:[crate]});p.send({type:'contact-grab'});await p.tick();p.input({jump:true});await p.tick(100);p.send({type:'contact-release'});p.input();const recovery=await p.tick(180);assert.ok(recovery.every(s=>[s.x,s.y,s.z].every(Number.isFinite)));assert.ok(p.latest.grounded);
 }
});
