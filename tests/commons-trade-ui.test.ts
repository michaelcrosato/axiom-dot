import test from 'node:test';
import assert from 'node:assert/strict';
import {mountCommonsTradeSection} from '../src/commons-trade-ui.ts';
import {createConnectedState,enableCommonsTrade,applyAction,worldObjects,causalContext,validateSave} from '../src/world.ts';
import {causalPlan} from '../src/causal.ts';
import type {CommonsTradeCommand} from '../src/commons-trade.ts';
class Element {
 tagName:string;children:Element[]=[];attributes:Record<string,string>={};dataset:Record<string,string>={};className='';disabled=false;open=false;_text='';onclick?:()=>void;
 constructor(tag:string){this.tagName=tag;}
 set textContent(v:string){this._text=String(v);this.children=[];}
 get textContent():string{return this._text+this.children.map(e=>e.textContent).join('');}
 set innerHTML(_value:string){throw new Error('HTML insertion is forbidden');}
 append(...children:Element[]){this.children.push(...children);}
 replaceChildren(...children:Element[]){this._text='';this.children=[...children];}
 setAttribute(key:string,value:string){this.attributes[key]=value;}
 contains(node:unknown):boolean{return this===node||this.children.some(c=>c.contains(node));}
 querySelectorAll(selector:string):Element[]{return flatten(this).filter(e=>selector==='[data-commons-history]'?e.dataset.commonsHistory!==undefined:selector==='[data-commons-household]'?e.dataset.commonsHousehold!==undefined:false);}
 querySelector(selector:string){return this.querySelectorAll(selector)[0]??null;}
 focus(){Object.defineProperty(globalThis.document,'activeElement',{value:this,configurable:true});}
}
const flatten=(e:Element):Element[]=>[e,...e.children.flatMap(flatten)];
test('snapshot-only barter UI exposes actual scarcity/consequences and stale callbacks cannot duplicate a transaction',()=>{
 const previous=globalThis.document;globalThis.document={createElement:(tag:string)=>new Element(tag)} as unknown as Document;
 try{
  let state=enableCommonsTrade(createConnectedState(1));for(const o of worldObjects(state).filter(o=>o.kind==='water')){state=applyAction(state,{type:'move',x:o.x,z:o.z});state=applyAction(state,{type:'collect',id:o.id});}state=applyAction(state,{type:'move',...causalPlan(1).settlements[0]!.position});
  const before=JSON.stringify(state),commands:CommonsTradeCommand[]=[],panel=new Element('section'),options={state:()=>({causal:state.causal!,context:causalContext(state)}),act:(command:CommonsTradeCommand)=>{commands.push(command);state=applyAction(state,{type:'commons-trade',command});}};
  mountCommonsTradeSection(panel as unknown as HTMLElement,options);assert.equal(JSON.stringify(state),before);assert.match(panel.textContent,/leave a workshop broken/);assert.match(panel.textContent,/2 communal repair scrap remaining/);assert.match(panel.textContent,/Earlier deliveries earn no scrap/);
  const first=flatten(panel).find(e=>e.tagName==='button')!;assert.equal(first.disabled,false);first.onclick!();assert.equal(commands[0]!.expectedRevision,0);assert.equal(state.inventory.scrap,1);assert.equal(state.inventory.water,2);assert.match(panel.textContent,/received 4 L/);assert.match(panel.textContent,/1 communal repair scrap remaining/);
  const paid=JSON.stringify(state);first.onclick!();assert.equal(JSON.stringify(state),paid,'delayed callback carries stale revision');flatten(panel).find(e=>e.tagName==='button')!.onclick!();assert.equal(state.inventory.scrap,2);assert.equal(state.causal!.materials,0);assert.ok(flatten(panel).filter(e=>e.tagName==='button').every(e=>e.disabled));assert(validateSave(state));
  state={...state,zone:'dungeon'};const unchanged=JSON.stringify(state);mountCommonsTradeSection(panel as unknown as HTMLElement,options);assert.ok(flatten(panel).filter(e=>e.tagName==='button').every(e=>e.disabled));assert.equal(JSON.stringify(state),unchanged);
 }finally{globalThis.document=previous;}
});

test('barter panel gives actionable absent-water and distance feedback from real authority conditions',()=>{
 const previous=globalThis.document;globalThis.document={createElement:(tag:string)=>new Element(tag)} as unknown as Document;
 try{let state=enableCommonsTrade(createConnectedState(1)),panel=new Element('section');const options={state:()=>({causal:state.causal!,context:causalContext(state)}),act:()=>{throw Error('Unexpected command');}};mountCommonsTradeSection(panel as unknown as HTMLElement,options);assert.match(panel.textContent,/Gather one water canister/);const o=worldObjects(state).find(o=>o.kind==='water')!;state=applyAction(state,{type:'move',...o});state=applyAction(state,{type:'collect',id:o.id});state=applyAction(state,{type:'move',x:0,z:0});mountCommonsTradeSection(panel as unknown as HTMLElement,options);assert.match(panel.textContent,/Visit this household’s gold flag/);assert.ok(flatten(panel).filter(e=>e.tagName==='button').every(e=>e.disabled));}finally{globalThis.document=previous;}
});

test('actual main barter handlers dispatch solo and online through the production action boundary without touching lab state',async()=>{
 const {readFileSync}=await import('node:fs'),{stripTypeScriptTypes}=await import('node:module'),source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
 const render=source.slice(source.indexOf('function renderBarterPanel(){')),send=source.slice(source.indexOf('function sendWorldAction('),source.indexOf('function receiveCoopSnapshot('));
 const make=new Function('state','applyAction','causalContext','strip',`let sessionReloading=false,labActive=false,transitioning=false,coop={active:false,send(a){sent.push(a);return true}},sent=[],messages=[],mounted=null,closed=0,writes=0;const body={},clock={},button={},panel={innerHTML:'',querySelector(){return button}},$=id=>id==='barter-clock'?clock:body;const toast=s=>messages.push(s),animateAction=()=>{},closePanel=()=>closed++,restoreWorld=()=>{throw Error('Unexpected restore')},commit=s=>{if(s!==state){state=s;writes++}},mountCommonsTradeSection=(p,o)=>mounted=o;${stripTypeScriptTypes(render+send)};return {render:renderBarterPanel,get mounted(){return mounted},get state(){return state},get closed(){return closed},get writes(){return writes},get sent(){return sent},get clock(){return clock.textContent},setOnline(v){coop.active=v},setLab(v){labActive=v},setState(v){state=v},close(){button.onclick()}};`);
 let state=enableCommonsTrade(createConnectedState(1));for(const o of worldObjects(state).filter(o=>o.kind==='water')){state=applyAction(state,{type:'move',...o});state=applyAction(state,{type:'collect',id:o.id});}state=applyAction(state,{type:'move',...causalPlan(1).settlements[0]!.position});const api=make(state,applyAction,causalContext,stripTypeScriptTypes);api.render();assert.match(api.clock,/pauses/);const command={type:'water-for-scrap',settlementId:causalPlan(1).settlements[0]!.id,expectedRevision:0};api.mounted.act(command);assert.equal(api.state.inventory.scrap,1);assert.equal(api.writes,1);assert(validateSave(api.state));api.setOnline(true);api.render();assert.match(api.clock,/online world keeps moving/);const before=JSON.stringify(api.state);api.mounted.act({...command,expectedRevision:1});assert.deepEqual(api.sent,[{type:'commons-trade',command:{...command,expectedRevision:1}}]);assert.equal(JSON.stringify(api.state),before);api.setLab(true);api.mounted.act(command);assert.equal(api.sent.length,1);assert.equal(api.writes,1);api.close();assert.equal(api.closed,1);api.setState(createConnectedState(1));api.render();assert.equal(api.closed,2);
 assert.match(source,/if\(type==='barter'\)\{renderBarterPanel\(\);return;\}/);assert.match(source,/else if\(panel.dataset.type==='barter'\)renderBarterPanel\(\)/);assert.match(source,/state=enableRegionalFood\(enableRegionalTrade\(enableRegionalSupply\(enableWaterRequests\(enableCommonsTrade\(enableCaveSupply/);
});

test('online-style remount retains open receipt history and current keyboard target while authority changes',()=>{const previous=globalThis.document;globalThis.document={createElement:(tag:string)=>new Element(tag),activeElement:null} as unknown as Document;try{let state=enableCommonsTrade(createConnectedState(1));const water=worldObjects(state).find(o=>o.kind==='water')!;state=applyAction(state,{type:'move',...water});state=applyAction(state,{type:'collect',id:water.id});state=applyAction(state,{type:'move',...causalPlan(1).settlements[0]!.position});const panel=new Element('section'),options={state:()=>({causal:state.causal!,context:causalContext(state)}),act:()=>{}};mountCommonsTradeSection(panel as unknown as HTMLElement,options);panel.querySelector('[data-commons-history]')!.open=true;const button=panel.querySelector('[data-commons-household]')!;button.focus();state=applyAction(state,{type:'tick',dt:.25});mountCommonsTradeSection(panel as unknown as HTMLElement,options);assert.equal(panel.querySelector('[data-commons-history]')!.open,true);assert.notEqual(globalThis.document.activeElement,button);assert.equal((globalThis.document.activeElement as unknown as Element).dataset.commonsHousehold,button.dataset.commonsHousehold);}finally{globalThis.document=previous;}});
