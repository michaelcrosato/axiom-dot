import {createRegionalTrade} from '../src/regional-trade.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountRegionalFoodPanel,mountRegionalFoodJournalSection,regionalFoodMapDetail,regionalFoodMapOverlay,regionalFoodPendingText,regionalFoodTravelText} from '../src/regional-food-ui.ts';
import {createRegionalFood,regionalFoodPlan,type RegionalFoodState,type RegionalFoodCommand} from '../src/regional-food.ts';
import {createRegionalSupply} from '../src/regional-supply.ts';
import {regionalCacheStats} from '../src/regional-world.ts';

/** Executable literal-DOM contracts, not rendered browser/device approval. */
class Element {
 tagName:string;children:Element[]=[];dataset:Record<string,string>={};className='';disabled=false;open=false;type='';attributes=new Map<string,string>();_text='';onclick?:()=>void;
 constructor(tag:string){this.tagName=tag;}set textContent(value:string){this._text=String(value);this.children=[];}get textContent():string{return this._text+this.children.map(c=>c.textContent).join('');}
 set innerHTML(_value:string){throw new Error('Dynamic HTML forbidden');}append(...children:Element[]){this.children.push(...children);}replaceChildren(...children:Element[]){this._text='';this.children=children;}setAttribute(name:string,value:string){this.attributes.set(name,value);}
 contains(value:Element):boolean{return this===value||this.children.some(c=>c.contains(value));}querySelectorAll(selector:string):Element[]{return flatten(this).filter(e=>selector==='details[data-regional-food-ledger]'?e.tagName==='details'&&e.dataset.regionalFoodLedger!==undefined:selector==='[data-regional-food-focus]'?e.dataset.regionalFoodFocus!==undefined:false);}querySelector(selector:string){return this.querySelectorAll(selector)[0]??null;}focus(){documentFake.activeElement=this;}
}
const documentFake={createElement:(tag:string)=>new Element(tag),activeElement:null as Element|null};
const flatten=(element:Element):Element[]=>[element,...element.children.flatMap(flatten)],button=(element:Element,label:string)=>flatten(element).find(e=>e.tagName==='button'&&e.textContent===label)!;
const seed=73129,fresh=():RegionalFoodState=>structuredClone(createRegionalFood(seed,createRegionalSupply(seed),createRegionalTrade(seed)));
function withDOM(run:()=>void){const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),oldElement=Object.getOwnPropertyDescriptor(globalThis,'HTMLElement');Object.defineProperty(globalThis,'document',{value:documentFake,writable:true,configurable:true});Object.defineProperty(globalThis,'HTMLElement',{value:Element,writable:true,configurable:true});documentFake.activeElement=null;try{run();}finally{if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else delete (globalThis as Record<string,unknown>).document;if(oldElement)Object.defineProperty(globalThis,'HTMLElement',oldElement);else delete (globalThis as Record<string,unknown>).HTMLElement;}}

test('food buttons reread authoritative revision, recheck E/X safety and send one intent per render',()=>withDOM(()=>{
 let state=fresh(),near=true,closed=0;const panel=new Element('section'),sent:RegionalFoodCommand[]=[],farm=regionalFoodPlan(seed).farms[0]!;
 const options={farmId:farm.id,readState:()=>state,command:(c:RegionalFoodCommand)=>{sent.push(c);state={...state,revision:state.revision+1};},canRun:(c:RegionalFoodCommand)=>near&&c.expectedRevision===state.revision,close:()=>closed++};
 const before=JSON.stringify(state);mountRegionalFoodPanel(panel as unknown as HTMLElement,state,options);assert.equal(JSON.stringify(state),before);assert.match(panel.textContent,/2 seeds available/);assert.match(panel.textContent,/stored drinking water and resident flasks are protected/);assert.match(panel.textContent,/Solo menus pause/);assert.match(panel.textContent,/1.4 m\/s/);
 state={...state,revision:2};const start=button(panel,'Start regional farm');start.onclick!();start.onclick!();assert.deepEqual(sent,[{type:'start-farm',targetId:farm.id,expectedRevision:2}]);
 mountRegionalFoodPanel(panel as unknown as HTMLElement,state,options);near=false;button(panel,'Start regional farm').onclick!();assert.equal(sent.length,1);
 mountRegionalFoodPanel(panel as unknown as HTMLElement,state,options);assert.equal(button(panel,'Start regional farm').disabled,true);button(panel,'Start regional farm').onclick!();assert.equal(sent.length,1);button(panel,'×').onclick!();assert.equal(closed,1);
 near=true;mountRegionalFoodPanel(panel as unknown as HTMLElement,state,{...options,readState:()=>({...state,seed:3})});button(panel,'Start regional farm').onclick!();assert.equal(sent.length,1,'stale previous-world callbacks cannot dispatch');
 assert.doesNotMatch(readFileSync(new URL('../src/regional-food-ui.ts',import.meta.url),'utf8'),/innerHTML|setInterval|setTimeout|Date\.now|\.advance/);
}));
test('food disclosure and focus survive live rerender, while removed/disabled actions fall back to Close',()=>withDOM(()=>{
 const state=fresh(),panel=new Element('section'),farm=regionalFoodPlan(seed).farms[0]!,options={farmId:farm.id,readState:()=>state,command(){},canRun(){return true;},close(){},continuesInMenus:true};
 mountRegionalFoodPanel(panel as unknown as HTMLElement,state,options);const ledger=panel.querySelector('details[data-regional-food-ledger]')!;ledger.open=true;ledger.children[0]!.focus();
 for(let i=0;i<5;i++){mountRegionalFoodPanel(panel as unknown as HTMLElement,state,options);const current=panel.querySelector('details[data-regional-food-ledger]')!;assert.equal(current.open,true);assert.equal(documentFake.activeElement,current.children[0]);}
 assert.match(panel.textContent,/online world continues/);button(panel,'Start regional farm').focus();state.farms[0]!.startedAt=0;mountRegionalFoodPanel(panel as unknown as HTMLElement,state,options);assert.equal(button(panel,'Start regional farm'),undefined);assert.equal(documentFake.activeElement,button(panel,'×'));
 button(panel,'Help tend this crop').focus();mountRegionalFoodPanel(panel as unknown as HTMLElement,state,{...options,canRun(){return false;}});assert.equal(documentFake.activeElement,button(panel,'×'));
 mountRegionalFoodPanel(panel as unknown as HTMLElement,state,{...options,farmId:'not-here'});assert.match(panel.textContent,/Regional farm unavailable/);
}));
test('journal and atlas expose bounded source, pantry, actual routes and loaded cargo without production',()=>withDOM(()=>{
 const state=fresh(),panel=new Element('section'),plan=regionalFoodPlan(seed),opened:string[]=[],before=JSON.stringify(state),cache=regionalCacheStats();let maps=0;
 mountRegionalFoodJournalSection(panel as unknown as HTMLElement,state,{seed,open:id=>opened.push(id),map:()=>maps++});
 for(const farm of plan.farms){button(panel,`Inspect ${farm.name}`).onclick!();assert.match(regionalFoodMapDetail(seed,farm.id,state),/actual route/);assert.match(regionalFoodMapDetail(seed,farm.id,state),/meals consumed/);}button(panel,'Show farms and pantries on map').onclick!();assert.equal(maps,1);assert.equal(opened.length,3);assert.equal(JSON.stringify(state),before);
 const overlay=regionalFoodMapOverlay(state);assert.equal(overlay.markers.length,6);assert.equal(overlay.routes.length,3);assert(overlay.markers.every(m=>m.kind==='farm'||m.kind==='pantry'));assert(overlay.markers.every(m=>m.inspectLabel==='Regional food & meals'));
 for(let i=0;i<3;i++)assert.deepEqual(overlay.routes[i]!.points,plan.farms[i]!.path.map(p=>({x:p.x,z:p.z})));assert.equal(regionalCacheStats().featureCompilations,cache.featureCompilations);
 const saved=state.farms[0]!;saved.startedAt=0;saved.cargo=4;saved.distance=14;saved.activity='outbound';const carrier=regionalFoodMapOverlay(state).markers.find(m=>m.kind==='carrier')!;assert.match(carrier.detail,/4 actual food cargo/);assert.match(carrier.detail,/to pantry arrival/);assert.equal(carrier.targetId,plan.farms[0]!.id);
 mountRegionalFoodJournalSection(panel as unknown as HTMLElement,undefined,{seed,open(){}});assert.equal(flatten(panel).filter(e=>e.tagName==='button').length,0);
}));
test('water, seed and capacity shortages stay distinct while loaded, held and consumed food balance exactly',()=>withDOM(()=>{
 const state=fresh(),saved=state.farms[0]!,farm=regionalFoodPlan(seed).farms[0]!,panel=new Element('section'),options={farmId:farm.id,readState:()=>state,command(){},canRun(){return false;},close(){}};
 saved.startedAt=0;saved.seeds=0;saved.water=1;saved.stock=8;saved.store=8;mountRegionalFoodPanel(panel as unknown as HTMLElement,state,options);for(const text of ['Seed shortage','Water shortage','Harvest capacity full','Pantry capacity pending'])assert.match(panel.textContent,new RegExp(text));assert.equal(regionalFoodPendingText(farm,saved).length,4);
 saved.seeds=1;saved.crop='growing';saved.growth=60;saved.stock=0;saved.store=1;saved.cargo=4;saved.returnMeal=1;saved.farmerMeal=1;saved.carrierMeal=1;saved.meals=4;saved.harvested=12;saved.activity='outbound';saved.distance=10;mountRegionalFoodPanel(panel as unknown as HTMLElement,state,options);assert.match(panel.textContent,/Growing: 50%/);assert.doesNotMatch(panel.textContent,/Seed shortage:/);assert.match(panel.textContent,/0 one-time starter provisions \+ 12 harvested food = 0 at farm \+ 0 reserved \+ 4 loaded cargo \+ 1 pantry food \+ 1 returning meal \+ 1 farmer-held meal \+ 1 carrier-held meal \+ 4 consumed meals/);assert.match(panel.textContent,/to pantry arrival/);
 saved.activity='returning';mountRegionalFoodPanel(panel as unknown as HTMLElement,state,options);assert.match(panel.textContent,/to return/);
 saved.crop='ripe';saved.harvestWork=8;saved.activity='loading';saved.actionWork=4;mountRegionalFoodPanel(panel as unknown as HTMLElement,state,options);assert.match(panel.textContent,/Harvest work: 50%/);assert.match(panel.textContent,/Loading work: 50%/);
 saved.activity='unloading';mountRegionalFoodPanel(panel as unknown as HTMLElement,state,options);assert.match(panel.textContent,/Unloading work: 50%/);saved.activity='eating';mountRegionalFoodPanel(panel as unknown as HTMLElement,state,options);assert.match(panel.textContent,/Eating: 50%/);
 assert.equal(regionalFoodTravelText(61),'1 min 1 sec active');assert.equal(regionalFoodTravelText(null),'waiting for the next delivery');assert.doesNotMatch(panel.textContent,/gold|coins|free reward/i);
}));
test('water overflow wording keeps historical loss outside the captured-water balance',()=>withDOM(()=>{
 const state=fresh(),saved=state.farms[0]!,farm=regionalFoodPlan(seed).farms[0]!,panel=new Element('section');saved.waterCaptured=10;saved.water=2;saved.waterUsed=8;saved.waterLost=20;saved.sourceSpilled=120;
 mountRegionalFoodPanel(panel as unknown as HTMLElement,state,{farmId:farm.id,readState:()=>state,command(){},canRun(){return false;},close(){}});assert.match(panel.textContent,/10 L crop water captured = 2 L stored \+ 8 L used/);assert.match(panel.textContent,/Uncaptured overflow since this food ledger began: 20 L/);assert.match(panel.textContent,/Collector lifetime overflow watermark: 120 L/);assert.doesNotMatch(panel.textContent,/8 L used \+ 20 L/);
}));

test('specific missing collector and store prerequisites link to their existing community panels',()=>withDOM(()=>{
 const state=fresh(),farm=regionalFoodPlan(seed).farms[0]!,panel=new Element('section'),supply=structuredClone(createRegionalSupply(seed));let collectors=0,stores=0;
 const ctx={generation:2 as const,seed,regional:{version:1 as const},frontierSupply:supply};
 const options={farmId:farm.id,readState:()=>state,context:ctx,command(){},canRun(){return false;},close(){},collector:()=>collectors++,freight:()=>stores++};
 mountRegionalFoodPanel(panel as unknown as HTMLElement,state,options);assert.match(panel.textContent,/Rain collector not built/);assert.match(panel.textContent,/Freight-store status unavailable/);button(panel,'Inspect rain collector').onclick!();button(panel,'Inspect freight store').onclick!();assert.equal(collectors,1);assert.equal(stores,1);
 const outpost=supply.outposts.find(o=>o.id===farm.siteId)!;outpost.buildStartedAt=0;mountRegionalFoodPanel(panel as unknown as HTMLElement,state,options);assert.match(panel.textContent,/Rain collector under construction/);outpost.builtAt=10;outpost.water=6;mountRegionalFoodPanel(panel as unknown as HTMLElement,state,options);assert.match(panel.textContent,/Rain collector operational · 6 L stored/);
}));
