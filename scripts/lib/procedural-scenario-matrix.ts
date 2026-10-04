import {setImmediate as yieldTurn} from 'node:timers/promises';
import {WorkbenchSession,DEFAULT_WORKBENCH_CONFIG,WORKBENCH_STEP,parseWorkbenchReport,replayWorkbench,type WorkbenchConfig,type WorkbenchReport,type WorkbenchSnapshot} from '../../src/system-workbench-model.ts';
import type {RegionalFoodFarm} from '../../src/regional-food.ts';
import type {RegionalSupplyOutpost} from '../../src/regional-supply.ts';
import type {RegionalTradeRouteState} from '../../src/regional-trade.ts';

export const MATRIX_VERSION=1;
export interface MatrixCase {id:string;system:'settlement'|'food';rainfall:'legacy'|'regional';travel:'legacy'|'regional';seconds:number;assistEveryTicks:number;assistOffsetTicks:number;resumeTick?:number;irrigation?:'canister'}
export const MATRIX_CASES:readonly MatrixCase[]=Object.freeze([
 ...(['legacy','regional'] as const).flatMap(rainfall=>(['legacy','regional'] as const).map(travel=>({id:`settlement-${rainfall}-${travel}`,system:'settlement' as const,rainfall,travel,seconds:3600,assistEveryTicks:4,assistOffsetTicks:0}))),
 {id:'settlement-delayed-start',system:'settlement',rainfall:'regional',travel:'regional',seconds:3600,assistEveryTicks:4,assistOffsetTicks:960},
 {id:'settlement-quarter-staggered',system:'settlement',rainfall:'regional',travel:'regional',seconds:3600,assistEveryTicks:29,assistOffsetTicks:3},
 {id:'settlement-interrupted-resume',system:'settlement',rainfall:'regional',travel:'regional',seconds:3600,assistEveryTicks:4,assistOffsetTicks:0,resumeTick:1733},
 {id:'food-earned-canister',system:'food',rainfall:'regional',travel:'legacy',seconds:400,assistEveryTicks:0,assistOffsetTicks:0,irrigation:'canister'},
]);
function ensure(condition:unknown,message:string):asserts condition {if(!condition)throw Error(message);}
/** Fixed boundary anchors plus a specified 32-bit LCG. No Math.random. */
export function sampledSeeds(count=20,sampleSeed=0xa7102026):number[]{
 ensure(Number.isInteger(count)&&count>=1&&count<=128,'Seed count must be 1–128');ensure(Number.isInteger(sampleSeed)&&sampleSeed>=0&&sampleSeed<=0xffffffff,'Sample seed must be uint32');
 const seeds=[73129,0,1,42,0xffffffff,0x80000000].slice(0,count);let n=sampleSeed>>>0;
 while(seeds.length<count){n=(Math.imul(n,1664525)+1013904223)>>>0;if(!seeds.includes(n))seeds.push(n);}return seeds;
}
export interface MatrixJob {id:string;seed:number;scenario:MatrixCase;seconds:number}
export function planMatrix(seeds:number[],caseIds:string[]=MATRIX_CASES.map(c=>c.id),coverage:'sampled'|'cartesian'='sampled',seconds?:number):MatrixJob[]{
 ensure(seeds.length>=1&&seeds.length<=128&&new Set(seeds).size===seeds.length&&seeds.every(s=>Number.isInteger(s)&&s>=0&&s<=0xffffffff),'Choose 1–128 distinct uint32 seeds');
 ensure(coverage==='sampled'||coverage==='cartesian','Coverage must be sampled or cartesian');
 ensure(caseIds.length>0&&new Set(caseIds).size===caseIds.length&&caseIds.every(id=>MATRIX_CASES.some(c=>c.id===id)),'Choose distinct known case IDs');
 ensure(seconds===undefined||(Number.isFinite(seconds)&&seconds>=0&&seconds<=3600&&Number.isInteger(seconds/WORKBENCH_STEP)),'Seconds must be 0–3600 in quarter-second increments');
 const cases=caseIds.map(id=>MATRIX_CASES.find(c=>c.id===id)!),baselines=cases.filter(c=>c.id===`settlement-${c.rainfall}-${c.travel}`),rotate=baselines.length?baselines:cases;
 // Reference seed gets every case; other seeds rotate through selected baselines.
 return seeds.flatMap((seed,i)=>(coverage==='cartesian'||i===0?cases:[rotate[(i-1)%rotate.length]!]).map(scenario=>({id:`v${MATRIX_VERSION}-${scenario.id}-s${seed}-t${Math.round(Math.min(seconds??scenario.seconds,scenario.seconds)/WORKBENCH_STEP)}`,seed,scenario,seconds:Math.min(seconds??scenario.seconds,scenario.seconds)})));
}
export interface ObservedTime {lastUnobservedSeconds:number;firstObservedSeconds:number}
export interface MatrixResult {
 id:string;seed:number;caseId:string;status:'passed'|'failed'|'incomplete';reason:string|null;scenarioSeconds:number;requestedSeconds:number;setupActiveSeconds:number;scenarioTimelineSecondsExecuted:number;prerequisiteTimelineSecondsExecuted:number;wallMilliseconds:number;
 outcome:string;finalFingerprint:string|null;maxSampledBalanceError:number;sampleCount:number;reloads:{tick:number;pass:boolean}[];replay:{checked:boolean;match:boolean|null;firstDifference:string|null};resume:{tick:number;match:boolean}|null;
 milestones:Record<string,ObservedTime>;weatherPhases:string[];freightConditions:string[];dryShortage:boolean;recoveryAfterDryShortage:boolean;finalInventory:Record<string,number>;causes:WorkbenchSnapshot['causes'];footprint:ReturnType<WorkbenchSession['storageFootprint']>|null;artifacts:string[];artifactErrors:string[];
}
export interface MatrixRunOptions {revision?:string;deadline?:number;stop?:()=>string|null;artifact?:(name:string,report:WorkbenchReport)=>void;now?:()=>number;yield?:()=>Promise<unknown>}
class Incomplete extends Error {}
/** Current session + optional control + bounded journals; no external saves. */
export async function runMatrixCase(job:MatrixJob,options:MatrixRunOptions={}):Promise<MatrixResult>{
 const now=options.now??(()=>performance.now()),began=now(),revision=options.revision??'not-recorded';
 const result:MatrixResult={id:job.id,seed:job.seed,caseId:job.scenario.id,status:'incomplete',reason:null,scenarioSeconds:0,requestedSeconds:job.seconds,setupActiveSeconds:0,scenarioTimelineSecondsExecuted:0,prerequisiteTimelineSecondsExecuted:0,wallMilliseconds:0,outcome:'not-started',finalFingerprint:null,maxSampledBalanceError:0,sampleCount:0,reloads:[],replay:{checked:false,match:null,firstDifference:null},resume:null,milestones:{},weatherPhases:[],freightConditions:[],dryShortage:false,recoveryAfterDryShortage:false,finalInventory:{},causes:undefined,footprint:null,artifacts:[],artifactErrors:[]};
 let session:WorkbenchSession|undefined,control:WorkbenchSession|undefined,previous:WorkbenchSnapshot|undefined,lastReport:WorkbenchReport|undefined;
 const budget=()=>{const stopped=options.stop?.();if(stopped)throw new Incomplete(stopped);if(options.deadline!==undefined&&now()>=options.deadline)throw new Incomplete('Wall-time budget reached; remaining validation was not run');};
 const artifact=(suffix:string,report:WorkbenchReport)=>{if(!options.artifact)return;const name=job.id+suffix;try{options.artifact(name,report);result.artifacts.push(name);}catch(error){const message=`Could not write ${name}: ${error instanceof Error?error.message:String(error)}`;result.artifactErrors.push(message);throw Error(message);}};
 const observe=(snap:WorkbenchSnapshot)=>{
  result.sampleCount++;result.scenarioSeconds=snap.seconds;result.finalFingerprint=snap.fingerprint;result.finalInventory=snap.inventory;result.causes=snap.causes;
  result.maxSampledBalanceError=Math.max(result.maxSampledBalanceError,...snap.checks.map(c=>c.error).filter(Number.isFinite));
  ensure(!snap.firstFailure,`Production conservation failed at tick ${snap.firstFailure?.tick}`);ensure(snap.checks.every(c=>c.pass&&Number.isFinite(c.error)),'A sampled conservation check failed');ensure(Object.values(snap.inventory).every(v=>Number.isFinite(v)&&v>=-1e-5),'Negative or nonfinite inventory');
  for(const actor of snap.actors)ensure(Object.values(actor.position).every(Number.isFinite),'Nonfinite actor position');
  if(snap.weather&&!result.weatherPhases.includes(snap.weather.phase))result.weatherPhases.push(snap.weather.phase);
  for(const road of snap.freight??[]){if(!result.freightConditions.includes(road.travelCondition))result.freightConditions.push(road.travelCondition);ensure(road.travelSpeed>0&&road.travelSpeed<=1.8&&road.roadWetness>=0&&road.roadWetness<=1,'Freight condition exceeds production bounds');if(road.etaKind==='repair-required')ensure(road.etaSeconds===null,'Blocked road invents arrival estimate');}
  const seen=(key:string,condition:boolean)=>{if(condition&&!result.milestones[key])result.milestones[key]={lastUnobservedSeconds:previous?.seconds??0,firstObservedSeconds:snap.seconds};};
  if(job.scenario.system==='settlement'){
   const {trade,collector:o,farm:f}=snap.ledger as {trade:RegionalTradeRouteState[];collector:RegionalSupplyOutpost;farm:RegionalFoodFarm};
   for(const [i,r]of trade.entries()){seen(`route${i}Blocked`,r.activity==='blocked');seen(`route${i}Delivered`,r.delivered>0);seen(`route${i}StoreBuilt`,r.builtAt!==null);}
   seen('collectorBuilt',o.builtAt!==null);seen('farmStarted',f.startedAt!==null);seen('firstRainCapture',o.captured>0);seen('firstDrink',o.consumed>0);seen('firstOverflow',o.spilled>0);seen('firstHarvest',f.harvested>0);seen('firstDeliveredFood',f.delivered>0);seen('firstHarvestedMeal',f.meals>f.starterGranted);
   if(o.builtAt!==null&&snap.weather?.intensity===0&&o.water<1&&o.residents.some(r=>r.thirst>=45&&r.carrying===0))result.dryShortage=true;
   if(result.dryShortage&&previous&&o.captured>previous.inventory.rainCaptured!&&snap.weather!.intensity>0){result.recoveryAfterDryShortage=true;seen('rainRecoveryAfterShortage',true);}
  }else{
   const f=snap.ledger as RegionalFoodFarm;seen('firstPlanting',f.seedsSown>0);seen('firstHarvest',f.harvested>0);seen('firstDeliveredFood',f.delivered>0);seen('firstHarvestedMeal',f.meals>f.starterGranted);
   ensure(snap.irrigation!.canisters+snap.irrigation!.importedLitres/4===1,'Earned canister not conserved');
   if(control){const untreated=control.snapshot();ensure(JSON.stringify(snap.weather)===JSON.stringify(untreated.weather),'Irrigation altered weather');ensure(f.sourceSpilled===(untreated.ledger as RegionalFoodFarm).sourceSpilled,'Irrigation altered collector overflow source');ensure(untreated.irrigation!.canisters===1&&untreated.irrigation!.importedLitres===0,'Control spent a canister');ensure(untreated.checks.every(c=>c.pass),'Control conservation failed');}
  }
  previous=snap;
 };
 const reload=()=>{const before=session!.digest(),pass=session!.verifyReload().pass===true;result.reloads.push({tick:session!.tick,pass});ensure(pass&&session!.digest()===before,'Strict save/reload changed state');};
 try{
  budget();const c=job.scenario,config:WorkbenchConfig={...DEFAULT_WORKBENCH_CONFIG,seed:job.seed,system:c.system,index:0,...(c.rainfall==='regional'?{rainfall:'regional'}:{}),...(c.travel==='regional'?{travel:'regional'}:{}),...(c.irrigation?{irrigation:c.irrigation}:{})};
  session=new WorkbenchSession(config,revision);result.setupActiveSeconds=session.setupSeconds;result.prerequisiteTimelineSecondsExecuted+=session.setupSeconds;observe(session.snapshot());lastReport=session.report();budget();
  if(c.system==='settlement')ensure(session.setupSeconds===0&&session.snapshot().inventory.productionStarterMeals===0,'Integrated scenario did not start empty at zero');
  if(c.irrigation){control=new WorkbenchSession(config,revision);result.prerequisiteTimelineSecondsExecuted+=control.setupSeconds;ensure(session.snapshot().irrigation!.canisters===1,'Fixture did not earn its canister');session.assist();ensure(session.snapshot().irrigation!.canisters===1,'Assist spent optional canister');ensure(session.action('irrigate-farm'),'Manual canister action rejected');const after=session.digest();ensure(!session.action('irrigate-farm')&&session.digest()===after,'Repeated canister changed state');observe(session.snapshot());}
  const end=job.seconds/WORKBENCH_STEP,reloadAt=2401;let resumed=false;
  while(session.tick<end){
   budget();const tick=session.tick;if(c.assistEveryTicks>0&&tick>=c.assistOffsetTicks&&(tick-c.assistOffsetTicks)%c.assistEveryTicks===0)session.assist();
   let step=Math.min(4,end-tick);if(c.assistEveryTicks>0){const until=tick<c.assistOffsetTicks?c.assistOffsetTicks-tick:c.assistEveryTicks-((tick-c.assistOffsetTicks)%c.assistEveryTicks);step=Math.min(step,until);}
   for(const boundary of [reloadAt,c.resumeTick??-1])if(boundary>tick)step=Math.min(step,boundary-tick);
   control?.advance(step);const snap=session.advance(step);result.scenarioTimelineSecondsExecuted+=step*WORKBENCH_STEP*(control?2:1);ensure(session.tick>tick,'Production stopped early');observe(snap);
   if(session.tick===reloadAt)reload();
   if(c.resumeTick===session.tick&&!resumed){budget();const prefix=session.report(),restored=replayWorkbench(parseWorkbenchReport(JSON.stringify(prefix)),revision);result.scenarioTimelineSecondsExecuted+=prefix.finalTick*WORKBENCH_STEP;result.prerequisiteTimelineSecondsExecuted+=restored.session.setupSeconds;result.resume={tick:session.tick,match:restored.result.match};ensure(restored.result.match&&restored.session.digest()===session.digest(),'Interrupted report differs: '+restored.result.firstDifference);session=restored.session;resumed=true;reload();}
   if(session.tick%240===0){lastReport=session.report();await (options.yield??yieldTurn)();}
  }
  budget();reload();result.footprint=session.storageFootprint();const expected=session.report();lastReport=expected;artifact('.replay.json',expected);budget();
  const replay=replayWorkbench(parseWorkbenchReport(JSON.stringify(expected)),revision);result.scenarioTimelineSecondsExecuted+=expected.finalTick*WORKBENCH_STEP;result.prerequisiteTimelineSecondsExecuted+=replay.session.setupSeconds;result.replay={checked:true,match:replay.result.match,firstDifference:replay.result.firstDifference};
  if(!replay.result.match){artifact('.actual-replay.json',replay.result.report);throw Error('Exact replay differs: '+replay.result.firstDifference);}ensure(replay.session.digest()===session.digest(),'Final replay fingerprint changed');
  if(job.seed===73129&&job.seconds===3600&&c.id==='settlement-regional-regional')ensure(result.dryShortage&&result.recoveryAfterDryShortage&&result.finalInventory.harvestedMealsMinimum!>0,'Reference drought/recovery or harvested-meal regression');
  if(control){artifact('.control.replay.json',control.report());ensure(session.snapshot().irrigation!.canisters===0&&session.snapshot().irrigation!.importedLitres===4,'Canister transfer missing');if(job.seed===73129&&job.seconds===400)ensure(result.finalInventory.harvested===8&&control.snapshot().inventory.harvested===0,'Reference dry-canister treatment/control regression');}
  // Replay/save validation is synchronous and can overrun a cooperative budget.
  // Admit completion only at the final boundary; never label an overrun a pass.
  await (options.yield??yieldTurn)();budget();result.status='passed';
 }catch(error){result.status=error instanceof Incomplete?'incomplete':'failed';result.reason=error instanceof Error?error.message:String(error);try{lastReport=session?.report()??lastReport;}catch{}if(lastReport)try{artifact(result.status==='failed'?'.failure.replay.json':'.partial.replay.json',lastReport);}catch{result.status='failed';result.reason+='; failure/partial artifact could not be saved';}}
 if(session){try{const snap=session.snapshot();result.finalInventory=snap.inventory;result.finalFingerprint=snap.fingerprint;result.scenarioSeconds=snap.seconds;result.causes=snap.causes;const starter=snap.inventory.productionStarterMeals??snap.inventory.starter??0,meals=snap.inventory.meals??0;result.outcome=meals>starter?'harvested-meals-observed':(snap.inventory.harvested??0)>0?'harvest-without-proven-meal':starter>0?'starter-only-within-window':'prerequisites-pending-within-window';}catch{}}
 result.wallMilliseconds=now()-began;return result;
}
