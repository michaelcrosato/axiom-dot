import {test} from 'node:test';import assert from 'node:assert/strict';
import {EQUIPMENT_PARTS,EQUIPMENT_BUDGET,compileCustomEquipment,refitEquipment,assembleEquipment,emptyEquipment} from '../src/equipment.ts';
import {equipmentCombat} from '../src/equipment-combat.ts';

test('every grip/shaft/head composition either fails closed or yields finite, budgeted, bounded stats',()=>{
 let valid=0;
 for(const grip of EQUIPMENT_PARTS.grip)for(const shaft of EQUIPMENT_PARTS.shaft)for(const head of EQUIPMENT_PARTS.head){
  let plan;try{plan=compileCustomEquipment({version:2,seed:7,parts:{grip,shaft,head}});}catch{continue;}
  valid++;
  assert.ok(plan.cost.scrap>=0&&plan.cost.core>=0&&plan.cost.scrap<=EQUIPMENT_BUDGET.scrap&&plan.cost.core<=EQUIPMENT_BUDGET.core);
  assert.ok(Object.values(plan.stats).every(n=>Number.isFinite(n)&&n>0));
  assert.ok(plan.stats.reach<=3.45&&plan.stats.tempo<=1.4&&plan.stats.damageScale<=1.48&&plan.stats.staminaScale<=1.5);
  const tuning=equipmentCombat(plan);
  assert.ok(tuning.attacks.reduce((n,a)=>n+a.staminaCost,0)<=tuning.maxStamina,'a full chain stays affordable from full stamina');
  assert.ok(tuning.attacks.every(a=>a.prep>0&&a.active>0&&a.recovery>0&&a.damage>=1));
 }
 assert.equal(valid,8);
});

test('seeded refit and edited assembly share the same non-finite inventory rejection',()=>{
 for(const bad of [{scrap:Number.NaN,core:1,water:0},{scrap:5,core:Number.POSITIVE_INFINITY,water:0},{scrap:5,core:1,water:-1}]){
  assert.equal(refitEquipment(emptyEquipment(),bad,1),null);
  assert.equal(assembleEquipment(emptyEquipment(),bad,{version:2,seed:1,parts:{grip:'linen',shaft:'reed',head:'prism'}}),null);
 }
 const ok=refitEquipment(emptyEquipment(),{scrap:5,core:1,water:0},1)!;
 assert.ok(ok.inventory.scrap>=0&&ok.inventory.core>=0);
 assert.deepEqual(refitEquipment(ok.equipment,ok.inventory,null)!.inventory,{scrap:5,core:1,water:0});
});
