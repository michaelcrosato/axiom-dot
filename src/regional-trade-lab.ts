import {createRegionalState,enableRegionalSupply,applyAction,parseSave,serializeSave} from './world.ts';
import {regionalSupplyPlan,regionalSupplyAvailable} from './regional-supply.ts';
import {createRegionalTrade,advanceRegionalTrade,applyRegionalTradeCommand,regionalTradePlan,regionalTradeSummary,regionalTradeCommandPosition,validRegionalTrade,immutableRegionalTrade,REGIONAL_TRADE_STEP,REGIONAL_TRADE_SPEED,type RegionalTradeState,type RegionalTradeCommand,type RegionalTradeRouteState} from './regional-trade.ts';

export interface RegionalTradeLabCheck {name:string;expected:string;actual:string;pass:boolean}
export interface RegionalTradeLabRoute {
 id:string;name:string;templateId:string;material:string;surfaceMetres:number;horizontalMetres:number;maxGrade:number;speedMetresPerSecond:number;minimumOneWaySeconds:number;
 firstReservationAtSeconds:number|null;firstDepartureAtSeconds:number|null;blockedAtSeconds:number|null;repairStartedAtSeconds:number|null;clearedAtSeconds:number|null;firstDeliveryAtSeconds:number|null;buildStartedAtSeconds:number|null;builtAtSeconds:number|null;finishedAtSeconds:number|null;
 peakReserved:number;peakCargo:number;peakDestinationStock:number;maxMovingMetresPerSecond:number;maxBalanceErrorUnits:number;observedActivities:string[];progressSamples:{seconds:number;activity:string;metres:number;remaining:number;stock:number;reserved:number;cargo:number;delivered:number;embodied:number}[];
 final:{remaining:number;stock:number;reserved:number;cargo:number;destinationStock:number;embodied:number;withdrawn:number;delivered:number;shipments:number}|null;
}
export interface RegionalTradeLabRun {iteration:number;checks:RegionalTradeLabCheck[];routes:RegionalTradeLabRoute[];metrics:Record<string,number|string|boolean>}
export interface RegionalTradeLabReport {version:1;seed:number;iterations:number;sourceRevision:string;scope:string;status:'complete'|'interrupted';runs:RegionalTradeLabRun[];error?:string}
const bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v)).byteLength;
const sum=(r:RegionalTradeRouteState)=>r.remaining+r.stock+r.reserved+r.cargo+r.destinationStock+r.embodied+r.withdrawn;
const seconds=(ticks:number|null)=>ticks===null?null:ticks*REGIONAL_TRADE_STEP;
/** Production-model loop in a freshly allocated disposable campaign. This API never
 * accepts a live campaign, browser, network client or storage handle. */
export function runRegionalTradeLab(seed=73129,iterations=1,options:{sourceRevision?:string}={}):RegionalTradeLabReport {
 const count=Math.max(1,Math.min(5,Math.trunc(iterations)||1));
 const report:RegionalTradeLabReport={version:1,seed,iterations:count,sourceRevision:options.sourceRevision??'not-recorded',scope:'Disposable deterministic production-model scenarios: finite independent geological/deadwood deposits, reserved/loading/in-transit/delivered/embodied units, real road metres at 1.8 m/s, interruption and timed crew repair, receiving-capacity construction, usable reserve funding a real rain collector, exact ledger replay and off-screen equivalence. Command poses are assigned in the model. This is not an executed player-controller traversal, browser visual approval, device frame-rate measurement, multiplayer transport test or live-campaign operation.',status:'complete',runs:[]};
 try {for(let iteration=1;iteration<=count;iteration++)report.runs.push(regionalTradeScenario(seed,iteration));}
 catch(error){report.status='interrupted';report.error=error instanceof Error?error.message:String(error);}
 return report;
}
export function regionalTradeScenario(seed:number,iteration=1):RegionalTradeLabRun {
 const started=performance.now(),plan=regionalTradePlan(seed),initial=createRegionalState(seed),initialJSON=JSON.stringify(initial),checks:RegionalTradeLabCheck[]=[];
 const check=(name:string,expected:string,pass:boolean,actual:string)=>checks.push({name,expected,pass,actual});
 let state=createRegionalTrade(seed,1),near=state,far=state,tickTotalMs=0,tickMaximumMs=0,tickCalls=0,peakBytes=bytes(state),serializedCheckpoints=0;
 const routes:RegionalTradeLabRoute[]=plan.routes.map(p=>({id:p.id,name:p.name,templateId:plan.sources.find(s=>s.id===p.sourceId)!.templateId,material:p.material,surfaceMetres:p.surfaceMetres,horizontalMetres:p.horizontalMetres,maxGrade:p.maxGrade,speedMetresPerSecond:p.speed,minimumOneWaySeconds:p.travelSeconds,firstReservationAtSeconds:null,firstDepartureAtSeconds:null,blockedAtSeconds:null,repairStartedAtSeconds:null,clearedAtSeconds:null,firstDeliveryAtSeconds:null,buildStartedAtSeconds:null,builtAtSeconds:null,finishedAtSeconds:null,peakReserved:0,peakCargo:0,peakDestinationStock:0,maxMovingMetresPerSecond:0,maxBalanceErrorUnits:0,observedActivities:[],progressSamples:[],final:null}));
 const command=(type:RegionalTradeCommand['type'],targetId:string)=>{
  const cmd={type,targetId,expectedRevision:state.revision},position=regionalTradeCommandPosition(seed,cmd);if(!position)throw new Error(`Missing command position ${targetId}`);
  const context={...initial,player:{...initial.player,x:position.x,z:position.z},feetY:position.y,grounded:true};
  const prior=state,result=applyRegionalTradeCommand(state,context,cmd);state=result.state;
  if(state===prior)throw new Error(`Valid disposable ${type} command rejected at ${targetId}`);
  check(`${type} is exactly once (${targetId})`,'Accepted command changes one revision; original replay and duplicate action are inert',state.revision===prior.revision+1&&applyRegionalTradeCommand(state,context,cmd).state===state&&applyRegionalTradeCommand(state,context,{...cmd,expectedRevision:state.revision}).state===state,`Revision ${prior.revision} → ${state.revision}; ${state.receipts.length} bounded receipts`);
 };
 const checkpoint=()=>{const plain=JSON.parse(JSON.stringify(state));if(!validRegionalTrade(plain,initial))throw new Error('Production ledger validator rejected a checkpoint');const restored=immutableRegionalTrade(plain,initial);if(JSON.stringify(restored)!==JSON.stringify(state))throw new Error('Ledger replay changed a checkpoint');state=restored;serializedCheckpoints++;peakBytes=Math.max(peakBytes,bytes(state));};
 for(const route of plan.routes)command('start-source',route.sourceId);
 const bound=Math.ceil(Math.max(...plan.routes.map(p=>p.travelSeconds))*6+300);
 let completed=false;
 for(let second=0;second<bound;second++){
  const before=state,then=performance.now();state=advanceRegionalTrade(state,1);const elapsed=performance.now()-then;tickTotalMs+=elapsed;tickMaximumMs=Math.max(tickMaximumMs,elapsed);tickCalls++;peakBytes=Math.max(peakBytes,bytes(state));
  for(let i=0;i<plan.routes.length;i++){
   const p=plan.routes[i]!,r=state.routes[i]!,previous=before.routes[i]!,m=routes[i]!,now=state.ticks*REGIONAL_TRADE_STEP,source=plan.sources[i]!,project=plan.projects[i]!;
   m.maxBalanceErrorUnits=Math.max(m.maxBalanceErrorUnits,Math.abs(sum(r)-source.deposit),Math.abs(r.delivered-r.destinationStock-r.embodied-r.withdrawn));
   m.peakReserved=Math.max(m.peakReserved,r.reserved);m.peakCargo=Math.max(m.peakCargo,r.cargo);m.peakDestinationStock=Math.max(m.peakDestinationStock,r.destinationStock);
   if(r.activity===previous.activity&&(r.activity==='outbound'||r.activity==='returning'))m.maxMovingMetresPerSecond=Math.max(m.maxMovingMetresPerSecond,Math.abs(r.distance-previous.distance));
   if(!m.observedActivities.includes(r.activity)){m.observedActivities.push(r.activity);m.progressSamples.push({seconds:now,activity:r.activity,metres:r.distance,remaining:r.remaining,stock:r.stock,reserved:r.reserved,cargo:r.cargo,delivered:r.delivered,embodied:r.embodied});}
   if(r.reserved>0&&m.firstReservationAtSeconds===null)m.firstReservationAtSeconds=now;
   if(r.activity==='outbound'&&m.firstDepartureAtSeconds===null)m.firstDepartureAtSeconds=seconds(r.activityStartedAt);
   if(r.activity==='blocked'&&m.blockedAtSeconds===null){m.blockedAtSeconds=seconds(r.activityStartedAt);checkpoint();const summary=regionalTradeSummary(state,seed,p.id)!;check(`Visible repair job (${p.name})`,'An interrupted physical shipment exposes its blocked cause, stable job ID and repair action',summary.phase==='blocked'&&summary.jobId.length>0&&summary.jobTitle.length>0&&summary.cause.length>0,`${summary.phase}: ${summary.jobTitle}; ${summary.cause}`);}
   if(r.activity==='blocked'&&r.repairStartedAt===null&&now-(m.blockedAtSeconds??now)>=8){const stalled=r.distance;check(`Interruption holds freight (${p.name})`,'Loaded freight stops exactly at its planned obstruction without losing cargo',Math.abs(stalled-p.obstruction.distance)<.00001&&r.cargo===p.cargoCapacity&&r.delivered===0,`${stalled.toFixed(3)} m, ${r.cargo} cargo units, ${r.delivered} delivered`);command('clear-route',p.id);m.repairStartedAtSeconds=state.ticks*REGIONAL_TRADE_STEP;}
   if(r.clearedAt!==null&&m.clearedAtSeconds===null)m.clearedAtSeconds=seconds(r.clearedAt);
   if(r.delivered>0&&m.firstDeliveryAtSeconds===null){m.firstDeliveryAtSeconds=now;checkpoint();}
   if(r.delivered===project.cost&&r.cargo===0&&r.reserved===0&&r.distance===0&&r.buildStartedAt===null){
    check(`Receiving capacity creates need (${p.name})`,'The first four delivered units fill the old receiving store; further source stock is held',r.destinationStock===project.baseCapacity&&r.stock>0&&r.activity!=='outbound',`${r.destinationStock}/${project.baseCapacity} receiving stock; ${r.stock} waiting at source`);
    command('build-store',project.id);m.buildStartedAtSeconds=state.ticks*REGIONAL_TRADE_STEP;checkpoint();
   }
   if(r.builtAt!==null&&m.builtAtSeconds===null)m.builtAtSeconds=seconds(r.builtAt);
   if(r.activity==='finished'&&m.finishedAtSeconds===null)m.finishedAtSeconds=now;
  }
  if(state.routes.every(r=>r.activity==='finished')){completed=true;break;}
 }
 checkpoint();
 for(let i=0;i<routes.length;i++){
  const m=routes[i]!,r=state.routes[i]!,p=plan.routes[i]!,project=plan.projects[i]!,source=plan.sources[i]!;m.final={remaining:r.remaining,stock:r.stock,reserved:r.reserved,cargo:r.cargo,destinationStock:r.destinationStock,embodied:r.embodied,withdrawn:r.withdrawn,delivered:r.delivered,shipments:r.shipments};
  check(`Finite material conservation (${p.name})`,'All twelve surveyed units end as eight received stock plus four embodied store units; no gather rewards',m.maxBalanceErrorUnits<.00001&&r.remaining===0&&r.stock===0&&r.reserved===0&&r.cargo===0&&r.delivered===source.deposit&&r.destinationStock===source.deposit-project.cost&&r.embodied===project.cost,JSON.stringify(m.final));
  check(`Physical freight time (${p.name})`,'Route surface metres / 1.8 sets travel duration; movement never jumps above that speed',p.speed===REGIONAL_TRADE_SPEED&&m.firstDepartureAtSeconds!==null&&m.firstDeliveryAtSeconds!==null&&m.firstDeliveryAtSeconds-m.firstDepartureAtSeconds>=p.travelSeconds&&m.maxMovingMetresPerSecond<=REGIONAL_TRADE_SPEED+.00001,`${p.surfaceMetres.toFixed(3)} m, minimum ${p.travelSeconds.toFixed(3)} s; observed departure→first delivery ${Number(m.firstDeliveryAtSeconds)-Number(m.firstDepartureAtSeconds)} s; maximum moving rate ${m.maxMovingMetresPerSecond.toFixed(6)} m/s`);
  check(`Timed repair and useful store (${p.name})`,'Crew repair takes twelve seconds and construction sixteen; capacity increases and releases remaining finite supply',m.clearedAtSeconds!==null&&m.repairStartedAtSeconds!==null&&m.clearedAtSeconds-m.repairStartedAtSeconds===p.obstruction.repairTicks*REGIONAL_TRADE_STEP&&m.builtAtSeconds!==null&&m.buildStartedAtSeconds!==null&&m.builtAtSeconds-m.buildStartedAtSeconds===project.workTicks*REGIONAL_TRADE_STEP&&project.capacity>project.baseCapacity&&r.delivered>project.baseCapacity,`Repair ${Number(m.clearedAtSeconds)-Number(m.repairStartedAtSeconds)} s; build ${Number(m.builtAtSeconds)-Number(m.buildStartedAtSeconds)} s; capacity ${project.baseCapacity} → ${project.capacity}`);
  check(`Reservation and full journey (${p.name})`,'Loading reservation, outbound, block, unload, return and finite exhaustion occur in order',m.peakReserved>0&&m.peakCargo===p.cargoCapacity&&['loading','outbound','blocked','unloading','returning','finished'].every(a=>m.observedActivities.includes(a)),m.observedActivities.join(' → '));
 }
 // Turn actual freight reserve into an old collector, through unchanged production
 // world actions. Credits remain in a separate conserved ledger; no tree/rock IDs
 // or lifetime harvest counters are manufactured for this integration.
 const reserveBefore=state;for(const project of plan.projects.slice(0,2))command('withdraw-reserve',project.id);
 let campaign=enableRegionalSupply({...initial,frontierTrade:state});const collector=regionalSupplyPlan(seed).outposts[0]!,available=regionalSupplyAvailable(campaign.frontierSupply,campaign.wilderness,campaign.frontierTrade);
 campaign=applyAction(campaign,{type:'move',x:collector.deliveryPosition.x,z:collector.deliveryPosition.z});
 for(const type of ['deliver','build'] as const)campaign=applyAction(campaign,{type:'regional-supply',command:{type,outpostId:collector.id,expectedRevision:campaign.frontierSupply!.revision}});
 for(let i=0;i<600&&campaign.frontierSupply!.outposts[0]!.builtAt===null;i++)campaign=applyAction(campaign,{type:'tick',dt:.25});
 const restored=parseSave(serializeSave(campaign)),left=regionalSupplyAvailable(campaign.frontierSupply,campaign.wilderness,campaign.frontierTrade);
 check('Freight reserve becomes usable building supplies','Eight timber and eight stone can fund a real V31 collector without inventing gathered sources; exact replay and save retain the allocation',available.wood===8&&available.stone===8&&campaign.frontierSupply!.outposts[0]!.builtAt!==null&&left.wood===8-collector.cost.wood&&left.stone===8-collector.cost.stone&&JSON.stringify(campaign.wilderness)===JSON.stringify(initial.wilderness)&&!!restored&&JSON.stringify(restored)===JSON.stringify(campaign),`${available.wood} timber + ${available.stone} stone withdrawn; collector uses ${collector.cost.wood} + ${collector.cost.stone}; ${left.wood} + ${left.stone} remains; harvest unchanged`);
 check('Withdrawal conserves the terminal reserves','The reserve moves from destination storage into cumulative withdrawn ownership exactly once',state.routes.slice(0,2).every((r,i)=>r.destinationStock===0&&r.withdrawn===reserveBefore.routes[i]!.destinationStock&&sum(r)===plan.sources[i]!.deposit),`${state.routes.slice(0,2).map(r=>r.withdrawn).join(' + ')} conserved units moved; no original deposit replenished`);
 checkpoint();
 for(let i=0;i<routes.length;i++){const r=state.routes[i]!;routes[i]!.final={remaining:r.remaining,stock:r.stock,reserved:r.reserved,cargo:r.cargo,destinationStock:r.destinationStock,embodied:r.embodied,withdrawn:r.withdrawn,delivered:r.delivered,shipments:r.shipments};}
 // The production advancement API has no residency/visibility argument: equivalent
 // clocks must reproduce exactly whether commands were issued nearby or the view left.
 near=state;far=immutableRegionalTrade(JSON.parse(JSON.stringify(state)),initial);for(let i=0;i<17;i++){near=advanceRegionalTrade(near,.25);far=advanceRegionalTrade(far,.25);}
 check('Off-screen clock equivalence','Reloaded/unloaded campaign data advances exactly like the retained model',JSON.stringify(near)===JSON.stringify(far),`Exact payload equality after seventeen quarter-second ticks`);
 check('Bounded scenario, receipts and payload','Three finite routes finish inside six measured one-way journeys; bounded commands including reserve withdrawal and 18 KB ledger',completed&&state.receipts.length<=plan.budget.maxReceipts&&peakBytes<plan.budget.maxSavedBytes,`${state.ticks*REGIONAL_TRADE_STEP} simulation seconds; ${state.receipts.length} receipts; peak ${peakBytes} bytes`);
 check('Disposable campaign isolation','Starting generation, player pose, harvested sources, collector and core campaign are unchanged',JSON.stringify(initial)===initialJSON,`Fresh campaign remains byte-exact; no live state/storage accepted`);
 return {iteration,checks,routes,metrics:{observationStepSeconds:1,collectorConstructionSeconds:campaign.frontierSupply!.ticks*REGIONAL_TRADE_STEP,totalDemonstratedModelSeconds:state.ticks*REGIONAL_TRADE_STEP+campaign.frontierSupply!.ticks*REGIONAL_TRADE_STEP,simulationSeconds:state.ticks*REGIONAL_TRADE_STEP,tickCalls,tickMeanMilliseconds:tickTotalMs/Math.max(1,tickCalls),tickMaximumMilliseconds:tickMaximumMs,elapsedMilliseconds:performance.now()-started,peakStateBytes:peakBytes,finalStateBytes:bytes(state),serializedCheckpoints,receiptCount:state.receipts.length,withdrawnTimber:available.wood,withdrawnStone:available.stone,collectorWoodUsed:collector.cost.wood,collectorStoneUsed:collector.cost.stone,totalFiniteUnits:plan.sources.reduce((n,s)=>n+s.deposit,0),liveCampaignAccess:false}};
}
