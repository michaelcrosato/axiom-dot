import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {
 WorkbenchSession, DEFAULT_WORKBENCH_CONFIG, parseWorkbenchReport, replayWorkbench,
 validateWorkbenchConfig,
} from '../src/system-workbench-model.ts';
import {WorkbenchClient, type WorkbenchWorker} from '../src/system-workbench-client.ts';
import {createWorkbenchHandler, type WorkbenchRequest, type WorkbenchResponse} from '../src/system-workbench-protocol.ts';
import {mountSystemWorkbench} from '../src/system-workbench-ui.ts';

// Literal non-rendering DOM/worker contract used by system-workbench-ui.test.ts.
// Kept local because that harness is not exported. These tests make no browser,
// rendered-quality or device-performance claim, and run no terminal-clock probes.
class Element {
 tagName:string; children:Element[]=[]; nodes=new Map<string,Element>();
 dataset:Record<string,string>={}; value=''; className=''; hidden=false; disabled=false;
 title=''; src=''; href=''; width=960; height=540; files:{size:number;text:()=>Promise<string>}[]=[];
 _text=''; html=''; draws=0; attributes=new Map<string,string>();
 onclick?:()=>void; oninput?:()=>void; onchange?:()=>unknown;
 onsubmit?:(event:{preventDefault:()=>void})=>void;
 constructor(tag='div'){this.tagName=tag;}
 get textContent():string{return this._text+this.children.map(child=>child.textContent).join('');}
 set textContent(value:string){this._text=String(value);this.children=[];}
 set innerHTML(html:string){
  this.html=html;this.nodes.clear();
  for(const match of html.matchAll(/<(\w+)([^>]*?\bid="([^"]+)"[^>]*)>/g)){
   const element=new Element(match[1]);element.disabled=match[2]!.includes('disabled');
   element.hidden=match[2]!.includes('hidden');this.nodes.set('#'+match[3],element);
  }
 }
 append(...nodes:Element[]){this.children.push(...nodes);if(this.tagName==='select'&&!this.value&&nodes[0])this.value=nodes[0].value;}
 replaceChildren(...nodes:Element[]){this.children=nodes;this._text='';if(this.tagName==='select')this.value=nodes[0]?.value??'';}
 get options(){return this.children;}
 querySelector(selector:string):Element|null{return this.nodes.get(selector)??this.querySelectorAll(selector)[0]??null;}
 querySelectorAll(selector:string):Element[]{return this.children.flatMap(child=>[...(selector===child.tagName?[child]:[]),...child.querySelectorAll(selector)]);}
 setAttribute(key:string,value:string){this.attributes.set(key,value);}
 focus(){doc.activeElement=this;}
 getContext(){return new Proxy({},{get:()=>()=>{this.draws++;},set:()=>true});}
}
const doc={
 hidden:false,activeElement:null as Element|null,createElement:(tag:string)=>new Element(tag),
 listeners:new Map<string,Set<()=>void>>(),
 addEventListener(name:string,fn:()=>void){const set=this.listeners.get(name)??new Set();set.add(fn);this.listeners.set(name,set);},
 removeEventListener(name:string,fn:()=>void){this.listeners.get(name)?.delete(fn);},
};
class WorkerFake implements WorkbenchWorker {
 onmessage:WorkbenchWorker['onmessage']=null; onerror:WorkbenchWorker['onerror']=null;
 requests:WorkbenchRequest[]=[]; terminated=false; handle=createWorkbenchHandler();
 postMessage(request:WorkbenchRequest){this.requests.push(request);}
 terminate(){this.terminated=true;}
 respond(data:unknown){this.onmessage?.({data} as MessageEvent<WorkbenchResponse>);}
 flush(index=this.requests.length-1){const response=this.handle(this.requests[index]!);this.respond(response);return response;}
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
function deferred(){let resolve!:(text:string)=>void;let reject!:(error:Error)=>void;const promise=new Promise<string>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function harness(t:TestContext){
 const original=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
 doc.hidden=false;doc.activeElement=null;doc.listeners.clear();
 const root=new Element(),workers:WorkerFake[]=[],downloads:{name:string;text:string}[]=[],frames=new Map<number,FrameRequestCallback>();
 let next=0;
 const ui=mountSystemWorkbench(root as unknown as HTMLElement,{
  revision:'test',makeWorker:()=>{const worker=new WorkerFake();workers.push(worker);return worker;},
  download:(name,text)=>{downloads.push({name,text});},
  requestFrame:fn=>{frames.set(++next,fn);return next;},cancelFrame:id=>{frames.delete(id);},
 });
 const get=(id:string)=>{const element=root.querySelector('#'+id);assert(element,id);return element;};
 t.after(()=>{ui.dispose();if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');});
 return {
  ui,get,workers,downloads,frames,worker:()=>workers.at(-1)!,
  submit:()=>get('wb-form').onsubmit!({preventDefault(){}}),
  importFile(file:{size:number;text:()=>Promise<string>}){get('wb-import').files=[file];return get('wb-import').onchange!();},
 };
}
function report(seed=73129){
 const session=new WorkbenchSession({...DEFAULT_WORKBENCH_CONFIG,seed},'test');
 session.action('build-store');session.advance(40);session.action('clear-route');session.advance(40);
 return session.report(); // Only 20 active seconds; never a terminal-clock run.
}
const json=(value:unknown)=>JSON.stringify(value);

test('resilience: config and report parsing reject coercible non-string system and view values',()=>{
 const original=report();
 for(const system of ['trade','water','food','settlement']){
  const config={...original.config,system:[system]};
  assert.throws(()=>validateWorkbenchConfig(config),/valid unsigned seed/,`system array ${system}`);
  assert.throws(()=>parseWorkbenchReport(json({...original,config})),/valid unsigned seed/,`report system array ${system}`);
 }
 for(const view of ['route','chunk','settlement']){
  const config={...original.config,view:[view]};
  assert.throws(()=>validateWorkbenchConfig(config),/valid unsigned seed/,`view array ${view}`);
  assert.throws(()=>parseWorkbenchReport(json({...original,config})),/valid unsigned seed/,`report view array ${view}`);
 }
 // Boxed strings cannot come from JSON, but the public create protocol is also typed at runtime.
 for(const config of [{...original.config,system:new String('trade')},{...original.config,view:new String('route')}]){
  assert.throws(()=>validateWorkbenchConfig(config),/valid unsigned seed/);
 }
});

test('resilience: malformed report envelopes are rejected before replay work',()=>{
 const original=report();
 for(const value of [null,true,0,'axiom-system-workbench',[],{},[original]])assert.throws(()=>parseWorkbenchReport(json(value)));
 const cases:[string,(value:any)=>void][]=[
  ['unknown version',value=>value.version=4],['string version',value=>value.version='1'],
  ['fractional final tick',value=>value.finalTick=.5],['string final tick',value=>value.finalTick='80'],
  ['null events',value=>value.events=null],['object checkpoints',value=>value.checkpoints={}],
  ['array config',value=>value.config=[]],['null config',value=>value.config=null],
  ['missing revision',value=>delete value.sourceRevision],['oversized revision',value=>value.sourceRevision='x'.repeat(161)],
  ['numeric final fingerprint',value=>value.finalFingerprint=12345678],['uppercase geometry fingerprint',value=>value.geometryFingerprint='ABCDEF12'],
  ['extra encoding',value=>value.eventEncoding='target-v1'],['wrong settlement version',value=>value.config.system='settlement'],
 ];
 for(const [label,mutate]of cases){const changed=structuredClone(original);mutate(changed);assert.throws(()=>parseWorkbenchReport(json(changed)),label);}
 assert.throws(()=>parseWorkbenchReport('{'),/JSON report/);
 assert.throws(()=>parseWorkbenchReport(' '.repeat(2_000_001)),/2 MB/);
 assert.deepEqual(parseWorkbenchReport(json(original)),original);
});

test('resilience: malformed action timelines and checkpoint shapes cannot become replay input',()=>{
 const original=report();
 const cases:[string,(value:any)=>void][]=[
  ['null event',value=>value.events[0]=null],['array event',value=>value.events[0]=[]],
  ['missing accepted',value=>delete value.events[0].accepted],['non-boolean accepted',value=>value.events[0].accepted=1],
  ['array action',value=>value.events[0].action=['build-store']],['extra action field',value=>value.events[0].targetId='foreign'],
  ['fractional action tick',value=>value.events[0].tick=.5],['future action',value=>value.events[1].tick=81],
  ['decreasing action ticks',value=>{value.events[0].tick=40;value.events[1].tick=0;}],
  ['null checkpoint',value=>value.checkpoints[0]=null],['array checkpoint',value=>value.checkpoints[0]=[]],
  ['duplicate checkpoint',value=>value.checkpoints[1]=value.checkpoints[0]],
  ['decreasing checkpoints',value=>value.checkpoints.reverse()],['non-sample checkpoint',value=>value.checkpoints[1].tick=39],
  ['future checkpoint',value=>value.checkpoints[2].tick=120],['missing initial checkpoint',value=>value.checkpoints.shift()],
  ['invalid fingerprint',value=>value.checkpoints[0].fingerprint='not-a-hash'],
  ['non-string fingerprint',value=>value.checkpoints[0].fingerprint=['12345678']],
 ];
 for(const [label,mutate]of cases){const changed=structuredClone(original);mutate(changed);assert.throws(()=>parseWorkbenchReport(json(changed)),label);}
 assert(replayWorkbench(original,'test').result.match,'valid mixed accepted/rejected timeline still replays');
});

test('resilience: replay rebuilds snapshots and export evidence instead of trusting imported display or save fields',()=>{
 const original=report(),forged:any=structuredClone(original);
 forged.snapshot={tick:999,inventory:{cargo:999},checks:[{pass:true}],actors:null};
 forged.scope='forged';forged.reload={checked:true,pass:true};forged.visualReview='reviewed';
 forged.state={seed:999,inventory:{wood:999}};forged.save='not campaign bytes';
 assert.throws(()=>parseWorkbenchReport(json(forged)),/Unsupported/,'unknown imported fields now fail closed');delete forged.state;delete forged.save;
 const replay=replayWorkbench(parseWorkbenchReport(json(forged)),'test');
 assert(replay.result.match);assert.deepEqual(replay.result.report,original);
 assert.deepEqual(replay.session.snapshot(),original.snapshot);
 assert(!Object.hasOwn(replay.result.report,'state'));assert(!Object.hasOwn(replay.result.report,'save'));
 assert.equal(replay.result.report.visualReview,'not-reviewed');
});

test('resilience: malformed worker commands return errors without changing an existing scenario',()=>{
 const handle=createWorkbenchHandler();let id=1;
 assert(handle({id:id++,kind:'create',config:DEFAULT_WORKBENCH_CONFIG,revision:'test'}).ok);
 const before=handle({id:id++,kind:'report'}).report!;
 const malformed:unknown[]=[null,undefined,{},[],{id:-1,kind:'report'},{id:'3',kind:'report'},{id:1.5,kind:'report'},
  {id:4,kind:'unknown'},{id:5,kind:'action',action:null},{id:6,kind:'action',action:'foreign-action'}];
 for(const ticks of [null,undefined,'4',-1,.5,241,Infinity,NaN])malformed.push({id:id++,kind:'advance',ticks});
 for(const request of malformed){const response=handle(request as WorkbenchRequest);assert.equal(response.ok,false);assert.equal(typeof response.error,'string');assert.deepEqual(handle({id:id++,kind:'report'}).report,before);}
 assert.equal(handle({id:id++,kind:'advance',ticks:4}).snapshot!.tick,4);
});

test('resilience: failed replay invalidates old worker state and a fresh creation restores service',()=>{
 const handle=createWorkbenchHandler();
 assert(handle({id:1,kind:'create',config:DEFAULT_WORKBENCH_CONFIG,revision:'test'}).ok);
 assert.equal(handle({id:2,kind:'advance',ticks:4}).snapshot!.tick,4);
 const failed=handle({id:3,kind:'replay',text:'{',revision:'test'});
 assert.equal(failed.ok,false);assert.match(failed.error!,/JSON report/);
 assert.match(handle({id:4,kind:'report'}).error!,/Generate a scenario first/);
 const recovered=handle({id:5,kind:'create',config:{...DEFAULT_WORKBENCH_CONFIG,seed:42},revision:'test'});
 assert(recovered.ok);assert.equal(recovered.snapshot!.tick,0);
 assert.equal(handle({id:6,kind:'report'}).report!.config.seed,42);
});

test('resilience: malformed worker responses fail closed without throwing or leaving a pending request',async()=>{
 const malformed:unknown[]=[null,undefined,[],{},'broken',42,{id:1},{id:1,ok:'true'},
  {id:'1',ok:true},{id:-1,ok:true},{id:1.5,ok:true},{id:Number.MAX_SAFE_INTEGER+1,ok:true},
  {id:1,ok:false},{id:1,ok:false,error:42}];
 for(const data of malformed){
  const worker=new WorkerFake(),client=new WorkbenchClient(worker);
  const pending=client.request({kind:'report'}),rejected=assert.rejects(pending,/malformed|invalid.*response/i);
  try{
   assert.doesNotThrow(()=>worker.respond(data),`malformed response ${json(data)}`);
   assert(worker.terminated,'malformed data must synchronously terminate the uncertain worker');
   await rejected;assert.equal(worker.onmessage,null);
   await assert.rejects(client.request({kind:'report'}),/reset/i);
  }finally{client.dispose();await rejected.catch(()=>{});}
 }
 const replacement=new WorkerFake(),fresh=new WorkbenchClient(replacement);
 try{const pending=fresh.request({kind:'report'});replacement.respond({id:1,ok:true});assert.equal((await pending).id,1);}
 finally{fresh.dispose();}
});

test('resilience: duplicate and stale replies cannot settle a newer pending client request',async()=>{
 const worker=new WorkerFake(),client=new WorkbenchClient(worker);
 try{
  const first=client.request({kind:'report'});worker.respond({id:1,ok:true});await first;
  let settled=false;const second=client.request({kind:'reload'}).then(response=>{settled=true;return response;});
  worker.respond({id:1,ok:true});worker.respond({id:1,ok:false,error:'late old failure'});worker.respond({id:999,ok:true});
  await settle();assert.equal(settled,false);assert.equal(worker.requests.length,2);
  worker.respond({id:2,ok:true,reload:{checked:true,pass:true}});assert.equal((await second).reload!.pass,true);
  const third=client.request({kind:'report'});worker.respond({id:2,ok:true});await settle();worker.respond({id:3,ok:true});await third;
  const failure=client.request({kind:'action',action:'foreign-action'}),rejected=assert.rejects(failure,/Unknown action/);
  worker.respond({id:4,ok:false,error:'Unknown action'});await rejected;assert.equal(worker.terminated,false);
  const recovered=client.request({kind:'report'});worker.respond({id:5,ok:true});await recovered;
 }finally{client.dispose();}
});

test('resilience: synchronous postMessage failure releases the client slot and disposal ignores captured callbacks',async()=>{
 const worker=new WorkerFake(),post=worker.postMessage.bind(worker);let fail=true;
 worker.postMessage=request=>{if(fail){fail=false;throw Error('structured clone failed');}post(request);};
 const client=new WorkbenchClient(worker);
 await assert.rejects(client.request({kind:'report'}),/structured clone failed/);
 const next=client.request({kind:'report'});assert.equal(worker.requests[0]!.id,2);worker.respond({id:2,ok:true});await next;
 const pending=client.request({kind:'reload'}),late=worker.onmessage!;
 const rejected=assert.rejects(pending,/replaced/);client.dispose();await rejected;
 assert.doesNotThrow(()=>late({data:{id:3,ok:true}} as MessageEvent<WorkbenchResponse>));
 assert(worker.terminated);await assert.rejects(client.request({kind:'report'}),/closed|reset/);
});

test('resilience: literal controls serialize repeated export and reload clicks and ignore duplicate replies',async t=>{
 const h=harness(t);h.worker().flush();await settle();const fingerprint=h.ui.getSnapshot()!.fingerprint;
 h.get('wb-export').onclick!();h.get('wb-export').onclick!();h.get('wb-reload').onclick!();h.get('wb-step').onclick!();
 assert.equal(h.worker().requests.length,2);assert.equal(h.worker().requests[1]!.kind,'report');
 const exported=h.worker().flush();await settle();assert.equal(h.downloads.length,1);
 h.get('wb-reload').onclick!();h.get('wb-reload').onclick!();assert.equal(h.worker().requests.length,3);
 h.worker().respond(exported);await settle();assert(h.get('wb-step').disabled);assert.equal(h.downloads.length,1);
 h.worker().flush();await settle();assert.match(h.get('wb-replay-status').textContent,/ROUND-TRIP MATCH/);
 assert.equal(h.get('wb-step').disabled,false);assert.equal(h.ui.getSnapshot()!.fingerprint,fingerprint);
});

test('resilience: latest file selection wins even if older import reads or errors finish last',async t=>{
 const h=harness(t);h.worker().flush();await settle();
 const old=deferred(),latest=deferred(),oldRead=h.importFile({size:10,text:()=>old.promise}),latestRead=h.importFile({size:10,text:()=>latest.promise});
 latest.resolve(json(report(42)));await latestRead;assert.equal(h.workers.length,2);
 h.worker().flush();await settle();const fingerprint=h.ui.getSnapshot()!.fingerprint,status=h.get('wb-replay-status').textContent;
 old.reject(Error('old read failed'));await oldRead;
 assert.equal(h.workers.length,2);assert.equal(h.get('wb-seed').value,'42');assert.equal(h.ui.getSnapshot()!.fingerprint,fingerprint);
 assert.equal(h.get('wb-replay-status').textContent,status);
 const slow=deferred(),slowRead=h.importFile({size:10,text:()=>slow.promise});
 await h.importFile({size:1,text:async()=>'{'});assert.match(h.get('wb-replay-status').textContent,/JSON report/);
 slow.resolve(json(report(7)));await slowRead;
 assert.equal(h.workers.length,2);assert.equal(h.get('wb-seed').value,'42');assert.equal(h.ui.getSnapshot()!.fingerprint,fingerprint);
});

test('resilience: malformed, unreadable and oversized imports preserve the usable UI session',async t=>{
 const h=harness(t);h.worker().flush();await settle();h.get('wb-second').onclick!();h.worker().flush();await settle();
 const fingerprint=h.ui.getSnapshot()!.fingerprint,bad:any=report();bad.config.system=['trade'];
 const files=[
  {size:10,text:async()=>{throw Error('file read interrupted');}},
  {size:10,text:async()=>json(bad)},
  {size:2_000_001,text:async()=>{assert.fail('oversized files must not be read');return '';}},
  {size:10,text:async()=>{const value=report();value.checkpoints=[];return json(value);}},
 ];
 for(const file of files){
  await h.importFile(file);assert.equal(h.workers.length,1);assert.equal(h.worker().terminated,false);
  assert.equal(h.ui.getSnapshot()!.fingerprint,fingerprint);assert.equal(h.get('wb-export').disabled,false);
 }
 h.get('wb-export').onclick!();h.worker().flush();await settle();
 assert.equal(h.downloads.length,1);assert.equal(parseWorkbenchReport(h.downloads[0]!.text).finalTick,4);
});

test('resilience: replacing or disposing a pending export cannot download an obsolete report',async t=>{
 const h=harness(t);h.worker().flush();await settle();
 h.get('wb-export').onclick!();const old=h.worker(),oldReply=old.onmessage!,oldResponse=old.handle(old.requests.at(-1)!);
 h.get('wb-seed').value='42';h.get('wb-seed').oninput!();h.submit();
 oldReply({data:oldResponse} as MessageEvent<WorkbenchResponse>);await settle();
 assert(old.terminated);assert.equal(h.downloads.length,0);assert.equal(h.ui.getSnapshot(),undefined);
 h.worker().flush();await settle();assert.equal(h.get('wb-seed').value,'42');
 h.get('wb-export').onclick!();const active=h.worker(),late=active.onmessage!,response=active.handle(active.requests.at(-1)!);
 const file=deferred(),read=h.importFile({size:10,text:()=>file.promise});
 h.ui.dispose();late({data:response} as MessageEvent<WorkbenchResponse>);file.resolve(json(report(7)));await read;await settle();
 assert(active.terminated);assert.equal(h.downloads.length,0);assert.equal(h.workers.length,2);assert.equal(h.frames.size,0);
});

test('resilience: malformed worker data visibly releases UI busy state and regeneration recovers',async t=>{
 const h=harness(t);h.worker().flush();await settle();h.get('wb-step').onclick!();
 const failed=h.worker();assert(h.get('wb-step').disabled);
 assert.doesNotThrow(()=>failed.respond(null));await settle();
 assert(failed.terminated);assert.match(h.get('wb-status').textContent,/malformed|invalid.*response/i);
 assert.match(h.get('wb-status').textContent,/reset/i);assert.equal(h.get('wb-step').disabled,false);
 h.get('wb-step').onclick!();await settle();assert.equal(failed.requests.length,2);assert.match(h.get('wb-status').textContent,/reset/i);
 h.submit();h.worker().flush();await settle();assert.equal(h.workers.length,2);assert.equal(h.ui.getSnapshot()!.tick,0);
 h.get('wb-step').onclick!();h.worker().flush();await settle();assert.equal(h.ui.getSnapshot()!.tick,1);
});
