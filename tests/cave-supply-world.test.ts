import {ecologyPlan} from '../src/ecology.ts';
import test from 'node:test';import assert from 'node:assert/strict';
import {createConnectedState,enableEcology,enableEconomy,createState,applyAction,worldObjects,worldEndpoints,causalContext,validateSave,serializeSave,parseSave,type State} from '../src/world.ts';
import {naturalCave} from '../src/natural-cave.ts';
import {causalPlan,CAUSAL_HASH} from '../src/causal.ts';
import {CAVE_WATER_HASH} from '../src/cave-water.ts';
import {CAVE_SUPPLY_HASH} from '../src/cave-supply.ts';
import {createRoom,joinRoom,advanceRoom,syncRoom,snapshot} from '../server/coop-authority.ts';
import {action as validAction} from '../server/coop-validation.ts';
function move(s:State,p:{x:number;z:number}){return applyAction(s,{type:'move',...p});}
function stock(s=createConnectedState(73129)){for(const o of worldObjects(s)){if(['scrap','core','water'].includes(o.kind)){s=move(s,o);s=applyAction(s,{type:'collect',id:o.id});}if(o.kind==='enemy'){s=move(s,o);s=applyAction(s,{type:'attack',id:o.id});}}return s;}
function enter(s:State){return applyAction(move(s,worldEndpoints(s).entrance),{type:'enter-cave'});}
function connect(s:State){return applyAction(move(s,naturalCave(s.seed).anchors.drain),{type:'cave-supply',command:{type:'connect-outfall'}});}
function run(s:State,seconds:number){for(let i=0;i<seconds*4;i++)s=applyAction(s,{type:'tick',dt:.25});return s;}
const command={type:'cave-supply',command:{type:'connect-outfall'}} as const;

test('world connection uses canonical inventory, carrier delivery, reserve predicate, and one-time job claim',()=>{
 let s=stock();for(const job of s.causal!.jobs.filter(j=>j.kind==='water'))s=applyAction(move(s,causalPlan(s.seed).settlements.find(h=>h.id===job.targetId)!.position),{type:'causal',command:{type:'accept',id:job.id}});
 s=enter(s);const before=structuredClone(s);s=connect(s);assert.equal(s.inventory.scrap,before.inventory.scrap-2);assert.equal(s.inventory.water,before.inventory.water);assert.ok(s.causal!.jobs.filter(j=>j.kind==='water').every(j=>!j.playerContribution&&j.status==='accepted'));assert.equal(applyAction(s,command),s);assert.ok(validateSave(s));
 s=run(s,20);assert.ok(s.causal!.depot>0||s.causal!.agents.some(a=>a.cargo>0));assert.ok(s.causal!.jobs.filter(j=>j.kind==='water').every(j=>j.status==='accepted'),'source fill alone is not household relief');assert.ok(validateSave(s));
 const saved=serializeSave(s);s=run(s,380);assert.deepEqual(run(parseSave(saved)!,380),s);assert.ok(s.causal!.jobs.filter(j=>j.kind==='water').every(j=>j.status==='completed'&&j.playerEvidence.includes('cave')));assert.equal(s.causal!.extracted,0);assert.equal(s.causal!.networkCaptured,0);assert.equal(s.causal!.playerWater,0);assert.deepEqual(s.inventory,{...before.inventory,scrap:before.inventory.scrap-2});assert.ok(validateSave(s));
 s=applyAction(move(s,naturalCave(s.seed).spawn),{type:'exit'});for(const j of s.causal!.jobs.filter(j=>j.kind==='water')){s=move(s,causalPlan(s.seed).settlements.find(h=>h.id===j.targetId)!.position);s=applyAction(s,{type:'causal',command:{type:'claim',id:j.id}});const reward=s.causal!.renown;s=applyAction(s,{type:'causal',command:{type:'claim',id:j.id}});assert.equal(s.causal!.renown,reward);}assert.ok(s.causal!.renown>0);assert.ok(validateSave(s));
});
test('all-zone ticks persist exact optional receipts; dead ticks and paused/no-call periods preserve water',()=>{
 let s=connect(enter(stock()));s=run(s,1);const inventory={...s.inventory};for(const zone of ['valley','dungeon','cave'] as const){const start=s.causal!.elapsed;s={...s,zone};s=run(s,1);assert.equal(s.causal!.elapsed,start+1);assert.ok(validateSave(s));assert.deepEqual(s.inventory,inventory);}
 for(const dt of [NaN,Infinity,-1,0])assert.equal(applyAction(s,{type:'tick',dt}),s);s={...s,player:{...s.player,hp:0}};assert.equal(applyAction(s,{type:'tick',dt:1}),s);assert.deepEqual(parseSave(serializeSave(s))!.caveSupply,s.caveSupply);
});
test('old cave save migration baselines past output and retains all pinned foundations and old source ledgers',()=>{
 let old=run(enter(stock()),100);assert.equal(old.causal!.caveReceipts,undefined);delete old.caveSupply;const saved=JSON.stringify(old),loaded=parseSave(saved)!;assert.ok(loaded);assert.equal(loaded.caveSupply!.drained.baseline,old.caveWater!.drained);assert.equal(loaded.caveSupply!.drained.captured,0);assert.deepEqual(loaded.causal,old.causal);assert.deepEqual(loaded.inventory,old.inventory);assert.equal(CAUSAL_HASH,'1c9730fb');assert.equal(loaded.caveWater!.hash,CAVE_WATER_HASH);assert.equal(loaded.generationManifest.contentHash,'887423ac');assert.equal(loaded.caveSupply!.hash,CAVE_SUPPLY_HASH);
 const connected=connect(loaded),tick=run(connected,1);assert.equal(tick.causal!.caveReceipts!.received,.5);assert.equal(tick.causal!.networkCaptured,old.causal!.networkCaptured);assert.equal(tick.causal!.networkSeen,old.causal!.networkSeen);assert.equal(tick.causal!.extracted,old.causal!.extracted);assert.equal(causalContext(tick).historicalPumpRepaired,false);assert.ok(validateSave(tick));
 const gen1=enter(createState(42));assert.equal(gen1.caveSupply,undefined);assert.deepEqual(parseSave(serializeSave(gen1)),gen1);assert.equal(applyAction(move(gen1,naturalCave(42).anchors.drain),command).caveSupply,undefined);
});
test('paid original pump identity and material conservation survive the new bridge alongside cave repairs',()=>{
 let s=stock();s=applyAction(move(s,worldEndpoints(s).pump),{type:'repair-pump'});assert.ok(causalContext(s).historicalPumpRepaired);s=connect(enter(s));const core=naturalCave(s.seed).objects.find(o=>o.kind==='core')!;s=applyAction(move(s,core),{type:'collect',id:core.id});s=applyAction(move(s,naturalCave(s.seed).anchors.pump),{type:'cave-water',command:{type:'repair-pump'}});s=run(s,80);assert.ok(causalContext(s).historicalPumpRepaired);assert.ok(s.causal!.extracted>0);assert.ok(s.caveSupply!.pumped.captured>0);assert.ok(validateSave(s));assert.deepEqual(parseSave(serializeSave(s)),s);
});
test('world save rejects missing/malformed bridge, receipt inflation and free connection debit',()=>{
 const s=run(connect(enter(stock())),100);for(const mutate of [(x:State)=>{delete x.caveSupply;},(x:State)=>{delete x.causal!.caveReceipts;},(x:State)=>x.inventory.scrap++,(x:State)=>{x.caveSupply!.hash='bad';},(x:State)=>x.caveSupply!.drained.captured++,(x:State)=>x.causal!.caveReceipts!.received++]){const x=structuredClone(s);mutate(x);assert.equal(validateSave(x),false);assert.equal(parseSave(JSON.stringify(x)),null);}
});
test('co-op admits only the paid intent, shares one bridge clock and debits once across retries and peers',()=>{
 assert.deepEqual(validAction(command),command);for(const bad of [{...command,litres:100},{...command,command:{...command.command,litres:100}},{...command,command:{type:'capture'}},{...command,command:null}])assert.equal(validAction(bad),null);
 const world=move(enter(stock()),naturalCave(73129).anchors.drain),room=createRoom('host','Host',world,1000),peer=joinRoom(room,'guest','Guest',1000),host=room.players[0]!,before=room.world.inventory.scrap;
 const input={seq:1,sessionId:host.sessionId,actions:[command]};syncRoom(room,'host',input,1000);assert.equal(room.world.inventory.scrap,before-2);assert.deepEqual(syncRoom(room,'host',input,1000),[]);syncRoom(room,'guest',{seq:1,sessionId:peer.sessionId,actions:[command]},1000);assert.equal(room.world.inventory.scrap,before-2);
 advanceRoom(room,2000);const cave=structuredClone(room.world.caveSupply),elapsed=room.world.causal!.elapsed;assert.equal(room.world.causal!.caveReceipts!.received,.5);advanceRoom(room,2000);snapshot(room,'host',2000);snapshot(room,'guest',2000);assert.deepEqual(room.world.caveSupply,cave);assert.equal(room.world.causal!.elapsed,elapsed);assert.ok(validateSave(room.world));
});

test('death and save restoration cannot collect the pending pre-install quarter or create offline catch-up',()=>{
 let s=enter(stock());s=applyAction(s,{type:'tick',dt:.2});s=connect(s);assert.equal(s.caveSupply!.connectedAt,.2);s={...s,player:{...s.player,hp:0}};const saved=serializeSave(s),loaded=parseSave(saved)!;assert.equal(applyAction(loaded,{type:'tick',dt:999}),loaded);assert.equal(loaded.causal!.caveReceipts,undefined);s=applyAction(loaded,{type:'respawn'});s=applyAction(s,{type:'tick',dt:.05});assert.ok(Math.abs(s.causal!.caveReceipts!.received-.025)<1e-10);assert.ok(validateSave(s));
 const future=structuredClone(s);future.caveSupply!.connectedAt=future.caveWater!.elapsed+future.caveWater!.remainder+.001;assert.equal(validateSave(future),false);
});

test('shared bridge, garden irrigation and real workshop output keep one canonical material ledger',()=>{
 let s=enableEcology(enableEconomy(stock()));s=connect(enter(s));s=applyAction(s,{type:'cave-water',command:{type:'clear-drain'}});s=applyAction(move(s,naturalCave(s.seed).spawn),{type:'exit'});const plot=ecologyPlan(s.seed).plots[0]!;s=move(s,plot.position);const water=s.inventory.water;s=applyAction(s,{type:'ecology',command:{type:'water',plotId:plot.id,expectedRevision:s.ecology!.revision}});assert.equal(s.inventory.water,water-1);s=applyAction(s,{type:'ecology',command:{type:'plant',plotId:plot.id,species:'reedmoss',expectedRevision:s.ecology!.revision}});s=run(s,400);assert.ok(s.causal!.caveReceipts!.households.some(h=>h.litres>0));assert.equal(s.causal!.extracted,0);assert.equal(s.causal!.networkCaptured,0);const place=causalPlan(s.seed).workplaces.find(w=>s.economy!.workshops.some(e=>e.id===w.id))!;s=move(s,place.position);if(!s.causal!.workplaces.find(w=>w.id===place.id)!.operational)s=applyAction(s,{type:'causal',command:{type:'repair-workplace',workplaceId:place.id}});const before=s.inventory.scrap;s=applyAction(s,{type:'economy',command:{type:'commission-kit',workplaceId:place.id}});assert.equal(s.inventory.scrap,before-2);s=run(s,400);s=applyAction(s,{type:'economy',command:{type:'collect-kit',workplaceId:place.id}});assert.equal(s.economy!.kits,1);assert.equal(s.ecology!.canistersSpent,1);assert.equal(s.ecology!.seeds,11);assert.ok(validateSave(s));const restored=parseSave(serializeSave(s))!;assert.ok(Math.hypot(restored.player.x-s.player.x,restored.player.z-s.player.z)<1e-9);assert.deepEqual({...restored,player:s.player},s);
});
