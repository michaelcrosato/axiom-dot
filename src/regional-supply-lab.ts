import {createRegionalState,applyAction,commitWildernessGather,wildernessGatherContext,worldBound,enableRegionalSupply,parseSave,serializeSave,validateSave,type State} from './world.ts';
import {regionalFeaturesNear,regionalPlan} from './regional-world.ts';
import {regionalSupplyPlan,regionalSupplyAvailable,regionalSupplySpent,regionalSupplyProjectBoxes,regionalSupplyObstacles,regionalSupplyActorPoses,advanceRegionalSupply,type RegionalSupplyState} from './regional-supply.ts';
import {canGatherWilderness} from './wilderness-state.ts';
import {wildernessObstaclesNear,type WildernessFeature} from './wilderness.ts';
import {wildernessCapsuleClearance} from './wilderness-lab.ts';

export interface RegionalSupplyLabCheck {name:string;expected:string;actual:string;pass:boolean}
export interface RegionalSupplyLabReport {
 version:1;seed:number;iterations:number;sourceRevision:string;
 scope:string;status:'complete'|'interrupted';runs:RegionalSupplyLabRun[];error?:string;
}
export interface RegionalSupplyLabRun {
 iteration:number;checks:RegionalSupplyLabCheck[];
 metrics:Record<string,number|string|boolean|string[]>;
}
export interface RegionalSupplyGatherReceipt {id:string;kind:'tree'|'rock';x:number;z:number;feetY:number;minimumBodyClearance:number;duplicateRejected:boolean}
/** Disposable model fixture: real canonical IDs, physical reach/ground/occlusion rules,
 * and an explicitly clear standing capsule. The approach moves are model poses,
 * not a claim that the player controller walked the route. */
export function gatherRegionalSupplyMaterials(initial:State,near:{x:number;z:number},cost:{wood:number;stone:number}){
 let state=initial;const receipts:RegionalSupplyGatherReceipt[]=[];
 if(!state.regional||!Number.isInteger(cost.wood)||!Number.isInteger(cost.stone)||cost.wood<0||cost.stone<0||cost.wood+cost.stone>128)throw new Error('Invalid bounded regional gathering fixture');
 const features=regionalFeaturesNear(state.seed,near.x,near.z,2).filter(f=>f.harvestable).sort((a,b)=>Math.hypot(a.x-near.x,a.z-near.z)-Math.hypot(b.x-near.x,b.z-near.z)||a.id.localeCompare(b.id));
 for(const [kind,required] of [['tree',cost.wood],['rock',cost.stone]] as const){
  let collected=0;
  for(const feature of features){
   if(collected>=required)break;
   if(feature.kind!==kind||state.wilderness?.harvested.includes(feature.id))continue;
   const approach=regionalSupplyGatherApproach(state,feature);if(!approach)continue;
   const next=commitWildernessGather(approach.state,feature.id,{feetY:approach.feetY,grounded:true});
   if(next===approach.state)continue;
   receipts.push({id:feature.id,kind,x:next.player.x,z:next.player.z,feetY:approach.feetY,minimumBodyClearance:approach.minimumBodyClearance,duplicateRejected:commitWildernessGather(next,feature.id,{feetY:approach.feetY,grounded:true})===next});
   state=next;collected++;
  }
  if(collected!==required)throw new Error(`Only ${collected}/${required} reachable ${kind==='tree'?'wood':'stone'} sources in the bounded fixture`);
 }
 return {state,receipts};
}
export function regionalSupplyGatherApproach(state:State,feature:WildernessFeature){
 const radius=feature.kind==='tree'?.175:Math.max(...feature.solids.map(s=>Math.max(s.hx,s.hz)));
 for(const distance of [radius+.8,radius+1.3,radius+1.8])for(let side=0;side<16;side++){
  const x=feature.x+Math.cos(side*Math.PI/8)*distance,z=feature.z+Math.sin(side*Math.PI/8)*distance;
  if(Math.max(Math.abs(x),Math.abs(z))>=worldBound(state)-.5)continue;
  const next=applyAction(state,{type:'move',x,z}),context=wildernessGatherContext(next);
  if(!canGatherWilderness(context,feature.id))continue;
  const obstacles=wildernessObstaclesNear(next,x,z,next.wilderness),sample={x,z,feetY:context.feetY,grounded:true,crouched:false,step:0};
  const minimumBodyClearance=Math.min(...obstacles.map(o=>wildernessCapsuleClearance(sample,o)));
  if(minimumBodyClearance<-.005)continue;
  return {state:next,feetY:context.feetY,minimumBodyClearance};
 }
 return undefined;
}

const json=(value:unknown)=>JSON.stringify(value);
const bytes=(value:string)=>new TextEncoder().encode(value).byteLength;
const totalDrunk=(outpost:RegionalSupplyState['outposts'][number])=>outpost.residents.reduce((sum,r)=>sum+r.drunk,0);
function supplyAction(state:State,type:'deliver'|'build',outpostId:string){return applyAction(state,{type:'regional-supply',command:{type,outpostId,expectedRevision:state.frontierSupply!.revision}});}
/** The complete model-only loop is shared by the developer button and CLI evidence.
 * It allocates its own campaign and never takes a live State or storage handle. */
export function runRegionalSupplyLab(seed=73129,iterations=3,options:{sourceRevision?:string}={}):RegionalSupplyLabReport {
 const repeats=Math.max(1,Math.min(5,Math.trunc(iterations)||1));
 const report:RegionalSupplyLabReport={version:1,seed,iterations:repeats,sourceRevision:options.sourceRevision??'not-recorded',scope:'Disposable deterministic production-model scenarios with canonical resource gathering, accepted reach/elevation/occlusion, clear standing-capsule approaches, resident route/work/water ledgers, and save reload. Movement between approaches is assigned through model actions. No live campaign/storage access. Model geometry checks are not a Rapier-controller traversal, browser visual approval, device frame-rate measurement, or multiplayer transport test.',status:'complete',runs:[]};
 try{for(let iteration=1;iteration<=repeats;iteration++)report.runs.push(regionalSupplyScenario(seed,iteration));}
 catch(error){report.status='interrupted';report.error=error instanceof Error?error.message:String(error);}
 return report;
}
export function regionalSupplyScenario(seed:number,iteration=1):RegionalSupplyLabRun {
 const started=performance.now(),checks:RegionalSupplyLabCheck[]=[],metrics:RegionalSupplyLabRun['metrics']={};
 const check=(name:string,expected:string,pass:boolean,actual:string)=>checks.push({name,expected,pass,actual});
 const initial=createRegionalState(seed),original=json(initial),plan=regionalSupplyPlan(seed),outpost=plan.outposts[0];
 if(!outpost)throw new Error('The regional settlement plan contains no outpost');
 let state=enableRegionalSupply(initial);if(!state.frontierSupply)throw new Error('Regional supply did not enable in the disposable campaign');
 const gathered=gatherRegionalSupplyMaterials(state,outpost.deliveryPosition,{wood:outpost.cost.wood+1,stone:outpost.cost.stone+1});state=gathered.state;
 metrics.sourceIds=gathered.receipts.map(r=>r.id);metrics.harvestedWood=state.wilderness!.wood;metrics.harvestedStone=state.wilderness!.stone;metrics.minimumGatherBodyClearance=Math.min(...gathered.receipts.map(r=>r.minimumBodyClearance));
 check('Earned finite raw materials','Every unit comes from a distinct reachable canonical source; repeated gathering adds nothing',gathered.receipts.length===outpost.cost.wood+outpost.cost.stone+2&&gathered.receipts.every(r=>r.duplicateRejected)&&new Set(metrics.sourceIds).size===gathered.receipts.length,`${state.wilderness!.wood} wood, ${state.wilderness!.stone} stone; ${gathered.receipts.length} unique source IDs; minimum standing-body clearance ${Number(metrics.minimumGatherBodyClearance).toFixed(4)} m`);
 const originalHarvest=json(state.wilderness),far=applyAction(state,{type:'move',x:0,z:0}),rejected=supplyAction(far,'deliver',outpost.id);
 check('Delivery requires presence','A remote delivery is rejected before any stock allocation',rejected===far,'Remote board action '+(rejected===far?'rejected':'unexpectedly accepted'));
 state=applyAction(state,{type:'move',x:outpost.deliveryPosition.x,z:outpost.deliveryPosition.z});
 const beforeDelivered=state;state=supplyAction(state,'deliver',outpost.id);const available=regionalSupplyAvailable(state.frontierSupply!,state.wilderness),spent=regionalSupplySpent(state.frontierSupply!);
 check('Atomic bounded local delivery','Only the requested project cost is allocated; lifetime harvest counts stay unchanged',state!==beforeDelivered&&spent.wood===outpost.cost.wood&&spent.stone===outpost.cost.stone&&available.wood===1&&available.stone===1&&json(state.wilderness)===originalHarvest,`${spent.wood} wood + ${spent.stone} stone delivered; ${available.wood} wood + ${available.stone} stone still available`);
 const duplicateDelivery=supplyAction(state,'deliver',outpost.id);check('Duplicate delivery is inert','A satisfied project cannot consume the remaining pack',duplicateDelivery===state,duplicateDelivery===state?'No state, stock or revision change':'Unexpected duplicate allocation');
 const beforeBuild=state;state=supplyAction(state,'build',outpost.id);const active=state.frontierSupply!.outposts.find(o=>o.id===outpost.id)!;
 const construction=regionalSupplyProjectBoxes(seed,state.frontierSupply!);
 check('Scaffold starts physical work','Paid construction exposes project geometry and requires resident work',state!==beforeBuild&&active.buildStartedAt!==null&&active.builtAt===null&&active.workTicks===0&&construction.some(s=>s.solid),`${construction.length} project shapes; ${active.workTicks} work ticks on start`);
 check('Duplicate start is inert','Repeated build commands never restart or complete construction',supplyAction(state,'build',outpost.id)===state,'Second build start leaves the active project unchanged');
 for(let step=0;step<24;step++)state=applyAction(state,{type:'tick',dt:.25});
 const partial=state.frontierSupply!,partialRaw=serializeSave(state),partialLoaded=parseSave(partialRaw);
 check('In-progress reload','Reload preserves construction work, residents and exact material allocation',!!partialLoaded&&partial.outposts[0]!.workTicks>0&&partial.outposts[0]!.workTicks<48&&json(partialLoaded.frontierSupply)===json(partial),`${partial.outposts[0]!.workTicks} work ticks; ${bytes(partialRaw)} campaign bytes`);
 if(!partialLoaded)throw new Error('In-progress construction save failed validation');state=partialLoaded;
 let control=initial.frontierSupply??enableRegionalSupply(initial).frontierSupply!;for(let step=0;step<24;step++)control=advanceRegionalSupply(control,.25);
 let steps=24,completionTick=-1;
 while(steps<2400){
  const current=state.frontierSupply!.outposts[0]!;
  if(current.builtAt!==null&&completionTick<0)completionTick=steps;
  if(current.builtAt!==null&&current.residents.every(r=>r.drunk>0))break;
  state=applyAction(state,{type:'tick',dt:.25});control=advanceRegionalSupply(control,.25);steps++;
 }
 const completed=state.frontierSupply!.outposts[0]!,dry=control.outposts[0]!,finishedGeometry=regionalSupplyProjectBoxes(seed,state.frontierSupply!),drunk=totalDrunk(completed);
 metrics.outpostId=outpost.id;metrics.outpostName=outpost.name;metrics.biome=outpost.biome;metrics.modelSeconds=steps*.25;metrics.workCompletionSeconds=completionTick<0?-1:completionTick*.25;metrics.workTicks=completed.workTicks;metrics.waterDrunkLitres=drunk;metrics.waterStoredLitres=completed.water;metrics.capturedLitres=completed.captured;metrics.precipitationLitres=completed.precipitation;metrics.spilledLitres=completed.spilled;metrics.consumedLitres=completed.consumed;metrics.residentCount=completed.residents.length;
 const balance=completed.captured-completed.water-completed.residents.reduce((sum,r)=>sum+r.carrying,0)-completed.consumed-completed.spilled;metrics.waterBalanceErrorLitres=Math.abs(balance);
 check('Conserved caught water','Captured rain equals stored, carried, consumed and spilled water, with no unexplained creation',Math.abs(balance)<=.00001&&Math.abs(completed.consumed-drunk)<=.00001&&completed.captured<=completed.precipitation+.00001,`Residual ${balance.toExponential(3)} L; consumed ${completed.consumed.toFixed(6)} L equals resident drinking`);
 check('Resident construction completes','Resident route/work progression completes the paid catchment after nonzero simulated time',completed.builtAt!==null&&completed.workTicks===48&&completionTick>24,`${completed.workTicks}/48 work ticks; completed after ${metrics.workCompletionSeconds} simulation seconds`);
 check('Rain reaches real resident needs','Residents collect catchment water, drink it and have less thirst than the same-time unbuilt control',completed.residents.every((r,i)=>r.drunk>0&&r.thirst<dry.residents[i]!.thirst)&&completed.consumed>0&&drunk>0,`${drunk.toFixed(6)} L drunk; thirst ${completed.residents.map(r=>r.thirst.toFixed(3)).join(', ')} vs dry ${dry.residents.map(r=>r.thirst.toFixed(3)).join(', ')}`);
 check('Completed tank replaces scaffold appearance','The completed project keeps its authorized physical envelope and changes construction material',finishedGeometry.some(s=>s.solid)&&json(finishedGeometry)!==json(construction),`${construction.length} construction shapes → ${finishedGeometry.length} completed shapes`);
 const savedSupply=json(state.frontierSupply),savedHarvest=json(state.wilderness);state=applyAction(state,{type:'move',x:0,z:0});
 for(let i=0;i<100;i++)regionalFeaturesNear(seed,-1400+(i%28)*95,-1300+Math.floor(i/28)*700,0);
 state=applyAction(state,{type:'move',x:outpost.deliveryPosition.x,z:outpost.deliveryPosition.z});const raw=serializeSave(state),loaded=parseSave(raw);
 check('Leave, revisit and reload','Project, people, water and exhausted source records survive cache eviction and exact serialization',!!loaded&&json(loaded.frontierSupply)===savedSupply&&json(loaded.wilderness)===savedHarvest&&json(loaded.player)===json(state.player),`${bytes(raw)} campaign bytes; ${bytes(json(state.frontierSupply))} supply-state bytes; exact round trip ${!!loaded&&json(loaded)===json(state)}`);
 check('Legacy plan is unchanged','Six new supply records reuse the original six outpost IDs; roads remain the original regional plan',plan.outposts.length===6&&json(plan.outposts.map(o=>o.id))===json(regionalPlan(seed).sites.filter(s=>s.kind==='outpost').map(s=>s.id)),`${plan.outposts.length} stable outpost IDs; ${regionalPlan(seed).roads.length} original roads`);
 metrics.supplyStateBytes=bytes(json(state.frontierSupply));metrics.saveBytes=bytes(raw);metrics.projectColliderCount=regionalSupplyObstacles(seed,state.frontierSupply!).length;metrics.actorCount=regionalSupplyActorPoses(seed,state.frontierSupply!).length;metrics.elapsedMilliseconds=performance.now()-started;
 check('Bounded state and geometry','Only six projects and twelve resident actors are persisted; supply payload stays below 20 KB',state.frontierSupply!.outposts.length===6&&Number(metrics.actorCount)===12&&Number(metrics.supplyStateBytes)<20_000&&validateSave(state),`${metrics.supplyStateBytes} supply bytes; ${metrics.actorCount} actors; ${metrics.projectColliderCount} active project colliders; ${Number(metrics.elapsedMilliseconds).toFixed(1)} ms local CPU wall time`);
 check('Campaign isolation','The fixture did not mutate its starting campaign; no live state or storage is accepted by the API',json(initial)===original,'Fresh isolated state remains unchanged');
 return {iteration,checks,metrics};
}
