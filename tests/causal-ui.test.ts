import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import * as THREE from 'three/webgpu';
import {causalPlan,type CausalCommand} from '../src/causal.ts';
import {createConnectedState,createState,applyAction,type State} from '../src/world.ts';
import {PADS,LINKS,emptyWaterworks,build,supplyWorking} from '../src/waterworks.ts';

/** Minimal DOM contract: text insertion is allowed, HTML insertion fails loudly.
 * These tests complement, rather than claim, browser/screenshot verification. */
class Element {
 tagName:string;children:Element[]=[];attributes:Record<string,string>={};dataset:Record<string,string>={};
 className='';disabled=false;open=false;_text='';onclick?:()=>void;
 constructor(tag:string){this.tagName=tag;}
 set textContent(value:string){this._text=String(value);this.children=[];}
 get textContent():string{return this._text+this.children.map(child=>child.textContent).join('');}
 set innerHTML(_value:string){throw new Error('Dynamic HTML is forbidden in frontier view');}
 append(...children:Element[]){this.children.push(...children);}
 replaceChildren(...children:Element[]){this._text='';this.children=[...children];}
 setAttribute(name:string,value:string){this.attributes[name]=value;}
}
const document={createElement:(tag:string)=>new Element(tag)};
const ui=readFileSync(new URL('../src/causal-ui.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export function mountFrontierBoard','function mountFrontierBoard');
const mount=new Function('causalPlan','supplyWorking','document',stripTypeScriptTypes(ui,{mode:'strip'})+'\nreturn mountFrontierBoard;')(causalPlan,supplyWorking,document);
const flatten=(element:Element):Element[]=>[element,...element.children.flatMap(flatten)];
const find=(panel:Element,text:string)=>flatten(panel).find(element=>element.tagName==='button'&&element.textContent===text)!;
function render(state:State,extra:Record<string,unknown>={}){
 const panel=new Element('aside'),commands:CausalCommand[]=[],before=JSON.stringify(state);
 mount(panel,state,{close(){},journal(){},commissions(){},canRun:(command:CausalCommand)=>applyAction(state,{type:'causal',command})!==state,command:(command:CausalCommand)=>commands.push(command),...extra});
 assert.equal(JSON.stringify(state),before,'view and dry-run checks cannot mutate world');return {panel,commands};
}

test('frontier DOM renders immutable snapshots, literal strings and exact reducer-gated command targets',()=>{
 let state=createConnectedState(73129),view=render(state),panel=view.panel;
 assert.match(panel.textContent,/Living frontier/);assert.equal(flatten(panel).filter(n=>n.dataset.agentId).length,state.causal!.agents.length);assert.equal(flatten(panel).filter(n=>n.dataset.jobId).length,state.causal!.jobs.length);
 assert.ok(flatten(panel).filter(n=>n.className==='frontier-action').every(n=>n.disabled),'remote global inspection cannot issue actions');
 const plan=causalPlan(state.seed),town=plan.settlements[0]!;
 state={...state,player:{...state.player,x:town.position.x,z:town.position.z},inventory:{water:3,scrap:3,core:1}};
 view=render(state,{selectedSettlementId:town.id});panel=view.panel;const delivery=find(panel,'Deliver 1 canister · 4 L');
 assert.equal(delivery.disabled,false);delivery.onclick!();assert.deepEqual(view.commands.pop(),{type:'deliver-water',settlementId:town.id});assert.match(panel.textContent,/ · here/);
 const source=plan.source.position;state={...state,player:{...state.player,x:source.x,z:source.z}};
 view=render(state);const repair=find(view.panel,'Repair source · 3 scrap + 1 core');assert.equal(repair.disabled,false);repair.onclick!();assert.deepEqual(view.commands.pop(),{type:'repair-source'});
 const place=plan.workplaces.find(p=>!state.causal!.workplaces.find(w=>w.id===p.id)!.operational)!;assert.ok(place);
 state={...state,player:{...state.player,x:place.position.x,z:place.position.z}};view=render(state,{selectedWorkplaceId:place.id});
 const detail=flatten(view.panel).find(e=>e.dataset.workplaceId===place.id)!;assert.equal(detail.open,true);
 const action=flatten(detail).find(e=>e.tagName==='button')!;assert.equal(action.disabled,false);action.onclick!();assert.deepEqual(view.commands.pop(),{type:'repair-workplace',workplaceId:place.id});
 const agent=state.causal!.agents[0]!;panel=render(state,{selectedAgentId:agent.id}).panel;assert.equal(flatten(panel).find(e=>e.dataset.agentId===agent.id)!.open,true);
 state={...state,zone:'dungeon'};panel=render(state).panel;assert.ok(flatten(panel).filter(n=>n.className==='frontier-action').every(n=>n.disabled));assert.match(panel.textContent,/Residents keep their routines while you explore the vault/);
 state=structuredClone(state);assert.ok(state.causal!.jobs.length);state.causal!.jobs[0]!.title='<img src=x onerror=alert(1)>';panel=render(state).panel;assert.match(panel.textContent,/<img src=x onerror=alert\(1\)>/);
 panel=render(createState(3)).panel;assert.ok(find(panel,'Mossbank commissions'));assert.equal(flatten(panel).filter(n=>n.dataset.agentId).length,0);
});

test('workplace assignment, supply alternatives, blocked reason and reward accounting are stated accurately',()=>{
 const state=createConnectedState(73129),plan=causalPlan(state.seed);let panel=render(state).panel;
 for(const place of plan.workplaces){const assigned=plan.agents.filter(a=>a.workplaceId===place.id),detail=flatten(panel).find(e=>e.dataset.workplaceId===place.id)!;
  if(assigned.length){for(const agent of assigned)assert.ok(detail.textContent.includes(`${agent.name} · ${agent.role}`));}
  else{assert.match(detail.textContent,/Spare workshop · no caretaker assigned/);assert.doesNotMatch(detail.textContent,/can then work here/);}
 }
 assert.match(panel.textContent,/No active water source · Depot empty/);
 let machine=emptyWaterworks(),inventory={scrap:3,core:1,water:0};const player={x:-10,z:10};
 for(const pad of PADS)({machine,inventory}=build(machine,inventory,{type:'place',pad:pad.id,kind:pad.kind,x:pad.x,z:pad.z},player,'valley'));
 for(const link of LINKS)({machine,inventory}=build(machine,inventory,{type:'connect',link},player,'valley'));
 assert.ok(supplyWorking(machine));const network=structuredClone(state);network.waterworks=machine;panel=render(network).panel;
 assert.match(panel.textContent,/Modular overflow route operating · Depot empty · awaiting Mossbank reserve overflow/);
 network.causal!.depot=2;panel=render(network).panel;assert.match(panel.textContent,/Modular overflow route operating · 2.0 L ready for carriers/);
 network.causal!.sourceRepaired=true;panel=render(network).panel;assert.match(panel.textContent,/Repaired intake \+ modular overflow/);
 const changed=structuredClone(state),job=changed.causal!.jobs[0]!;job.status='blocked';job.failureReason='No feasible supply remains <literal>';panel=render(changed).panel;
 let card=flatten(panel).find(e=>e.dataset.jobId===job.id)!;assert.ok(card.textContent.includes(`Blocked: ${job.failureReason}`));assert.ok(card.textContent.includes(`${job.reservedReward} renown reserved · 0 paid`));assert.match(card.textContent,/no timed expiry/);
 job.status='resolved';job.failureReason=null;job.reservedReward=0;card=flatten(render(changed).panel).find(e=>e.dataset.jobId===job.id)!;assert.match(card.textContent,/Reservation released · no renown paid/);assert.match(card.textContent,/No player reward/);
 job.status='claimed';card=flatten(render(changed).panel).find(e=>e.dataset.jobId===job.id)!;assert.ok(card.textContent.includes(`${job.reward} renown paid · 0 reserved`));assert.match(card.textContent,/Reward received/);
});

test('actual Three frontier adapter preserves valley ownership, restores positions and projects cargo/repair without simulation',()=>{
 const state=createConnectedState(73129),plan=causalPlan(state.seed),main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
 const start=main.indexOf('const frontierRoot='),end=main.indexOf('syncFrontierVisuals(0,true);',start)+'syncFrontierVisuals(0,true);'.length;
 const materials=new Map<string,THREE.MeshStandardMaterial>();const mat=(color:string)=>{if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color}));return materials.get(color)!;};
 const mesh=(geo:THREE.BufferGeometry,color:string,parent:THREE.Object3D,x=0,y=0,z=0)=>{const item=new THREE.Mesh(geo,mat(color));item.position.set(x,y,z);parent.add(item);return item;};
 const box=(parent:THREE.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,color:string)=>mesh(new THREE.BoxGeometry(w,h,d),color,parent,x,y,z),valleyRoot=new THREE.Group();
 const api=new Function('THREE','frontierPlan','state','valleyRoot','box','mesh','mat','const townView=null,townLifeView=null,activeConversation=null;'+stripTypeScriptTypes(main.slice(start,end),{mode:'strip'})+'\nreturn {frontierRoot,residentVisuals,workplaceVisuals,source(){return sourceVisual},sync:syncFrontierVisuals,setState(next){state=next}};')(THREE,plan,state,valleyRoot,box,mesh,mat);
 assert.equal(api.frontierRoot.parent,valleyRoot);assert.equal(api.residentVisuals.size,state.causal!.agents.length);assert.equal(api.workplaceVisuals.size,state.causal!.workplaces.length);
 for(const agent of state.causal!.agents){const root=api.residentVisuals.get(agent.id).root;assert.deepEqual(root.position.toArray(),[agent.position.x,agent.position.y,agent.position.z]);}
 const target=state.causal!.agents[0]!,visual=api.residentVisuals.get(target.id),before=visual.root.position.x,moved=structuredClone(state);
 moved.causal!.agents[0]!.position.x+=1;moved.causal!.agents[0]!.cargo=4;const snapshot=JSON.stringify(moved);api.setState(moved);api.sync(.05);
 assert.ok(visual.root.position.x>before&&visual.root.position.x<moved.causal!.agents[0]!.position.x);assert.equal(visual.cargo.visible,true);assert.equal(JSON.stringify(moved),snapshot,'render must not simulate');
 const paused=visual.root.position.clone();api.sync(0);assert.ok(visual.root.position.equals(paused));api.sync(0,true);assert.equal(visual.root.position.x,moved.causal!.agents[0]!.position.x);
 const fixed=structuredClone(moved);for(const workplace of fixed.causal!.workplaces)workplace.operational=true;fixed.causal!.sourceRepaired=true;fixed.causal!.depot=2;api.setState(fixed);api.sync(0);
 assert.equal(api.source().water.visible,true);for(const workplace of api.workplaceVisuals.values()){assert.equal(workplace.tool.rotation.z,0);assert.equal(workplace.beacon.material.color.getHexString(),'91e3bd');}
});

test('frontier routes to household barter only when its pack exists and describes the online clock honestly',async()=>{
 const {enableCommonsTrade}=await import('../src/world.ts');let opens=0;const plain=render(createConnectedState(1),{barter:()=>opens++,continuesInMenus:true}).panel;assert.equal(find(plain,'Household barter'),undefined);assert.match(plain.textContent,/shared online world keeps moving/);assert.doesNotMatch(plain.textContent,/Time pauses while this board is open/);const withTrade=render(enableCommonsTrade(createConnectedState(1)),{barter:()=>opens++}).panel;find(withTrade,'Household barter').onclick!();assert.equal(opens,1);
});
