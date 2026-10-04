import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {MATRIX_CASES,sampledSeeds,planMatrix,runMatrixCase} from '../scripts/lib/procedural-scenario-matrix.ts';
import {parseWorkbenchReport,replayWorkbench,type WorkbenchReport} from '../src/system-workbench-model.ts';

test('matrix sampling is deterministic, diverse, bounded and stable without a Cartesian default',()=>{
 const seeds=sampledSeeds();assert.equal(seeds.length,20);assert.equal(new Set(seeds).size,20);assert.deepEqual(seeds.slice(0,6),[73129,0,1,42,0xffffffff,0x80000000]);assert.deepEqual(seeds,sampledSeeds());assert.notDeepEqual(seeds,sampledSeeds(20,42));
 const jobs=planMatrix(seeds);assert.equal(jobs.length,27);assert.equal(new Set(jobs.map(j=>j.id)).size,27);assert.equal(new Set(jobs.map(j=>j.seed)).size,20);assert.equal(jobs.filter(j=>j.seed===73129).length,8);
 for(const c of MATRIX_CASES.slice(0,4))assert(jobs.filter(j=>j.scenario.id===c.id).length>=5);
 assert.equal(planMatrix([0,1],['settlement-legacy-legacy','settlement-regional-regional'],'cartesian').length,4);assert.equal(planMatrix([0],['food-earned-canister'],'sampled',3600)[0]!.seconds,400);
 for(const seeds of [[],[1,1],[-1],[4294967296],[NaN]])assert.throws(()=>planMatrix(seeds));
 for(const count of [0,129,1.5])assert.throws(()=>sampledSeeds(count));for(const ids of [[],['bad'],['food-earned-canister','food-earned-canister']])assert.throws(()=>planMatrix([0],ids));
 for(const seconds of [-1,.1,3600.25,Infinity])assert.throws(()=>planMatrix([0],undefined,'sampled',seconds));
});
test('ordinary short matrix uses production actions, distinguishes pending gameplay, and exports exact replay',async()=>{
 const job=planMatrix([42],['settlement-quarter-staggered'],'sampled',20)[0]!,artifacts=new Map<string,WorkbenchReport>();
 const result=await runMatrixCase(job,{revision:'test',artifact:(name,r)=>artifacts.set(name,structuredClone(r))});assert.equal(result.status,'passed',result.reason??'');assert.equal(result.outcome,'prerequisites-pending-within-window');assert.equal(result.setupActiveSeconds,0);assert(result.reloads.every(r=>r.pass));assert(result.replay.match);assert.equal(result.scenarioTimelineSecondsExecuted,40);assert.equal(result.prerequisiteTimelineSecondsExecuted,0);
 const report=artifacts.get(job.id+'.replay.json')!;assert(report);assert.equal(report.finalTick,80);assert.equal(report.events[0]!.tick,3);assert.equal(report.events[1]!.tick,3);assert(report.events.every(e=>e.accepted));assert(replayWorkbench(parseWorkbenchReport(JSON.stringify(report)),'test').result.match);
});
test('interrupted ordinary report resumes at the fractional-action boundary without duplicated commands',async()=>{
 const job=planMatrix([73129],['settlement-interrupted-resume'],'sampled',434)[0]!;
 const result=await runMatrixCase(job,{revision:'test'});assert.equal(result.status,'passed',result.reason??'');assert.deepEqual(result.resume,{tick:1733,match:true});assert(result.reloads.some(r=>r.tick===1733));assert.equal(result.scenarioTimelineSecondsExecuted,434*2+433.25);assert(result.replay.match);
});
test('budget and cancellation are incomplete rather than false passes and preserve replayable partial reports',async()=>{
 const job=planMatrix([0],['settlement-regional-regional'],'sampled',20)[0]!,saved:WorkbenchReport[]=[];let calls=0;
 const cancelled=await runMatrixCase(job,{stop:()=>++calls>4?'Requested interruption':null,artifact:(_name,r)=>saved.push(r)});assert.equal(cancelled.status,'incomplete');assert.match(cancelled.reason!,/interruption/);assert(cancelled.scenarioSeconds<20);assert(!cancelled.replay.checked);assert.equal(saved.length,1);assert(replayWorkbench(parseWorkbenchReport(JSON.stringify(saved[0]))).result.match);
 const budget=await runMatrixCase(job,{now:()=>10,deadline:10});assert.equal(budget.status,'incomplete');assert.equal(budget.sampleCount,0);assert.equal(budget.finalFingerprint,null);
});
test('matrix failure artifacts retain expected and actual reports plus the earliest sampled divergence',async()=>{
 const job=planMatrix([0],['settlement-legacy-legacy'],'sampled',20)[0]!,saved=new Map<string,WorkbenchReport>();
 const result=await runMatrixCase(job,{artifact:(name,r)=>{if(name===job.id+'.replay.json')r.checkpoints[1]!.fingerprint='00000000';saved.set(name,structuredClone(r));}});
 assert.equal(result.status,'failed');assert.equal(result.replay.firstDifference,'State first differs at sampled tick 40');assert(saved.has(job.id+'.replay.json'));assert(saved.has(job.id+'.actual-replay.json'));assert(saved.has(job.id+'.failure.replay.json'));assert.equal(saved.get(job.id+'.actual-replay.json')!.finalFingerprint,result.finalFingerprint);
});
test('artifact I/O errors stay structured and no missing file is claimed as saved',async()=>{
 const job=planMatrix([0],['settlement-legacy-legacy'],'sampled',1)[0]!;let calls=0;
 const result=await runMatrixCase(job,{artifact:()=>{calls++;throw Error('disk full');}});assert.equal(result.status,'failed');assert.match(result.reason!,/disk full/);assert.equal(calls,2);assert.equal(result.artifacts.length,0);assert.equal(result.artifactErrors.length,2);
});
test('a budget exhausted during final validation is explicitly incomplete',async()=>{
 const job=planMatrix([0],['settlement-legacy-legacy'],'sampled',1)[0]!;let elapsed=0;
 const result=await runMatrixCase(job,{now:()=>elapsed,deadline:10,yield:async()=>{elapsed=11;}});assert.equal(result.status,'incomplete');assert(result.replay.checked&&result.replay.match);assert.equal(result.wallMilliseconds,11);assert.match(result.reason!,/budget/);
});
test('matrix CLI validates options, streams results, protects evidence and reports a tiny budget honestly',()=>{
 const root=mkdtempSync(join(tmpdir(),'axiom-matrix-cli-')),run=(args:string[])=>spawnSync(process.execPath,['--experimental-strip-types','scripts/procedural-scenario-matrix.mts',...args],{cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:30000});
 try{
  const out=join(root,'run'),args=['--seeds','42','--cases','settlement-regional-regional','--seconds','1','--output',out],result=run(args);assert.equal(result.status,0,result.stderr);const summary=JSON.parse(readFileSync(join(out,'summary.json'),'utf8')),rows=readFileSync(join(out,'results.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.equal(summary.status,'passed');assert.equal(summary.passed,1);assert.equal(summary.pending.length,0);assert.equal(rows.length,1);assert.equal(summary.logicalTimelineSecondsExecuted,2);assert.equal(run(args).status,2,'Never overwrite previous evidence');
  for(const bad of [['--seeds','1,1'],['--seeds','1','--seed-count','2'],['--seeds','1,'],['--cases','unknown'],['--budget-seconds','0'],['--seconds','0.1'],['--coverage','all'],['--seeds','1','--seeds','2'],['--unknown'],['--output']])assert.equal(run(bad).status,2,bad.join(' '));
  const list=run(['--list']);assert.equal(list.status,0,list.stderr);assert.equal(JSON.parse(list.stdout).planned.length,27);
  const partial=join(root,'partial'),short=run(['--seeds','42','--cases','settlement-regional-regional','--budget-seconds','0.001','--output',partial]);assert.equal(short.status,3,short.stderr);const incomplete=JSON.parse(readFileSync(join(partial,'summary.json'),'utf8'));assert.equal(incomplete.status,'incomplete');assert.equal(incomplete.passed,0);assert(incomplete.incomplete+incomplete.pending.length>0);
 }finally{rmSync(root,{recursive:true,force:true});}
});
