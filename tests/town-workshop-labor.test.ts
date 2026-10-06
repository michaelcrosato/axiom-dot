import test from 'node:test';
import assert from 'node:assert/strict';
import {createTownLife,assignTownWorkshopWorker,advanceTownLifeWithWorkshopWork,debitTownWorkshopMaterials,immutableTownLife,validTownLife} from '../src/town-life.ts';

function assigned(){const life=createTownLife(7),id=life.residents[0]!.id;return {life:assignTownWorkshopWorker(life,id)!,id};}

test('campaign prefabrication assigns an existing resident without changing identities or paid activity',()=>{
 const base=createTownLife(7),id=base.residents[0]!.id,life=assignTownWorkshopWorker(base,id)!;
 assert.ok(life);assert.ok(validTownLife(life,7));assert.equal(base.residents[0]!.status,'idle');
 assert.deepEqual(life.residents.map(r=>[r.id,r.needs,r.relationships]),base.residents.map(r=>[r.id,r.needs,r.relationships]));
 assert.equal(life.residents[0]!.facilityId,'workshop');assert.equal(life.residents[0]!.status,'queued');
 assert.deepEqual(assignTownWorkshopWorker(life,id),life);assert.equal(assignTownWorkshopWorker(life,'unknown'),null);
 const urgent=structuredClone(base);urgent.residents[0]!.needs.energy=1;
 assert.equal(assignTownWorkshopWorker(urgent,id),null);
});

test('prefabrication receipts require achieved clear work and preserve every final work fraction',()=>{
 let {life,id}=assigned(),earned=0,found=false;
 for(let i=0;i<600;i++){
  const before=life,r=before.residents[0]!,result=advanceTownLifeWithWorkshopWork(before,.5,id);life=result.life;earned+=result.workSeconds;
  if(r.status==='queued'||r.status==='traveling')assert.equal(result.workSeconds,0);
  if(result.workSeconds>0&&!found){
   found=true;
   const blocked=advanceTownLifeWithWorkshopWork(before,.5,id,undefined,[{id:'blocking-player',x:r.x,z:r.z}]);
   assert.equal(blocked.workSeconds,0);assert.ok(validTownLife(blocked.life,7));
   const resumed=advanceTownLifeWithWorkshopWork(immutableTownLife(JSON.parse(JSON.stringify(before)),7),.5,id);
   assert.deepEqual(resumed,result);
   assert.deepEqual(assignTownWorkshopWorker(before,id),before);
   const other=before.residents.find(q=>q.status==='acting'&&q.facilityId!=='workshop');
   if(other)assert.equal(assignTownWorkshopWorker(before,other.id),null);
  }
  assert.ok(validTownLife(life,7));
  if(life.residents[0]!.completed>0){assert.equal(life.residents[0]!.lastAction,'craft');break;}
 }
 assert.ok(found,'worker physically reached the workbench');assert.equal(earned,26);
 assert.equal(advanceTownLifeWithWorkshopWork(life,0,id).workSeconds,0);
});

test('workshop material payments preserve town resource ledgers',()=>{
 const base=createTownLife(7),paid=debitTownWorkshopMaterials(base,24)!;
 assert.equal(paid.workshopSpent,24);assert.equal(paid.resources.materials,96);assert.equal(paid.ledger.consumed.materials,24);assert.ok(validTownLife(paid,7));
 assert.equal(base.resources.materials,120);assert.ok(Object.isFrozen(paid));
 for(const amount of [0,-1,.5,NaN,Infinity,101]){assert.equal(debitTownWorkshopMaterials(base,amount),null);}
 const empty=debitTownWorkshopMaterials(debitTownWorkshopMaterials(base,100)!,20)!;
 assert.equal(debitTownWorkshopMaterials(empty,1),null);
});

test('prefabrication resumes repeated craft and keeps batched and fixed-step receipts equivalent',()=>{
 const {life:base,id}=assigned();let life=base,earned=0;
 for(let i=0;i<240;i++){const next=advanceTownLifeWithWorkshopWork(life,.5,id);life=next.life;earned+=next.workSeconds;}
 let batched=base,batchEarned=0;
 for(let i=0;i<2;i++){const next=advanceTownLifeWithWorkshopWork(batched,60,id);batched=next.life;batchEarned+=next.workSeconds;}
 assert.ok(earned>26,'commission resumes beyond the first craft task');
 assert.equal(batchEarned,earned);assert.deepEqual(batched,life);assert.ok(validTownLife(life,7));
});

test('workshop payment receipt survives ledger rebasing and rejects invalid receipt imports',()=>{
 const base=createTownLife(7),near=structuredClone(base);near.ledger.produced.materials=999999950;near.ledger.overflow.materials=999999950;
 assert.ok(validTownLife(near,7));const paid=debitTownWorkshopMaterials(near,24)!;assert.equal(paid.ledger.epochs,1);assert.equal(paid.workshopSpent,24);assert.ok(validTownLife(paid,7));
 for(const value of [-1,.5,NaN,10001])assert.equal(validTownLife({...paid,workshopSpent:value},7),false);
 assert.equal(validTownLife({...base,workshopSpent:1},7),false);
});
