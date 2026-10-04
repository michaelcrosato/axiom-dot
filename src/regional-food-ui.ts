import {regionalFoodPlan,regionalFoodSummary,regionalFoodActorPoses,REGIONAL_FOOD_STEP,type RegionalFoodState,type RegionalFoodCommand,type RegionalFoodDependencies} from './regional-food.ts';
import {regionalTradePlan} from './regional-trade.ts';
import type {WorldMapOverlay} from './world-map-view.ts';

export type RegionalFoodUIContext=RegionalFoodDependencies;
export interface RegionalFoodPanelOptions {
 farmId:string;
 /** Snapshot getters are re-read only on intent, never retained as mutable state. */
 readState:()=>RegionalFoodState|undefined;
 context?:RegionalFoodUIContext;
 /** Must include alive/grounded, exact E / X proximity and accepted-visible terrain. */
 canRun:(command:RegionalFoodCommand)=>boolean;
 command:(command:RegionalFoodCommand)=>void;
 close:()=>void;
 map?:()=>void;
 continuesInMenus?:boolean;
 collector?:()=>void;
 freight?:()=>void;
}
export interface RegionalFoodJournalOptions {seed:number;open:(farmId:string)=>void;map?:()=>void;context?:RegionalFoodUIContext}
const number=(value:number)=>Number.isFinite(value)?value.toFixed(1).replace(/\.0$/,''):'0';
function node<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string):HTMLElementTagNameMap[K]{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;}
function focusKey(container:HTMLElement):string|undefined{return document.activeElement instanceof HTMLElement&&container.contains(document.activeElement)?document.activeElement.dataset.regionalFoodFocus:undefined;}
function restoreFocus(container:HTMLElement,key:string|undefined){if(!key)return;const candidates=Array.from(container.querySelectorAll<HTMLElement>('[data-regional-food-focus]')),target=candidates.find(e=>e.dataset.regionalFoodFocus===key&&!('disabled'in e&&e.disabled))??candidates.find(e=>e.dataset.regionalFoodFocus==='close');if(target)target.focus({preventScroll:true});else{container.tabIndex=-1;container.focus({preventScroll:true});}}
function inspectButton(label:string,key:string,open:()=>void){const button=node('button',label,'frontier-action');button.type='button';button.dataset.regionalFoodFocus=key;button.onclick=open;return button;}
export function regionalFoodTravelText(value:number|null):string{if(value===null||!Number.isFinite(value))return 'waiting for the next delivery';const seconds=Math.max(0,Math.ceil(value));return seconds<60?`${seconds} active sec`:`${Math.floor(seconds/60)} min ${seconds%60} sec active`;}
export function regionalFoodPhaseText(phase:string):string{
 const labels:Record<string,string>={paused:'Food clock limit reached',planned:'Farm not started','not-started':'Farm not started','needs-collector':'Rainwater collector needed','needs-store':'Completed freight store needed','water-shortage':'Waiting for overflow water','seed-shortage':'Waiting for returned seed','store-full':'Food pantry full','source-full':'Harvest space full','capacity-full':'Food storage full',planting:'Planting a finite seed',growing:'Crop growing',ripe:'Crop ready to harvest',harvesting:'Harvesting food',loading:'Loading reserved food','in-transit':'Food on its delivery route',unloading:'Unloading into the pantry',eating:'Eating a delivered meal',operational:'Meals supporting local work',waiting:'Waiting for supplies','needs-water':'Waiting for overflow water',feeding:'Eating delivered food',stocked:'Food pantry stocked'};
 return labels[phase]??phase.replace(/-/g,' ');
}
const activities:Record<string,string>={paused:'Food simulation paused',waiting:'Waiting for a funded crop',idle:'Waiting at the farm',planting:'Planting',growing:'Tending the growing crop',tending:'Tending the growing crop',harvesting:'Harvesting the ripe crop',loading:'Loading reserved food',outbound:'Carrying food to the freight-store pantry',unloading:'Unloading at the pantry',eating:'Eating a delivered meal',returning:'Returning to the farm',hungry:'Waiting for a meal','water-shortage':'Waiting for overflow water','seed-shortage':'Waiting for a returned seed','source-full':'Waiting for harvest space','store-full':'Waiting for pantry space'};
function routeText(farm:ReturnType<typeof regionalFoodPlan>['farms'][number]){return `${number(farm.surfaceMetres)} m actual route · ${regionalFoodTravelText(farm.surfaceMetres/farm.speed)} each way at ${number(farm.speed)} m/s`;}
function motionText(farm:ReturnType<typeof regionalFoodPlan>['farms'][number],saved:RegionalFoodState['farms'][number]){
 const returning=saved.activity==='returning',travel=saved.activity==='outbound'||returning;
 return `${activities[saved.activity]??saved.activity}. ${number(saved.distance)} / ${number(farm.surfaceMetres)} m from farm${travel?` · ${regionalFoodTravelText((returning?saved.distance:Math.max(0,farm.surfaceMetres-saved.distance))/farm.speed)} ${returning?'to return':'to pantry arrival'}`:''}`;
}
/** Distinct blocked causes remain visible even when another part of the loop moves. */
export function regionalFoodPendingText(farm:ReturnType<typeof regionalFoodPlan>['farms'][number],saved:RegionalFoodState['farms'][number]):string[]{
 const reasons:string[]=[];if(saved.startedAt===null)return reasons;
 if(saved.crop==='empty'){
  if(saved.seeds<1)reasons.push('Seed shortage: no seed portion is available for planting.');
  if(saved.water<farm.waterPerCrop)reasons.push(`Water shortage: ${number(Math.max(0,farm.waterPerCrop-saved.water))} L more ${saved.waterIrrigated===0?'crop water is needed to plant. New overflow or this farm’s unused one-time emergency canister can supply it':'new collector overflow is needed to plant'}.`);
  if(saved.stock+farm.yield>farm.capacity.source)reasons.push(`Harvest capacity full: the next ${farm.yield}-food crop needs ${farm.yield} free source slots.`);
 }
 if(saved.activity==='idle'&&saved.stock>=farm.capacity.cargo&&farm.capacity.store-saved.store<farm.capacity.cargo)reasons.push(`Pantry capacity pending: ${farm.capacity.store-saved.store} free slots; a ${farm.capacity.cargo}-food load waits until meals free enough space.`);
 return reasons;
}
function transferText(saved:RegionalFoodState['farms'][number],rate:number){
 if(saved.activity==='loading'||saved.activity==='unloading')return `${saved.activity==='loading'?'Loading':'Unloading'} work: ${Math.min(100,Math.round(saved.actionWork/8*100))}% · ${regionalFoodTravelText(Math.max(0,8-saved.actionWork)/Math.max(.5,rate)*REGIONAL_FOOD_STEP)} of work left at the current meal-supported rate.`;
 if(saved.activity==='eating')return `Eating: ${Math.min(100,Math.round(saved.actionWork/8*100))}% · ${regionalFoodTravelText(Math.max(0,8-saved.actionWork)*REGIONAL_FOOD_STEP)} before this held meal is consumed.`;
 return '';
}
export function regionalFoodPrerequisiteText(seed:number,farmId:string,context?:RegionalFoodUIContext,irrigation=false):{collector:string;freight:string}{
 const farm=regionalFoodPlan(seed).farms.find(f=>f.id===farmId);if(!farm)return {collector:'Collector unavailable',freight:'Freight store unavailable'};
 const outpost=context?.frontierSupply?.seed===seed?context.frontierSupply.outposts.find(o=>o.id===farm.siteId):undefined;
 const projectIndex=regionalTradePlan(seed).projects.findIndex(p=>p.id===farm.storeId),store=context?.frontierTrade?.seed===seed&&projectIndex>=0?context.frontierTrade.routes[projectIndex]:undefined;
 const collector=!outpost?'Rain collector status unavailable in this snapshot.':outpost.builtAt!==null?`Rain collector operational · ${number(outpost.water)} L stored for resident drinking. ${irrigation?'New overflow supplies renewable crop water; the one-time canister import is accounted separately.':'Only new overflow can reach this farm.'}`:outpost.buildStartedAt!==null?`Rain collector under construction. ${irrigation?'Rain-fed crop water waits until the collector operates and overflows; one-use emergency irrigation stays separate.':'Crop water must wait until the collector operates and overflows.'}`:`Rain collector not built. Deliver its real wood and stone and start the retrofit before expecting ${irrigation?'rain-fed ':''}crop water.`;
 const freight=!store?'Freight-store status unavailable in this snapshot.':store.builtAt!==null?'Freight store complete. Its separate food pantry can receive actual deliveries.':store.buildStartedAt!==null?'Freight store under construction. Finish it before starting this farm.':'Freight store not built. Deliver freight and build the store before starting this farm.';
 return {collector,freight};
}
/** A lifetime entitlement is separate from the player's current canister balance. */
export function regionalFoodIrrigationText(saved:RegionalFoodState['farms'][number],context?:RegionalFoodUIContext):string {
 const balance=context?.inventory?.water,pack=balance===undefined?'Pack canister balance unavailable.':`${balance} pack canister${balance===1?'':'s'} available.`;
 return `${pack} ${saved.waterIrrigated?`Emergency irrigation used permanently at this farm: ${number(saved.waterIrrigated)} L imported. No second canister can be added.`:'One lifetime application remains at this farm. After the farm starts, spend exactly 1 earned pack canister for 4 L when crop water is at most 2 L.'} This is not repeatable drought relief. A spent canister is no longer available for Mossbank’s three-canister delivery or other water uses.`;
}
/** Metadata only: no food production, route travel, spending or terrain streaming. */
export function regionalFoodMapDetail(seed:number,farmId:string,state?:RegionalFoodState,context?:RegionalFoodUIContext):string{
 const farm=regionalFoodPlan(seed).farms.find(f=>f.id===farmId);if(!farm)return '';
 if(!state||state.seed!==seed)return `${farm.name} → ${farm.storeName}. A small renewable food loop uses new overflow from the existing rainwater collector, then delivers food to the completed freight store. ${routeText(farm)}. Inspect the farm with E / X.`;
 const saved=state.farms.find(f=>f.id===farm.id),summary=regionalFoodSummary(state,seed,farm.id,context);if(!saved||!summary)return '';
 const prerequisites=regionalFoodPrerequisiteText(seed,farm.id,context,state.version===2);
 return `${regionalFoodPhaseText(summary.phase)}. ${summary.cause} ${prerequisites.collector} ${prerequisites.freight} ${regionalFoodPendingText(farm,saved).join(' ')} ${state.version===2?regionalFoodIrrigationText(saved,context)+' ':''}${number(saved.water)} / ${farm.capacity.water} L crop water · ${saved.seeds} seeds · ${saved.stock} source food · ${saved.reserved} reserved · ${saved.cargo} cargo · ${saved.store} pantry food · ${saved.meals} meals consumed. ${routeText(farm)}. ${summary.benefit}`;
}
/** Six fixed discovery marks, plus at most three authoritative loaded/empty carriers. */
export function regionalFoodMapOverlay(state:RegionalFoodState|undefined,context?:RegionalFoodUIContext):WorldMapOverlay{
 const overlay:WorldMapOverlay={markers:[],routes:[]};if(!state)return overlay;
 const plan=regionalFoodPlan(state.seed),poses=regionalFoodActorPoses(state.seed,state);
 for(const farm of plan.farms){const saved=state.farms.find(f=>f.id===farm.id);if(!saved)continue;const detail=regionalFoodMapDetail(state.seed,farm.id,state,context);
  overlay.markers.push({id:farm.id,name:farm.name,x:farm.interactionPosition.x,z:farm.interactionPosition.z,kind:'farm',targetId:farm.id,detail,inspectLabel:'Regional food & meals'});
  overlay.markers.push({id:`${farm.id}/pantry`,name:`${farm.storeName} · food pantry`,x:farm.storeInteractionPosition.x,z:farm.storeInteractionPosition.z,kind:'pantry',targetId:farm.id,detail:`${saved.store} / ${farm.capacity.store} food stored here · ${saved.meals} meals consumed. ${detail}`,inspectLabel:'Regional food & meals',local:true});
  overlay.routes.push({id:`${farm.id}/delivery`,points:farm.path.map(p=>({x:p.x,z:p.z})),blocked:saved.startedAt===null});
  const carrier=poses.find(p=>p.farmId===farm.id&&p.kind==='carrier');if(carrier&&saved.startedAt!==null)overlay.markers.push({id:carrier.id,name:carrier.name,x:carrier.position.x,z:carrier.position.z,kind:'carrier',targetId:farm.id,local:true,inspectLabel:'Regional food & meals',detail:`${motionText(farm,saved)}. ${saved.cargo} actual food cargo → ${farm.storeName}${saved.returnMeal>0?` · ${saved.returnMeal} meal returning to the farm`:''}. ${routeText(farm)}.`});
 }
 return overlay;
}
/** Discoverable alongside the six existing regional communities. */
export function mountRegionalFoodJournalSection(container:HTMLElement,state:RegionalFoodState|undefined,options:RegionalFoodJournalOptions):void{
 const focused=focusKey(container);container.replaceChildren();container.className='frontier-section';container.setAttribute('aria-label','Regional farms, food deliveries and meals');
 container.append(node('h3','REGIONAL FOOD + MEALS'),node('p',`Three small farms use the existing outpost collectors and freight stores. Residents drink first; ${state?.version===2?'new collector overflow and a one-use emergency canister per farm can enter crop storage':'only new collector overflow can enter crop storage'}. Harvested food must be carried to a completed store before it becomes a meal. Four one-time starter provisions in each completed pantry support the first trips.`,'frontier-notice'));
 if(!state||state.seed!==options.seed){container.append(node('p','Open a 10 km² frontier to discover the regional farms. The original field gardens keep their separate seeds, crops and recipes.','frontier-small'));restoreFocus(container,focused);return;}
 for(const farm of regionalFoodPlan(state.seed).farms){const saved=state.farms.find(f=>f.id===farm.id),summary=regionalFoodSummary(state,state.seed,farm.id,options.context);if(!saved||!summary)continue;
  const row=node('article',undefined,'frontier-town');row.append(node('h4',`${farm.name} → ${farm.storeName}`),node('p',regionalFoodPhaseText(summary.phase),'machine-status'),node('p',summary.cause+' '+regionalFoodPendingText(farm,saved).join(' '),'frontier-small'),node('p',`${number(saved.water)} L crop water · ${saved.seeds} seeds · ${saved.stock} source food · ${saved.cargo} cargo · ${saved.store} pantry food · ${saved.meals} meals consumed`,'frontier-small'),node('p',routeText(farm),'frontier-small'),node('p',summary.benefit,'frontier-small'),inspectButton(`Inspect ${farm.name}`,farm.id,()=>options.open(farm.id)));if(state.version===2)row.append(node('p',regionalFoodIrrigationText(saved,options.context),'frontier-small'));container.append(row);
 }
 container.append(node('p','Job progress and shortages come from the shared food ledger. Inspecting the journal or map changes no supplies. Visit a farm’s E / X point to start it or help tend one funded crop.','frontier-small'));
 if(options.map)container.append(inspectButton('Show farms and pantries on map','map',options.map));restoreFocus(container,focused);
}
/** Literal DOM from committed snapshots, with current-revision one-shot intents. */
export function mountRegionalFoodPanel(container:HTMLElement,state:RegionalFoodState,options:RegionalFoodPanelOptions):void{
 const focused=focusKey(container),ledgerOpen=container.querySelector<HTMLDetailsElement>('details[data-regional-food-ledger]')?.open??false;container.replaceChildren();
 const close=inspectButton('×','close',options.close);close.className='close';close.setAttribute('aria-label','Close regional food');container.append(close);
 const farm=regionalFoodPlan(state.seed).farms.find(f=>f.id===options.farmId),saved=state.farms.find(f=>f.id===options.farmId),summary=regionalFoodSummary(state,state.seed,options.farmId,options.context);
 if(!farm||!saved||!summary){container.append(node('h2','Regional farm unavailable'),node('p','Choose a farm or food pantry from this world’s journal or map.'));restoreFocus(container,focused);return;}
 container.append(node('span','REGIONAL FOOD · CONSERVED WATER + CARGO','eyebrow'),node('h2',farm.name),node('p',regionalFoodPhaseText(summary.phase),'machine-status'),node('p',summary.cause,'frontier-notice'));
 const commandButton=(type:RegionalFoodCommand['type'],label:string)=>{const button=inspectButton(label,type,()=>{}),initial:RegionalFoodCommand={type,targetId:farm.id,expectedRevision:state.revision};let sent=false;button.disabled=!options.canRun(initial);button.onclick=()=>{if(sent||button.disabled)return;const latest=options.readState();if(!latest||latest.seed!==state.seed)return;const command:RegionalFoodCommand={type,targetId:farm.id,expectedRevision:latest.revision};if(!options.canRun(command))return;sent=true;button.disabled=true;options.command(command);};return button;};
 for(const reason of regionalFoodPendingText(farm,saved))container.append(node('p',reason,'frontier-notice'));
 const prerequisites=regionalFoodPrerequisiteText(state.seed,farm.id,options.context,state.version===2);
 container.append(node('h3','COMMUNITY PREREQUISITES'),node('p',prerequisites.collector,'machine-status'),node('p',prerequisites.freight,'machine-status'));
 if(options.collector)container.append(inspectButton('Inspect rain collector','collector',options.collector));
 if(options.freight)container.append(inspectButton('Inspect freight store','freight',options.freight));
 if(saved.startedAt===null)container.append(commandButton('start-farm','Start regional farm'));
 container.append(node('h3','COLLECTOR OVERFLOW → CROP WATER'),node('p',`${number(saved.water)} / ${farm.capacity.water} L available · ${number(saved.waterCaptured)} L captured for crops · ${number(saved.waterUsed)} L spent growing food`,'machine-status'),node('p',`Each crop needs ${farm.waterPerCrop} L and one seed. The existing collector’s stored drinking water and resident flasks are protected. Historical spilled water is never reclaimed; crop storage receives ${state.version===2?'newly spilled collector water after this farm starts, plus the separately recorded one-time canister import':'only newly spilled collector water after this farm starts'}.`,'frontier-small'));
 if(state.version===2){container.append(node('h3','EMERGENCY IRRIGATION · ONE USE PER FARM'),node('p',regionalFoodIrrigationText(saved,options.context),'frontier-notice'),node('p',`${number(saved.waterIrrigated??0)} L imported from a canister · ${number(saved.waterCaptured)} L rain overflow captured · ${number(saved.waterLost)} L uncaptured rain overflow lost`,'machine-status'));if(!saved.waterIrrigated)container.append(commandButton('irrigate-farm','Spend 1 canister → 4 L · once per farm'));}
 container.append(node('h3','SEED → GROWTH → HARVEST'),node('p',`${saved.seeds} seeds available · ${saved.seedsSown} sown · ${saved.seedsReturned} returned by harvest`,'machine-status'),node('p',saved.crop==='empty'?'The bed is empty. Planting waits for a seed, enough real water, and harvest capacity.':saved.crop==='ripe'?`Ripe crop ready for ${farm.yield} food; harvest waits if source capacity is full.`:`Growing: ${Math.min(100,Math.round(saved.growth/farm.growWork*100))}% of required work completed.`,'frontier-small'),node('p',`${saved.stock} / ${farm.capacity.source} food at farm · ${saved.reserved} reserved for loading · ${saved.harvested} harvested in total`,'frontier-small'));
 if(saved.crop==='ripe')container.append(node('p',`Harvest work: ${Math.min(100,Math.round(saved.harvestWork/16*100))}% · ${regionalFoodTravelText(Math.max(0,16-saved.harvestWork)/Math.max(.5,summary.farmerWorkRate)*REGIONAL_FOOD_STEP)} remaining at the current meal-supported rate.`,'frontier-small'));
 if(saved.startedAt!==null)container.append(commandButton('tend-crop','Help tend this crop'));
 container.append(node('p','Returned seeds come from completed harvests. Water or seed shortages pause planting; full storage pauses the affected transfer. Helping can add crop work only to a funded growing crop.','frontier-small'));
 container.append(node('h3','ACTUAL DELIVERY → EXISTING FREIGHT STORE'),node('p',`${farm.carrierName}: ${motionText(farm,saved)}.`,'machine-status'),node('p',`${routeText(farm)}. These are travel times only; loading, unloading and meals add their actual work time.`,'frontier-small'),node('p',`${saved.reserved} food reserved · ${saved.cargo} / ${farm.capacity.cargo} loaded food · ${saved.delivered} delivered in total · destination: ${farm.storeName}`,'frontier-small'),node('p',`${saved.store} / ${farm.capacity.store} food in the completed freight store’s separate pantry. ${saved.starterGranted} one-time starter provisions granted here, never replenished. ${saved.returnMeal} meal carried back toward the farm · ${saved.farmerMeal} meal held by the farmer · ${saved.carrierMeal} meal held by the carrier.`,'frontier-small'));
 const transfer=transferText(saved,summary.carrierWorkRate);if(transfer)container.append(node('p',transfer,'machine-status'));
 container.append(node('h3','MEALS → RESIDENT WORK'),node('p',`${saved.meals} actual meals consumed. ${summary.benefit}`,'frontier-notice'));
 for(const pose of regionalFoodActorPoses(state.seed,state).filter(p=>p.farmId===farm.id))container.append(node('p',`${pose.name}: ${activities[pose.activity]??pose.activity} · hunger ${Math.round(pose.hunger)}% · ${Math.round(pose.workRate*100)}% work rate${pose.kind==='carrier'?` · ${saved.cargo} food cargo`:''}`,'frontier-small'));
 container.append(node('p',`Job: ${summary.jobTitle}. ${summary.stewardship} / 4 finite stewardship marks earned here; ${summary.remainingStewardship} left.`,'frontier-small'),node('p',`E / X uses the existing contextual interaction slot. Farm commands need a living, grounded explorer at the accepted, visible farm point. ${state.version===2?'Map and journal inspection cannot remotely start, tend or irrigate a crop.':'Map and journal inspection cannot remotely start or tend a crop.'}`,'frontier-small'),node('p',options.continuesInMenus?'The online world continues while this panel is open; figures refresh from its authority. Travel and work count active simulation time.':'Close this panel to let food work and deliveries continue. Solo menus pause the simulation; there is no offline catch-up.','frontier-notice'));
 if(options.map)container.append(inspectButton('Show farms and pantries on map','map',options.map));
 const ledger=node('details',undefined,'frontier-explainer');ledger.dataset.regionalFoodLedger='true';ledger.open=ledgerOpen;const heading=node('summary','Food, seed and water ledger');heading.dataset.regionalFoodFocus='ledger';ledger.append(heading,node('p',`${saved.starterGranted} one-time starter provisions + ${saved.harvested} harvested food = ${saved.stock} at farm + ${saved.reserved} reserved + ${saved.cargo} loaded cargo + ${saved.store} pantry food + ${saved.returnMeal} returning meal + ${saved.farmerMeal} farmer-held meal + ${saved.carrierMeal} carrier-held meal + ${saved.meals} consumed meals.`,'frontier-small'),node('p',`${number(saved.waterCaptured)} L crop water captured${state.version===2?` + ${number(saved.waterIrrigated??0)} L imported canister water`:''} = ${number(saved.water)} L stored + ${number(saved.waterUsed)} L used. Uncaptured overflow since this food ledger began: ${number(saved.waterLost)} L. Collector lifetime overflow watermark: ${number(saved.sourceSpilled)} L.`,'frontier-small'),node('p',`World clock: ${number(state.ticks*REGIONAL_FOOD_STEP)} active seconds. Three bounded food loops share existing community infrastructure. Original field-garden terrain, seeds and recipes are separate.`,'frontier-small'));container.append(ledger);restoreFocus(container,focused);
}
