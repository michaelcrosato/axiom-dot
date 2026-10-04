import type {RegionalTradeState} from './regional-trade.ts';
import {regionalSupplyPlan,regionalSupplySummary,regionalSupplyAvailable,REGIONAL_SUPPLY_STEP,type RegionalSupplyState,type RegionalSupplyCommand} from './regional-supply.ts';
import type {WildernessState} from './wilderness-state.ts';

export interface RegionalSupplyPanelOptions {
 outpostId:string;
 wilderness?:WildernessState;
 frontierTrade?:RegionalTradeState;
 /** canRun re-reads the current authoritative state, including collision gating. */
 command:(command:RegionalSupplyCommand)=>void;
 canRun:(command:RegionalSupplyCommand)=>boolean;
 close:()=>void;
 continuesInMenus?:boolean;
 food?:()=>void;
}
export interface RegionalSupplyJournalOptions {
 seed:number;
 wilderness?:WildernessState;
 frontierTrade?:RegionalTradeState;
 open:(outpostId:string)=>void;
 map?:()=>void;
}
const number=(value:number)=>Number.isFinite(value)?value.toFixed(1).replace(/\.0$/,''):'0';
function node<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string):HTMLElementTagNameMap[K]{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;}
function materials(value:{wood:number;stone:number}){return `${value.wood} wood · ${value.stone} stone`;}
function focusKey(container:HTMLElement):string|undefined {return document.activeElement instanceof HTMLElement&&container.contains(document.activeElement)?document.activeElement.dataset.regionalSupplyFocus:undefined;}
function restoreFocus(container:HTMLElement,key:string|undefined){if(!key)return;const candidates=Array.from(container.querySelectorAll<HTMLElement>('[data-regional-supply-focus]')),target=candidates.find(element=>element.dataset.regionalSupplyFocus===key&&!('disabled'in element&&element.disabled))??candidates.find(element=>element.dataset.regionalSupplyFocus==='close');if(target)target.focus({preventScroll:true});else{container.tabIndex=-1;container.focus({preventScroll:true});}}
export function regionalSupplyPhaseText(phase:string){return phase==='operational'?'Collector in use':phase==='building'?'Residents are building':phase==='ready'?'Materials ready':'Materials needed';}
/** A metadata-only map detail, with no independent simulation or chunk loading. */
export function regionalSupplyMapDetail(seed:number,outpostId:string,state?:RegionalSupplyState,wilderness?:WildernessState):string {
 const outpost=regionalSupplyPlan(seed).outposts.find(o=>o.id===outpostId);if(!outpost)return '';
 if(!state||state.seed!==seed)return `${outpost.residents.length} residents · Rainwater collector retrofit: ${materials(outpost.cost)}. Follow the existing trail to the shelter; inspect its supply point with E / X.`;
 const saved=state.outposts.find(o=>o.id===outpostId);if(!saved)return '';
 const missing={wood:Math.max(0,outpost.cost.wood-saved.delivered.wood),stone:Math.max(0,outpost.cost.stone-saved.delivered.stone)};
 const phase=saved.builtAt!==null?'operational':saved.buildStartedAt!==null?'building':missing.wood+missing.stone===0?'ready':'shortage';
 return `${outpost.residents.length} residents · ${regionalSupplyPhaseText(phase)} · ${phase==='operational'?`${number(saved.water)} / ${number(outpost.capacity)} L stored; ${number(saved.consumed)} L used`:phase==='building'?'Crew fitting the collector':phase==='ready'?'Wood and stone delivered':`Missing ${materials(missing)}`}. Rainwater storage supplies actual resident drinking. Inspect the shelter supply point with E / X.`;
}
/** Small journal entry keeps the first community discoverable from the valley.
 * Reading any number of panels never starts a project or spends materials. */
export function mountRegionalSupplyJournalSection(container:HTMLElement,state:RegionalSupplyState|undefined,options:RegionalSupplyJournalOptions):void {
 const focused=focusKey(container);container.replaceChildren();container.className='frontier-section';container.setAttribute('aria-label','Regional communities and supplies');
 container.append(node('h3','REGIONAL COMMUNITIES'),node('p','Six existing trail shelters have a small resident crew and one useful rainwater-storage retrofit each. Start at Alder Waystation, following the west trail from the valley.','frontier-notice'));
 if(!state||state.seed!==options.seed){container.append(node('p','Open a 10 km² frontier to begin the regional supply loop. Original valley worlds keep their existing activities.','frontier-small'));return;}
 const available=regionalSupplyAvailable(state,options.wilderness,options.frontierTrade);
 container.append(node('p',`Carried raw materials: ${materials(available)}. Delivered stock belongs to that outpost and cannot be spent twice.`,'machine-status'),node('p','Gather finite wood and stone, or take delivered reserve from a completed freight store with E / X, follow a road to a shelter supply point, deliver what is needed, then ask the crew to build. Completed collectors store rain for actual resident drinking.','frontier-small'));
 for(const outpost of regionalSupplyPlan(options.seed).outposts){
  const saved=state.outposts.find(o=>o.id===outpost.id);if(!saved)continue;const missing={wood:Math.max(0,outpost.cost.wood-saved.delivered.wood),stone:Math.max(0,outpost.cost.stone-saved.delivered.stone)},phase=saved.builtAt!==null?'operational':saved.buildStartedAt!==null?'building':missing.wood+missing.stone===0?'ready':'shortage';const row=node('article',undefined,'frontier-town');row.append(node('h4',outpost.name),node('p',`${regionalSupplyPhaseText(phase)} · ${phase==='operational'?`${number(saved.water)} / ${number(outpost.capacity)} L reserve`:phase==='building'?'Crew fitting the collector':phase==='ready'?'Wood and stone delivered':`Missing ${materials(missing)}`}`,'frontier-small'));
  const button=node('button',`Inspect ${outpost.name}`,'frontier-action');button.type='button';button.dataset.regionalSupplyFocus=outpost.id;button.onclick=()=>options.open(outpost.id);row.append(button);container.append(row);
 }
 if(options.map){const button=node('button','Open frontier map','frontier-action');button.type='button';button.dataset.regionalSupplyFocus='map';button.onclick=options.map;container.append(button);}
 restoreFocus(container,focused);
}
/** Literal DOM and committed snapshots only. No local reward, stock or clock. */
export function mountRegionalSupplyPanel(container:HTMLElement,state:RegionalSupplyState,options:RegionalSupplyPanelOptions):void {
 const focused=focusKey(container),ledgerOpen=container.querySelector<HTMLDetailsElement>('details[data-regional-supply-ledger]')?.open??false;
 container.replaceChildren();const close=node('button','×','close');close.type='button';close.setAttribute('aria-label','Close outpost supplies');close.dataset.regionalSupplyFocus='close';close.onclick=options.close;container.append(close);
 const plan=regionalSupplyPlan(state.seed),outpost=plan.outposts.find(o=>o.id===options.outpostId),saved=state.outposts.find(o=>o.id===options.outpostId);
 if(!outpost||!saved){container.append(node('h2','Outpost unavailable'),node('p','Return to the regional journal to choose a shelter in this world.'));restoreFocus(container,focused);return;}
 const summary=regionalSupplySummary(state,state.seed,outpost.id,options.wilderness,options.frontierTrade),available=regionalSupplyAvailable(state,options.wilderness,options.frontierTrade);if(!summary){container.append(node('h2','Outpost unavailable'));restoreFocus(container,focused);return;}
 container.append(node('span','REGIONAL OUTPOST · CONSERVED SUPPLIES','eyebrow'),node('h2',outpost.name),node('p',regionalSupplyPhaseText(summary.phase),'machine-status'),node('p',summary.cause,'frontier-notice'));
 container.append(node('h3','RAINWATER COLLECTOR + STORAGE'),node('p',summary.benefit),node('p',`Carried: ${materials(available)} · Delivered here: ${materials(saved.delivered)} · Project cost: ${materials(outpost.cost)}`,'frontier-small'));
 if(summary.phase==='shortage'||summary.phase==='ready'){
  container.append(node('p',`Still needed: ${materials(summary.missing)}`,'machine-status'));
  const deliver:RegionalSupplyCommand={type:'deliver',outpostId:outpost.id,expectedRevision:state.revision};
  const build:RegionalSupplyCommand={type:'build',outpostId:outpost.id,expectedRevision:state.revision};
  for(const [command,label]of [[deliver,'Deliver carried materials'],[build,'Start collector retrofit']] as const){const button=node('button',label,'frontier-action');button.type='button';button.dataset.regionalSupplyFocus=command.type;button.disabled=!options.canRun(command);button.onclick=()=>{if(!button.disabled&&options.canRun(command))options.command(command);};container.append(button);}
  container.append(node('p','Delivery transfers only outstanding wood and stone you actually carry, from finite gathering or withdrawn freight. Visit the shelter’s supply point to deliver or start work; the site must be physically loaded and safe.','frontier-small'));
 }else if(summary.phase==='building'){
  container.append(node('p',`Crew work: ${Math.round(summary.workProgress*100)}% complete. The timber formwork reserves the same physical footprint as the completed storage.`,'machine-status'));
 }else{
  container.append(node('p',`${number(summary.water)} / ${number(summary.capacity)} L stored · ${number(summary.collected)} L captured · ${number(summary.consumed)} L drunk by residents`,'machine-status'));
 }
 container.append(node('h3','WEATHER + RESERVES'),node('p',summary.weather.description,'frontier-notice'));
 container.append(node('h3','LOCAL SHORTAGES + ROADS'),node('p',`Unharvested local sources: ${materials(summary.localRemaining)}. Each source yields one finite raw material.`,'frontier-small'));
 for(const resource of ['wood','stone'] as const)if(summary.missing[resource]>0){const alternative=summary.alternatives[resource];container.append(node('p',`${summary.missing[resource]} ${resource} still needed. ${alternative?`Road-linked alternative: ${alternative}.`:'Use carried stock or gather along the connected regional trails.'}`,'frontier-small'));}
 container.append(node('p',`Connected roads: ${summary.roadNames.join(' · ')||'Follow the marked regional trail'}`,'frontier-small'));
 container.append(node('h3','RESIDENT WORK + WATER'));
 const activities:Record<string,string>={waiting:'Waiting at home','to-work':'Walking to the work point',working:'Working on the collector','to-water':'Walking to collect water',gathering:'Filling a drinking flask',returning:'Returning with water',drinking:'Drinking delivered water'};
 for(const identity of outpost.residents){const resident=saved.residents.find(r=>r.id===identity.id);if(!resident)continue;container.append(node('p',`${identity.name}: ${activities[resident.activity]??resident.activity} · hydration ${Math.round(100-resident.thirst)}% · ${number(resident.drunk)} L drunk${resident.carrying>0?` · carrying ${number(resident.carrying)} L`:''}`,'frontier-small'));}
 container.append(node('p',`${options.continuesInMenus?'The online world continues while this panel is open.':'Close this panel to let residents work; solo menus pause the simulation.'} No progress is invented while the world is closed.`,'frontier-notice'));
 const ledger=node('details',undefined,'frontier-explainer');ledger.dataset.regionalSupplyLedger='true';ledger.open=ledgerOpen;const heading=node('summary','Supply ledger and scope');heading.dataset.regionalSupplyFocus='ledger';ledger.append(heading);
 ledger.append(node('p',`Project: ${summary.jobTitle}.`,'frontier-small'),node('p',`Water balance: ${number(saved.captured)} L captured = ${number(saved.water)} L stored + ${number(saved.residents.reduce((sum,r)=>sum+r.carrying,0))} L carried + ${number(saved.consumed)} L drunk + ${number(saved.spilled)} L overflow.`,'frontier-small'),node('p',`World clock: ${number(state.ticks*REGIONAL_SUPPLY_STEP)} active seconds. Rain collection is a bounded local simulation, not a weather forecast. The crews use safe routes on their existing shelter pads. This does not simulate a full town economy or moving road caravans.`,'frontier-small'));
 if(options.food){const button=node('button','Inspect local farm & meals','frontier-action');button.type='button';button.dataset.regionalSupplyFocus='food';button.onclick=options.food;container.append(node('p','This community’s garden recovers new overflow after the drinking tank fills.','frontier-small'),button);}
 container.append(ledger);restoreFocus(container,focused);
}
