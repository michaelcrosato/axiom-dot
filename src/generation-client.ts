import {compileGeneration} from './generation-compile.ts';
import {GENERATION_SOURCE,GENERATION_LIMITS,validGenerationInput,acceptGenerationPlan,generationAbort,type GenerationInput,type GenerationPlan} from './generation-protocol.ts';
export type GenerationFallback='unavailable'|'setup'|'error'|'timeout'|'protocol';
export interface GenerationResult {plan:GenerationPlan;backend:'worker'|'synchronous'|'cache';fallback:GenerationFallback|null;timings:{totalMs:number;compileMs:number;validationMs:number;bootMs:number}}
export interface GenerationWorkerPort {postMessage(value:unknown):void;terminate():unknown;onmessage:((event:MessageEvent)=>void)|null;onerror:((event:ErrorEvent)=>void)|null;onmessageerror:((event:MessageEvent)=>void)|null}
interface Job {id:number;input:GenerationInput;started:number;signal?:AbortSignal;resolve:(r:GenerationResult)=>void;reject:(e:Error)=>void;abort:()=>void;timer?:ReturnType<typeof setTimeout>;sent:boolean;timeoutMs:number;bootMs:number}
export interface GenerationClient {request(input:GenerationInput,options?:{signal?:AbortSignal;synchronous?:boolean;timeoutMs?:number}):Promise<GenerationResult>;dispose():void;readonly status:{active:number;queued:number;worker:boolean;disposed:boolean}}
/** Testable transport, not a world-cache importer. Production cache ownership stays in generation.ts. */
export function createGenerationClient(options:{workerFactory?:()=>GenerationWorkerPort;timeoutMs?:number}={}):GenerationClient {
 const boundedTimeout=(value:number|undefined,ceiling:number)=>Number.isFinite(value)?Math.max(1,Math.min(ceiling,value!)):ceiling;
 const timeoutMs=boundedTimeout(options.timeoutMs,GENERATION_LIMITS.timeoutMs);
 let worker:GenerationWorkerPort|null=null,ready=false,disposed=false,nextId=0,active:Job|null=null,pending:Job|null=null,bootStarted=0,disabledReason:GenerationFallback|null=null;
 const factory=options.workerFactory??(()=>new Worker(new URL('./generation.worker.ts',import.meta.url),{type:'module'}));
 function terminate(){const w=worker;worker=null;ready=false;if(w){w.onmessage=null;w.onerror=null;w.onmessageerror=null;w.terminate();}}
 function remove(job:Job){if(job.timer!==undefined)clearTimeout(job.timer);job.signal?.removeEventListener('abort',job.abort);if(active===job)active=null;if(pending===job)pending=null;}
 function drain(){if(disposed||active||!pending)return;const next=pending;pending=null;start(next);}
 function reject(job:Job,error:Error){remove(job);job.reject(error);drain();}
 function finish(job:Job,result:GenerationResult){if(active!==job||job.signal?.aborted||disposed){reject(job,generationAbort());return;}remove(job);job.resolve(result);drain();}
 function fallback(job:Job,reason:GenerationFallback|null){
  // A cancel is never a request to repeat expensive work synchronously.
  if(active!==job||job.signal?.aborted||disposed){reject(job,generationAbort());return;}
  const start=performance.now();try{const plan=compileGeneration(job.input);const compileMs=performance.now()-start;finish(job,{plan,backend:'synchronous',fallback:reason,timings:{totalMs:performance.now()-job.started,compileMs,validationMs:0,bootMs:job.bootMs}});}catch(error){reject(job,error instanceof Error?error:Error('Generation failed'));}
 }
 function fail(reason:GenerationFallback){disabledReason=reason;const job=active;if(job&&worker&&!ready)job.bootMs=performance.now()-bootStarted;terminate();if(job)fallback(job,reason);}
 function send(){if(!active||!worker||!ready||active.sent)return;active.sent=true;try{worker.postMessage({type:'generate',id:active.id,source:GENERATION_SOURCE,input:active.input});}catch{fail('setup');}}
 function start(job:Job){
  if(job.timer!==undefined)clearTimeout(job.timer);active=job;if(disposed||job.signal?.aborted){reject(job,generationAbort());return;}
  job.timer=setTimeout(()=>{if(active===job)fail('timeout');},Math.max(1,job.timeoutMs-(performance.now()-job.started)));
  if(disabledReason){fallback(job,disabledReason);return;}
  if(!worker){
   if(!options.workerFactory&&typeof Worker==='undefined'){disabledReason='unavailable';fallback(job,'unavailable');return;}
   try{
    bootStarted=performance.now();const owned=factory();worker=owned;
    owned.onerror=()=>{if(worker===owned)fail('error');};owned.onmessageerror=()=>{if(worker===owned)fail('protocol');};
    owned.onmessage=event=>{
     if(worker!==owned||disposed)return;
     const m=event.data as {type?:unknown;source?:unknown;id?:unknown;plan?:unknown;compileMs?:unknown};
     if(!m||typeof m!=='object'||m.source!==GENERATION_SOURCE){fail('protocol');return;}
     if(m.type==='ready'){if(ready){fail('protocol');return;}ready=true;if(active)active.bootMs=performance.now()-bootStarted;send();return;}
     const current=active;
     // A previous result may arrive after cancellation; it cannot finish another job.
     if(!current||m.id!==current.id)return;
     if(m.type==='failure'){fail('error');return;}
     if(m.type!=='result'||!ready||!current.sent||typeof m.compileMs!=='number'||!Number.isFinite(m.compileMs)||m.compileMs<0){fail('protocol');return;}
     const validationStart=performance.now();try{
      const plan=acceptGenerationPlan(m.plan,current.input);finish(current,{plan,backend:'worker',fallback:null,timings:{totalMs:performance.now()-current.started,compileMs:m.compileMs,validationMs:performance.now()-validationStart,bootMs:current.bootMs}});
     }catch{fail('protocol');}
    };
   }catch{fail('setup');return;}
  }
  send();
 }
 return {
  request(input,requestOptions={}){
   if(disposed||requestOptions.signal?.aborted)return Promise.reject(generationAbort());
   if(!validGenerationInput(input))return Promise.reject(new RangeError('Invalid generation request'));
   // Copy the validated primitives. Caller edits cannot change an in-flight identity.
   const identity={kind:input.kind,seed:input.seed};
   return new Promise((resolve,rejectPromise)=>{
    const job:Job={id:++nextId,input:identity,started:performance.now(),...(requestOptions.signal?{signal:requestOptions.signal}:{}),resolve,reject:rejectPromise,sent:false,bootMs:0,timeoutMs:boundedTimeout(requestOptions.timeoutMs,timeoutMs),abort:()=>{
     if(active===job){terminate();reject(job,generationAbort());}else if(pending===job)reject(job,generationAbort());
    }};
    job.signal?.addEventListener('abort',job.abort,{once:true});
    if(requestOptions.synchronous){
     // Intentional small legacy path still respects disposal and does not replace active work.
     if(job.signal?.aborted||disposed){remove(job);rejectPromise(generationAbort());return;}
     try{const start=performance.now(),plan=compileGeneration(identity);remove(job);resolve({plan,backend:'synchronous',fallback:null,timings:{totalMs:performance.now()-job.started,compileMs:performance.now()-start,validationMs:0,bootMs:0}});}catch(error){remove(job);rejectPromise(error instanceof Error?error:Error('Generation failed'));}return;
    }
    if(active){if(pending){const old=pending;remove(old);old.reject(generationAbort());}pending=job;job.timer=setTimeout(()=>{if(pending===job)reject(job,Error('Generation queue deadline exceeded'));},job.timeoutMs);}else start(job);
   });
  },
  dispose(){if(disposed)return;disposed=true;terminate();for(const job of [active,pending])if(job){remove(job);job.reject(generationAbort());}},
  get status(){return {active:active?1:0,queued:pending?1:0,worker:!!worker,disposed};},
 };
}
