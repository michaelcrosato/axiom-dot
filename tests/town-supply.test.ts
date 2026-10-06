import test from 'node:test';
import assert from 'node:assert/strict';
import {generateValley,valleySurfaceHeight} from '../src/valley.ts';
import {createTownLife,advanceTownLife,immutableTownLife,validTownLife,type TownLifeState} from '../src/town-life.ts';
import {applyTownSupply,validTownSupply,validTownSupplyCommand,immutableTownSupply,townSupplyPosition,townSupplyBlockReason,type TownSupplyState,type TownSupplyContext,type TownSupplyCommand} from '../src/town-supply.ts';
const seed=73129,plan=generateValley(seed),sources=plan.objects.filter(s=>s.kind==='scrap').map(s=>({...s,y:valleySurfaceHeight(plan,s.x,s.z)}));
function fixture(){return {supply:undefined as TownSupplyState|undefined,life:createTownLife(seed),inventory:{scrap:0,core:1,water:2},collected:[] as string[]};}
function perform(f:ReturnType<typeof fixture>,kind:TownSupplyCommand['kind'],targetId=kind==='load'?sources.find(s=>!f.collected.includes(s.id))!.id:'workshop'){
 const command={kind,targetId,expectedRevision:f.supply?.revision??0},p=townSupplyPosition(seed,sources,command)!,context:TownSupplyContext={seed,zone:'valley',player:{x:p.x,z:p.z,hp:80,feetY:p.y},inventory:f.inventory,collected:f.collected};return {command,context,result:applyTownSupply(f.supply,sources,f.life,context,command)};
}
test('town cargo loads canonical finite scrap directly, tombstones its pickup and does not mint ordinary inventory',()=>{
 const f=fixture(),before=JSON.stringify(f),first=perform(f,'load');assert(first.result);assert.equal(JSON.stringify(f),before);assert.deepEqual(first.result.inventory,f.inventory);assert.equal(first.result.supply.carried,1);assert.deepEqual(first.result.supply.sources,[first.command.targetId]);assert.deepEqual(first.result.collected,[first.command.targetId]);assert.equal(first.result.life,f.life);assert(validTownSupply(first.result.supply,sources,first.result.collected,first.result.life));
 assert.equal(applyTownSupply(first.result.supply,sources,first.result.life,{...first.context,collected:first.result.collected},first.command),null);
 assert.equal(perform(first.result,'load',first.command.targetId).result,null);
 const ordinary={...f,collected:[sources[0]!.id],inventory:{...f.inventory,scrap:1}};assert.equal(perform(ordinary,'load',sources[0]!.id).result,null);
});
test('town supply delivery consumes exactly two escrow scrap through real conserved donation and cooldown',()=>{
 let f=fixture();for(let i=0;i<4;i++){const r=perform(f,'load').result;assert(r);f=r;}assert.equal(perform(f,'load').result,null);const before=f,delivery=perform(f,'deliver');assert(delivery.result);f=delivery.result;
 assert.equal(f.supply!.carried,2);assert.equal(f.supply!.deliveries,1);assert.deepEqual(f.inventory,before.inventory);assert.equal(f.life.resources.materials,before.life.resources.materials+12);assert.equal(f.life.ledger.donated.materials,before.life.ledger.donated.materials+12);assert.equal(f.life.playerSpent.scrap,2);assert.equal(f.life.contributions['donate-supplies'],1);assert.equal(f.life.supplyDeliveries,1);assert.equal(f.life.cooldowns.donate,10);assert(validTownLife(f.life,seed));assert(validTownSupply(f.supply,sources,f.collected,f.life));assert.equal(perform(f,'deliver').result,null);
 assert.equal(applyTownSupply(f.supply,sources,f.life,{...delivery.context,collected:f.collected},delivery.command),null);assert.equal(f.collected.length,f.inventory.scrap+f.supply!.carried+f.life.playerSpent.scrap);
 assert.deepEqual(f.life.residents.map(r=>[r.id,r.homeIndex,r.householdId,r.needs]),before.life.residents.map(r=>[r.id,r.homeIndex,r.householdId,r.needs]));
});
test('unloading a single remaining unit returns ordinary scrap once without removing source tombstone',()=>{
 let f=fixture();f=perform(f,'load').result!;const unloaded=perform(f,'unload');assert(unloaded.result);f=unloaded.result;assert.equal(f.supply!.carried,0);assert.equal(f.supply!.unloaded,1);assert.equal(f.inventory.scrap,1);assert.equal(f.life.playerSpent.scrap,0);assert.equal(f.life.supplyDeliveries,undefined);assert.equal(f.collected.length,1);assert.equal(perform(f,'unload').result,null);assert.equal(perform(f,'load',f.collected[0]!).result,null);assert(validTownSupply(f.supply,sources,f.collected,f.life));
 const restored=immutableTownSupply(JSON.parse(JSON.stringify(f.supply)),sources,f.collected,f.life);assert.deepEqual(restored,f.supply);assert(Object.isFrozen(restored.sources));
});
test('all seven valley sources bound the route to three donations plus one ordinary scrap',()=>{
 let f=fixture();for(let i=0;i<3;i++){f=perform(f,'load').result!;f=perform(f,'load').result!;f=perform(f,'deliver').result!;assert(f);if(i<2)f={...f,life:advanceTownLife(f.life,10)};}
 f=perform(f,'load').result!;f=perform(f,'unload').result!;assert.equal(f.supply!.sources.length,7);assert.equal(f.supply!.deliveries,3);assert.equal(f.supply!.unloaded,1);assert.equal(f.supply!.carried,0);assert.equal(f.supply!.revision,11);assert.equal(f.inventory.scrap,1);assert.equal(f.life.playerSpent.scrap,6);assert(validTownSupply(f.supply,sources,f.collected,f.life));assert(validTownLife(f.life,seed));assert.equal(new Set(f.collected).size,7);
 for(const s of sources)assert.equal(perform(f,'load',s.id).result,null);
 let unloaded=fixture();for(const s of sources){unloaded=perform(unloaded,'load',s.id).result!;unloaded=perform(unloaded,'unload').result!;}assert.equal(unloaded.supply!.revision,14);assert.equal(unloaded.inventory.scrap,7);assert(validTownSupply(unloaded.supply,sources,unloaded.collected,unloaded.life));
});
test('supply save validation rejects duplicate or noncanonical sources and broken cross-ledger arithmetic',()=>{
 let f=fixture();f=perform(f,'load').result!;f=perform(f,'load').result!;f=perform(f,'deliver').result!;const s=f.supply!;
 for(const patch of [{sources:[s.sources[0],s.sources[0]]},{sources:['invented',s.sources[1]]},{sources:[]},{carried:1},{unloaded:1},{deliveries:0},{revision:s.revision+1},{version:2},{extra:true},{carried:NaN}]){assert(!validTownSupply({...s,...patch},sources,f.collected,f.life));assert.throws(()=>immutableTownSupply({...s,...patch},sources,f.collected,f.life));}
 assert(!validTownSupply(s,sources,[],f.life));assert(!validTownSupply(s,sources,[...f.collected,f.collected[0]!],f.life));assert(!validTownSupply(s,sources,f.collected,createTownLife(seed)));assert.equal(perform({...f,supply:undefined},'load',sources[2]!.id).result,null);
 const sparse=structuredClone(s);delete sparse.sources[0];assert(!validTownSupply(sparse,sources,f.collected,f.life));const extra=structuredClone(s);Object.defineProperty(extra.sources,'extra',{value:true});assert(!validTownSupply(extra,sources,f.collected,f.life));let invoked=false;const accessor={...s};Object.defineProperty(accessor,'carried',{get(){invoked=true;return 0;},enumerable:true});assert(!validTownSupply(accessor,sources,f.collected,f.life));assert(!invoked);
});
test('supply action guards reject unsupported targets, range, height, stale intent and command-side grants',()=>{
 const f=fixture(),{command,context}=perform(f,'load');
 for(const bad of [{...command,amount:7},{...command,inventory:{scrap:7}},{...command,kind:'refund'},{...command,expectedRevision:NaN}])assert(!validTownSupplyCommand(bad));
 for(const player of [{...context.player,x:NaN},{...context.player,z:Infinity},{...context.player,hp:0},{...context.player,hp:101},{...context.player,x:context.player.x+4},{...context.player,feetY:context.player.feetY!+1},{...context.player,feetY:NaN}])assert.equal(applyTownSupply(f.supply,sources,f.life,{...context,player},command),null);
 assert.equal(applyTownSupply(f.supply,sources,f.life,{...context,zone:'cave'},command),null);assert.equal(applyTownSupply(f.supply,sources,f.life,{...context,seed:seed+1},command),null);assert.equal(townSupplyPosition(seed,sources,{kind:'deliver',targetId:'square'}),null);assert.equal(townSupplyPosition(seed,sources,{kind:'load',targetId:'invented'}),null);
 assert.match(townSupplyBlockReason(f.supply,sources,f.life,context,{...command,expectedRevision:1})!,/changed/);
});
test('full shared stores block delivery but preserve cargo and allow unloading without refund duplication',()=>{
 let f=fixture();f=perform(f,'load').result!;f=perform(f,'load').result!;const full=structuredClone(f.life);full.resources.materials=600;full.ledger.initial.materials=600;f={...f,life:immutableTownLife(full,seed)};assert.equal(perform(f,'deliver').result,null);const before=f.supply;f=perform(f,'unload').result!;assert.equal(f.supply!.carried,1);assert.equal(before!.carried,2);assert.equal(f.inventory.scrap,1);assert.equal(f.life.resources.materials,600);assert.equal(f.life.supplyDeliveries,undefined);
});
