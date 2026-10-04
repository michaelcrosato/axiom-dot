import {createRegionalTrade} from '../src/regional-trade.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountRegionalFoodPanel,mountRegionalFoodJournalSection,regionalFoodIrrigationText,regionalFoodMapDetail,regionalFoodMapOverlay,regionalFoodPendingText,regionalFoodTravelText} from '../src/regional-food-ui.ts';
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
const seed=73129,fresh=():RegionalFoodState=>structuredClone(createRegionalFood(seed,createRegionalSupply(seed),createRegionalTrade(seed),2));
function withDOM(run:()=>void){const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),oldElement=Object.getOwnPropertyDescriptor(globalThis,'HTMLElement');Object.defineProperty(globalThis,'document',{value:documentFake,writable:true,configurable:true});Object.defineProperty(globalThis,'HTMLElement',{value:Element,writable:true,configurable:true});documentFake.activeElement=null;try{run();}finally{if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else delete (globalThis as Record<string,unknown>).document;if(oldElement)Object.defineProperty(globalThis,'HTMLElement',oldElement);else delete (globalThis as Record<string,unknown>).HTMLElement;}}

test('Food v2 panel explicitly separates imported water, one-use limit, balance and opportunity cost',()=>withDOM(()=>{
 const state=fresh(),farm=regionalFoodPlan(seed).farms[0]!,saved=state.farms[0]!,panel=new Element('section');saved.startedAt=0;
 const context={generation:2 as const,seed,regional:{version:1 as const},inventory:{water:2}},options={farmId:farm.id,readState:()=>state,context,command(){},canRun(){return true;},close(){}};
 const before=JSON.stringify(state);mountRegionalFoodPanel(panel as any,state,options);assert.equal(JSON.stringify(state),before);assert.match(panel.textContent,/2 pack canisters available/);assert.match(panel.textContent,/One lifetime application remains/);assert.match(panel.textContent,/spend exactly 1 earned pack canister for 4 L/);assert.match(panel.textContent,/at most 2 L/);assert.match(panel.textContent,/Mossbank’s three-canister delivery/);assert.match(panel.textContent,/not repeatable drought relief/);assert(button(panel,'Spend 1 canister → 4 L · once per farm'));
 saved.waterCaptured=10;saved.waterIrrigated=4;saved.water=2;saved.waterUsed=12;saved.waterLost=20;context.inventory.water=1;mountRegionalFoodPanel(panel as any,state,options);
 assert.match(panel.textContent,/Emergency irrigation used permanently/);assert.match(panel.textContent,/No second canister can be added/);assert.match(panel.textContent,/4 L imported from a canister · 10 L rain overflow captured · 20 L uncaptured rain overflow lost/);assert.match(panel.textContent,/10 L crop water captured \+ 4 L imported canister water = 2 L stored \+ 12 L used/);assert.match(panel.textContent,/Uncaptured overflow since this food ledger began: 20 L/);assert.equal(button(panel,'Spend 1 canister → 4 L · once per farm'),undefined);
 assert.match(regionalFoodIrrigationText(saved),/balance unavailable/);
}));
test('irrigation button rereads authority, enforces one dispatch and blocks stale, changed or distant intent',()=>withDOM(()=>{
 let state=fresh(),near=true;state.farms[0]!.startedAt=0;const farm=regionalFoodPlan(seed).farms[0]!,panel=new Element('section'),sent:RegionalFoodCommand[]=[];
 const options={farmId:farm.id,readState:()=>state,canRun:(c:RegionalFoodCommand)=>near&&c.expectedRevision===state.revision&&state.farms[0]!.waterIrrigated===0,command:(command:RegionalFoodCommand)=>sent.push(command),close(){}};
 mountRegionalFoodPanel(panel as any,state,options);state={...state,revision:2};const button0=button(panel,'Spend 1 canister → 4 L · once per farm');button0.onclick!();button0.onclick!();assert.deepEqual(sent,[{type:'irrigate-farm',targetId:farm.id,expectedRevision:2}]);
 mountRegionalFoodPanel(panel as any,state,options);near=false;button(panel,'Spend 1 canister → 4 L · once per farm').onclick!();assert.equal(sent.length,1);
 near=true;mountRegionalFoodPanel(panel as any,state,options);state.farms[0]!.waterIrrigated=4;button(panel,'Spend 1 canister → 4 L · once per farm').onclick!();assert.equal(sent.length,1);
 state=fresh();mountRegionalFoodPanel(panel as any,state,{...options,readState:()=>({...state,seed:3})});button(panel,'Spend 1 canister → 4 L · once per farm').onclick!();assert.equal(sent.length,1);
}));
test('persistent used state appears in journal and map while v1 remains overflow-only',()=>withDOM(()=>{
 const state=fresh(),farm=regionalFoodPlan(seed).farms[0]!,panel=new Element('section'),saved=state.farms[0]!;saved.startedAt=0;saved.waterIrrigated=4;
 const context={generation:2 as const,seed,regional:{version:1 as const},inventory:{water:0}},before=JSON.stringify(state);
 mountRegionalFoodJournalSection(panel as any,state,{seed,context,open(){}});assert.match(panel.textContent,/one-use emergency canister/);assert.match(panel.textContent,/Emergency irrigation used permanently/);assert.match(regionalFoodMapDetail(seed,farm.id,state,context),/Emergency irrigation used permanently/);assert.equal(JSON.stringify(state),before);
 const legacy=createRegionalFood(seed,createRegionalSupply(seed),createRegionalTrade(seed));mountRegionalFoodPanel(panel as any,legacy,{farmId:farm.id,readState:()=>legacy,context,command(){},canRun(){return true;},close(){}});assert.doesNotMatch(panel.textContent,/EMERGENCY IRRIGATION|imported canister|Pack canister/);assert.equal(button(panel,'Spend 1 canister → 4 L · once per farm'),undefined);
 assert.doesNotMatch(regionalFoodMapDetail(seed,farm.id,legacy,context),/canister/);
}));
test('used irrigation removes focused spend control safely and preserves ledger disclosure',()=>withDOM(()=>{
 const state=fresh(),saved=state.farms[0]!,farm=regionalFoodPlan(seed).farms[0]!,panel=new Element('section'),options={farmId:farm.id,readState:()=>state,command(){},canRun(){return true;},close(){}};
 mountRegionalFoodPanel(panel as any,state,options);button(panel,'Spend 1 canister → 4 L · once per farm').focus();panel.querySelector('details[data-regional-food-ledger]')!.open=true;saved.waterIrrigated=4;mountRegionalFoodPanel(panel as any,state,options);assert.equal(documentFake.activeElement,button(panel,'×'));assert.equal(panel.querySelector('details[data-regional-food-ledger]')!.open,true);
}));
