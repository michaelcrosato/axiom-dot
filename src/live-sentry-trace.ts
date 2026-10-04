import {createLiveSentryPractice,resumeLiveSentryPractice,stepLiveSentryPractice,requestLiveSentryAttack,requestLiveSentryGuard,cancelLiveSentryAction,suspendLiveSentryPractice,disableLiveSentryPractice,liveSentrySnapshot,type LivePracticeState,type LivePracticeOptions,type LivePracticeFrame,type LivePracticePause,type LivePracticeResult,type LivePracticeSnapshot} from './live-sentry-practice.ts';
import type {ComboInputSource,ComboTuning} from './combat.ts';

/** Observed-input diagnostic only: no campaign data, physics benchmark, import UI or visual approval. */
export const LIVE_SENTRY_TRACE_LIMITS=Object.freeze({entries:3600,encodedBytes:1024*1024});
// Reserve substantially more than the bounded options + two snapshots + metadata require.
const HEADER_RESERVE=64*1024;
const encoder=new TextEncoder();
export type LivePracticeCommand=
 | {type:'resume'|'step';frame:LivePracticeFrame}
 | {type:'attack';source:ComboInputSource}
 | {type:'guard';intentId:string}
 | {type:'cancel';reason:'jump'|'crouch'}
 | {type:'suspend';reason:LivePracticePause}
 | {type:'disable';reason:'suite'|'exit'};
export interface LivePracticeTrace {
 version:1;scope:'Observed worker poses + production combat; not a physics benchmark or visual approval';
 options:{seed:number;epoch:number;tuning:ComboTuning;enemyDamageScale?:number;tuningVersion?:2};initial:LivePracticeSnapshot;
 commands:LivePracticeCommand[];prefixFinal:LivePracticeSnapshot;
 truncated:boolean;truncationReason:'entry-limit'|'byte-limit'|'unrecordable-command'|null;droppedEntries:number;
 retainedCommandBytes:number;limits:typeof LIVE_SENTRY_TRACE_LIMITS;
}
/** Never export this container: .state is live authority, .trace is the finite diagnostic. */
export interface LivePracticeRecording {state:LivePracticeState;trace:LivePracticeTrace}
export function createLiveSentryTrace(options:LivePracticeOptions):LivePracticeRecording{
 const state=createLiveSentryPractice(options),initial=liveSentrySnapshot(state);
 return {state,trace:{version:1,scope:'Observed worker poses + production combat; not a physics benchmark or visual approval',options:{seed:state.seed,epoch:state.epoch,tuning:structuredClone(state.tuning),enemyDamageScale:state.enemyDamageScale,tuningVersion:2},initial,commands:[],prefixFinal:structuredClone(initial),truncated:false,truncationReason:null,droppedEntries:0,retainedCommandBytes:0,limits:LIVE_SENTRY_TRACE_LIMITS}};
}
export function applyLiveSentryCommand(s:LivePracticeState,c:LivePracticeCommand):LivePracticeResult{
 switch(c.type){
  case 'resume':return resumeLiveSentryPractice(s,c.frame);
  case 'step':return stepLiveSentryPractice(s,c.frame);
  case 'attack':return requestLiveSentryAttack(s,c.source);
  case 'guard':return requestLiveSentryGuard(s,c.intentId);
  case 'cancel':return cancelLiveSentryAction(s,c.reason);
  case 'suspend':return suspendLiveSentryPractice(s,c.reason);
  case 'disable':return disableLiveSentryPractice(s,c.reason);
 }
}
/** Drop unrelated worker/render fields; invalid/non-JSON input terminates the replayable prefix. */
function compact(c:LivePracticeCommand):LivePracticeCommand|null{
 if(c.type==='resume'||c.type==='step'){
  const f=c.frame;if(!f||![f.epoch,f.step,f.x,f.z,f.feetY,f.facing,f.stance].every(Number.isFinite)||typeof f.grounded!=='boolean'||typeof f.crouched!=='boolean')return null;
  return {type:c.type,frame:{epoch:f.epoch,step:f.step,x:f.x,z:f.z,feetY:f.feetY,facing:f.facing,grounded:f.grounded,crouched:f.crouched,stance:f.stance}};
 }
 if(c.type==='guard')return typeof c.intentId==='string'&&c.intentId.length<=64?{type:'guard',intentId:c.intentId}:null;
 if(c.type==='attack')return c.source==='manual'||c.source==='auto'?{type:'attack',source:c.source}:null;
 if(c.type==='cancel')return ['jump','crouch'].includes(c.reason)?{type:'cancel',reason:c.reason}:null;
 if(c.type==='suspend')return ['menu','blur','hidden','resize','snapshot-gap','invalid-frame'].includes(c.reason)?{type:'suspend',reason:c.reason}:null;
 return c.type==='disable'&&['suite','exit'].includes(c.reason)?{type:'disable',reason:c.reason}:null;
}
/** Apply once, then retain only the compact command and latest prefix snapshot. */
export function appendLiveSentryTrace(recording:LivePracticeRecording,command:LivePracticeCommand):LivePracticeRecording&{result:LivePracticeResult}{
 const result=applyLiveSentryCommand(recording.state,command),old=recording.trace;
 const clipped=(why:NonNullable<LivePracticeTrace['truncationReason']>):LivePracticeRecording&{result:LivePracticeResult}=>({state:result.state,result,trace:{...old,truncated:true,truncationReason:old.truncationReason??why,droppedEntries:Math.min(Number.MAX_SAFE_INTEGER,old.droppedEntries+1)}});
 if(old.truncated)return clipped(old.truncationReason!);
 if(old.commands.length>=LIVE_SENTRY_TRACE_LIMITS.entries)return clipped('entry-limit');
 const value=compact(command);if(!value)return clipped('unrecordable-command');
 const bytes=encoder.encode(JSON.stringify(value)).length+(old.commands.length?1:0);
 if(old.retainedCommandBytes+bytes>LIVE_SENTRY_TRACE_LIMITS.encodedBytes-HEADER_RESERVE)return clipped('byte-limit');
 return {state:result.state,result,trace:{...old,commands:[...old.commands,value],prefixFinal:liveSentrySnapshot(result.state),retainedCommandBytes:old.retainedCommandBytes+bytes}};
}
/** Replay only the retained prefix; no wall-clock catch-up and no invented missing frames. */
export function replayLiveSentryTrace(trace:LivePracticeTrace):{state:LivePracticeState;snapshot:LivePracticeSnapshot;matchesPrefixFinal:boolean}{
 let state=createLiveSentryPractice(trace.options);
 for(const command of trace.commands)state=applyLiveSentryCommand(state,command).state;
 const snapshot=liveSentrySnapshot(state);
 // Original v1 traces predate the additive damage field and always used 1×.
 const {enemyDamageScale:_scale,...legacySnapshot}=snapshot;
 const expected=trace.options.enemyDamageScale===undefined&&trace.options.tuningVersion===undefined&&!Object.hasOwn(trace.prefixFinal,'enemyDamageScale')?legacySnapshot:snapshot;
 return {state,snapshot,matchesPrefixFinal:JSON.stringify(expected)===JSON.stringify(trace.prefixFinal)};
}
/** Export only this bounded object, never the recording container or a campaign checkpoint. */
export function exportLiveSentryTrace(recording:LivePracticeRecording):LivePracticeTrace{
 const trace=structuredClone(recording.trace);
 if(encoder.encode(JSON.stringify(trace)).length>LIVE_SENTRY_TRACE_LIMITS.encodedBytes)throw new RangeError('Practice trace exceeds its finite export budget');
 return trace;
}
