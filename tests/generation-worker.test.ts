import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {nodeGenerationWorker} from './helpers/generation-node-worker.ts';
import {createGenerationClient,type GenerationWorkerPort} from '../src/generation-client.ts';
import {compileGeneration} from '../src/generation-compile.ts';
import {GENERATION_SOURCE,acceptGenerationPlan,type GenerationInput} from '../src/generation-protocol.ts';
import {GENERATION_MANIFEST,CONNECTED_GENERATION_MANIFEST,prepareWorldGeneration,worldValley,worldDungeon,previewGeneration,disposeGeneration} from '../src/generation.ts';
import {startupGenerationHints} from '../src/generation-startup.ts';
import {createConnectedState,parseSave,serializeSave} from '../src/world.ts';
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fixture=JSON.parse(readFileSync(new URL('./fixtures/generation-byte-hashes.json',import.meta.url),'utf8'));
const input:GenerationInput={kind:'connected',seed:73129};
const pause=()=>new Promise(r=>setTimeout(r,0));
function fake(autoReady=true){const messages:any[]=[];let terminated=0;const port:GenerationWorkerPort={onmessage:null,onerror:null,onmessageerror:null,postMessage:m=>messages.push(m),terminate:()=>{terminated++;}};const emit=(m:unknown)=>port.onmessage?.({data:m} as MessageEvent);if(autoReady)queueMicrotask(()=>emit({type:'ready',source:GENERATION_SOURCE}));return {port,messages,emit,get terminated(){return terminated;},respond(index=0,extra:Record<string,unknown>={}){const m=messages[index];assert.ok(m);emit({type:'result',id:m.id,source:GENERATION_SOURCE,plan:structuredClone(compileGeneration(m.input)),compileMs:1,...extra});}};}

test('actual Node Worker preserves exact legacy/current plan bytes and canonical manifest identities',async t=>{
 const client=createGenerationClient({workerFactory:nodeGenerationWorker});t.after(()=>client.dispose());let requests=0;
 for(const f of fixture.fixtures){
  for(const kind of ['connected','legacy','workshop'] as const){const request={kind,seed:f.seed};const result=await client.request(request);assert.equal(result.backend,'worker');assert.equal(result.fallback,null);assert.equal(result.timings.bootMs>0,requests++===0);assert.equal(JSON.stringify(result.plan),JSON.stringify(compileGeneration(request)));assert.equal(result.plan.manifest,kind==='connected'?CONNECTED_GENERATION_MANIFEST:GENERATION_MANIFEST);assert.ok(Object.isFrozen(result.plan));
   if(result.plan.kind==='connected'){assert.equal(hash(result.plan.valley),f.valley);assert.equal(hash(result.plan.dungeon),f.dungeon);assert.ok(Object.isFrozen(result.plan.valley.terrain.vertices));}
   else{assert.equal(hash(result.plan.workshop),f.workshop);if(result.plan.kind==='legacy')assert.equal(hash(result.plan.dungeon),f.legacyDungeon);}
  }
 }
});
test('protocol rejects invalid requests, oversized/nonfinite/cyclic packets and mismatched source identity',async()=>{
 const client=createGenerationClient();for(const bad of [{kind:'connected',seed:-1},{kind:'connected',seed:1.5},{kind:'connected',seed:2**32},{kind:'connected',seed:1,plan:{}},{kind:'execute',seed:1}])await assert.rejects(client.request(bad as GenerationInput),RangeError);client.dispose();
 for(const corrupt of [(p:any)=>p.seed++,(p:any)=>p.valley.terrain.vertices.push(1),(p:any)=>p.valley.terrain.vertices[0]=Infinity,(p:any)=>p.extra=p,(p:any)=>p.valley.extra='x'.repeat(1000001)]){const plan=structuredClone(compileGeneration(input));corrupt(plan);assert.throws(()=>acceptGenerationPlan(plan,input));}
 const f=fake(false),c=createGenerationClient({workerFactory:()=>f.port});const pending=c.request({kind:'workshop',seed:1});f.emit({type:'ready',source:'different source'});const result=await pending;assert.equal(result.backend,'synchronous');assert.equal(result.fallback,'protocol');assert.equal(f.terminated,1);c.dispose();
});
test('queue has one active and one latest pending; stale replies cannot resolve another seed',async()=>{
 const f=fake(),c=createGenerationClient({workerFactory:()=>f.port});const first=c.request({kind:'workshop',seed:1});await pause();const obsolete=c.request({kind:'workshop',seed:2});const rejected=assert.rejects(obsolete,{name:'AbortError'});const latest=c.request({kind:'workshop',seed:3});assert.deepEqual(c.status,{active:1,queued:1,worker:true,disposed:false});await rejected;
 f.emit({type:'result',id:999,source:GENERATION_SOURCE,plan:compileGeneration({kind:'workshop',seed:99}),compileMs:0});assert.equal(c.status.active,1);f.respond(0);assert.equal((await first).plan.seed,1);assert.equal(f.messages.length,2);f.respond(0);assert.equal(c.status.active,1);f.respond(1);assert.equal((await latest).plan.seed,3);assert.equal(c.status.queued,0);c.dispose();
});
test('abort and dispose terminate stale jobs without fallback, queued work is canceled independently',async()=>{
 const all:ReturnType<typeof fake>[]=[],c=createGenerationClient({workerFactory:()=>{const f=fake();all.push(f);return f.port;}});const a=new AbortController(),b=new AbortController();const active=c.request(input,{signal:a.signal});const ar=assert.rejects(active,{name:'AbortError'});await pause();const queued=c.request({kind:'workshop',seed:1},{signal:b.signal});const qr=assert.rejects(queued,{name:'AbortError'});b.abort();await qr;assert.equal(all[0]!.terminated,0);a.abort();await ar;assert.equal(all[0]!.terminated,1);assert.equal(c.status.active,0);
 const already=new AbortController();already.abort();await assert.rejects(c.request(input,{signal:already.signal}),{name:'AbortError'});assert.equal(all.length,1);
 const next=c.request(input),nr=assert.rejects(next,{name:'AbortError'});await pause();const p=c.request({kind:'workshop',seed:2}),pr=assert.rejects(p,{name:'AbortError'});c.dispose();await Promise.all([nr,pr]);assert.deepEqual(c.status,{active:0,queued:0,worker:false,disposed:true});await assert.rejects(c.request(input),{name:'AbortError'});
});
test('worker setup, error, timeout and malformed results expose measured synchronous fallback',async()=>{
 for(const mode of ['setup','error','timeout','protocol'] as const){const f=fake(mode==='protocol'),c=createGenerationClient({workerFactory:()=>{if(mode==='setup')throw Error('CSP');return f.port;},timeoutMs:10});const pending=c.request({kind:'workshop',seed:4});if(mode==='error')f.port.onerror?.({} as ErrorEvent);if(mode==='protocol'){await pause();f.respond(0,{plan:{}});}const r=await pending;assert.equal(r.fallback,mode);assert.equal(r.backend,'synchronous');assert.deepEqual(r.plan,compileGeneration({kind:'workshop',seed:4}));assert.ok(r.timings.compileMs>=0);c.dispose();}
 const c=createGenerationClient();const r=await c.request({kind:'workshop',seed:2});assert.equal(r.fallback,'unavailable');const intentional=await c.request({kind:'legacy',seed:2},{synchronous:true});assert.equal(intentional.fallback,null);assert.equal(intentional.backend,'synchronous');c.dispose();
});
test('startup hints read bounded known identity records only, retain default and prioritize transport without trusting plans',()=>{
 const state=(seed:number)=>({schemaVersion:6,generation:2,seed,generationManifest:CONNECTED_GENERATION_MANIFEST,plan:{poison:true}});const data=new Map<string,string>([['axiom-active-world','axiom-save-valley2-11'],['axiom-save-valley2-11',JSON.stringify(state(11))],['axiom-save-valley2-11-backup',JSON.stringify(state(10))],['axiom-save-v1',JSON.stringify(state(8))]]),reads:string[]=[];const storage={getItem:(key:string)=>{reads.push(key);return data.get(key)??null;},get length(){throw Error('Must not enumerate');},key(){throw Error('Must not enumerate');}};
 const session={getItem:(key:string)=>key==='axiom-coop-return-v1'?JSON.stringify(state(12)):JSON.stringify({version:1,solo:state(13),world:state(14)})};assert.deepEqual(startupGenerationHints(storage,session),[73129,12,13,14].map(seed=>({generation:2,seed})));assert.ok(reads.length<=7);assert.deepEqual(startupGenerationHints({getItem:()=>{throw Error('Storage unavailable');}}),[{generation:2,seed:73129}]);data.set('axiom-active-world','arbitrary-key');data.set('axiom-save-v1','x'.repeat(100001));assert.deepEqual(startupGenerationHints(storage),[{generation:2,seed:73129}]);assert.ok(!reads.includes('arbitrary-key'));
});
test('private cache handoff uses actual Worker output; previews never replace live cached objects and saves retain validation',async t=>{
 const prior=(globalThis as any).Worker;(globalThis as any).Worker=class{constructor(){return nodeGenerationWorker();}};t.after(()=>{disposeGeneration();if(prior===undefined)delete (globalThis as any).Worker;else (globalThis as any).Worker=prior;});
 const seed=19791979,r=await prepareWorldGeneration({generation:2,seed});assert.equal(r.backend,'worker');assert.equal(r.plan.kind,'connected');if(r.plan.kind!=='connected')throw Error('wrong kind');assert.equal(worldValley(seed),r.plan.valley);assert.equal(worldDungeon({generation:2,seed}),r.plan.dungeon);assert.equal((await prepareWorldGeneration({generation:2,seed})).backend,'cache');
 const state=createConnectedState(seed),bytes=serializeSave(state);assert.equal(serializeSave(parseSave(bytes)!),bytes);assert.equal(parseSave(JSON.stringify({...state,generationManifest:{...state.generationManifest,contentHash:'poison'}})),null);
 for(const seed of [22,23,24,25,26])await previewGeneration({kind:'connected',seed});assert.equal(worldValley(state.seed),r.plan.valley);assert.equal(worldDungeon(state),r.plan.dungeon);
 const abort=new AbortController();const p=prepareWorldGeneration({generation:2,seed:91828723},abort.signal),rejected=assert.rejects(p,{name:'AbortError'});abort.abort();await rejected;assert.equal(serializeSave(state),bytes);assert.equal((await prepareWorldGeneration({generation:2,seed:91828723})).backend,'worker','aborted preparation never populated the cache');
});
test('one aggregate startup deadline and failure latch bound multiple failing hints',async()=>{
 const hints=[701,702,703,704].map(seed=>({kind:'connected' as const,seed}));let starts=0;const c=createGenerationClient({workerFactory:()=>{starts++;return fake(false).port;},timeoutMs:15});const results=[];const deadline=performance.now()+1500;
 for(const input of hints){const remaining=deadline-performance.now();if(remaining<=0)break;results.push(await c.request(input,{timeoutMs:remaining}));}
 assert.equal(results.length,4);assert.equal(starts,1,'first timeout disables further Worker starts');assert.ok(results.every(r=>r.backend==='synchronous'&&r.fallback==='timeout'));c.dispose();
 let attempts=0;const d=createGenerationClient({workerFactory:()=>{attempts++;return fake(false).port;}});const shortDeadline=performance.now()+1;let prepared=0;for(const input of hints){const remaining=shortDeadline-performance.now();if(remaining<=0)break;await d.request(input,{timeoutMs:remaining});prepared++;}assert.ok(prepared<=1,'exhausted aggregate budget skips remaining hints');assert.equal(attempts,prepared);d.dispose();
});
