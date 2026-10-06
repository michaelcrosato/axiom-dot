import test from 'node:test';
import assert from 'node:assert/strict';
import {mountTownSupply} from '../src/town-supply-ui.ts';
import {mountRestorationCare} from '../src/restoration-care-ui.ts';
import {mountRestorationPanel} from '../src/restoration-ui.ts';
import {createRegionalState,enableStartingTown,enableRestoration,worldTownSupplySources,worldRestorationPlan,applyAction} from '../src/world.ts';
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

function starting(){return enableRestoration(enableStartingTown(createRegionalState(73129)));}

test('supply inspector restores an exact valid source and replaces it only when collected or invalid',()=>{
 let state=starting();const sources=worldTownSupplySources(state),panel=new Element(),changes:string[]=[],sent:unknown[]=[];
 const mounted=mountTownSupply(panel as unknown as HTMLElement,{getState:()=>state,initialSourceId:sources[4]!.id,onSelection:id=>changes.push(id),send:c=>sent.push(c),onClose:()=>{}}),select=panel.querySelector('#ts-source-select')!;
 assert.equal(select.value,sources[4]!.id);assert.deepEqual(changes,[sources[4]!.id]);mounted.refresh();assert.equal(changes.length,1);select.value=sources[2]!.id;select.onchange!();assert.equal(changes.at(-1),sources[2]!.id);
 const taken=sources[2]!;state=applyAction({...state,player:{...state.player,x:taken.x,z:taken.z}},{type:'collect',id:taken.id});mounted.refresh();assert.notEqual(select.value,taken.id);assert(sources.some(s=>s.id===select.value&&!state.collected.includes(s.id)));const count=changes.length,stale=select.onchange!,load=panel.querySelector('#ts-load')!.onclick!;mounted.dispose();select.value=sources[0]!.id;stale();load();assert.equal(changes.length,count);assert.equal(sent.length,0);
});

test('supply inspector validates requested identity and chooses the nearest remaining fallback',()=>{
 const base=starting(),sources=worldTownSupplySources(base),nearest=sources[5]!,state={...base,player:{...base.player,x:nearest.x,z:nearest.z}},panel=new Element(),changes:string[]=[];
 const mounted=mountTownSupply(panel as unknown as HTMLElement,{getState:()=>state,initialSourceId:'missing-source',onSelection:id=>changes.push(id),send:()=>assert.fail('selection is read-only'),onClose:()=>{}});assert.equal(panel.querySelector('#ts-source-select')!.value,nearest.id);assert.deepEqual(changes,[nearest.id]);mounted.dispose();
});

test('care inspector retains a requested habitat across refresh and refuses invalid or disposed selector handlers',()=>{
 const base=starting(),plan=worldRestorationPlan(base.seed),near=plan.sites[1]!,state={...base,player:{...base.player,x:near.x,z:near.z}},panel=new Element(),changes:string[]=[],sent:unknown[]=[];
 const mounted=mountRestorationCare(panel as unknown as HTMLElement,{getState:()=>state,getPlan:()=>plan,initialSiteId:plan.sites[2]!.id,onSelection:id=>changes.push(id),send:c=>sent.push(c),onClose:()=>{}}),select=panel.querySelector('#rc-site')!;
 assert.equal(select.value,plan.sites[2]!.id);mounted.refresh();assert.deepEqual(changes,[plan.sites[2]!.id]);select.value='invalid-site';select.onchange!();assert.equal(select.value,near.id);assert.equal(changes.at(-1),near.id);const count=changes.length,stale=select.onchange!;mounted.dispose();select.value=plan.sites[0]!.id;stale();panel.querySelector('#rc-collect')!.onclick!();assert.equal(changes.length,count);assert.equal(sent.length,0);
});

test('restoration controls open the requested habitat and preserve exact source selectors without issuing work',()=>withTimers(timers=>{
 const state=starting(),plan=worldRestorationPlan(state.seed),panel=new Element(),changes:string[]=[],sent:unknown[]=[],requested=plan.sites[2]!;
 const dispose=mountRestorationPanel(panel as unknown as HTMLElement,{state:()=>state,plan,initialSiteId:requested.id,onSelection:id=>changes.push(id),act:c=>sent.push(c),close:()=>{},ready:()=>true});
 const select=panel.querySelector('#restoration-site')!;assert.equal(select.value,requested.id);assert.equal(panel.querySelector('#restoration-source')!.value,requested.cells[0]!.id);assert.deepEqual(changes,[requested.id]);[...timers.values()][0]!();assert.equal(select.value,requested.id);assert.equal(changes.length,1);
 select.value=plan.sites[1]!.id;select.onchange!();assert.equal(changes.at(-1),plan.sites[1]!.id);assert.equal(panel.querySelector('#restoration-source')!.value,plan.sites[1]!.cells[0]!.id);const count=changes.length,stale=select.onchange!;dispose();select.value=requested.id;stale();assert.equal(changes.length,count);assert.equal(sent.length,0);assert.equal(timers.size,0);
}));
