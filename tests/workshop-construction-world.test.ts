import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegionalState,createConnectedState,enableStartingTown,applyAction,validateSave,serializeSave,parseSave,type State} from '../src/world.ts';
import {assignTownWorkshopWorker} from '../src/town-life.ts';
import {DEFAULT_WORKSHOP_DRAFT} from '../src/workshop-authoring.ts';
import {WORKSHOP_BOARD,WORKSHOP_PARCEL,workshopConstructionBoxes,workshopConstructionQuote,type WorkshopConstructionCommand} from '../src/workshop-construction.ts';
import {seed,readyWorkshop,buildCommand} from './helpers/workshop-construction.ts';
const build=(s:State)=>applyAction(s,{type:'workshop-construction',command:buildCommand(s)});

test('campaign construction debits finite conserved town materials once, preserves 100 residents and old saves',()=>{
 const old=createRegionalState(seed),connected=createConnectedState(seed);assert(validateSave(old));assert.equal(Object.hasOwn(parseSave(serializeSave(old))!,'workshopConstruction'),false);assert.equal(Object.hasOwn(connected,'workshopConstruction'),false);
 const s=readyWorkshop(),cmd=buildCommand(s),next=applyAction(s,{type:'workshop-construction',command:cmd});assert(next.workshopConstruction);
 assert.equal(next.townLife!.resources.materials,s.townLife!.resources.materials-workshopConstructionQuote(DEFAULT_WORKSHOP_DRAFT).materials);
 assert.equal(next.townLife!.ledger.consumed.materials-s.townLife!.ledger.consumed.materials,next.workshopConstruction.materialsPaid);
 assert.deepEqual(next.townLife!.residents.map(r=>r.id),s.townLife!.residents.map(r=>r.id));assert.equal(next.townLife!.residents.length,100);assert.deepEqual(next.inventory,s.inventory);
 assert.equal(applyAction(next,{type:'workshop-construction',command:cmd}),next);assert(validateSave(next));assert.deepEqual(parseSave(serializeSave(next)),next);
});

test('construction credits achieved work across bounded ticks and deterministic save continuation',()=>{
 let s=build(readyWorkshop());assert(s.workshopConstruction);assert.equal(s.workshopConstruction.work,0);
 const early=applyAction(s,{type:'tick',dt:.5});assert.equal(early.workshopConstruction!.work,0,'walking is not construction');s=early;
 let reload=parseSave(serializeSave(s))!;
 for(let i=0;i<600&&s.workshopConstruction!.status!=='complete';i++){s=applyAction(s,{type:'tick',dt:.5});reload=applyAction(reload,{type:'tick',dt:.5});}
 assert.equal(s.workshopConstruction!.status,'complete');assert.deepEqual(reload,s);assert(validateSave(s));
 const geometry=workshopConstructionBoxes(s.workshopConstruction);assert(geometry.filter(b=>b.solid).length>10);assert.deepEqual(workshopConstructionBoxes(parseSave(serializeSave(s))!.workshopConstruction),geometry);
 s={...s,player:{...s.player,hp:45}};const command:WorkshopConstructionCommand={kind:'repair',expectedRevision:s.workshopConstruction!.revision},before=s,next=applyAction(s,{type:'workshop-construction',command});assert.equal(next.player.hp,70);assert.equal(next.townLife!.resources.materials,before.townLife!.resources.materials-4);assert.equal(next.workshopConstruction!.repairs,1);assert.equal(applyAction(next,{type:'workshop-construction',command}),next);assert(validateSave(next));
});

test('campaign import rejects malformed construction and construction cannot be paid from a remote position',()=>{
 const s=readyWorkshop(),cmd=buildCommand(s);for(const unavailable of [{...s,player:{...s.player,x:0,z:0}},{...s,player:{...s.player,hp:0}},{...s,zone:'cave' as const}])assert.equal(applyAction(unavailable,{type:'workshop-construction',command:cmd}),unavailable);
 const paid=build(s);assert(paid.workshopConstruction);
 for(const change of [(v:any)=>v.workshopConstruction.materialsPaid--,(v:any)=>v.workshopConstruction.work=-1,(v:any)=>v.workshopConstruction.workerId='forged-worker',(v:any)=>v.workshopConstruction.status='complete',(v:any)=>v.workshopConstruction.parameters.width=100,(v:any)=>delete v.townLife]){const raw=structuredClone(paid);change(raw);assert.equal(validateSave(raw),false);assert.equal(parseSave(JSON.stringify(raw)),null);}
});


test('workshop payment provenance survives town ledger rebase and prevents unpaid geometry or ledger removal',()=>{
 const paid=build(readyWorkshop());assert(paid.workshopConstruction);assert.equal(paid.townLife!.workshopSpent,paid.workshopConstruction.materialsPaid);
 const unpaid={...readyWorkshop(),workshopConstruction:paid.workshopConstruction};assert.equal(validateSave(unpaid),false);assert.equal(parseSave(JSON.stringify(unpaid)),null);
 const removed=structuredClone(paid);delete removed.workshopConstruction;assert.equal(validateSave(removed),false);
 const rebased=structuredClone(paid),life=rebased.townLife!;life.ledger={...life.ledger,epochs:1,initial:{...life.resources},produced:{pantry:0,water:0,materials:0,harvest:0},consumed:{pantry:0,water:0,materials:0,harvest:0},donated:{pantry:0,water:0,materials:0,harvest:0},overflow:{pantry:0,water:0,materials:0,harvest:0}};
 assert(validateSave(rebased));assert.deepEqual(parseSave(JSON.stringify(rebased)),rebased);
});

test('loading a player embedded in a reserved workshop wall recovers to its clear board',()=>{
 const paid=build(readyWorkshop()),wall=workshopConstructionBoxes(paid.workshopConstruction).find(b=>b.solid&&b.half.y>1)!;
 const embedded={...paid,player:{...paid.player,x:wall.center.x,z:wall.center.z}},loaded=parseSave(JSON.stringify(embedded));assert(loaded);assert.equal(loaded.player.x,WORKSHOP_BOARD.x);assert.equal(loaded.player.z,WORKSHOP_BOARD.z);assert.deepEqual(loaded.workshopConstruction,paid.workshopConstruction);
});
