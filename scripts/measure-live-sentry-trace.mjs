/** Bounded Node allocation/CPU probe, not browser frame time or a device-performance claim. */
import {performance} from 'node:perf_hooks';
import {createLiveSentryTrace,appendLiveSentryTrace,exportLiveSentryTrace,replayLiveSentryTrace} from '../src/live-sentry-trace.ts';
const pose={epoch:1,step:0,x:-17,z:-17,feetY:0,facing:0,grounded:true,crouched:false,stance:0};
let recording=createLiveSentryTrace({seed:73129,epoch:1});
const costs=[],start=performance.now(),cpu=process.cpuUsage();
for(let i=0;i<3600;i++){
 const before=performance.now();
 recording=appendLiveSentryTrace(recording,{type:i===0?'resume':'step',frame:{...pose,step:i}});
 costs.push(performance.now()-before);
}
const wallMs=performance.now()-start,usage=process.cpuUsage(cpu);costs.sort((a,b)=>a-b);
const exportStart=performance.now(),trace=exportLiveSentryTrace(recording),encoded=JSON.stringify(trace),exportMs=performance.now()-exportStart;
const replayStart=performance.now(),replay=replayLiveSentryTrace(trace),replayMs=performance.now()-replayStart;
if(!replay.matchesPrefixFinal||trace.commands.length!==3600||trace.truncated)throw new Error('Probe did not retain its complete replayable prefix');
console.log(JSON.stringify({scope:'One bounded Node run; no browser, raster, frame-time, FPS or device-performance claim',node:process.version,platform:process.platform,arch:process.arch,commands:trace.commands.length,simulationTicks:recording.state.tick,workload:'Grounded player outside sentry sense; full-prefix append/copy/encoding allocation, not representative combat workload',wallMs,cpuMs:{user:usage.user/1000,system:usage.system/1000},appendMs:{p50:costs[Math.ceil(costs.length*.5)-1],p95:costs[Math.ceil(costs.length*.95)-1],max:costs.at(-1)},encodedBytes:Buffer.byteLength(encoded),exportMs,replayMs,matchesPrefixFinal:replay.matchesPrefixFinal},null,2));
