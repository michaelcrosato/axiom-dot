import test from 'node:test';import assert from 'node:assert/strict';import {Worker} from 'node:worker_threads';
import {runWildernessLab,wildernessProbeFixtures,type WildernessProbeWorker} from '../src/wilderness-lab.ts';
function makeWorker():WildernessProbeWorker{
 const native=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);let ready=false,q=[];parentPort.on('message',m=>ready?self.onmessage({data:m}):q.push(m));import(${JSON.stringify(new URL('../src/physics.worker.ts',import.meta.url).href)}).then(()=>{ready=true;for(const m of q)self.onmessage({data:m});q=[];});`,{eval:true,execArgv:['--experimental-strip-types']});
 const adapter:WildernessProbeWorker={postMessage:m=>native.postMessage(m),terminate:()=>native.terminate(),onmessage:null,onerror:null};native.on('message',m=>adapter.onmessage?.({data:m}));native.on('error',e=>adapter.onerror?.(e));return adapter;
}
test('isolated live collision probes repeat actual worker solids without penetrating either saved generation',{timeout:30000},async()=>{
 const fixtures=wildernessProbeFixtures(73129);assert.equal(fixtures.length,8);const report=await runWildernessLab(73129,3,{makeWorker,sourceRevision:'test'});assert.equal(report.status,'complete',report.error);assert.equal(report.runs.length,24);for(const r of report.runs)assert(r.pass,JSON.stringify(r));assert(report.runs.every(r=>r.samples===205));
 for(const fixture of fixtures){const repeats=report.runs.filter(r=>r.featureId===fixture.featureId);assert.equal(repeats.length,3);assert.deepEqual(repeats.map(r=>r.final),[repeats[0]!.final,repeats[0]!.final,repeats[0]!.final]);}
});
test('cancelled collision probes return an explicit incomplete report and never fabricate samples',async()=>{const controller=new AbortController();controller.abort();const report=await runWildernessLab(1,5,{signal:controller.signal,makeWorker});assert.equal(report.status,'interrupted');assert.equal(report.runs.length,0);assert.match(report.error!,/cancelled/);});
