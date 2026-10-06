import test from 'node:test';
import assert from 'node:assert/strict';
import {createTownLife,receiveTownSupplyDelivery,applyTownLifeCommand,townLifeFacilities,validTownLife,immutableTownLife,advanceTownLife,type TownLifeState} from '../src/town-life.ts';
function context(life:TownLifeState,scrap=2){const p=townLifeFacilities(life.seed).find(f=>f.id==='workshop')!;return {seed:life.seed,zone:'valley',player:{x:p.x,z:p.z,hp:100},inventory:{scrap,core:0,water:0}};}

test('finite supply handoff uses the exact ordinary donation cost benefit cooldown and receipt',()=>{
 const base=createTownLife(7),ctx=context(base,6),normal=applyTownLifeCommand(base,ctx,{kind:'donate-supplies',targetId:'workshop',expectedRevision:0})!,delivered=receiveTownSupplyDelivery(base,ctx)!;
 assert.ok(delivered);assert.deepEqual(delivered.inventory,{scrap:4,core:0,water:0});assert.equal(delivered.life.supplyDeliveries,1);const clean=structuredClone(delivered.life);delete clean.supplyDeliveries;assert.deepEqual(clean,normal.life);
 assert.equal(delivered.life.resources.materials,132);assert.equal(delivered.life.ledger.donated.materials,12);assert.equal(delivered.life.playerSpent.scrap,2);assert.equal(delivered.life.contributions['donate-supplies'],1);assert.equal(delivered.life.cooldowns.donate,10);assert(validTownLife(delivered.life,7));assert.equal(Object.hasOwn(base,'supplyDeliveries'),false);assert.ok(Object.isFrozen(delivered.life));
 assert.equal(receiveTownSupplyDelivery(delivered.life,ctx),null,'cooldown cannot be retried for an additional delivery');
});

test('finite supply handoff preserves actual workshop position stock capacity and inventory guards',()=>{
 const base=createTownLife(7),ctx=context(base);
 for(const invalid of [{...ctx,zone:'cave'},{...ctx,seed:8},{...ctx,player:{...ctx.player,hp:0}},{...ctx,player:{...ctx.player,x:0,z:0}},context(base,1)])assert.equal(receiveTownSupplyDelivery(base,invalid),null);
 const full=structuredClone(base);full.resources.materials=589;full.ledger.initial.materials=589;assert(validTownLife(full,7));assert.equal(receiveTownSupplyDelivery(full,context(full)),null);
 full.resources.materials=588;full.ledger.initial.materials=588;assert.equal(receiveTownSupplyDelivery(full,context(full))!.life.resources.materials,600);
});

test('three canonical supply deliveries are the permanent maximum and save continuation is exact',()=>{
 let life=createTownLife(7);for(let i=0;i<3;i++){const result=receiveTownSupplyDelivery(life,context(life));assert(result);life=result.life;assert.equal(life.supplyDeliveries,i+1);life=advanceTownLife(life,10);}
 assert.equal(receiveTownSupplyDelivery(life,context(life)),null);const loaded=immutableTownLife(JSON.parse(JSON.stringify(life)),7);assert.deepEqual(loaded,life);assert.deepEqual(advanceTownLife(loaded,.5),advanceTownLife(life,.5));
 const ordinary=applyTownLifeCommand(life,context(life),{kind:'donate-supplies',targetId:'workshop',expectedRevision:life.revision});assert(ordinary,'ordinary player donations remain independent of the finite cargo route');assert.equal(ordinary.life.supplyDeliveries,3);
});

test('supply delivery imports require an integer bounded subset of actual donation contributions',()=>{
 const base=createTownLife(7);assert.deepEqual(immutableTownLife(JSON.parse(JSON.stringify(base)),7),base);assert.equal(Object.hasOwn(base,'supplyDeliveries'),false);
 for(const n of [-1,.5,1,4,NaN,Infinity])assert.equal(validTownLife({...base,supplyDeliveries:n},7),false);
 const paid=receiveTownSupplyDelivery(base,context(base))!.life;assert.equal(validTownLife({...paid,supplyDeliveries:2},7),false);assert(validTownLife({...base,supplyDeliveries:0},7));
});
