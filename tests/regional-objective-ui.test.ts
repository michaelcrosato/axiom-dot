import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {selectRegionalObjective,type RegionalObjective} from '../src/regional-objective.ts';
import {renderRegionalObjective} from '../src/regional-objective-ui.ts';
import {createSettlementWorkbench,settlementPlan,settlementInteractions,applySettlementAction} from '../src/regional-settlement-workbench.ts';
import {applyAction,createConnectedState,type State} from '../src/world.ts';
import {regionalSupplyWeather} from '../src/regional-supply.ts';

/** Literal DOM contracts execute the actual HUD adapter and extracted main glue.
 * These are not browser pixels, device layout or physical-controller approval. */
class Element {
 textContent='';hidden=false;disabled=false;attributes=new Map<string,string>();onclick:(()=>void)|null=null;
 set innerHTML(_v:string){throw Error('HUD must use textContent');}
 setAttribute(key:string,value:string){this.attributes.set(key,value);}
}
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
function harness(initial:State){
 const nodes=Object.fromEntries(['title','copy','progress','actions','inspect','map'].map(id=>['quest-'+id,new Element()]));
 const at=main.indexOf('let regionalObjectiveSite:'),end=main.indexOf('\nfunction mountRegionalAtlas()',at);assert(at>=0&&end>at);
 const source=`let state=initial,labActive=false,transitioning=false,sessionReloading=false,coopPending=false;const coop={active:false},$=id=>nodes[id],opened=[];const showRegionalFood=id=>opened.push(['food',id]),showRegionalSupply=id=>opened.push(['supply',id]),showRegionalTrade=id=>opened.push(['trade',id]),openPanel=id=>opened.push([id]);${main.slice(at,end)}
 return {nodes,opened,coop,sync:syncRegionalObjective,change(s){state=s},flags(p){if('labActive'in p)labActive=p.labActive;if('transitioning'in p)transitioning=p.transitioning;if('sessionReloading'in p)sessionReloading=p.sessionReloading;if('coopPending'in p)coopPending=p.coopPending;}};`;
 return new Function('initial','nodes','selectRegionalObjective','renderRegionalObjective',stripTypeScriptTypes('function createHarness(){'+source+'}',{mode:'transform'})+';return createHarness();')(initial,nodes,selectRegionalObjective,renderRegionalObjective);
}
const near=(s:State)=>{const point=settlementPlan(s.seed).collector.deliveryPosition;return {...s,player:{...s.player,x:point.x,z:point.z}};};

test('literal HUD uses current summaries, keeps inspection read-only, and disables irrelevant controls',()=>{
 const state=near(createSettlementWorkbench(73129,'regional','regional')),before=JSON.stringify(state),h=harness(state),objective=selectRegionalObjective(state)!;
 h.sync();assert.equal(h.nodes['quest-title'].textContent,objective.title);assert.equal(h.nodes['quest-actions'].hidden,false);assert.match(h.nodes['quest-progress'].textContent,/ACTIONABLE/);
 h.nodes['quest-inspect'].onclick();h.nodes['quest-map'].onclick();assert.deepEqual(h.opened,[[objective.inspect.kind,objective.inspect.targetId],['map']]);assert.equal(JSON.stringify(state),before);
 assert.match(h.nodes['quest-inspect'].attributes.get('aria-label'),/Inspect freight/);assert.equal(h.nodes['quest-map'].attributes.get('aria-label'),'Show regional work points on map');
 for(const key of ['transitioning','sessionReloading','coopPending']){h.flags({[key]:true});h.sync();assert(h.nodes['quest-inspect'].disabled);assert(h.nodes['quest-map'].disabled);h.nodes['quest-inspect'].onclick();h.nodes['quest-map'].onclick();assert.equal(h.opened.length,2);h.flags({[key]:false});}
 const superseded=h.nodes['quest-inspect'].onclick;h.sync();superseded();assert.equal(h.opened.length,2,'superseded callbacks cannot inspect an old target');
 const stale=h.nodes['quest-inspect'].onclick;h.flags({transitioning:true});stale();assert.equal(h.opened.length,2,'a callback cannot inspect during a later transition');h.flags({transitioning:false});
 h.change(createConnectedState(73129));h.nodes['quest-title'].textContent='Original valley objective';h.sync();assert.equal(h.nodes['quest-title'].textContent,'Original valley objective');assert(h.nodes['quest-actions'].hidden);assert(h.nodes['quest-inspect'].disabled);assert.equal(h.nodes['quest-inspect'].onclick,null);assert.equal(h.nodes['quest-map'].onclick,null);
 h.change(state);h.sync();h.flags({labActive:true});h.nodes['quest-title'].textContent='Lab objective';h.sync();assert.equal(h.nodes['quest-title'].textContent,'Lab objective');assert(h.nodes['quest-actions'].hidden);
});

test('literal HUD reports solo and online waiting honestly without touching existing local action gates',()=>{
 const state=structuredClone(near(createSettlementWorkbench(73129,'regional','regional'))),plan=settlementPlan(state.seed),route=state.frontierTrade!.routes.find(r=>r.id===plan.routes[1]!.id)!;
 route.sourceStartedAt=0;route.repairStartedAt=1;const h=harness(state);h.sync();assert.match(h.nodes['quest-progress'].textContent,/WAITING/);assert.match(h.nodes['quest-copy'].textContent,/Close solo menus/);
 h.coop.active=true;h.sync();assert.match(h.nodes['quest-copy'].textContent,/online world/);assert.doesNotMatch(h.nodes['quest-copy'].textContent,/Close solo menus/);
 for(const marker of ['if(!state.frontierFood||!physicsReady','regionalFoodTerrainConfirmed(point)','applyAction(state,{type:\'regional-food\',command})!==state','regionalConfirmedTrade.get(command.targetId)','regionalConfirmedProjects.has(outpost.id)'])assert(main.includes(marker),marker);
 assert(!main.includes('function syncRegionalTradeObjective('));
 const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');assert.match(css,/\.quest-actions button\{min-height:44px/);assert.match(css,/\.quest-actions\[hidden\]\{display:none/);
});

test('ordinary stored scenario reaches true crop meals through the literal HUD without freight starvation',{timeout:90000},t=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/regional-objective-events.json',import.meta.url),'utf8')) as {seconds:number;events:{tick:number;domain:string;targetId:string;action:string;accepted:boolean}[]};
 let state=createSettlementWorkbench(73129,'regional','regional');const plan=settlementPlan(state.seed),h=harness(near(state)),seen=new Map<string,{seconds:number;objective:RegionalObjective}>();
 const observe=(label:string,condition:boolean,seconds:number)=>{if(!condition||seen.has(label))return;const snapshot=near(state),bytes=JSON.stringify(snapshot),objective=selectRegionalObjective(snapshot,{previousSiteId:plan.collector.id})!;h.change(snapshot);h.sync();assert.equal(h.nodes['quest-title'].textContent,objective.title);assert.match(h.nodes['quest-progress'].textContent,new RegExp(objective.status.toUpperCase()));assert.equal(JSON.stringify(snapshot),bytes);seen.set(label,{seconds,objective});};
 for(let seconds=0;seconds<=fixture.seconds;seconds++){
  const f=state.frontierFood!.farms.find(f=>f.id===plan.farm.id)!,o=state.frontierSupply!.outposts.find(o=>o.id===plan.collector.id)!,r=state.frontierTrade!.routes.find(r=>r.id===plan.routes[1]!.id)!,weather=regionalSupplyWeather(state.frontierSupply!,o.id)!;
  observe('before freight',seconds===0,seconds);observe('freight travelling',r.cargo>0&&r.activity==='outbound',seconds);observe('store ready',r.destinationStock>=4&&r.builtAt===null&&r.buildStartedAt===null,seconds);observe('store built',r.builtAt!==null,seconds);observe('collector building',o.buildStartedAt!==null&&o.builtAt===null,seconds);observe('collector built',o.builtAt!==null,seconds);observe('dry crop wait',o.builtAt!==null&&f.startedAt!==null&&f.crop==='empty'&&f.harvested===0&&weather.intensity===0,seconds);observe('rain before overflow',o.builtAt!==null&&f.startedAt!==null&&f.harvested===0&&f.water<2&&o.spilled===0&&weather.intensity>0,seconds);observe('growing',f.crop==='growing',seconds);observe('harvest',f.harvested>0,seconds);observe('loading crop food',f.reserved>0,seconds);observe('travelling crop food',f.cargo>0&&f.activity==='outbound',seconds);observe('delivered crop food',f.delivered>0,seconds);observe('eaten crop food',f.meals>f.starterGranted&&f.harvested>0&&f.delivered>0,seconds);
  if(seen.has('eaten crop food'))break;
  for(const event of fixture.events.filter(e=>e.tick===seconds*4)){const action=settlementInteractions(state).find(a=>a.domain===event.domain&&a.targetId===event.targetId&&a.kind===event.action)!;assert(action);const next=applySettlementAction(state,action);assert.equal(next!==state,event.accepted);state=next;}
  if(seconds<fixture.seconds)state=applyAction(state,{type:'tick',dt:1});
 }
 for(const label of ['before freight','freight travelling','store ready','store built','collector building','collector built','dry crop wait','rain before overflow','growing','harvest','loading crop food','travelling crop food','delivered crop food','eaten crop food'])assert(seen.has(label),label);
 assert.equal(seen.get('before freight')!.objective.stage,'freight');assert.equal(seen.get('store built')!.objective.stage,'collector');assert.equal(seen.get('collector building')!.objective.status,'waiting');assert.equal(seen.get('collector built')!.objective.stage,'farm');assert.match(seen.get('dry crop wait')!.objective.copy,/Dry weather/);assert.match(seen.get('rain before overflow')!.objective.copy,/Residents drink first/);
 for(const label of ['growing','harvest','loading crop food','travelling crop food','delivered crop food'])assert.notEqual(seen.get(label)!.objective.status,'completed',label);
 assert.equal(seen.get('eaten crop food')!.objective.stage,'meal');assert.equal(seen.get('eaten crop food')!.objective.status,'completed');assert.equal(h.opened.length,0);
 t.diagnostic(JSON.stringify(Object.fromEntries([...seen].map(([key,value])=>[key,{seconds:value.seconds,status:value.objective.status,stage:value.objective.stage,title:value.objective.title}]))));
});
