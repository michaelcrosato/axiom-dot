import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountRegionalSupplyPanel,mountRegionalSupplyJournalSection,regionalSupplyMapDetail} from '../src/regional-supply-ui.ts';
import {createRegionalSupply,regionalSupplyPlan,type RegionalSupplyState,type RegionalSupplyCommand} from '../src/regional-supply.ts';
import {regionalCacheStats} from '../src/regional-world.ts';

/** Offline literal-DOM contracts. These do not claim browser visual approval. */
class Element {
 tagName:string;children:Element[]=[];dataset:Record<string,string>={};className='';disabled=false;open=false;type='';attributes=new Map<string,string>();_text='';onclick?:()=>void;
 constructor(tag:string){this.tagName=tag;}
 set textContent(value:string){this._text=String(value);this.children=[];}get textContent():string{return this._text+this.children.map(child=>child.textContent).join('');}
 set innerHTML(_value:string){throw new Error('Dynamic HTML forbidden');}
 append(...children:Element[]){this.children.push(...children);}replaceChildren(...children:Element[]){this._text='';this.children=children;}
 setAttribute(name:string,value:string){this.attributes.set(name,value);}
 contains(value:Element):boolean{return this===value||this.children.some(child=>child.contains(value));}
 querySelectorAll(selector:string):Element[]{return flatten(this).filter(e=>selector==='details[data-regional-supply-ledger]'?e.tagName==='details'&&e.dataset.regionalSupplyLedger!==undefined:selector==='[data-regional-supply-focus]'?e.dataset.regionalSupplyFocus!==undefined:false);}
 querySelector(selector:string){return this.querySelectorAll(selector)[0]??null;}
 focus(){documentFake.activeElement=this;}
}
const documentFake={createElement:(tag:string)=>new Element(tag),activeElement:null as Element|null};
const flatten=(element:Element):Element[]=>[element,...element.children.flatMap(flatten)];
const button=(element:Element,label:string)=>flatten(element).find(e=>e.tagName==='button'&&e.textContent===label)!;
const seed=73129;
function fresh():RegionalSupplyState {return structuredClone(createRegionalSupply(seed));}
function withDOM(run:()=>void){const priorDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),priorElement=Object.getOwnPropertyDescriptor(globalThis,'HTMLElement');Object.defineProperty(globalThis,'document',{value:documentFake,writable:true,configurable:true});Object.defineProperty(globalThis,'HTMLElement',{value:Element,writable:true,configurable:true});documentFake.activeElement=null;try{run();}finally{if(priorDocument)Object.defineProperty(globalThis,'document',priorDocument);else delete (globalThis as Record<string,unknown>).document;if(priorElement)Object.defineProperty(globalThis,'HTMLElement',priorElement);else delete (globalThis as Record<string,unknown>).HTMLElement;}}

test('panel actions dispatch exact revisioned commands once and disabled controls remain inert',()=>withDOM(()=>{
 let state=fresh(),near=true,closed=0;const panel=new Element('section'),sent:RegionalSupplyCommand[]=[],outpostId=state.outposts[0]!.id;
 const options={outpostId,command:(command:RegionalSupplyCommand)=>{sent.push(command);state={...state,revision:state.revision+1};},canRun:(command:RegionalSupplyCommand)=>near&&command.expectedRevision===state.revision&&command.type==='deliver',close:()=>closed++};
 const before=JSON.stringify(state);mountRegionalSupplyPanel(panel as unknown as HTMLElement,state,options);assert.equal(JSON.stringify(state),before);assert.match(panel.textContent,/Carried: 0 wood/);assert.match(panel.textContent,/hydration 40%/);assert.match(panel.textContent,/solo menus pause/);
 const deliver=button(panel,'Deliver carried materials'),build=button(panel,'Start collector retrofit');assert.equal(deliver.disabled,false);assert.equal(build.disabled,true);build.onclick!();assert.equal(sent.length,0);
 deliver.onclick!();deliver.onclick!();assert.deepEqual(sent,[{type:'deliver',outpostId,expectedRevision:0}]);near=false;mountRegionalSupplyPanel(panel as unknown as HTMLElement,state,options);const remote=button(panel,'Deliver carried materials');assert.equal(remote.disabled,true);remote.onclick!();assert.equal(sent.length,1);button(panel,'×').onclick!();assert.equal(closed,1);
 assert.doesNotMatch(readFileSync(new URL('../src/regional-supply-ui.ts',import.meta.url),'utf8'),/innerHTML|setInterval|setTimeout|Date\.now/);
}));

test('repeated snapshot remounts preserve disclosure and keyboard focus with no listeners or timers',()=>withDOM(()=>{
 const state=fresh(),panel=new Element('section'),options={outpostId:state.outposts[0]!.id,command(){},canRun(){return true;},close(){},continuesInMenus:true};
 mountRegionalSupplyPanel(panel as unknown as HTMLElement,state,options);const ledger=panel.querySelector('details[data-regional-supply-ledger]')!;ledger.open=true;ledger.children[0]!.focus();
 for(let i=0;i<8;i++){mountRegionalSupplyPanel(panel as unknown as HTMLElement,state,options);const current=panel.querySelector('details[data-regional-supply-ledger]')!;assert.equal(current.open,true);assert.equal(documentFake.activeElement,current.children[0]);}
 assert.match(panel.textContent,/online world continues/);button(panel,'Deliver carried materials').focus();mountRegionalSupplyPanel(panel as unknown as HTMLElement,state,options);assert.equal(documentFake.activeElement,button(panel,'Deliver carried materials'));
 panel.querySelector('details[data-regional-supply-ledger]')!.open=false;mountRegionalSupplyPanel(panel as unknown as HTMLElement,state,options);assert.equal(panel.querySelector('details[data-regional-supply-ledger]')!.open,false);
}));

test('journal and atlas use macro metadata without compiling candidate source chunks',()=>withDOM(()=>{
 const state=fresh(),panel=new Element('section'),opened:string[]=[],before=regionalCacheStats();let maps=0;
 mountRegionalSupplyJournalSection(panel as unknown as HTMLElement,state,{seed,open:id=>opened.push(id),map:()=>maps++});
 for(const outpost of regionalSupplyPlan(seed).outposts){const detail=regionalSupplyMapDetail(seed,outpost.id,state);assert.match(detail,/Materials needed/);assert.match(detail,/E \/ X/);button(panel,`Inspect ${outpost.name}`).onclick!();}
 assert.equal(opened.length,6);assert.match(panel.textContent,/Start at Alder Waystation/);button(panel,'Open frontier map').onclick!();assert.equal(maps,1);assert.equal(regionalCacheStats().featureCompilations,before.featureCompilations);
 assert.equal(regionalSupplyMapDetail(seed,'unknown',state),'');mountRegionalSupplyJournalSection(panel as unknown as HTMLElement,undefined,{seed,open(){}});assert.match(panel.textContent,/Open a 10 km² frontier/);assert.equal(flatten(panel).filter(element=>element.tagName==='button').length,0);
}));

test('construction and operating panels show committed outcomes without invented rewards',()=>withDOM(()=>{
 const state=fresh(),saved=state.outposts[0]!,identity=regionalSupplyPlan(seed).outposts[0]!,panel=new Element('section'),options={outpostId:saved.id,command(){},canRun(){return false;},close(){}};
 saved.delivered={...identity.cost};saved.buildStartedAt=0;mountRegionalSupplyPanel(panel as unknown as HTMLElement,state,options);assert.match(panel.textContent,/Residents are building/);assert.equal(button(panel,'Start collector retrofit'),undefined);
 saved.builtAt=1;saved.water=3;saved.captured=6;saved.consumed=2;saved.spilled=.5;saved.residents[0]!.carrying=.5;saved.residents[0]!.drunk=2;saved.residents[0]!.thirst=20;mountRegionalSupplyPanel(panel as unknown as HTMLElement,state,options);
 assert.match(panel.textContent,/Collector in use/);assert.match(panel.textContent,/6 L captured = 3 L stored \+ 0.5 L carried \+ 2 L drunk \+ 0.5 L overflow/);assert.match(panel.textContent,/hydration 80%/);assert.doesNotMatch(panel.textContent,/Claim|renown|reward paid/);assert.match(regionalSupplyMapDetail(seed,saved.id,state),/2 L used/);
}));


test('focus moves to Close when a successful build or refreshed gate removes the focused action',()=>withDOM(()=>{
 const state=fresh(),saved=state.outposts[0]!,panel=new Element('section'),options={outpostId:saved.id,command(){},canRun(){return true;},close(){}};
 mountRegionalSupplyPanel(panel as unknown as HTMLElement,state,options);button(panel,'Start collector retrofit').focus();saved.delivered={...regionalSupplyPlan(seed).outposts[0]!.cost};saved.buildStartedAt=0;mountRegionalSupplyPanel(panel as unknown as HTMLElement,state,options);
 assert.equal(button(panel,'Start collector retrofit'),undefined);assert.equal(documentFake.activeElement,button(panel,'×'));assert.equal(panel.contains(documentFake.activeElement!),true);
 const waiting=fresh();mountRegionalSupplyPanel(panel as unknown as HTMLElement,waiting,options);button(panel,'Deliver carried materials').focus();mountRegionalSupplyPanel(panel as unknown as HTMLElement,waiting,{...options,canRun(){return false;}});assert.equal(documentFake.activeElement,button(panel,'×'));
}));
