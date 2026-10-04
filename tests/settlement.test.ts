import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,applyAction,generateObjects,serializeSave,parseSave,validateSave,type State} from '../src/world.ts';
import {PADS,LINKS,flow,emptyWaterworks} from '../src/waterworks.ts';
import {JOBS,advanceSettlement,emptySettlement,settlementNeed,jobReady,validJobs,validSettlement} from '../src/settlement.ts';
function readyWorld(){
 let s=createState(73129);
 for(const o of generateObjects(s.seed).filter(o=>['scrap','core'].includes(o.kind))){s=applyAction(s,{type:'move',x:o.x,z:o.z});s=applyAction(s,{type:'collect',id:o.id});}
 s=applyAction(s,{type:'move',x:-10,z:10});
 for(const p of PADS)s=applyAction(s,{type:'build',command:{type:'place',pad:p.id,kind:p.kind,x:p.x,z:p.z}});
 for(const link of LINKS)s=applyAction(s,{type:'build',command:{type:'connect',link}});
 return applyAction(s,{type:'move',x:-16,z:-4});
}
function ticks(s:State,n:number,dt=1){for(let i=0;i<n;i++)s=applyAction(s,{type:'tick',dt});return s;}
test('Mossbank consumes only delivered network water; reserve, spill and demand ledger conserve delivery',()=>{
 let s=readyWorld();assert.equal(settlementNeed(s.settlement,s.waterworks),'Building emergency reserve');s=ticks(s,100);
 assert.equal(s.settlement.reserve,24);assert.equal(s.settlement.consumed,50);assert.equal(s.settlement.spilled,26);assert.equal(s.settlement.served,100);assert.ok(validateSave(s));
 s=applyAction(s,{type:'build',command:{type:'disconnect',link:'tank:outlet'}});assert.equal(settlementNeed(s.settlement,s.waterworks),'Drawing on reserves');
 s=ticks(s,48);assert.equal(s.settlement.reserve,0);assert.equal(settlementNeed(s.settlement,s.waterworks),'Water shortage');assert.ok(validateSave(s));
 assert.equal(s.settlement.consumed+s.settlement.reserve+s.settlement.spilled,s.waterworks.delivered);
});
test('settlement time integration is stable; invalid/large dt bounded and dungeon pauses all water progress',()=>{
 let coarse=readyWorld(),fine=readyWorld();coarse=ticks(coarse,80);fine=ticks(fine,4800,1/60);
 for(const key of ['reserve','consumed','spilled','served'] as const)assert.ok(Math.abs(coarse.settlement[key]-fine.settlement[key])<1e-7,key);
 const inside={...coarse,zone:'dungeon' as const,player:{x:0,z:0,hp:100}};const next=applyAction(inside,{type:'tick',dt:1});assert.deepEqual(next.settlement,inside.settlement);assert.deepEqual(next.waterworks,inside.waterworks);
 for(const dt of [NaN,Infinity,0,-1])assert.equal(advanceSettlement(coarse.settlement,0,dt),coarse.settlement);
 assert.deepEqual(applyAction(coarse,{type:'tick',dt:1000}).settlement,applyAction(coarse,{type:'tick',dt:1}).settlement);
});
test('three feasible commissions accept, progress, claim exactly once and persist rewards/titles',()=>{
 let s=readyWorld();
 assert.equal(applyAction(s,{type:'accept-commission',id:'service'}),s);assert.equal(applyAction(s,{type:'claim-commission'}),s);
 for(const job of JOBS){
  s=applyAction(s,{type:'accept-commission',id:job.id});assert.equal(s.jobs.active?.id,job.id);
  assert.equal(applyAction(s,{type:'accept-commission',id:job.id}),s);
  s=ticks(s,job.id==='reserve'?10:40);assert.ok(jobReady(s.jobs,s.settlement,s.waterworks));
  s=parseSave(serializeSave(s))!;const inv={...s.inventory};s=applyAction(s,{type:'claim-commission'});assert.ok(s.jobs.completed.includes(job.id));assert.deepEqual(s.inventory,inv);
  assert.equal(applyAction(s,{type:'claim-commission'}),s);assert.equal(applyAction(s,{type:'accept-commission',id:job.id}),s);assert.ok(validateSave(s));
 }
 assert.equal(s.jobs.renown,50);assert.equal(s.jobs.active,null);assert.deepEqual(parseSave(serializeSave(s)),s);
});
test('acceptance baselines prevent old-delivery credit; live supply, proximity and life are required to claim',()=>{
 let s=ticks(readyWorld(),100);s=applyAction(s,{type:'accept-commission',id:'commission'});assert.equal(jobReady(s.jobs,s.settlement,s.waterworks),false);
 assert.equal(applyAction(s,{type:'claim-commission'}),s);s=ticks(s,20);assert.ok(jobReady(s.jobs,s.settlement,s.waterworks));
 for(const bad of [{...s,player:{x:40,z:40,hp:100}},{...s,zone:'dungeon' as const},{...s,player:{...s.player,hp:0}}])assert.equal(applyAction(bad,{type:'claim-commission'}),bad);
 const disconnected=applyAction(s,{type:'build',command:{type:'disconnect',link:'tank:outlet'}});assert.equal(applyAction(disconnected,{type:'claim-commission'}),disconnected);
 assert.equal(s.jobs.renown,0);
});
test('dismantling, death and rebuild do not reset completed jobs or farm renown',()=>{
 let s=readyWorld();s=applyAction(s,{type:'accept-commission',id:'commission'});s=ticks(s,25);s=applyAction(s,{type:'claim-commission'});
 s=applyAction(s,{type:'move',x:-10,z:10});s=applyAction(s,{type:'build',command:{type:'dismantle',pad:'tank'}});s=applyAction({...s,player:{...s.player,hp:0}},{type:'respawn'});
 const p=PADS[2];s=applyAction(s,{type:'build',command:{type:'place',pad:p.id,kind:p.kind,x:p.x,z:p.z}});s=applyAction(s,{type:'move',x:-16,z:-4});
 assert.equal(applyAction(s,{type:'accept-commission',id:'commission'}),s);assert.equal(s.jobs.renown,10);assert.ok(validateSave(s));
});
test('schema-3 migration preserves construction and delivery history without giving free reserve/rewards',()=>{
 const old=ticks(readyWorld(),80);const {settlement,jobs,...legacy}=old;const migrated=parseSave(JSON.stringify({...legacy,schemaVersion:3,waterworks:{...old.waterworks,parts:old.waterworks.parts.map(p=>p.id),links:[...LINKS]}}))!;
 assert.ok(migrated);assert.equal(migrated.schemaVersion,6);assert.deepEqual(migrated.inventory,old.inventory);assert.deepEqual(migrated.waterworks,old.waterworks);
 assert.equal(migrated.settlement.reserve,0);assert.equal(migrated.settlement.consumed,old.waterworks.delivered);assert.equal(migrated.jobs.renown,0);assert.ok(validateSave(migrated));
});
test('strict save validation rejects malformed ledgers, forged rewards, invalid job order/baselines and nonfinite values',()=>{
 const s=readyWorld();
 for(const bad of [{...s,settlement:{...s.settlement,reserve:1}},{...s,jobs:{...s.jobs,renown:50}},{...s,jobs:{...s.jobs,completed:['service']}},{...s,jobs:{...s.jobs,active:{id:'commission',deliveredAt:1,servedAt:0}}},{...s,jobs:{...s.jobs,active:{id:'commission',deliveredAt:0,servedAt:Infinity}}},{...s,settlement:{...s.settlement,served:NaN}},{...s,jobs:null},{...s,settlement:null}])assert.equal(validateSave(bad),false);
 assert.equal(validSettlement(emptySettlement(1),emptyWaterworks()),false);
});
