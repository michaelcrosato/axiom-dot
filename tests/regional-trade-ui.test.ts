import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountRegionalTradePanel,mountRegionalTradeJournalSection,regionalTradeMapDetail,regionalTradeMapOverlay,regionalTradeDistanceText,regionalTradeTravelText,regionalTradeWeatherText,regionalTradeEtaText} from '../src/regional-trade-ui.ts';
import {createRegionalTrade,regionalTradePlan,regionalTradeSummary,regionalTradeCommandPosition,applyRegionalTradeCommand,advanceRegionalTrade,type RegionalTradeState,type RegionalTradeCommand} from '../src/regional-trade.ts';
import {regionalTradeRoadWeather} from '../src/regional-trade-weather.ts';
import {regionalCacheStats} from '../src/regional-world.ts';

/** Executable literal-DOM contracts; these do not substitute for device/browser QA. */
class Element {
 tagName:string;children:Element[]=[];dataset:Record<string,string>={};className='';disabled=false;open=false;type='';attributes=new Map<string,string>();_text='';onclick?:()=>void;
 constructor(tag:string){this.tagName=tag;}set textContent(value:string){this._text=String(value);this.children=[];}get textContent():string{return this._text+this.children.map(child=>child.textContent).join('');}
 set innerHTML(_value:string){throw new Error('Dynamic HTML forbidden');}append(...children:Element[]){this.children.push(...children);}replaceChildren(...children:Element[]){this._text='';this.children=children;}setAttribute(name:string,value:string){this.attributes.set(name,value);}
 contains(value:Element):boolean{return this===value||this.children.some(child=>child.contains(value));}querySelectorAll(selector:string):Element[]{return flatten(this).filter(e=>selector==='details[data-regional-trade-ledger]'?e.tagName==='details'&&e.dataset.regionalTradeLedger!==undefined:selector==='[data-regional-trade-focus]'?e.dataset.regionalTradeFocus!==undefined:false);}querySelector(selector:string){return this.querySelectorAll(selector)[0]??null;}focus(){documentFake.activeElement=this;}
}
const documentFake={createElement:(tag:string)=>new Element(tag),activeElement:null as Element|null};
const flatten=(element:Element):Element[]=>[element,...element.children.flatMap(flatten)],button=(element:Element,label:string)=>flatten(element).find(e=>e.tagName==='button'&&e.textContent===label)!;
const seed=73129,fresh=():RegionalTradeState=>structuredClone(createRegionalTrade(seed));
function withDOM(run:()=>void){const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),oldElement=Object.getOwnPropertyDescriptor(globalThis,'HTMLElement');Object.defineProperty(globalThis,'document',{value:documentFake,writable:true,configurable:true});Object.defineProperty(globalThis,'HTMLElement',{value:Element,writable:true,configurable:true});documentFake.activeElement=null;try{run();}finally{if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else delete (globalThis as Record<string,unknown>).document;if(oldElement)Object.defineProperty(globalThis,'HTMLElement',oldElement);else delete (globalThis as Record<string,unknown>).HTMLElement;}}

test('trade buttons reread current revision, recheck authority, and are one shot between remounts',()=>withDOM(()=>{
 let state=fresh(),near=true,closed=0;const panel=new Element('section'),sent:RegionalTradeCommand[]=[],plan=regionalTradePlan(seed),source=plan.sources[0]!;
 const options={targetId:source.id,readState:()=>state,command:(command:RegionalTradeCommand)=>{sent.push(command);state={...state,revision:state.revision+1};},canRun:(command:RegionalTradeCommand)=>near&&command.expectedRevision===state.revision,close:()=>closed++};
 const before=JSON.stringify(state);mountRegionalTradePanel(panel as unknown as HTMLElement,state,options);assert.equal(JSON.stringify(state),before);assert.match(panel.textContent,/12 \/ 12 unextracted quarry stone/);assert.match(panel.textContent,/stock · 0 reserved/);assert.match(panel.textContent,/Solo menus pause/);assert.match(panel.textContent,/1.8 m\/s/);
 const start=button(panel,'Start quarry extraction');state={...state,revision:2};start.onclick!();start.onclick!();assert.deepEqual(sent,[{type:'start-source',targetId:source.id,expectedRevision:2}]);
 mountRegionalTradePanel(panel as unknown as HTMLElement,state,options);near=false;button(panel,'Ask crew to repair the obstruction').onclick!();assert.equal(sent.length,1,'proximity can change after render');
 mountRegionalTradePanel(panel as unknown as HTMLElement,state,options);const remote=button(panel,'Start quarry extraction');assert.equal(remote.disabled,true);remote.onclick!();assert.equal(sent.length,1);button(panel,'×').onclick!();assert.equal(closed,1);
 near=true;mountRegionalTradePanel(panel as unknown as HTMLElement,state,options);button(panel,'Ask crew to repair the obstruction').onclick!();assert.equal(sent.at(-1)!.targetId,plan.routes[0]!.id,'repair command uses model route identity');
 assert.doesNotMatch(readFileSync(new URL('../src/regional-trade-ui.ts',import.meta.url),'utf8'),/innerHTML|setInterval|setTimeout|Date\.now|\.advance/);
}));

test('freight inspection exposes saved travel rules and wet-to-dry recovery without changing a ledger',()=>withDOM(()=>{
 const plan=regionalTradePlan(seed),route=plan.routes[0]!,panel=new Element('section');
 for(const version of [1,2] as const){
  const state=structuredClone(createRegionalTrade(seed,version)),before=JSON.stringify(state),options={targetId:route.sourceId,readState:()=>state,command(){assert.fail('Inspection cannot issue commands');},canRun(){return false;},close(){}};
  mountRegionalTradePanel(panel as unknown as HTMLElement,state,options);
  const label=version===1?/Legacy freight timing/:/Weather-aware freight/;assert.match(panel.textContent,label);assert.match(panel.textContent,version===1?/Existing freight ledgers are not converted/:/Existing legacy freight saves keep their own timing/);
  if(version===1){assert.match(panel.textContent,/disposable System Workbench/);assert.match(panel.textContent,/Fixed walking speed: 1.8 m\/s/);assert.doesNotMatch(panel.textContent,/Road wetness:/);}
  else {assert.match(panel.textContent,/dry-road baseline/);assert.match(panel.textContent,/25 percentage points of wetness every 30 active sec/);assert.match(panel.textContent,/route-midpoint climate sample/);}
  mountRegionalTradeJournalSection(panel as unknown as HTMLElement,state,{seed,open(){}});assert.match(panel.textContent,label);assert.match(regionalTradeMapDetail(seed,route.id,state),label);assert.equal(JSON.stringify(state),before);
 }
 const state=fresh();let tick=0;while(tick<10000&&regionalTradeRoadWeather(seed,route,tick).condition!=='drying')tick++;assert.ok(tick<10000);
 for(const [at,condition,pattern]of [[0,'wet',/Wet road/],[tick,'drying',/Road drying/],[tick+480,'dry',/Dry road; baseline speed restored/]] as const){state.ticks=at;const summary=regionalTradeSummary(state,seed,route.id)!;assert.equal(summary.travelCondition,condition);const text=regionalTradeWeatherText(summary);assert.match(text,pattern);assert.ok(text.includes(`Road wetness: ${Math.round(summary.roadWetness*100)}%`));assert.ok(text.includes(`Route walking speed now: ${summary.travelSpeed} m/s`));}
 assert.match(regionalTradeMapDetail(seed,route.id),/dry-road reference/);assert.match(regionalTradeMapDetail(seed,route.id),/inspect its travel rule/);
}));

test('delivery text consumes the authoritative forecast and withholds ETA until repair is complete',()=>withDOM(()=>{
 const route=regionalTradePlan(seed).routes[0]!,panel=new Element('section');let state=createRegionalTrade(seed);
 const command=(type:RegionalTradeCommand['type'],targetId:string)=>{const position=regionalTradeCommandPosition(seed,{type,targetId})!;state=applyRegionalTradeCommand(state,{generation:2,seed,regional:{version:1},zone:'valley',grounded:true,feetY:position.y,player:{...position,hp:100}},{type,targetId,expectedRevision:state.revision}).state;};
 command('start-source',route.sourceId);for(let i=0;i<1000&&state.routes[0]!.activity!=='blocked';i++)state=advanceRegionalTrade(state,1);assert.equal(state.routes[0]!.activity,'blocked');
 const inspect=()=>{const summary=regionalTradeSummary(state,seed,route.id)!;mountRegionalTradePanel(panel as unknown as HTMLElement,state,{targetId:route.id,readState:()=>state,command(){},canRun(){return false;},close(){}});return summary;};
 assert.equal(inspect().etaKind,'repair-required');assert.match(panel.textContent,/repair required before delivery; no arrival estimate/);
 command('clear-route',route.id);state=advanceRegionalTrade(state,1);assert.equal(inspect().etaSeconds,null);assert.match(panel.textContent,/no arrival estimate/);
 for(let i=0;i<12;i++)state=advanceRegionalTrade(state,1);state=advanceRegionalTrade(state,.125);const summary=inspect();assert.equal(summary.etaKind,'arrival');assert.ok(summary.etaSeconds!>0);assert.ok(panel.textContent.includes(regionalTradeTravelText(summary.etaSeconds)));assert.match(panel.textContent,/including unloading/);
 assert.ok(regionalTradeMapOverlay(state).markers.find(marker=>marker.kind==='carrier')!.detail.includes(regionalTradeEtaText(summary)));
 const before=JSON.stringify(state);mountRegionalTradeJournalSection(panel as unknown as HTMLElement,state,{seed,open(){}});assert.ok(panel.textContent.includes(regionalTradeEtaText(summary)));assert.equal(JSON.stringify(state),before);
 assert.equal(regionalTradeEtaText({...summary,carrierActivity:'returning',etaKind:'none',etaSeconds:null}),'returning empty; no delivery currently travelling');
 assert.equal(regionalTradeEtaText({...summary,carrierActivity:'loading',etaKind:'none',etaSeconds:null}),'loading reserved cargo; no arrival estimate');
 assert.equal(regionalTradeEtaText({...summary,carrierActivity:'finished',etaKind:'none',etaSeconds:null}),'all deliveries complete');
}));
test('literal DOM retains disclosure and focus; obsolete or disabled actions fall back to Close',()=>withDOM(()=>{
 const state=fresh(),panel=new Element('section'),source=regionalTradePlan(seed).sources[0]!,options={targetId:source.id,readState:()=>state,command(){},canRun(){return true;},close(){},continuesInMenus:true};
 mountRegionalTradePanel(panel as unknown as HTMLElement,state,options);const ledger=panel.querySelector('details[data-regional-trade-ledger]')!;ledger.open=true;ledger.children[0]!.focus();
 for(let i=0;i<5;i++){mountRegionalTradePanel(panel as unknown as HTMLElement,state,options);const current=panel.querySelector('details[data-regional-trade-ledger]')!;assert.equal(current.open,true);assert.equal(documentFake.activeElement,current.children[0]);}
 assert.match(panel.textContent,/online world continues/);button(panel,'Start quarry extraction').focus();state.routes[0]!.sourceStartedAt=0;mountRegionalTradePanel(panel as unknown as HTMLElement,state,options);assert.equal(button(panel,'Start quarry extraction'),undefined);assert.equal(documentFake.activeElement,button(panel,'×'));
 button(panel,'Build freight store from delivered stock').focus();mountRegionalTradePanel(panel as unknown as HTMLElement,state,{...options,canRun(){return false;}});assert.equal(documentFake.activeElement,button(panel,'×'));
 const invalid={...state,seed:3};mountRegionalTradePanel(panel as unknown as HTMLElement,state,{...options,readState:()=>invalid});button(panel,'Ask crew to repair the obstruction').onclick!();
}));
test('journal and full map expose bounded read-only source, route, obstruction and destination metadata',()=>withDOM(()=>{
 const state=fresh(),panel=new Element('section'),plan=regionalTradePlan(seed),opened:string[]=[],before=JSON.stringify(state),cache=regionalCacheStats();let maps=0;
 mountRegionalTradeJournalSection(panel as unknown as HTMLElement,state,{seed,open:id=>opened.push(id),map:()=>maps++});
 for(const route of plan.routes){const source=plan.sources.find(s=>s.id===route.sourceId)!,project=plan.projects.find(p=>p.id===route.projectId)!;button(panel,`Inspect ${source.name}`).onclick!();button(panel,`Inspect ${project.name}`).onclick!();assert.match(regionalTradeMapDetail(seed,source.id,state),/unextracted/);assert.match(regionalTradeMapDetail(seed,project.id,state),/Destination:/);assert.match(regionalTradeMapDetail(seed,route.obstruction.id,state),/actual route/);}
 button(panel,'Show freight routes on map').onclick!();assert.equal(maps,1);assert.equal(opened.length,6);assert.equal(JSON.stringify(state),before);
 const overlay=regionalTradeMapOverlay(state);assert.equal(overlay.markers.length,9);assert.equal(overlay.routes.length,3);for(const route of overlay.routes){assert.deepEqual(route.points,plan.routes.find(p=>p.id===route.id)!.points.map(p=>({x:p.x,z:p.z})));assert.equal(route.blocked,true);}
 assert.ok(overlay.markers.every(marker=>['resource','repair','project'].includes(marker.kind)));assert.equal(regionalCacheStats().featureCompilations,cache.featureCompilations);
 state.routes[0]!.sourceStartedAt=0;state.routes[0]!.cargo=2;state.routes[0]!.distance=14;state.routes[0]!.activity='outbound';const withCarrier=regionalTradeMapOverlay(state);assert.equal(withCarrier.markers.length,10);const carrier=withCarrier.markers.find(m=>m.kind==='carrier')!;assert.match(carrier.detail,/Cargo: 2 quarry stone/);assert.match(carrier.detail,/repair required before delivery/);assert.equal(carrier.targetId,plan.sources[0]!.id);
 mountRegionalTradeJournalSection(panel as unknown as HTMLElement,undefined,{seed,open(){}});assert.equal(flatten(panel).filter(e=>e.tagName==='button').length,0);
}));
test('shortage, blocked repair, real construction and completed storage benefit stay distinct',()=>withDOM(()=>{
 const state=fresh(),saved=state.routes[0]!,plan=regionalTradePlan(seed),panel=new Element('section'),options={targetId:plan.projects[0]!.id,readState:()=>state,command(){},canRun(){return false;},close(){}};
 saved.sourceStartedAt=0;saved.activity='blocked';saved.cargo=1;saved.remaining=11;mountRegionalTradePanel(panel as unknown as HTMLElement,state,options);assert.match(panel.textContent,/Freight route blocked/);assert.match(panel.textContent,/1 cargo \+ 0 destination stock/);assert.match(panel.textContent,/4 still needed/);
 saved.repairStartedAt=0;state.ticks=24;mountRegionalTradePanel(panel as unknown as HTMLElement,state,options);assert.match(panel.textContent,/Repair work: 50%/);
 saved.clearedAt=48;saved.activity='returning';saved.cargo=0;saved.destinationStock=0;saved.delivered=4;saved.embodied=4;saved.remaining=8;saved.buildStartedAt=48;state.ticks=80;mountRegionalTradePanel(panel as unknown as HTMLElement,state,options);assert.match(panel.textContent,/Construction work: 50%/);assert.equal(button(panel,'Build freight store from delivered stock'),undefined);
 saved.builtAt=112;saved.activity='finished';saved.remaining=0;saved.destinationStock=8;state.ticks=1000;mountRegionalTradePanel(panel as unknown as HTMLElement,state,options);assert.match(panel.textContent,/Freight store complete: capacity 4 → 12 units/);assert.match(panel.textContent,/12 finite units = 0 unextracted \+ 0 source stock \+ 0 reserved \+ 0 cargo \+ 8 destination stock \+ 4 construction/);assert.match(panel.textContent,/all deliveries complete/);assert.match(regionalTradeMapDetail(seed,plan.projects[0]!.id,state),/Raises receiving capacity/);assert.doesNotMatch(panel.textContent,/Claim reward|renown|gold/);
 assert.equal(regionalTradeDistanceText(NaN),'0 m');assert.equal(regionalTradeTravelText(61),'1 min 1 sec active');assert.equal(regionalTradeTravelText(null),'no delivery currently travelling');
}));


test('completed reserve withdrawal uses fresh revision and records finite transferred stock, never a local reward',()=>withDOM(()=>{
 const state=fresh(),saved=state.routes[0]!,project=regionalTradePlan(seed).projects[0]!,panel=new Element('section'),sent:RegionalTradeCommand[]=[];saved.sourceStartedAt=0;saved.buildStartedAt=0;saved.builtAt=64;saved.embodied=4;saved.remaining=0;saved.destinationStock=8;saved.delivered=12;saved.activity='finished';
 const options={targetId:project.id,readState:()=>state,command:(command:RegionalTradeCommand)=>sent.push(command),canRun:(command:RegionalTradeCommand)=>command.type==='withdraw-reserve'&&saved.destinationStock>0,close(){}};
 mountRegionalTradePanel(panel as unknown as HTMLElement,state,options);const take=button(panel,'Take delivered building supplies');assert.equal(take.disabled,false);state.revision=9;take.onclick!();take.onclick!();assert.deepEqual(sent,[{type:'withdraw-reserve',targetId:project.id,expectedRevision:9}]);assert.equal(saved.destinationStock,8,'view cannot mutate inventory');
 take.focus();saved.withdrawn=8;saved.destinationStock=0;mountRegionalTradePanel(panel as unknown as HTMLElement,state,options);assert.equal(button(panel,'Take delivered building supplies').disabled,true);assert.equal(documentFake.activeElement,button(panel,'×'));assert.match(panel.textContent,/8 units taken from this store in total/);assert.match(panel.textContent,/0 destination stock \+ 4 construction \+ 8 taken for building/);assert.match(regionalTradeMapDetail(seed,project.id,state),/8 taken for building/);
}));
