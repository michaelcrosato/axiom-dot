import test from 'node:test';
import assert from 'node:assert/strict';
import {createTownLife,advanceTownLife,receiveTownHabitatCare,validTownLife,immutableTownLife,townLifeFacilities,townLifeSummary,type TownLifeState} from '../src/town-life.ts';
import {townLifeTaskPoint} from '../src/town-navigation.ts';

function waiting(){const life=structuredClone(createTownLife(7)),f=townLifeFacilities(7).find(f=>f.id==='apothecary')!,r=life.residents[0]!,p=townLifeTaskPoint(f,0,'recover');
 for(const q of life.residents)q.needs.energy=1;
 Object.assign(r,{x:p.x,z:p.z+1,action:'recover',status:'queued',facilityId:'apothecary',reason:'Waiting for ordinary restorative care.'});r.needs={nourishment:90,energy:40,hygiene:40,comfort:30,connection:80,fulfillment:80};
 life.facilities.find(q=>q.id===f.id)!.queue=[0];assert(validTownLife(life,7));return life;
}
function arrive(){let plain:TownLifeState=waiting(),care=receiveTownHabitatCare(plain,5)!;for(let i=0;i<100&&plain.residents[0]!.status!=='acting';i++){plain=advanceTownLife(plain,.5);care=advanceTownLife(care,.5);}assert.equal(plain.residents[0]!.status,'acting');assert.equal(care.residents[0]!.habitatCare,true);return {plain,care};}

test('habitat care deliveries are finite conserved optional receipts and leave old towns unchanged',()=>{
 const old=createTownLife(7);assert.equal(Object.hasOwn(old,'habitatCare'),false);assert.deepEqual(immutableTownLife(JSON.parse(JSON.stringify(old)),7),old);
 const first=receiveTownHabitatCare(old,5)!;assert.deepEqual(first.habitatCare,{received:5,stock:5,used:0});assert.equal(Object.hasOwn(old,'habitatCare'),false);assert.deepEqual(first.residents,old.residents);assert.deepEqual(first.resources,old.resources);assert.ok(Object.isFrozen(first.habitatCare));assert(validTownLife(first,7));
 const full=receiveTownHabitatCare(receiveTownHabitatCare(first,10)!,5)!;assert.equal(full.habitatCare!.stock,20);assert.equal(receiveTownHabitatCare(full,5),null);
 for(const amount of [-5,0,1,5.5,15,NaN,Infinity])assert.equal(receiveTownHabitatCare(old,amount),null);
 const capped={...old,habitatCare:{received:10000,stock:0,used:10000}};assert(validTownLife(capped,7));assert.equal(receiveTownHabitatCare(capped,5),null);
});

test('botanical stock is reserved only after achieved apothecary arrival and keeps ordinary costs',()=>{
 const base=waiting(),stocked=receiveTownHabitatCare(base,5)!;assert.equal(stocked.residents[0]!.habitatCare,undefined);assert.equal(stocked.habitatCare!.used,0);
 const first=advanceTownLife(stocked,.5);assert.notEqual(first.residents[0]!.status,'acting');assert.equal(first.habitatCare!.used,0);
 const {plain,care}=arrive();assert.deepEqual(care.habitatCare,{received:5,stock:4,used:1});assert.equal(plain.residents[0]!.habitatCare,undefined);assert.deepEqual(care.resources,plain.resources);assert.equal(care.ledger.consumed.materials,.5);assert.equal(care.ledger.consumed.water,.4);assert.equal(care.residents[0]!.remaining,24);assert.deepEqual(care.residents[0]!.needs,plain.residents[0]!.needs);
});

test('botanical recovery adds half the normal energy hygiene and comfort gain only during clear achieved work',()=>{
 const {plain,care}=arrive(),a=advanceTownLife(plain,.5),b=advanceTownLife(care,.5);
 for(const [key,total] of [['energy',45],['hygiene',35],['comfort',74]] as const)assert.ok(Math.abs(b.residents[0]!.needs[key]-a.residents[0]!.needs[key]-total/24*.5*.5)<1e-7,key);
 for(const key of ['nourishment','connection','fulfillment'] as const)assert.equal(b.residents[0]!.needs[key],a.residents[0]!.needs[key]);assert.equal(a.residents[0]!.remaining,b.residents[0]!.remaining);
 const resident=care.residents[0]!,actors=[{id:'standing-player',x:resident.x,z:resident.z}],blocked=advanceTownLife(care,.5,undefined,actors),control=advanceTownLife(plain,.5,undefined,actors);
 assert.equal(blocked.residents[0]!.remaining,resident.remaining);assert.deepEqual(blocked.residents[0]!.needs,control.residents[0]!.needs);assert.equal(blocked.habitatCare!.used,1);assert.match(townLifeSummary(care,0).diagnostics.join(' '),/Botanical care.*1\.5/);
});

test('interrupted botanical care is spent without refund and active treatment saves resume exactly',()=>{
 const {care}=arrive(),saved=immutableTownLife(JSON.parse(JSON.stringify(care)),7);assert.deepEqual(advanceTownLife(saved,5),advanceTownLife(care,5));
 const closed=structuredClone(care);closed.facilities.find(f=>f.id==='apothecary')!.closedFor=20;const canceled=advanceTownLife(closed,.5);assert.equal(canceled.residents[0]!.habitatCare,undefined);assert.deepEqual(canceled.habitatCare,care.habitatCare);assert(validTownLife(canceled,7));
 let done=care;for(let i=0;i<60&&done.residents[0]!.completed===0;i++)done=advanceTownLife(done,.5);assert.ok(done.residents[0]!.completed>0);assert.equal(done.residents[0]!.habitatCare,undefined);assert.equal(done.habitatCare!.used,1);
});

test('habitat care imports reject forged balances extras and treatment without a paid active recover action',()=>{
 const {care}=arrive();for(const edit of [(s:any)=>s.habitatCare.stock++,(s:any)=>s.habitatCare.received=10001,(s:any)=>s.habitatCare.used=.5,(s:any)=>s.habitatCare.extra=1,(s:any)=>s.residents[1].habitatCare=true,(s:any)=>s.residents[0].habitatCare=false,(s:any)=>delete s.habitatCare,(s:any)=>s.habitatCare={received:4,stock:4,used:0}]){const bad=structuredClone(care);edit(bad);assert.equal(validTownLife(bad,7),false);assert.throws(()=>immutableTownLife(bad,7));}
});
