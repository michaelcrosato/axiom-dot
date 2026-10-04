import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
import {causalPlan} from '../src/causal.ts';import {waterRequestView,WATER_REQUEST_RULES,type WaterRequestCommand} from '../src/water-requests.ts';
import {createConnectedState,createState,enableWaterRequests,applyAction,worldObjects,type State} from '../src/world.ts';
class Element {
 tagName:string;children:Element[]=[];dataset:Record<string,string>={};className='';disabled=false;open=false;_text='';onclick?:()=>void;
 constructor(tag:string){this.tagName=tag;}
 set textContent(v:string){this._text=String(v);this.children=[];}get textContent():string{return this._text+this.children.map(c=>c.textContent).join('');}
 set innerHTML(_v:string){throw new Error('Dynamic HTML is forbidden');}
 append(...children:Element[]){this.children.push(...children);}replaceChildren(...children:Element[]){this._text='';this.children=children;}
 contains(e:Element):boolean{return this===e||this.children.some(c=>c.contains(e));}
 querySelectorAll(selector:string):Element[]{return flatten(this).filter(e=>selector==='details[data-water-request-history]'?e.tagName==='details'&&e.dataset.waterRequestHistory!==undefined:selector==='[data-water-request-focus]'?e.dataset.waterRequestFocus!==undefined:false);}
 querySelector(selector:string){return this.querySelectorAll(selector)[0]??null;}
 focus(){document.activeElement=this;}
}
const document={createElement:(tag:string)=>new Element(tag),activeElement:null as Element|null};
const flatten=(e:Element):Element[]=>[e,...e.children.flatMap(flatten)];
const source=readFileSync(new URL('../src/water-requests-ui.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export interface','interface').replace('export function','function');
const mount=new Function('causalPlan','waterRequestView','WATER_REQUEST_RULES','document','HTMLElement',stripTypeScriptTypes(source,{mode:'strip'})+'\nreturn mountWaterRequestsSection;')(causalPlan,waterRequestView,WATER_REQUEST_RULES,document,Element);
function ready(){let s=enableWaterRequests(createConnectedState(1));for(const o of worldObjects(s)){if(o.kind==='water'){s=applyAction(s,{type:'move',...o});s=applyAction(s,{type:'collect',id:o.id});}if(o.kind==='enemy'){s=applyAction(s,{type:'move',...o});s=applyAction(s,{type:'attack',id:o.id});}}s=applyAction(s,{type:'move',...causalPlan(1).settlements[1]!.position});for(let i=0;i<91;i++)s=applyAction(s,{type:'tick',dt:1});return s;}
function harness(initial:State){let state=initial;const commands:WaterRequestCommand[]=[],panel=new Element('section'),options={command:(command:WaterRequestCommand)=>{commands.push(command);state=applyAction(state,{type:'water-request',command});},canRun:(command:WaterRequestCommand)=>applyAction(state,{type:'water-request',command})!==state};const render=()=>{const before=JSON.stringify(state);mount(panel,state,options);assert.equal(JSON.stringify(state),before);};render();return {panel,commands,render,get state(){return state;},set state(s:State){state=s;}};}
const button=(p:Element,label:string)=>flatten(p).find(e=>e.tagName==='button'&&e.textContent===label)!;

test('request section renders exact committed deadlines, issuer and need receipts, with literal DOM only',()=>{
 const h=harness(ready());assert.match(h.panel.textContent,/Highmeadow · Water relief 1/);assert.match(h.panel.textContent,/at 91 s only 2.99 L remained/);assert.match(h.panel.textContent,/Relieve before 271 s · 180 active seconds remain/);assert.match(h.panel.textContent,/Completion deadline: 271 s/);assert.match(h.panel.textContent,/strictly before/);assert.equal(h.panel.querySelector('details[data-water-request-history]')!.open,false);
 const b=button(h.panel,'Accept water relief');assert.equal(b.disabled,false);const id=waterRequestView(h.state.causal!,1).episodes.at(-1)!.id,revision=h.state.causal!.waterRequests!.revision;b.onclick!();assert.deepEqual(h.commands,[{type:'accept',id,expectedRevision:revision}]);h.render();assert.equal(button(h.panel,'Accept water relief'),undefined);assert.match(h.panel.textContent,/Accepted at 91 s/);
 const p=structuredClone(causalPlan(1));p.settlements[1]!.name='<img src=x onerror=alert(1)>';
 const literal=new Function('causalPlan','waterRequestView','WATER_REQUEST_RULES','document','HTMLElement',stripTypeScriptTypes(source,{mode:'strip'})+'\nreturn mountWaterRequestsSection;')(()=>p,waterRequestView,WATER_REQUEST_RULES,document,Element);literal(h.panel,h.state,{command(){},canRun(){return false;}});assert.match(h.panel.textContent,/<img src=x onerror=alert\(1\)>/);
 assert.doesNotMatch(source,/setTimeout|setInterval|Date\.now|innerHTML/);
});

test('read-only, stale callbacks and physical gates cannot dispatch invalid commands',()=>{
 const h=harness(ready()),old=button(h.panel,'Accept water relief');old.onclick!();assert.equal(h.commands.length,1);old.onclick!();assert.equal(h.commands.length,1,'old revision is rechecked before dispatch');
 h.state={...ready(),zone:'dungeon'};h.render();assert.equal(button(h.panel,'Accept water relief').disabled,true);button(h.panel,'Accept water relief').onclick!();assert.equal(h.commands.length,1);assert.match(h.panel.textContent,/Visit the issuing settlement flag/);
 const disabled=harness(createState(1));assert.match(disabled.panel.textContent,/not enabled/);assert.equal(flatten(disabled.panel).filter(e=>e.tagName==='button').length,0);
});

test('history expansion and keyboard focus survive repeated 4Hz snapshot remounts without a view timer',()=>{
 const h=harness(ready()),details=h.panel.querySelector('details[data-water-request-history]')!,summary=details.children[0]!;details.open=true;summary.focus();const initial=JSON.stringify(h.state);
 for(let i=0;i<8;i++){h.render();const current=h.panel.querySelector('details[data-water-request-history]')!;assert.equal(current.open,true);assert.equal(document.activeElement,current.children[0]);}
 assert.equal(JSON.stringify(h.state),initial);const accept=button(h.panel,'Accept water relief');accept.focus();h.render();assert.equal(document.activeElement,button(h.panel,'Accept water relief'));assert.equal(h.panel.querySelector('details[data-water-request-history]')!.open,true);
 h.panel.querySelector('details[data-water-request-history]')!.open=false;h.render();assert.equal(h.panel.querySelector('details[data-water-request-history]')!.open,false);
});

test('completion and claim equality show model expiry; remaining clock is computed from the current authoritative snapshot',()=>{
 const h=harness(ready());button(h.panel,'Accept water relief').onclick!();const id=causalPlan(1).settlements[1]!.id;h.state=applyAction(h.state,{type:'causal',command:{type:'deliver-water',settlementId:id}});h.render();assert.match(h.panel.textContent,/Claim before 271 s · 180 active seconds remain/);assert.match(h.panel.textContent,/Completion deadline: 271 s · Claim deadline: 271 s/);assert.equal(button(h.panel,'Claim 4 renown').disabled,false);
 for(let i=0;i<719;i++)h.state=applyAction(h.state,{type:'tick',dt:.25});h.render();assert.match(h.panel.textContent,/0.25 active seconds remain/);const old=button(h.panel,'Claim 4 renown');
 h.state=applyAction(h.state,{type:'tick',dt:.25});old.onclick!();assert.equal(h.commands.length,1,'claim callback is invalid at the exact deadline');h.render();assert.equal(button(h.panel,'Claim 4 renown'),undefined);assert.match(h.panel.textContent,/expired: Claim deadline missed/);assert.match(h.panel.textContent,/0 renown paid; reservation released/);assert.match(h.panel.textContent,/claim deadline 271 s/);
 const expired=harness(ready());for(let i=0;i<180;i++)expired.state=applyAction(expired.state,{type:'tick',dt:1});expired.render();assert.match(expired.panel.textContent,/expired: Relief deadline missed/);assert.equal(button(expired.panel,'Accept water relief'),undefined);
});


test('online section explicitly preserves the shared host clock through menus and guest backgrounding',()=>{
 const h=harness(ready());mount(h.panel,h.state,{command(){},canRun(){return false;},continuesInMenus:true});assert.match(h.panel.textContent,/Online room time continues through menus/);assert.match(h.panel.textContent,/Guest backgrounding does not pause the shared room/);assert.doesNotMatch(h.panel.textContent,/Solo menus and background time pause/);
});
