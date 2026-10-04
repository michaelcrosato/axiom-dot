import {compileGeneration} from './generation-compile.ts';
import {GENERATION_SOURCE,validGenerationInput} from './generation-protocol.ts';
/** Pure bounded compilation. No state, timers, save access, authority or cache lives here. */
self.onmessage=(event:MessageEvent<unknown>)=>{
 const m=event.data as {type?:unknown;id?:unknown;source?:unknown;input?:unknown};
 if(!m||m.type!=='generate'||!Number.isSafeInteger(m.id)||Number(m.id)<1||m.source!==GENERATION_SOURCE||!validGenerationInput(m.input))return;
 const started=performance.now();
 try{const plan=compileGeneration(m.input);self.postMessage({type:'result',id:m.id,source:GENERATION_SOURCE,plan,compileMs:performance.now()-started});}
 catch{self.postMessage({type:'failure',id:m.id,source:GENERATION_SOURCE});}
};
self.postMessage({type:'ready',source:GENERATION_SOURCE});
