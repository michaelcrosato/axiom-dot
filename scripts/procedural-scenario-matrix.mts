import {mkdirSync,existsSync,readdirSync,readFileSync,writeFileSync,appendFileSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {setImmediate as yieldTurn} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {MATRIX_VERSION,MATRIX_CASES,sampledSeeds,planMatrix,runMatrixCase} from './lib/procedural-scenario-matrix.ts';

const usage=`AXIOM bounded production scenario regression matrix
node --experimental-strip-types scripts/procedural-scenario-matrix.mts [options]
  --seeds 73129,42,0       explicit distinct uint32 seeds (maximum 128)
  --seed-count 20          deterministic sample size; incompatible with --seeds
  --sample-seed 2802851878 LCG seed for the sample tail; fixed boundary anchors
  --cases ID,ID            choose stable case IDs (--list lists them)
  --coverage sampled      first seed: all selected cases; others: rotating baselines
             cartesian    explicitly run every selected seed/case pair
  --seconds 3600          shorten each case; never lengthens its ordinary window
  --budget-seconds 1800   cooperative wall-time budget, including validation
  --output /tmp/matrix    new or empty evidence folder (default: timestamped /tmp)
  --list                  show cases and default seeds without running models
  --help                  show this help

Reports are disposable workbench replay recipes, never live campaign inputs.
Every settlement starts at zero. The separate canister case earns its setup;
setup time is reported separately. No browser, network, terminal-clock review,
deployment or release approval. Exit 0 complete/pass, 1 failures, 2 bad arguments,
3 incomplete/time budget/signal. SIGINT/SIGTERM leave partial replay evidence.
`;
let executionStarted=false;
try{
 const args=process.argv.slice(2),flags=new Map<string,string>(),valued=new Set(['--seeds','--seed-count','--sample-seed','--cases','--coverage','--seconds','--budget-seconds','--output']);
 for(let i=0;i<args.length;i++){const key=args[i]!;if(flags.has(key))throw Error('Duplicate argument '+key);if(['--help','--list'].includes(key)){flags.set(key,'yes');continue;}if(!valued.has(key))throw Error('Unknown argument '+key);const value=args[++i];if(value===undefined||value.startsWith('--')||!value.trim())throw Error('Missing value for '+key);flags.set(key,value);}
 if(flags.has('--help')){console.log(usage);process.exit(0);}
 const number=(key:string,fallback:number)=>{const raw=flags.get(key);if(raw!==undefined&&!/^\d+(?:\.\d+)?$/.test(raw))throw Error('Invalid number for '+key);return raw===undefined?fallback:Number(raw);};
 if(flags.has('--seeds')&&(flags.has('--seed-count')||flags.has('--sample-seed')))throw Error('--seeds cannot combine with sample options');
 const explicit=flags.get('--seeds');if(explicit&&!/^\d+(,\d+)*$/.test(explicit))throw Error('Seeds must be comma-separated uint32 integers');
 const seeds=explicit?explicit.split(',').map(Number):sampledSeeds(number('--seed-count',20),number('--sample-seed',0xa7102026)),caseIds=flags.get('--cases')?.split(',')??MATRIX_CASES.map(c=>c.id),coverage=flags.get('--coverage')??'sampled';
 if(coverage!=='sampled'&&coverage!=='cartesian')throw Error('Coverage must be sampled or cartesian');
 const jobs=planMatrix(seeds,caseIds,coverage,flags.has('--seconds')?number('--seconds',3600):undefined),budget=number('--budget-seconds',1800);
 if(!Number.isFinite(budget)||budget<=0||budget>86400)throw Error('Wall budget must be >0 and <=86400 seconds');
 if(flags.has('--list')){console.log(JSON.stringify({version:MATRIX_VERSION,cases:MATRIX_CASES,seeds,coverage,planned:jobs.map(j=>({id:j.id,seed:j.seed,seconds:j.seconds}))},null,2));process.exit(0);}
 const folder=resolve(flags.get('--output')??`/tmp/axiom-procedural-matrix-${new Date().toISOString().replace(/[:.]/g,'-')}`);
 if(existsSync(folder)&&readdirSync(folder).length)throw Error('Output folder must be new or empty; previous evidence is never overwritten');executionStarted=true;mkdirSync(folder,{recursive:true});mkdirSync(resolve(folder,'reports'));
 let revision='not-recorded';try{revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();if(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim())revision+='-working';}catch{}
 const root=resolve(import.meta.dirname,'..'),sourceFiles=[...readdirSync(resolve(root,'src')).filter(f=>f.endsWith('.ts')).map(f=>'src/'+f),'scripts/procedural-scenario-matrix.mts','scripts/lib/procedural-scenario-matrix.ts'];
 writeFileSync(resolve(folder,'source-hashes.json'),JSON.stringify(Object.fromEntries(sourceFiles.sort().map(file=>[file,createHash('sha256').update(readFileSync(resolve(root,file))).digest('hex')])),null,2)+'\n');
 const start=performance.now(),startedUTC=new Date().toISOString(),deadline=start+budget*1000;let stopped:string|null=null;const onInt=()=>{stopped='Interrupted by SIGINT';},onTerm=()=>{stopped='Interrupted by SIGTERM';};process.on('SIGINT',onInt);process.on('SIGTERM',onTerm);
 const summary={kind:'axiom-procedural-scenario-matrix',version:MATRIX_VERSION,sourceRevision:revision,runtime:process.version,startedUTC,finishedUTC:null as string|null,coverage,seeds,cases:caseIds,budgetSeconds:budget,wallMilliseconds:0,status:'running',planned:jobs.map(j=>({id:j.id,seed:j.seed,caseId:j.scenario.id,seconds:j.seconds})),attempted:0,passed:0,failed:0,incomplete:0,passedCaseSeeds:[] as number[],pending:jobs.map(j=>j.id),outcomes:{} as Record<string,number>,maxSampledBalanceError:0,scenarioTimelineSecondsExecuted:0,prerequisiteTimelineSecondsExecuted:0,logicalTimelineSecondsExecuted:0,simulationAccounting:'Logical forward/control/report-replay timelines and fixture clocks; excludes internal strict-save validation replay work. Milestones are first-observation intervals, not invented exact times.',scope:'Disposable production modules, ordinary scenario windows <=3600s. Existing earned canister setup is separately counted. Conservation and exact replay do not guarantee meals for every seed. No terminal-clock review, browser, registry, live saves, network, deployment, released archive replacement, or release approval.',reason:null as string|null};
 const writeSummary=()=>{summary.wallMilliseconds=performance.now()-start;summary.logicalTimelineSecondsExecuted=summary.scenarioTimelineSecondsExecuted+summary.prerequisiteTimelineSecondsExecuted;writeFileSync(resolve(folder,'summary.tmp'),JSON.stringify(summary,null,2)+'\n');renameSync(resolve(folder,'summary.tmp'),resolve(folder,'summary.json'));};
 writeFileSync(resolve(folder,'results.jsonl'),'');writeSummary();
 try{for(const job of jobs){
  await yieldTurn();if(stopped||performance.now()>=deadline){summary.reason=stopped??'Wall-time budget reached before next case';break;}
  const result=await runMatrixCase(job,{revision,deadline,stop:()=>stopped,artifact:(name,report)=>writeFileSync(resolve(folder,'reports',name),JSON.stringify(report)+'\n')});
  appendFileSync(resolve(folder,'results.jsonl'),JSON.stringify(result)+'\n');summary.attempted++;summary[result.status==='passed'?'passed':result.status==='failed'?'failed':'incomplete']++;summary.pending.shift();
  if(result.status==='passed'&&!summary.passedCaseSeeds.includes(job.seed))summary.passedCaseSeeds.push(job.seed);
  summary.outcomes[result.outcome]=(summary.outcomes[result.outcome]??0)+1;summary.maxSampledBalanceError=Math.max(summary.maxSampledBalanceError,result.maxSampledBalanceError);summary.scenarioTimelineSecondsExecuted+=result.scenarioTimelineSecondsExecuted;summary.prerequisiteTimelineSecondsExecuted+=result.prerequisiteTimelineSecondsExecuted;writeSummary();
  console.log(JSON.stringify({id:job.id,status:result.status,outcome:result.outcome,seconds:result.scenarioSeconds,wallMilliseconds:result.wallMilliseconds,progress:`${summary.attempted}/${jobs.length}`,estimatedRemainingMilliseconds:Math.round(summary.wallMilliseconds/summary.attempted*summary.pending.length),reason:result.reason}));
  if(result.status==='incomplete'){summary.reason=result.reason;break;}
 }}catch(error){summary.failed++;summary.reason='Evidence/execution failure: '+(error instanceof Error?error.message:String(error));console.error(summary.reason);}finally{process.off('SIGINT',onInt);process.off('SIGTERM',onTerm);summary.finishedUTC=new Date().toISOString();summary.status=summary.failed?'failed':summary.incomplete||summary.pending.length?'incomplete':'passed';writeSummary();}
 console.log(JSON.stringify({status:summary.status,passed:summary.passed,failed:summary.failed,incomplete:summary.incomplete,pending:summary.pending.length,seedsWithPassedCases:summary.passedCaseSeeds.length,wallMilliseconds:summary.wallMilliseconds,evidence:folder}));process.exitCode=summary.failed?1:summary.status==='incomplete'?3:0;
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=executionStarted?1:2;}
