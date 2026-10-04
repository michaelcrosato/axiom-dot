import {Worker} from 'node:worker_threads';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {createGenerationClient} from '../src/generation-client.ts';
import {nodeGenerationWorker} from '../tests/helpers/generation-node-worker.ts';
const base=new URL('../src/',import.meta.url).href;
const program=`
const {generateValley}=await import(${JSON.stringify(base+'valley.ts')});
const {generateDungeonPlan}=await import(${JSON.stringify(base+'dungeon-plan.ts')});
const {generateDungeon,DUNGEON_SPAWN}=await import(${JSON.stringify(base+'dungeon.ts')});
const {compileWorkshop}=await import(${JSON.stringify(base+'building.ts')});
function compile(generation,seed){const t=performance.now();const valley=generation===2?generateValley(seed):undefined;const v=performance.now();const dungeon=generation===2?generateDungeonPlan(seed):{...generateDungeon(seed),spawn:DUNGEON_SPAWN,bound:48};const d=performance.now();const workshop=generation===1?compileWorkshop(seed):undefined;return {plan:{generation,seed,...(valley?{valley}:{}),dungeon,...(workshop?{workshop}:{})},timings:{valley:v-t,dungeon:d-v,workshop:performance.now()-d,total:performance.now()-t}};}
`;
const freeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
const results={coldSync:[],coldWorker:[],warmWorker:[]};
for(const generation of [1,2])for(const seed of [0,1,606,73129,4294967295]){
 const r=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',program+`const x=compile(${generation},${seed});console.log(JSON.stringify({generation:${generation},seed:${seed},...x.timings,bytes:JSON.stringify(x.plan).length}));`],{encoding:'utf8'}));results.coldSync.push(r);
}
for(const generation of [1,2]){
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');(async()=>{${program};parentPort.on('message',({generation,seed})=>parentPort.postMessage(compile(generation,seed)));parentPort.postMessage('ready');})();`,{eval:true,execArgv:['--experimental-strip-types']});
 let lastTick=performance.now(),maxGap=0,tickCount=0;const interval=setInterval(()=>{const now=performance.now();maxGap=Math.max(maxGap,now-lastTick);lastTick=now;tickCount++;},1);
 const started=performance.now();await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});const boot=performance.now()-started;
 for(const [i,seed]of [0,1,606,73129,4294967295].entries()){
  maxGap=0;tickCount=0;lastTick=performance.now();const start=performance.now();const response=await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage({generation,seed});});const roundtrip=performance.now()-start;const f=performance.now();freeze(response.plan);const freezeMs=performance.now()-f;await new Promise(resolve=>setTimeout(resolve,0));
  results[i===0?'coldWorker':'warmWorker'].push({generation,seed,boot:i===0?boot:0,...response.timings,roundtrip,freezeMs,maxParentGap:maxGap,tickCount,bytes:JSON.stringify(response.plan).length});
 }
 clearInterval(interval);await worker.terminate();
}
results.productionClient=[];
const client=createGenerationClient({workerFactory:nodeGenerationWorker});
for(const seed of [0,1,606,73129,4294967295]){
 let lastTick=performance.now(),maxGap=0,ticks=0;
 const interval=setInterval(()=>{const now=performance.now();maxGap=Math.max(maxGap,now-lastTick);lastTick=now;ticks++;},1);
 const result=await client.request({kind:'connected',seed});
 await new Promise(resolve=>setTimeout(resolve,0));clearInterval(interval);
 results.productionClient.push({seed,backend:result.backend,fallback:result.fallback,...result.timings,bytes:JSON.stringify(result.plan).length,maxParentGap:maxGap,parentTicks:ticks});
}
client.dispose();
console.log(JSON.stringify(results,null,2));
