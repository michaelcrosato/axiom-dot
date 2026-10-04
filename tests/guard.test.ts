import test from 'node:test';
import assert from 'node:assert/strict';
import {createComboState,requestComboAttack,stepCombo,type ComboSnapshot} from '../src/combat.ts';
import {createGuardState,DEFAULT_GUARD_RECIPE,guardDuration,requestGuard,stepGuard,interruptGuard,resolveGuardContact,validGuardState,validGuardRecipe,type GuardContext} from '../src/guard.ts';
import {resolveGuardDamage} from '../src/guard-resolution.ts';
import {createEncounters} from '../src/encounters.ts';
import {guardFieldPoints,guardAudioCue,guardStatusText,createGuardView} from '../src/guard-view.ts';
import {action} from '../server/coop-validation.ts';
const context:GuardContext={player:{x:0,y:0,z:0,facing:0,hp:100,grounded:true,crouched:false},playing:true,obstacles:[]};
const comboContext:ComboSnapshot={player:context.player,targets:[],obstacles:[]};
const contact={enemyId:'sentry-1',attackId:1,source:{x:0,y:0,z:2},damage:12};
const cast=()=>requestGuard(createGuardState(),createComboState(),context,'guard-one');
const active=()=>stepGuard(cast().state,.12,context).state;
test('immutable versioned guard recipe matches visible boundary and rejects forged rule fields',()=>{
 assert(Object.isFrozen(DEFAULT_GUARD_RECIPE));assert(validGuardRecipe(DEFAULT_GUARD_RECIPE));
 assert(!validGuardRecipe({...DEFAULT_GUARD_RECIPE,active:Infinity}));assert(!validGuardRecipe({...DEFAULT_GUARD_RECIPE,invincible:true}));
 const points=guardFieldPoints();assert.equal(points.length,33);for(const p of points)assert(Math.abs(Math.hypot(p.x,p.z)-2.4)<1e-10);
 assert(Math.abs(Math.atan2(points[0]!.x,points[0]!.z)+Math.PI/3)<1e-10);
 assert(guardFieldPoints(DEFAULT_GUARD_RECIPE,Infinity).length<=65);
});
test('guard charges only combo stamina and locks attacks through the original commitment',()=>{
 let g=cast();assert.equal(g.combo.stamina,78);assert.equal(g.state.phase,'windup');assert.equal(g.combo.cancelLockRemaining,guardDuration(DEFAULT_GUARD_RECIPE));
 assert.equal(requestComboAttack(g.combo,comboContext).events[0]?.type,'rejected');
 let c=stepCombo(g.combo,.72,comboContext).state;assert.equal(c.stamina,78,'no regeneration while guarding');
 c=stepCombo(c,.65,comboContext).state;assert.equal(c.stamina,78,'normal regen delay still applies after guard');
 c=stepCombo(c,.1,comboContext).state;assert(Math.abs(c.stamina-80.4)<1e-8);
 const duplicate=requestGuard(g.state,g.combo,context,'guard-one');assert.equal(duplicate.state,g.state);assert.equal(duplicate.combo,g.combo);assert.deepEqual(duplicate.events,[]);
 const attack=requestComboAttack(createComboState(),comboContext);assert.equal(requestGuard(createGuardState(),attack.state,context,'during-combo').state.receipt?.reason,'busy');
});
test('windup/active/recovery boundaries are exact across coarse and fixed steps',()=>{
 let s=cast().state;assert.equal(resolveGuardContact(s,context,contact).blocked,false);
 s=stepGuard(s,.119,context).state;assert.equal(s.phase,'windup');s=stepGuard(s,.001,context).state;assert.equal(s.phase,'active');
 s=stepGuard(s,.22,context).state;assert.equal(s.phase,'recovery');assert.equal(resolveGuardContact(s,context,contact).blocked,false);
 s=stepGuard(s,.38,context).state;assert.equal(s.phase,'idle');assert(Math.abs(s.cooldownRemaining-1.15)<1e-8);
 let fixed=cast().state;for(let i=0;i<60;i++)fixed=stepGuard(fixed,1/60,context).state;
 const coarse=stepGuard(cast().state,1,context).state;assert.equal(fixed.phase,coarse.phase);assert(Math.abs(fixed.cooldownRemaining-coarse.cooldownRemaining)<1e-8);
 assert.equal(stepGuard(coarse,NaN,context).state,coarse);assert.equal(stepGuard(coarse,100,context).state,coarse);
 const ready=stepGuard(stepGuard(cast().state,1,context).state,.87,context).state;assert.equal(ready.cooldownRemaining,0);assert.equal(requestGuard(ready,createComboState(),context,'again').state.phase,'windup');
});
test('one locked front arc contact is blocked; second or mistimed contacts still damage',()=>{
 const s=active(),first=resolveGuardContact(s,context,contact);assert(first.blocked);assert.equal(first.damage,0);assert(first.state.spent);assert.equal(first.state.lastBlock?.id,1);
 const second=resolveGuardContact(first.state,context,{...contact,enemyId:'sentry-2'});assert(!second.blocked);assert.equal(second.damage,12);
 assert(resolveGuardContact(s,{...context,player:{...context.player,facing:Math.PI}},contact).blocked,'turning does not rotate committed front arc');
 for(const source of [{x:0,y:0,z:-2},{x:2,y:0,z:0},{x:0,y:0,z:2.401},{x:0,y:.851,z:1}])assert.equal(resolveGuardContact(s,context,{...contact,source}).blocked,false);
 assert(!resolveGuardContact(s,{...context,obstacles:[{x:0,z:1,hx:1,hz:.1}]},contact).blocked);
 assert(resolveGuardContact(s,context,{...contact,source:{x:Math.sin(Math.PI/3)*2,y:0,z:Math.cos(Math.PI/3)*2}}).blocked);
});
test('invalid states, depleted stamina, movement and menus cannot cast or claim a contact',()=>{
 for(const [change,reason]of [[{hp:0},'dead'],[{grounded:false},'airborne'],[{crouched:true},'crouched'],[{x:NaN},'invalid']] as const){
  const c={...context,player:{...context.player,...change}},result=requestGuard(createGuardState(),createComboState(),c,'rejected');assert.equal(result.state.receipt?.reason,reason);assert.equal(result.combo.stamina,100);assert(!resolveGuardContact(active(),c,contact).blocked);
 }
 assert.equal(requestGuard(createGuardState(),{...createComboState(),stamina:21.99},context,'empty').state.receipt?.reason,'stamina');
 assert.equal(requestGuard(createGuardState(),createComboState(),{...context,playing:false},'menu').state.receipt?.reason,'paused');
 assert.equal(requestGuard(createGuardState(),createComboState(),context,'').state.receipt,null);
 assert.equal(requestGuard(createGuardState(),createComboState(),context,'x',{...DEFAULT_GUARD_RECIPE,range:100}).state.receipt?.reason,'invalid');
});
test('all interrupts retain cooldown, spent stamina and receipts without granting a block',()=>{
 for(const reason of ['jump','crouch','damage','dead','menu','zone','session','pause'] as const){const start=cast(),end=interruptGuard(start.state,reason);assert.equal(end.state.phase,'idle');assert.equal(end.state.cooldownRemaining,start.state.cooldownRemaining);assert.equal(end.state.receipt,start.state.receipt);assert.equal(start.combo.stamina,78);assert.equal(end.state.lastBlock,null);assert(!resolveGuardContact(end.state,context,contact).blocked);assert(validGuardState(end.state));}
 const paused=stepGuard(active(),.5,{...context,playing:false});assert.equal(paused.state.phase,'idle');assert.equal(paused.state.time,.12);assert.equal(paused.state.cooldownRemaining,active().cooldownRemaining);
 const jumped=stepGuard(active(),1/60,{...context,player:{...context.player,grounded:false}});assert.equal(jumped.state.phase,'idle');assert.equal(jumped.events[0]?.type,'interrupted');
});
test('shared authoritative sentry adapter blocks correct identity once and preserves damage failures',()=>{
 const enemy={...createEncounters([{id:'sentry-1',x:0,z:2,zone:'valley'}]).enemies[0]!,attackId:1,phase:'strike' as const,heading:Math.PI};
 const event={type:'damage' as const,enemyId:enemy.id,attackId:1,playerId:'self',damage:12};
 const result=resolveGuardDamage(active(),context,event,enemy);assert(result.blocked);assert.equal(result.damage,0);
 const again=resolveGuardDamage(result.guard,context,event,enemy);assert(!again.blocked);assert.equal(again.damage,12);assert.equal(again.guard.phase,'idle');
 const missed=resolveGuardDamage(cast().state,context,event,enemy);assert.equal(missed.damage,12);assert.equal(missed.guard.phase,'idle');
 assert.equal(resolveGuardDamage(active(),context,event,{...enemy,attackId:2}).blocked,false);
 assert.equal(resolveGuardDamage(active(),context,event,{...enemy,phase:'recover'}).blocked,true,'last strike tick may already have entered recovery');
});
test('optional stored guard state has strict schema, phases and finite limits',()=>{
 const values=[createGuardState(),cast().state,active(),stepGuard(active(),.22,context).state,resolveGuardContact(active(),context,contact).state];for(const s of values)assert(validGuardState(JSON.parse(JSON.stringify(s))),JSON.stringify(s));
 for(const bad of [{...active(),unexpected:1},{...active(),elapsed:NaN},{...active(),phase:'idle'},{...active(),recipe:{...DEFAULT_GUARD_RECIPE,staminaCost:0}},{...active(),cooldownRemaining:Infinity},{...active(),spent:'true'},{...active(),receipt:{intentId:'x',status:'accepted',castId:1,reason:'stamina'}}])assert(!validGuardState(bad));
});
test('protocol accepts only intent/cancel; no client damage, recipe, time or protection claims',()=>{
 assert.deepEqual(action({type:'guard-press',intentId:'valid_1'}),{type:'guard-press',intentId:'valid_1'});assert(action({type:'guard-cancel'}));
 for(const bad of [{type:'guard-press',intentId:'x',damage:0},{type:'guard-press',intentId:'x',active:true},{type:'guard-press',intentId:'x',recipe:DEFAULT_GUARD_RECIPE},{type:'guard-press',intentId:'x',at:1},{type:'guard-press',intentId:'a'.repeat(65)},{type:'guard-cancel',cooldown:0},{type:'guard-block',enemyId:'sentry-1'}])assert.equal(action(bad),null);
});
test('production presentation shares recipe, distinguishes phases and disposes owned GPU resources',()=>{
 const view=createGuardView();view.update(active(),{x:3,y:1,z:4});assert(view.root.visible);assert.equal(view.root.position.x,3);assert.equal(view.root.children.length,3);
 view.update(createGuardState(),{x:0,y:0,z:0});assert.equal(view.root.visible,false);view.dispose();
 assert.match(guardStatusText(active(),78,true),/awaiting authority/);assert.match(guardStatusText(active(),78),/one front strike/);assert.match(guardStatusText(createGuardState(),10),/22 stamina/);
 assert.equal(guardAudioCue(cast().events[0]!), 'guard-windup');assert.equal(guardAudioCue(resolveGuardContact(active(),context,contact).events[0]!), 'guard-block');
});

import {confirmedGuardView,guardSnapshotEvents} from '../src/guard-view.ts';
import {guardReviewStates,guardSystemChecks,GUARD_VISUAL_FIXTURES} from '../src/guard-fixtures.ts';
test('confirmed online cast projects across skipped poll phases and expires; durable receipts sound once',()=>{
 assert.equal(confirmedGuardView(cast().state,.2).phase,'active');assert.equal(confirmedGuardView(cast().state,1).phase,'idle');assert.equal(cast().state.phase,'windup');assert.equal(confirmedGuardView(active(),.1).phase,'active');assert.equal(confirmedGuardView(active(),.22).phase,'recovery');
 const blocked=resolveGuardContact(active(),context,contact).state;assert.equal(guardSnapshotEvents(active(),blocked).filter(e=>e.type==='blocked').length,1);assert.deepEqual(guardSnapshotEvents(blocked,blocked),[]);assert.deepEqual(guardSnapshotEvents(null,blocked),[]);
});
test('isolated review fixtures use real sentry/guard production steps and keep failures honest',()=>{
 const first=guardReviewStates(),again=guardReviewStates();assert.deepEqual(first,again);assert.equal(GUARD_VISUAL_FIXTURES.length,6);assert.equal(first.states['guard-blocked'].hp,100);assert.equal(first.states['guard-rear'].hp,88);assert.equal(first.states['guard-too-early'].hp,88);assert.equal(first.states['guard-windup'].combo.stamina,78);assert(guardSystemChecks().every(c=>c.pass));
});

import {createState,applyAction,enableEncounters,serializeSave} from '../src/world.ts';
import {stepGuardedWorldEncounters} from '../src/guard-resolution.ts';
test('solo fixed-step adapter uses same real contact and filters only blocked hurt events',()=>{
 const source=enableEncounters(applyAction(createState(173),{type:'move',x:5,z:10})),original=serializeSave(source);let world=source,g=createGuardState(),combo=createComboState(),blocks=0,hurt=0;
 for(let i=0;i<70;i++){
  const c:GuardContext={...context,player:{...context.player,...world.player,y:0}};
  if(i===33){const pressed=requestGuard(g,combo,c,'solo-guard');g=pressed.state;combo=pressed.combo;}
  const step=stepGuardedWorldEncounters(world,g,c);world=step.state;g=step.guard;blocks+=step.guardEvents.filter(e=>e.type==='blocked').length;hurt+=step.events.filter(e=>e.type==='damage').length;
  combo=stepCombo(combo,1/60,{player:{...c.player},targets:[],obstacles:[]}).state;
 }
 assert.equal(world.player.hp,100);assert.equal(blocks,1);assert.equal(hurt,0);assert.equal(combo.stamina,78);assert.equal(serializeSave(source),original,'fixture source remains immutable');assert(world.encounters!.enemies.find(e=>e.id==='sentry-1')!.hitIds.includes('solo'),'blocked contact is consumed by enemy authority');
});

test('room guard validation rejects impossible pre-cast cooldown and missing accepted history',()=>{assert.equal(validGuardState({...createGuardState(),cooldownRemaining:1}),false);assert.equal(validGuardState({...createGuardState(),castId:1}),false);});

import {guardPoseFromState} from '../src/avatar-combat.ts';
test('confirmed presentation clock decays guard block recoil between server polls without changing authority',()=>{
 const blocked=resolveGuardContact(active(),context,contact).state,before=structuredClone(blocked);
 const first=guardPoseFromState(confirmedGuardView(blocked,0)),peak=guardPoseFromState(confirmedGuardView(blocked,.11)),settled=guardPoseFromState(confirmedGuardView(blocked,.23));
 assert.equal(first?.impact,0);assert.ok((peak?.impact??0)>.999);assert.equal(settled?.impact,0);assert.deepEqual(blocked,before);
 assert.ok(Number.isFinite(confirmedGuardView(blocked,Infinity).time));
});
