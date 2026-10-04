import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountRestorationPanel,restorationActionOptions,restorationSitesHTML,type RestorationPanelContext} from '../src/restoration-ui.ts';
import {applyRestorationCommand,advanceRestoration,createRestoration,restorationPlan,type HabitatSiteDescriptor} from '../src/restoration.ts';
import {DEFAULT_RESTORATION_RECIPE,compileRestorationBody} from '../src/restoration-body.ts';
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

test('panel displays all field cells and exact compiled costs with pure kernel eligibility',()=>withTimers(()=>{
 const {plan,context,draft}=setup(),panel=new Element(),before=JSON.stringify(context);const dispose=mountRestorationPanel(panel as unknown as HTMLElement,{state:()=>context,plan,act(){},close(){},ready:()=>true});
 const fields=panel.querySelector('#restoration-sites')!.innerHTML;for(const word of ['Water','contaminant','Heat','smoke','scent','Nutrients','biomass','health'])assert.match(fields,new RegExp(word));assert.equal((fields.match(/<h4>/g)??[]).length,9);assert.match(fields,/Dormant/);assert.match(panel.innerHTML,/Stand beside, not on, dock to deploy/);
 const body=compileRestorationBody(draft.recipe);assert.match(panel.querySelector('#restoration-recipe-summary')!.innerHTML,new RegExp(`${body.cost.scrap} scrap`));
 const actions=restorationActionOptions(context,plan,plan.sites[0]!.id,draft,plan.sites[0]!.cells[0]!.id,plan.sites[0]!.cells[1]!.id);assert.equal(actions[0]!.available,true);assert.equal(actions[1]!.available,false);assert.match(actions[0]!.gate,/preview/);assert.equal(JSON.stringify(context),before,'render and all dry runs leave input unchanged');dispose();
}));
test('pending authority locks repeat clicks and stale handlers; revision changes unlock on live polling',()=>withTimers(timers=>{
 const {plan,context}=setup(),panel=new Element(),sent:unknown[]=[];const dispose=mountRestorationPanel(panel as unknown as HTMLElement,{state:()=>context,plan,act(c){sent.push(c);},close(){},ready:()=>true});
 const initial=buttons(panel)[0]!;initial.onclick!();initial.onclick!();assert.equal(sent.length,1);assert(buttons(panel).every(b=>b.disabled));[...timers.values()][0]!();assert(buttons(panel).every(b=>b.disabled),'elapsed time cannot pretend server receipt');
 const c=sent[0] as Parameters<typeof applyRestorationCommand>[3],result=applyRestorationCommand(context.restoration!,plan,context,c);context.restoration=result.state;context.inventory=result.inventory;context.player.hp=result.hp;[...timers.values()][0]!();assert.equal(buttons(panel)[1]!.disabled,false);initial.onclick!();assert.equal(sent.length,1,'retained older generation does not send again');
 const old=buttons(panel)[1]!;dispose();assert.equal(timers.size,0);old.onclick!();assert.equal(sent.length,1);
}));
test('source and target selection node identities and drafts survive live polling and simulation updates',()=>withTimers(timers=>{
 const {plan,context}=setup(),panel=new Element();const dispose=mountRestorationPanel(panel as unknown as HTMLElement,{state:()=>context,plan,act(){},close(){},ready:()=>true});
 const source=panel.querySelector('#restoration-source')!,target=panel.querySelector('#restoration-target')!,organ=panel.querySelector('#restoration-recipe-organ')!;
 source.value=plan.sites[0]!.cells[1]!.id;source.onchange!();target.value='tank';target.onchange!();organ.value='filter';organ.onchange!();
 context.restoration=advanceRestoration(context.restoration!,plan,1);[...timers.values()][0]!();assert.equal(panel.querySelector('#restoration-source'),source);assert.equal(panel.querySelector('#restoration-target'),target);assert.equal(target.value,'tank');assert.equal(organ.value,'filter');
 panel.querySelector('#restoration-cancel')!.onclick!();assert.equal(organ.value,'pump');dispose();
}));
test('actual range, incapacity, readiness and changed-world gates block intents',()=>withTimers(()=>{
 const {plan,context,draft}=setup(),panel=new Element();let sent=0,ready=false;const dispose=mountRestorationPanel(panel as unknown as HTMLElement,{state:()=>context,plan,act(){sent++;},close(){},ready:()=>ready});
 buttons(panel)[0]!.onclick!();assert.equal(sent,0);ready=true;context.player.x=20;panel.querySelector('#restoration-refresh')!.onclick!();assert.equal(buttons(panel)[0]!.disabled,true);assert.match(panel.querySelector('#restoration-actions')!.innerHTML,/20.0 m away/);
 context.player.x=0;context.player.hp=0;assert.equal(restorationActionOptions(context,plan,plan.sites[0]!.id,draft,plan.sites[0]!.cells[0]!.id,plan.sites[0]!.cells[1]!.id)[0]!.available,false);
 context.seed=42;panel.querySelector('#restoration-refresh')!.onclick!();assert.equal(buttons(panel).length,0);dispose();
}));
test('defaults and cancel only stage, refit exchanges real stock and finite service is truthful',()=>withTimers(timers=>{
 const {plan,context}=setup(),panel=new Element();const dispose=mountRestorationPanel(panel as unknown as HTMLElement,{state:()=>context,plan,act(c){const r=applyRestorationCommand(context.restoration!,plan,context,c);context.restoration=r.state;context.inventory=r.inventory;context.player.hp=r.hp;},close(){},ready:()=>true});
 const original=JSON.stringify(context);panel.querySelector('#restoration-recipe-shell')!.value='alloy';panel.querySelector('#restoration-recipe-shell')!.onchange!();assert.equal(JSON.stringify(context),original);panel.querySelector('#restoration-defaults')!.onclick!();assert.equal(JSON.stringify(context),original);
 buttons(panel)[0]!.onclick!();assert(context.restoration!.machine);assert.equal(context.restoration!.machine!.charge,0);[...timers.values()][0]!();const reserve=context.restoration!.sites[0]!.chargeReserve;buttons(panel)[1]!.onclick!();assert.equal(context.restoration!.machine!.charge,100);assert.equal(context.restoration!.sites[0]!.chargeReserve,reserve-100);dispose();
}));
test('close and old timer callbacks cannot mutate or invoke later navigation; text is escaped',()=>withTimers(timers=>{
 const {plan,context}=setup(),panel=new Element();let closed=0;const dispose=mountRestorationPanel(panel as unknown as HTMLElement,{state:()=>context,plan,act(){},close(){closed++;},ready:()=>true});const timer=[...timers.values()][0]!,close=panel.querySelector('.close')!;close.onclick!();close.onclick!();assert.equal(closed,1);assert.equal(timers.size,0);const html=panel.querySelector('#restoration-sites')!.innerHTML;timer();assert.equal(panel.querySelector('#restoration-sites')!.innerHTML,html);dispose();
 const hostile={...plan,sites:plan.sites.map((s,i)=>i===0?{...s,label:'<script>evil</script>'}:s)};assert.match(restorationSitesHTML(context.restoration!,hostile),/&lt;script&gt;/);
}));
test('sources contain only explicit buttons and no persistence or campaign mutation dependencies',()=>{
 const source=readFileSync(new URL('../src/restoration-ui.ts',import.meta.url),'utf8');assert.equal((source.match(/<button(?! type="button")/g)??[]).length,0);assert.doesNotMatch(source,/localStorage|sessionStorage|from ['"].*(?:world|save|coop)\.ts/);
});
