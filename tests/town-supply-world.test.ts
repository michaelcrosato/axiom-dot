import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegionalState,createConnectedState,applyAction,commitTownSupply,worldTownSupplySources,worldObjects,validateSave,serializeSave,parseSave,causalContext,type State} from '../src/world.ts';
import {worldHeight} from '../src/generation.ts';
import {townSupplyWorld,supplyCommand,atSupply,loadSupply} from './helpers/town-supply.ts';
const commit=(s:State,kind:'load'|'unload'|'deliver',index=0)=>applyAction(s,{type:'town-supply',command:supplyCommand(s,kind,index)});

test('town supply exposes finite canonical valley scrap at terrain feet and preserves absent legacy saves',()=>{
 const old=createRegionalState(73129),bytes=serializeSave(old);assert.equal(serializeSave(parseSave(bytes)!),bytes);assert.equal(Object.hasOwn(old,'townSupply'),false);assert.deepEqual(worldTownSupplySources(createConnectedState(73129)),[]);
 const sources=worldTownSupplySources(old);assert.equal(sources.length,7);assert(sources.every(o=>o.kind==='scrap'&&worldObjects(old).some(c=>c.id===o.id&&c.kind==='scrap')));for(const o of sources)assert.equal(o.y,worldHeight({...old,zone:'valley'},o.x,o.z));
});

test('loading escrow and ordinary collection share the same tombstone and remain save-valid',()=>{
 const s=atSupply(townSupplyWorld(),'load'),command=supplyCommand(s,'load'),regular=applyAction(s,{type:'collect',id:command.targetId});assert.equal(commit(regular,'load'),regular);assert.equal(regular.inventory.scrap,s.inventory.scrap+1);
 const cargo=applyAction(s,{type:'town-supply',command});assert.equal(cargo.townSupply!.carried,1);assert.deepEqual(cargo.inventory,s.inventory);assert(cargo.collected.includes(command.targetId));assert.equal(applyAction(cargo,{type:'collect',id:command.targetId}),cargo);assert.equal(applyAction(cargo,{type:'town-supply',command}),cargo);assert(validateSave(cargo));assert.deepEqual(parseSave(serializeSave(cargo)),cargo);assert.equal(causalContext(cargo).recoverableScrap,causalContext(s).recoverableScrap);
});

test('four-slot supply load unloads exactly once or spends two escrow scrap through the real town donation',()=>{
 let s=loadSupply(townSupplyWorld(),4);assert.equal(s.townSupply!.carried,4);const full=atSupply(s,'load',4);assert.equal(commit(full,'load',4),full);s=atSupply(s,'unload');const unload=supplyCommand(s,'unload'),returned=applyAction(s,{type:'town-supply',command:unload});assert.equal(returned.inventory.scrap,s.inventory.scrap+1);assert.equal(returned.townSupply!.carried,3);assert.equal(applyAction(returned,{type:'town-supply',command:unload}),returned);
 s=returned;const before=s,delivery=supplyCommand(s,'deliver');s=applyAction(s,{type:'town-supply',command:delivery});assert.equal(s.townSupply!.carried,1);assert.equal(s.townSupply!.deliveries,1);assert.equal(s.townLife!.supplyDeliveries,1);assert.equal(s.townLife!.resources.materials,before.townLife!.resources.materials+12);assert.equal(s.townLife!.playerSpent.scrap,before.townLife!.playerSpent.scrap+2);assert.equal(s.townLife!.contributions['donate-supplies'],before.townLife!.contributions['donate-supplies']+1);assert.deepEqual(s.inventory,before.inventory);assert.equal(applyAction(s,{type:'town-supply',command:delivery}),s);assert(validateSave(s));assert.deepEqual(parseSave(serializeSave(s)),s);
});

test('supply imports reject orphan cargo, forged payments, recycled source ids and missing tombstones',()=>{
 const cargo=loadSupply(townSupplyWorld(),2),delivered=commit(atSupply(cargo,'deliver'),'deliver');
 for(const source of [cargo,delivered])for(const mutate of [(v:any)=>delete v.townSupply,(v:any)=>v.townSupply.carried++,(v:any)=>v.townSupply.revision++,(v:any)=>v.townSupply.sources[0]='forged-source',(v:any)=>v.townSupply.sources[1]=v.townSupply.sources[0],(v:any)=>v.collected.shift(),(v:any)=>v.inventory.scrap++,(v:any)=>delete v.townLife]){const forged=structuredClone(source);mutate(forged);assert.equal(validateSave(forged),false);assert.equal(parseSave(JSON.stringify(forged)),null);}
 const orphan=structuredClone(delivered);delete orphan.townSupply;assert.equal(validateSave(orphan),false);const missing=structuredClone(delivered);delete missing.townLife!.supplyDeliveries;assert.equal(validateSave(missing),false);
});

test('supply requires a living valley explorer within range and accepted terrain elevation',()=>{
 const s=atSupply(townSupplyWorld(),'load'),command=supplyCommand(s,'load'),source=worldTownSupplySources(s)[0]!;
 for(const unavailable of [{...s,player:{...s.player,x:s.player.x+10}},{...s,player:{...s.player,hp:0}},{...s,zone:'cave' as const}])assert.equal(applyAction(unavailable,{type:'town-supply',command}),unavailable);
 assert.equal(commitTownSupply(s,command,(source.y??0)+1),s);assert.equal(commitTownSupply(s,command,NaN),s);
});

import {createTownLifeScenario} from '../src/town-life.ts';
import {createTownDirector,townDirectorInteractionPosition} from '../src/town-director.ts';
test('an accepted material shortage credits the exact existing donation once when escrow is delivered',()=>{
 let s=townSupplyWorld(),townLife=createTownLifeScenario(s.seed,'lean-stores');s={...s,townLife,townDirector:createTownDirector(townLife)};s=loadSupply(s,2);
 const episode=s.townDirector!.episodes.find(e=>e.kind==='material-shortage')!,point=townDirectorInteractionPosition(s.townDirector!,episode.id)!;s={...s,player:{...s.player,...point}};s=applyAction(s,{type:'town-director',command:{kind:'accept',episodeId:episode.id,expectedRevision:s.townDirector!.revision,expectedLifeRevision:s.townLife!.revision}});assert.equal(s.townDirector!.episodes.find(e=>e.id===episode.id)!.status,'accepted');
 s=atSupply(s,'deliver');const command=supplyCommand(s,'deliver'),delivered=applyAction(s,{type:'town-supply',command});assert.equal(delivered.townDirector!.episodes.find(e=>e.id===episode.id)!.status,'completed');assert.equal(delivered.townLife!.supplyDeliveries,1);assert.equal(delivered.townLife!.contributions['donate-supplies'],1);assert.equal(delivered.townLife!.playerSpent.scrap,2);assert.equal(delivered.causal!.renown,s.causal!.renown);assert(validateSave(delivered));assert.equal(applyAction(delivered,{type:'town-supply',command}),delivered);
});
