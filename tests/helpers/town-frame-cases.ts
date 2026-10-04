/** Portable helper intended for tests/helpers/town-frame-cases.ts.
 * No test execution, file writes, browser, GPU, real worker timers or network.
 * The injected view may be the source or actual emitted Three factory.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTownView} from '../../src/town-view.ts';
import {townLifePoses,townLifeClock,townFrameSeconds} from '../../src/town-life-runtime.ts';
import {createTownLife,immutableTownLife} from '../../src/town-life.ts';
import {townPathClear} from '../../src/town-crowd.ts';
import {TOWN_CENTER,TOWN_SPAWN} from '../../src/starting-town.ts';
import {createRegionalState,enableStartingTown,serializeSave,parseSave,applyAction,type State} from '../../src/world.ts';

export const TEMPORAL_SCOPE='CPU/source-level actual Three instance matrices and production saved-world ticks. Controlled callback/packet schedules; no browser, GPU pixels, actual worker timers or device certification. Wall safety is the emitted root endpoint chord, not all possible missing route segments.';
export const TEMPORAL_CADENCES={fps15:[1/15],fps10:[.1],fps5:[.2],variable:[1/15,.1,.2,.04,.08,.017,.12],gap500:[1/30],gap1000:[1/30],gap2000:[1/30],gap5000:[1/30]} as const;
export type TemporalCadence=keyof typeof TEMPORAL_CADENCES;
const gaps:Partial<Record<TemporalCadence,number>>={gap500:.5,gap1000:1,gap2000:2,gap5000:5};
const packetJitter=[0,.04,.09,.02,.12,.06] as const;
export type TownFrameFactory=typeof createTownView;
export type TownFrameSeconds=(rawFrameMs:number)=>number;
export interface TemporalOptions {cadence?:TemporalCadence;online?:boolean;seconds?:number;fixture?:'15'|'150'|'175';seed?:number;initialState?:State;mainSource?:string;omitAcceptedHistory?:boolean}

export function frames(name:TemporalCadence,seconds=12):{now:number;dt:number}[]{
 const list=[{now:0,dt:0}];let now=0,n=0,gapUsed=false;
 while(now<seconds-1e-8){const cadence=TEMPORAL_CADENCES[name];let dt:number=cadence[n++%cadence.length]!;
  if(gaps[name]&&!gapUsed&&now>=4-1e-8){dt=gaps[name]!;gapUsed=true;}
  dt=Math.min(dt,seconds-now);now+=dt;list.push({now,dt});
 }return list;
}

/** Extract actual first-party main expressions. Called explicitly, never on import. */
export function mainFrameContract(source=readFileSync(new URL('../../src/main.ts',import.meta.url),'utf8')){
 const gameplayExpression=source.match(/const dt=([^;]+);last=now;if\(labRunning/)?.[1];
 const callerExpression=source.match(/syncFrontierVisuals\((coop\.active.*?)\);syncContactProps\(\);/)?.[1];
 const playingExpression=source.match(/const playing=([^;]+);if\(playing&&combo/)?.[1];
 const tickExpression=source.match(/state=applyAction\(state,\{type:'tick',dt:([^}]+)\}/)?.[1];
 assert(gameplayExpression&&callerExpression&&playingExpression&&tickExpression,'actual main frame/snapshot expressions must remain inspectable');
 const gameplay=new Function('rawFrameMs',`return (${gameplayExpression});`) as (raw:number)=>number;
 const caller=new Function('rawFrameMs','dt','blocked','coop','document','windowActive','townFrameSeconds',`return (${callerExpression});`) as (raw:number,dt:number,blocked:boolean,coop:{active:boolean;snapshot?:{paused:boolean;closed:boolean}},document:{hidden:boolean},windowActive:boolean,helper:TownFrameSeconds)=>number;
 const playing=new Function('startup','simulated','activeConversation','panel','document','windowActive',`return (${playingExpression});`) as (startup:{playing:boolean},simulated:boolean,conversation:unknown,panel:{hidden:boolean},document:{hidden:boolean},active:boolean)=>boolean;
 const tickSeconds=new Function(`return (${tickExpression});`)() as number;
 return {gameplayExpression,callerExpression,playingExpression,tickExpression,tickSeconds,
  delta(raw:number,helper:TownFrameSeconds,options:{blocked?:boolean;online?:boolean;hidden?:boolean;active?:boolean;roomPaused?:boolean;roomClosed?:boolean}={}){return caller(raw,gameplay(raw),options.blocked??false,{active:options.online??false,snapshot:{paused:options.roomPaused??false,closed:options.roomClosed??false}},{hidden:options.hidden??false},options.active??true,helper);},
  playing(stepChanged:boolean,paused=false){return playing({playing:true},stepChanged,null,{hidden:!paused},{hidden:false},true);}
 };
}

/** Validates the real main caller, preserving solo pause and online menu behavior. */
export function assertMainFrameContract(helper:TownFrameSeconds=townFrameSeconds,source?:string){
 const contract=mainFrameContract(source);assert.match(contract.callerExpression,/townFrameSeconds\(rawFrameMs\)/);assert.equal(contract.tickSeconds,1/60);
 for(const hz of [15,10,5]){const raw=1000/hz;assert.equal(contract.delta(raw,helper),helper(raw));assert.equal(contract.delta(raw,helper,{blocked:true}),0);assert.equal(contract.delta(raw,helper,{blocked:true,online:true}),helper(raw));assert.equal(contract.delta(raw,helper,{blocked:true,online:true,hidden:true}),0);assert.equal(contract.delta(raw,helper,{blocked:true,online:true,active:false}),0);}
 assert.equal(contract.delta(100,helper,{online:true,roomPaused:true}),0);assert.equal(contract.delta(100,helper,{online:true,roomClosed:true}),0);
 assert.equal(contract.playing(false),false);assert.equal(contract.playing(true,true),false);assert.equal(contract.playing(true),true);
 return {gameplayExpression:contract.gameplayExpression,callerExpression:contract.callerExpression,playingExpression:contract.playingExpression,tickExpression:contract.tickExpression};
}

export function steadyCase(factory:TownFrameFactory=createTownView,frameSeconds:TownFrameSeconds=townFrameSeconds,options:TemporalOptions={}){
 const name=options.cadence??'fps10',online=options.online??false,seed=options.seed??73129;
 // Synthetic ideal motion deliberately uses the unowned compatibility path;
 // worldCase and real-worker integration retain actual owned authority inputs.
 const view=factory(seed),start={x:TOWN_CENTER.x-12,z:TOWN_CENTER.z+10},base=townLifePoses(createTownLife(seed))!.map(({authoritativeMotion,contactResolved,motionPath,...pose})=>pose),timings=frames(name,options.seconds??8);
 const inputAt=(t:number)=>{const s=Math.floor((t+1e-8)*2)/2,p=base.map(p=>({...p}));p[0]={...p[0]!,...start,x:start.x+s*1.8,facing:Math.PI/2,speed:1.8,moving:true,distance:s*1.8};return p;};
 const packets:{at:number;time:number;input:ReturnType<typeof inputAt>}[]=[];let packetNumber=0,lastInput=base,lastAuthority=0,last=start,maxLag=0,maxStep=0,maxGapStep=0,unsafeChords=0,reservePrimedAt:number|null=null;
 const speeds:number[]=[],settledSpeeds:number[]=[];let weightedDistance=0,weightedSeconds=0;
 try{for(let frame=0;frame<timings.length;frame++){const {now,dt}=timings[frame]!;
  if(online){while(packetNumber*.25<=now+1e-8){const t=packetNumber*.25;packets.push({at:t+packetJitter[packetNumber%packetJitter.length]!,time:t,input:inputAt(t)});packetNumber++;}while(packets.length&&packets[0]!.at<=now+1e-8){const p=packets.shift()!;lastInput=p.input;lastAuthority=p.time;}}
  else{lastInput=inputAt(now);lastAuthority=now;}
  view.update(lastAuthority,TOWN_CENTER,()=>true,true,undefined,!frame,frame?frameSeconds(dt*1000):0,[],online,lastInput);
  if(reservePrimedAt===null&&view.stats.lifeBufferSeconds>.50001)reservePrimedAt=now;
  const m=view.matrixEvidence().find(m=>m.index===0)!;assert(m,'resident zero must be emitted');const p={x:m.x,z:m.z},step=Math.hypot(p.x-last.x,p.z-last.z);
  maxLag=Math.max(maxLag,Math.hypot(p.x-lastInput[0]!.x,p.z-lastInput[0]!.z));
  if(frame){maxStep=Math.max(maxStep,step);if(dt>=.5)maxGapStep=Math.max(maxGapStep,step);if(!townPathClear(view.population.plan,last,p))unsafeChords++;
   if(now>2&&dt<.5){speeds.push(step/dt);weightedDistance+=step;weightedSeconds+=dt;}
   if(now>Math.max(2,(reservePrimedAt??0)+1)&&dt<.5)settledSpeeds.push(step/dt);
  }last=p;
 }
 return {cadence:name,online,minSpeed:Math.min(...speeds),maxSpeed:Math.max(...speeds),meanSpeed:speeds.reduce((a,b)=>a+b,0)/speeds.length,weightedMeanSpeed:weightedDistance/weightedSeconds,reservePrimedAt,settledMinSpeed:Math.min(...settledSpeeds),settledMaxSpeed:Math.max(...settledSpeeds),maxLag,maxStep,maxGapStep,unsafeChords,frameCount:timings.length};
 }finally{view.dispose();}
}

/** Real world + retained fixture + save reload. Callback playing and fixed dt
 * are extracted from main; actual browser/worker transport is not executed. */
export function worldCase(factory:TownFrameFactory=createTownView,frameSeconds:TownFrameSeconds=townFrameSeconds,options:TemporalOptions={}){
 const name=options.cadence??'fps10',online=options.online??false,seed=options.seed??73129,fixture=options.fixture??'150',contract=mainFrameContract(options.mainSource);
 let state=options.initialState;
 if(!state){const cold=createRegionalState(seed),life=immutableTownLife(JSON.parse(readFileSync(new URL(`../fixtures/town-motion-v11/${fixture}.json`,import.meta.url),'utf8')),seed);state=enableStartingTown({...cold,townLife:life});state={...state,player:{...state.player,...TOWN_SPAWN}};}
 const bytes=serializeSave(state),reloaded=parseSave(bytes);assert(reloaded);assert.deepEqual(reloaded,state);state=reloaded;
 const view=factory(seed),actor={id:'solo',x:state.player.x,z:state.player.z,feetY:6},timings=frames(name,options.seconds??(name==='gap5000'?20:12));
 const packets:{at:number;life:NonNullable<State['townLife']>}[]=[];
 let steps=0,lastStep=-1,accepted=0,packetNo=0,input=townLifePoses(state.townLife),authority=townLifeClock(state.townLife!),maxLag=0,maxGapStep=0,unsafeChords=0,maxFrame=0;
 const last=new Map<number,{x:number;z:number}>(),initialTick=state.townLife!.tick,initialTime=townLifeClock(state.townLife!),peakLag=new Map<number,number>();
 let gapEnd:number|null=null,recoveredAt:number|null=null,finalMaxLag=0,lagAfterGap:number|null=null;
 function callback(step:number,paused=false){const changed=step!==lastStep;lastStep=step;if(contract.playing(changed,paused)){state=applyAction(state!,{type:'tick',dt:contract.tickSeconds},[{x:state!.player.x,y:6,z:state!.player.z}],state!.player);accepted++;if(!online&&!options.omitAcceptedHistory)view.acceptLife(townLifeClock(state.townLife!),townLifePoses(state.townLife));}}
 try{for(let frame=0;frame<timings.length;frame++){const {now,dt}=timings[frame]!;
  while(steps<Math.floor((now+1e-8)*60)){steps++;callback(steps);if(online&&steps%15===0){packetNo++;packets.push({at:steps/60+packetJitter[packetNo%packetJitter.length]!,life:state.townLife!});}}
  if(online){while(packets.length&&packets[0]!.at<=now+1e-8){const p=packets.shift()!;input=townLifePoses(p.life);authority=townLifeClock(p.life);if(!options.omitAcceptedHistory)view.acceptLife(authority,input);}}
  else{input=townLifePoses(state.townLife);authority=townLifeClock(state.townLife!);}
  // Execute the actual main caller expression with the injected helper.
  const delta=frame?contract.delta(dt*1000,frameSeconds,{online}):0;
  view.update(authority,state.player,()=>true,true,undefined,!frame,delta,[actor],online,input);
  finalMaxLag=0;for(const m of view.matrixEvidence()){const r=state.townLife!.residents[m.index]!,lag=Math.hypot(m.x-r.x,m.z-r.z);finalMaxLag=Math.max(finalMaxLag,lag);maxLag=Math.max(maxLag,lag);peakLag.set(m.index,Math.max(peakLag.get(m.index)??0,lag));const p=last.get(m.index);if(p){const moved=Math.hypot(m.x-p.x,m.z-p.z);maxFrame=Math.max(maxFrame,moved);if(dt>=.5)maxGapStep=Math.max(maxGapStep,moved);if(!townPathClear(view.population.plan,p,m))unsafeChords++;}last.set(m.index,m);}
  if(dt>=.5){gapEnd=now;lagAfterGap=finalMaxLag;}if(gapEnd!==null&&recoveredAt===null&&finalMaxLag<3)recoveredAt=now;
 }
 const finalClock=townLifeClock(state.townLife!),tickDelta=state.townLife!.tick-initialTick;
 const pauseBytes=serializeSave(state),hashes=view.matrixEvidence().map(m=>m.matrixHash);
 for(let f=0;f<5;f++){callback(lastStep+1,true);view.update(authority,state.player,()=>true,true,undefined,false,0,[actor],online,input);}
 const pauseFrozen=JSON.stringify(hashes)===JSON.stringify(view.matrixEvidence().map(m=>m.matrixHash));assert.equal(serializeSave(state),pauseBytes);
 const beforeDuplicate=state;callback(lastStep);const duplicateIgnored=state===beforeDuplicate;
 return {cadence:name,fixture,online,authorityTicks:tickDelta,authoritySeconds:finalClock-initialTime,acceptedSnapshots:accepted,maxLag,finalMaxLag,lagAfterGap,gapRecoverySeconds:gapEnd!==null&&recoveredAt!==null?recoveredAt-gapEnd:null,residentsEverBeyond3m:[...peakLag.values()].filter(l=>l>3).length,maxFrame,maxGapStep,unsafeChords,pauseFrozen,duplicateIgnored,frameCount:timings.length};
 }finally{view.dispose();}
}

/** Explicit reusable assertions, unchanged from the external diagnosed bounds. */
export function assertSteadyCase(result:ReturnType<typeof steadyCase>){
 assert.equal(result.unsafeChords,0);assert(result.maxLag<3);
 if(['fps15','fps10','fps5','variable'].includes(result.cadence)){
  // An online endpoint underrun may prime the bounded reserve once. Assert the
  // recorded steady regime after priming, while retaining the initial metrics.
  assert(result.settledMinSpeed>1.79);assert(result.settledMaxSpeed<1.81);
 }
 return result;
}
export function assertWorldCase(result:ReturnType<typeof worldCase>){
 assert(result.pauseFrozen);assert(result.duplicateIgnored);assert.equal(result.unsafeChords,0);
 if(result.cadence.startsWith('gap')){assert(result.maxGapStep<2);assert(result.finalMaxLag<3);assert.notEqual(result.gapRecoverySeconds,null);}
 else assert(result.maxLag<3);
 return result;
}
