import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegionalState,enableStartingTown,enableRestoration,applyAction,commitRestorationCare,validateSave,serializeSave,parseSave,worldRestorationPlan,type State} from '../src/world.ts';
import {restorationCarePosition,restorationCareExported,type RestorationCareCommand} from '../src/restoration-care.ts';
import {receiveTownHabitatCare} from '../src/town-life.ts';
const seed=73129;
function command(s:State,kind:'collect'|'deliver'):RestorationCareCommand {return {kind,targetId:kind==='collect'?worldRestorationPlan(s.seed).sites[0]!.id:'apothecary',expectedRevision:s.restorationCare?.revision??0};}
function at(s:State,kind:'collect'|'deliver'):State {const point=restorationCarePosition(worldRestorationPlan(s.seed),command(s,kind))!;return {...s,player:{...s.player,x:point.x,z:point.z}};}
function send(s:State,kind:'collect'|'deliver'){return applyAction(s,{type:'restoration-care',command:command(s,kind)});}

test('old campaign saves remain byte-identical and unfinished habitats cannot supply care',()=>{
 const old=createRegionalState(seed),raw=serializeSave(old);assert.equal(serializeSave(parseSave(raw)!),raw);assert.equal(Object.hasOwn(old,'restorationCare'),false);
 const s=at(enableStartingTown(enableRestoration(old)),'collect');assert.equal(send(s,'collect'),s);assert.equal(send(at(s,'deliver'),'deliver').restorationCare,undefined);assert(validateSave(s));assert.equal(Object.hasOwn(parseSave(serializeSave(s))!,'restorationCare'),false);
});

test('world validation refuses orphan care receipts or exports and malformed bridge state',()=>{
 const s=enableStartingTown(enableRestoration(createRegionalState(seed))),received=receiveTownHabitatCare(s.townLife!,5);assert(received);const orphan={...s,townLife:received};assert.equal(validateSave(orphan),false);assert.equal(parseSave(JSON.stringify(orphan)),null);
 for(const care of [null,{version:1,revision:1,carried:5,delivered:0,deliveries:0},{version:1,revision:0,carried:0,delivered:0,deliveries:0,extra:true}]){const forged={...s,restorationCare:care};assert.equal(validateSave(forged),false);assert.equal(parseSave(JSON.stringify(forged)),null);}
});

import {earnedCareWorld} from './helpers/restoration-care.ts';
import {restorationBalances} from '../src/restoration.ts';

test('earned habitat biomass becomes conserved carried cargo then finite care stock across save reload',()=>{
 let s=earnedCareWorld();const before=s,biomass=s.restoration!.sites[0]!.cells.reduce((n,c)=>n+c.biomass,0),collect=command(s,'collect');s=applyAction(s,{type:'restoration-care',command:collect});assert.equal(s.restorationCare!.carried,5);assert.equal(s.restoration!.sites[0]!.careExported,5);assert.equal(s.restoration!.sites[0]!.cells.reduce((n,c)=>n+c.biomass,0),biomass-5);assert.deepEqual(s.inventory,before.inventory);assert.equal(applyAction(s,{type:'restoration-care',command:collect}),s);assert(validateSave(s));assert.deepEqual(parseSave(serializeSave(s)),s);
 s=send(s,'collect');assert.equal(s.restorationCare!.carried,10);assert.equal(send(s,'collect'),s,'carried cap cannot mint more harvest');s=at(s,'deliver');const delivery=command(s,'deliver');s=applyAction(s,{type:'restoration-care',command:delivery});assert.equal(s.restorationCare!.carried,0);assert.equal(s.restorationCare!.delivered,10);assert.deepEqual(s.townLife!.habitatCare,{received:10,stock:10,used:0});assert.equal(applyAction(s,{type:'restoration-care',command:delivery}),s);assert.equal(send(s,'deliver'),s);assert(validateSave(s));assert.deepEqual(parseSave(serializeSave(s)),s);assert(Object.values(restorationBalances(s.restoration!,worldRestorationPlan(s.seed))).every(n=>n===0));
 let loaded=parseSave(serializeSave(s))!;for(let i=0;i<10;i++){s=applyAction(s,{type:'tick',dt:.5});loaded=applyAction(loaded,{type:'tick',dt:.5});}assert.deepEqual(loaded,s);assert(validateSave(s));
});

test('care transfer rejects remote, dead, wrong-zone, wrong-elevation and cross-ledger forged imports',()=>{
 const s=earnedCareWorld(),collect=command(s,'collect'),point=restorationCarePosition(worldRestorationPlan(s.seed),collect)!;
 for(const blocked of [{...s,player:{...s.player,x:0,z:0}},{...s,player:{...s.player,hp:0}},{...s,zone:'cave' as const}])assert.equal(applyAction(blocked,{type:'restoration-care',command:collect}),blocked);
 assert.equal(commitRestorationCare(s,collect,point.y+1),s);assert.equal(commitRestorationCare(s,collect,NaN),s);
 const carried=send(s,'collect'),delivered=send(at(carried,'deliver'),'deliver');
 for(const source of [carried,delivered])for(const mutate of [(v:any)=>delete v.restorationCare,(v:any)=>v.restorationCare.carried+=5,(v:any)=>v.restorationCare.delivered+=5,(v:any)=>v.restorationCare.revision++,(v:any)=>v.restoration.sites[0].careExported=0,(v:any)=>delete v.restoration,(v:any)=>delete v.townLife]){const forged=structuredClone(source);mutate(forged);assert.equal(validateSave(forged),false);assert.equal(parseSave(JSON.stringify(forged)),null);}
 const lostReceipt=structuredClone(delivered);delete lostReceipt.townLife!.habitatCare;assert.equal(validateSave(lostReceipt),false);assert.equal(parseSave(JSON.stringify(lostReceipt)),null);assert.equal(restorationCareExported(delivered.restoration!),delivered.restorationCare!.delivered);
});
