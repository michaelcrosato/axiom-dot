import {CONTACT_COURSE,CONTACT_GUIDE} from '../src/contact-course.ts';
import {WORKSHOP_CONSTRUCTION_VIEW_ENGINE} from '../src/workshop-construction-view.ts';
import {mainFunction,restorationInitialState} from './helpers/main-source.ts';
import {RestorationPractice,RESTORATION_PRACTICE_SPAWN} from '../src/restoration-practice.ts';
import {RESTORATION_VIEW_ENGINE} from '../src/restoration-view.ts';
import {TownMotionRecorder} from '../src/town-motion-diagnostics.ts';
import {STARTUP_TESTS} from '../src/startup.ts';
import {createPanelNavigation} from '../src/panel-navigation.ts';
import {resolveWildernessStrikes} from '../src/wilderness-combat.ts';
import * as contactModel from '../src/player-contact.ts';
import * as traversal from '../src/traversal-world.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {Worker} from 'node:worker_threads';
import * as THREE from 'three/webgpu';
import * as combat from '../src/combat.ts';
import * as lab from '../src/dev-lab.ts';
import * as tuning from '../src/tuning.ts';
import * as motion from '../src/locomotion.ts';
import * as gear from '../src/equipment.ts';
import * as gearCombat from '../src/equipment-combat.ts';
import * as world from '../src/world.ts';
import * as guards from '../src/guard.ts';
import * as guardView from '../src/guard-view.ts';
import * as guardResolution from '../src/guard-resolution.ts';
import * as controls from '../src/controls.ts';
import * as practice from '../src/live-sentry-practice.ts';
import * as trace from '../src/live-sentry-trace.ts';
import {createQuadruped} from '../src/creature-view.ts';
import {createVisualCapture} from '../src/visual-capture.ts';

// Execute the production handlers, with the real combat/controller/trace/rig modules.
// Only DOM/audio/render/storage surfaces are doubles. These tests certify no pixels.
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const functionSources=new Map<string,string>();
function fn(name:string){
 if(functionSources.has(name))return functionSources.get(name)!;
 const start=main.indexOf('function '+name+'(');assert(start>=0,`production function ${name}`);
 for(let end=main.indexOf('\n',start);end>=0;end=main.indexOf('\n',end+1)){
  const text=main.slice(start,end);
  try{new Function(stripTypeScriptTypes(text,{mode:'strip'}));functionSources.set(name,text);return text;}catch{}
 }
 throw new Error('Unterminated production function '+name);
}
const between=(a:string,b:string)=>{const from=main.indexOf(a),to=main.indexOf(b,from);assert(from>=0&&to>from,`production range ${a}`);return main.slice(from,to);};
const functions=['startContactPractice','clearRestorationPractice','startRestorationPractice','recordTownMotion','recordTownActivity','contactBusy','contactEnabled','contactSpawnY','contactWorldPacket','persist','sendPhysics','refreshHeldActions','sendMovement','clearInput','closePanel','focusGameplay','openPanel','currentEquipment','combatTuning','combatObstacles','nearbyPulseTargets','combatSnapshot','consumeCombat','wildernessImpact','attack','stepCombat','cancelLabEntry','requestLab','beginLab','resetLabCase','failLabRestore','exitLab','labInput','tickLab','interruptLab','startLabSuite','updateLabVisuals','renderDevPanel','equipLoadout','assembleLoadout','guardContext','consumeGuardEvents','guardForDisplay','cancelGuardInput','pressGuard','livePracticeText','presentLivePractice','pauseLivePractice','stopLivePractice','startLivePractice','tickLivePractice','captureLivePractice','exportLivePractice','sendLiveCommand'];

function harness(post?:(m:any)=>void){
 const messages:any[]=[],commands:any[]=[],results:any[]=[],audio:any[]=[],toasts:string[]=[],downloads:any[]=[],renderOrder:string[]=[],nodes=new Map<string,any>(),listeners=new Map<string,Function[]>(),timers=new Map<number,Function>();let writes=0;
 class HTMLElement{}
 const node=(tagName='div')=>Object.assign(new HTMLElement(),{tagName:tagName.toUpperCase(),id:'',hidden:false,textContent:'',innerHTML:'',style:{},dataset:{},value:'',checked:false,isConnected:true,focus(){document.activeElement=this;},append(){},setAttribute(name:string,value:string){this[name]=value;},querySelector(){return node();},querySelectorAll(){return [];},closest(selector:string){return selector.split(',').some(tag=>tag.trim()===this.tagName.toLowerCase())?this:null;},getClientRects(){return [1];}});
 const $=(id:string)=>{if(!nodes.has(id)){const tag=main.match(new RegExp('<(button|input|select|canvas)[^>]*id="'+id+'"'))?.[1]??'div';nodes.set(id,Object.assign(node(tag),{id}));}return nodes.get(id);};
 const slider={...node(),dataset:{tuning:'comboTempo'},value:'1.5'};
 const panel={...node(),hidden:true,dataset:{type:'dev'},querySelectorAll(selector:string){return selector==='[data-tuning]'?[slider]:[];}};
 const addEventListener=(name:string,cb:Function)=>listeners.set(name,[...(listeners.get(name)??[]),cb]);
 const document={hidden:false,hasFocus:()=>true,activeElement:null,documentElement:{classList:{add(){},remove(){},toggle(){}}},getElementById:$,createElement:node,addEventListener};
 const worker:any={postMessage(m:any){messages.push(structuredClone(m));post?.(m);},onmessage:null};
 const canvas=Object.assign(node('canvas'),{id:'world',width:640,height:360,hasPointerCapture:()=>false,releasePointerCapture(){}});
 const capture=createVisualCapture(canvas as any,{metadata:()=>({sourceRevision:'integration-test',seed:73129,backend:'numeric-only'}),makeCanvas:()=>({getContext:()=>null}) as any});
 const visualCapture={...capture,afterRender(sample:any){renderOrder.push('afterRender');return capture.afterRender(sample);}};
 const initial=world.enableWaterRequests(world.enableCommonsTrade(world.enableCaveSupply(world.enableEcology(world.enableEconomy(world.enableEncounters(world.createConnectedState(73129)))))));
 initial.player.hp=67;
 const source=`
 ${restorationInitialState(main)}${mainFunction(main,'acceptTownLifeSnapshot')} const now=0,rawFrameMs=1000/60,blocked=false,townMotion=new TownMotionRecorder(),townView=null;
 let contactRequestId=null,playerContact=emptyPlayerContact(),movableBodies=[];let state=initial,saveStatus='Original saved status',labEquipment,labActive=false,labEntering=false,labRunning=false,labTuning={...DEFAULT_TUNING},labWarmup=0,labTicks=0,lastLabStep=-1,labCaseIndex=0,labIteration=1,labIterations=3,labFrames=[],labMetrics=null,labReport=null,labTargets=[],captureTimer=0,restoreTimer=0,labCaptureToken=0,campaignCheckpoint=null,pendingLabRestore=null,combatHeading=.7;
 let wildernessProbeController=null,wildernessReport=null;function runWildernessLab(){throw Error('collision probes are not part of the sentry harness')}let livePractice=null,liveResumeRequested=false,liveRecording=null,livePracticeVisual=null,livePracticeEvents=[];const livePracticeSourceRevision='integration-test';
 let persistedSessionRevision=0,sessionReloading=false,sessionLoadFailed=false,transitioning=false,physicsReady=true,zoneEpoch=0,lastPhysicsStep=-1,labCaptureOnly=false,labUnlimitedStamina=true,labInfiniteTargets=true,labAutoCombo=true,regionalSupplyReport=null,regionalTradeReport=null,regionalFoodReport=null,systemsReport=null,reducedMotion=false;
 let animation={...idleAnimation(),airborne:true,vertical:3.4},physicsMotion={vx:1,vz:0,vy:3.4,landing:0,grounded:false,crouched:false,stance:0,sliding:false},combo={...createComboState(),stamina:63,cancelLockRemaining:.3},guard={...createGuardState(),cooldownRemaining:.8},avatarAction='gather',actionAge=.2,actionDuration=.55,orbit=1.25,zoom=31,impactHold=0,impactStrength=0,impactAge=0,pulseTime=0,machineSignature='',streamer={active:new Map()},guardVisualCancelled=false,guardSnapshotAt=0;
 let mapPanelDispose=null,generationPanelDispose=null,coopPanelDispose=null,equipmentPanelDispose=null,panelReturnFocus=null,coopPending=false,coopCancelAttack=-1,coopJumpHeld=false,windowActive=true,crouch=false,jump=false,heldCrouch=false,heldJump=false,inputMode='desktop',mobileAutoPulse=true;
 const history={state:null,pushState(value){this.state=value},replaceState(value){this.state=value},back(){this.state=null;panelNavigation.popped()}};
 const panelNavigation=createPanelNavigation(history,()=>closePanel(false));
 const coop={active:false,canAct:true,pendingGuardIntent:null,setSuspended(){},send(){throw Error('unexpected online action')},move(){throw Error('unexpected online move')}};
 const enemyHP=new Map([['campaign-sentry',44]]),recoil=new Map(),player={position:new THREE.Vector3(1,1.2,2)},targetPosition=new THREE.Vector3(1,1.3,2),cameraTarget=new THREE.Vector3(1,2,3),pulse={visible:false,position:new THREE.Vector3()},residentGroups=new Map(),pendingCells=new Map(),streamObjects=[],valleyObjects=[],cellPositions=[],valleyPlan=undefined,dungeon={walls:[]},obstacles=[],cellObstacles=new Map(),valleyRoot={visible:true},dungeonRoot={visible:false},caveRoot={visible:false},labRoot=new THREE.Group(),scene=new THREE.Scene(),camera={};
 let objects=[];const character={update(){},setEquipment(){}},strikeTrails=[],labTargetVisuals=new Map(),pointers=new GameplayPointers(),stick=pointers.stick,keys=new Set(),touchButtons={reset(){}},crouchHold={reset(){}},jumpHold={reset(){}};
 const renderer={render(){renderOrder.push('render')},getPixelRatio(){return 1}},backend='numeric-only',preset='frontier',navigator={maxTouchPoints:0},innerWidth=1280,innerHeight=720;
 const window={setTimeout(cb){const id=timers.size+1;timers.set(id,cb);return id;}};function clearTimeout(id){timers.delete(id)}
 const localStorage={getItem(){return JSON.stringify({version:1,tuning:{...DEFAULT_TUNING,comboTempo:1.5}})},setItem(){storageWrite()}};function storeSession(){storageWrite()}
 const gameAudio={cue(...args){audio.push(args)}},wildernessView={hit(){},debugEnabled:false,setDebug(value){this.debugEnabled=value}};
 function toast(message){toasts.push(message)}function resetLabTargets(){}function disposeCell(){}class CellStreamer{active=new Map()}
 function confirmCell(){return false}function initialCellPacket(){return {initialCells:[]}}function showZone(){}function syncFrontierVisuals(){}function sync(){}function syncMachine(){}function streamWorld(){}function syncCavePhysics(){}function resolvePhysics(){}function rejectPhysics(e){throw e}function updateBackend(){}function machineWorldObstacles(){return []}
 function worldHeight(){return 0}function worldBound(){return 80}function zoneObstacles(){return obstacles}function nearest(){return null}function interact(){throw Error('unexpected campaign interact')}function mat(){return null}
 function downloadJSON(value,name){downloads.push({name,value:structuredClone(value)})}
 function ensureSessionRevision(){return true}
 ${functions.map(fn).join('\n')}
 ${between('worker.onmessage=(e)=>','worker.onerror=')}
 ${between("addEventListener('keydown'","canvas.addEventListener('wheel'")}
 ${between("addEventListener('blur',()=>{pauseLivePractice('blur')",'type FrontierTarget=')}
 ${between("addEventListener('blur',()=>{cancelLabEntry();interruptLab('Window lost focus');});",'/** Menus pause combat')}
 return {requestLab,beginLab,exitLab,persist,startLivePractice,resetLabCase,startLabSuite,interruptLab,pauseLivePractice,stopLivePractice,closePanel,sendMovement,pressGuard,attack,tickLivePractice,presentLivePractice,sendLiveCommand,captureLivePractice,exportLivePractice,renderDevPanel,equipLoadout,assembleLoadout,openPanel,updateLabVisuals,
 init(){sendPhysics({type:'init',x:1,z:2,y:0,bound:80,obstacles:[]})},
 receive(m){worker.onmessage({data:m})},send(m){sendPhysics(m)},
 render(){${between('renderer.render(scene,camera);','\n',)}}
 ,read(){return {state,labActive,labEntering,labRunning,labReport,labTargets,campaignCheckpoint,pendingLabRestore,animation:structuredClone(animation),physicsMotion:structuredClone(physicsMotion),position:player.position.clone(),target:targetPosition.clone(),camera:cameraTarget.clone(),orbit,zoom,combo:structuredClone(combo),guard:structuredClone(guard),hp:new Map(enemyHP),saveStatus,zoneEpoch,lastPhysicsStep,transitioning,physicsReady,livePractice:livePractice?structuredClone(livePractice):null,liveRecording:liveRecording?structuredClone(liveRecording):null,liveResumeRequested,labTuning:structuredClone(labTuning),labEquipment,labUnlimitedStamina,labInfiniteTargets,labAutoCombo,events:structuredClone(livePracticeEvents),rig:livePracticeVisual,heading:combatHeading,avatarAction,actionAge,actionDuration}},
 set(options){if('coopActive' in options)coop.active=options.coopActive;if('coopPending' in options)coopPending=options.coopPending;if('heading' in options)combatHeading=options.heading;if('panelHidden' in options)panel.hidden=options.panelHidden;if('windowActive' in options)windowActive=options.windowActive;if('labEquipment' in options)labEquipment=options.labEquipment;if('labTuning' in options)labTuning={...labTuning,...options.labTuning};if('aids' in options){labUnlimitedStamina=options.aids;labInfiniteTargets=options.aids;labAutoCombo=options.aids}},
 cleanup(){livePracticeVisual?.dispose()}};`;
 const deps={CONTACT_COURSE,CONTACT_GUIDE,workshopProjection:new WORKSHOP_CONSTRUCTION_VIEW_ENGINE.Projection(),WORKSHOP_CONSTRUCTION_VIEW_ENGINE,RestorationPractice,RESTORATION_PRACTICE_SPAWN,RESTORATION_VIEW_ENGINE,TownMotionRecorder,STARTUP_TESTS,createPanelNavigation,resolveWildernessStrikes,...contactModel,...traversal,THREE,HTMLElement,...combat,...lab,...tuning,...motion,...gear,...gearCombat,...world,...guards,...guardView,...guardResolution,...controls,...practice,...trace,createQuadruped,initial,worker,$,panel,document,addEventListener,canvas,visualCapture,audio,toasts,downloads,renderOrder,timers,storageWrite:()=>writes++,appendLiveSentryTrace(recording:any,command:any){commands.push(structuredClone(command));const r=trace.appendLiveSentryTrace(recording,command);results.push(r.result);return r;}};
 const api=new Function(...Object.keys(deps),stripTypeScriptTypes('function body(){const activeConversation=null;function closeConversation(){}const startup={playing:true,initialized:true,failed:false,detail(){},fail(){},cleanup(){},report(){return String();},show(){}};'+source+'}',{mode:'strip'})+';return body();')(...Object.values(deps));
 return {api,messages,commands,results,audio,toasts,downloads,renderOrder,visualCapture,slider,$,document,panel,canvas,timers,get writes(){return writes;},emit(name:string,event:any={}){for(const cb of listeners.get(name)??[])cb(event)},key(code:string,repeat=false){this.emit('keydown',{code,repeat,target:node(),preventDefault(){}})},focusedKey(code:string){let prevented=false;const target=document.activeElement??node('body');this.emit('keydown',{code,repeat:false,target,preventDefault(){prevented=true}});return {prevented,target};}};
}

const ground={x:8,z:5.5,feetY:0,y:1.09,vx:0,vz:0,vy:0,grounded:true,crouched:false,stance:0,sliding:false};
function ready(h:any,step=0){h.api.receive({type:'ready',epoch:h.api.read().zoneEpoch,step});}
function snapshot(h:any,step:number,patch:any={}){h.api.receive({type:'snapshot',epoch:h.api.read().zoneEpoch,step,...ground,...patch});}
function enter(h:any,step=50){h.api.requestLab();const token=h.messages.findLast((m:any)=>m.type==='capture').requestId;h.api.receive({type:'captured',epoch:0,requestId:token,checkpoint:{...ground,motor:{vx:1,vz:0,slide:0,wasCrouched:false},coyote:0,landing:0,landingSpeed:0}});ready(h,step);h.api.startLivePractice();ready(h,step);snapshot(h,step+1);assert.equal(h.api.read().livePractice.status,'active');return step+1;}
function advance(h:any,n:number,patch:any={}){for(let i=0;i<n;i++)snapshot(h,h.api.read().lastPhysicsStep+1,patch);}

async function withWorker(body:(h:ReturnType<typeof harness>,io:any)=>Promise<void>){
 let w:Worker|undefined,h:ReturnType<typeof harness>|undefined;
 try{
  w=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);globalThis.setInterval=f=>{globalThis.tick=f};parentPort.on('message',async m=>{if(m.type==='advance'){for(let i=0;i<m.n;i++)tick();parentPort.postMessage({type:'done'})}else if(m.type==='barrier')parentPort.postMessage({type:'barrier'});else await self.onmessage({data:m})});import(${JSON.stringify(new URL('../src/physics.worker.ts',import.meta.url).href)}).then(()=>parentPort.postMessage({type:'boot'}))`,{eval:true,execArgv:['--experimental-strip-types']});
  const q:any[]=[];let error:any;h=harness(m=>w!.postMessage(m));w.on('error',e=>error=e);w.on('message',m=>{q.push(m);if(m.type==='error')error=new Error(m.message);if(m.type==='ready'||m.type==='captured'||m.type==='snapshot')try{h!.api.receive(m)}catch(e){error=e}});
  const take=async(type:string,predicate=(m:any)=>true)=>{const deadline=Date.now()+6000;while(true){if(error)throw error;const i=q.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return q.splice(i,1)[0];assert(Date.now()<deadline,`worker ${type} timeout`);await new Promise(r=>setTimeout(r,1));}};
  const advance=async(n=1)=>{w!.postMessage({type:'advance',n});await take('done');if(error)throw error};
  await take('boot');h.api.init();await take('ready');
  await body(h,{take,advance,async enter(){h!.api.requestLab();await take('captured');await take('ready',m=>m.epoch===h!.api.read().zoneEpoch);h!.api.startLivePractice();await take('ready',m=>m.epoch===h!.api.read().zoneEpoch);await advance();assert.equal(h!.api.read().livePractice.status,'active');}});
 }finally{h?.api.cleanup();await w?.terminate();}
}

test('main F/G handlers apply trace authority once and never run static aids or double-debit HP',()=>{
 const h=harness();try{enter(h);const bytes=world.serializeSave(h.api.read().state);h.api.set({aids:true});const before=h.commands.length;h.key('KeyF');h.key('KeyF',true);assert.equal(h.commands.length,before+1);assert.equal(h.commands.at(-1).type,'attack');assert.equal(h.api.read().livePractice.combo.stamina,86);assert.equal(h.api.read().combo.stamina,86);
  advance(h,35);const hits=h.results.flatMap(r=>r.comboEvents).filter(e=>e.type==='hit');assert.equal(hits.length,1);assert.equal(h.api.read().livePractice.encounters.enemies[0].hp,100-hits[0].damage);assert.equal(h.api.read().labTargets.length,0);assert(h.api.read().combo.stamina<100,'static unlimited stamina must not run');assert.equal(h.commands.filter(c=>c.type==='attack').length,1,'static auto chain must not run');assert.equal(h.audio.filter(([cue])=>cue==='staff-impact').length,1);
  while(h.api.read().livePractice.combo.phase!=='idle')advance(h,1);const n=h.commands.length,stamina=h.api.read().livePractice.combo.stamina;h.key('KeyG');h.key('KeyG',true);assert.equal(h.commands.length,n+1);assert.equal(h.commands.at(-1).type,'guard');assert.equal(h.api.read().livePractice.combo.stamina,stamina-22);assert.equal(world.serializeSave(h.api.read().state),bytes);assert.equal(h.api.persist(),false);assert.equal(h.writes,0);
  h.api.exportLivePractice();const exported=h.downloads.at(-1).value;assert.equal(exported.sourceRevision,'integration-test');assert(trace.replayLiveSentryTrace(exported.trace).matchesPrefixFinal);assert.deepEqual(exported.currentSnapshot,practice.liveSentrySnapshot(h.api.read().livePractice));assert.equal('campaignCheckpoint' in exported,false);
 }finally{h.api.cleanup()}
});

test('main worker gate rejects stale/duplicate frames, pauses gaps, and requires honest resume',()=>{
 const h=harness();try{let step=enter(h,700);advance(h,5);const before=h.api.read(),count=h.commands.length;step=before.lastPhysicsStep;
  snapshot(h,step);snapshot(h,step+100,{epoch:before.zoneEpoch-1});assert.deepEqual(h.api.read().livePractice,before.livePractice);assert.equal(h.commands.length,count);
  snapshot(h,step+4);assert.equal(h.api.read().livePractice.status,'paused');assert.equal(h.api.read().livePractice.pause,'snapshot-gap');assert.equal(h.api.read().livePractice.tick,before.livePractice.tick);h.api.closePanel();advance(h,3);assert.equal(h.api.read().livePractice.status,'paused','closing a gap notification must not silently arm');
  h.api.renderDevPanel();h.$('lab-live-resume').onclick();advance(h,1);assert.equal(h.api.read().livePractice.status,'active');assert.equal(h.api.read().livePractice.tick,before.livePractice.tick);advance(h,1);assert.equal(h.api.read().livePractice.tick,before.livePractice.tick+1);
  h.api.openPanel('dev');const paused=h.api.read().livePractice;assert.equal(paused.pause,'menu');h.api.closePanel();advance(h,1);assert.equal(h.api.read().livePractice.status,'active');assert.equal(h.api.read().livePractice.tick,paused.tick);
  h.emit('blur');const blur=h.api.read().livePractice;assert.equal(blur.pause,'blur');assert.equal(h.messages.at(-1).paused,true);h.emit('focus');h.api.sendMovement();advance(h,4);assert.deepEqual(h.api.read().livePractice,blur);h.api.closePanel();advance(h,1);assert.equal(h.api.read().livePractice.status,'paused');h.api.renderDevPanel();h.$('lab-live-resume').onclick();advance(h,1);assert.equal(h.api.read().livePractice.status,'active');assert.equal(h.api.read().livePractice.tick,blur.tick);
 }finally{h.api.cleanup()}
});

test('main live entry rejects co-op active/pending; exit and suite permanently retire their recorder',()=>{
 for(const flag of ['coopActive','coopPending']){const h=harness();try{h.api.set({[flag]:true});h.api.requestLab();assert.equal(h.messages.length,0);assert.equal(h.api.read().labActive,false);h.api.set({[flag]:false});enter(h);h.api.set({[flag]:true});const epoch=h.api.read().zoneEpoch;h.api.startLivePractice();assert.equal(h.api.read().zoneEpoch,epoch);advance(h,1);assert.equal(h.api.read().livePractice,null);assert.equal(h.api.read().liveRecording.state.status,'disabled');}finally{h.api.cleanup()}}
 for(const action of ['suite','course','exit']){const h=harness();try{enter(h);const old=h.api.read(),late=h.results.at(-1);h.api.renderDevPanel();const staleResume=h.$('lab-live-resume').onclick,staleReset=h.$('lab-live-reset').onclick;
  if(action==='suite')h.api.startLabSuite();else if(action==='course')h.api.resetLabCase();else h.api.exitLab();const after=h.api.read();assert.equal(after.livePractice,null);assert.equal(after.liveRecording.state.status,'disabled');assert.equal(after.liveRecording.state.disabledBy,action==='exit'?'exit':'suite');assert.equal(after.rig.root.visible,false);assert.equal(after.liveResumeRequested,false);
  h.api.presentLivePractice(late);h.api.tickLivePractice({...ground,step:900});snapshot(h,900,{epoch:old.zoneEpoch});staleResume();if(action==='exit')staleReset();assert.equal(h.api.read().livePractice,null);assert.equal(h.api.read().zoneEpoch,after.zoneEpoch);
  if(action==='suite'){assert.equal(after.labRunning,true);assert.equal(after.labEquipment,undefined);assert.equal(lab.LAB_CASES.length,9);assert.equal(after.labReport.runs.length,0);assert(Object.values(after.labReport.manual).every(x=>x==='not-reviewed'));}assert.equal(h.writes,0);
 }finally{h.api.cleanup()}}
});

test('main latches loadout/tuning and requires explicit fresh-epoch reset after death or defeat',()=>{
 const h=harness();try{enter(h);h.api.stopLivePractice('suite');assert.match(h.api.equipLoadout(321),/loadout changed/);h.api.renderDevPanel();h.slider.oninput();h.api.startLivePractice();ready(h,100);snapshot(h,101);const old=h.api.read(),latched=structuredClone(old.livePractice.tuning);const equipped=gearCombat.equipmentCombat(gear.equipmentFor(old.labEquipment));assert.deepEqual(latched.attacks.map(a=>a.damage),equipped.attacks.map(a=>a.damage));assert.equal(latched.attacks[0].prep,equipped.attacks[0].prep*old.labTuning.comboTempo);h.api.renderDevPanel();assert.match(h.api.equipLoadout(321),/Stop live practice/);assert.match(h.api.assembleLoadout({}),/Stop live practice/);h.slider.oninput();h.$('lab-defaults').onclick();h.$('lab-load-preset').onclick();assert.deepEqual(h.api.read().livePractice.tuning,latched);assert.deepEqual(h.api.read().labTuning,old.labTuning);assert.equal(h.api.read().labEquipment,old.labEquipment);
  // Let real production enemy contacts kill the disposable suit. No direct HP edits.
  for(let i=0;i<2500&&h.api.read().livePractice.status==='active';i++)advance(h,1);
  const dead=h.api.read();assert.equal(dead.livePractice.status,'dead');assert.equal(dead.livePractice.hp,0);assert.equal(dead.state.player.hp,67);const deathTick=dead.livePractice.tick;h.key('KeyF');h.key('KeyG');h.api.closePanel();advance(h,20);assert.equal(h.api.read().livePractice.status,'dead');assert.equal(h.api.read().livePractice.tick,deathTick);assert.equal(h.api.read().livePractice.combo.phase,'idle');
  h.api.renderDevPanel();h.$('lab-live-reset').onclick();const reset=h.api.read();assert(reset.zoneEpoch>dead.zoneEpoch);assert.equal(reset.livePractice.status,'ready');assert.equal(reset.livePractice.hp,100);assert.equal(reset.livePractice.encounters.enemies[0].hp,100);assert.equal(reset.livePractice.combo.stamina,100);assert.equal(reset.livePractice.guard.cooldownRemaining,0);assert.equal(reset.liveRecording.trace.commands.length,0);snapshot(h,10000,{epoch:dead.zoneEpoch});assert.equal(h.api.read().livePractice.status,'ready');ready(h,3000);snapshot(h,3001);assert.equal(h.api.read().livePractice.status,'active');assert.equal(h.api.read().livePractice.tick,0);assert.equal(h.writes,0);
 }finally{h.api.cleanup()}
});

test('main capture observes render immediately before afterRender, exact case/tick metadata and cancellation; no image evidence',()=>{
 const h=harness();try{enter(h);advance(h,8);const start=h.api.read().livePractice;h.api.openPanel('dev');h.api.captureLivePractice();assert.equal(h.visualCapture.report().scenario,'live-sentry');assert.equal(h.visualCapture.report().metadata.sourceRevision,'integration-test');assert.equal(h.visualCapture.report().visualReview,'not-reviewed');advance(h,1);advance(h,1);h.api.updateLabVisuals(1/60);h.api.render();assert.deepEqual(h.renderOrder,['render','afterRender']);const record=h.visualCapture.report().entries[0];assert.equal(record.requestedTick,start.tick+1);assert.equal(record.actualTick,start.tick+1);assert.equal(record.status,'failed','a fake canvas is deliberately unable to supply image evidence');assert.equal(record.details.seed,73129);assert.equal(record.details.epoch,start.epoch);assert.equal(record.details.hp,h.api.read().livePractice.hp);assert.equal(record.details.enemyHP,h.api.read().livePractice.encounters.enemies[0].hp);assert.equal(record.details.guard,h.api.read().livePractice.guard.phase);assert.equal(record.details.combo,h.api.read().livePractice.combo.phase);
  const rig=h.api.read().rig,enemy=h.api.read().livePractice.encounters.enemies[0];rig.root.updateMatrixWorld(true);assert.deepEqual(rig.root.position.toArray(),[enemy.x,enemy.y,enemy.z]);assert.equal(rig.root.rotation.y,enemy.heading);const bounds=new THREE.Box3().setFromObject(rig.root);assert([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite));
  h.emit('resize');assert.equal(h.visualCapture.report().status,'interrupted');assert(h.visualCapture.report().entries.some(e=>e.status==='missed'));assert.equal(h.visualCapture.report().visualReview,'not-reviewed');const frozen=h.api.read().livePractice;h.api.render();assert.deepEqual(h.api.read().livePractice,frozen,'presentation never advances authority');
 }finally{h.api.cleanup()}
});

test('production worker plus actual main G blocks one timed front contact with one cost', {timeout:20000},async()=>{
 await withWorker(async(h,io)=>{
  await io.enter();for(let i=0;i<160;i++){const p=h.api.read().livePractice,e=p.encounters.enemies[0];if(e.phase==='prepare'&&e.remaining<=.20)break;await io.advance();}
  const before=h.api.read().livePractice;assert.equal(before.encounters.enemies[0].phase,'prepare');assert(before.encounters.enemies[0].remaining<=.20);const commands=h.commands.length;h.key('KeyG');assert.equal(h.commands.length,commands+1);assert.equal(h.api.read().livePractice.combo.stamina,before.combo.stamina-22);await io.advance(20);
  const p=h.api.read().livePractice,contacts=h.results.flatMap(r=>r.contacts);assert.equal(p.hp,100);assert.equal(contacts.length,1);assert.equal(contacts[0].blocked,true);assert.equal(contacts[0].damage,0);assert.equal(h.audio.filter(([cue])=>cue==='guard-block').length,1);assert.equal(h.audio.filter(([cue])=>cue==='hurt').length,0);assert.equal(p.guard.lastBlock.id,1);assert.equal(p.encounters.enemies[0].hitIds.length,1);assert.equal(h.writes,0);
  h.api.exportLivePractice();assert(trace.replayLiveSentryTrace(h.downloads.at(-1).value.trace).matchesPrefixFinal);
 });
});

test('production worker plus actual main F completes a costed three-hit chain and freezes defeat until reset', {timeout:20000},async()=>{
 await withWorker(async(h,io)=>{
  await io.enter();h.api.set({aids:true});h.key('KeyF');
  for(let i=0;i<300&&h.api.read().livePractice.status==='active';i++){
   const p=h.api.read().livePractice;if(!p.combo.buffered&&combat.comboBufferOpen(p.combo,p.tuning))h.key('KeyF');await io.advance();
  }
  const finished=h.api.read(),hits=h.results.flatMap(r=>r.comboEvents).filter(e=>e.type==='hit');assert.equal(finished.livePractice.status,'defeated');assert.deepEqual(hits.map(e=>e.stage),[1,2,3]);assert.equal(new Set(hits.map(e=>e.attackId)).size,3);assert.deepEqual(hits.map(e=>e.damage),finished.livePractice.tuning.attacks.map(a=>a.damage));assert.equal(hits.reduce((n,e)=>n+e.damage,0),104);assert.equal(finished.livePractice.encounters.enemies[0].hp,0);assert(finished.livePractice.combo.stamina<100);assert.equal(h.audio.filter(([cue])=>cue==='staff-impact').length,3);assert.equal(finished.state.player.hp,67);assert.equal(finished.labTargets.length,0);
  const tick=finished.livePractice.tick;h.key('KeyF');h.key('KeyG');h.api.closePanel();await io.advance(12);assert.equal(h.api.read().livePractice.status,'defeated');assert.equal(h.api.read().livePractice.tick,tick);h.api.renderDevPanel();h.$('lab-live-reset').onclick();await io.take('ready',m=>m.epoch===h.api.read().zoneEpoch);await io.advance();assert.equal(h.api.read().livePractice.status,'active');assert.equal(h.api.read().livePractice.encounters.enemies[0].hp,100);assert.equal(h.api.read().livePractice.combo.stamina,100);assert.equal(h.api.read().livePractice.tick,0);assert(h.api.read().zoneEpoch>finished.zoneEpoch);assert.equal(h.writes,0);
 });
});

test('production main/worker lab roundtrip restores campaign bytes, HP, combo, guard, camera and actual airborne checkpoint with zero writes',{timeout:20000},async()=>{
 await withWorker(async(h,io)=>{
  h.api.send({type:'input',x:0,z:0,jump:true,paused:false});await io.advance(5);const before=h.api.read();assert.equal(before.physicsMotion.grounded,false);assert(before.target.y>0);
  h.api.requestLab();const captured=await io.take('captured');await io.take('ready',m=>m.epoch===h.api.read().zoneEpoch);const checkpoint=h.api.read().campaignCheckpoint,bytes=checkpoint.bytes;assert.equal(checkpoint.physics.grounded,false);assert(checkpoint.physics.feetY>0);assert(checkpoint.physics.vy>0);
  h.api.startLivePractice();await io.take('ready',m=>m.epoch===h.api.read().zoneEpoch);await io.advance();h.key('KeyF');await io.advance(40);assert.equal(h.api.persist(),false);assert.equal(h.writes,0);assert.equal(world.serializeSave(h.api.read().state),bytes);
  h.api.exitLab();const restored=h.api.read();assert.equal(restored.labActive,false);assert.equal(restored.state,checkpoint.state);assert.equal(world.serializeSave(restored.state),bytes);assert.equal(restored.state.player.hp,before.state.player.hp);for(const [key,saved]of [['combo',checkpoint.combo],['guard',checkpoint.guard],['position',checkpoint.position],['target',checkpoint.target],['camera',checkpoint.camera],['animation',checkpoint.animation],['physicsMotion',checkpoint.motion],['hp',checkpoint.hp]])assert.deepEqual(restored[key],saved,`restored ${key}`);for(const key of ['orbit','zoom','saveStatus','actionAge','actionDuration'])assert.equal(restored[key],checkpoint[key],`restored ${key}`);assert.equal(restored.avatarAction,checkpoint.action);assert.equal(restored.heading,checkpoint.heading);
  await io.take('ready',m=>m.epoch===h.api.read().zoneEpoch);const acknowledged=await io.take('captured',m=>typeof m.requestId==='string'&&m.requestId.startsWith('lab-restore-'));assert(lab.matchingPose(acknowledged.checkpoint,captured.checkpoint));assert.equal(h.api.read().pendingLabRestore,null);assert.equal(h.api.read().transitioning,false);assert.equal(h.writes,0);assert.equal(h.api.read().livePractice,null);
 });
});

test('main diagnostic export retains a bounded replayable prefix while authority continues',()=>{
 const h=harness();try{const step=enter(h);const epoch=h.api.read().zoneEpoch;
  for(let i=1;i<=3700;i++)h.api.receive({type:'snapshot',epoch,step:step+i,...ground,x:-10,z:-10});
  h.api.exportLivePractice();const {name,value}=h.downloads.at(-1),replay=trace.replayLiveSentryTrace(value.trace);assert.equal(name,'axiom-live-sentry-trace.json');assert.equal(value.trace.commands.length,3600);assert.equal(value.trace.truncated,true);assert.equal(value.trace.truncationReason,'entry-limit');assert.equal(value.trace.droppedEntries,101);assert(replay.matchesPrefixFinal);assert.equal(value.currentSnapshot.tick,3700);assert.equal(value.trace.prefixFinal.tick,3599);assert.equal(replay.snapshot.tick,3599);assert(Buffer.byteLength(JSON.stringify(value))<1024*1024);assert.equal('state' in value,false);assert.equal('campaignCheckpoint' in value,false);assert.equal('inventory' in value,false);assert.equal(h.writes,0);
 }finally{h.api.cleanup()}
});

test('malformed main worker step pauses without replaying unseen ticks and reset rejects the old epoch',()=>{
 const h=harness();try{enter(h);advance(h,3);const before=h.api.read();snapshot(h,undefined as any);const paused=h.api.read();assert.equal(paused.livePractice.status,'paused');assert.equal(paused.livePractice.pause,'invalid-frame');assert.equal(paused.livePractice.tick,before.livePractice.tick);assert.deepEqual(paused.livePractice.encounters,before.livePractice.encounters);assert.equal(paused.liveResumeRequested,false);h.api.sendMovement();assert.equal(h.messages.at(-1).paused,true);
  h.api.startLivePractice();const epoch=h.api.read().zoneEpoch;snapshot(h,888,{epoch:before.zoneEpoch});assert.equal(h.api.read().livePractice.epoch,epoch);assert.equal(h.api.read().livePractice.status,'ready');ready(h,888);snapshot(h,889);assert.equal(h.api.read().livePractice.status,'active');assert.equal(h.api.read().livePractice.tick,0);
 }finally{h.api.cleanup()}
});

test('actual live-to-suite switch completes all original nine production-worker cases without live authority contamination',{timeout:30000},async()=>{
 await withWorker(async(h,io)=>{
  await io.enter();h.key('KeyG');await io.advance(12);h.$('lab-iterations').value='1';h.api.startLabSuite();const disabled=h.api.read().liveRecording;assert.equal(disabled.state.status,'disabled');assert.equal(disabled.state.disabledBy,'suite');await io.take('ready',m=>m.epoch===h.api.read().zoneEpoch);
  for(let i=0;i<10000&&h.api.read().labRunning;i+=40)await io.advance(40);
  const final=h.api.read();assert.equal(final.labReport.status,'completed');assert.equal(final.labReport.runs.length,9);assert.deepEqual(final.labReport.runs.map(r=>r.caseId),lab.LAB_CASES.map(c=>c.id));assert.deepEqual(final.labReport.runs.flatMap(r=>r.checks.filter(c=>!c.pass)),[]);assert.equal(final.livePractice,null);assert.deepEqual(final.liveRecording,disabled);assert.equal(final.labUnlimitedStamina,false);assert.equal(final.labInfiniteTargets,false);assert.equal(final.labEquipment,undefined);assert(Object.values(final.labReport.manual).every(v=>v==='not-reviewed'));assert.equal(h.writes,0);
 });
});

test('actual main live authority agrees under immediate and forty-frame production-worker delivery',{timeout:20000},async()=>{
 const run=async(batch:number)=>{let answer:any;await withWorker(async(h,io)=>{await io.enter();for(let i=0;i<120;i+=batch)await io.advance(Math.min(batch,120-i));const s=h.api.read();answer={snapshot:practice.liveSentrySnapshot(s.livePractice),events:s.events,commands:h.commands,audio:h.audio};assert.equal(h.writes,0)});return answer};
 assert.deepEqual(await run(1),await run(40));
});

test('actual menu/close handlers retire paid staff buffers and guard interception without refunding costs or cooldown',()=>{
 const h=harness();try{enter(h);h.key('KeyF');advance(h,15);h.key('KeyF');assert.equal(h.api.read().livePractice.combo.buffered,true);const paid=h.api.read().livePractice;h.api.openPanel('dev');const paused=h.api.read().livePractice;assert.equal(paused.status,'paused');assert.equal(paused.combo.phase,'idle');assert.equal(paused.combo.buffered,false);assert.equal(paused.combo.stamina,paid.combo.stamina);assert(paused.combo.cancelLockRemaining>0);assert.deepEqual(paused.encounters,paid.encounters);h.api.closePanel();advance(h,1);const armed=h.api.read().livePractice;assert.equal(armed.tick,paid.tick);assert.equal(armed.combo.stamina,paid.combo.stamina);assert.equal(armed.combo.cancelLockRemaining,paused.combo.cancelLockRemaining);h.key('KeyF');assert.equal(h.api.read().livePractice.combo.phase,'idle');assert.equal(h.results.at(-1).accepted,false);
  h.api.startLivePractice();ready(h,400);snapshot(h,401);h.key('KeyG');const cast=h.api.read().livePractice;assert.equal(cast.combo.stamina,78);h.api.openPanel('dev');assert.equal(h.api.read().livePractice.guard.phase,'idle');assert.equal(h.api.read().livePractice.combo.stamina,78);assert.equal(h.api.read().livePractice.guard.cooldownRemaining,cast.guard.cooldownRemaining);h.api.closePanel();advance(h,1);h.key('KeyG');assert.equal(h.results.at(-1).accepted,false);assert.equal(h.results.at(-1).reason,'cooldown');assert.equal(h.api.read().livePractice.combo.stamina,78);assert.equal(h.writes,0);
 }finally{h.api.cleanup()}
});

for(const transition of ['Start','Resume','Capture'] as const)test(`explicit live ${transition} returns keyboard focus to gameplay so immediate Space reaches actual jump input`,()=>{
 const h=harness();try{
  enter(h);if(transition==='Start')h.api.stopLivePractice('suite');
  const opener=h.$('lab-tools');assert.equal(opener.tagName,'BUTTON');opener.focus();h.api.openPanel('dev');
  const control=h.$(transition==='Start'?'lab-live-reset':transition==='Resume'?'lab-live-resume':'lab-live-capture');control.focus();control.onclick();
  if(transition==='Start')ready(h,200);
  h.api.sendMovement();snapshot(h,h.api.read().lastPhysicsStep+1);
  const result=h.focusedKey('Space');
  assert.equal(result.prevented,true,`${transition}: Space should jump, not retain native activation on ${result.target.id||result.target.tagName}`);
  const canvasMarkup=main.match(/<canvas\b[^>]*id="world"[^>]*>/)?.[0]??'';assert(/tabindex=["']-?\d+["']/.test(canvasMarkup)||/canvas\.tabIndex\s*=\s*-?\d+/.test(main),'The world canvas must be programmatically focusable in production, not only in this DOM double');
  assert.equal(h.messages.at(-1).jump,true);assert.equal(h.messages.at(-1).paused,false);assert.equal(h.document.activeElement,h.canvas);assert.equal(h.panel.hidden,true);assert.equal(h.writes,0);
 }finally{h.api.cleanup()}
});

test('generic modal Close restores opener focus and preserves native button/input keyboard handling',()=>{
 const h=harness();try{
  enter(h);const opener=h.$('lab-tools');opener.focus();h.api.openPanel('dev');h.api.closePanel();assert.equal(h.document.activeElement,opener);
  const messages=h.messages.length,commands=h.commands.length;
  assert.equal(h.focusedKey('Space').prevented,false);assert.equal(h.focusedKey('Enter').prevented,false);assert.equal(h.messages.length,messages);assert.equal(h.commands.length,commands);
  const input=h.$('lab-stamina');assert.equal(input.tagName,'INPUT');input.focus();assert.equal(h.focusedKey('Space').prevented,false);h.focusedKey('KeyF');h.focusedKey('KeyG');assert.equal(h.messages.length,messages);assert.equal(h.commands.length,commands);
 }finally{h.api.cleanup()}
});

test('developer drafts require Apply, discard/reset are reversible, and actual sandbox settings never write campaign slots',()=>{
 const h=harness();try{enter(h);h.api.stopLivePractice('suite');h.api.renderDevPanel();const before=world.serializeSave(h.api.read().state),initial=h.api.read().labTuning;
  h.slider.value='1.5';h.slider.oninput();assert.deepEqual(h.api.read().labTuning,initial,'sliding edits only a draft');
  h.$('lab-cancel-draft').onclick();h.$('lab-apply').onclick();assert.deepEqual(h.api.read().labTuning,initial);
  h.slider.value='1.5';h.slider.oninput();h.$('lab-apply').onclick();assert.equal(h.api.read().labTuning.comboTempo,1.5);assert.equal(h.messages.at(-1).type,'tuning');
  h.$('lab-defaults').onclick();assert.equal(h.api.read().labTuning.comboTempo,1.5,'reset remains staged');h.$('lab-apply').onclick();assert.deepEqual(h.api.read().labTuning,tuning.DEFAULT_TUNING);
  h.$('lab-apply').onclick();h.$('lab-apply').onclick();assert.equal(world.serializeSave(h.api.read().state),before);assert.equal(h.writes,0);
 }finally{h.api.cleanup()}
});

test('developer preset import stages validated values, quick sentry setups retain scenario, and co-op blocks apply',()=>{
 const h=harness();try{enter(h);h.api.stopLivePractice('suite');h.api.renderDevPanel();const before=world.serializeSave(h.api.read().state);
  h.$('lab-quick-preset').onchange({target:{value:'gentler'}});assert.equal(h.api.read().labTuning.enemyDamage,1);h.$('lab-apply').onclick();assert.equal(h.api.read().labTuning.enemyDamage,.5);
  h.$('lab-preset-export').onclick();const exported=JSON.parse(h.$('lab-portable').value);assert.equal(exported.scenario,'live-sentry');assert.equal(exported.tuning.enemyDamage,.5);
  h.$('lab-portable').value=JSON.stringify({...exported,tuning:{...exported.tuning,enemyDamage:2}});h.$('lab-import-preset').onclick();assert.equal(h.api.read().labTuning.enemyDamage,.5);h.$('lab-apply').onclick();assert.equal(h.api.read().labTuning.enemyDamage,2);
  h.$('lab-portable').value=JSON.stringify({...exported,roomToken:'must-reject'});h.$('lab-import-preset').onclick();assert.match(h.$('lab-portable-status').textContent,/Unsupported/);h.$('lab-apply').onclick();assert.equal(h.api.read().labTuning.enemyDamage,2);
  h.api.set({coopActive:true});h.$('lab-quick-preset').onchange({target:{value:'gentler'}});h.$('lab-apply').onclick();assert.equal(h.api.read().labTuning.enemyDamage,2);assert.equal(world.serializeSave(h.api.read().state),before);assert.equal(h.writes,0);
 }finally{h.api.cleanup()}
});

test('station selection does not relabel the running arena until explicit practice reset',()=>{
 const h=harness();try{enter(h);h.api.stopLivePractice('suite');h.api.renderDevPanel();h.$('lab-case').value='2';h.$('lab-case').onchange();
  h.$('lab-feedback-export').onclick();let feedback=JSON.parse(h.$('lab-portable').value);assert.equal(feedback.runningScenario,'run-brake');
  h.$('lab-practice').onclick();h.api.renderDevPanel();h.$('lab-feedback-export').onclick();feedback=JSON.parse(h.$('lab-portable').value);assert.equal(feedback.runningScenario,'jump');assert.equal(feedback.preset.scenario,'jump');
 }finally{h.api.cleanup()}
});

test('pending preset file reads cannot replace Discard, newer edits, repeated imports, or a closed panel',async()=>{
 for(const action of ['discard','edit','closed','new-file']){const h=harness();try{enter(h);h.api.stopLivePractice('suite');h.api.openPanel('dev');const p=lab.createLabPreset(73129,'live-sentry',{...tuning.DEFAULT_TUNING,enemyDamage:2},'test');let resolve!:(s:string)=>void;
  h.$('lab-preset-file').files=[{size:2000,text:()=>new Promise<string>(r=>resolve=r)}];const pending=h.$('lab-preset-file').onchange();
  if(action==='discard')h.$('lab-cancel-draft').onclick();
  if(action==='edit'){h.slider.value='1.5';h.slider.oninput();}
  if(action==='closed')h.api.closePanel();
  if(action==='new-file')h.$('lab-preset-file').files=[{size:2,text:async()=>'{}'}];
  resolve(JSON.stringify(p));await pending;
  if(action==='closed')h.api.openPanel('dev');h.$('lab-apply').onclick();assert.equal(h.api.read().labTuning.enemyDamage,1,action+' invalidates late import');assert.equal(h.writes,0);
 }finally{h.api.cleanup()}}
});

test('choosing a preset file clears the picker so the same discarded file can be selected again',async()=>{
 const h=harness();try{enter(h);h.api.stopLivePractice('suite');h.api.openPanel('dev');const input=h.$('lab-preset-file');let clicks=0;input.click=()=>clicks++;input.value='same-preset.json';h.$('lab-import-file').onclick();assert.equal(input.value,'');assert.equal(clicks,1);
  h.$('lab-cancel-draft').onclick();input.value='same-preset.json';h.$('lab-import-file').onclick();assert.equal(input.value,'');assert.equal(clicks,2);
  const preset=lab.createLabPreset(73129,'live-sentry',{...tuning.DEFAULT_TUNING,enemyDamage:.5},'test');input.files=[{size:2000,text:async()=>JSON.stringify(preset)}];await input.onchange();h.$('lab-apply').onclick();assert.equal(h.api.read().labTuning.enemyDamage,.5);
 }finally{h.api.cleanup()}
});
