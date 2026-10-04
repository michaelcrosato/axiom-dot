import test from 'node:test';
import assert from 'node:assert/strict';
import {createCaveWater,advanceCaveWater,applyCaveWaterCommand,caveWaterBalance,caveRouteOpen,type CaveWaterState} from '../src/cave-water.ts';
import {createCaveSupply,applyCaveSupplyCommand,advanceCaveSettlement,caveSupplyContext,caveSettlementWaterBalance,validCaveSupply,caveSupplyCost,type CaveSupplyState} from '../src/cave-supply.ts';
import {createCausalState,reconcileCausal,validCausal,causalPlan,type CausalState,type CausalContext} from '../src/causal.ts';
import {naturalCave} from '../src/natural-cave.ts';
import {receiveCaveWater,takeCaveCargo,deliverCaveCargo,validCaveReceipts} from '../src/cave-receipts.ts';
const seed=73129;
function fixture(){const cave=createCaveWater(seed),supply=createCaveSupply(seed,cave),plan=causalPlan(seed),ctx:CausalContext={seed,defeated:plan.threats.map(t=>t.id),inventory:{scrap:8,core:2,water:0},player:{x:0,z:0,hp:100},zone:'cave',networkOverflow:0,networkWorking:false,recoverableScrap:8,recoverableCore:2,recoverableWater:0,historicalPumpRepaired:false};return {cave,supply,causal:reconcileCausal(createCausalState(seed),ctx),ctx};}
function connect(f=fixture()){f.supply=applyCaveSupplyCommand(f.supply,f.cave,{inventory:f.ctx.inventory,player:naturalCave(seed).anchors.drain,zone:'cave',hp:100},{type:'connect-outfall'}).state;return f;}
function advance(f:ReturnType<typeof fixture>,dt:number){return {...f,...advanceCaveSettlement(f.cave,f.supply,f.causal,f.ctx,dt)};}
function run(f:ReturnType<typeof fixture>,seconds:number,dt=.25){for(let i=0;i<seconds/dt;i++)f=advance(f,dt);return f;}
function check(f:ReturnType<typeof fixture>){assert.ok(validCaveSupply(f.supply,seed,f.cave));assert.ok(validCausal(f.causal,{...f.ctx,caveSupply:caveSupplyContext(f.supply,f.cave)}));assert.ok(Math.abs(caveWaterBalance(f.cave))<1e-6);assert.ok(Math.abs(caveSettlementWaterBalance(f.cave,f.causal))<1e-6);}

test('diversion costs 2 existing scrap once at reachable dry drain and creates no water or instant contribution',()=>{
 const f=fixture(),ctx={inventory:f.ctx.inventory,player:naturalCave(seed).anchors.drain,zone:'cave',hp:100},command={type:'connect-outfall'} as const;
 for(const patch of [{zone:'valley'},{zone:'dungeon'},{hp:0},{hp:NaN},{player:{x:80,z:80}},{player:{x:NaN,z:0}},{inventory:{scrap:1,core:2,water:0}},{inventory:{scrap:NaN,core:2,water:0}}]){const denied=applyCaveSupplyCommand(f.supply,f.cave,{...ctx,...patch},command);assert.equal(denied.state,f.supply);assert.equal(denied.inventory,({...ctx,...patch}).inventory);}
 const paid=applyCaveSupplyCommand(f.supply,f.cave,ctx,command);assert.equal(paid.inventory.scrap,6);assert.equal(paid.inventory.water,0);assert.deepEqual(caveSupplyCost(paid.state),{scrap:2,core:0,water:0});assert.equal(caveSupplyContext(paid.state,f.cave).received,0);assert.equal(f.causal.caveReceipts,undefined);assert.ok(f.causal.jobs.every(j=>!j.playerContribution));assert.equal(applyCaveSupplyCommand(paid.state,f.cave,{...ctx,inventory:paid.inventory},command).state,paid.state);check({...f,supply:paid.state});
});
test('physical outflow converts m³ to L with 0.5 L/s meter, immediate discard and unchanged old sources',()=>{
 let f=run(connect(),1);assert.equal(f.causal.caveReceipts!.received,.5);assert.equal(f.causal.depot,.5);assert.equal(f.causal.extracted,0);assert.equal(f.causal.networkCaptured,0);assert.equal(f.causal.playerWater,0);assert.ok(f.supply.drained.discarded>1);check(f);
 for(const j of f.causal.jobs)if(j.kind==='water'){j.accepted=true;j.status='accepted';}
 f=run(f,400);assert.ok(f.causal.caveReceipts!.households.every(h=>h.litres>0));assert.ok(f.causal.jobs.filter(j=>j.kind==='water').every(j=>j.status==='completed'&&j.playerEvidence.includes('cave')));assert.ok(f.causal.caveReceipts!.credits.every(x=>x.at>1));assert.ok(f.causal.settlements.every(s=>s.delivered>0));check(f);
});
test('all three cave strategies retain physical access; pumped and drained receipts stay distinct',()=>{
 for(const type of ['repair-valve','repair-pump','clear-drain'] as const){let f=connect(),kind=type==='repair-valve'?'valve':type==='repair-pump'?'pump':'drain';f.cave=applyCaveWaterCommand(f.cave,{inventory:f.ctx.inventory,player:naturalCave(seed).anchors[kind],zone:'cave',hp:100},{type}).state;f=run(f,200);assert.ok(caveRouteOpen(f.cave),type);assert.ok(f.causal.caveReceipts!.received>0);assert.ok(f.supply.drained.captured>0);assert.equal(f.supply.pumped.captured>0,type==='repair-pump');check(f);}
});
test('full depot discards without backlog; unchanged time and death never produce deferred supply',()=>{
 let f=connect();f.ctx={...f.ctx,defeated:[]};f=run(f,100);assert.ok(Math.abs(f.causal.depot-20)<1e-7);const captured=f.causal.caveReceipts!.received,discarded=f.supply.drained.discarded;f=advance(f,.25);assert.equal(f.causal.caveReceipts!.received,captured);assert.ok(f.supply.drained.discarded>discarded);check(f);
 // No clock event and no new output means no capture, including repeated same-time syncs.
 for(const dt of [0,-1,Infinity,NaN])assert.deepEqual(advance(f,dt),f);
 const dead={...f,ctx:{...f.ctx,player:{...f.ctx.player,hp:0}}};assert.deepEqual(advance(dead,1),dead);
});
test('old output baselines and installation mid-step cannot retroactively capture water or time',()=>{
 let f=fixture();f.cave=advanceCaveWater(f.cave,1);f.supply=createCaveSupply(seed,f.cave);assert.equal(f.supply.drained.baseline,f.cave.drained);f=connect(f);f=advance(f,.1);assert.equal(f.causal.caveReceipts,undefined);f=advance(f,.15);assert.equal(f.causal.caveReceipts!.received,.125);check(f);
 let partial=advance(fixture(),.2);partial=connect(partial);assert.equal(partial.supply.connectedAt,.2);partial=advance(partial,.05);assert.ok(Math.abs(partial.causal.caveReceipts!.received-.025)<1e-10,'only the 0.05 s after installation may be metered');check(partial);
 let old=run(fixture(),40);assert.equal(old.causal.caveReceipts,undefined);assert.equal(old.supply.drained.captured,0);old=connect(old);old=advance(old,.25);assert.equal(old.causal.caveReceipts!.received,.125);check(old);
});
test('offset cave/causal clocks and 60Hz inputs preserve deterministic real steps, save replay and bounded dt',()=>{
 let start=fixture();start.causal.accumulator=.1;start=connect(start);
 const grouped=run(start,60,1),quarters=run(start,60,.25),frames=run(start,60,1/60);
 const strip=(f:ReturnType<typeof fixture>)=>{const s=structuredClone(f);s.cave.remainder=0;s.causal.accumulator=0;return s;};assert.deepEqual(strip(grouped),strip(quarters));assert.deepEqual(strip(frames),strip(quarters));check(frames);assert.ok(Math.abs(frames.causal.accumulator-.1)<1e-7);
 assert.deepEqual(advance(start,1e8),advance(start,1));const saved=JSON.parse(JSON.stringify(frames));assert.deepEqual(run(saved,10),run(frames,10));
});
test('mixed depot/cargo receipts assign only actual cave fraction and never credit past deliveries',()=>{
 const f=fixture();let c={...f.causal,depot:10,extracted:10};c=receiveCaveWater(c,10);const carrier=c.agents.find(a=>a.id.endsWith('/carrier'))!,home=c.settlements.find(s=>s.id===causalPlan(seed).agents.find(a=>a.id===carrier.id)!.homeId)!;const j=c.jobs.find(j=>j.kind==='water'&&j.targetId===home.id)!;
 takeCaveCargo(c,carrier.id,4);c.depot-=4;carrier.cargo=4;assert.equal(c.caveReceipts!.carriers.find(a=>a.id===carrier.id)!.litres,2);deliverCaveCargo(c,carrier.id,home.id,2,4);home.delivered+=2;home.reserve+=2;carrier.cargo-=2;assert.equal(c.caveReceipts!.households.find(h=>h.id===home.id)!.litres,1);assert.equal(j.playerContribution,false);j.accepted=true;j.status='accepted';assert.equal(j.playerContribution,false);deliverCaveCargo(c,carrier.id,home.id,2,2);home.delivered+=2;home.reserve+=2;carrier.cargo=0;assert.ok(j.playerEvidence.includes('cave'));assert.equal(c.caveReceipts!.credits[0]!.litres,1);assert.ok(validCaveReceipts(c,{...f.ctx,caveSupply:{received:10,connected:true,available:true}}));
});
test('strict bridge and coupled provenance validation reject malformed, replayed and forged receipts',()=>{
 const f=run(connect(),100);check(f);for(const patch of [{version:2},{hash:'bad'},{seed:7},{connected:false},{connectedAt:1e9},{elapsed:f.cave.elapsed+.25},{pumped:{...f.supply.pumped,seen:1}},{drained:{...f.supply.drained,captured:f.supply.drained.captured+1}},{drained:{...f.supply.drained,baseline:-1}},{extra:1}])assert.equal(validCaveSupply({...f.supply,...patch},seed,f.cave),false);
 for(const alter of [(c:CausalState)=>c.caveReceipts!.received++,(c:CausalState)=>c.caveReceipts!.depot++,(c:CausalState)=>c.caveReceipts!.carriers[0]!.litres++,(c:CausalState)=>c.caveReceipts!.households[0]!.litres++,(c:CausalState)=>{delete c.caveReceipts;}]){const c=structuredClone(f.causal);alter(c);assert.equal(validCausal(c,{...f.ctx,caveSupply:caveSupplyContext(f.supply,f.cave)}),false);}
 assert.equal(validCausal(f.causal,f.ctx),false,'provenance needs the external verified bridge');
});

test('closed valve has finite recoverable water, stops at exhaustion, and reopening adds only new source output',()=>{
 let f=connect();const operate=(type:'repair-valve'|'set-source',on=true)=>{f.cave=applyCaveWaterCommand(f.cave,{inventory:f.ctx.inventory,player:naturalCave(seed).anchors.valve,zone:'cave',hp:100},type==='set-source'?{type,on}:{type}).state;};
 operate('repair-valve');f=run(f,600);assert.equal(f.cave.extracted,0);assert.equal(caveSupplyContext(f.supply,f.cave).available,false);const received=f.causal.caveReceipts!.received,drained=f.cave.drained;f=run(f,60);assert.equal(f.cave.drained,drained);assert.equal(f.causal.caveReceipts!.received,received,'old capture/discard does not become a future reservoir');check(f);
 operate('set-source',true);f=run(f,80);assert.ok(f.cave.extracted>0);assert.ok(f.cave.drained>drained);assert.ok(f.causal.caveReceipts!.received>received);check(f);
});
test('source-open pump and drain output remain separately conservative across stop/start/close/open controls',()=>{
 let f=connect();const operate=(type:'repair-pump'|'set-pump'|'repair-valve'|'set-source'|'clear-drain',on=true)=>{const anchor=type==='repair-pump'||type==='set-pump'?'pump':type==='clear-drain'?'drain':'valve';f.cave=applyCaveWaterCommand(f.cave,{inventory:f.ctx.inventory,player:naturalCave(seed).anchors[anchor],zone:'cave',hp:100},type==='set-pump'||type==='set-source'?{type,on}:{type}).state;};
 operate('repair-pump');f=run(f,20);assert.ok(f.supply.pumped.captured>0);const first=f.supply.pumped.seen;operate('set-pump',false);f=run(f,20);assert.equal(f.supply.pumped.seen,first);operate('clear-drain');operate('repair-valve');f=run(f,20);operate('set-source',true);operate('set-pump',true);f=run(f,80);assert.ok(f.supply.pumped.seen>first);assert.ok(f.supply.pumped.discarded>0);assert.ok(f.supply.drained.discarded>0);check(f);
 for(const stream of [f.supply.pumped,f.supply.drained])assert.ok(Math.abs(stream.seen-stream.baseline-stream.captured-stream.discarded)<1e-8);
});
test('paid cave supply makes actual water need feasible even with no recoverable canisters, scrap or cores',()=>{
 let f=fixture();f.ctx={...f.ctx,recoverableWater:0,recoverableScrap:0,recoverableCore:0};f.causal=reconcileCausal(f.causal,f.ctx);assert.ok(f.causal.jobs.filter(j=>j.kind==='water').every(j=>j.status==='blocked'));
 f=connect(f);f.causal=reconcileCausal(f.causal,{...f.ctx,caveSupply:caveSupplyContext(f.supply,f.cave)});assert.ok(f.causal.jobs.filter(j=>j.kind==='water').every(j=>j.status==='offered'));for(const j of f.causal.jobs)if(j.kind==='water'){j.accepted=true;j.status='accepted';}f=run(f,400);assert.ok(f.causal.jobs.filter(j=>j.kind==='water').every(j=>j.status==='completed'));assert.equal(f.causal.playerWater,0);assert.ok(f.causal.caveReceipts!.households.every(h=>h.litres>0));check(f);
});


test('closed-gate finite capability counts real depot stock awaiting pickup without promising residual cave water',()=>{
 let f=connect();f.ctx={...f.ctx,defeated:[],recoverableWater:0,recoverableScrap:0,recoverableCore:0};f=run(f,40);assert.ok(f.causal.depot>=12);assert.ok(f.causal.jobs.filter(j=>j.kind==='water').some(j=>f.causal.agents.filter(a=>causalPlan(seed).agents.find(d=>d.id===a.id)!.homeId===j.targetId).reduce((n,a)=>n+a.cargo,0)<6-f.causal.settlements.find(h=>h.id===j.targetId)!.reserve),'at least one household still needs depot stock rather than carried cargo');const closed=applyCaveWaterCommand(f.cave,{inventory:f.ctx.inventory,player:naturalCave(seed).anchors.valve,zone:'cave',hp:100},{type:'repair-valve'});f.cave=closed.state;const context={...f.ctx,caveSupply:caveSupplyContext(f.supply,f.cave)};assert.equal(context.caveSupply.available,false);f.causal=reconcileCausal(f.causal,context);assert.ok(f.causal.jobs.filter(j=>j.kind==='water').every(j=>j.status==='offered'));check(f);
 let empty=connect();empty.ctx={...empty.ctx,recoverableWater:0,recoverableScrap:0,recoverableCore:0};empty.cave=applyCaveWaterCommand(empty.cave,{inventory:empty.ctx.inventory,player:naturalCave(seed).anchors.valve,zone:'cave',hp:100},{type:'repair-valve'}).state;empty.causal=reconcileCausal(empty.causal,{...empty.ctx,caveSupply:caveSupplyContext(empty.supply,empty.cave)});assert.ok(empty.causal.jobs.filter(j=>j.kind==='water').every(j=>j.status==='blocked'),'residual unmetered cave water is not yet deliverable stock');
});
