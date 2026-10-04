import {createRegionalState,enableRegionalTrade,enableRegionalFood,applyAction,parseSave,serializeSave,type State} from './world.ts';
import {regionalTradePlan,regionalTradeCommandPosition,type RegionalTradeCommand} from './regional-trade.ts';
import {advanceRegionalTrade} from './regional-trade.ts';
import {regionalFoodPlan,regionalFoodCommandPosition,regionalFoodInteractions,regionalFoodSummary,regionalFoodConservation,regionalFoodWorkRate,regionalFoodActorPoses,REGIONAL_FOOD_STEP,type RegionalFoodCommand} from './regional-food.ts';
import {regionalSupplyPlan,advanceRegionalSupply,createRegionalSupply} from './regional-supply.ts';
import {gatherRegionalSupplyMaterials} from './regional-supply-lab.ts';

export interface RegionalFoodLabCheck {name:string;expected:string;actual:string;pass:boolean}
export interface RegionalFoodLabFarm {id:string;name:string;surfaceMetres:number;observedActivities:string[];checkpoints:string[];maxBalanceError:number;firstMealSeconds:number|null;cycles:number;consumed:number;final:Record<string,unknown>}
export interface RegionalFoodLabRun {iteration:number;checks:RegionalFoodLabCheck[];farms:RegionalFoodLabFarm[];metrics:Record<string,number|string|boolean>}
export interface RegionalFoodLabReport {version:1;seed:number;iterations:number;sourceRevision:string;scope:string;status:'complete'|'interrupted';runs:RegionalFoodLabRun[];error?:string}
const json=(v:unknown)=>JSON.stringify(v),bytes=(v:unknown)=>new TextEncoder().encode(json(v)).byteLength;
function required(condition:unknown,message:string):asserts condition {if(!condition)throw new Error(message);}
/** Allocates only a disposable campaign. All material and store prerequisites are
 * earned through ordinary production actions; command poses are model placements,
 * not an executed player-controller walk. No live state or storage handle accepted. */
export function createRegionalFoodLabCampaign(seed=73129,buildCollectors=true,supplyVersion:1|2=1,tradeVersion:1|2=1):State {
 let state=enableRegionalTrade({...createRegionalState(seed),frontierSupply:createRegionalSupply(seed,supplyVersion)},tradeVersion);const plan=regionalTradePlan(seed);
 if(buildCollectors)state=buildRegionalFoodLabCollectors(state);
 const issue=(type:RegionalTradeCommand['type'],i:number)=>{const targetId=(type==='start-source'?plan.sources:type==='clear-route'?plan.routes:plan.projects)[i]!.id,command={type,targetId,expectedRevision:state.frontierTrade!.revision},position=regionalTradeCommandPosition(seed,command)!;state=applyAction(state,{type:'move',x:position.x,z:position.z});const before=state;state=applyAction(state,{type:'regional-trade',command});required(state!==before,`Disposable ${type} rejected at ${targetId}`);};
 for(let i=0;i<plan.routes.length;i++){issue('start-source',i);issue('clear-route',i);}
 const collectorIds=new Set(plan.projects.map(p=>p.siteId)),limit=Math.ceil(Math.max(...plan.routes.map(r=>r.travelSeconds))*7+600);
 let completed=false;
 for(let second=0;second<limit;second++){
  for(let i=0;i<plan.projects.length;i++){const r=state.frontierTrade!.routes[i]!;if(r.buildStartedAt===null&&r.destinationStock>=plan.projects[i]!.cost)issue('build-store',i);}
  if(state.frontierTrade!.routes.every(r=>r.activity==='finished')&&(!buildCollectors||state.frontierSupply!.outposts.filter(o=>collectorIds.has(o.id)).every(o=>o.builtAt!==null&&o.spilled>2))){completed=true;break;}
  state=applyAction(state,{type:'tick',dt:1});
 }
 required(completed,'Old production prerequisites did not complete within bounded physical journeys');const loaded=parseSave(serializeSave(state));required(loaded,'Earned old campaign must round-trip');return loaded;
}
/** Internal fixture operation, exported only for ordinary integration tests. */
export function buildRegionalFoodLabCollectors(initial:State):State {
 let state=initial;const ids=new Set(regionalTradePlan(state.seed).projects.map(p=>p.siteId));
 for(const outpost of regionalSupplyPlan(state.seed).outposts.filter(p=>ids.has(p.id))){
  if(state.frontierSupply!.outposts.find(o=>o.id===outpost.id)!.buildStartedAt!==null)continue;
  state=gatherRegionalSupplyMaterials(state,outpost.deliveryPosition,outpost.cost).state;state=applyAction(state,{type:'move',x:outpost.deliveryPosition.x,z:outpost.deliveryPosition.z});
  for(const type of ['deliver','build'] as const){const previous=state;state=applyAction(state,{type:'regional-supply',command:{type,outpostId:outpost.id,expectedRevision:state.frontierSupply!.revision}});required(state!==previous,`Earned collector ${type} rejected`);}
 }
 return state;
}

/** User-executable disposable production loop shared by the Developer Lab and
 * CLI evidence. Only seed/repeat metadata is accepted, never a live campaign. */
export function runRegionalFoodLab(seed=73129,iterations=1,options:{sourceRevision?:string}={}):RegionalFoodLabReport {
 const count=iterations>=3?3:1,report:RegionalFoodLabReport={version:1,seed,iterations:count,sourceRevision:options.sourceRevision??'not-recorded',scope:'Fresh disposable campaigns earn the old finite freight stores and three collector builds. Food recovers only new overflow, reuses two conserved seed portions, harvests crops and physically times local shipments and meals. Four declared starter meals per community are counted separately. Finite stewardship claims end while resident crop work continues. Model command poses are assigned; actual controller traversal is a separate test. No live campaign/storage, browser rendering, device-performance or network-transport access.',status:'complete',runs:[]};
 try{for(let iteration=1;iteration<=count;iteration++)report.runs.push(regionalFoodScenario(seed,iteration));}catch(error){report.status='interrupted';report.error=error instanceof Error?error.message:String(error);}return report;
}
export function regionalFoodScenario(seed:number,iteration=1):RegionalFoodLabRun {
 const began=performance.now(),initial=createRegionalFoodLabCampaign(seed),initialBytes=json(initial),oldSupply=initial.frontierSupply!,oldTrade=initial.frontierTrade!,plan=regionalFoodPlan(seed),checks:RegionalFoodLabCheck[]=[];
 const check=(name:string,expected:string,pass:boolean,actual:string)=>checks.push({name,expected,pass,actual});
 let state=enableRegionalFood(initial,1),controlSupply=oldSupply,controlTrade=oldTrade,tickTotalMs=0,tickMaximumMs=0,tickCalls=0,peakBytes=0,checkpointCount=0,checkpointTotalMs=0,checkpointMaximumMs=0,atPoolExhausted:number|null=null,fullCapacitySeen=false,renewedAfterCapacity=false,maximumSpeed=0;
 const waterBaseline=state.frontierFood!.farms.map(f=>f.sourceSpilled),farms:RegionalFoodLabFarm[]=plan.farms.map(p=>({id:p.id,name:p.name,surfaceMetres:p.surfaceMetres,observedActivities:[],checkpoints:[],maxBalanceError:0,firstMealSeconds:null,cycles:0,consumed:0,final:{}})),jobIds=plan.farms.map(()=>new Set<string>()),hungerBenefits=plan.farms.map(()=>({farmer:0,carrier:0})),capacityAt=plan.farms.map(()=>null as number|null),firstLoadedAt=plan.farms.map(()=>null as number|null),firstDeliveredAt=plan.farms.map(()=>null as number|null),poolHarvests:number[]=[];
 check('Mature-save opt-in preserves old progress','New food starts at zero local time and zero water; existing spill is only a discarded watermark',state!==initial&&state.frontierFood!.ticks===0&&state.frontierFood!.farms.every(f=>f.water===0&&f.waterCaptured===0&&f.waterUsed===0&&f.sourceSpilled>0)&&json(state.frontierSupply)===json(oldSupply)&&json(state.frontierTrade)===json(oldTrade)&&json(state.wilderness)===json(initial.wilderness),`${state.frontierFood!.farms.map(f=>f.sourceSpilled.toFixed(3)).join(', ')} historic spilled litres excluded from new inventory`);
 const checkpoint=()=>{const before=serializeSave(state),started=performance.now(),restored=parseSave(before),elapsed=performance.now()-started;checkpointTotalMs+=elapsed;checkpointMaximumMs=Math.max(checkpointMaximumMs,elapsed);required(restored,'Production food save failed strict validation');required(serializeSave(restored)===before,'Food save changed during exact replay');state=restored;checkpointCount++;peakBytes=Math.max(peakBytes,bytes(state.frontierFood));};
 const command=(type:RegionalFoodCommand['type'],index:number)=>{const p=plan.farms[index]!,position=regionalFoodCommandPosition(seed,{type,targetId:p.id})!;state=applyAction(state,{type:'move',x:position.x,z:position.z});const prior=state,cmd={type,targetId:p.id,expectedRevision:state.frontierFood!.revision};state=applyAction(state,{type:'regional-food',command:cmd});required(state!==prior,`Disposable ${type} rejected`);required(applyAction(state,{type:'regional-food',command:cmd})===state,'Old request replay changed food');required(applyAction(state,{type:'regional-food',command:{...cmd,expectedRevision:state.frontierFood!.revision}})===state,'Duplicate crop request minted work/reward');};
 for(let i=0;i<plan.farms.length;i++)command('start-farm',i);checkpoint();
 for(let second=1;second<=1500;second++){
  for(let i=0;i<plan.farms.length;i++){const action=regionalFoodInteractions(seed,state.frontierFood,state).find(a=>a.farmId===plan.farms[i]!.id&&a.kind==='tend-crop'&&a.enabled);if(action){jobIds[i]!.add(regionalFoodSummary(state.frontierFood!,seed,action.farmId)!.jobId);command('tend-crop',i);}}
  const before=state.frontierFood!,then=performance.now();state=applyAction(state,{type:'tick',dt:1});const elapsed=performance.now()-then;tickTotalMs+=elapsed;tickMaximumMs=Math.max(tickMaximumMs,elapsed);tickCalls++;controlSupply=advanceRegionalSupply(controlSupply,1);controlTrade=advanceRegionalTrade(controlTrade,1);peakBytes=Math.max(peakBytes,bytes(state.frontierFood));let newCheckpoint=false;
  for(let i=0;i<plan.farms.length;i++){
   const f=state.frontierFood!.farms[i]!,previous=before.farms[i]!,p=plan.farms[i]!,m=farms[i]!,balance=regionalFoodConservation(state.frontierFood!)[i]!,food=f.stock+f.reserved+f.cargo+f.store+f.returnMeal+f.farmerMeal+f.carrierMeal+f.meals;
   const errors=[Math.abs(food-f.harvested-f.starterGranted),Math.abs(f.water+f.waterUsed-f.waterCaptured),Math.abs(f.waterCaptured+f.waterLost-(f.sourceSpilled-waterBaseline[i]!)),Math.abs(f.seeds+f.seedsSown-f.seedsReturned-2),Math.abs(f.delivered+f.starterGranted-f.store-f.returnMeal-f.farmerMeal-f.carrierMeal-f.meals)];m.maxBalanceError=Math.max(m.maxBalanceError,...errors);required(balance.balanced&&m.maxBalanceError<.00001,`Production conservation failed at ${p.id}`);
   const activity=f.crop+'/'+f.activity;if(!m.observedActivities.includes(activity))m.observedActivities.push(activity);
   const stages=[f.crop==='growing'&&f.growth>0?'growth':null,f.crop==='ripe'&&f.harvestWork>0?'harvest':null,f.activity==='loading'&&f.reserved>0?'load':null,f.activity==='outbound'&&f.cargo>0?'transit':null,f.activity==='unloading'&&f.cargo>0?'unload':null,f.activity==='eating'&&f.carrierMeal>0?'eat':null].filter((v):v is string=>v!==null);
   for(const stage of stages)if(!m.checkpoints.includes(stage)){m.checkpoints.push(stage);newCheckpoint=true;}
   if(f.meals>0&&m.firstMealSeconds===null)m.firstMealSeconds=second;
   for(const who of ['farmer','carrier'] as const)if(f[who].meals>previous[who].meals&&f[who].hunger<previous[who].hunger&&regionalFoodWorkRate(f[who].hunger)>regionalFoodWorkRate(previous[who].hunger))hungerBenefits[i]![who]++;
   if(f.activity===previous.activity&&(f.activity==='outbound'||f.activity==='returning'))maximumSpeed=Math.max(maximumSpeed,Math.abs(f.distance-previous.distance));
   if(f.reserved>0&&firstLoadedAt[i]===null)firstLoadedAt[i]=second;if(f.delivered>0&&firstDeliveredAt[i]===null)firstDeliveredAt[i]=second;
   if(f.stock===p.capacity.source&&f.store+f.reserved+f.cargo===p.capacity.store&&f.crop==='empty'&&capacityAt[i]===null){capacityAt[i]=f.harvests;fullCapacitySeen=true;}
   if(capacityAt[i]!==null&&f.harvests>capacityAt[i]!)renewedAfterCapacity=true;
  }
  if(newCheckpoint)checkpoint();
  if(state.frontierFood!.farms.every(f=>f.stewardship===4)&&atPoolExhausted===null){atPoolExhausted=second;poolHarvests.push(...state.frontierFood!.farms.map(f=>f.harvests));checkpoint();}
  if(atPoolExhausted!==null&&second-atPoolExhausted>=480&&state.frontierFood!.farms.every((f,i)=>f.harvests>=Math.max(7,poolHarvests[i]!+3)&&f.meals>f.starterGranted+8)&&renewedAfterCapacity)break;
 }
 checkpoint();
 for(let i=0;i<farms.length;i++){
  const f=state.frontierFood!.farms[i]!,p=plan.farms[i]!,m=farms[i]!;m.cycles=f.harvests;m.consumed=f.meals;m.final={harvested:f.harvested,starterGranted:f.starterGranted,stock:f.stock,reserved:f.reserved,cargo:f.cargo,store:f.store,meals:f.meals,returnMeal:f.returnMeal,farmerMeal:f.farmerMeal,carrierMeal:f.carrierMeal,seeds:f.seeds,seedsSown:f.seedsSown,seedsReturned:f.seedsReturned,water:f.water,waterCaptured:f.waterCaptured,waterUsed:f.waterUsed,waterLost:f.waterLost,stewardship:f.stewardship,farmerHunger:f.farmer.hunger,carrierHunger:f.carrier.hunger};
  check(`Harvest, shipment and meal conservation (${p.name})`,'New overflow, reusable seeds, crop food and finite starter portions balance through every reservation, carried meal and consumption bucket',m.maxBalanceError<.00001&&f.harvests>=7&&f.harvested===f.harvests*p.yield&&f.seedsReturned===f.harvests&&f.meals>f.starterGranted+8,`${f.harvested} grown + ${f.starterGranted} starter portions; ${f.meals} eaten; maximum balance error ${m.maxBalanceError}`);
  check(`Reload all active stages (${p.name})`,'Exact strict saves preserve growing, harvesting, loading, loaded transit, unloading and eating', ['growth','harvest','load','transit','unload','eat'].every(stage=>m.checkpoints.includes(stage)),m.checkpoints.join(', '));
  check(`Meals improve real work (${p.name})`,'Both stable new residents eat real food, lower hunger and cross a productive work-rate threshold',hungerBenefits[i]!.farmer>0&&hungerBenefits[i]!.carrier>0,`${hungerBenefits[i]!.farmer} gardener and ${hungerBenefits[i]!.carrier} pantry-worker rate improvements`);
  check(`Finite requests and renewable work (${p.name})`,'Four distinct crop jobs pay at most four marks; resident harvest and consumption continue after the pool is exhausted',jobIds[i]!.size===4&&f.stewardship===4&&f.harvests>=poolHarvests[i]!+3&&regionalFoodInteractions(seed,state.frontierFood,state).filter(a=>a.farmId===p.id&&a.kind==='tend-crop').every(a=>!a.enabled),`${jobIds[i]!.size} distinct requests, ${f.stewardship} marks, ${f.harvests-(poolHarvests[i]??0)} further harvests`);
  check(`Real local delivery time (${p.name})`,'Loaded food spends at least its surface distance / speed between reservation and completed delivery',firstLoadedAt[i]!==null&&firstDeliveredAt[i]!==null&&firstDeliveredAt[i]!-firstLoadedAt[i]!>=p.surfaceMetres/p.speed&&maximumSpeed<=p.speed+.00001,`${p.surfaceMetres.toFixed(3)} m at ${p.speed} m/s; first reservation→delivery ${Number(firstDeliveredAt[i])-Number(firstLoadedAt[i])} s; peak ${maximumSpeed.toFixed(6)} m/s`);
 }
 check('Finite shelves pause and resume production','A full source and occupied store stop planting until real eating frees capacity',fullCapacitySeen&&renewedAfterCapacity,`Full capacity observed ${fullCapacitySeen}; later harvest ${renewedAfterCapacity}`);
 check('Old ledgers and terrain resources remain separate','Every V31/V32 active tick matches the no-food control; no old resident, collector, store, harvest or inventory state is changed by food',json(state.frontierSupply)===json(controlSupply)&&json(state.frontierTrade)===json(controlTrade)&&json(state.wilderness)===json(initial.wilderness)&&json(state.inventory)===json(initial.inventory)&&json(state.collected)===json(initial.collected),'Exact old supply/trade control payloads and old ownership records');
 check('Bounded payload and identities','Three farms, six new stable actors, at most fifteen receipts and less than 45 KB of food state',state.frontierFood!.farms.length===3&&regionalFoodActorPoses(seed,state.frontierFood).length===6&&new Set(regionalFoodActorPoses(seed,state.frontierFood).map(a=>a.id)).size===6&&state.frontierFood!.receipts.length<=plan.budget.maxReceipts&&peakBytes<plan.budget.maxSavedBytes,`${peakBytes} peak bytes; ${state.frontierFood!.receipts.length} receipts`);
 check('Disposable campaign isolation','All setup and observation used fresh states without mutating the starting earned campaign',json(initial)===initialBytes,'Starting campaign remains byte-exact; no live storage accepted');
 return {iteration,checks,farms,metrics:{simulationSeconds:state.frontierFood!.ticks*REGIONAL_FOOD_STEP,oldPrerequisiteSeconds:oldSupply.ticks*.25,finiteStarterMeals:state.frontierFood!.farms.reduce((n,f)=>n+f.starterGranted,0),grownFood:state.frontierFood!.farms.reduce((n,f)=>n+f.harvested,0),consumedFood:state.frontierFood!.farms.reduce((n,f)=>n+f.meals,0),activeTickCalls:tickCalls,activeTickMeanMilliseconds:tickTotalMs/Math.max(1,tickCalls),activeTickMaximumMilliseconds:tickMaximumMs,elapsedMilliseconds:performance.now()-began,peakStateBytes:peakBytes,finalStateBytes:bytes(state.frontierFood),serializedCheckpoints:checkpointCount,checkpointParseMeanMilliseconds:checkpointTotalMs/Math.max(1,checkpointCount),checkpointParseMaximumMilliseconds:checkpointMaximumMs,stewardshipPoolExhaustedAtSeconds:atPoolExhausted??-1,maximumCarrierMetresPerSecond:maximumSpeed,liveCampaignAccess:false}};
}
