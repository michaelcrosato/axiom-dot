import {WORKSHOP_CONSTRUCTION_VIEW_ENGINE} from '../../src/workshop-construction-view.ts';
/** Production worker → complete main message handler → world → town matrices.
 * Deterministic transport/frame scheduling is NOT browser/device or GPU QA.
 * The VM replaces unrelated UI/audio/combat effects, never the town authority,
 * contact input, terrain, worker, ownership receipts, or view implementation.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createContext,runInContext} from 'node:vm';
import {Worker} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {mainFunction} from './main-source.ts';
import {createTownView} from '../../src/town-view.ts';
import {copyTownLifePoses} from '../../src/town-life-projection.ts';
import {townLifePoses,townLifeClock,townFrameSeconds,TownSnapshotContinuity} from '../../src/town-life-runtime.ts';
import {townClock,townPathClear,TOWN_BODY_RADIUS} from '../../src/town-crowd.ts';
import {immutableTownLife,townLifeFacilities,type TownLifeResidentState} from '../../src/town-life.ts';
import {createRegionalState,enableStartingTown,serializeSave,parseSave,applyAction,encounterObjects,type State} from '../../src/world.ts';
import {TOWN_CENTER,TOWN_SPAWN,startingTown} from '../../src/starting-town.ts';
import {generateRegionalChunk,REGION_BOUND} from '../../src/regional-world.ts';
import {RegionalStreamer,type RegionalEntry} from '../../src/regional-stream.ts';
import {worldHeight} from '../../src/generation.ts';
import {wildernessFeatureRemaining} from '../../src/wilderness.ts';
import {regionalSupplyPlan,regionalSupplyProjectBoxes} from '../../src/regional-supply.ts';
import {regionalTradeProjectBoxes} from '../../src/regional-trade.ts';
import {movementInput,stepFacing} from '../../src/locomotion.ts';
import {DEFAULT_TUNING} from '../../src/tuning.ts';
import {emptyPlayerContact,validPlayerContact,validMovableBodies} from '../../src/player-contact.ts';
import {traversalBodies,traversalFromBodies} from '../../src/traversal-world.ts';
import {createGuardState,guardBusy} from '../../src/guard.ts';
import {stepGuardedWorldEncounters} from '../../src/guard-resolution.ts';
import {TOWN_PLAYER_CONTACT} from '../../src/town-player-contact.ts';
import {townLifeTaskPoint} from '../../src/town-navigation.ts';

export const MAIN_INTEGRATION_SCOPE='Node 22 manual-clock production Rapier worker and real generated initial terrain; complete production main message handler, actual collision confirmations, world actions, contact packets and Three instance matrices. Intact town frame statements are executed in source order. Unrelated DOM/audio/combat effects are stubbed. No browser, GPU pixels, real worker timer, device FPS or regional food/terminal-clock review.';
export type IntegrationCadence=5|10|30|60|'jitter';
export interface MainIntegrationOptions {seconds?:number;cadence?:IntegrationCadence;fixture?:'fresh'|'15'|'150'|'175';seed?:number;pause?:boolean;deliveryJitter?:boolean;workerFile?:URL;factory?:typeof createTownView;mainSource?:string;captureContacts?:boolean;actorAt?:Point;actorWalk?:boolean;onProgress?:(value:Record<string,unknown>)=>void}
type Point={x:number;z:number};
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const noop=()=>{};
const PHYSICAL_ACTOR_GAP=TOWN_BODY_RADIUS+TOWN_PLAYER_CONTACT.radius;
const PHYSICAL_PEER_GAP=TOWN_BODY_RADIUS*2;
const SOURCE_FILES=['main.ts','physics.worker.ts','town-view.ts','town-crowd.ts','town-life.ts','town-life-runtime.ts','town-life-projection.ts','town-navigation.ts','town-player-contact.ts','world.ts'];
const sourceHashes=()=>Object.fromEntries(SOURCE_FILES.map(file=>[file,createHash('sha256').update(readFileSync(new URL('../../src/'+file,import.meta.url))).digest('hex')]));

/** Source is parsed as syntax: the entire handler is used, never an invented tick. */
export function productionTownMain(source=readFileSync(new URL('../../src/main.ts',import.meta.url),'utf8')){
 const handlerStart=source.indexOf('worker.onmessage=(e)=>');assert(handlerStart>=0,'production worker.onmessage assignment');
 let handler='';for(let end=source.indexOf('\n',handlerStart);end>=0;end=source.indexOf('\n',end+1)){const candidate=source.slice(handlerStart,end);try{new Function(stripTypeScriptTypes(candidate,{mode:'strip'}));handler=candidate;break;}catch{}}
 assert(handler,'complete production message handler');
 const fullFrame=mainFunction(source,'frame');
 const dt=fullFrame.match(/const dt=[^;]+;/)?.[0],blocked=fullFrame.match(/const blocked=[^;]+;/)?.[0];assert(dt&&blocked);
 const projection=fullFrame.match(/if\(!labActive\)syncFrontierVisuals\([^\n]+?(?=syncContactProps\(\);)/)?.[0];assert(projection,'intact town projection statement');
 const sendAt=fullFrame.indexOf('sendMovement();'),projectionAt=fullFrame.indexOf(projection);assert(sendAt>=0);
 const boundary=sendAt<projectionAt?['sendMovement();',projection]:[projection,'sendMovement();'];
 const names=['sendPhysics','contactEnabled','townActors','contactWorldPacket','townLifeContactInput','sendMovement','syncFrontierVisuals','regionalPhysical','regionalPacket','confirmRegionalCell','rejectRegionalCell','recordRegionalTravel'];
 if(source.includes('function acceptTownLifeSnapshot('))names.push('acceptTownLifeSnapshot');
 const functions=names.map(n=>mainFunction(source,n)).join('\n');
 const frameSource=`function integrationFrame(rawFrameMs){${dt}${blocked}${boundary.join('\n')}}`;
 const coupling=source.match(/townView\?\.couplePhysics\(\);/)?.[0]??'';
 return {code:stripTypeScriptTypes(functions+'\n'+handler+'\n'+frameSource,{mode:'strip'}),handler:handler,frame:frameSource,coupling,names};
}

async function productionWorker(file:URL,onPacket:(packet:any)=>void,captureContacts:boolean){
 const instrumentation=captureContacts?`const {TownCrowd}=await import(${JSON.stringify(new URL('../../src/town-crowd.ts',import.meta.url).href)});const sample=TownCrowd.prototype.sample;let calls=0;TownCrowd.prototype.sample=function(...args){const result=sample.apply(this,args);integrationPoses=result;if(++calls%30===0)parentPort.postMessage({type:'integration-contact',time:args[0],input:args[4],output:result,actors:args[3]});return result;};`:'';
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');let integrationPoses;globalThis.self=globalThis;self.postMessage=m=>{parentPort.postMessage(m);if(m.type==='snapshot'&&(m.town?.contactPoses??integrationPoses)){const metricPoses=m.town?.contactPoses??integrationPoses;let gap=Infinity,index=-1;for(let i=0;i<metricPoses.length;i++){const p=metricPoses[i],d=Math.hypot(m.x-p.x,m.z-p.z);if(d<gap){gap=d;index=i;}}parentPort.postMessage({type:'integration-physics-contact',step:m.step,gap,index,x:m.x,z:m.z,feetY:m.feetY});}};parentPort.on('message',m=>{if(m.type==='input'&&m.townLifePoses)integrationPoses=m.townLifePoses;if(m.type==='init')integrationPoses=m.town?.lifePoses;self.onmessage({data:m});});(async()=>{${instrumentation}await import(${JSON.stringify(file.href)});parentPort.postMessage({type:'integration-boot'});})().catch(e=>{throw e});`,{eval:true,execArgv:['--experimental-strip-types']});
 let error:Error|undefined;const waiters=new Map<string,{resolve:(p:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>(),queue:any[]=[];
 worker.on('error',e=>{error=e;for(const w of waiters.values()){clearTimeout(w.timer);w.reject(e);}waiters.clear();});
 worker.on('message',m=>{if(m.type==='error')error=Error(m.message);onPacket(m);const key=m.type==='stepped'?`stepped:${m.requestId}`:m.type,w=waiters.get(key);if(w){clearTimeout(w.timer);waiters.delete(key);w.resolve(m);}else if(['integration-boot','ready'].includes(key))queue.push(m);});
 function take(key:string){if(error)return Promise.reject(error);const i=queue.findIndex(m=>m.type===key);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>{waiters.delete(key);reject(Error('Production worker timeout: '+key));},30000);waiters.set(key,{resolve,reject,timer});});}
 await take('integration-boot');let sequence=0;
 return {send:(m:Record<string,unknown>)=>worker.postMessage({epoch:0,...m}),take,async step(ticks:number){const id=++sequence,p=take('stepped:'+id);worker.postMessage({type:'step',epoch:0,ticks,requestId:id});await p;},async dispose(){for(const w of waiters.values())clearTimeout(w.timer);waiters.clear();await worker.terminate();}};
}

function initialState(options:MainIntegrationOptions){
 const seed=options.seed??73129;let state=enableStartingTown(createRegionalState(seed));
 if(options.fixture&&options.fixture!=='fresh')state={...state,townLife:immutableTownLife(JSON.parse(readFileSync(new URL(`../fixtures/town-motion-v11/${options.fixture}.json`,import.meta.url),'utf8')),seed)};
 state={...state,player:{...state.player,...(options.actorAt??TOWN_SPAWN)}};
 const parsed=parseSave(serializeSave(state));assert(parsed,'scenario must survive actual save validation');assert.deepEqual(parsed,state);return parsed;
}

export async function runTownMainIntegration(options:MainIntegrationOptions={}){
 const seconds=options.seconds??120,cadence=options.cadence??10,source=productionTownMain(options.mainSource),start=initialState(options),seed=start.seed;
 const hashesBefore=sourceHashes();
 const view=(options.factory??createTownView)(seed),initialLife=start.townLife!,initialTime=townLifeClock(initialLife);
 let workerVersion='';let now=0,workerTime=0,scheduledAt=0,packetSeq=0,receivedSnapshots=0,handledSnapshots=0,duplicateSnapshots=0,acks=0,initialCells=0,pausedSeconds=0,paused=false,lastProcessedStep=-1;
 let worker:any;const packets:{at:number;order:number;packet:any}[]=[],contactPackets:any[]=[];let lastContactPacket:any;
 const metrics={maxLag:0,maxRootStep:0,unsafeVisibleChords:0,completionBeforeVisibleArrival:0,completionBeforeAuthorityArrival:0,taskProgressAwayFromStation:0,completedActions:0,minimumVisible:100,maximumVisible:0,peakUnresolvedActorContacts:0,workerProjectionDifference:0,workerAuthoritativeProjectionDifference:0,nonAuthoritativeWorkerSamplesAfterWarmup:0,candidateContactPacketDifference:0,drawnAcceptedSnapshotDifference:0,acknowledgedContactSnapshots:0,authoritativeContactPackets:0,minVisibleBodyGap:Infinity,minVisibleActorGap:Infinity,peerOverlapSamples:0,actorOverlapSamples:0,settledPeerOverlapSamples:0,settledActorOverlapSamples:0};
 let acceptedContactPoses:any[]|undefined;
 const rootDistances=new Float64Array(100),authorityDistances=new Float64Array(100),meaningfulActionSeconds=new Float64Array(100),walkingSeconds=new Float64Array(100),maxStuckSeconds=new Float64Array(100),stuckSeconds=new Float64Array(100),peakLag=new Float64Array(100),lagSeconds=new Float64Array(100),maxLagSeconds=new Float64Array(100),lastRoots=new Map<number,Point>(),arrivedAction=new Set<number>();
 let finalMaxLag=0,burstEnd:number|null=null,burstRecoverySeconds:number|null=null;
 const actorContacts:{at:number;index:number;gap:number;resident:Point;actor:Point;authority:Point}[]=[];
 const physicsActorContacts:{startStep:number;endStep:number;seconds:number;minGap:number;index:number}[]=[];
 let physicsMinActorGap=Infinity,physicsOverlapSteps=0,physicsOverlapStart=0,physicsEpisodeGap=Infinity,physicsEpisodeIndex=-1,physicsLastStep=-1,maxPhysicsOverlapSeconds=0;
 const endPhysicsOverlap=(step:number)=>{if(physicsOverlapStart){const duration=(step-physicsOverlapStart)/60;maxPhysicsOverlapSeconds=Math.max(maxPhysicsOverlapSeconds,duration);if(physicsActorContacts.length<256)physicsActorContacts.push({startStep:physicsOverlapStart,endStep:step,seconds:duration,minGap:physicsEpisodeGap,index:physicsEpisodeIndex});}physicsOverlapStart=0;physicsEpisodeGap=Infinity;};
 const lagStartedAt=new Float64Array(100),lagPeak=new Float64Array(100),lagEpisodes:{index:number;start:number;end:number;activeSeconds:number;maxLag:number}[]=[];
 const endLag=(i:number)=>{if(lagSeconds[i]!>=5)lagEpisodes.push({index:i,start:lagStartedAt[i]!,end:now,activeSeconds:lagSeconds[i]!,maxLag:lagPeak[i]!});lagSeconds[i]=0;lagPeak[i]=0;};
 const bounds=Array.from({length:100},()=>({minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity})),windowBounds=Array.from({length:100},()=>({minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity}));
 const span=(b:{minX:number;maxX:number;minZ:number;maxZ:number})=>Number.isFinite(b.minX)?Math.hypot(b.maxX-b.minX,b.maxZ-b.minZ):0;
 const progressWindows:{at:number;walkers:number;workers:number;inactive:number;stuck:number[]}[]=[],windowWork=new Float64Array(100),windowTravel=new Float64Array(100);
 let nextWindow=15,lifeChanges=0,lastPauseBytes='',lastPauseMatrices='';let pauseAckSeen=false,pauseRequestedAt=0,pauseSettlingSeconds:number|null=null,pauseSettlingRootDrift=0,resumeAt:number|null=null,resumeMaxRootStep=0,resumeMaxLag=0;const pauseRequestedRoots=new Map<number,Point>();
 const matrixSignature=()=>createHash('sha256').update(JSON.stringify(view.matrixEvidence())).digest('hex');const stuckEpisodes:{index:number;id:string;start:number;end:number;seconds:number;facility:string|null;x:number;z:number}[]=[];
 const endStuck=(r:TownLifeResidentState)=>{if(stuckSeconds[r.index]!>=5)stuckEpisodes.push({index:r.index,id:r.id,start:now-stuckSeconds[r.index]!,end:now,seconds:stuckSeconds[r.index]!,facility:r.facilityId,x:r.x,z:r.z});stuckSeconds[r.index]=0;};
 const fail=(s:string):never=>{throw Error(s);};
 const context:any={console,Math,JSON,Map,Set,Array,Object,Number,String,Error,structuredClone,performance:{now:()=>now*1000},clearTimeout,
  state:start,worker:{onmessage:null,postMessage:(m:any)=>{if(m.type==='input'&&m.townLifePoses)lastContactPacket=m;const candidate=view.contactPoses??view.poses;if(m.type==='input'&&m.townLifePoses?.[0]?.authoritativeMotion===1&&view.root.visible&&candidate[0]?.authoritativeMotion===1){metrics.authoritativeContactPackets++;for(let i=0;i<100;i++)metrics.candidateContactPacketDifference=Math.max(metrics.candidateContactPacketDifference,distance(m.townLifePoses[i],candidate[i]!));}worker?.send(m);}},startup:{failed:false,playing:false,note:noop,detail:noop,fail:(...v:unknown[])=>fail('Startup failed: '+v.join(' '))},zoneEpoch:0,physicsReady:false,transitioning:true,lastPhysicsStep:-1,labActive:false,labRunning:false,coopPending:false,coop:{active:false,snapshot:null},panel:{hidden:true},document:{hidden:false},windowActive:true,
  targetPosition:new THREE.Vector3(start.player.x,6,start.player.z),physicsMotion:{grounded:true,crouched:false},activeConversation:null,combo:{phase:'idle'},guard:createGuardState(),combatHeading:0,DEFAULT_TUNING,stepFacing,guardBusy,stepGuardedWorldEncounters,consumeGuardEvents:noop,stepCombat:noop,
  guardContext:()=>({player:{...context.state.player,y:context.targetPosition.y,facing:0,grounded:context.physicsMotion.grounded,crouched:context.physicsMotion.crouched},playing:true,obstacles:[]}),
  applyAction,encounterObjects,objects:[],worldHeight,validPlayerContact,validMovableBodies,emptyPlayerContact,playerContact:emptyPlayerContact(),movableBodies:[],contactRequestId:null,traversalBodies,traversalFromBodies,
  workshopProjection:new WORKSHOP_CONSTRUCTION_VIEW_ENGINE.Projection(),WORKSHOP_CONSTRUCTION_VIEW_ENGINE,restorationPendingCollision:null,restorationConfirmedPoint:null,restorationCollisionSignature:'',restorationCollisionRetryAt:0,pendingLabRestore:null,pendingCells:new Map(),confirmCell:()=>false,regionalLoadTarget:null,machineSignature:'',startupInitialCellCount:0,resolvePhysics:noop,resolveStartupPose:noop,updateBackend:noop,failLabRestore:fail,rejectPhysics:(e:Error)=>{throw e;},interruptLab:noop,toast:noop,syncMachine:noop,syncCavePhysics:noop,gameAudio:{cue:noop},$:()=>({style:{}}),
  townView:view,townLifeView:null,townSnapshotContinuity:new TownSnapshotContinuity(),townActivity:{pause:noop},townLifeClock,townLifePoses,copyTownLifePoses,townFrameSeconds,townClock,lastTownLifeContact:undefined,townLifeFacilities,startingTown,
  frontierRoot:{visible:false},residentVisuals:new Map(),workplaceVisuals:new Map(),sourceVisual:null,frontierTarget:new THREE.Vector3(),reducedMotion:false,
  keys:new Set(),stick:{value:{x:0,z:0}},orbit:0,crouch:false,jump:false,coopJumpHeld:false,livePractice:null,liveResumeRequested:false,movementInput,cancelGuardInput:noop,
  regionalPending:new Map(),regionalConfirmedObstacles:new Map(),regionalConfirmedProjects:new Map(),regionalConfirmedTrade:new Map(),regionalPhysicsStats:null,regionalTravel:{metres:0,seconds:0,last:null,speed:0},
  regionalView:{commit:noop,discard:noop,unload:noop},regionalSupplyPlan,regionalSupplyProjectBoxes,regionalTradeProjectBoxes,wildernessFeatureRemaining,
 };
 const vm=createContext(context);runInContext(source.code,vm,{timeout:1000});if(source.coupling)runInContext(source.coupling,vm,{timeout:1000});
 const generator={backend:'integration-real-generation',request:async(s:number,cx:number,cz:number)=>generateRegionalChunk(s,cx,cz),dispose:noop};
 const stage=(entry:RegionalEntry,initial:boolean)=>{context.regionalPending.set(entry.key,{entry,group:{},obstacles:context.regionalPhysical(entry),projects:[],tradeTargets:[]});if(!initial)context.sendPhysics({type:'cell-load',...context.regionalPacket(entry)});};
 const stream=new RegionalStreamer(seed,generator,stage,(key,revision)=>context.sendPhysics({type:'cell-unload',key,revision}),()=> '');context.regionalStreamer=stream;
 context.streamWorld=()=>{if(context.startup.playing&&context.physicsReady)stream.update(context.targetPosition.x,context.targetPosition.z);};
 function deliver(packet:any){
  if(packet.type==='snapshot'){handledSnapshots++;if(packet.step===lastProcessedStep){duplicateSnapshots++;if(paused)pauseAckSeen=true;}lastProcessedStep=packet.step;if(packet.town?.contactPoses){acceptedContactPoses=packet.town.contactPoses;metrics.acknowledgedContactSnapshots++;}}
  const before=context.state.townLife;context.worker.onmessage({data:packet});const life=context.state.townLife;
  if(life?.residents!==before?.residents){lifeChanges++;for(const r of life.residents){const p=before.residents[r.index],root=lastRoots.get(r.index);authorityDistances[r.index]+=Math.max(0,r.distance-p.distance);
   if(r.status==='acting'&&root&&distance(root,r)<.9)arrivedAction.add(r.index);
   const stage=before.navigation?.residents[r.index]?.stage,facility=p.facilityId?townLifeFacilities(seed).find(f=>f.id===p.facilityId):undefined,away=stage!==undefined&&stage>=0&&p.action&&facility?distance(p,townLifeTaskPoint(facility,p.slot,p.action,stage))>1e-6:false;
   if(p.status==='acting'&&r.status==='acting'&&p.facilityId===r.facilityId&&p.action===r.action&&r.remaining<p.remaining){if(away)metrics.taskProgressAwayFromStation++;if(root&&distance(root,r)<.9){const dt=p.remaining-r.remaining;meaningfulActionSeconds[r.index]+=dt;windowWork[r.index]+=dt;}}
   if(r.completed>p.completed){metrics.completedActions+=r.completed-p.completed;if(p.status!=='acting'||p.path.length||away)metrics.completionBeforeAuthorityArrival++;if(root&&distance(root,p)>1.2&&!arrivedAction.has(r.index))metrics.completionBeforeVisibleArrival++;}
   if(r.status!=='acting')arrivedAction.delete(r.index);
  }}
 }
 function flush(force=false){packets.sort((a,b)=>a.at-b.at||a.order-b.order);while(packets.length&&(force||packets[0]!.at<=now+1e-8))deliver(packets.shift()!.packet);}
 try{
  worker=await productionWorker(options.workerFile??new URL('../../src/physics.worker.ts',import.meta.url),m=>{
   if(m.type==='integration-contact'){contactPackets.push({...m,wallTime:workerTime});return;}
   if(m.type==='integration-physics-contact'){physicsMinActorGap=Math.min(physicsMinActorGap,m.gap);if(m.step!==physicsLastStep){physicsLastStep=m.step;if(m.gap<PHYSICAL_ACTOR_GAP-2e-5&&m.feetY>4.1&&m.feetY<7.8){physicsOverlapSteps++;if(!physicsOverlapStart)physicsOverlapStart=m.step;if(m.gap<physicsEpisodeGap){physicsEpisodeGap=m.gap;physicsEpisodeIndex=m.index;}}else endPhysicsOverlap(m.step);}return;}
   if(['stepped','integration-boot'].includes(m.type))return;
   if(m.type==='snapshot')receivedSnapshots++;if(m.type==='cell-ack')acks++;
   // Dedicated-worker postMessage is FIFO. Delay entire bursts without silently
   // dropping/coalescing snapshots or inventing callbacks at render cadence.
   const jitter=options.deliveryJitter?[0,.035,.09,.015,.12,.055][Math.floor(workerTime*4)%6]!:0;
   scheduledAt=Math.max(scheduledAt,workerTime+jitter);packets.push({at:scheduledAt,order:packetSeq++,packet:m});
  },options.captureContacts??!options.workerFile);
  await stream.initial(start.player.x,start.player.z);initialCells=stream.entries.size;
  context.syncFrontierVisuals(0,true);assert.equal(view.stats.visible,0,'unconfirmed initial cells must never draw residents');
  const ready=worker.take('ready');worker.send({type:'init',manual:true,startPaused:true,x:start.player.x,z:start.player.z,y:6,bound:REGION_BOUND,streamedTerrain:true,obstacles:[],initialCells:[...stream.entries.values()].map(e=>context.regionalPacket(e)),...context.contactWorldPacket()});workerVersion=(await ready).version;flush(true);
  // The ready receipt confirms only the real radius-one initial packet.
  assert.equal(context.regionalConfirmedObstacles.size,initialCells);assert.equal(initialCells,9);assert.equal(townLifeClock(context.state.townLife),initialTime);
  context.syncFrontierVisuals(0,true);context.startup.playing=true;context.sendMovement();
  let frame=0,lastFrame=0,physicsSteps=0,actorDirection=1;
  const jitterFrames=[1/60,.1,1/30,.2,.07,.025,.14];
  while(now<seconds-1e-8){
   let dt=cadence==='jitter'?jitterFrames[frame%jitterFrames.length]!:1/cadence;
   if(options.deliveryJitter&&now>=43&&now<43+dt)dt=2;dt=Math.min(dt,seconds-now);now+=dt;frame++;if(dt>=1)burstEnd=now;
   const nextPaused=!!options.pause&&now>=60&&now<65;
   if(nextPaused!==paused){if(!nextPaused){assert.equal(serializeSave(context.state),lastPauseBytes,'paused world bytes');assert(lastPauseMatrices,'pause must receive an actual repeated-step worker acknowledgment');assert.equal(matrixSignature(),lastPauseMatrices,'paused actual matrices after acknowledgment');resumeAt=now;}paused=nextPaused;context.panel.hidden=!paused;context.sendMovement();if(paused){lastPauseBytes=serializeSave(context.state);lastPauseMatrices='';pauseAckSeen=false;pauseRequestedAt=now;pauseRequestedRoots.clear();for(const m of view.matrixEvidence())pauseRequestedRoots.set(m.index,{x:m.x,z:m.z});}}
   if(paused)pausedSeconds+=dt;
   const nextPhysics=Math.floor(now*60+1e-7);
   while(physicsSteps<nextPhysics){const ticks=Math.min(120,nextPhysics-physicsSteps);workerTime=(physicsSteps+ticks)/60;await worker.step(ticks);physicsSteps+=ticks;flush();}
   flush();context.streamWorld();
   if(options.actorWalk){if(context.state.player.x>TOWN_CENTER.x+8)actorDirection=-1;if(context.state.player.x<TOWN_CENTER.x-8)actorDirection=1;context.keys.clear();context.keys.add(actorDirection>0?'KeyD':'KeyA');}
   context.integrationFrame((now-lastFrame)*1000);lastFrame=now;
   const roots=view.matrixEvidence();if(paused){assert.equal(serializeSave(context.state),lastPauseBytes,'authority freezes immediately on pause request');if(pauseAckSeen&&!lastPauseMatrices){pauseSettlingSeconds=now-pauseRequestedAt;assert(pauseSettlingSeconds<=.5,'worker pause acknowledgment must settle within half a second');for(const m of roots){const p=pauseRequestedRoots.get(m.index);if(p)pauseSettlingRootDrift=Math.max(pauseSettlingRootDrift,distance(p,m));}lastPauseMatrices=matrixSignature();}else if(lastPauseMatrices)assert.equal(matrixSignature(),lastPauseMatrices,'acknowledged paused matrices must remain exactly frozen');}metrics.minimumVisible=Math.min(metrics.minimumVisible,roots.length);metrics.maximumVisible=Math.max(metrics.maximumVisible,roots.length);metrics.peakUnresolvedActorContacts=Math.max(metrics.peakUnresolvedActorContacts,view.stats.unresolvedActorContacts);
   finalMaxLag=0;for(const m of roots){if(acceptedContactPoses)metrics.drawnAcceptedSnapshotDifference=Math.max(metrics.drawnAcceptedSnapshotDifference,distance(m,acceptedContactPoses[m.index]));for(const b of [bounds[m.index]!,windowBounds[m.index]!]){b.minX=Math.min(b.minX,m.x);b.maxX=Math.max(b.maxX,m.x);b.minZ=Math.min(b.minZ,m.z);b.maxZ=Math.max(b.maxZ,m.z);}const r=context.state.townLife.residents[m.index],prior=lastRoots.get(m.index),lag=distance(m,r);finalMaxLag=Math.max(finalMaxLag,lag);metrics.maxLag=Math.max(metrics.maxLag,lag);peakLag[m.index]=Math.max(peakLag[m.index]!,lag);if(!paused){if(lag>3){if(!lagSeconds[m.index])lagStartedAt[m.index]=now-dt;lagSeconds[m.index]+=dt;lagPeak[m.index]=Math.max(lagPeak[m.index]!,lag);}else endLag(m.index);maxLagSeconds[m.index]=Math.max(maxLagSeconds[m.index]!,lagSeconds[m.index]!);}if(prior){const moved=distance(m,prior);rootDistances[m.index]+=moved;metrics.maxRootStep=Math.max(metrics.maxRootStep,moved);if(resumeAt!==null&&now-resumeAt<2)resumeMaxRootStep=Math.max(resumeMaxRootStep,moved);if(!townPathClear(view.population.plan,prior,m))metrics.unsafeVisibleChords++;
    if(!paused&&r.status==='traveling'){walkingSeconds[m.index]+=dt;windowTravel[m.index]+=dt;if(moved<.05*dt)stuckSeconds[m.index]+=dt;else endStuck(r);maxStuckSeconds[m.index]=Math.max(maxStuckSeconds[m.index]!,stuckSeconds[m.index]!);}else if(!paused)endStuck(r);
   }lastRoots.set(m.index,{x:m.x,z:m.z});}
   if(resumeAt!==null&&now-resumeAt<2)resumeMaxLag=Math.max(resumeMaxLag,finalMaxLag);
   if(burstEnd!==null&&now>=burstEnd+.25&&burstRecoverySeconds===null&&finalMaxLag<3)burstRecoverySeconds=now-burstEnd;
   if(frame%Math.max(1,Math.round((cadence==='jitter'?10:cadence)/4))===0&&now>2){for(let i=0;i<roots.length;i++){const a=roots[i]!,actorGap=distance(a,context.state.player);metrics.minVisibleActorGap=Math.min(metrics.minVisibleActorGap,actorGap);if(actorGap<PHYSICAL_ACTOR_GAP-2e-5){metrics.actorOverlapSamples++;if(now>15){metrics.settledActorOverlapSamples++;if(actorContacts.length<128)actorContacts.push({at:now,index:a.index,gap:actorGap,resident:{x:a.x,z:a.z},actor:{x:context.state.player.x,z:context.state.player.z},authority:{x:context.state.townLife.residents[a.index].x,z:context.state.townLife.residents[a.index].z}});}}for(let j=i+1;j<roots.length;j++){const gap=distance(a,roots[j]!);metrics.minVisibleBodyGap=Math.min(metrics.minVisibleBodyGap,gap);if(gap<PHYSICAL_PEER_GAP-2e-5){metrics.peerOverlapSamples++;if(now>15)metrics.settledPeerOverlapSamples++;}}}}
   if(now>=nextWindow){const stuck=Array.from({length:100},(_,i)=>i).filter(i=>windowTravel[i]!>=5&&span(windowBounds[i]!)<.5),walkers=windowBounds.filter(b=>span(b)>=.5).length,workers=[...windowWork].filter(v=>v>=1).length,inactive=Array.from({length:100},(_,i)=>i).filter(i=>span(windowBounds[i]!)<.5&&windowWork[i]!<1).length;progressWindows.push({at:now,walkers,workers,inactive,stuck});windowWork.fill(0);windowTravel.fill(0);for(const [i,b] of windowBounds.entries()){const p=lastRoots.get(i);b.minX=b.maxX=p?.x??Infinity;b.minZ=b.maxZ=p?.z??Infinity;}nextWindow+=15;options.onProgress?.({seconds:now,walkers,workers,inactive,stuck,maxLag:metrics.maxLag});}
  }
  // Capture outstanding already-produced packets; no synthetic extra ticks.
  flush(true);for(const r of context.state.townLife.residents){endStuck(r);endLag(r.index);}endPhysicsOverlap(physicsLastStep+1);
  for(const p of contactPackets)if(p.input&&p.output){if(p.wallTime>2&&p.input[0]?.authoritativeMotion!==1)metrics.nonAuthoritativeWorkerSamplesAfterWarmup++;for(let i=0;i<Math.min(p.input.length,p.output.length);i++){const delta=distance(p.input[i],p.output[i]);metrics.workerProjectionDifference=Math.max(metrics.workerProjectionDifference,delta);if(p.input[0]?.authoritativeMotion===1)metrics.workerAuthoritativeProjectionDifference=Math.max(metrics.workerAuthoritativeProjectionDifference,delta);}}
  const state=context.state as State,roundTrip=parseSave(serializeSave(state));assert.deepEqual(roundTrip,state,'final accepted world survives save/reload');
  const packet=lastContactPacket;const progressStalledResidentIds=initialLife.residents.filter(r=>progressWindows.some((w,n)=>n>0&&w.stuck.includes(r.index)&&progressWindows[n-1]!.stuck.includes(r.index))).map(r=>r.id);
  const hashesAfter=sourceHashes(),sourceChangedDuringRun=SOURCE_FILES.filter(file=>hashesBefore[file]!==hashesAfter[file]);
  const result={scope:MAIN_INTEGRATION_SCOPE,runtime:process.version,workerVersion,seed,cadence,fixture:options.fixture??'fresh',seconds,pausedSeconds,pauseSettlingSeconds,pauseSettlingRootDrift,resumeMaxRootStep,resumeMaxLag,actorWalk:options.actorWalk??false,playerTravelMetres:context.regionalTravel.metres,sourceHashes:hashesBefore,sourceChangedDuringRun,sourceHandlerLines:source.handler.split('\n').length,productionFrame:source.frame,initialCells,confirmedCells:context.regionalConfirmedObstacles.size,acks,receivedSnapshots,handledSnapshots,duplicateSnapshots,workerStep:lastProcessedStep,authoritySeconds:townLifeClock(state.townLife!)-initialTime,lifeChanges,renderFrames:view.stats.renderFrames,completedActions:metrics.completedActions,metrics,physicalActorGap:PHYSICAL_ACTOR_GAP,physicalPeerGap:PHYSICAL_PEER_GAP,actorContacts,physicsActorContacts,physicsMinActorGap,physicsOverlapSteps,maxPhysicsOverlapSeconds,finalMaxLag,burstEnd,burstRecoverySeconds,
   residentsWalkingMeaningfully:[...rootDistances].filter((v,i)=>v>=2&&span(bounds[i]!)>=1).length,residentsDoingMeaningfulTasks:[...meaningfulActionSeconds].filter(v=>v>=2).length,inactiveResidentIds:initialLife.residents.filter((_,i)=>(rootDistances[i]!<2||span(bounds[i]!)<1)&&meaningfulActionSeconds[i]!<2).map(r=>r.id),stuckResidentIds:initialLife.residents.filter((_,i)=>maxStuckSeconds[i]!>=5).map(r=>r.id),stuckEpisodes,lagEpisodes,progressStalledResidentIds,persistentLagResidentIds:initialLife.residents.filter((_,i)=>maxLagSeconds[i]!>=5).map(r=>r.id),progressWindows,
   residents:initialLife.residents.map((r,i)=>({index:i,id:r.id,rootMetres:rootDistances[i],visibleExcursionMetres:span(bounds[i]!),authorityMetres:authorityDistances[i],taskSeconds:meaningfulActionSeconds[i],walkingSeconds:walkingSeconds[i],maxStuckSeconds:maxStuckSeconds[i],maxLag:peakLag[i]})),workerContactSamples:contactPackets.length,lastContactPacketAuthoritative:!!packet?.townLifePoses?.every((p:any)=>p.authoritativeMotion===1),finalState:state};
  return result;
 }finally{stream.dispose();await worker?.dispose();view.dispose();}
}

export function assertTownMainIntegration(r:Awaited<ReturnType<typeof runTownMainIntegration>>){
 assert.deepEqual(r.sourceChangedDuringRun,[],'integration evidence requires unchanged production sources during the scenario');
 assert.equal(r.initialCells,9);assert(r.acks>0,'streaming must acknowledge actual post-start cells');assert(r.handledSnapshots>=r.seconds*55,'test must consume the worker cadence rather than one invented callback per render');assert(r.residentsWalkingMeaningfully>=80,'at least 80 residents must achieve two visible walking metres');assert.equal(r.inactiveResidentIds.length,0,'every resident must achieve visible walking or measured task progress');
 if(r.pausedSeconds){assert(r.pauseSettlingSeconds!==null&&r.pauseSettlingSeconds<=.5);assert(r.resumeMaxRootStep<.65,'resume cannot spend the paused interval as a root-motion burst');assert(r.resumeMaxLag<3,'resume must retain bounded presentation lag');assert(r.authoritySeconds<=r.seconds-r.pausedSeconds+.05,'paused wall time cannot become authority catch-up');}
 if(r.actorWalk)assert(r.playerTravelMetres>20,'real worker player must walk through the population');
 assert(r.lastContactPacketAuthoritative,'worker input must be the authoritative displayed poses');assert(r.metrics.authoritativeContactPackets>100,'sustained displayed contact packets');assert(r.metrics.candidateContactPacketDifference<.00001,'worker input uses the exact next contact candidate');assert(r.metrics.acknowledgedContactSnapshots>100,'actual worker acknowledges contact poses');assert(r.metrics.drawnAcceptedSnapshotDifference<.00003,'drawn resident roots match contact poses acknowledged with the current explorer snapshot');assert(r.metrics.workerAuthoritativeProjectionDifference<.00001,'physics worker must not solve already-drawn residents a second time');assert.equal(r.metrics.nonAuthoritativeWorkerSamplesAfterWarmup,0,'all live worker contact samples must retain one body authority after startup');
 assert.equal(r.metrics.settledPeerOverlapSamples,0,'resident capsules must separate after the retained-save migration window');assert.equal(r.metrics.settledActorOverlapSamples,0,'settled resident capsules must not intersect the authenticated explorer');
 assert.equal(r.metrics.taskProgressAwayFromStation,0,'task countdown must wait for physical admission to its current work point');
 assert.equal(r.metrics.completionBeforeAuthorityArrival,0,'authority cannot finish before arriving');assert.equal(r.metrics.completionBeforeVisibleArrival,0,'task must not finish while its visible resident is still en route');assert.equal(r.metrics.unsafeVisibleChords,0,'render paths cannot cross town walls');
 if(r.burstEnd===null)assert(r.metrics.maxLag<3,'steady live boundary must not exceed three metres lag');else {assert(r.burstRecoverySeconds!==null&&r.burstRecoverySeconds<5,'burst lag must recover within five active seconds');assert(r.finalMaxLag<3,'final replay must have caught up');}
 assert.equal(r.progressStalledResidentIds.length,0,'travelers cannot substitute confined oscillation for route progress across consecutive fifteen-second windows');assert.equal(r.persistentLagResidentIds.length,0,'no resident may remain over three metres behind for five seconds');assert.equal(r.stuckResidentIds.length,0,'travelers cannot remain visibly stuck for five seconds');assert(r.completedActions>=100,'sustained run must include meaningful completed work');return r;
}
