import {Worker} from 'node:worker_threads';
import type {GenerationWorkerPort} from '../../src/generation-client.ts';
/** Runs the actual browser Worker module with only a Node message-port shim. */
export function nodeGenerationWorker():GenerationWorkerPort {
 const native=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);let queued=[];parentPort.on('message',m=>{if(self.onmessage)self.onmessage({data:m});else queued.push(m);});import(${JSON.stringify(new URL('../../src/generation.worker.ts',import.meta.url).href)}).then(()=>{for(const m of queued)self.onmessage({data:m});queued=[];});`,{eval:true,execArgv:['--experimental-strip-types']});
 const port:GenerationWorkerPort={onmessage:null,onerror:null,onmessageerror:null,postMessage:m=>native.postMessage(m),terminate:()=>native.terminate()};
 native.on('message',data=>port.onmessage?.({data} as MessageEvent));native.on('error',error=>port.onerror?.({error} as ErrorEvent));native.on('messageerror',error=>port.onmessageerror?.({data:error} as MessageEvent));return port;
}
