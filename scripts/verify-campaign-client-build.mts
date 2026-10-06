import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {CoopClient} from '../src/coop.ts';
import {createRoom,snapshot} from '../server/coop-authority.ts';
import {createRegionalState,createState,worldRestorationPlan,validateSave} from '../src/world.ts';
import type {CoopAction,CoopSnapshot,CoopSync} from '../src/coop-protocol.ts';
const root=resolve(import.meta.dirname,'..'),assets=resolve(root,'dist/client/assets'),digest=(value:unknown)=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const files=readdirSync(assets).filter(file=>/^coop-client-.*\.js$/.test(file));assert.equal(files.length,1,'one actual production coop-client asset');
const file=files[0]!,module=await import(pathToFileURL(resolve(assets,file)).href),classes=Object.values(module).filter((value:any)=>typeof value==='function'&&typeof value.prototype?.hasPendingAction==='function');assert.equal(classes.length,1,'one emitted client class exposing the real pending-action API');
const emitted=classes[0] as typeof CoopClient,base=(()=>{const room=createRoom('fixture-host','Fixture host',createRegionalState(73129),1000);room.revision=10;return snapshot(room,'fixture-host',1000);})();
const action=(type:'restoration'|'town-supply'|'restoration-care'='restoration'):CoopAction=>type==='town-supply'?{type,command:{kind:'load',targetId:'scrap-1',expectedRevision:0}}:{type,command:{kind:type==='restoration'?'service':'collect',targetId:worldRestorationPlan(base.world.seed).sites[0]!.id,expectedRevision:0}} as CoopAction;
async function drain(){for(let i=0;i<20;i++)await Promise.resolve();}
/** Bounded deterministic scheduler; no sockets, sleeps, browser, or runtime imports of source as emitted code. */
function clock(){
 const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout,originalNow=Date.now,timers=new Map<number,{at:number;callback:()=>void}>();let time=1000,sequence=0;
 globalThis.setTimeout=((callback:(...args:any[])=>void,delay=0,...args:any[])=>{assert.equal(typeof callback,'function');const id=++sequence;timers.set(id,{at:time+Math.max(0,Number(delay)||0),callback:()=>callback(...args)});return id;}) as unknown as typeof setTimeout;
 globalThis.clearTimeout=((id:ReturnType<typeof setTimeout>)=>{timers.delete(Number(id));}) as typeof clearTimeout;Date.now=()=>time;
 return {async tick(ms:number){assert(ms>=0&&ms<=1000);const target=time+ms;for(let steps=0;steps<100;steps++){const due=[...timers].filter(([,timer])=>timer.at<=target).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!due){time=target;await drain();return;}timers.delete(due[0]);time=due[1].at;due[1].callback();await drain();}throw Error('Client scheduler exceeded its bounded work budget');},restore(){globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;Date.now=originalNow;timers.clear();}};
}
interface Deferred {body:string;input:CoopSync;resolve:(snapshot:CoopSnapshot)=>void;reject:(error:Error)=>void;settled:boolean}
async function clientCase(Client:typeof CoopClient,run:(h:{client:CoopClient;calls:Deferred[];accepted:CoopSnapshot[];respond:(i:number,revision?:number)=>void;tick:(ms:number)=>Promise<void>})=>Promise<unknown>){
 const timer=clock(),calls:Deferred[]=[],accepted:CoopSnapshot[]=[];
 const fetcher:typeof fetch=async(url,init)=>{
  if(!String(url).endsWith('/sync'))return Response.json(structuredClone(base));
  return await new Promise<Response>((resolve,reject)=>{const body=String(init?.body),call:Deferred={body,input:JSON.parse(body),settled:false,resolve(value){call.settled=true;resolve(Response.json(value));},reject(error){call.settled=true;reject(error);}};calls.push(call);});
 };
 const client=new Client({fetch:fetcher,onSnapshot:value=>accepted.push(value)}),respond=(i:number,revision=11)=>calls[i]!.resolve({...structuredClone(base),revision,ack:calls[i]!.input.seq});
 try{await client.create({name:'Fixture host'});return await run({client,calls,accepted,respond,tick:timer.tick});}
 finally{client.disconnect();for(const call of calls)if(!call.settled)call.resolve(structuredClone(base));await drain();timer.restore();}
}
async function traces(Client:typeof CoopClient){const results:any[]=[];
 results.push(await clientCase(Client,async h=>{
  const before=digest(h.client.snapshot!.world);assert.equal(h.client.hasPendingAction('restoration'),false);assert(h.client.send(action()));assert(h.client.hasPendingAction('restoration'));assert.equal(h.client.hasPendingAction('town-supply'),false);await h.tick(125);assert.equal(h.calls.length,1);assert(h.client.hasPendingAction('restoration'));assert(h.client.send(action('town-supply')));
  h.respond(0);await drain();assert.equal(digest(h.client.snapshot!.world),before);assert.equal(h.client.snapshot!.ack,1);assert.equal(h.client.hasPendingAction('restoration'),false);assert(h.client.hasPendingAction('town-supply'));await h.tick(250);assert.equal(h.calls.length,2);assert.equal(h.calls[1]!.input.actions[0]!.type,'town-supply');h.respond(1,12);await drain();assert.equal(h.client.hasPendingAction('town-supply'),false);
  return {case:'queued-sent-acknowledged-unchanged-model',requests:h.calls.length,accepted:h.accepted.length,ack:h.client.snapshot!.ack,modelSha256:before};
 }));
 results.push(await clientCase(Client,async h=>{
  assert(h.client.send(action('restoration-care')));await h.tick(125);h.respond(0,9);await drain();assert.equal(h.accepted.length,1);assert.equal(h.client.snapshot!.revision,10);assert.equal(h.client.snapshot!.ack,0);assert(h.client.hasPendingAction('restoration-care'));await h.tick(250);assert.equal(h.calls.length,2);assert.equal(h.calls[1]!.body,h.calls[0]!.body);h.respond(1);await drain();assert.equal(h.client.hasPendingAction('restoration-care'),false);
  return {case:'older-room-reply-retains-exact-retry',requests:2,accepted:h.accepted.length,ack:h.client.snapshot!.ack};
 }));
 results.push(await clientCase(Client,async h=>{
  const command=action();assert(h.client.send(command));if(command.type==='restoration')command.command.expectedRevision=99;await h.tick(125);assert.equal((h.calls[0]!.input.actions[0] as any).command.expectedRevision,0);h.calls[0]!.reject(new Error('Simulated response loss'));await drain();assert.equal(h.client.status,'reconnecting');assert(h.client.hasPendingAction('restoration'));await h.tick(500);assert.equal(h.calls.length,2);assert.equal(h.calls[1]!.body,h.calls[0]!.body);h.respond(1);await drain();assert.equal(h.client.hasPendingAction('restoration'),false);
  return {case:'lost-response-detached-exact-retry',requests:2,status:h.client.status,ack:h.client.snapshot!.ack};
 }));
 for(const key of ['workshopConstruction','restorationCare','townSupply'] as const)results.push(await clientCase(Client,async h=>{
  const confirmed=h.client.snapshot!;assert(h.client.send(action()));await h.tick(125);const world={...createState(1),[key]:{forged:true}};assert.equal(validateSave(world),false);h.calls[0]!.resolve({...structuredClone(base),revision:11,ack:1,world});await drain();assert.equal(h.client.snapshot===confirmed,true);assert.equal(h.client.snapshot!.ack,0);assert.equal(h.accepted.length,1);assert.equal(h.client.status,'reconnecting');assert(h.client.hasPendingAction('restoration'));await h.tick(500);assert.equal(h.calls.length,2);assert.equal(h.calls[1]!.body,h.calls[0]!.body);h.respond(1);await drain();assert.equal(h.client.hasPendingAction('restoration'),false);
  return {case:`malformed-${key}-retains-confirmed-and-pending`,requests:2,accepted:h.accepted.length,ack:h.client.snapshot!.ack};
 }));
 results.push(await clientCase(Client,async h=>{
  assert(h.client.send(action('town-supply')));h.client.setSuspended(true);assert.equal(h.client.hasPendingAction('town-supply'),false);await h.tick(1000);assert.equal(h.calls.length,0);h.client.setSuspended(false);await h.tick(125);assert.deepEqual(h.calls[0]!.input.actions,[]);h.respond(0);await drain();assert(h.client.send(action()));await h.tick(250);h.client.setSuspended(true);h.calls[1]!.reject(new Error('Simulated hidden response loss'));await drain();assert(h.client.hasPendingAction('restoration'));await h.tick(1000);assert.equal(h.calls.length,2);h.client.setSuspended(false);await h.tick(125);assert.equal(h.calls.length,3);assert.equal(h.calls[2]!.body,h.calls[1]!.body);h.respond(2,12);await drain();assert.equal(h.client.hasPendingAction('restoration'),false);
  return {case:'suspension-drops-unsent-retains-sent',requests:3,accepted:h.accepted.length,ack:h.client.snapshot!.ack};
 }));
 results.push(await clientCase(Client,async h=>{
  assert(h.client.send(action()));await h.tick(125);assert(h.client.hasPendingAction('restoration'));h.client.disconnect();assert.equal(h.client.hasPendingAction('restoration'),false);h.respond(0);await drain();assert.equal(h.client.active,false);assert.equal(h.client.status,'offline');assert.equal(h.accepted.length,1);await h.tick(1000);assert.equal(h.calls.length,1);
  return {case:'late-departed-reply-cannot-resurrect',requests:1,accepted:1,active:h.client.active,status:h.client.status};
 }));
 assert.equal(results.length,8);return results;
}
const source=await traces(CoopClient),built=await traces(emitted);assert.deepEqual(built,source);console.error('actual emitted campaign client matches source across all eight bounded deferred HTTP traces');
const sourceFiles=['src/coop.ts','src/coop-protocol.ts','src/world.ts','src/workshop-construction.ts','src/restoration-care.ts','src/town-supply.ts','src/town-life.ts','vite.client.config.ts','scripts/verify-campaign-client-build.mts'];
const report={kind:'axiom-campaign-client-emitted-verification',version:1,verifiedAt:new Date().toISOString(),scope:'Actual production client export identified by prototype.hasPendingAction; source/emitted deferred mocked HTTP parity with bounded fake timers, queued/sent acknowledgments, stale replies, exact retries, three malformed overlay replies, intentional suspension behavior and late disconnect replies. No actual network, server integration, browser/GPU/device or live-data claim.',sourceHashes:Object.fromEntries(sourceFiles.map(path=>[path,digest(readFileSync(resolve(root,path),'utf8'))])),asset:{file,sha256:digest(readFileSync(resolve(assets,file),'utf8'))},traceSha256:digest(built),cases:built};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
