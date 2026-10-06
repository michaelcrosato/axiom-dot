import test from 'node:test';
import assert from 'node:assert/strict';
import {mountTownSupply} from '../src/town-supply-ui.ts';
import {mountRestorationCare} from '../src/restoration-care-ui.ts';
import {createRegionalState,enableStartingTown,enableRestoration,worldTownSupplySources,worldRestorationPlan} from '../src/world.ts';
/** Non-rendering DOM contract only; no layout, touch or browser certification. */
class Element{
 inner='';nodes=new Map<string,Element>();dataNodes:Element[]=[];value='';textContent='';disabled=false;dataset:Record<string,string>={};
 onclick?:()=>void;onchange?:()=>void;oninput?:()=>void;
 get innerHTML(){return this.inner;}
 set innerHTML(value:string){this.inner=value;this.nodes.clear();this.dataNodes=[];for(const match of value.matchAll(/<([a-z]+)\b([^>]*)>/g)){const attrs=match[2]!,id=/id="([^"]+)"/.exec(attrs)?.[1],data=[...attrs.matchAll(/data-([a-z-]+)="([^"]*)"/g)];if(!id&&!data.length&&!/class="close"/.test(attrs))continue;const el=new Element();el.value=/value="([^"]*)"/.exec(attrs)?.[1]??'';el.disabled=/\bdisabled\b/.test(attrs);for(const d of data)el.dataset[d[1]!.replace(/-([a-z])/g,(_,c:string)=>c.toUpperCase())]=d[2]!;if(data.length)this.dataNodes.push(el);if(id)this.nodes.set('#'+id,el);if(/class="close"/.test(attrs))this.nodes.set('.close',el);}}
 querySelector(selector:string):Element|null{return this.nodes.get(selector)??[...this.nodes.values()].map(n=>n.querySelector(selector)).find(Boolean)??null;}
 querySelectorAll(selector:string):Element[]{const key=/\[data-([a-z-]+)\]/.exec(selector)?.[1]?.replace(/-([a-z])/g,(_,c:string)=>c.toUpperCase());return [...this.dataNodes.filter(n=>key&&Object.hasOwn(n.dataset,key)),...[...this.nodes.values()].flatMap(n=>n.querySelectorAll(selector))];}
}

for(const kind of ['supply','care'] as const){
 test(`${kind} board remains interactive after rejected Visit and closes normally`,()=>{
  const state=enableRestoration(enableStartingTown(createRegionalState(73129))),panel=new Element();let visits=0,closed=0;const selections:string[]=[];
  const common={getState:()=>state,send:()=>assert.fail('navigation must not transfer resources'),onClose:()=>{closed++;},visit:()=>{visits++;},onSelection:(id:string)=>selections.push(id)};
  const mounted=kind==='supply'?mountTownSupply(panel as unknown as HTMLElement,common):mountRestorationCare(panel as unknown as HTMLElement,common);
  const prefix=kind==='supply'?'ts':'rc',select=panel.querySelector(kind==='supply'?'#ts-source-select':'#rc-site')!;
  const requested=kind==='supply'?worldTownSupplySources(state)[1]!.id:worldRestorationPlan(state.seed).sites[1]!.id;
  panel.querySelector('#'+prefix+'-town')!.onclick!();assert.equal(visits,1);
  select.value=requested;select.onchange!();assert.equal(selections.at(-1),requested,'rejected travel must keep selection handlers live');
  panel.querySelector('#'+prefix+'-town')!.onclick!();assert.equal(visits,2,'travel can be retried');
  mounted.refresh();panel.querySelector('#'+prefix+'-close')!.onclick!();assert.equal(closed,1);mounted.dispose();
 });
 test(`${kind} board ignores retained controls after navigation owner disposes it`,()=>{
  const state=enableRestoration(enableStartingTown(createRegionalState(73129))),panel=new Element();let visits=0,closed=0;const selections:string[]=[];let dispose=()=>{};
  const common={getState:()=>state,send:()=>assert.fail('stale navigation must not transfer resources'),onClose:()=>{closed++;},visit:()=>{visits++;dispose();},onSelection:(id:string)=>selections.push(id)};
  const mounted=kind==='supply'?mountTownSupply(panel as unknown as HTMLElement,common):mountRestorationCare(panel as unknown as HTMLElement,common);dispose=mounted.dispose;
  const prefix=kind==='supply'?'ts':'rc',visit=panel.querySelector('#'+prefix+'-town')!.onclick!,select=panel.querySelector(kind==='supply'?'#ts-source-select':'#rc-site')!,count=selections.length;
  visit();visit();select.value='stale';select.onchange!();mounted.refresh();panel.querySelector('#'+prefix+'-close')!.onclick!();assert.equal(visits,1);assert.equal(closed,0);assert.equal(selections.length,count);
 });
}

for(const kind of ['supply','care'] as const)test(`${kind} maps the selected source and delivery station without disabling rejected navigation`,()=>{
 const state=enableRestoration(enableStartingTown(createRegionalState(73129))),panel=new Element(),targets:string[]=[];let visits=0,closed=0;
 const common={getState:()=>state,send:()=>assert.fail('map cannot transfer'),onClose:()=>{closed++;},map:(id:string)=>{targets.push(id);},visit:()=>{visits++;}};
 const mounted=kind==='supply'?mountTownSupply(panel as unknown as HTMLElement,common):mountRestorationCare(panel as unknown as HTMLElement,common);
 const prefix=kind==='supply'?'ts':'rc',select=panel.querySelector(kind==='supply'?'#ts-source-select':'#rc-site')!,id=kind==='supply'?worldTownSupplySources(state)[2]!.id:worldRestorationPlan(state.seed).sites[2]!.id;
 select.value=id;select.onchange!();panel.querySelector('#'+prefix+'-map')!.onclick!();assert.deepEqual(targets,[id]);
 panel.querySelector('#'+prefix+'-destination-map')!.onclick!();assert.deepEqual(targets,[id,kind==='supply'?'workshop':'apothecary']);
 panel.querySelector('#'+prefix+'-town')!.onclick!();assert.equal(visits,1);panel.querySelector('#'+prefix+'-close')!.onclick!();assert.equal(closed,1);mounted.dispose();
});
