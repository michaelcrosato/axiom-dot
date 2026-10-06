import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegionalState,enableStartingTown,applyAction,worldTownSupplySources,serializeSave,parseSave,type State} from '../src/world.ts';
import {projectCampaignGuidance} from '../src/campaign-guidance.ts';
function frozen<T>(value:T):T {if(value&&typeof value==='object'){for(const child of Object.values(value))frozen(child);Object.freeze(value);}return value;}
function collect(state:State,id:string){const source=worldTownSupplySources(state).find(s=>s.id===id)!;return applyAction({...state,player:{...state.player,x:source.x,z:source.z}},{type:'collect',id});}

test('independent guidance review recognizes pre-existing ordinary pickup progress after reload without inventing haul receipts',()=>{
 let state=enableStartingTown(createRegionalState(73129));const sources=worldTownSupplySources(state);
 state=collect(state,sources[0]!.id);state=parseSave(serializeSave(state))!;assert.ok(state);assert.equal(state.townSupply,undefined);
 const before=serializeSave(state),first=projectCampaignGuidance(frozen(state),{sourceId:sources[0]!.id}).find(c=>c.id==='supply')!;
 assert.notEqual(first.target?.selectionId,sources[0]!.id,'a consumed stored pointer falls back to a real remaining source');assert.ok(sources.slice(1).some(s=>s.id===first.target?.selectionId));assert.match(first.progress,/6\/7 caches remain/);assert.equal(serializeSave(state),before);
 for(const source of sources.slice(1))state=collect(state,source.id);state=parseSave(serializeSave(state))!;
 const finished=projectCampaignGuidance(state).find(c=>c.id==='supply')!;assert.equal(finished.status,'complete');assert.match(finished.progress,/0 deliveries/);assert.equal(state.townSupply,undefined);assert.equal(state.townLife!.supplyDeliveries,undefined);assert.equal(state.inventory.scrap,7);
});

test('independent guidance review projects frozen canonical progress across transient roles and inaccessible states without completing intent',()=>{
 let state=enableStartingTown(createRegionalState(42));const source=worldTownSupplySources(state)[0]!;state=applyAction({...state,player:{...state.player,x:source.x,z:source.z}},{type:'town-supply',command:{kind:'load',targetId:source.id,expectedRevision:0}});assert.equal(state.townSupply!.carried,1);
 for(const variant of [state,{...state,zone:'cave' as const},{...state,player:{...state.player,hp:0}}]){
  const before=JSON.stringify(variant);frozen(variant);
  const host=projectCampaignGuidance(variant,{host:true}),guest=projectCampaignGuidance(variant,{host:false});assert.equal(host.length,6);assert.equal(guest.length,6);assert.equal(JSON.stringify(variant),before);assert.equal(variant.townSupply!.carried,1);assert.equal(variant.townSupply!.deliveries,0);assert.equal(variant.workshopConstruction,undefined);assert.ok(Object.isFrozen(host));assert.ok(host.every(c=>Object.isFrozen(c)&&Object.isFrozen(c.requirements)));
  if(variant.zone!=='valley')assert.ok(guest.every(c=>c.status==='blocked'&&c.target===null));
  if(variant.player.hp===0)assert.ok(guest.every(c=>c.status==='blocked'));
  assert.deepEqual(host.map(c=>c.progress),guest.map(c=>c.progress),'authority changes availability copy, never saved progress');
 }
});

import {mountCampaignGuidance} from '../src/campaign-guidance-ui.ts';
class PanelNode {value='';textContent='';disabled=false;nodes=new Map<string,PanelNode>();onclick?:()=>void;onchange?:()=>void;set innerHTML(html:string){this.nodes.clear();for(const m of html.matchAll(/\bid="([^"]+)"/g))this.nodes.set('#'+m[1],new PanelNode());}querySelector(id:string){return this.nodes.get(id)??null;}}
test('independent guidance review rejects detached journal callbacks and recomputes targets when campaign state changes before a click',()=>{
 const panel=new PanelNode();let state=enableStartingTown(createRegionalState(42));const inspected:unknown[]=[],mapped:unknown[]=[],tracked:unknown[]=[];
 const options={getState:()=>state,getSelection:()=>({goalId:null}),onTrack:(v:unknown)=>tracked.push(v),onUntrack:()=>tracked.push(null),onInspect:(v:unknown)=>inspected.push(v),onMap:(v:unknown)=>mapped.push(v),onClose:()=>{}};
 const old=mountCampaignGuidance(panel as never,options);const inspect=panel.querySelector('#cg-inspect')!.onclick!,map=panel.querySelector('#cg-map')!.onclick!,track=panel.querySelector('#cg-track')!.onclick!;
 state={...state,zone:'cave'};inspect();map();assert.equal(inspected.length,0);assert.equal(mapped.length,0,'surface actions disappear before a refresh when state changes');
 state={...state,zone:'valley'};const fresh=mountCampaignGuidance(panel as never,options);inspect();map();track();assert.equal(inspected.length,0);assert.equal(mapped.length,0);assert.equal(tracked.length,0,'replaced DOM invalidates handlers even before explicit old disposal');old.dispose();panel.querySelector('#cg-map')!.onclick!();assert.equal(mapped.length,1);fresh.dispose();
});
