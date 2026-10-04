import {createRegionalState,enableRegionalTrade,enableRegionalFood,applyAction,serializeSave,parseSave,worldObjects,type State} from './world.ts';
import {generateRegionalChunk,regionalPlan,regionalChunkAt,REGION_MIN_CHUNK,REGION_MAX_CHUNK,type RegionalChunk,type RegionalBounds} from './regional-world.ts';
import {createRegionalSupply,regionalSupplyPlan,regionalSupplyActorPoses,regionalSupplySummary,regionalSupplyWeather} from './regional-supply.ts';
import {regionalTradePlan,regionalTradeInteractions,regionalTradeActorPoses,regionalTradeConservation,regionalTradeSummary,regionalTradeCommandPosition,type RegionalTradeCommand} from './regional-trade.ts';
import {regionalFoodPlan,regionalFoodInteractions,regionalFoodActorPoses,regionalFoodConservation,regionalFoodSummary,type RegionalFoodCommand} from './regional-food.ts';
import {gatherRegionalSupplyMaterials} from './regional-supply-lab.ts';
import {createRegionalFoodLabCampaign} from './regional-food-lab.ts';
import {createSettlementWorkbench,settlementPlan,settlementInteractions,applySettlementAction,settlementSnapshot,settlementChecks,settlementGeometryParts,settlementActionId,type SettlementDomain} from './regional-settlement-workbench.ts';
import type {Vec3} from './procedural.ts';

export const WORKBENCH_VERSION=3,WORKBENCH_STEP=.25,WORKBENCH_MAX_TICKS=14_400,WORKBENCH_MAX_BATCH=240,WORKBENCH_MAX_EVENTS=128;
export interface WorkbenchConfig {seed:number;system:'water'|'trade'|'food'|'settlement';index:number;view:'chunk'|'settlement'|'route';cx:number;cz:number;rainfall?:'regional';travel?:'legacy'|'regional';irrigation?:'canister'}
export const DEFAULT_WORKBENCH_CONFIG:WorkbenchConfig={seed:73129,system:'trade',index:0,view:'route',cx:-8,cz:0};
export interface WorkbenchActor {id:string;name:string;activity:string;position:Vec3;carrying:number;distance:number;need:number;needLabel:string}
export interface WorkbenchCheck {id:string;label:string;error:number;pass:boolean}
export interface WorkbenchAction {id:string;label:string;enabled:boolean;reason:string}
export interface WorkbenchEvent {tick:number;action:string;accepted:boolean;domain?:SettlementDomain;targetId?:string}
export interface WorkbenchWeather {model:'legacy'|'regional';phase:string;intensity:number;drySeconds:number;secondsUntilChange:number;description:string}
export interface WorkbenchFreight {routeId:string;name:string;travelRule:'legacy'|'regional';roadWetness:number;travelSpeed:number;travelCondition:'dry'|'wet'|'drying';etaKind:'arrival'|'repair-required'|'none';etaSeconds:number|null}
export interface WorkbenchIrrigation {model:'canister';canisters:number;used:boolean;importedLitres:number;capturedLitres:number;lostOverflowLitres:number;setupCanister:{id:string;x:number;z:number};description:string}
export interface WorkbenchSnapshot {tick:number;seconds:number;name:string;phase:string;job:string;cause:string;fingerprint:string;inventory:Record<string,number>;actors:WorkbenchActor[];checks:WorkbenchCheck[];actions:WorkbenchAction[];firstFailure:{tick:number;checks:WorkbenchCheck[]}|null;atLimit:boolean;setupSeconds:number;ledger:unknown;irrigation?:WorkbenchIrrigation;weather?:WorkbenchWeather;freight?:WorkbenchFreight[];causes?:{id:string;name:string;phase:string;cause:string}[]}
export interface WorkbenchGeometry {bounds:RegionalBounds;chunks:RegionalChunk[];paths:{id:string;name:string;points:Vec3[];color:string}[];markers:{id:string;name:string;position:Vec3}[];summary:string}
export interface WorkbenchReport {kind:'axiom-system-workbench';version:1|2|3;eventEncoding?:'target-v1';sourceRevision:string;config:WorkbenchConfig;scope:string;finalTick:number;events:WorkbenchEvent[];checkpoints:{tick:number;fingerprint:string}[];finalFingerprint:string;geometryFingerprint:string;snapshot:WorkbenchSnapshot;reload:{checked:boolean;pass:boolean|null};visualReview:'not-reviewed'}
export interface WorkbenchReplay {match:boolean;sourceChanged:boolean;firstDifference:string|null;report:WorkbenchReport}
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const integer=(n:unknown,min:number,max:number):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>=min&&n<=max;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function validateWorkbenchConfig(value:unknown):WorkbenchConfig {
 if(!object(value)||Object.keys(value).some(k=>!['seed','system','index','view','cx','cz','rainfall','travel','irrigation'].includes(k))||!integer(value.seed,0,0xffffffff)||typeof value.system!=='string'||!['water','trade','food','settlement'].includes(value.system)||!integer(value.index,0,value.system==='water'?5:value.system==='settlement'?0:2)||typeof value.view!=='string'||!['chunk','settlement','route'].includes(value.view)||!integer(value.cx,REGION_MIN_CHUNK,REGION_MAX_CHUNK)||!integer(value.cz,REGION_MIN_CHUNK,REGION_MAX_CHUNK))throw Error('Choose a valid unsigned seed, system, target and chunk inside the frontier');
 if(value.rainfall!==undefined&&value.rainfall!=='legacy'&&value.rainfall!=='regional')throw Error('Choose rainfall regional or legacy');
 if(value.travel!==undefined&&value.travel!=='legacy'&&value.travel!=='regional')throw Error('Choose freight travel regional or legacy');
 if(value.irrigation!==undefined&&(value.irrigation!=='canister'||value.system!=='food'))throw Error('Emergency irrigation is an optional canister scenario for Food only');
 // Preserve historical key order and omit legacy rainfall/travel for old report fingerprints.
 return {seed:value.seed,system:value.system as WorkbenchConfig['system'],index:value.index,view:value.view as WorkbenchConfig['view'],cx:value.cx,cz:value.cz,...(value.rainfall==='regional'?{rainfall:'regional' as const}:{}),...(value.travel==='regional'?{travel:'regional' as const}:{}),...(value.irrigation==='canister'?{irrigation:'canister' as const}:{})};
}
/** Comparison fingerprint, not an authentication or cryptographic signature. */
export function workbenchFingerprint(value:unknown):string {let hash=2166136261;const text=JSON.stringify(value);for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16).padStart(8,'0');}
export function workbenchTargets(seed:number,system:WorkbenchConfig['system']):string[]{return system==='settlement'?['Alder–Pine settlement']:system==='water'?regionalSupplyPlan(seed).outposts.map(p=>p.name):system==='food'?regionalFoodPlan(seed).farms.map(p=>p.name):regionalTradePlan(seed).routes.map(p=>p.name);}
function canisterSource(seed:number){const source=worldObjects({generation:2,seed}).find(o=>o.kind==='water');if(!source)throw Error('No real water canister exists for this disposable seed');return {id:source.id,x:source.x,z:source.z};}
function fixture(config:WorkbenchConfig):State {
 if(config.system==='settlement')return createSettlementWorkbench(config.seed,config.rainfall,config.travel);
 const supplyVersion=config.rainfall==='regional'?2:1,tradeVersion=config.travel==='regional'?2:1;
 let state=config.system==='food'?enableRegionalFood(createRegionalFoodLabCampaign(config.seed,true,supplyVersion,tradeVersion),config.irrigation==='canister'?2:1):enableRegionalTrade({...createRegionalState(config.seed),frontierSupply:createRegionalSupply(config.seed,supplyVersion)},tradeVersion);
 if(config.irrigation==='canister'){
  const source=canisterSource(config.seed),beforeWater=state.inventory.water;state=applyAction(state,{type:'move',x:source.x,z:source.z});const collected=applyAction(state,{type:'collect',id:source.id});
  if(beforeWater!==0||collected===state||collected.inventory.water!==beforeWater+1||!collected.collected.includes(source.id))throw Error('Disposable emergency canister collection was rejected');state=collected;
 }
 if(config.system==='water'){
  const p=regionalSupplyPlan(config.seed).outposts[config.index]!;
  state=gatherRegionalSupplyMaterials(state,p.deliveryPosition,p.cost).state;
  state=applyAction(state,{type:'move',x:p.deliveryPosition.x,z:p.deliveryPosition.z});
  for(const type of ['deliver','build'] as const){const next=applyAction(state,{type:'regional-supply',command:{type,outpostId:p.id,expectedRevision:state.frontierSupply!.revision}});if(next===state)throw Error('Disposable collector setup was rejected');state=next;}
 }else if(config.system==='trade'){
  const p=regionalTradePlan(config.seed).sources[config.index]!,command={type:'start-source' as const,targetId:p.id,expectedRevision:state.frontierTrade!.revision},position=regionalTradeCommandPosition(config.seed,command)!;
  state=applyAction(state,{type:'move',x:position.x,z:position.z});const next=applyAction(state,{type:'regional-trade',command});if(next===state)throw Error('Disposable freight setup was rejected');state=next;
 }else{
  const p=regionalFoodPlan(config.seed).farms[config.index]!;state=applyAction(state,{type:'move',x:p.interactionPosition.x,z:p.interactionPosition.z});const next=applyAction(state,{type:'regional-food',command:{type:'start-farm',targetId:p.id,expectedRevision:state.frontierFood!.revision}});if(next===state)throw Error('Disposable farm setup was rejected');state=next;
 }
 return state;
}
/** Owns a fresh model only. Never accepts campaign objects, save bytes, storage or a network client. */
export class WorkbenchSession {
 readonly config:WorkbenchConfig;readonly sourceRevision:string;
 #state:State;#geometry:WorkbenchGeometry;#geometryFingerprint:string;#tick=0;#events:WorkbenchEvent[]=[];#checkpoints:{tick:number;fingerprint:string}[]=[];#failure:WorkbenchSnapshot['firstFailure']=null;#reload:WorkbenchReport['reload']={checked:false,pass:null};readonly setupSeconds:number;
 constructor(config:WorkbenchConfig=DEFAULT_WORKBENCH_CONFIG,sourceRevision='not-recorded') {this.config=Object.freeze(validateWorkbenchConfig(config));this.sourceRevision=sourceRevision;this.#state=fixture(this.config);this.#geometry=workbenchGeometry(this.config);this.#geometryFingerprint=workbenchFingerprint(this.#geometry);this.setupSeconds=this.#state.frontierSupply!.ticks*WORKBENCH_STEP;this.check();this.checkpoint();}
 get tick(){return this.#tick;}
 digest(){return workbenchFingerprint({config:this.config,geometry:this.#geometryFingerprint,tick:this.#tick,supply:this.#state.frontierSupply,trade:this.#state.frontierTrade,food:this.#state.frontierFood,wilderness:this.#state.wilderness,inventory:this.#state.inventory,...(this.config.irrigation?{irrigationCollected:this.#state.collected.filter(id=>id===canisterSource(this.config.seed).id)}:{})});}
 private checks():WorkbenchCheck[]{
  const supply=this.#state.frontierSupply!,trade=this.#state.frontierTrade!;
  const checks:WorkbenchCheck[]=supply.outposts.map(o=>{const error=Math.abs(o.captured-o.water-o.spilled-o.consumed-o.residents.reduce((n,r)=>n+r.carrying,0));return {id:o.id+'/water',label:'Collector water · '+regionalSupplyPlan(this.config.seed).outposts.find(p=>p.id===o.id)!.name,error,pass:error<.00001};});
  for(const r of regionalTradeConservation(trade))checks.push({id:r.routeId+'/goods',label:'Freight material · '+regionalTradePlan(this.config.seed).routes.find(p=>p.id===r.routeId)!.name,error:Math.abs(r.deposit-r.total),pass:r.balanced});
  if(this.#state.frontierFood)for(const f of regionalFoodConservation(this.#state.frontierFood)){const error=Math.max(Math.abs(f.food-f.harvested-f.starterGranted),Math.abs(f.water-f.captured-(this.#state.frontierFood.farms.find(farm=>farm.id===f.farmId)?.waterIrrigated??0)),Math.abs(f.seed-2));checks.push({id:f.farmId+'/food',label:'Food, seed and crop water · '+regionalFoodPlan(this.config.seed).farms.find(p=>p.id===f.farmId)!.name,error,pass:f.balanced});}
  if(this.config.irrigation){const error=Math.abs(1-this.#state.inventory.water-this.#state.frontierFood!.farms.reduce((n,f)=>n+(f.waterIrrigated??0)/4,0));checks.push({id:'irrigation/canisters',label:'One collected pack canister → retained pack balance + imported crop litres / 4',error,pass:error===0});}
  if(this.config.system==='settlement')checks.push(...settlementChecks(this.#state));
  return checks;
 }
 private check(){const failed=this.checks().filter(c=>!c.pass);if(failed.length&&!this.#failure)this.#failure={tick:this.#tick,checks:failed};}
 private checkpoint(){this.#checkpoints.push({tick:this.#tick,fingerprint:this.digest()});}
 advance(ticks:number){if(!integer(ticks,0,WORKBENCH_MAX_BATCH))throw Error(`Advance accepts 0–${WORKBENCH_MAX_BATCH} fixed ticks`);for(let i=0;i<ticks&&this.#tick<WORKBENCH_MAX_TICKS&&!this.#failure;i++){this.#state=applyAction(this.#state,{type:'tick',dt:WORKBENCH_STEP});this.#reload={checked:false,pass:null};this.#tick++;this.check();if(this.#tick%40===0)this.checkpoint();}return this.snapshot();}
 private interactions(){const c=this.config,s=this.#state;return c.system==='settlement'?settlementInteractions(s):c.system==='trade'?regionalTradeInteractions(c.seed,s.frontierTrade).filter(a=>a.routeId===regionalTradePlan(c.seed).routes[c.index]!.id):c.system==='food'?regionalFoodInteractions(c.seed,s.frontierFood,s).filter(a=>a.farmId===regionalFoodPlan(c.seed).farms[c.index]!.id):[];}
 action(id:string){
  if(this.#events.length>=WORKBENCH_MAX_EVENTS)throw Error('The bounded replay journal is full; export and reset to start another scenario');
  if(this.config.system==='settlement'){
   const action=settlementInteractions(this.#state).find(a=>a.id===id);if(!action)throw Error('Unknown target action for this scenario');let accepted=false;
   if(action.enabled&&!this.#failure&&this.#tick<WORKBENCH_MAX_TICKS){const next=applySettlementAction(this.#state,action);accepted=next!==this.#state;if(accepted){this.#state=next;this.#reload={checked:false,pass:null};}}
   this.#events.push({tick:this.#tick,action:action.kind,domain:action.domain,targetId:action.targetId,accepted});this.check();return accepted;
  }
  const action=this.interactions().find(a=>a.kind===id);if(!action)throw Error('Unknown action for this scenario');let accepted=false;
  if(action.enabled&&!this.#failure&&this.#tick<WORKBENCH_MAX_TICKS){const moved=applyAction(this.#state,{type:'move',x:action.position.x,z:action.position.z});const next=this.config.system==='trade'?applyAction(moved,{type:'regional-trade',command:action.command as RegionalTradeCommand}):applyAction(moved,{type:'regional-food',command:action.command as RegionalFoodCommand});accepted=next!==moved;if(accepted){this.#state=next;this.#reload={checked:false,pass:null};}}
  this.#events.push({tick:this.#tick,action:id,accepted});this.check();return accepted;
 }
 /** CLI convenience still records every accepted production command for exact replay. */
 assist(){
  if(this.config.system==='settlement'){
   // Refresh revision-bearing production actions after each accepted command.
   // Let loaded carriers reach the obstruction before requesting real repair.
   for(const candidate of settlementInteractions(this.#state)){const action=settlementInteractions(this.#state).find(a=>a.id===candidate.id)!;if(!action.enabled)continue;
    if(action.kind==='clear-route'&&this.#state.frontierTrade!.routes.find(r=>r.id===action.targetId)?.activity!=='blocked')continue;
    this.action(action.id);
   }return;
  }
  for(const action of this.interactions())if(action.enabled&&['clear-route','build-store','tend-crop'].includes(action.kind))this.action(action.kind);
 }
 verifyReload(){const before=serializeSave(this.#state),restored=parseSave(before);this.#reload={checked:true,pass:!!restored&&serializeSave(restored)===before};if(restored&&this.#reload.pass)this.#state=restored;return {...this.#reload};}
 snapshot():WorkbenchSnapshot {
  const c=this.config,s=this.#state,checks=this.checks();let name='',phase='',job='',cause='',inventory:Record<string,number>={},actors:WorkbenchActor[]=[],ledger:unknown,weather:WorkbenchWeather|undefined,causes:WorkbenchSnapshot['causes'],freight:WorkbenchFreight[]|undefined,irrigation:WorkbenchIrrigation|undefined;
  if(c.system==='settlement'){({name,phase,job,cause,inventory,actors,ledger,weather,causes,freight}=settlementSnapshot(s));
  }else if(c.system==='water'){
   const p=regionalSupplyPlan(c.seed).outposts[c.index]!,o=s.frontierSupply!.outposts[c.index]!,summary=regionalSupplySummary(s.frontierSupply!,c.seed,p.id,s.wilderness,s.frontierTrade)!;
   weather=regionalSupplyWeather(s.frontierSupply!,p.id);
   ({name,phase,cause}=summary);job=summary.jobTitle;inventory={water:o.water,captured:o.captured,spilled:o.spilled,consumed:o.consumed,carried:o.residents.reduce((n,r)=>n+r.carrying,0),wood:o.delivered.wood,stone:o.delivered.stone,construction:summary.workProgress};ledger=o;
   actors=regionalSupplyActorPoses(c.seed,s.frontierSupply).filter(a=>a.outpostId===p.id).map(a=>({id:a.id,name:a.name,activity:a.activity,position:a.position,carrying:a.carrying,distance:o.residents.find(r=>r.id===a.id)!.routeProgress,need:a.thirst,needLabel:'thirst'}));
  }else if(c.system==='trade'){
   const p=regionalTradePlan(c.seed).routes[c.index]!,o=s.frontierTrade!.routes[c.index]!,summary=regionalTradeSummary(s.frontierTrade!,c.seed,p.id)!;
   if(s.frontierTrade!.version===2)freight=[projectWorkbenchFreight(summary)];({name,phase,cause}=summary);job=summary.jobTitle;inventory={remaining:o.remaining,stock:o.stock,reserved:o.reserved,cargo:o.cargo,destination:o.destinationStock,construction:o.embodied,withdrawn:o.withdrawn,delivered:o.delivered,distance:o.distance,routeMetres:p.surfaceMetres};ledger=o;
   actors=regionalTradeActorPoses(c.seed,s.frontierTrade).filter(a=>a.routeId===p.id).map(a=>({id:a.id,name:a.name,activity:a.activity,position:a.position,carrying:a.carrying,distance:a.distance,need:0,needLabel:'none'}));
  }else{
   const p=regionalFoodPlan(c.seed).farms[c.index]!,o=s.frontierFood!.farms[c.index]!,summary=regionalFoodSummary(s.frontierFood!,c.seed,p.id,s)!;
   weather=regionalSupplyWeather(s.frontierSupply!,p.siteId);
   ({name,phase,cause}=summary);job=summary.jobTitle;inventory={water:o.water,seeds:o.seeds,growth:o.growth,harvests:o.harvests,harvested:o.harvested,stock:o.stock,reserved:o.reserved,cargo:o.cargo,pantry:o.store,meals:o.meals,starter:o.starterGranted,stewardship:o.stewardship,distance:o.distance};ledger=o;
   if(c.irrigation){Object.assign(inventory,{packCanisters:s.inventory.water,waterIrrigated:o.waterIrrigated??0,rainOverflowCaptured:o.waterCaptured,rainOverflowLost:o.waterLost});irrigation={model:'canister',canisters:s.inventory.water,used:(o.waterIrrigated??0)>0,importedLitres:o.waterIrrigated??0,capturedLitres:o.waterCaptured,lostOverflowLitres:o.waterLost,setupCanister:canisterSource(c.seed),description:'Optional prerequisite fixture: one real world canister is earned by its ordinary collect action at its authored/generated position. Spend it manually for 4 L only when this started farm has at most 2 L. One use per farm for its lifetime; this is not repeatable drought relief. That canister is then unavailable for Mossbank’s three-canister delivery or other water uses. Assist never spends it.'};}
   actors=regionalFoodActorPoses(c.seed,s.frontierFood).filter(a=>a.farmId===p.id).map(a=>({id:a.id,name:a.name,activity:a.activity,position:a.position,carrying:a.carrying,distance:a.distance,need:a.hunger,needLabel:'hunger'}));
  }
  return copy({tick:this.#tick,seconds:this.#tick*WORKBENCH_STEP,name,phase,job,cause,fingerprint:this.digest(),inventory,actors,checks,actions:this.interactions().map(a=>({id:c.system==='settlement'?a.id:a.kind,label:a.label,enabled:a.enabled&&!this.#failure&&this.#tick<WORKBENCH_MAX_TICKS&&this.#events.length<WORKBENCH_MAX_EVENTS,reason:this.#events.length>=WORKBENCH_MAX_EVENTS?'Replay journal full':a.reason})),firstFailure:this.#failure,atLimit:this.#tick>=WORKBENCH_MAX_TICKS,setupSeconds:this.setupSeconds,ledger,...(irrigation?{irrigation}:{}),...(weather?{weather}:{}),...(causes?{causes}:{}),...(freight?{freight}:{})});
 }
 report():WorkbenchReport{return {kind:'axiom-system-workbench',version:this.config.irrigation?3:this.config.system==='settlement'?2:1,...(this.config.system==='settlement'?{eventEncoding:'target-v1' as const}:{}),sourceRevision:this.sourceRevision,config:{...this.config},scope:this.config.irrigation?'Optional Food v2 prerequisite fixture. Existing collectors and freight stores are earned before the scenario starts. One real generated world canister is collected at its actual source position through the ordinary collect action; none is granted. Manual irrigate-farm spends it for four separately conserved crop litres, once per farm only; assist never spends the canister. Active prerequisite seconds are separate from the scenario clock. No inherited overflow is reclaimed. Command approach poses are model assignments, not controller walks. Ordinary quarter-second production, no live storage, renderer, physics, network or release approval.':this.config.system==='settlement'?'Fresh Alder–Pine production state at zero elapsed ticks: two natural finite deposits, two unbuilt freight stores, one unbuilt collector and one unstarted farm. No earned setup, material or water grants, or reclaimed past overflow. Ordinary start-farm later allocates four explicitly conserved starter meals; only meals beyond that grant prove harvested consumption. Commands assign approach poses, not controller traversal. Actual quarter-second production reducers, one active hour, bounded target-v1 action journal, no live storage, renderer, physics, network or release approval.':'Fresh disposable production model. Setup earns resources and prerequisites through existing production fixture commands; approach poses are assigned, not controller walks. Quarter-second active ticks only. No campaign saves, storage, renderer, physics worker or multiplayer session. Replay compares production ledgers and selected generation geometry. All balances are numerical assertions, not rendered approval.',finalTick:this.#tick,events:copy(this.#events),checkpoints:copy(this.#checkpoints),finalFingerprint:this.digest(),geometryFingerprint:this.#geometryFingerprint,snapshot:this.snapshot(),reload:{...this.#reload},visualReview:'not-reviewed'};}
 storageFootprint(){return {saveBytes:new TextEncoder().encode(serializeSave(this.#state)).byteLength,reportBytes:new TextEncoder().encode(JSON.stringify(this.report())).byteLength,eventCount:this.#events.length,checkpointCount:this.#checkpoints.length,geometryChunks:this.#geometry.chunks.length};}
 geometry():WorkbenchGeometry {return copy(this.#geometry);}
}

export function projectWorkbenchFreight(summary:WorkbenchFreight):WorkbenchFreight {const {routeId,name,travelRule,roadWetness,travelSpeed,travelCondition,etaKind,etaSeconds}=summary;return {routeId,name,travelRule,roadWetness,travelSpeed,travelCondition,etaKind,etaSeconds};}

export function workbenchGeometry(config:WorkbenchConfig):WorkbenchGeometry {
 const c=validateWorkbenchConfig(config),supply=regionalSupplyPlan(c.seed).outposts,trade=regionalTradePlan(c.seed),food=c.system==='food'?regionalFoodPlan(c.seed):null;
 const p=c.system==='settlement'?settlementPlan(c.seed).collector:c.system==='water'?supply[c.index]!:c.system==='food'?food!.farms[c.index]!:trade.sources[c.index]!;
 const paths:WorkbenchGeometry['paths']=c.system==='settlement'?settlementGeometryParts(c.seed).paths:c.system==='water'?supply[c.index]!.residents.map(r=>({id:r.id,name:r.name,points:r.path,color:'#87cecb'})):c.system==='food'?[{id:food!.farms[c.index]!.id,name:'Farm → pantry',points:food!.farms[c.index]!.path,color:'#e5bc73'}]:[{id:trade.routes[c.index]!.id,name:trade.routes[c.index]!.name,points:trade.routes[c.index]!.points,color:'#e5bc73'}];
 const points=paths.flatMap(p=>p.points),markers:WorkbenchGeometry['markers']=c.system==='settlement'?settlementGeometryParts(c.seed).markers:c.system==='trade'?[trade.sources[c.index]!,trade.projects[c.index]!].map(p=>({id:p.id,name:p.name,position:p.position})):[{id:p.id,name:p.name,position:p.position}];
 let chunks:RegionalChunk[]=[],bounds:RegionalBounds;
 if(c.view==='route')bounds={minX:Math.min(...points.map(p=>p.x))-12,maxX:Math.max(...points.map(p=>p.x))+12,minZ:Math.min(...points.map(p=>p.z))-12,maxZ:Math.max(...points.map(p=>p.z))+12};
 else if(c.view==='chunk'){const chunk=generateRegionalChunk(c.seed,c.cx,c.cz);chunks=[chunk];bounds=chunk.bounds;}
 else{
  const center=c.system==='water'||c.system==='settlement'?p.position:regionalPlan(c.seed).sites.find(s=>s.id===(p as {siteId:string}).siteId)!.position;
  bounds={minX:center.x-32,maxX:center.x+32,minZ:center.z-32,maxZ:center.z+32};const a=regionalChunkAt(bounds.minX,bounds.minZ),b=regionalChunkAt(bounds.maxX,bounds.maxZ);
  for(let z=a.cz;z<=b.cz;z++)for(let x=a.cx;x<=b.cx;x++)chunks.push(generateRegionalChunk(c.seed,x,z));
 }
 return {bounds,chunks,paths,markers,summary:c.view==='route'?`${points.length} production route points · elevations retained · no terrain chunks loaded`:c.view==='chunk'?`One production 64 m chunk · ${chunks[0]!.budget.vertices} vertices · ${chunks[0]!.features.length} features`:`One settlement window · ${chunks.length} intersecting production chunks · 64 × 64 m view`};
}

export function parseWorkbenchReport(text:string):WorkbenchReport {
 if(text.length>2_000_000)throw Error('Replay exceeds the 2 MB limit');let v:unknown;try{v=JSON.parse(text);}catch{throw Error('Replay must be a workbench JSON report');}
 if(!object(v)||Object.keys(v).some(k=>!['kind','version','eventEncoding','sourceRevision','config','scope','finalTick','events','checkpoints','finalFingerprint','geometryFingerprint','snapshot','reload','visualReview'].includes(k))||v.kind!=='axiom-system-workbench'||![1,2,3].includes(v.version as number)||!integer(v.finalTick,0,WORKBENCH_MAX_TICKS)||!Array.isArray(v.events)||v.events.length>WORKBENCH_MAX_EVENTS||!Array.isArray(v.checkpoints)||v.checkpoints.length>WORKBENCH_MAX_TICKS/40+1||typeof v.finalFingerprint!=='string'||!/^[a-f0-9]{8}$/.test(v.finalFingerprint)||typeof v.geometryFingerprint!=='string'||!/^[a-f0-9]{8}$/.test(v.geometryFingerprint)||typeof v.sourceRevision!=='string'||v.sourceRevision.length>160)throw Error('Unsupported or unbounded workbench replay');
 const config=validateWorkbenchConfig(v.config);
 if(v.version===3?(config.system!=='food'||config.irrigation!=='canister'||v.eventEncoding!==undefined):v.version===2?(config.system!=='settlement'||v.eventEncoding!=='target-v1'||config.irrigation!==undefined):(config.system==='settlement'||config.irrigation!==undefined||v.eventEncoding!==undefined))throw Error('Report version does not match its action encoding');
 const targets=config.system==='settlement'?settlementInteractions(createSettlementWorkbench(config.seed,config.rainfall,config.travel)):[];
 const allowed=config.system==='trade'?['start-source','clear-route','build-store','withdraw-reserve']:config.system==='food'?['start-farm','tend-crop',...(config.irrigation?['irrigate-farm']:[])]:[];let tick=0;
 for(const e of v.events){if(!object(e)||!integer(e.tick,tick,v.finalTick)||typeof e.action!=='string'||typeof e.accepted!=='boolean')throw Error('Invalid replay action timeline');
  if(v.version===2){if(Object.keys(e).length!==5||!targets.some(a=>a.kind===e.action&&a.domain===e.domain&&a.targetId===e.targetId))throw Error('Invalid replay target action');}
  else if(Object.keys(e).length!==3||!allowed.includes(e.action))throw Error('Invalid replay legacy action');
  tick=e.tick;}
 if(v.checkpoints.length!==Math.floor(v.finalTick/40)+1)throw Error('Missing replay checkpoints');let previous=-40;for(const p of v.checkpoints){if(!object(p)||!integer(p.tick,0,v.finalTick)||p.tick!==previous+40||p.tick%40!==0||typeof p.fingerprint!=='string'||!/^[a-f0-9]{8}$/.test(p.fingerprint))throw Error('Invalid replay checkpoint');previous=p.tick;}
 return {...v,config} as unknown as WorkbenchReport;
}
export function replayWorkbench(report:WorkbenchReport,sourceRevision='not-recorded'):{session:WorkbenchSession;result:WorkbenchReplay} {
 const input=parseWorkbenchReport(JSON.stringify(report)),session=new WorkbenchSession(input.config,sourceRevision),differences:{tick:number;message:string}[]=[];
 for(const event of input.events){while(session.tick<event.tick){const prior=session.tick;session.advance(Math.min(WORKBENCH_MAX_BATCH,event.tick-session.tick));if(session.tick===prior)break;}if(session.tick!==event.tick){differences.push({tick:session.tick,message:`Simulation stopped before action at tick ${event.tick}`});break;}if(session.action(input.version===2?settlementActionId(event.domain!,event.targetId!,event.action):event.action)!==event.accepted)differences.push({tick:event.tick,message:`Action ${event.action} changed acceptance at tick ${event.tick}`});}
 while(session.tick<input.finalTick){const prior=session.tick;session.advance(Math.min(WORKBENCH_MAX_BATCH,input.finalTick-session.tick));if(session.tick===prior)break;}
 const output=session.report();if(output.geometryFingerprint!==input.geometryFingerprint)differences.push({tick:0,message:'Selected generation geometry differs'});for(const expected of input.checkpoints){const actual=output.checkpoints.find(c=>c.tick===expected.tick);if(actual?.fingerprint!==expected.fingerprint){differences.push({tick:expected.tick,message:`State first differs at sampled tick ${expected.tick}`});break;}}
 if(output.finalFingerprint!==input.finalFingerprint)differences.push({tick:input.finalTick,message:`Final state differs at tick ${input.finalTick}`});
 differences.sort((a,b)=>a.tick-b.tick);const firstDifference=differences[0]?.message??null;
 return {session,result:{match:firstDifference===null,sourceChanged:input.sourceRevision!==sourceRevision,firstDifference,report:output}};
}
