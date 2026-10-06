import test from 'node:test';
import assert from 'node:assert/strict';
import {mountRestorationPanel,type RestorationPanelContext} from '../src/restoration-ui.ts';
import {createRestoration,restorationPlan,type HabitatSiteDescriptor} from '../src/restoration.ts';
import {DEFAULT_RESTORATION_RECIPE} from '../src/restoration-body.ts';
import {DEFAULT_UTILITY_RECIPE} from '../src/utility-ability.ts';

/** Non-rendering DOM contract only; no layout, touch or browser certification. */
class Element{
 inner='';nodes=new Map<string,Element>();dataNodes:Element[]=[];value='';textContent='';disabled=false;dataset:Record<string,string>={};
 onclick?:()=>void;onchange?:()=>void;oninput?:()=>void;
 get innerHTML(){return this.inner;}
 set innerHTML(value:string){this.inner=value;this.nodes.clear();this.dataNodes=[];for(const match of value.matchAll(/<([a-z]+)\b([^>]*)>/g)){const attrs=match[2]!,id=/id="([^"]+)"/.exec(attrs)?.[1],data=[...attrs.matchAll(/data-([a-z-]+)="([^"]*)"/g)];if(!id&&!data.length&&!/class="close"/.test(attrs))continue;const el=new Element();el.value=/value="([^"]*)"/.exec(attrs)?.[1]??'';el.disabled=/\bdisabled\b/.test(attrs);for(const d of data)el.dataset[d[1]!.replace(/-([a-z])/g,(_,c:string)=>c.toUpperCase())]=d[2]!;if(data.length)this.dataNodes.push(el);if(id)this.nodes.set('#'+id,el);if(/class="close"/.test(attrs))this.nodes.set('.close',el);}}
 querySelector(selector:string):Element|null{return this.nodes.get(selector)??[...this.nodes.values()].map(n=>n.querySelector(selector)).find(Boolean)??null;}
 querySelectorAll(selector:string):Element[]{const key=/\[data-([a-z-]+)\]/.exec(selector)?.[1]?.replace(/-([a-z])/g,(_,c:string)=>c.toUpperCase());return [...this.dataNodes.filter(n=>key&&Object.hasOwn(n.dataset,key)),...[...this.nodes.values()].flatMap(n=>n.querySelectorAll(selector))];}
}
function withTimers(fn:(timers:Map<number,()=>void>)=>void){const oldSet=globalThis.setInterval,oldClear=globalThis.clearInterval;let id=0;const timers=new Map<number,()=>void>();globalThis.setInterval=((f:()=>void)=>{timers.set(++id,f);return id;}) as unknown as typeof setInterval;globalThis.clearInterval=((n:number)=>timers.delete(n)) as unknown as typeof clearInterval;try{fn(timers);}finally{globalThis.setInterval=oldSet;globalThis.clearInterval=oldClear;}}
function setup(){const sites:HabitatSiteDescriptor[]=[0,1,2].map(i=>{const id=`site-${i}`,cells=[0,1,2].map(j=>({id:`site-${i}-cell-${j}`,x:i*20+j*3,y:0,z:0}));return{id,label:`Habitat ${i}`,x:i*20,y:0,z:0,dockCellId:cells[0]!.id,cells,edges:[0,1].map(j=>({id:`site-${i}-edge-${j}`,a:cells[j]!.id,b:cells[j+1]!.id,path:[{x:cells[j]!.x,y:0,z:0},{x:cells[j+1]!.x,y:0,z:0}]}))};});const plan=restorationPlan(73129,sites);const context:RestorationPanelContext={seed:73129,zone:'valley',player:{x:0,z:0,hp:80},inventory:{scrap:24,core:4,water:2},restoration:createRestoration(plan)};return {plan,context,draft:{recipe:{...DEFAULT_RESTORATION_RECIPE},ability:{...DEFAULT_UTILITY_RECIPE}}};}
const buttons=(panel:Element)=>panel.querySelector('#restoration-actions')!.querySelectorAll('[data-restoration-action]');

test('blocked restoration navigation preserves polling and usable controls',()=>withTimers(timers=>{
 const {plan,context}=setup(),panel=new Element();let maps=0,care=0,sent=0;
 const dispose=mountRestorationPanel(panel as unknown as HTMLElement,{state:()=>context,plan,act(){sent++;},close(){},ready:()=>true,map(){maps++;},care(){care++;}});
 panel.querySelector('#restoration-map')!.onclick!();panel.querySelector('#restoration-care')!.onclick!();
 assert.equal(maps,1);assert.equal(care,1);assert.equal(timers.size,1);buttons(panel)[0]!.onclick!();assert.equal(sent,1);dispose();
}));
test('restoration synchronous rejection and send exception immediately release request lock',()=>withTimers(()=>{
 for(const result of [false,'The dock path is obstructed.','throw'] as const){
  const {plan,context}=setup(),panel=new Element();let sent=0;
  const dispose=mountRestorationPanel(panel as unknown as HTMLElement,{state:()=>context,plan,act(){sent++;if(result==='throw')throw Error('offline');return result;},close(){},ready:()=>true});
  buttons(panel)[0]!.onclick!();assert.equal(buttons(panel)[0]!.disabled,false);assert.match(panel.querySelector('#restoration-status')!.textContent,result===false?/not sent/:result==='throw'?/could not be sent/:/dock path/);
  buttons(panel)[0]!.onclick!();assert.equal(sent,2);dispose();
 }
}));
test('restoration per-command path gate is displayed and rechecked before sending',()=>withTimers(()=>{
 const {plan,context}=setup(),panel=new Element();let reason:string|null='Dock path blocked.',sent=0;
 const dispose=mountRestorationPanel(panel as unknown as HTMLElement,{state:()=>context,plan,act(){sent++;},close(){},ready:()=>true,blockedReason:()=>reason});
 assert.equal(buttons(panel)[0]!.disabled,true);assert.match(panel.querySelector('#restoration-actions')!.innerHTML,/Dock path blocked/);buttons(panel)[0]!.onclick!();assert.equal(sent,0);
 reason=null;panel.querySelector('#restoration-refresh')!.onclick!();assert.equal(buttons(panel)[0]!.disabled,false);reason='Ground is no longer reachable.';buttons(panel)[0]!.onclick!();assert.equal(sent,0);assert.match(panel.querySelector('#restoration-status')!.textContent,/Ground is no longer reachable/);dispose();
}));
test('restoration authority request settlement without revision change permits honest retry',()=>withTimers(timers=>{
 const {plan,context}=setup(),panel=new Element();let pending=false,sent=0;
 const dispose=mountRestorationPanel(panel as unknown as HTMLElement,{state:()=>context,plan,act(){sent++;pending=true;},close(){},ready:()=>true,requestPending:()=>pending});
 buttons(panel)[0]!.onclick!();const tick=[...timers.values()][0]!;tick();assert.equal(buttons(panel)[0]!.disabled,true);
 pending=false;tick();assert.equal(buttons(panel)[0]!.disabled,false);assert.match(panel.querySelector('#restoration-status')!.textContent,/no longer pending/);assert.doesNotMatch(panel.querySelector('#restoration-status')!.textContent,/succeeded|committed successfully/);assert.equal(context.restoration!.revision,0);
 buttons(panel)[0]!.onclick!();assert.equal(sent,2);dispose();
}));
test('same-panel replacement invalidates restoration callbacks and late polls',()=>withTimers(timers=>{
 const {plan,context}=setup(),panel=new Element();let sent=0,maps=0;
 const options={state:()=>context,plan,act(){sent++;},close(){},ready:()=>true,map(){maps++;}};
 const first=mountRestorationPanel(panel as unknown as HTMLElement,options),tick=[...timers.values()][0]!,oldAction=buttons(panel)[0]!,oldMap=panel.querySelector('#restoration-map')!,oldSite=panel.querySelector('#restoration-site')!,oldRefresh=panel.querySelector('#restoration-refresh')!;
 const second=mountRestorationPanel(panel as unknown as HTMLElement,options),status=panel.querySelector('#restoration-status')!,actions=panel.querySelector('#restoration-actions')!.innerHTML;
 oldMap.onclick!();oldSite.onchange!();oldRefresh.onclick!();oldAction.onclick!();tick();assert.equal(sent,0);assert.equal(maps,0);assert.equal(panel.querySelector('#restoration-status'),status);assert.equal(status.textContent,'');assert.equal(panel.querySelector('#restoration-actions')!.innerHTML,actions);assert.equal(timers.size,1);
 first();second();tick();assert.equal(timers.size,0);
}));
test('synchronous restoration navigation during dispatch cannot paint the replacement panel',()=>withTimers(timers=>{
 const {plan,context}=setup(),panel=new Element();let second:(()=>void)|undefined;
 const first=mountRestorationPanel(panel as unknown as HTMLElement,{state:()=>context,plan,act(){second=mountRestorationPanel(panel as unknown as HTMLElement,{state:()=>context,plan,act(){},close(){},ready:()=>true});return 'Old request rejected.';},close(){},ready:()=>true});
 buttons(panel)[0]!.onclick!();assert.equal(panel.querySelector('#restoration-status')!.textContent,'');assert.equal(buttons(panel)[0]!.disabled,false);assert.equal(timers.size,1);first();second!();
}));
test('restoration recheck, unrelated revision and reopen retain the active transport gate',()=>withTimers(timers=>{
 const {plan,context}=setup(),panel=new Element();let pending=false,sent=0;
 const options={state:()=>context,plan,act(){sent++;pending=true;},close(){},ready:()=>true,requestPending:()=>pending};
 const first=mountRestorationPanel(panel as unknown as HTMLElement,options);buttons(panel)[0]!.onclick!();
 panel.querySelector('#restoration-refresh')!.onclick!();assert.equal(buttons(panel)[0]!.disabled,true);buttons(panel)[0]!.onclick!();assert.equal(sent,1);
 context.restoration={...context.restoration!,revision:context.restoration!.revision+1};[...timers.values()][0]!();assert.equal(buttons(panel)[0]!.disabled,true);
 first();const second=mountRestorationPanel(panel as unknown as HTMLElement,options);assert.equal(buttons(panel)[0]!.disabled,true);buttons(panel)[0]!.onclick!();assert.equal(sent,1);
 pending=false;[...timers.values()][0]!();assert.equal(buttons(panel)[0]!.disabled,false);second();
}));
test('restoration detailed ground and reconnect gates survive false readiness and stale clicks',()=>withTimers(()=>{
 const {plan,context}=setup(),panel=new Element();let ready=false,reason:string|null='Stand on reachable ground beside this dock.',sent=0;
 const dispose=mountRestorationPanel(panel as unknown as HTMLElement,{state:()=>context,plan,act(){sent++;},close(){},ready:()=>ready,blockedReason:()=>reason});
 assert.match(panel.querySelector('#restoration-actions')!.innerHTML,/Stand on reachable ground/);assert.doesNotMatch(panel.querySelector('#restoration-actions')!.innerHTML,/World controls are not ready/);assert.equal(buttons(panel)[0]!.disabled,true);
 ready=true;reason=null;panel.querySelector('#restoration-refresh')!.onclick!();const stale=buttons(panel)[0]!;assert.equal(stale.disabled,false);
 ready=false;reason='Reconnect to the host before using restoration.';stale.onclick!();assert.equal(sent,0);assert.equal(buttons(panel)[0]!.disabled,true);assert.match(panel.querySelector('#restoration-status')!.textContent,/Reconnect to the host/);assert.match(panel.querySelector('#restoration-actions')!.innerHTML,/Reconnect to the host/);
 reason=null;buttons(panel)[0]!.onclick!();assert.match(panel.querySelector('#restoration-status')!.textContent,/World controls are not ready/);assert.equal(sent,0);dispose();
}));
