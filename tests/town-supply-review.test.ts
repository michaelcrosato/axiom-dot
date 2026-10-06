import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegionalState,enableStartingTown,applyAction,worldObjects,worldEndpoints,worldTownSupplySources,causalContext,validateSave,parseSave,serializeSave,type State} from '../src/world.ts';
import {townLifeFacilities} from '../src/town-life.ts';
import type {TownSupplyCommand} from '../src/town-supply.ts';
function at(s:State,p:{x:number;z:number}):State{return {...s,player:{...s.player,x:p.x,z:p.z}};}
function load(s:State,id:string){const source=worldTownSupplySources(s).find(p=>p.id===id)!;return applyAction(at(s,source),{type:'town-supply',command:{kind:'load',targetId:id,expectedRevision:s.townSupply?.revision??0}});}
function handoff(s:State,kind:'unload'|'deliver'){return applyAction(at(s,townLifeFacilities(s.seed).find(f=>f.id==='workshop')!),{type:'town-supply',command:{kind,targetId:'workshop',expectedRevision:s.townSupply!.revision}});}
function pumped(){let s=enableStartingTown(createRegionalState(73129));const scrap=worldObjects(s).filter(o=>o.kind==='scrap'),core=worldObjects(s).find(o=>o.kind==='core')!;
 for(const o of [...scrap.slice(0,3),core])s=applyAction(at(s,o),{type:'collect',id:o.id});s=applyAction(at(s,worldEndpoints(s).pump),{type:'repair'});assert.equal(s.waterRestored,true);assert.equal(s.inventory.scrap,0);assert.ok(causalContext(s).historicalPumpRepaired);assert.ok(validateSave(s));return s;}

test('independent supply review preserves historical pump payment and recoverable resources while every remaining scrap is escrowed',()=>{
 let s=pumped();const before=causalContext(s).recoverableScrap,remaining=worldTownSupplySources(s).filter(o=>!s.collected.includes(o.id));assert.equal(remaining.length,4);
 for(const source of remaining){s=load(s,source.id);assert.ok(causalContext(s).historicalPumpRepaired);assert.equal(causalContext(s).recoverableScrap,before);assert.ok(validateSave(s));assert.deepEqual(parseSave(serializeSave(s)),s);}
 assert.equal(s.townSupply!.carried,4);assert.equal(s.inventory.scrap,0);
 const legacy=structuredClone(s);delete legacy.causal;assert.ok(validateSave(legacy));const restored=parseSave(JSON.stringify(legacy));assert.ok(restored);assert.ok(restored.causal!.sourceRepaired);assert.ok(causalContext(restored).historicalPumpRepaired);assert.equal(restored.townSupply!.carried,4);assert.ok(validateSave(restored));
});

test('independent supply review preserves odd cargo through mixed unloading delivery stale retries and ordinary recollection attempts',()=>{
 let s=pumped();for(const source of worldTownSupplySources(s).filter(o=>!s.collected.includes(o.id)).slice(0,3))s=load(s,source.id);
 const ids=[...s.townSupply!.sources],materials=s.townLife!.resources.materials,beforeRecoverable=causalContext(s).recoverableScrap;
 s=handoff(s,'unload');assert.equal(s.inventory.scrap,1);assert.equal(s.townSupply!.carried,2);assert.equal(causalContext(s).recoverableScrap,beforeRecoverable);
 const command:TownSupplyCommand={kind:'deliver',targetId:'workshop',expectedRevision:s.townSupply!.revision};s=applyAction(at(s,townLifeFacilities(s.seed).find(f=>f.id==='workshop')!),{type:'town-supply',command});assert.equal(s.inventory.scrap,1);assert.equal(s.townSupply!.carried,0);assert.equal(s.townSupply!.unloaded,1);assert.equal(s.townSupply!.deliveries,1);assert.equal(s.townLife!.resources.materials,materials+12);assert.equal(causalContext(s).recoverableScrap,beforeRecoverable-2);assert.ok(causalContext(s).historicalPumpRepaired);assert.equal(applyAction(s,{type:'town-supply',command}),s);
 for(const id of ids){const source=worldTownSupplySources(s).find(o=>o.id===id)!,near=at(s,source);assert.equal(applyAction(near,{type:'collect',id}),near);assert.equal(applyAction(near,{type:'town-supply',command:{kind:'load',targetId:id,expectedRevision:s.townSupply!.revision}}),near);}
 assert.ok(validateSave(s));assert.deepEqual(parseSave(serializeSave(s)),s);
});

import {worldHeight} from '../src/generation.ts';
import {roomObstacles} from '../server/coop-authority.ts';
import {actorPathClear} from '../server/coop-movement.ts';
import {clearPulsePath} from '../src/combat.ts';
test('independent supply review finds clear grounded interaction positions for all seven canonical sources across seed extremes',()=>{
 for(const seed of [0,42,73129,4294967295]){const base=enableStartingTown(createRegionalState(seed)),sources=worldTownSupplySources(base);assert.equal(sources.length,7);assert.deepEqual(sources.map(s=>s.id),worldObjects(base).filter(o=>o.kind==='scrap').map(o=>o.id));
  for(const source of sources){const state=at(base,source),point={x:source.x,y:worldHeight(state,source.x,source.z),z:source.z},obstacles=roomObstacles(state);assert.equal(source.y,point.y,'ground authority is independent of pickup display elevation');assert.ok(actorPathClear(point,point,obstacles,false),`standing body clear at ${source.id}`);assert.ok(clearPulsePath(point,{...source,y:source.y!},obstacles),`interaction line clear at ${source.id}`);}
 }
});
