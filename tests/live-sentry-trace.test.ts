import test from 'node:test';import assert from 'node:assert/strict';
import {createLiveSentryTrace,appendLiveSentryTrace,replayLiveSentryTrace,exportLiveSentryTrace,LIVE_SENTRY_TRACE_LIMITS,type LivePracticeRecording,type LivePracticeCommand} from '../src/live-sentry-trace.ts';
import {liveSentrySnapshot,type LivePracticeFrame} from '../src/live-sentry-practice.ts';
const start:LivePracticeFrame={epoch:4,step:100,x:8,z:5.5,feetY:0,facing:0,grounded:true,crouched:false,stance:0};
const apply=(r:LivePracticeRecording,c:LivePracticeCommand)=>appendLiveSentryTrace(r,c);

test('compact ordered trace replays exactly across guard, movement, interruption, resume, staff and disable',()=>{
 let r=createLiveSentryTrace({seed:73129,epoch:4});r=apply(r,{type:'resume',frame:{...start,unrelatedCampaign:{secret:'must not be retained'}} as LivePracticeFrame});
 for(let n=1;n<=100;n++){if(n===46)r=apply(r,{type:'guard',intentId:'timed'});r=apply(r,{type:'step',frame:{...start,step:100+n}});}
 r=apply(r,{type:'attack',source:'manual'});r=apply(r,{type:'cancel',reason:'jump'});r=apply(r,{type:'suspend',reason:'menu'});r=apply(r,{type:'resume',frame:{...start,step:500}});
 for(let n=1;n<=90;n++)r=apply(r,{type:'step',frame:{...start,step:500+n}});
 r=apply(r,{type:'disable',reason:'suite'});
 const saved=exportLiveSentryTrace(r),roundtrip=JSON.parse(JSON.stringify(saved)),replay=replayLiveSentryTrace(roundtrip);
 assert(replay.matchesPrefixFinal);assert.deepEqual(replay.snapshot,liveSentrySnapshot(r.state));assert.equal(saved.truncated,false);assert.equal(saved.initial.status,'ready');assert.equal(saved.prefixFinal.status,'disabled');assert(!JSON.stringify(saved).includes('unrelatedCampaign'));assert(saved.commands.every(c=>!('state' in c)&&!('snapshot' in c)));
 const initial=createLiveSentryTrace({seed:73129,epoch:5});assert.equal(initial.trace.commands.length,0);assert.equal(initial.trace.prefixFinal.hp,100);assert.equal(initial.trace.prefixFinal.combo.stamina,100);
 saved.prefixFinal.combo.stamina=0;assert.notEqual(r.trace.prefixFinal.combo.stamina,0,'export is not a mutable live-state alias');
});

test('3600-entry cap freezes a replayable prefix but continues the actual live controller',()=>{
 let r=createLiveSentryTrace({seed:1,epoch:4});r=apply(r,{type:'resume',frame:{...start,x:-17,z:-17}});
 for(let n=1;n<3600;n++)r=apply(r,{type:'step',frame:{...start,x:-17,z:-17,step:100+n}});
 const prefix=structuredClone(r.trace.prefixFinal),old=r;
 r=apply(r,{type:'step',frame:{...start,x:-17,z:-17,step:3700}});
 assert.equal(r.trace.commands.length,3600);assert(r.trace.truncated);assert.equal(r.trace.truncationReason,'entry-limit');assert.equal(r.trace.droppedEntries,1);assert.deepEqual(r.trace.prefixFinal,prefix);assert.equal(r.state.tick,old.state.tick+1);
 r=apply(r,{type:'step',frame:{...start,x:-17,z:-17,step:3701}});assert.equal(r.trace.droppedEntries,2);assert.deepEqual(r.trace.prefixFinal,prefix);
 const trace=exportLiveSentryTrace(r);assert(new TextEncoder().encode(JSON.stringify(trace)).length<=LIVE_SENTRY_TRACE_LIMITS.encodedBytes);assert(replayLiveSentryTrace(trace).matchesPrefixFinal);assert.notDeepEqual(liveSentrySnapshot(r.state),trace.prefixFinal);
});

test('malformed or unbounded command ends diagnostic prefix honestly instead of retaining non-JSON data',()=>{
 let r=createLiveSentryTrace({seed:7,epoch:4});r=apply(r,{type:'resume',frame:start});const before=structuredClone(r.trace.prefixFinal);
 r=apply(r,{type:'step',frame:{...start,step:101,x:NaN}});assert.equal(r.state.status,'paused');assert(r.trace.truncated);assert.equal(r.trace.truncationReason,'unrecordable-command');assert.deepEqual(r.trace.prefixFinal,before);assert(replayLiveSentryTrace(exportLiveSentryTrace(r)).matchesPrefixFinal);
 r=apply(r,{type:'guard',intentId:'x'.repeat(20000)});assert.equal(r.trace.droppedEntries,2);assert(!JSON.stringify(exportLiveSentryTrace(r)).includes('x'.repeat(100)));
});

test('finite byte budget also bounds unusually long numeric frames and all retained JSON',()=>{
 let r=createLiveSentryTrace({seed:7,epoch:4});r=apply(r,{type:'resume',frame:start});const huge=1.2345678901234567e300;
 for(let i=0;i<3700&&!r.trace.truncated;i++)r=apply(r,{type:'step',frame:{epoch:huge,step:huge,x:huge,z:huge,feetY:huge,facing:huge,stance:huge,grounded:true,crouched:false}});
 assert(r.trace.truncated);assert.equal(r.trace.truncationReason,'byte-limit');const exported=exportLiveSentryTrace(r);assert(new TextEncoder().encode(JSON.stringify(exported)).length<=1024*1024);assert(replayLiveSentryTrace(exported).matchesPrefixFinal);
});
