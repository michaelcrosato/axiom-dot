import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {readFileSync} from 'node:fs';
import {runRegionalCalibration,type RegionalCalibrationWorker} from '../src/regional-metrics.ts';
function workerFactory():RegionalCalibrationWorker{
 const node=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);const boot=import(${JSON.stringify(new URL('../src/physics.worker.ts',import.meta.url).href)});parentPort.on('message',async m=>{await boot;self.onmessage({data:m});});`,{eval:true,execArgv:['--experimental-strip-types']});
 const adapter:RegionalCalibrationWorker={postMessage:m=>node.postMessage(m),terminate:()=>node.terminate(),onmessage:null,onerror:null};node.on('message',m=>adapter.onmessage?.({data:m}));node.on('error',e=>adapter.onerror?.(e));return adapter;
}
test('flat metres/second and acceleration are calibrated using actual production controller 60 Hz traces',async t=>{
 const progress:number[]=[],report=await runRegionalCalibration({workerFactory,progress:n=>progress.push(n)});assert.equal(report.status,'complete',report.error);assert.equal(report.measurements.length,6);assert.ok(report.measurements.every(m=>m.pass),JSON.stringify(report));assert.deepEqual(progress,[1,2,3,4,5,6]);assert.equal(report.hz,60);assert.equal(report.sprintConsumesStamina,false);assert.equal(report.accelerationMetresPerSecondSquared,22);
 for(const m of report.measurements){assert.equal(m.samples,600);assert.equal(m.seconds,10);assert.ok(m.distanceMetres<m.expectedSpeed*10);assert.ok(m.distanceMetres>m.expectedSpeed*10-1.6);t.diagnostic(JSON.stringify(m));}
 const touch=report.measurements.slice(0,4);assert.deepEqual(touch.map(m=>Math.round(m.expectedSpeed)),[2,4,6,8]);assert.ok(Math.abs(report.measurements[4]!.expectedSpeed-5)<1e-8);assert.equal(report.measurements[5]!.expectedSpeed,8);
 const worker=readFileSync(new URL('../src/physics.worker.ts',import.meta.url),'utf8'),motor=readFileSync(new URL('../src/locomotion.ts',import.meta.url),'utf8');assert.ok(!/stamina/i.test(worker+motor),'physics/motor have no hidden sprint stamina path');
});
test('cancelled calibration terminates its disposable worker and cannot become a completed report',async()=>{const controller=new AbortController();controller.abort();let terminated=false;const report=await runRegionalCalibration({signal:controller.signal,workerFactory:()=>({postMessage(){assert.fail('aborted run must not send a world packet');},terminate(){terminated=true;},onmessage:null,onerror:null})});assert.equal(report.status,'interrupted');assert.match(report.error!,/cancelled/);assert.equal(terminated,true);assert.deepEqual(report.measurements,[]);});
