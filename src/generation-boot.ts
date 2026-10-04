import type {StartupGenerationHint} from './generation-startup.ts';
import type {GenerationResult} from './generation-client.ts';
export interface GenerationBootReport {budgetMs:number;durationMs:number;attempted:number;skipped:number;aborted:boolean;errors:number;results:{seed:number;backend:GenerationResult['backend'];fallback:GenerationResult['fallback'];timings:GenerationResult['timings']}[]}
type Prepare=(identity:StartupGenerationHint,signal?:AbortSignal,timeoutMs?:number)=>Promise<GenerationResult>;
/** Speculative warming only. The ordinary state loader and validators still run afterward. */
export async function warmGenerationStartup(hints:readonly StartupGenerationHint[],prepare:Prepare,options:{signal?:AbortSignal;now?:()=>number;budgetMs?:number;status?:(message:string)=>void}={}):Promise<GenerationBootReport>{
 const now=options.now??(()=>performance.now()),start=now(),budgetMs=Math.max(1,Math.min(1500,Number.isFinite(options.budgetMs)?options.budgetMs!:1500)),bounded=hints.slice(0,4),report:GenerationBootReport={budgetMs,durationMs:0,attempted:0,skipped:hints.length,aborted:false,errors:0,results:[]};
 for(const identity of bounded){
  if(options.signal?.aborted){report.aborted=true;break;}const remaining=budgetMs-(now()-start);if(remaining<=0)break;
  report.attempted++;options.status?.(`Preparing connected world ${identity.seed}…`);
  try{const result=await prepare(identity,options.signal,remaining);if(options.signal?.aborted){report.aborted=true;break;}report.results.push({seed:identity.seed,backend:result.backend,fallback:result.fallback,timings:{...result.timings}});}
  catch(error){if(options.signal?.aborted||error instanceof Error&&error.name==='AbortError'){report.aborted=true;break;}report.errors++;}
 }
 report.durationMs=Math.max(0,now()-start);report.skipped=hints.length-report.attempted;return report;
}
export function generationBootSummary(report:GenerationBootReport){const count=(backend:GenerationResult['backend'])=>report.results.filter(r=>r.backend===backend).length,failures=[...new Set(report.results.flatMap(r=>r.fallback?[r.fallback]:[]))];return `Generation warm-up: ${count('worker')} worker · ${count('cache')} cached · ${count('synchronous')} synchronous · ${report.durationMs.toFixed(0)} ms total${failures.length?' · fallback '+failures.join(', '):''}${report.errors?' · '+report.errors+' preparation error':''}${report.skipped?' · '+report.skipped+' hints skipped':''}${report.aborted?' · canceled':''}. This is startup preparation, not a frame-rate measurement.`;}
