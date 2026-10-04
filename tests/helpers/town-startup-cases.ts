import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {createTownView} from '../../src/town-view.ts';
import {createTownLifeOpening,advanceTownLife,validTownLife,type TownLifeState} from '../../src/town-life.ts';
import {townLifePoses,townLifeClock} from '../../src/town-life-runtime.ts';
import {TOWN_SPAWN} from '../../src/starting-town.ts';
import {conversationFraming} from '../../src/npc-conversation-runtime.ts';
import {CAMERA_VISIBILITY} from '../../src/camera-visibility.ts';
import {TownActivityMonitor} from '../../src/town-activity.ts';
import {townPathClear} from '../../src/town-crowd.ts';
export function startupMatrixCase(factory=createTownView,seed=73129,hz=60,online=false,initial?:TownLifeState,seconds=15){
 let life=initial??createTownLifeOpening(seed);const view=factory(seed),monitor=new TownActivityMonitor(),cameras=[16/9,390/844,16/9].map((aspect,i)=>{const c=new THREE.PerspectiveCamera(42,aspect,.1,CAMERA_VISIBILITY.far),zoom=i===2?58:36,framing=conversationFraming(TOWN_SPAWN,TOWN_SPAWN,zoom,0,.6,aspect<1);c.position.set(framing.x+Math.sin(.6)*framing.distance,framing.y+framing.distance*CAMERA_VISIBILITY.elevation,framing.z+Math.cos(.6)*framing.distance);c.lookAt(framing.x,framing.y,framing.z);c.updateMatrixWorld();return c;}),actor={id:'local',x:TOWN_SPAWN.x,z:TOWN_SPAWN.z,feetY:6};
 let last:ReturnType<typeof view.matrixEvidence>=[],maxFrame=0,maxLag=0;const frustumMin=[Infinity,Infinity,Infinity],frustumMax=[0,0,0],moved=new Set<number>(),animated=new Set<number>(),origins=new Map<number,{x:number;z:number}>(),initialHash=new Map<number,number>(),history:(ReturnType<typeof view.matrixEvidence>)[]=[];let input=townLifePoses(life),authority=townLifeClock(life),lastPacket=-1;
 try{for(let frame=0;frame<=seconds*hz;frame++){
  if(frame)life=advanceTownLife(life,1/hz);
  // Local transport publishes every 4 Hz; the life authority changes at 2 Hz.
  const packet=Math.floor(frame/hz*4+1e-8);if(!online||packet!==lastPacket){input=townLifePoses(life);authority=townLifeClock(life);lastPacket=packet;}
  view.update(authority,TOWN_SPAWN,()=>true,true,undefined,!frame,frame?1/hz:0,[actor],online,input);
  const evidence=view.matrixEvidence(cameras[0]);history.push(evidence);if(history.length>hz+1)history.shift();assert.equal(evidence.length,100);assert(evidence.every(m=>m.instances>=14));
  for(const m of evidence){if(!frame){origins.set(m.index,m);initialHash.set(m.index,m.matrixHash);}else{const p=last.find(p=>p.index===m.index)!;maxFrame=Math.max(maxFrame,Math.hypot(m.x-p.x,m.z-p.z));assert(townPathClear(view.population.plan,p,m),'display matrix root cannot cross a wall');}maxLag=Math.max(maxLag,Math.hypot(m.x-life.residents[m.index]!.x,m.z-life.residents[m.index]!.z));if(Math.hypot(m.x-origins.get(m.index)!.x,m.z-origins.get(m.index)!.z)>.5)moved.add(m.index);if(m.matrixHash!==initialHash.get(m.index))animated.add(m.index);}
  if(frame%Math.max(1,Math.round(hz/4))===0){assert(validTownLife(life,seed));for(let c=0;c<cameras.length;c++){const n=view.matrixEvidence(cameras[c]).filter(m=>m.inFrustum&&life.residents[m.index]!.status==='traveling'&&(frame<hz||Math.hypot(m.x-history[0]![m.index]!.x,m.z-history[0]![m.index]!.z)>.2)).length;frustumMin[c]=Math.min(frustumMin[c]!,n);frustumMax[c]=Math.max(frustumMax[c]!,n);}monitor.sample({now:frame/hz*1000,seed,life,matrices:evidence,physicsStep:frame,renderFrames:view.stats.renderFrames,renderTime:view.stats.renderTime,paused:false,mode:online?'online':'solo',camera:cameras[0]!.projectionMatrix.toArray()});}last=evidence;
 }
 const report=monitor.report(),summary=report.openingSummary!;
 if(!initial){assert(summary.travelersMin>=15,'at least 15 real reserved travelers throughout opening');assert(frustumMin[0]!>=8,'landscape must contain ongoing street activity');assert(frustumMin[1]!>=2,'portrait must not be an empty square');assert(frustumMin[2]!>=12,'wide overview must contain ongoing street activity');assert(summary.maxHome<=45,'opening cannot be a synchronized doorstep cohort');assert(summary.publicFacilities>=5);assert(moved.size>=40);}
 assert.equal(animated.size,100,'every emitted body, including far stationary activities, progresses');assert(maxFrame<=10/hz+.0001,'no presentation teleport');assert(maxLag<3,'no persistent multi-metre display jam');assert.equal(summary.modelStalled.length,0);assert.equal(summary.renderStalled.length,0);assert.equal(summary.routeStalled.length,0);
 return {seed,hz,online,seconds,legacy:!!initial,frustumMin,frustumMax,moved:moved.size,animated:animated.size,maxFrame,maxLag,summary};
 }finally{view.dispose();}
}
