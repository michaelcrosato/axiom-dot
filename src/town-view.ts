import * as THREE from 'three/webgpu';
import {TownPopulation,DEFAULT_TOWN_TUNING,type TownTuning} from './town-population.ts';
import {TownCrowd,TownPresentationClock,TownRenderMotion,TownLifeRenderBuffer,TOWN_RENDER_TIMING,type TownActor,type CrowdPose} from './town-crowd.ts';
import {townGait,type LimbPoint} from './town-gait.ts';
import type {TownMatrixEvidence} from './town-activity.ts';
import type {TownResidentPose} from './town-residents.ts';
import {validTownLifePoses,copyTownLifePoses} from './town-life-projection.ts';
export interface TownConversationAttention {id:string;target:{x:number;z:number};time:number}
/** Visual facing only. Crowd/worker positions and body contacts remain canonical. */
export function townConversationPose(pose:CrowdPose,target:{x:number;z:number},online=false):CrowdPose{
 return {...pose,facing:Math.atan2(target.x-pose.x,target.z-pose.z),...(!online?{speed:0,moving:false,activity:'meeting neighbors' as const}:{})};
}
/** Six geometry buckets, one material, articulated instances; zero per-person scene graphs/bodies. */
export function createTownView(seed:number){
 const population=new TownPopulation(seed),crowd=new TownCrowd(seed),actorProjection=new TownCrowd(seed),clock=new TownPresentationClock(),motion=new TownRenderMotion(),lifeBuffer=new TownLifeRenderBuffer(),root=new THREE.Group();root.name='hearthmere-residents';
 const bodyMaterial=new THREE.MeshStandardMaterial({color:0xffffff,flatShading:true,roughness:1});
 const geometries=[new THREE.BoxGeometry(1,1,1),new THREE.CylinderGeometry(.8,1,1,6),new THREE.IcosahedronGeometry(1,0),new THREE.CylinderGeometry(1,1,1,8),new THREE.ConeGeometry(1,1,6),new THREE.CylinderGeometry(.68,1,1,6)];
 const parts=geometries.map((g,i)=>{const m=new THREE.InstancedMesh(g,bodyMaterial,i===0?2000:i===2?300:100);m.count=0;m.frustumCulled=false;m.castShadow=true;root.add(m);return m;});
 const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion(),localRotation=new THREE.Quaternion(),yawRotation=new THREE.Quaternion(),euler=new THREE.Euler(),color=new THREE.Color();
 let instanceRanges:{index:number;start:number[];end:number[];hands:number[];facing:number}[]=[];
 let visibleIndices:number[]=[],poses:CrowdPose[]=[],targets:CrowdPose[]=[],counts:number[]=[],lastSignature='',renderFrames=0,renderTime=0,presentationTime=0,lastAuthorityTime=0;const fades=new Float32Array(100),details=new Float32Array(100);let dormant=false,lifeMode=false,ownedLife=false,authorityClearance:boolean|null=null,lifeSamples=0,attention:TownConversationAttention|null=null;
 let physicsCoupled=false,contactPoses:CrowdPose[]=[],physicsPoses:CrowdPose[]|undefined;
 function couplePhysics(){physicsCoupled=true;}
 function clearPhysicsPoses(){physicsPoses=undefined;contactPoses=[];}
 function acceptPhysicsPoses(input:unknown){if(!validTownLifePoses(input)||input[0]?.authoritativeMotion!==1)return false;physicsPoses=copyTownLifePoses(input).map(p=>({...p,speed:p.speed??0,distance:p.distance??0,yielding:false}));return true;}
 /** Main ingests accepted authority steps even when no render callback occurs.
  * This retains real corner trajectories; drawing never invents a replacement. */
 function acceptLife(elapsed:number,input:readonly TownResidentPose[]|undefined){if(input?.[0]?.authoritativeMotion!==1)return;if(!validTownLifePoses(input))throw new Error('Invalid authoritative town life poses');lifeBuffer.accept(input.map(p=>({...p,speed:p.speed??0,distance:p.distance??0,yielding:false})),input,elapsed);}
 function update(elapsed:number,observer:{x:number;z:number},confirmed:(x:number,z:number)=>boolean,enabled=true,tuning:TownTuning=DEFAULT_TOWN_TUNING,force=false,dt=0,actors:readonly TownActor[]=[],online=false,lifePoses?:readonly TownResidentPose[]){
  if(lifePoses!==undefined&&!validTownLifePoses(lifePoses))throw new Error('Invalid authoritative town life poses');
  root.visible=enabled;if(!enabled){dormant=true;return;}if(Math.abs(observer.x+176)>145||Math.abs(observer.z+144)>120){root.visible=false;visibleIndices=[];population.activeCount=population.visibleCount=0;dormant=true;return;}
  const useLife=lifePoses!==undefined;
  const resolvedLife=lifePoses?.[0]?.authoritativeMotion===1;ownedLife=resolvedLife;authorityClearance=resolvedLife&&lifePoses!.every(p=>typeof p.contactResolved==='boolean')?lifePoses!.every(p=>p.contactResolved===true):null;
  // Explicit world replacement/dormancy may rebase. A slow visible frame must
  // instead recover through bounded, wall-checked steps, never a force teleport.
  const rewoundLife=useLife&&elapsed<lastAuthorityTime-1e-6;
  lastAuthorityTime=elapsed;force=force||dormant||useLife!==lifeMode||rewoundLife;dormant=false;lifeMode=useLife;
  dt=Number.isFinite(dt)?Math.min(TOWN_RENDER_TIMING.maxFrameSeconds,Math.max(0,dt)):0;
  // Detail follows current logical positions even when a choice changes at an
  // unchanged time. The old schedule budget is retained only for the town lab.
  let lifeActive:Set<number>|undefined;
  if(lifePoses){
   lifeActive=new Set(lifePoses.slice(0,tuning.population).map((p,i)=>({i,d:Math.hypot(p.x-observer.x,p.z-observer.z)})).filter(p=>p.d<44).sort((a,b)=>a.d-b.d||a.i-b.i).slice(0,tuning.activeBudget).map(p=>p.i));
   population.poses.splice(0,population.poses.length,...copyTownLifePoses(lifePoses));population.activeCount=lifeActive.size;lifeSamples++;
  }else population.update(elapsed,observer,tuning,force);
  const beforeTime=presentationTime;presentationTime=clock.sample(elapsed,dt,force,online?TOWN_RENDER_TIMING.maxOnlineLeadSeconds:.05);renderTime=presentationTime*tuning.activityScale;
  const actorFree=lifePoses&&actors.length?crowd.sample(renderTime,tuning.population,tuning.avoidance,[],lifePoses):undefined;
  targets=crowd.sample(renderTime,tuning.population,tuning.avoidance,actors,lifePoses);
  const baseline=actorFree??targets;
  if(lifePoses)lifeBuffer.accept(baseline,lifePoses,elapsed,force);
  if(physicsCoupled&&resolvedLife&&contactPoses.length)poses=contactPoses;
  const steps=force||dt<=0?1:Math.max(1,Math.ceil(dt*tuning.activityScale/TOWN_RENDER_TIMING.maxStepSeconds)),step=dt*tuning.activityScale/steps;
  for(let n=0;n<steps;n++){
   const time=force?presentationTime:beforeTime+(presentationTime-beforeTime)*(n+1)/steps;
   const buffered=lifePoses?lifeBuffer.sample(time,crowd.plan,online,resolvedLife?step:Infinity,actors):targets;
   // Explorer yielding is current-frame input, never delayed with the life buffer.
   const displayTargets=lifePoses&&!resolvedLife&&actors.length?actorProjection.sample(time*tuning.activityScale,tuning.population,0,actors,copyTownLifePoses(buffered)):buffered;
   if(resolvedLife){const previous=poses;poses=displayTargets.map((p,i)=>{const {motionPath:_,...pose}=p,last=previous[i];if(force||!last)return {...pose};if(step<=0)return {...last};const moved=Math.hypot(p.x-last.x,p.z-last.z),speed=moved/step;return {...pose,distance:last.distance+moved,speed,moving:speed>.001};});}
   else poses=motion.update(displayTargets,step,crowd.plan,force,actors,useLife);
   if(useLife)lifeBuffer.notePresented(poses);
  }
  contactPoses=poses;
  // Commit only a completed collision frame: these roots and the explorer
  // returned in that worker snapshot have already met the contact solver.
  // Candidate replay continues independently for the next worker input.
  if(physicsCoupled&&resolvedLife&&physicsPoses)poses=physicsPoses;
  // Pausing freezes root motion, not fresh authoritative action metadata.
  if(lifePoses&&!resolvedLife)for(let i=0;i<poses.length;i++)poses[i]!.activity=lifePoses[i]!.activity;
  counts=parts.map(()=>0);visibleIndices=[];instanceRanges=[];
  const colorSignature=`${tuning.appearanceVariety}:`+poses.map((p,i)=>Math.hypot(p.x-observer.x,p.z-observer.z)<90&&confirmed(p.x,p.z)?i:'').join(',');const recolor=force||colorSignature!==lastSignature;lastSignature=colorSignature;
  for(let i=0;i<tuning.population;i++){
   const p=poses[i]!,inRange=Math.hypot(p.x-observer.x,p.z-observer.z)<90&&confirmed(p.x,p.z);if(!inRange){fades[i]=0;continue;}
   visibleIndices.push(i);const range={index:i,start:counts.slice(),end:[] as number[],hands:[] as number[],facing:p.facing};instanceRanges.push(range);const detail=(lifeActive?lifeActive.has(i):population.isActive(i))?1:0;details[i]=force?detail:details[i]!+(detail-details[i]!)*(1-Math.exp(-dt*6));fades[i]=force?1:Math.min(1,fades[i]!+(dt>0?dt/.18:1));
   const original=population.residents[i]!,r=tuning.appearanceVariety?original:{...original,height:1,hat:'none' as const,appearance:{...original.appearance,build:1,shoulders:1,legLength:1,coat:'tunic' as const,hairStyle:0,accessory:'none' as const}},a=r.appearance,h=r.height,fade=fades[i]!,attending=attention?.id===r.id,displayPose=attending?townConversationPose(p,attention!.target,online):lifePoses?p:{...p,activity:population.poses[i]!.activity},gait=townGait(r,displayPose,attending?attention!.time:renderTime,tuning.gaitScale,attending?1:tuning.gestures*(.6+.4*details[i]!)),hip=gait.hipY/h,body=hip+.34+gait.bob/h+gait.breath,head=hip+.88+gait.bob/h;
   yawRotation.setFromAxisAngle(new THREE.Vector3(0,1,0),displayPose.facing);
   range.facing=displayPose.facing;
   const place=(part:number,x:number,y:number,z:number,sx:number,sy:number,sz:number,c:number,rx=0,rz=0)=>{
    position.set(x*h,y*h,z*h).applyQuaternion(yawRotation);position.x+=p.x;position.y=6+position.y*fade;position.z+=p.z;
    localRotation.setFromEuler(euler.set(rx,0,rz));rotation.copy(yawRotation).multiply(localRotation);scale.set(sx*h*fade,sy*h*fade,sz*h*fade);matrix.compose(position,rotation,scale);
    const slot=counts[part]!;counts[part]=slot+1;parts[part]!.setMatrixAt(slot,matrix);if(recolor)parts[part]!.setColorAt(slot,color.setHex(c));
   };
   const segment=(from:LimbPoint,to:LimbPoint,width:number,depth:number,c:number)=>{const dy=to.y-from.y,dz=to.z-from.z;place(0,(from.x+to.x)/2,(from.y+to.y)/2,(from.z+to.z)/2,width,Math.hypot(dy,dz),depth,c,Math.atan2(-dz,-dy));};
   const trousers=0x364b48,boots=0x263f37;
   for(const leg of [gait.left,gait.right]){segment(leg.hip,leg.knee,.15*a.build,.16,trousers);segment(leg.knee,leg.ankle,.125*a.build,.145,trousers);place(0,leg.ankle.x,leg.ankle.y-.06,leg.ankle.z+.04,.19*a.build,.12,.30,boots);}
   place(1,0,body,0,.32*a.build,.63,.25*a.build,r.colors.tunic,gait.lean);
   place(0,0,hip+.025,0,.57*a.build,.10,.38*a.build,a.accent);
   const shoulders=.32*a.shoulders*a.build;
   for(const [side,swing] of [[-1,gait.leftArm],[1,gait.rightArm]]){const shoulder={x:side!*shoulders,y:body+.21,z:0},elbow={x:shoulder.x,y:shoulder.y-Math.cos(swing!)*.26,z:Math.sin(swing!)*.26},hand={x:shoulder.x,y:elbow.y-Math.cos(swing!-.18)*.23,z:elbow.z+Math.sin(swing!-.18)*.23};segment(shoulder,elbow,.12,.14,r.colors.tunic);range.hands.push(counts[0]!);segment(elbow,hand,.10,.115,r.colors.skin);}
   place(2,0,head,0,.22,.25,.215,r.colors.skin);
   // Hair crowns, curls/bun or back bob are separate silhouettes, retained beneath hats.
   place(2,a.hairStyle===3?.16:0,head+.15,a.hairStyle===2?-.10:-.035,.23,a.hairStyle===4?.24:.14,a.hairStyle===2?.26:.22,r.colors.hair);
   if(a.hairStyle===3)place(2,0,head+.09,-.23,.115,.115,.12,r.colors.hair);
   if(r.hat!=='none'){place(3,0,head+.22,0,r.hat==='brim'?.35:.25,.065,r.hat==='brim'?.35:.25,a.accent);place(4,0,head+(r.hat==='hood'?.36:.3),r.hat==='cap'?.03:0,r.hat==='hood'?.27:.23,r.hat==='hood'?.36:.16,.25,a.accent);}
   if(a.coat==='longcoat')place(5,0,hip-.05,-.015,.33*a.build,.50,.27,r.colors.tunic);
   if(a.coat==='apron')place(0,0,body-.15,.235*a.build,.37*a.build,.70,.045,0xd1c3a2);
   if(a.coat==='vest')place(0,0,body+.03,.21*a.build,.47*a.build,.44,.055,a.accent);
   if(a.accessory==='pack')place(0,0,body-.05,-.29,.37,.45,.20,a.accent);
   if(a.accessory==='satchel')place(0,.28*a.build,hip+.10,.07,.20,.30,.25,a.accent);
   if(a.accessory==='tool'){place(0,-.23,hip+.03,-.16,.045,.44,.045,0xb6a479,.2);place(0,-.23,hip+.25,-.20,.20,.10,.11,0x849e9b);}
   range.end=counts.slice();
  }
  for(let i=0;i<parts.length;i++){const part=parts[i]!;part.count=counts[i]!;part.instanceMatrix.needsUpdate=true;if(recolor&&part.instanceColor)part.instanceColor.needsUpdate=true;}
  population.visibleCount=visibleIndices.length;renderFrames++;
 }
 function matrixEvidence(camera?:THREE.Camera):TownMatrixEvidence[]{
  if(!root.visible)return [];if(camera)camera.updateMatrixWorld();
  return instanceRanges.filter(range=>parts[1]!.visible&&range.start[1]!<parts[1]!.count).map(range=>{let hash=2166136261,instances=0;
   for(let bucket=0;bucket<parts.length;bucket++){const part=parts[bucket]!;if(!part.visible)continue;const array=part.instanceMatrix.array,end=Math.min(range.end[bucket]!,part.count);instances+=Math.max(0,end-range.start[bucket]!);for(let n=range.start[bucket]!*16;n<end*16;n++){hash=Math.imul(hash^Math.round(array[n]!*100000),16777619);}}
   const torso=parts[1]!.instanceMatrix.array,offset=range.start[1]!*16,x=torso[offset+12]!,y=torso[offset+13]!,z=torso[offset+14]!,projected=new THREE.Vector3(x,y,z);if(camera)projected.project(camera);
   const arms=parts[0]!.instanceMatrix.array,c=Math.cos(range.facing),s=Math.sin(range.facing),handOffsets=range.hands.flatMap(slot=>{const n=slot*16,dx=arms[n+12]!-.5*arms[n+4]!-x,dz=arms[n+14]!-.5*arms[n+6]!-z;return [c*dx-s*dz,arms[n+13]!-.5*arms[n+5]!-6,s*dx+c*dz];});
   return {index:range.index,x,z,matrixHash:hash>>>0,instances,handOffsets,inFrustum:camera?projected.z>=-1&&projected.z<=1&&Math.abs(projected.x)<=1&&Math.abs(projected.y)<=1:false,screenX:camera?projected.x:0,screenY:camera?projected.y:0};
  });
 }
 return {root,population,update,acceptLife,couplePhysics,clearPhysicsPoses,acceptPhysicsPoses,get physicsCoupled(){return physicsCoupled;},get contactPoses(){return contactPoses;},matrixEvidence,attend(value:TownConversationAttention|null){attention=value;},get stats(){return {roster:100,visible:visibleIndices.length,active:population.activeCount,sampledUpdates:population.updates,meshes:parts.length,maximumInstances:2700,instances:counts.reduce((a,b)=>a+b,0),triangles:parts.reduce((n,p)=>n+(p.geometry.index?.count??p.geometry.attributes.position!.count)/3*p.count,0),fullPhysicsBrains:0,nearHz:lifeMode?null:10,farHz:lifeMode?null:2,crowdHz:lifeMode?null:20,activitySource:ownedLife?'authoritative trajectory replay':lifeMode?'authoritative life snapshot':'fixed routine',lifeBufferSeconds:lifeMode?lifeBuffer.bufferSeconds:0,lifeSamples,physicsCoupled,physicsPresentationReady:!!physicsPoses,lifePresentationLagSeconds:lifeMode?lifeBuffer.delay:0,lifeHistoryIncomplete:lifeMode&&lifeBuffer.historyIncomplete,lifeRecoveringIds:lifeMode?lifeBuffer.recoveringIds:[],lifeRecoverySeconds:lifeMode?lifeBuffer.recoverySeconds:0,renderFrames,renderTime,authorityTime:lastAuthorityTime,pairChecks:crowd.pairChecks,maxNeighbors:crowd.maxNeighbors,unresolvedActorContacts:ownedLife?null:crowd.unresolvedActorContacts,authorityClearanceKnown:authorityClearance!==null,contactResolved:authorityClearance,collision:ownedLife?'exact authoritative trajectory replay; same-kernel reconciliation only for missing accepted history':'shared swept discs + bounded wall-clipped yielding; no resident rigid bodies'};},get poses(){return poses;},get targets(){return targets;},get visibleResidents(){return visibleIndices.slice();},nearest(point:{x:number;z:number},radius=3.5){let best:number|undefined,d=radius;for(const i of visibleIndices){const p=poses[i]!,distance=Math.hypot(p.x-point.x,p.z-point.z);if(distance<d){d=distance;best=i;}}return best===undefined?undefined:{resident:population.residents[best]!,pose:poses[best]!};},dispose(){for(const m of parts){m.geometry.dispose();m.dispose();}bodyMaterial.dispose();root.removeFromParent();}};
}
