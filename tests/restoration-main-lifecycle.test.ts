import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {mainFunction} from './helpers/main-source.ts';
import {RestorationPractice,RESTORATION_PRACTICE_SPAWN} from '../src/restoration-practice.ts';
import {createComboState,requestComboAttack,stepCombo,type ComboSnapshot} from '../src/combat.ts';
import {createGuardState,requestGuard,stepGuard,type GuardContext} from '../src/guard.ts';
import {createRegionalState,serializeSave} from '../src/world.ts';
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const context:GuardContext={player:{...RESTORATION_PRACTICE_SPAWN,facing:0,hp:70,grounded:true,crouched:false},playing:true,obstacles:[]},snapshot:ComboSnapshot={player:context.player,targets:[],obstacles:[]};
function harness(mode:'attack'|'guard'){
 const practice=new RestorationPractice(73129,'dispatch-test'),base=createComboState(),cast=requestGuard(createGuardState(),base,context,'practice-guard');
 const initialGuard=mode==='guard'?cast.state:createGuardState(),initialCombo=mode==='guard'?cast.combo:requestComboAttack(base,snapshot).state;
 const source=`let restorationPractice=practice,guard=initialGuard,combo=initialCombo;const guardContext=()=>context,consumeGuardEvents=()=>{};function stepCombat(){combo=stepCombo(combo,1/60,snapshot).state;}${mainFunction(main,'tickLab')}return {tickLab,read:()=>({guard,combo})};`;
 return {practice,api:new Function('practice','initialGuard','initialCombo','context','snapshot','stepGuard','stepCombo',stripTypeScriptTypes('function body(){'+source+'}',{mode:'strip'})+';return body();')(practice,initialGuard,initialCombo,context,snapshot,stepGuard,stepCombo)};
}
for(const mode of ['attack','guard'] as const)test(`actual main restoration practice advances ${mode} commitment to completion without changing campaign`,()=>{
 const campaign=createRegionalState(73129),bytes=serializeSave(campaign),{practice,api}=harness(mode);assert.notEqual(mode==='guard'?api.read().guard.phase:api.read().combo.phase,'idle');
 for(let step=1;step<=240;step++)api.tickLab({step,x:RESTORATION_PRACTICE_SPAWN.x,z:RESTORATION_PRACTICE_SPAWN.z,feetY:0,vx:0,vz:0,vy:0,grounded:true,crouched:false,sliding:false,stance:0});
 assert.equal(api.read().guard.phase,'idle');assert.equal(api.read().combo.phase,'idle');assert.equal(practice.steps,240);assert.equal(serializeSave(campaign),bytes);assert.deepEqual(practice.inventory,{scrap:16,core:1,water:2});
});
