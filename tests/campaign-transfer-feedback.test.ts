import test from 'node:test';
import assert from 'node:assert/strict';
import {mountTownSupply} from '../src/town-supply-ui.ts';
import {mountRestorationCare} from '../src/restoration-care-ui.ts';
import {atSupply,townSupplyWorld} from './helpers/town-supply.ts';
import {applyAction,worldTownSupplySources} from '../src/world.ts';
import {applyRestorationCare} from '../src/restoration-care.ts';
import {createRestorationCareScenario} from '../src/restoration-care-scenarios.ts';
/** Non-rendering DOM contract only; no layout, touch or browser certification. */
class Element{
 inner='';nodes=new Map<string,Element>();dataNodes:Element[]=[];value='';textContent='';disabled=false;dataset:Record<string,string>={};
 onclick?:()=>void;onchange?:()=>void;oninput?:()=>void;
 get innerHTML(){return this.inner;}
 set innerHTML(value:string){this.inner=value;this.nodes.clear();this.dataNodes=[];for(const match of value.matchAll(/<([a-z]+)\b([^>]*)>/g)){const attrs=match[2]!,id=/id="([^"]+)"/.exec(attrs)?.[1],data=[...attrs.matchAll(/data-([a-z-]+)="([^"]*)"/g)];if(!id&&!data.length&&!/class="close"/.test(attrs))continue;const el=new Element();el.value=/value="([^"]*)"/.exec(attrs)?.[1]??'';el.disabled=/\bdisabled\b/.test(attrs);for(const d of data)el.dataset[d[1]!.replace(/-([a-z])/g,(_,c:string)=>c.toUpperCase())]=d[2]!;if(data.length)this.dataNodes.push(el);if(id)this.nodes.set('#'+id,el);if(/class="close"/.test(attrs))this.nodes.set('.close',el);}}
 querySelector(selector:string):Element|null{return this.nodes.get(selector)??[...this.nodes.values()].map(n=>n.querySelector(selector)).find(Boolean)??null;}
 querySelectorAll(selector:string):Element[]{const key=/\[data-([a-z-]+)\]/.exec(selector)?.[1]?.replace(/-([a-z])/g,(_,c:string)=>c.toUpperCase());return [...this.dataNodes.filter(n=>key&&Object.hasOwn(n.dataset,key)),...[...this.nodes.values()].flatMap(n=>n.querySelectorAll(selector))];}
}


const care=createRestorationCareScenario(73129,'restored');
for(const kind of ['supply','care'] as const){
 const prefix=kind==='supply'?'ts':'rc',action=kind==='supply'?'load':'collect';
 function setup(extra:Record<string,unknown>={}){
  const state=kind==='supply'?atSupply(townSupplyWorld(),'load'):{seed:73129,zone:'valley',player:care.player,restoration:care.restoration,townLife:care.life,restorationCare:care.care};
  const panel=new Element();const options={getState:()=>state,send:()=>{},onClose:()=>{},ready:()=>true,...extra};
  const mount=()=>kind==='supply'?mountTownSupply(panel as any,options as any):mountRestorationCare(panel as any,{getPlan:()=>care.plan,...options} as any);
  return {panel,options,mount};
 }
 test(`${kind} transfer reports synchronous transport rejection without claiming it was sent`,()=>{
  let outcome:false|string|void=false,sends=0;const {panel,mount}=setup({send:()=>{sends++;return outcome;}}),ui=mount(),button=panel.querySelector('#'+prefix+'-'+action)!;
  button.onclick!();assert.equal(sends,1);assert.doesNotMatch(panel.querySelector('#'+prefix+'-status')!.textContent,/request sent/i);assert.match(panel.querySelector('#'+prefix+'-status')!.textContent,/not sent|rejected/i);
  outcome='Room reconnecting; wait for the current host.';button.onclick!();assert.equal(panel.querySelector('#'+prefix+'-status')!.textContent,outcome);
  outcome=undefined;button.onclick!();assert.match(panel.querySelector('#'+prefix+'-status')!.textContent,/request sent/i);assert.equal(sends,3);ui.dispose();
 });
 test(`${kind} transfer rechecks detailed readiness on click and refreshes restored host access`,()=>{
  let blocked:string|null=null,ready=true,sends=0;const {panel,mount}=setup({blockedReason:()=>blocked,ready:()=>ready,send:()=>{sends++;}}),ui=mount(),button=panel.querySelector('#'+prefix+'-'+action)!;
  assert.equal(button.disabled,false);blocked='Only the expedition host can manage this shared cargo.';button.onclick!();assert.equal(sends,0);assert.equal(panel.querySelector('#'+prefix+'-status')!.textContent,blocked);
  ui.refresh();assert.equal(button.disabled,true);assert.equal(panel.querySelector('#'+prefix+'-'+action+'-gate')!.textContent,blocked);
  blocked=null;ready=false;ui.refresh();assert.equal(button.disabled,true,'legacy readiness remains an additional guard');button.onclick!();assert.equal(sends,0);
  ready=true;ui.refresh();assert.equal(button.disabled,false);button.onclick!();assert.equal(sends,1);ui.dispose();
 });
 test(`${kind} transfer retains no reply handler capable of changing a reopened board`,()=>{
  let sends=0;const {panel,mount}=setup({send:()=>{sends++;return 'Rejected by the old room.';}}),old=mount(),oldClick=panel.querySelector('#'+prefix+'-'+action)!.onclick!;
  old.dispose();const fresh=mount(),status=panel.querySelector('#'+prefix+'-status')!;status.textContent='Current room';oldClick();old.refresh();assert.equal(sends,0);assert.equal(status.textContent,'Current room');
  panel.querySelector('#'+prefix+'-'+action)!.onclick!();assert.equal(sends,1);assert.equal(status.textContent,'Rejected by the old room.');fresh.dispose();
 });
}

test('blocked supply click refreshes newly accepted cargo and host gate before returning',()=>{
 let state=atSupply(townSupplyWorld(),'load'),blocked:string|null=null,sends=0;const panel=new Element(),source=worldTownSupplySources(state)[0]!;
 const ui=mountTownSupply(panel as any,{getState:()=>state,send:()=>{sends++;},onClose:()=>{},blockedReason:()=>blocked,ready:()=>true});
 assert.match(panel.querySelector('#ts-cargo')!.textContent,/Shared cargo 0\/4/);
 state=applyAction(state,{type:'town-supply',command:{kind:'load',targetId:source.id,expectedRevision:0}});assert.equal(state.townSupply?.revision,1);
 blocked='The current host changed; inspect only.';panel.querySelector('#ts-load')!.onclick!();
 assert.equal(sends,0);assert.match(panel.querySelector('#ts-cargo')!.textContent,/Shared cargo 1\/4/);assert.equal(panel.querySelector('#ts-load')!.disabled,true);assert.equal(panel.querySelector('#ts-load-gate')!.textContent,blocked);assert.equal(panel.querySelector('#ts-status')!.textContent,blocked);ui.dispose();
});
test('blocked care click refreshes newly accepted biomass and host gate before returning',()=>{
 let state={seed:73129,zone:'valley',player:care.player,restoration:care.restoration,townLife:care.life,restorationCare:care.care},blocked:string|null=null,sends=0;const panel=new Element();
 const ui=mountRestorationCare(panel as any,{getState:()=>state,getPlan:()=>care.plan,send:()=>{sends++;},onClose:()=>{},blockedReason:()=>blocked,ready:()=>true});
 assert.match(panel.querySelector('#rc-stock')!.textContent,/shared satchel 0\/10/);
 const result=applyRestorationCare(state.restorationCare,state.restoration,care.plan,state.townLife,state,{kind:'collect',targetId:care.plan.sites[0]!.id,expectedRevision:0});assert(result);state={...state,restorationCare:result.care,restoration:result.restoration,townLife:result.life};assert.equal(state.restorationCare.revision,1);
 blocked='The current host changed; inspect only.';panel.querySelector('#rc-collect')!.onclick!();
 assert.equal(sends,0);assert.match(panel.querySelector('#rc-stock')!.textContent,/shared satchel 5\/10/);assert.equal(panel.querySelector('#rc-collect')!.disabled,true);assert.equal(panel.querySelector('#rc-collect-gate')!.textContent,blocked);assert.equal(panel.querySelector('#rc-status')!.textContent,blocked);ui.dispose();
});
