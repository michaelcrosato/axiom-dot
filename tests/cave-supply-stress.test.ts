import test from 'node:test';
import assert from 'node:assert/strict';
import {createCaveWater,applyCaveWaterCommand} from '../src/cave-water.ts';
import {naturalCave} from '../src/natural-cave.ts';
import {createCaveSupply,applyCaveSupplyCommand,advanceCaveSettlement,caveSupplyContext,validCaveSupply,caveSettlementWaterBalance} from '../src/cave-supply.ts';
import {createCausalState,reconcileCausal,causalPlan,validCausal} from '../src/causal.ts';
test('eight-hour mixed cave/intake replay keeps bounded receipt rounding and conservation',()=>{
const seed=73129,plan=causalPlan(seed),inventory={scrap:8,core:2,water:0},ctx={seed,defeated:plan.threats.map(t=>t.id),inventory,player:{x:0,z:0,hp:100},zone:'cave',networkOverflow:0,networkWorking:false,recoverableScrap:8,recoverableCore:2,recoverableWater:0,historicalPumpRepaired:true};
let cave=createCaveWater(seed);cave=applyCaveWaterCommand(cave,{inventory,player:naturalCave(seed).anchors.pump,zone:'cave',hp:100},{type:'repair-pump'}).state;
let supply=createCaveSupply(seed,cave);supply=applyCaveSupplyCommand(supply,cave,{inventory,player:naturalCave(seed).anchors.drain,zone:'cave',hp:100},{type:'connect-outfall'}).state;
let causal=reconcileCausal(createCausalState(seed,true),ctx),maxCross=0,maxInternal=0,maxCombined=0,firstInvalid=null;
for(let i=0;i<28800;i++){({cave,supply,causal}=advanceCaveSettlement(cave,supply,causal,ctx,1));if(i%100===0){const r=causal.caveReceipts;maxCross=Math.max(maxCross,Math.abs(r.received-(supply.pumped.captured+supply.drained.captured)*1000));maxInternal=Math.max(maxInternal,Math.abs(r.received-r.depot-r.carriers.reduce((n,a)=>n+a.litres,0)-r.households.reduce((n,s)=>n+s.litres,0)));maxCombined=Math.max(maxCombined,Math.abs(caveSettlementWaterBalance(cave,causal)));if(!validCausal(causal,{...ctx,caveSupply:caveSupplyContext(supply,cave)})&&!firstInvalid)firstInvalid=i;}}
const metrics={seconds:causal.elapsed,received:causal.caveReceipts.received,maxCross,maxInternal,maxCombined,firstInvalid,validBridge:validCaveSupply(supply,seed,cave),validCausal:validCausal(causal,{...ctx,caveSupply:caveSupplyContext(supply,cave)})};
assert.equal(firstInvalid,null);assert.ok(metrics.validBridge&&metrics.validCausal);assert.ok(maxCross<1e-7);assert.ok(maxInternal<1e-7);assert.ok(maxCombined<1e-5);assert.ok(metrics.received>100);
});
