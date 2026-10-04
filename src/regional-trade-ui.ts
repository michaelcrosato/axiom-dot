import {regionalTradePlan,regionalTradeSummary,regionalTradeActorPoses,REGIONAL_TRADE_STEP,type RegionalTradeState,type RegionalTradeCommand,type RegionalTradeMaterial,type RegionalTradeSummary} from './regional-trade.ts';

export interface RegionalTradePanelOptions {
 targetId:string;
 /** Re-read authority on click, before constructing an exact current-revision command. */
 readState:()=>RegionalTradeState|undefined;
 command:(command:RegionalTradeCommand)=>void;
 /** Must include current proximity, alive/grounded and acknowledged-collision gates. */
 canRun:(command:RegionalTradeCommand)=>boolean;
 close:()=>void;
 continuesInMenus?:boolean;
 map?:()=>void;
 /** Inspect the existing destination store’s food distribution loop. */
 food?:()=>void;
}
export interface RegionalTradeJournalOptions {seed:number;open:(targetId:string)=>void;map?:()=>void}
export interface RegionalTradeMapOverlay {
 markers:{id:string;name:string;x:number;z:number;detail:string;kind:'resource'|'carrier'|'repair'|'project';targetId:string}[];
 routes:{id:string;points:{x:number;z:number}[];blocked:boolean}[];
}
const number=(value:number)=>Number.isFinite(value)?value.toFixed(1).replace(/\.0$/,''):'0';
const materialName=(material:RegionalTradeMaterial)=>material==='quarry-stone'?'quarry stone':'deadwood timber';
export function regionalTradeDistanceText(value:number):string {return `${number(Math.max(0,Number.isFinite(value)?value:0))} m`;}
export function regionalTradeTravelText(value:number|null):string {
 if(value===null||!Number.isFinite(value))return 'no delivery currently travelling';
 const seconds=Math.max(0,Math.ceil(value));return seconds<60?`${seconds} active sec`:`${Math.floor(seconds/60)} min ${seconds%60} sec active`;
}
function node<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string):HTMLElementTagNameMap[K]{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;}
function focusKey(container:HTMLElement):string|undefined {return document.activeElement instanceof HTMLElement&&container.contains(document.activeElement)?document.activeElement.dataset.regionalTradeFocus:undefined;}
function restoreFocus(container:HTMLElement,key:string|undefined){if(!key)return;const candidates=Array.from(container.querySelectorAll<HTMLElement>('[data-regional-trade-focus]')),target=candidates.find(element=>element.dataset.regionalTradeFocus===key&&!('disabled'in element&&element.disabled))??candidates.find(element=>element.dataset.regionalTradeFocus==='close');if(target)target.focus({preventScroll:true});else{container.tabIndex=-1;container.focus({preventScroll:true});}}
function resolveRoute(seed:number,targetId:string){return regionalTradePlan(seed).routes.find(route=>[route.id,route.sourceId,route.projectId,route.obstruction.id].includes(targetId));}
export function regionalTradePhaseText(phase:RegionalTradeSummary['phase']):string {
 const names:Record<RegionalTradeSummary['phase'],string>={planned:'Extraction not started',producing:'Extracting finite stock',shortage:'Waiting for source stock',blocked:'Freight route blocked',repairing:'Crew repairing the obstruction','in-transit':'Freight on the road',ready:'Construction materials delivered',building:'Freight store under construction',operational:'Freight store in use',exhausted:'Source exhausted'};return names[phase];
}
const activities:Record<string,string>={idle:'Waiting at the source',loading:'Loading reserved stock',outbound:'Carrying freight to the destination',blocked:'Stopped before the obstruction',unloading:'Unloading at the destination',returning:'Returning empty on the same road',finished:'Finished at the source'};
/** Arrival is a model forecast through unloading, never distance / current speed. */
export function regionalTradeEtaText(summary:RegionalTradeSummary):string {
 if(summary.carrierActivity==='finished')return 'all deliveries complete';
 if(summary.carrierActivity==='returning')return 'returning empty; no delivery currently travelling';
 if(summary.etaKind==='repair-required')return 'freight-bed repair required before delivery; no arrival estimate';
 if(summary.etaKind==='arrival'&&summary.etaSeconds!==null)return `${regionalTradeTravelText(summary.etaSeconds)} to finish delivery, including unloading`;
 return summary.carrierActivity==='loading'?'loading reserved cargo; no arrival estimate':summary.carrierActivity==='idle'?'waiting at the source; no delivery currently travelling':'no arrival estimate';
}
function routeText(summary:RegionalTradeSummary):string{return `${regionalTradeDistanceText(summary.surfaceMetres)} actual route · about ${regionalTradeTravelText(summary.travelSeconds)} ${summary.travelRule==='regional'?'dry-road baseline':'fixed-rule travel'} one way at 1.8 m/s`;}
export function regionalTradeWeatherText(summary:RegionalTradeSummary):string {
 if(summary.travelRule==='legacy')return 'Legacy freight timing · Fixed walking speed: 1.8 m/s. This saved freight ledger has no weather slowdown.';
 const speed=summary.travelSpeed.toFixed(3).replace(/\.?0+$/,''),wetness=Math.round(summary.roadWetness*100),condition=summary.travelCondition==='dry'?'Dry road; baseline speed restored':summary.travelCondition==='drying'?'Road drying; walking speed is recovering':'Wet road; softened footing slows freight';
 return `Weather-aware freight · Road wetness: ${wetness}% · Route walking speed now: ${speed} m/s. ${condition}. Dry weather removes 25 percentage points of wetness every 30 active sec until dry. One route-midpoint climate sample applies to the whole corridor.`;
}
function travelRuleNotice(state:RegionalTradeState):string {return state.version===1?'This save keeps legacy freight timing. Existing freight ledgers are not converted. Compare weather-aware travel in the disposable System Workbench, or use a fresh regional world without an existing save.':'This freight ledger uses regional weather. Rain slows loaded and empty carriers; dry spells restore their speed. Existing legacy freight saves keep their own timing.';}
/** Macro metadata only. Opening a map never extracts, reserves, clears or builds. */
export function regionalTradeMapDetail(seed:number,targetId:string,state?:RegionalTradeState):string {
 const plan=regionalTradePlan(seed),route=resolveRoute(seed,targetId);if(!route)return '';
 const source=plan.sources.find(s=>s.id===route.sourceId)!,project=plan.projects.find(p=>p.id===route.projectId)!;
 if(!state||state.seed!==seed)return `${source.name} → ${project.name}. ${source.deposit} finite ${materialName(source.material)}. ${regionalTradeDistanceText(route.surfaceMetres)} actual road route; about ${regionalTradeTravelText(route.travelSeconds)} dry-road reference one way at 1.8 m/s. Open this world’s freight ledger to inspect its travel rule and delivery estimate. Visit the marked point and inspect with E / X.`;
 const summary=regionalTradeSummary(state,seed,route.id);if(!summary)return '';
 const scope=targetId===source.id?`Source: ${summary.remaining} unextracted · ${summary.stock} available · ${summary.reserved} reserved.`:targetId===route.obstruction.id||targetId===route.id?`${route.obstruction.name}: ${summary.repairProgress>=1?'repaired':summary.repairProgress>0?`${Math.round(summary.repairProgress*100)}% repaired`:'blocks loaded carriers until repaired'}.`:`Destination: ${summary.destinationStock} stored · ${summary.embodied} embodied in construction · ${summary.withdrawn} taken for building · ${summary.missing} still needed.`;
 return `${scope} ${regionalTradePhaseText(summary.phase)}. ${summary.cause} Cargo: ${summary.cargo} ${materialName(summary.material)} → ${summary.destinationName}. ${routeText(summary)}. ${regionalTradeWeatherText(summary)} Delivery estimate: ${regionalTradeEtaText(summary)}. ${summary.phase==='operational'||summary.phase==='exhausted'?summary.benefit:'Visit the marked point and inspect with E / X.'}`;
}
/** At most three routes and twelve marks; all come from the same immutable plan. */
export function regionalTradeMapOverlay(state:RegionalTradeState|undefined):RegionalTradeMapOverlay {
 const overlay:RegionalTradeMapOverlay={markers:[],routes:[]};if(!state)return overlay;
 const plan=regionalTradePlan(state.seed),poses=regionalTradeActorPoses(state.seed,state);
 for(const route of plan.routes){
  const saved=state.routes.find(r=>r.id===route.id);if(!saved)continue;
  const source=plan.sources.find(s=>s.id===route.sourceId)!,project=plan.projects.find(p=>p.id===route.projectId)!;
  for(const [id,name,position,kind]of [[source.id,source.name,source.interactionPosition,'resource'],[project.id,project.name,project.interactionPosition,'project'],[route.obstruction.id,route.obstruction.name,route.obstruction.interactionPosition,'repair']] as const){overlay.markers.push({id,name,x:position.x,z:position.z,kind,targetId:kind==='repair'?route.id:id,detail:regionalTradeMapDetail(state.seed,id,state)});}
  overlay.routes.push({id:route.id,points:route.points.map(point=>({x:point.x,z:point.z})),blocked:saved.clearedAt===null});
  const carrier=poses.find(p=>p.routeId===route.id&&p.kind==='carrier'),summary=regionalTradeSummary(state,state.seed,route.id);
  if(carrier&&summary&&saved.sourceStartedAt!==null)overlay.markers.push({id:carrier.id,name:carrier.name,x:carrier.position.x,z:carrier.position.z,kind:'carrier',targetId:source.id,detail:`${activities[saved.activity]??saved.activity}. Cargo: ${saved.cargo} ${materialName(route.material)} → ${project.name}. ${regionalTradeDistanceText(saved.distance)} / ${regionalTradeDistanceText(route.surfaceMetres)} from source. Delivery estimate: ${regionalTradeEtaText(summary)}. ${routeText(summary)}. ${regionalTradeWeatherText(summary)}`});
 }
 return overlay;
}
function inspectButton(label:string,key:string,open:()=>void){const button=node('button',label,'frontier-action');button.type='button';button.dataset.regionalTradeFocus=key;button.onclick=open;return button;}
/** Read-only discovery connects the finite freight loop to the existing journal. */
export function mountRegionalTradeJournalSection(container:HTMLElement,state:RegionalTradeState|undefined,options:RegionalTradeJournalOptions):void {
 const focused=focusKey(container);container.replaceChildren();container.className='frontier-section';container.setAttribute('aria-label','Regional resources, freight and construction');
 container.append(node('h3','REGIONAL FREIGHT + CONSTRUCTION'),node('p','Three finite work sites link quarry stone and fallen timber to new freight stores over the existing roads. Start extraction, repair each marked obstruction, and deliver enough cargo before construction.','frontier-notice'));
 if(!state||state.seed!==options.seed){container.append(node('p','Open a 10 km² frontier to discover regional freight sites.','frontier-small'));restoreFocus(container,focused);return;}
 const plan=regionalTradePlan(options.seed);container.append(node('p',travelRuleNotice(state),'frontier-notice'));
 for(const route of plan.routes){const summary=regionalTradeSummary(state,state.seed,route.id);if(!summary)continue;const source=plan.sources.find(s=>s.id===route.sourceId)!,project=plan.projects.find(p=>p.id===route.projectId)!,row=node('article',undefined,'frontier-town');
  row.append(node('h4',`${source.name} → ${project.name}`),node('p',regionalTradePhaseText(summary.phase),'machine-status'),node('p',summary.cause,'frontier-small'),node('p',`${summary.remaining} unextracted · ${summary.stock} stock · ${summary.reserved} reserved · ${summary.cargo} cargo · ${summary.destinationStock} destination stock · ${summary.withdrawn} taken for building`,'frontier-small'),node('p',routeText(summary),'frontier-small'),node('p',regionalTradeWeatherText(summary),'frontier-small'),node('p',`Delivery estimate: ${regionalTradeEtaText(summary)}.`,'frontier-small'));
  if(summary.phase==='operational'||summary.phase==='exhausted')row.append(node('p',summary.benefit,'frontier-notice'));
  row.append(inspectButton(`Inspect ${source.name}`,source.id,()=>options.open(source.id)),inspectButton(`Inspect ${route.obstruction.name}`,route.obstruction.id,()=>options.open(route.id)),inspectButton(`Inspect ${project.name}`,project.id,()=>options.open(project.id)));container.append(row);
 }
 container.append(node('p','Map and journal inspection is read-only. Commands require a living, grounded explorer at the matching E / X point after collision has loaded. Completed stores let you take delivered reserve into carried building supplies for the separate rainwater collector projects.','frontier-small'));
 if(options.map)container.append(inspectButton('Show freight routes on map','map',options.map));restoreFocus(container,focused);
}
/** Literal DOM, immutable snapshots and one-shot revision-checked command intent. */
export function mountRegionalTradePanel(container:HTMLElement,state:RegionalTradeState,options:RegionalTradePanelOptions):void {
 const focused=focusKey(container),ledgerOpen=container.querySelector<HTMLDetailsElement>('details[data-regional-trade-ledger]')?.open??false;container.replaceChildren();
 const close=inspectButton('×','close',options.close);close.className='close';close.setAttribute('aria-label','Close regional freight');container.append(close);
 const plan=regionalTradePlan(state.seed),route=resolveRoute(state.seed,options.targetId),summary=route?regionalTradeSummary(state,state.seed,route.id):null,saved=route?state.routes.find(r=>r.id===route.id):undefined;
 if(!route||!summary||!saved){container.append(node('h2','Freight site unavailable'),node('p','Choose a marked resource site, obstruction or freight store from this world’s map.'));restoreFocus(container,focused);return;}
 const source=plan.sources.find(s=>s.id===route.sourceId)!,project=plan.projects.find(p=>p.id===route.projectId)!,title=options.targetId===source.id?source.name:options.targetId===route.obstruction.id||options.targetId===route.id?route.obstruction.name:options.targetId===project.id?project.name:route.name;
 container.append(node('span','REGIONAL TRADE · FINITE FREIGHT','eyebrow'),node('h2',title),node('p',regionalTradePhaseText(summary.phase),'machine-status'),node('p',summary.cause,'frontier-notice'));
 const commandButton=(type:RegionalTradeCommand['type'],targetId:string,label:string)=>{
  const button=inspectButton(label,type,()=>{}),initial:RegionalTradeCommand={type,targetId,expectedRevision:state.revision};let sent=false;button.disabled=!options.canRun(initial);
  button.onclick=()=>{if(sent||button.disabled)return;const latest=options.readState();if(!latest||latest.seed!==state.seed)return;const command:RegionalTradeCommand={type,targetId,expectedRevision:latest.revision};if(!options.canRun(command))return;sent=true;button.disabled=true;options.command(command);};return button;
 };
 container.append(node('h3',`SOURCE · ${source.name}`),node('p',source.description,'frontier-small'),node('p',`${summary.remaining} / ${source.deposit} unextracted ${materialName(source.material)} · ${summary.stock} available stock · ${summary.reserved} reserved for loading`,'machine-status'));
 if(saved.sourceStartedAt===null)container.append(commandButton('start-source',source.id,`Start ${source.kind==='quarry'?'quarry extraction':'deadwood recovery'}`));
 else container.append(node('p',summary.remaining>0?`Extraction cycle: ${Math.round(summary.productionProgress*100)}%. Finite deposit transfers into source stock; reserved units leave available stock once.`:'The source is exhausted. Remaining stock and cargo can still be delivered.','frontier-small'));
 container.append(node('h3','ROAD CARRIER + OBSTRUCTION'),node('p',`${route.carrierName}: ${activities[saved.activity]??saved.activity}. Cargo: ${summary.cargo} ${materialName(route.material)} → ${project.name}.`,'machine-status'),node('p',regionalTradeWeatherText(summary),'frontier-notice'),node('p',`${routeText(summary)}. Position: ${regionalTradeDistanceText(saved.distance)} from source. Delivery estimate: ${regionalTradeEtaText(summary)}.`,'frontier-small'),node('p',travelRuleNotice(state),'frontier-small'),node('p',`${route.obstruction.name}: ${route.obstruction.description}`,'frontier-small'));
 if(saved.clearedAt!==null)container.append(node('p','Route repaired. The carrier follows the same canonical road in both directions.','frontier-small'));
 else if(saved.repairStartedAt!==null)container.append(node('p',`Repair work: ${Math.round(summary.repairProgress*100)}%. Loaded cargo cannot pass the damaged freight footing until the repair is complete.`,'machine-status'));
 else container.append(commandButton('clear-route',route.id,'Ask crew to repair the obstruction'));
 container.append(node('h3',`DESTINATION · ${project.name}`),node('p',`${summary.delivered} total delivered · ${summary.destinationStock} stored · ${summary.embodied} embodied in construction · ${summary.missing} still needed`,'machine-status'),node('p',`Freight-store cost: ${project.cost} ${materialName(project.material)}. ${summary.benefit}`,'frontier-small'));
 if(saved.builtAt!==null)container.append(node('p',`Freight store complete: capacity ${project.baseCapacity} → ${project.capacity} units. ${summary.destinationStock} units currently stored.`,'frontier-notice'),commandButton('withdraw-reserve',project.id,'Take delivered building supplies'),node('p',`${summary.withdrawn} units taken from this store in total. Taking reserve transfers actual delivered ${materialName(project.material)} into carried building supplies, usable for the remaining rainwater collectors. Previously taken supplies may already be used in construction.`,'frontier-small'));
 else if(saved.buildStartedAt!==null)container.append(node('p',`Construction work: ${Math.round(summary.workProgress*100)}%. Timber formwork occupies the same acknowledged solid footprint as the completed store.`,'machine-status'));
 else container.append(commandButton('build-store',project.id,'Build freight store from delivered stock'));
 container.append(node('p','Visit each matching marked point with E / X to act. Remote map and journal views do not dispatch orders. Rainwater collectors keep their separate progress and can use freight only after you take the delivered reserve into carried building supplies.','frontier-small'),node('p',options.continuesInMenus?'The online world continues while this panel is open. Travel times count active simulation time.':'Close this panel to let the work and carriers move. Solo menus pause active travel; no progress is invented while the world is closed.','frontier-notice'));
 if(options.food)container.append(inspectButton('Inspect this store’s farm & meals','food',options.food));
 if(options.map)container.append(inspectButton('Show freight routes on map','map',options.map));
 const ledger=node('details',undefined,'frontier-explainer');ledger.dataset.regionalTradeLedger='true';ledger.open=ledgerOpen;const heading=node('summary','Material ledger and scope');heading.dataset.regionalTradeFocus='ledger';ledger.append(heading,node('p',`Job: ${summary.jobTitle}.`,'frontier-small'),node('p',`${source.deposit} finite units = ${summary.remaining} unextracted + ${summary.stock} source stock + ${summary.reserved} reserved + ${summary.cargo} cargo + ${summary.destinationStock} destination stock + ${summary.embodied} construction + ${summary.withdrawn} taken for building.`,'frontier-small'),node('p',`World clock: ${number(state.ticks*REGIONAL_TRADE_STEP)} active seconds. Three finite sites, three road carriers and three freight-store projects. Surveyed deposits are separate from wilderness gathering. Only withdrawn, delivered reserve becomes carried building supplies for collectors.`,'frontier-small'));container.append(ledger);restoreFocus(container,focused);
}
