import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import * as THREE from 'three/webgpu';
import {LIVE_SENTRY_ARENA,LIVE_SENTRY_CASE_ID,LIVE_SENTRY_STEP,createLiveSentryPractice,resetLiveSentryPractice,resumeLiveSentryPractice,stepLiveSentryPractice,requestLiveSentryAttack,requestLiveSentryGuard,cancelLiveSentryAction,suspendLiveSentryPractice,disableLiveSentryPractice,liveSentrySnapshot,type LivePracticeState,type LivePracticeFrame,type LivePracticePose,type LivePracticeResult} from '../src/live-sentry-practice.ts';
import {LAB_CASES,LAB_OBSTACLES} from '../src/dev-lab.ts';
import {createComboState,stepCombo,comboBufferOpen,DEFAULT_COMBO_TUNING,type ComboEvent} from '../src/combat.ts';
import {createGuardState,requestGuard,stepGuard,guardDuration,DEFAULT_GUARD_RECIPE} from '../src/guard.ts';
import {advanceEncounters,createEncounters,hitEncounter,ENEMY_RULES} from '../src/encounters.ts';
import {resolveGuardDamage} from '../src/guard-resolution.ts';
import {createConnectedState,serializeSave,parseSave} from '../src/world.ts';
import {createQuadruped} from '../src/creature-view.ts';

const ground:LivePracticePose={x:8,z:5.5,feetY:0,facing:0,grounded:true,crouched:false,stance:0};
function frame(s:LivePracticeState,patch:Partial<LivePracticeFrame>={}):LivePracticeFrame{return {...ground,...s.pose,epoch:s.epoch,step:(s.lastStep??0)+1,...patch};}
function active(p:Partial<LivePracticePose>={}){const s=createLiveSentryPractice({seed:73129,epoch:1});return resumeLiveSentryPractice(s,{...ground,...p,epoch:1,step:0}).state;}
function ticks(s:LivePracticeState,n:number,p:Partial<LivePracticePose>={}){const results:LivePracticeResult[]=[];for(let i=0;i<n;i++){const r=stepLiveSentryPractice(s,frame(s,p));results.push(r);s=r.state;}return {state:s,results};}
function until(s:LivePracticeState,predicate:(s:LivePracticeState)=>boolean,max=250){for(let i=0;i<max;i++){if(predicate(s))return s;s=stepLiveSentryPractice(s,frame(s)).state;}throw new Error('Expected practice state not reached');}
const contacts=(r:LivePracticeResult[])=>r.flatMap(v=>v.contacts);

test('one disposable arena preserves original nine courses and cannot save or reward a campaign',()=>{
 assert.equal(LIVE_SENTRY_CASE_ID,'live-sentry');assert.deepEqual(LIVE_SENTRY_ARENA.player,{x:8,y:0,z:5.5,facing:0});assert.deepEqual(LIVE_SENTRY_ARENA.enemy,{id:'lab-live-sentry',x:8,y:0,z:8,zone:'lab-live-sentry'});
 assert.equal(LAB_CASES.length,9);assert(!LAB_CASES.some(c=>c.id===LIVE_SENTRY_CASE_ID));
 const source=createConnectedState(73129),bytes=serializeSave(source),s=active(),view=liveSentrySnapshot(s);
 assert.equal(parseSave(JSON.stringify(s)),null);assert.equal(s.encounters.enemies.length,1);assert.equal(view.collision.radius,ENEMY_RULES.radius);
 assert.equal('inventory' in s,false);assert.equal('defeated' in s,false);assert.equal('campaign' in s,false);
 ticks(s,100);assert.equal(serializeSave(source),bytes);assert.equal(JSON.stringify(s),JSON.stringify(active()),'earlier state is never mutated');
 const own=readFileSync(new URL('../src/live-sentry-practice.ts',import.meta.url),'utf8');assert.doesNotMatch(own,/localStorage|serializeSave|applyAction|commitEncounterHit|persist\(/);
});

test('independent production contracts match every warning, contact, recovery, stamina and guard tick',()=>{
 let s=active(),enemies=createEncounters([LIVE_SENTRY_ARENA.enemy]),guard=createGuardState(),combo=createComboState(),hp=100;
 let blocks=0;const phases=new Set<string>();
 for(let tick=0;tick<100;tick++){
  const p={x:ground.x,y:ground.feetY,z:ground.z,facing:0,hp,grounded:true,crouched:false},c={player:p,playing:true,obstacles:LAB_OBSTACLES};
  if(tick===45){s=requestLiveSentryGuard(s,'timed').state;const g=requestGuard(guard,combo,c,'timed');guard=g.state;combo=g.combo;}
  guard=stepGuard(guard,LIVE_SENTRY_STEP,c).state;
  const r=advanceEncounters(enemies,LIVE_SENTRY_STEP,{zone:LIVE_SENTRY_ARENA.enemy.zone,players:[{id:'lab-live-player',...p}],height:()=>0,obstacles:LAB_OBSTACLES,defeated:[]});enemies=r.state;
  for(const event of r.events)if(event.type==='damage'){const hit=resolveGuardDamage(guard,c,event,enemies.enemies[0]);assert(hit.blocked);guard=hit.guard;hp-=hit.damage;blocks++;}
  combo=stepCombo(combo,LIVE_SENTRY_STEP,{player:p,targets:[],obstacles:LAB_OBSTACLES}).state;
  const got=stepLiveSentryPractice(s,frame(s));s=got.state;
  assert.deepEqual(s.encounters,enemies,`encounters tick ${tick}`);assert.deepEqual(s.guard,guard,`guard tick ${tick}`);assert.deepEqual(s.combo,combo,`combo tick ${tick}`);assert.equal(s.hp,hp);
  assert.equal(got.encounterEvents.filter(e=>e.type==='damage').length,0);phases.add(s.encounters.enemies[0]!.phase);
 }
 assert.equal(blocks,1);assert.equal(s.hp,100);for(const phase of ['pursuit','prepare','strike','recover'])assert(phases.has(phase));
});

test('one contact per enemy attack; locked warning and actual geometry govern low-strike avoidance',()=>{
 const normal=ticks(active(),100);assert.equal(normal.state.hp,88);assert.equal(contacts(normal.results).length,1);assert.equal(contacts(normal.results)[0]!.damage,12);
 const warning=until(active(),s=>s.encounters.enemies[0]!.phase==='prepare'),locked=warning.encounters.enemies[0]!.heading;
 const dodge=ticks(warning,65,{x:11,z:7});assert.equal(dodge.state.hp,100);assert.equal(dodge.state.encounters.enemies[0]!.heading,locked);
 const strike=until(active(),s=>s.encounters.enemies[0]!.phase==='strike');
 const low=stepLiveSentryPractice(strike,frame(strike,{feetY:.5,grounded:false}));assert.equal(low.state.hp,88,'being airborne alone is not immunity');
 const high=ticks(strike,11,{feetY:1.05,grounded:false});assert.equal(high.state.hp,100);assert.equal(contacts(high.results).length,0);
 const crouch=stepLiveSentryPractice(strike,frame(strike,{crouched:true,stance:1}));assert.equal(crouch.state.hp,88,'crouching does not dodge a low strike');
});

test('timed guard consumes real contact; early, late, rear and canceled guard remain vulnerable',()=>{
 const ready=until(active(),s=>s.encounters.enemies[0]!.phase==='prepare'&&s.encounters.enemies[0]!.remaining<=.20);
 const correct=requestLiveSentryGuard(ready,'front');assert.equal(correct.state.combo.stamina,78);
 const block=ticks(correct.state,18);assert.equal(block.state.hp,100);assert.equal(contacts(block.results).length,1);assert.equal(contacts(block.results)[0]!.blocked,true);assert.equal(block.state.guard.lastBlock?.id,1);
 assert(block.state.encounters.enemies[0]!.hitIds.includes('lab-live-player'));assert.equal(block.results.flatMap(r=>r.comboEvents).filter(e=>e.type==='cancel'&&e.reason==='stun').length,0);
 assert.equal(ticks(requestLiveSentryGuard(active(),'early').state,100).state.hp,88);
 const late=until(active(),s=>s.encounters.enemies[0]!.phase==='strike');assert.equal(stepLiveSentryPractice(requestLiveSentryGuard(late,'late').state,frame(late)).state.hp,88);
 const rear=until(active({facing:Math.PI}),s=>s.encounters.enemies[0]!.phase==='prepare'&&s.encounters.enemies[0]!.remaining<=.20);assert.equal(ticks(requestLiveSentryGuard(rear,'rear').state,18).state.hp,88);
 const cancelled=cancelLiveSentryAction(correct.state,'jump');assert.equal(cancelled.state.guard.phase,'idle');assert.equal(cancelled.state.combo.stamina,78);assert.equal(cancelled.state.guard.cooldownRemaining,correct.state.guard.cooldownRemaining);assert.equal(ticks(cancelled.state,18).state.hp,88);
});

test('existing wall rejects staff contact and enemy sight; committed strike rechecks cover',()=>{
 const behind=requestLiveSentryAttack(active({x:8,z:10,facing:Math.PI})).state,miss=ticks(behind,40);
 assert.equal(miss.state.encounters.enemies[0]!.hp,100);assert.equal(miss.state.hp,100);assert(miss.results.flatMap(r=>r.comboEvents).some(e=>e.type==='whiff'));assert.equal(miss.results.flatMap(r=>r.encounterEvents).filter(e=>e.type==='prepare').length,0);
 // Boundary-only pose change; Rapier test below independently establishes actual wall traversal.
 const strike=until(active({x:8,z:9}),s=>s.encounters.enemies[0]!.phase==='strike'),covered=ticks(strike,11,{x:8,z:10});
 assert.equal(covered.state.hp,100);assert.equal(contacts(covered.results).length,0);assert(ENEMY_RULES.reach>=2,'target inside reach; intervening real wall rejects contact');
});

test('only genuine staff events damage enemy; full combo defeats once and requires explicit reset',()=>{
 let s=active(),refEnemy=createEncounters([LIVE_SENTRY_ARENA.enemy]);const hits:ComboEvent[]=[],events:LivePracticeResult[]=[];
 for(let tick=0;tick<180&&s.status==='active';tick++){
  if(s.combo.phase==='idle'||comboBufferOpen(s.combo))s=requestLiveSentryAttack(s,'auto').state;
  const step=stepLiveSentryPractice(s,frame(s));s=step.state;events.push(step);hits.push(...step.comboEvents.filter(e=>e.type==='hit'));
  for(const hit of step.comboEvents)if(hit.type==='hit'){assert.equal(hit.damage,DEFAULT_COMBO_TUNING.attacks[hit.stage-1]!.damage);refEnemy=hitEncounter(refEnemy,hit.targetId,hit.damage).state;assert.equal(s.encounters.enemies[0]!.hp,refEnemy.enemies[0]!.hp);}
 }
 assert.equal(hits.length,3);assert.deepEqual(hits.map(e=>e.stage),[1,2,3]);assert.equal(new Set(hits.map(e=>e.attackId)).size,3);assert.equal(s.encounters.enemies[0]!.hp,0);assert.equal(s.status,'defeated');assert.equal(s.combo.stamina,44);
 assert.equal(events.flatMap(r=>r.encounterEvents).filter(e=>e.type==='defeated').length,1);
 assert.equal(requestLiveSentryAttack(s).accepted,false);assert.equal(requestLiveSentryGuard(s,'after').accepted,false);assert.equal(resumeLiveSentryPractice(s,frame(s)).accepted,false);assert.equal(stepLiveSentryPractice(s,frame(s)).state,s);
 const reset=resetLiveSentryPractice(s,{seed:73129,epoch:2});assert(reset.accepted);assert.equal(reset.state.hp,100);assert.equal(reset.state.encounters.enemies[0]!.hp,100);assert.equal(reset.state.combo.stamina,100);assert.equal(reset.state.guard.cooldownRemaining,0);assert.equal(reset.state.status,'ready');
});

test('death locks input and clocks until explicit fresh epoch reset; stale round cannot rearm',()=>{
 const dead=ticks(active(),1500).state;assert.equal(dead.hp,0);assert.equal(dead.status,'dead');
 assert.equal(requestLiveSentryAttack(dead).accepted,false);assert.equal(requestLiveSentryGuard(dead,'dead').accepted,false);assert.equal(resumeLiveSentryPractice(dead,frame(dead)).accepted,false);assert.equal(resetLiveSentryPractice(dead,{seed:73129,epoch:1}).accepted,false);
 const fresh=resetLiveSentryPractice(dead,{seed:73129,epoch:2}).state;assert.equal(stepLiveSentryPractice(fresh,{...ground,epoch:1,step:99999}).state,fresh);assert.equal(resumeLiveSentryPractice(fresh,{...ground,epoch:1,step:99999}).accepted,false);assert.equal(resumeLiveSentryPractice(fresh,{...ground,epoch:2,step:99999}).state.status,'active');
});

test('interruptions retire buffered staff, preserve spent cost/recovery, and freeze enemy clocks',()=>{
 for(const why of ['menu','blur','hidden','resize'] as const){
  let s=requestLiveSentryAttack(active()).state;s=ticks(s,15).state;s=requestLiveSentryAttack(s).state;assert(s.combo.buffered);
  const before=structuredClone(s);s=suspendLiveSentryPractice(s,why).state;
  assert.equal(s.status,'paused');assert.equal(s.combo.buffered,false);assert.equal(s.combo.phase,'idle');assert.equal(s.combo.stamina,before.combo.stamina);assert(s.combo.cancelLockRemaining>0);
  assert.equal(stepLiveSentryPractice(s,frame(s,{step:1000})).state,s);assert.equal(requestLiveSentryGuard(s,'paused').accepted,false);assert.equal(requestLiveSentryAttack(s).accepted,false);
  s=resumeLiveSentryPractice(s,frame(s,{step:1000})).state;assert.equal(s.tick,before.tick);assert.equal(s.encounters.step,before.encounters.step);assert.equal(s.combo.stamina,before.combo.stamina);assert.equal(requestLiveSentryAttack(s).accepted,false);
  assert.equal(ticks(s,10).results.flatMap(r=>r.comboEvents).filter(e=>e.type==='hit').length,0);
 }
 const cast=requestLiveSentryGuard(active(),'pause-guard').state,pause=suspendLiveSentryPractice(cast,'menu').state;
 assert.equal(pause.guard.phase,'idle');assert.equal(pause.guard.cooldownRemaining,guardDuration(DEFAULT_GUARD_RECIPE)+DEFAULT_GUARD_RECIPE.cooldown);assert.equal(pause.combo.stamina,78);
 const resumed=resumeLiveSentryPractice(pause,frame(pause,{step:100})).state;assert.equal(requestLiveSentryGuard(resumed,'retry').reason,'cooldown');
});

test('duplicate/stale frames are inert; gaps/invalid frames pause without inventing jump immunity',()=>{
 const s=ticks(active(),10).state,bytes=JSON.stringify(s),same=frame(s,{step:s.lastStep!});
 for(const f of [same,{...same,step:s.lastStep!-1},{...same,epoch:0,step:100}]){const r=stepLiveSentryPractice(s,f);assert.equal(r.state,s);assert.equal(r.accepted,false);}
 const gap=stepLiveSentryPractice(s,frame(s,{step:s.lastStep!+4,feetY:1,grounded:false}));assert.equal(gap.reason,'snapshot-gap');assert.equal(gap.state.status,'paused');assert.equal(gap.state.tick,s.tick);assert.deepEqual(gap.state.encounters,s.encounters);assert.deepEqual(gap.state.pose,s.pose);
 const invalid=stepLiveSentryPractice(s,frame(s,{x:NaN}));assert.equal(invalid.state.status,'paused');assert.equal(invalid.reason,'invalid-frame');assert.equal(JSON.stringify(s),bytes);assert.equal(resumeLiveSentryPractice(gap.state,{...same,step:s.lastStep!-1}).accepted,false);
 const resumed=resumeLiveSentryPractice(gap.state,frame(s,{step:s.lastStep!+4})).state;assert.equal(resumed.tick,s.tick);assert.equal(stepLiveSentryPractice(resumed,frame(resumed)).state.tick,s.tick+1);
});

test('suite/exit terminality and copied state prevent lab aid or mutable equipment contamination',()=>{
 for(const reason of ['suite','exit'] as const){const s=requestLiveSentryGuard(active(),'g').state,off=disableLiveSentryPractice(s,reason).state;assert.equal(off.status,'disabled');assert.equal(off.disabledBy,reason);assert.equal(off.combo.stamina,78);assert.equal(off.guard.phase,'idle');assert.equal(resetLiveSentryPractice(off,{seed:42,epoch:2}).accepted,false);assert.equal(resumeLiveSentryPractice(off,frame(off)).accepted,false);assert.equal(stepLiveSentryPractice(off,frame(off)).state,off);}
 const tuning={attacks:DEFAULT_COMBO_TUNING.attacks.map(a=>({...a}))},s=createLiveSentryPractice({seed:7,epoch:1,tuning});tuning.attacks[0]!.damage=100;tuning.attacks[0]!.prep=.06;assert.equal(s.tuning.attacks[0].damage,24);
 let ready=resumeLiveSentryPractice(s,{...ground,epoch:1,step:0}).state;ready=requestLiveSentryAttack(ready).state;const view=liveSentrySnapshot(ready);view.combo.stamina=100;view.guard.cooldownRemaining=0;view.enemy.hp=0;assert.equal(ready.combo.stamina,86);assert.equal(ready.encounters.enemies[0]!.hp,100);assert.equal(ready.combo.attack?.prep,.16);
 assert.throws(()=>createLiveSentryPractice({seed:-1,epoch:0}));assert.throws(()=>createLiveSentryPractice({seed:1,epoch:NaN}));
});

test('replay is byte-identical and real seeded quadruped follows exact collision authority pose',()=>{
 function run(seed:number){let s=resetLiveSentryPractice(active(),{seed,epoch:2}).state;s=resumeLiveSentryPractice(s,{...ground,epoch:2,step:700}).state;const traces=[];for(let tick=0;tick<150;tick++){if(tick===45)s=requestLiveSentryGuard(s,'one').state;const r=stepLiveSentryPractice(s,frame(s));s=r.state;traces.push(r);}return {s,traces};}
 const first=run(901);assert.deepEqual(first,run(901));assert.notEqual(first.s.bodySeed,run(902).s.bodySeed);
 const rig=createQuadruped(first.s.bodySeed);try{for(const r of first.traces){const v=liveSentrySnapshot(r.state);rig.update(v.enemy);rig.root.updateMatrixWorld(true);assert.deepEqual(rig.root.position.toArray(),[v.enemy.x,v.enemy.y,v.enemy.z]);assert.equal(rig.root.rotation.y,v.enemy.heading);assert.equal(rig.plan.limits.radius,v.collision.radius);const bounds=new THREE.Box3().setFromObject(rig.root);assert([bounds.min.x,bounds.min.y,bounds.min.z,bounds.max.x,bounds.max.y,bounds.max.z].every(Number.isFinite));}}finally{rig.dispose();}
});

async function workerHarness(t:any){
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);globalThis.setInterval=fn=>{globalThis.tick=fn;return 1};parentPort.on('message',async m=>{if(m.type==='advance'){for(let i=0;i<m.ticks;i++)globalThis.tick();parentPort.postMessage({type:'advanced'});}else await self.onmessage({data:m});});import(${JSON.stringify(new URL('../src/physics.worker.ts',import.meta.url).href)}).then(()=>parentPort.postMessage({type:'boot'}));`,{eval:true,execArgv:['--experimental-strip-types']});
 t.after(()=>worker.terminate());let epoch=1,error:unknown;const queue:any[]=[],snapshots:any[]=[];worker.on('error',e=>error=e);worker.on('message',m=>{queue.push(m);if(m.type==='error')error=new Error(m.message);if(m.type==='snapshot')snapshots.push(m);});
 const take=async(type:string)=>{const end=Date.now()+5000;while(true){if(error)throw error;const i=queue.findIndex(m=>m.type===type);if(i>=0)return queue.splice(i,1)[0];assert(Date.now()<end,`waiting for ${type}`);await new Promise(r=>setTimeout(r,1));}};
 const send=(m:any)=>{if(m.type==='zone')epoch++;worker.postMessage({epoch,...m});},tick=async(n=1)=>{const before=snapshots.length;send({type:'advance',ticks:n});await take('advanced');return snapshots.slice(before);};
 await take('boot');send({type:'init',...LIVE_SENTRY_ARENA.player,obstacles:LAB_OBSTACLES,bound:LIVE_SENTRY_ARENA.bound,sandbox:true});await take('ready');await tick();
 return {send,take,tick,get epoch(){return epoch;},get latest(){return snapshots.at(-1);}};
}

test('actual Rapier frames prove timed jump avoidance and late-launch vulnerability',{timeout:15000},async t=>{
 const w=await workerHarness(t),outcomes=[];
 for(const mode of ['grounded','timed','late'] as const){
  w.send({type:'zone',...LIVE_SENTRY_ARENA.player,obstacles:LAB_OBSTACLES,bound:18,sandbox:true});await w.take('ready');await w.tick();
  let s=resumeLiveSentryPractice(createLiveSentryPractice({seed:73129,epoch:w.epoch}),{...w.latest,facing:0}).state;w.send({type:'input',x:0,z:0,paused:false});let jumped=false,maxY=0,hitHeight:number|null=null;
  for(let tick=0;tick<95;tick++){
   const e=s.encounters.enemies[0]!;if(!jumped&&(mode==='timed'&&e.phase==='prepare'&&e.remaining<=.22||mode==='late'&&e.phase==='strike')){w.send({type:'input',x:0,z:0,jump:true,paused:false});jumped=true;}
   const samples=await w.tick();assert.equal(samples.length,1);const sample=samples[0];maxY=Math.max(maxY,sample.feetY);const r=stepLiveSentryPractice(s,{...sample,facing:0});assert(r.accepted,r.reason??'rejected frame');s=r.state;if(r.contacts.length)hitHeight=sample.feetY;
  }
  outcomes.push({mode,hp:s.hp,jumped,maxY,hitHeight});
 }
 assert.equal(outcomes[0]!.hp,88);assert.equal(outcomes[1]!.hp,100);assert(outcomes[1]!.maxY>1);assert.equal(outcomes[2]!.hp,88);assert(outcomes[2]!.hitHeight!==null&&outcomes[2]!.hitHeight!<.85);
});

test('actual Rapier wall blocks travel; sequential and batched frame delivery replay identically',{timeout:15000},async t=>{
 const w=await workerHarness(t);w.send({type:'zone',x:8,z:8,obstacles:LAB_OBSTACLES,bound:18,sandbox:true});await w.take('ready');w.send({type:'input',x:0,z:1,analog:true,paused:false});const walk=await w.tick(120);assert(walk.at(-1)!.z<9.1,'same solid wall prevents crossing');assert.equal(walk.at(-1)!.grounded,true);
 async function replay(batch:number){w.send({type:'zone',...LIVE_SENTRY_ARENA.player,obstacles:LAB_OBSTACLES,bound:18,sandbox:true});await w.take('ready');await w.tick();let s=resumeLiveSentryPractice(createLiveSentryPractice({seed:73129,epoch:w.epoch}),{...w.latest,facing:0}).state;const records=[];w.send({type:'input',x:0,z:0,paused:false});for(let i=0;i<100;i+=batch){for(const sample of await w.tick(Math.min(batch,100-i))){const r=stepLiveSentryPractice(s,{...sample,facing:0});assert(r.accepted);s=r.state;records.push({tick:s.tick,hp:s.hp,enemy:s.encounters.enemies[0],combo:s.combo,guard:s.guard,contacts:r.contacts});}}return records;}
 assert.deepEqual(await replay(1),await replay(40));w.send({type:'input',x:0,z:0,paused:true});const paused=await w.tick(3);assert(paused.every(s=>s.step===paused[0].step));
});
