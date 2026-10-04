import test from 'node:test';
import assert from 'node:assert/strict';
import {mountEconomyPanel,type EconomyPanelSnapshot} from '../src/economy-ui.ts';
import {causalPlan,createCausalState} from '../src/causal.ts';
import {applyEconomyCommand,advanceEconomy,createEconomyState,type EconomyCommand} from '../src/economy.ts';
class Element {
 tagName:string;children:Element[]=[];attributes:Record<string,string>={};dataset:Record<string,string>={};className='';disabled=false;open=false;_text='';onclick?:()=>void;
 constructor(tag:string){this.tagName=tag;}
 set textContent(v:string){this._text=String(v);this.children=[];}
 get textContent():string{return this._text+this.children.map(e=>e.textContent).join('');}
 set innerHTML(_value:string){throw new Error('HTML insertion is forbidden');}
 append(...children:Element[]){this.children.push(...children);}
 replaceChildren(...children:Element[]){this._text='';this.children=[...children];}
 setAttribute(key:string,value:string){this.attributes[key]=value;}
}
const flatten=(e:Element):Element[]=>[e,...e.children.flatMap(flatten)];
function snapshot():EconomyPanelSnapshot {
 const seed=73129,causal=createCausalState(seed),economy=createEconomyState(seed,causal),place=causalPlan(seed).workplaces.find(w=>w.id===economy.workshops[0]!.id)!;
 causal.workplaces.find(w=>w.id===place.id)!.operational=true;
 return {seed,causal,economy,context:{seed,inventory:{scrap:8,core:0,water:0},player:{x:place.position.x,z:place.position.z,hp:100},zone:'valley',defeated:[],networkOverflow:0,networkWorking:false,recoverableScrap:8,recoverableCore:0,recoverableWater:0,historicalPumpRepaired:false}};
}
test('workshop panel is snapshot-only, reducer-gated and rerenders authoritative results through exact command callbacks',()=>{
 const previous=globalThis.document;globalThis.document={createElement:(tag:string)=>new Element(tag)} as unknown as Document;
 try {
  let state=snapshot();const initial=JSON.stringify(state),commands:EconomyCommand[]=[],panel=new Element('aside');let closed=0;
  const options={state:()=>state,selectedWorkplaceId:state.economy.workshops[0]!.id,act:(command:EconomyCommand)=>{commands.push(command);const result=applyEconomyCommand(state.economy,state.causal,state.context,command);state={...state,economy:result.state,context:{...state.context,inventory:result.inventory}};},close:()=>closed++};
  mountEconomyPanel(panel as unknown as HTMLElement,options);assert.equal(JSON.stringify(state),initial);assert.match(panel.textContent,/No workshop transactions yet/);assert.match(panel.textContent,/No recorded craft tradition/);
  let commission=flatten(panel).find(e=>e.tagName==='button'&&e.textContent==='Commission kit · 2 scrap')!;assert.equal(commission.disabled,false);commission.onclick!();assert.deepEqual(commands[0],{type:'commission-kit',workplaceId:state.economy.workshops[0]!.id});assert.equal(state.context.inventory.scrap,6);assert.match(panel.textContent,/1 \/ 4 queued/);
  assert.equal(flatten(panel).find(e=>e.dataset.workplaceId===state.economy.workshops[0]!.id)!.open,true);
  const c=structuredClone(state.causal);c.elapsed+=12;c.workplaces.find(w=>w.id===state.economy.workshops[0]!.id)!.service+=12;state={...state,causal:c,economy:advanceEconomy(state.economy,c)};mountEconomyPanel(panel as unknown as HTMLElement,options);
  const collect=flatten(panel).find(e=>e.tagName==='button'&&e.textContent==='Collect finished kit')!;assert.equal(collect.disabled,false);collect.onclick!();assert.equal(state.economy.kits,1);assert.match(panel.textContent,/1 \/ 6 repair kits/);assert.match(panel.textContent,/caretaker manufactured one repair kit/);
  assert.equal(flatten(panel).find(e=>e.tagName==='button'&&e.textContent==='Collect finished kit')!.disabled,true);
  const beforeClose=JSON.stringify(state);flatten(panel).find(e=>e.attributes['aria-label']==='Close workshop exchange')!.onclick!();assert.equal(closed,1);assert.equal(JSON.stringify(state),beforeClose);
  state={...state,context:{...state.context,zone:'dungeon'}};mountEconomyPanel(panel as unknown as HTMLElement,options);assert.ok(flatten(panel).filter(e=>e.className==='frontier-action').every(e=>e.disabled));
 } finally {globalThis.document=previous;}
});
test('active wear panel exposes the committed incident and reserves the last available kit',()=>{
 const previous=globalThis.document;globalThis.document={createElement:(tag:string)=>new Element(tag)} as unknown as Document;
 try {
  let state=snapshot();const id=state.economy.workshops[0]!.id;
  const act=(command:EconomyCommand)=>{const result=applyEconomyCommand(state.economy,state.causal,state.context,command);state={...state,economy:result.state,context:{...state.context,inventory:result.inventory}};};
  act({type:'commission-kit',workplaceId:id});state.causal=structuredClone(state.causal);state.causal.elapsed=12;state.causal.workplaces.find(w=>w.id===id)!.service=12;state.economy=advanceEconomy(state.economy,state.causal);act({type:'collect-kit',workplaceId:id});
  state.causal=structuredClone(state.causal);state.causal.elapsed=120;state.causal.workplaces.find(w=>w.id===id)!.service=24;state.economy=advanceEconomy(state.economy,state.causal);
  const panel=new Element('aside'),options={state:()=>state,act,close(){}};mountEconomyPanel(panel as unknown as HTMLElement,options);assert.match(panel.textContent,/One carried kit is reserved/);
  const repair=flatten(panel).find(e=>e.tagName==='button'&&e.textContent==='Restore press · 1 kit · earn 2 renown')!;assert.equal(repair.disabled,false);assert.ok(flatten(panel).filter(e=>e.tagName==='button'&&e.textContent==='Recycle kit · recover 1 scrap').every(e=>e.disabled));
  repair.onclick!();assert.equal(state.economy.renown,2);assert.equal(state.economy.kits,0);assert.doesNotMatch(panel.textContent,/PRODUCTION PRESS NEEDS CARE/);assert.match(panel.textContent,/Care and repair/);
 } finally {globalThis.document=previous;}
});
