import {WorkbenchSession,replayWorkbench,parseWorkbenchReport,workbenchTargets,type WorkbenchConfig,type WorkbenchSnapshot,type WorkbenchGeometry,type WorkbenchReport,type WorkbenchReplay} from './system-workbench-model.ts';
export type WorkbenchRequest={id:number;kind:'create';config:WorkbenchConfig;revision:string}|{id:number;kind:'advance';ticks:number}|{id:number;kind:'action';action:string}|{id:number;kind:'report'|'reload'}|{id:number;kind:'replay';text:string;revision:string};
export interface WorkbenchResponse {id:number;ok:boolean;error?:string;snapshot?:WorkbenchSnapshot;geometry?:WorkbenchGeometry;targets?:string[];report?:WorkbenchReport;replay?:Omit<WorkbenchReplay,'report'>;reload?:{checked:boolean;pass:boolean|null}}
/** Same request handler in the browser worker and ordinary Node contract tests. */
export function createWorkbenchHandler(){let session:WorkbenchSession|undefined;return (message:WorkbenchRequest):WorkbenchResponse=>{
 const id=message?.id;if(!Number.isSafeInteger(id)||id<0)return {id:-1,ok:false,error:'Invalid request identity'};
 try{
  if(message.kind==='create'){session=undefined;session=new WorkbenchSession(message.config,message.revision);return {id,ok:true,snapshot:session.snapshot(),geometry:session.geometry(),targets:workbenchTargets(session.config.seed,session.config.system)};}
  if(message.kind==='replay'){session=undefined;const run=replayWorkbench(parseWorkbenchReport(message.text),message.revision);session=run.session;const {report,...replay}=run.result;return {id,ok:true,snapshot:session.snapshot(),geometry:session.geometry(),targets:workbenchTargets(session.config.seed,session.config.system),report,replay};}
  if(!session)throw Error('Generate a scenario first');
  if(message.kind==='advance')return {id,ok:true,snapshot:session.advance(message.ticks)};
  if(message.kind==='action'){session.action(message.action);return {id,ok:true,snapshot:session.snapshot()};}
  if(message.kind==='report')return {id,ok:true,report:session.report(),snapshot:session.snapshot()};
  if(message.kind==='reload')return {id,ok:true,reload:session.verifyReload(),snapshot:session.snapshot()};
  throw Error('Unknown workbench request');
 }catch(error){return {id,ok:false,error:error instanceof Error?error.message:String(error)};}
};}
