import type {WorkbenchRequest,WorkbenchResponse} from './system-workbench-protocol.ts';
export interface WorkbenchWorker {postMessage(message:WorkbenchRequest):void;terminate():void;onmessage:((event:MessageEvent<WorkbenchResponse>)=>void)|null;onerror:((event:ErrorEvent)=>void)|null}
export type WorkbenchCommand=WorkbenchRequest extends infer R?R extends {id:number}?Omit<R,'id'>:never:never;
/** At most one request in flight. Termination invalidates every old callback. */
export class WorkbenchClient {
 #worker:WorkbenchWorker;#next=0;#disposed=false;#pending:{id:number;resolve:(value:WorkbenchResponse)=>void;reject:(reason:Error)=>void}|undefined;
 constructor(worker:WorkbenchWorker){this.#worker=worker;worker.onmessage=event=>{
  if(this.#disposed)return;
  const response=event.data;
  // A malformed reply cannot establish whether an action/advance ran. Fail
  // closed instead of leaving the UI busy or retrying an uncertain mutation.
  if(!response||typeof response!=='object'||Array.isArray(response)||!Number.isSafeInteger(response.id)||response.id<0||typeof response.ok!=='boolean'||(!response.ok&&typeof response.error!=='string')){this.fail('Malformed model worker response');return;}
  if(response.id!==this.#pending?.id)return;
  const pending=this.#pending;this.#pending=undefined;response.ok?pending.resolve(response):pending.reject(Error(response.error??'Workbench request failed'));
 };worker.onerror=event=>this.fail(event.message||'The model worker stopped');}
 private fail(message:string){const pending=this.#pending;this.#pending=undefined;this.#disposed=true;this.#worker.onmessage=null;this.#worker.onerror=null;this.#worker.terminate();pending?.reject(Error(message+'; generate / reset to continue'));}
 request(command:WorkbenchCommand):Promise<WorkbenchResponse>{if(this.#disposed)return Promise.reject(Error('Workbench was closed or failed; generate / reset to continue'));if(this.#pending)return Promise.reject(Error('Wait for the current model request'));const id=++this.#next;return new Promise((resolve,reject)=>{this.#pending={id,resolve,reject};try{this.#worker.postMessage({...command,id} as WorkbenchRequest);}catch(error){this.#pending=undefined;reject(error);}});}
 dispose(){if(this.#disposed)return;this.#disposed=true;this.#worker.onmessage=null;this.#worker.onerror=null;this.#worker.terminate();this.#pending?.reject(Error('Scenario replaced'));this.#pending=undefined;}
}
/** Discards hidden/background gaps rather than advancing a paused scenario. */
export class WorkbenchPlayback {
 playing=false;speed=1;#previous:number|null=null;#fraction=0;
 play(){this.playing=true;this.#previous=null;this.#fraction=0;}
 pause(){this.playing=false;this.#previous=null;this.#fraction=0;}
 take(now:number,hidden=false,busy=false){if(hidden){this.pause();return 0;}if(!this.playing)return 0;if(this.#previous===null){this.#previous=now;return 0;}const elapsed=Math.max(0,Math.min(250,now-this.#previous));this.#previous=now;if(busy)return 0;this.#fraction+=elapsed*this.speed/250;const ticks=Math.min(240,Math.floor(this.#fraction));this.#fraction-=ticks;return ticks;}
}
