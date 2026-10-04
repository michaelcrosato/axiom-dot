import test from 'node:test';
import assert from 'node:assert/strict';
import {naturalCave} from '../src/natural-cave.ts';
import {createCaveWater,advanceCaveWater,applyCaveWaterCommand,validCaveWater,caveWaterBalance,caveWaterCost,caveDepth,caveRouteOpen,caveFloodObstacles,caveWaterSurfaces,caveNavigable,safeCavePosition,CAVE_WATER_STEP,CAVE_WATER_HASH,type CaveWaterState,type CaveWaterCommand,type CaveInventory} from '../src/cave-water.ts';
const run=(s:CaveWaterState,seconds:number)=>{for(let i=0;i<seconds;i++)s=advanceCaveWater(s,1);return s;};
const command=(s:CaveWaterState,type:CaveWaterCommand['type'],inventory:CaveInventory={scrap:4,core:1,water:0},on=true)=>{const p=naturalCave(s.seed),kind=type==='repair-valve'||type==='set-source'?'valve':type==='repair-pump'||type==='set-pump'?'pump':'drain';return applyCaveWaterCommand(s,{inventory,zone:'cave',hp:100,player:p.anchors[kind]},type==='set-source'||type==='set-pump'?{type,on}:{type});};

test('three finite repair choices independently clear the real flooded route without unearned inventory',()=>{
 for(const seed of [...Array.from({length:40},(_,i)=>i),73129,0xffffffff])for(const choice of ['repair-valve','repair-pump','clear-drain'] as const){
  const initial=createCaveWater(seed),plan=naturalCave(seed);assert.ok(!caveRouteOpen(initial));assert.ok(caveFloodObstacles(initial).length>0);
  const stock={scrap:2,core:1,water:0};const paid=command(initial,choice,stock);assert.notEqual(paid.state,initial);assert.ok(validCaveWater(paid.state,seed));
  assert.equal(paid.inventory.scrap+paid.state.playerSpent.scrap,2);assert.equal(paid.inventory.core+paid.state.playerSpent.core,1);assert.equal(paid.inventory.water,0);
  let s=paid.state,t=0;while(!caveRouteOpen(s)&&t<140){s=advanceCaveWater(s,1);t++;}assert.ok(caveRouteOpen(s),`${seed}: ${choice} must be feasible with the entrance stock`);assert.ok(validCaveWater(s,seed));assert.ok(Math.abs(caveWaterBalance(s))<1e-8);assert.equal(caveFloodObstacles(s).length,0);
  for(const point of plan.spine)assert.ok(caveNavigable(s,point));
  const duplicate=command(s,choice,paid.inventory);assert.equal(duplicate.state,s);assert.equal(duplicate.inventory,paid.inventory);
 }
});

test('spatial heads transfer water between distinct footprints; source, pump and drain alter visible surfaces and access',()=>{
 const seed=73129,plan=naturalCave(seed);let initial=createCaveWater(seed),flooded=run(initial,20);
 assert.ok(caveDepth(flooded,0)>caveDepth(flooded,1));assert.ok(caveDepth(flooded,1)>caveDepth(flooded,2));assert.ok(flooded.extracted>0&&flooded.drained>0);
 const surfaces=caveWaterSurfaces(flooded);assert.equal(surfaces.length,plan.basins.reduce((sum,b)=>sum+b.tiles.length,0));for(const surface of surfaces){assert.equal(surface.y,caveDepth(flooded,surface.basin));assert.ok(plan.basins[surface.basin].tiles.some(t=>t.x===surface.x&&t.z===surface.z));}
 let pumped=run(command(initial,'repair-pump').state,90);assert.ok(caveRouteOpen(pumped));assert.ok(pumped.pumped>0);assert.ok(caveDepth(pumped,1)<caveDepth(pumped,0));
 pumped=run(command(pumped,'set-pump',undefined,false).state,120);assert.ok(!caveRouteOpen(pumped),'Stopping the pump must permit real reflooding');
 let shut=run(command(initial,'repair-valve').state,220);assert.ok(caveRouteOpen(shut));assert.equal(shut.extracted,0);shut=run(command(shut,'set-source').state,130);assert.ok(!caveRouteOpen(shut));
 const drained=run(command(initial,'clear-drain').state,180);assert.ok(caveRouteOpen(drained));assert.ok(drained.extracted>0&&drained.drained>initial.drained);
 const filled=run(initial,1500);assert.ok(filled.spilled>0);assert.ok(validCaveWater(filled,seed));assert.ok(Math.abs(caveWaterBalance(filled))<1e-7);
});

test('fixed-step conservation, bounded work and JSON resume are deterministic through control changes',()=>{
 const seed=17,base=createCaveWater(seed);let a=base,b=base;
 for(let i=0;i<30;i++){a=advanceCaveWater(a,1);for(let k=0;k<4;k++)b=advanceCaveWater(b,.25);}assert.deepEqual(a,b);
 const split=advanceCaveWater(advanceCaveWater(base,.125),.125);assert.deepEqual(split,advanceCaveWater(base,.25));
 assert.deepEqual(advanceCaveWater(base,1e20),advanceCaveWater(base,1));for(const bad of [0,-1,NaN,Infinity])assert.equal(advanceCaveWater(base,bad),base);
 const partial=advanceCaveWater(base,.1);assert.equal(partial.elapsed,0);assert.equal(partial.remainder,.1);assert.ok(validCaveWater(partial,seed));
 for(let i=0;i<5000;i++){
  if(i===100)a=command(a,'repair-pump').state;if(i===500)a=command(a,'set-pump',undefined,false).state;if(i===1000)a=command(a,'clear-drain').state;if(i===3000)a=command(a,'repair-valve').state;
  a=advanceCaveWater(a,.73);if(i%100===0){assert.ok(validCaveWater(a,seed));assert.ok(Math.abs(caveWaterBalance(a))<1e-7);assert.deepEqual(advanceCaveWater(JSON.parse(JSON.stringify(a)),.43),advanceCaveWater(a,.43));}
 }
 assert.ok(a.volume.every(v=>Number.isFinite(v)&&v>=0));assert.ok(a.remainder<CAVE_WATER_STEP);assert.equal(a.hash,CAVE_WATER_HASH);
});

test('commands enforce cave proximity, life, finite inventory, repair prerequisites and exact non-refundable costs',()=>{
 const seed=3,state=createCaveWater(seed),plan=naturalCave(seed),inventory={scrap:4,core:1,water:2},ctx={inventory,player:plan.anchors.valve,zone:'cave',hp:100};
 for(const patch of [{zone:'valley'},{zone:'dungeon'},{hp:0},{hp:NaN},{player:{x:100,z:100}},{player:{x:NaN,z:0}},{inventory:{scrap:1,core:1,water:2}},{inventory:{scrap:NaN,core:1,water:2}}]){const denied=applyCaveWaterCommand(state,{...ctx,...patch},{type:'repair-valve'});assert.equal(denied.state,state);}
 assert.equal(command(state,'set-source',inventory,false).state,state);assert.equal(command(state,'set-pump',inventory,true).state,state);
 let paid=command(state,'repair-valve',inventory);paid=command(paid.state,'repair-pump',paid.inventory);paid=command(paid.state,'clear-drain',paid.inventory);assert.deepEqual(paid.inventory,{scrap:0,core:0,water:2});assert.deepEqual(caveWaterCost(paid.state),{scrap:4,core:1,water:0});assert.deepEqual(caveWaterCost(undefined),{scrap:0,core:0,water:0});assert.ok(validCaveWater(paid.state,seed));
 assert.equal(command(paid.state,'repair-pump',paid.inventory).state,paid.state);const on=command(paid.state,'set-source',paid.inventory,true);assert.deepEqual(on.inventory,paid.inventory);assert.deepEqual(on.state.playerSpent,paid.state.playerSpent);
 assert.equal(applyCaveWaterCommand(state,ctx,{type:'unknown'} as unknown as CaveWaterCommand).state,state);
});

test('strict present-state validation rejects corrupted versions, ledgers, controls, times and volumes',()=>{
 const seed=73129,initial=createCaveWater(seed),state=run(command(initial,'repair-pump').state,20);assert.ok(validCaveWater(initial,seed));assert.ok(validCaveWater(state,seed));
 for(const patch of [
  {version:2},{hash:'bad'},{seed:seed+1},{initial:state.initial+1},{volume:[-1,0,0]},{volume:[NaN,0,0]},{volume:[0,0]},{volume:[1e9,0,0]},
  {extracted:state.extracted+1},{drained:state.drained+1},{pumped:Infinity},{spilled:-1},{elapsed:.1},{elapsed:Infinity},{remainder:.25},{remainder:-1},
  {valveRepaired:false,sourceOpen:false},{pumpRepaired:false,pumpOn:true},{sourceOpen:'true'},{playerSpent:{scrap:0,core:0,water:0}},
 ])assert.equal(validCaveWater({...state,...patch},seed),false,JSON.stringify(patch));
 for(const value of [null,[],{},undefined])assert.equal(validCaveWater(value,seed),false);
 assert.equal(validCaveWater({...initial,volume:[initial.volume[0]-1,initial.volume[1]+1,initial.volume[2]]},seed),false,'No transferred water may predate any elapsed step');
 assert.equal(validCaveWater({...initial,extracted:1,spilled:1},seed),false,'No external water may predate elapsed time');
});

test('flood activation and malformed save positions return to a safe bank; neither dry return is trapped',()=>{
 const state=createCaveWater(0),plan=naturalCave(0),wet=plan.basins[1].tiles[0]!;
 assert.equal(caveNavigable(state,wet),false);assert.ok(plan.returnAnchors.some(p=>{const safe=safeCavePosition(state,wet);return safe.x===p.x&&safe.z===p.z;}));
 for(const point of plan.returnAnchors){assert.ok(caveNavigable(state,point));assert.equal(safeCavePosition(state,point),point);}
 assert.ok(caveNavigable(state,safeCavePosition(state,{x:999,z:999})));assert.ok(caveNavigable(state,safeCavePosition(state,{x:NaN,z:NaN})));
});
