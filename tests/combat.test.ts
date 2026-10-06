import {WORKSHOP_CONSTRUCTION_VIEW_ENGINE} from '../src/workshop-construction-view.ts';
import {resolveWildernessStrikes} from '../src/wilderness-combat.ts';
import * as guardModel from '../src/guard.ts';import {createGuardView} from '../src/guard-view.ts';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createState,applyAction,activeObjects} from '../src/world.ts';
import {clearPulsePath,pulseTargets,autoPulseReady,PULSE_COOLDOWN} from '../src/combat.ts';
import {generateDungeon} from '../src/dungeon.ts';
test('manual and automatic pulse target selection share alive, distance, defeated and wall checks',()=>{
 let s=createState(73129);s=applyAction(s,{type:'move',x:5,z:9});const objects=activeObjects(s);
 assert.deepEqual(pulseTargets(s,objects,[]).map(o=>o.id),['sentry-1']);
 assert.deepEqual(pulseTargets(s,objects,[{x:5,z:10,hx:2,hz:.12}]),[]);
 assert.deepEqual(pulseTargets({...s,player:{...s.player,hp:0}},objects,[]),[]);
 assert.deepEqual(pulseTargets(applyAction(s,{type:'attack',id:'sentry-1'}),objects,[]),[]);
 assert.deepEqual(pulseTargets(applyAction(s,{type:'move',x:5,z:8.49}),objects,[]),[]);
 assert.equal(pulseTargets(applyAction(s,{type:'move',x:5,z:8.5}),objects,[]).length,1);
});
test('pulse line-of-sight rejects solid walls including endpoints but permits routes around a box',()=>{
 const walls=[{x:0,z:0,hx:1,hz:1}];
 assert.equal(clearPulsePath({x:-3,z:0},{x:3,z:0},walls),false);
 assert.equal(clearPulsePath({x:0,z:-3},{x:0,z:3},walls),false);
 assert.equal(clearPulsePath({x:-3,z:2},{x:3,z:2},walls),true);
 assert.equal(clearPulsePath({x:-3,z:-3},{x:3,z:3},walls),false);
 assert.equal(clearPulsePath({x:0,z:0},{x:3,z:3},walls),false);
 for(const seed of [1,73129]){const d=generateDungeon(seed);const enemy=d.objects.find(o=>o.kind==='enemy')!;const s={...createState(seed),zone:'dungeon' as const,player:{x:enemy.x,z:enemy.z+3,hp:100}};assert.ok(pulseTargets(s,d.objects,d.walls).some(o=>o.id===enemy.id));}
});
test('automatic pulse requires touch mode, enabled preference, active world, ready cooldown and a valid target',()=>{
 assert.equal(autoPulseReady(true,true,true,0,1),true);
 for(const args of [[false,true,true,0,1],[true,false,true,0,1],[true,true,false,0,1],[true,true,true,PULSE_COOLDOWN,1],[true,true,true,0,0]] as const)assert.equal(autoPulseReady(...args),false);
});

import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
import * as combat from '../src/combat.ts';import {equipmentFor} from '../src/equipment.ts';import {equipmentCombat} from '../src/equipment-combat.ts';import {DEFAULT_TUNING} from '../src/tuning.ts';
function combatHarness(){
 const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
 const handlers=main.slice(main.indexOf('let combo=createComboState()'),main.indexOf('function updateContextControls()'));
 const source=`let gripping=false;function contactBusy(){return gripping;}function contactEnabled(){return false;}let physicsReady=true,transitioning=false,windowActive=true,pulseTime=0,inputMode='touch',mobileAutoPulse=true,labActive=false,labRunning=false,labUnlimitedStamina=false,labInfiniteTargets=false,labAutoCombo=false,labMetrics=null,labTargets=[],labTuning=DEFAULT_TUNING,reducedMotion=false;const coop={active:false,canAct:true,setSuspended(){}},coopPending=false;let coopCancelAttack=-1;const scene={add(){}};const gameAudio={cue(){}},wildernessView={hit(){}};const animation={heading:0},physicsMotion={crouched:false,grounded:true,stance:0},targetPosition={...state.player,y:0};const character={update(){}};let avatarAction=null;const panel={hidden:true},document={hidden:false},obstacles=[],streamer={active:new Map()},cellObstacles=new Map(),dungeon={walls:[]};const player={position:state.player};const pulse={visible:false,position:{set(){}},scale:{setScalar(){}},material:{opacity:0}};let saves=0;function sync(){};function persist(){saves++};function toast(){};function machineWorldObstacles(){return []};${handlers};return {attack,step(ticks=1){for(let i=0;i<ticks;i++)if(panel.hidden&&!transitioning&&physicsReady&&!document.hidden&&windowActive)stepCombat();},set(name,value){if(name==='contact')gripping=value;else if(name==='stance')physicsMotion.stance=value;else if(name==='crouched')physicsMotion.crouched=value;else if(name==='grounded')physicsMotion.grounded=value;else if(name==='touch')inputMode=value?'touch':'desktop';else if(name==='enabled')mobileAutoPulse=value;else if(name==='panel')panel.hidden=!value;else if(name==='hidden')document.hidden=value;else if(name==='focus')windowActive=value;else if(name==='ready')physicsReady=value;else if(name==='transition')transitioning=value;else if(name==='wall')obstacles.splice(0,obstacles.length,...value);else if(name==='state')state=value;},read(){return {state,combo,saves}},buffer(){return comboBufferOpen(combo)}};`;
 const s=applyAction(createState(73129),{type:'move',x:5,z:9.5});const deps={WORKSHOP_CONSTRUCTION_VIEW_ENGINE,workshopProjection:new WORKSHOP_CONSTRUCTION_VIEW_ENGINE.Projection(),resolveWildernessStrikes,...combat,...guardModel,createGuardView,DEFAULT_TUNING,applyAction,equipmentFor,equipmentCombat};return new Function('state','objects',...Object.keys(deps),stripTypeScriptTypes(`function harnessBody(){const activeConversation=null;${source}}`,{mode:'strip'})+'\nreturn harnessBody();')(s,activeObjects(s),...Object.values(deps));
}
test('production combo and fixed-step handler share pause gates and exactly-once saved defeat',()=>{
 for(const [name,value] of [['panel',true],['hidden',true],['focus',false],['ready',false],['transition',true],['contact',true]] as const){const h=combatHarness();h.set(name,value);h.attack();h.step(120);assert.equal(h.read().combo.attackId,0,name);assert.deepEqual(h.read().state.defeated,[]);}
 const h=combatHarness();h.step(10);assert.equal(h.read().saves,0,'preparation is not an instant defeat');h.step(140);assert.equal(h.read().saves,1);assert.deepEqual(h.read().state.defeated,['sentry-1']);assert.ok(h.read().combo.attackId>=3);h.step(200);assert.equal(h.read().saves,1,'defeat persists once');
});
test('production auto combo is touch-only, optional and cannot hit through movement geometry',()=>{
 for(const [name,value] of [['touch',false],['enabled',false]] as const){const h=combatHarness();h.set(name,value);h.step(10);assert.equal(h.read().combo.attackId,0);h.attack();for(let i=0;i<180;i++){h.step();if(h.buffer())h.attack();}assert.equal(h.read().saves,1);}
 const h=combatHarness();h.set('wall',[{x:5,z:10,hx:2,hz:.12}]);h.step(120);assert.equal(h.read().combo.attackId,0);h.attack();h.step(100);assert.equal(h.read().saves,0);assert.deepEqual(h.read().state.defeated,[]);
 const dead=combatHarness();dead.set('state',{...createState(73129),player:{x:5,z:9,hp:0}});dead.attack();dead.step(120);assert.equal(dead.read().combo.attackId,0);
});
test('elevated pulse segments use actual world heights instead of the legacy one-metre plane',()=>{
 const from={x:0,y:5,z:0},to={x:0,y:5,z:3};assert.equal(clearPulsePath(from,to,[{x:0,y:1,z:1.5,hx:2,hy:1,hz:.1}]),true);assert.equal(clearPulsePath(from,to,[{x:0,y:6,z:1.5,hx:2,hy:1,hz:.1}]),false);assert.equal(clearPulsePath(from,to,[{x:0,y:8,z:1.5,hx:2,hy:.1,hz:.1}]),true);
});

test('integrated jump and crouch cannot bypass committed attack recovery by posing as death',()=>{
 for(const [key,blocked,unblocked] of [['crouched',true,false],['grounded',false,true],['stance',.1,0]] as const){
  const h=combatHarness();h.set('enabled',false);h.attack();h.step(10);assert.equal(h.read().combo.phase,'active');const id=h.read().combo.attackId;h.set(key,blocked);h.step(2);h.set(key,unblocked);h.attack();assert.equal(h.read().combo.attackId,id,'active stance interruption retains original attack');h.step(30);h.attack();assert.equal(h.read().combo.attackId,id+1,'new strike only after recovery');
  const early=combatHarness();early.set('enabled',false);early.attack();early.set(key,blocked);early.step();assert.ok(early.read().combo.cancelLockRemaining>0);early.set(key,unblocked);early.attack();assert.equal(early.read().combo.attackId,1,'early cancel retains attack lock');early.step(40);early.attack();assert.equal(early.read().combo.attackId,2);
 }
});
