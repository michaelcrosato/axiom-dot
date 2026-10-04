import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState,serializeSave,applyAction} from '../src/world.ts';
import {createComboState,requestComboAttack,stepCombo,cancelCombo,comboBufferOpen,comboEligibleTargets,comboAttackDuration,sanitizeComboTuning,DEFAULT_COMBO_TUNING,type ComboSnapshot,type ComboState,type ComboEvent,type ComboTuningInput} from '../src/combat.ts';

const snapshot=(patch:Partial<ComboSnapshot>={}):ComboSnapshot=>({player:{x:0,y:0,z:0,facing:0,hp:100},targets:[{id:'front',x:0,y:0,z:2}],obstacles:[],...patch});
const attack=(index=0)=>DEFAULT_COMBO_TUNING.attacks[index]!;
const near=(a:number,b:number,message='')=>assert.ok(Math.abs(a-b)<1e-8,`${message}: ${a} ≠ ${b}`);
function start(s:ComboState=createComboState(),world=snapshot(),tuning:ComboTuningInput=DEFAULT_COMBO_TUNING){return requestComboAttack(s,world,tuning).state;}
function advance(s:ComboState,seconds:number,world=snapshot(),frame=seconds,tuning:ComboTuningInput=DEFAULT_COMBO_TUNING){
 const events:ComboEvent[]=[];let remaining=seconds;
 while(remaining>1e-10){const dt=Math.min(frame,remaining),result=stepCombo(s,dt,world,tuning);s=result.state;events.push(...result.events);remaining-=dt;}
 return {state:s,events};
}
const hits=(events:ComboEvent[])=>events.filter(e=>e.type==='hit');

test('staff uses three distinct telegraphed attacks with 104 total damage and affordable full chain',()=>{
 assert.equal(new Set(DEFAULT_COMBO_TUNING.attacks.map(a=>a.name)).size,3);
 assert.equal(DEFAULT_COMBO_TUNING.attacks.reduce((sum,a)=>sum+a.damage,0),104);
 assert.ok(DEFAULT_COMBO_TUNING.attacks.reduce((sum,a)=>sum+a.staminaCost,0)<DEFAULT_COMBO_TUNING.maxStamina);
 for(const a of DEFAULT_COMBO_TUNING.attacks){assert.ok(a.prep>0&&a.active>0&&a.recovery>0);assert.ok(a.range<=3.5&&a.arc<=Math.PI);}
 const begun=requestComboAttack(createComboState(),snapshot());
 assert.equal(begun.state.phase,'prep');assert.equal(begun.state.stage,1);assert.equal(hits(begun.events).length,0);
 assert.deepEqual(begun.events.map(e=>e.type),['stage','phase']);
 near(begun.state.stamina,100-attack().staminaCost);
});

test('elapsed prep, active, recovery and idle transitions have exact boundaries and whiffs',()=>{
 const world=snapshot({targets:[]}),a=attack();let s=start(createComboState(),world);
 let result=stepCombo(s,a.prep-.001,world);s=result.state;assert.equal(s.phase,'prep');assert.equal(result.events.length,0);
 result=stepCombo(s,.001,world);s=result.state;assert.equal(s.phase,'active');near(s.phaseElapsed,0);assert.equal(hits(result.events).length,0);
 result=stepCombo(s,a.active,world);s=result.state;assert.equal(s.phase,'recovery');assert.equal(result.events.filter(e=>e.type==='whiff').length,1);
 result=stepCombo(s,a.recovery,world);s=result.state;assert.equal(s.phase,'idle');assert.equal(s.stage,0);assert.equal(s.attack,null);assert.equal(s.buffered,false);
 near(s.time,comboAttackDuration(a));
});

test('phase and hit outcomes are frame-rate independent, including coarse frames crossing the whole swing',()=>{
 const a=attack(),duration=comboAttackDuration(a)+1,world=snapshot();
 const variants=[1/240,1/60,1/20,.27,duration].map(frame=>advance(start(),duration,world,frame));
 const expected=variants[0]!;
 for(const result of variants){
  assert.equal(result.state.phase,'idle');near(result.state.time,duration);near(result.state.stamina,expected.state.stamina);
  assert.equal(hits(result.events).length,1);assert.equal(result.events.filter(e=>e.type==='whiff').length,0);
  const contact=hits(result.events)[0]!;near(contact.at,a.prep);assert.equal(contact.damage,24);
  assert.deepEqual(result.events.map(({at,...event})=>event),expected.events.map(({at,...event})=>event));
 }
});

test('zero/negative/non-finite elapsed time cannot advance, hit, or mutate state',()=>{
 const s=start(),world=snapshot();
 for(const dt of [0,-1,NaN,Infinity,-Infinity]){const result=stepCombo(s,dt,world);assert.equal(result.state,s);assert.deepEqual(result.events,[]);}
});

test('button mashing cannot skip preparation, active frames, recovery or reserve multiple attacks',()=>{
 let s=start();const a=attack();
 for(let i=0;i<100;i++){const result=requestComboAttack(s,snapshot());assert.equal(result.state,s);assert.equal(result.events[0]?.type,'rejected');}
 s=stepCombo(s,a.prep,snapshot()).state;assert.equal(s.phase,'active');
 const early=requestComboAttack(s,snapshot());assert.equal(early.state,s);assert.equal(early.events[0]?.type,'rejected');
 s=stepCombo(s,comboAttackDuration(a)-a.prep-.05,snapshot()).state;
 assert.ok(comboBufferOpen(s));const queued=requestComboAttack(s,snapshot());s=queued.state;assert.equal(s.buffered,true);assert.equal(s.stage,1);
 for(let i=0;i<100;i++){const result=requestComboAttack(s,snapshot());assert.equal(result.state,s);}
 s=stepCombo(s,.049,snapshot()).state;assert.equal(s.stage,1);assert.equal(s.phase,'recovery');
 const next=stepCombo(s,.001,snapshot());s=next.state;assert.equal(s.stage,2);assert.equal(s.phase,'prep');near(s.elapsed,0);assert.equal(s.buffered,false);
 near(s.stamina,100-attack(0).staminaCost-attack(1).staminaCost);assert.equal(next.events.filter(e=>e.type==='stage').length,1);
});

test('full buffered 1-2-3 chain has one contact per stage, no fourth combo stage, and resets',()=>{
 let s=start();const all:ComboEvent[]=[];
 for(const stage of [1,2,3]){
  const a=attack(stage-1),result=advance(s,comboAttackDuration(a)-.02,snapshot(),1/60);s=result.state;all.push(...result.events);
  assert.equal(s.stage,stage);const input=requestComboAttack(s,snapshot());
  if(stage<3){assert.equal(input.state.buffered,true);s=input.state;}else{assert.equal(input.state.buffered,false);assert.equal(input.events[0]?.type,'rejected');}
  const finish=stepCombo(s,.02,snapshot());s=finish.state;all.push(...finish.events);
 }
 assert.equal(s.phase,'idle');assert.deepEqual(hits(all).map(e=>e.stage),[1,2,3]);assert.deepEqual(hits(all).map(e=>e.damage),[24,32,48]);
 assert.equal(new Set(hits(all).map(e=>e.attackId)).size,3);assert.equal(start(s).stage,1);assert.equal(start(s).attackId,4);
});

test('missed buffer does not chain and stale early input cannot fire later',()=>{
 let s=start();s=requestComboAttack(s,snapshot()).state;s=stepCombo(s,2,snapshot()).state;
 assert.equal(s.phase,'idle');assert.equal(s.attackId,1);assert.equal(s.buffered,false);assert.equal(start(s).stage,1);
});

test('same target can be hit once per attack but never twice during the active window',()=>{
 const world=snapshot({targets:[{id:'front',x:0,z:2},{id:'front',x:0,z:2},{id:'second',x:.2,z:2}]}),a=attack();
 const first=stepCombo(start(),a.prep,world);assert.deepEqual(hits(first.events).map(e=>e.targetId),['front','second']);
 const repeated=advance(first.state,a.active,world,.001);assert.equal(hits(repeated.events).length,0);assert.equal(repeated.state.hitIds.length,2);
});

test('hits use live authoritative snapshots, including entrants during active frames and departed prep targets',()=>{
 const empty=snapshot({targets:[]}),a=attack();let s=start();
 let result=stepCombo(s,a.prep,empty);s=result.state;assert.equal(hits(result.events).length,0);
 result=stepCombo(s,a.active/2,snapshot());s=result.state;assert.equal(hits(result.events).length,1);
 result=stepCombo(s,a.active/2,snapshot());assert.equal(hits(result.events).length,0);
 s=start();result=stepCombo(s,a.prep,snapshot({targets:[{id:'far',x:0,z:20}]}));assert.equal(hits(result.events).length,0);
});

test('range, front arc, vertical distance, alive state, duplicate IDs and finite coordinates gate hits',()=>{
 const a=attack(),edge=a.arc/2,world=snapshot({targets:[
  {id:'front',x:0,z:2},{id:'behind',x:0,z:-1},{id:'side',x:1,z:0},
  {id:'range-edge',x:0,z:a.range},{id:'far',x:0,z:a.range+.0001},
  {id:'arc-edge',x:Math.sin(edge)*2,z:Math.cos(edge)*2},{id:'arc-out',x:Math.sin(edge+.001)*2,z:Math.cos(edge+.001)*2},
  {id:'upper',x:0,y:10,z:1},{id:'dead',x:0,z:1,alive:false},{id:'nan',x:NaN,z:1},
 ]});
 assert.deepEqual(comboEligibleTargets(world).map(t=>t.id),['front','range-edge','arc-edge']);
 const result=stepCombo(start(),a.prep,world);assert.deepEqual(hits(result.events).map(e=>e.targetId),['front','range-edge','arc-edge']);
});

test('facing is locked for each attack rather than renderer rotation granting a rear hit',()=>{
 const world=snapshot({targets:[{id:'east',x:2,z:0}],player:{x:0,z:0,hp:100,facing:Math.PI/2}}),s=start(createComboState(),world);
 const turned={...world,player:{...world.player,facing:-Math.PI/2}};
 assert.equal(hits(stepCombo(s,attack().prep,turned).events).length,1);
 assert.equal(hits(stepCombo(start(),attack().prep,world).events).length,0);
});

test('solid obstacles occlude accepted hits using actual elevations',()=>{
 const wall={x:0,z:1,hx:1,hz:.1,y:1,hy:1},world=snapshot({obstacles:[wall]});
 assert.equal(hits(stepCombo(start(),1,world).events).length,0);
 const high=snapshot({player:{x:0,y:5,z:0,hp:100,facing:0},targets:[{id:'high',x:0,y:5,z:2}],obstacles:[wall]});
 assert.equal(hits(stepCombo(start(createComboState(),high),1,high).events).length,1);
 const blocked={...high,obstacles:[{...wall,y:6}]};assert.equal(hits(stepCombo(start(createComboState(),blocked),1,blocked).events).length,0);
});

test('auto requests traverse the same stamina, phase, buffer and hit gates as manual input',()=>{
 const world=snapshot(),manual=requestComboAttack(createComboState(),world),auto=requestComboAttack(createComboState(),world,DEFAULT_COMBO_TUNING,'auto');
 const resultManual=stepCombo(manual.state,1,world),resultAuto=stepCombo(auto.state,1,world);
 assert.deepEqual(hits(resultManual.events),hits(resultAuto.events));assert.equal(auto.state.source,'auto');
 assert.equal(requestComboAttack(auto.state,world,DEFAULT_COMBO_TUNING,'auto').state,auto.state);
 const blocked=snapshot({obstacles:[{x:0,z:1,hx:1,hz:.1}]});assert.equal(comboEligibleTargets(blocked).length,0);
});

test('stamina is spent only when an attack starts; exhaustion rejects; idle regeneration is elapsed-time based',()=>{
 const world=snapshot(),low={...createComboState(),stamina:attack().staminaCost-.01};
 assert.equal(requestComboAttack(low,world).state,low);
 let s=start();const spent=s.stamina;s=stepCombo(s,.3,world).state;near(s.stamina,spent);
 const buffered=requestComboAttack(s,world);assert.equal(buffered.state.buffered,true);near(buffered.state.stamina,spent);
 const one=stepCombo({...createComboState(),stamina:0,regenDelay:.4},1,world).state;
 const split=advance({...createComboState(),stamina:0,regenDelay:.4},1,world,1/60).state;
 near(one.stamina,.6*DEFAULT_COMBO_TUNING.staminaRegenPerSecond);near(split.stamina,one.stamina);
 near(stepCombo(one,1000,world).state.stamina,100);
});

test('hitstop and bounded knockback are presentation events, never extra simulation time or duplicate damage',()=>{
 const a=attack(),world=snapshot(),result=stepCombo(start(),comboAttackDuration(a),world),event=hits(result.events)[0]!;
 assert.equal(result.state.phase,'idle');near(result.state.time,comboAttackDuration(a));near(event.hitstopSeconds,a.hitstopSeconds);
 near(Math.hypot(event.knockback.x,event.knockback.z),event.knockback.strength);assert.ok(event.knockback.strength<=1.5);
 const center=snapshot({targets:[{id:'center',x:0,z:0}]});const atCenter=hits(stepCombo(start(),a.prep,center).events)[0]!;
 assert.ok(Number.isFinite(atCenter.knockback.x)&&Number.isFinite(atCenter.knockback.z));
});

test('cancel windows forbid active cancellation and cannot turn early prep cancel into a mash exploit',()=>{
 const world=snapshot(),begun=start(),cancelled=cancelCombo(begun,'dodge');assert.equal(cancelled.state.phase,'idle');assert.equal(cancelled.state.buffered,false);
 near(cancelled.state.stamina,begun.stamina);near(cancelled.state.cancelLockRemaining,comboAttackDuration(attack()));
 assert.equal(requestComboAttack(cancelled.state,world).state,cancelled.state);
 let s=stepCombo(cancelled.state,comboAttackDuration(attack())-.001,world).state;assert.equal(requestComboAttack(s,world).state,s);
 s=stepCombo(s,.001,world).state;assert.equal(requestComboAttack(s,world).state.phase,'prep');
 const active=stepCombo(begun,attack().prep,world).state;assert.equal(cancelCombo(active,'dodge').state,active);
 const late=stepCombo(begun,comboAttackDuration(attack())-.02,world).state;assert.equal(cancelCombo(late,'dodge').state.phase,'idle');
});

test('stun interrupts any attack, clears buffered input, bounds duration and blocks input until recovery',()=>{
 let s=stepCombo(start(),.3,snapshot()).state;s=requestComboAttack(s,snapshot()).state;assert.equal(s.buffered,true);
 const stunned=cancelCombo(s,'stun',DEFAULT_COMBO_TUNING,99);s=stunned.state;assert.equal(s.phase,'stunned');assert.equal(s.stage,0);assert.equal(s.buffered,false);near(s.stunRemaining,2);
 assert.equal(requestComboAttack(s,snapshot()).state,s);const tick=stepCombo(s,1.99,snapshot());s=tick.state;assert.equal(s.phase,'stunned');assert.equal(hits(tick.events).length,0);
 s=stepCombo(s,.01,snapshot()).state;assert.equal(s.phase,'idle');assert.equal(start(s).stage,1);
});

test('dead actors cannot start or finish a hit and reset removes transient attack state',()=>{
 const dead=snapshot({player:{x:0,z:0,facing:0,hp:0}}),s=createComboState();assert.equal(requestComboAttack(s,dead).state,s);
 const result=stepCombo(start(),1,dead);assert.equal(result.state.phase,'idle');assert.equal(hits(result.events).length,0);assert.equal(result.events[0]?.type,'cancel');
 const reset=cancelCombo(start(),'reset').state;assert.equal(reset.phase,'idle');assert.equal(reset.attack,null);assert.equal(reset.buffered,false);assert.equal(reset.cancelLockRemaining,0);
});

test('live tuning is bounded and changing attack sliders cannot bypass latched prep/recovery',()=>{
 const t=sanitizeComboTuning({maxStamina:-1,staminaRegenPerSecond:Infinity,inputBufferSeconds:100,maxStunSeconds:NaN,attacks:[{prep:0,active:NaN,recovery:-1,range:100,arc:100,damage:Infinity,staminaCost:999,knockback:100,hitstopSeconds:100}]});
 assert.equal(t.maxStamina,40);assert.equal(t.attacks[0].prep,.06);assert.equal(t.attacks[0].active,attack().active);assert.equal(t.attacks[0].recovery,.1);assert.equal(t.attacks[0].range,3.5);assert.equal(t.attacks[0].arc,Math.PI);assert.equal(t.attacks[0].staminaCost,40);assert.equal(t.attacks[0].knockback,1.5);assert.equal(t.attacks[0].hitstopSeconds,.12);
 const s=start(),fast={attacks:[{prep:.06,active:.04,recovery:.1}]};const changed=stepCombo(s,.1,snapshot(),fast);
 assert.equal(changed.state.phase,'prep');assert.equal(changed.state.attack?.prep,attack().prep);
});

test('pure combo functions never mutate inputs or campaign state / save bytes',()=>{
 let campaign=createState();campaign=applyAction(campaign,{type:'move',x:5,z:9});const saved=serializeSave(campaign),world=snapshot(),initial=createComboState(),initialJSON=JSON.stringify(initial),worldJSON=JSON.stringify(world);
 const started=requestComboAttack(initial,world);stepCombo(started.state,2,world);cancelCombo(started.state,'stun');
 assert.equal(JSON.stringify(initial),initialJSON);assert.equal(JSON.stringify(world),worldJSON);assert.equal(serializeSave(campaign),saved);
 assert.deepEqual(campaign.defeated,[]);assert.equal('combat' in campaign,false);
});

test('short or repeated stuns cannot remove the original committed recovery lock',()=>{
 const duration=comboAttackDuration(attack());let s=cancelCombo(start(),'stun',DEFAULT_COMBO_TUNING,.05).state;
 s=stepCombo(s,.05,snapshot()).state;assert.equal(s.phase,'idle');near(s.cancelLockRemaining,duration-.05);
 assert.equal(requestComboAttack(s,snapshot()).state,s);
 s=cancelCombo(s,'stun',DEFAULT_COMBO_TUNING,.05).state;s=stepCombo(s,.05,snapshot()).state;near(s.cancelLockRemaining,duration-.1);
 s=stepCombo(s,duration-.1,snapshot()).state;assert.equal(requestComboAttack(s,snapshot()).state.phase,'prep');
});

test('complete 1-2-3 timeline agrees at 20/60/144/240 Hz and coarse phase-crossing steps',()=>{
 function chain(frame:number){
  let s=start();const events:ComboEvent[]=[];
  for(let stage=0;stage<3;stage++){
   const duration=comboAttackDuration(attack(stage));let result=advance(s,duration-.025,snapshot(),frame);s=result.state;events.push(...result.events);
   if(stage<2)s=requestComboAttack(s,snapshot()).state;
   result=advance(s,.025,snapshot(),frame);s=result.state;events.push(...result.events);
  }
  const rest=advance(s,1,snapshot(),frame);events.push(...rest.events);return {state:rest.state,events};
 }
 const expected=chain(1/60);
 for(const dt of [1/20,1/144,1/240,10]){
  const result=chain(dt);near(result.state.time,expected.state.time);near(result.state.stamina,expected.state.stamina);
  assert.equal(result.state.phase,'idle');assert.equal(result.state.attackId,3);
  const contacts=hits(result.events),expectedContacts=hits(expected.events);assert.equal(contacts.length,3);
  contacts.forEach((event,i)=>{near(event.at,expectedContacts[i]!.at);assert.equal(event.damage,expectedContacts[i]!.damage);});
 }
});
