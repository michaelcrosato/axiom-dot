import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createState,createConnectedState,createRegionalState,applyAction,activeObjects,serializeSave,parseSave,type State} from '../src/world.ts';
import {sameWorld,storeSession,loadSession,storedSaveText,sessionResetRevision,sessionRecoverySaves,preResetSave,createSessionResetOperation,restartSession} from '../src/session.ts';

const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
function actualFunction(name:string){
 const start=source.indexOf(`function ${name}(`),end=source.indexOf('\n}',start);
 assert.ok(start>=0&&end>start,`Missing main.ts function ${name}`);
 return source.slice(start,end+2);
}
const lifecycle=['reloadCommittedSession','renderRestartPanel','ensureSessionRevision','receiveCoopSnapshot'].map(actualFunction).join('\n');
class Store {
 data=new Map<string,string>();writes:string[]=[];
 getItem(key:string){return this.data.get(key)??null;}
 setItem(key:string,value:string){this.writes.push(key);this.data.set(key,value);}
 get length(){return this.data.size;}
 key(index:number){return [...this.data.keys()][index]??null;}
}
class Element {
 hidden=false;disabled=false;dataset:Record<string,string>={};value='';textContent='';children:Element[]=[];nodes=new Map<string,Element>();focused=false;
 onclick?:()=>void;onchange?:()=>void;
 set innerHTML(html:string){
  this.nodes.clear();this.children=[];
  for(const match of html.matchAll(/<\w+\b([^>]*)>/g)){
   const id=match[1]!.match(/\bid="([^"]+)"/),close=/\bclass="close"/.test(match[1]!);
   if(id||close){const node=new Element();if(id)this.nodes.set('#'+id[1],node);if(close)this.nodes.set('.close',node);}
  }
 }
 querySelector(selector:string){return this.nodes.get(selector)??null;}
 append(...nodes:Element[]){this.children.push(...nodes);}
 focus(){this.focused=true;}
}
function progress(state:State){const item=activeObjects(state).find(o=>o.kind==='scrap')!;assert.ok(item);return applyAction(applyAction(state,{type:'move',x:item.x,z:item.z}),{type:'collect',id:item.id});}
function harness(initial=progress(createRegionalState(73129)),storage=new Store(),initialize=true){
 if(initialize)storeSession(storage,initial,true);
 const panel=new Element(),sessionStorage=new Store(),trace:string[]=[],messages:string[]=[],rescues:string[]=[],downloads:{raw:string;name:string}[]=[];
 const body=`
 const {sameWorld,parseSave,sessionResetRevision,sessionRecoverySaves,preResetSave,createSessionResetOperation,storeSession}=api;
 let state=initial,persistedSessionRevision=sessionResetRevision(localStorage,state),zoneEpoch=12;
 let sessionReloading=false,sessionLoadFailed=false,transitioning=false,physicsReady=true,labActive=false,coopPending=false,coopBoot=null;
 const record=name=>trace.push(name),clearInput=()=>record('clear-input'),toast=message=>messages.push(message),showSessionRecovery=message=>rescues.push(message);
 const coop={active:false,status:'disconnected',disconnect:()=>record('coop-disconnect')};
 let coopPanelDispose=()=>record('coop-panel'),generationPanelDispose=()=>record('generation-panel'),mapPanelDispose=()=>record('map-panel');
 const generationStartupController={abort:()=>record('startup-abort')},regionalCalibrationController={abort:()=>record('calibration-abort')},wildernessProbeController={abort:()=>record('wilderness-abort')};
 const disposeGeneration=()=>record('generation-dispose'),regionalStreamer={dispose:()=>record('regional-dispose')};
 const worker={onmessage:()=>{},terminate:()=>record('worker-terminate')},renderer={setAnimationLoop:value=>{if(value!==null)throw Error('Expected render shutdown');record('render-stop');}},gameAudio={suspend:()=>record('audio-suspend')};
 const location={reload:()=>record('reload')},document={createElement:()=>new Element()},$=id=>{const node=panel.querySelector('#'+id);if(!node)throw Error('Missing element '+id);return node;};
 const closePanel=()=>{panel.hidden=true;},openPanel=type=>{panel.dataset.type=type;panel.hidden=false;},downloadSaveText=(raw,name)=>downloads.push({raw,name});
 ${lifecycle}
 return {panel,worker,coop,trace,messages,rescues,downloads,sessionStorage,
  render(kind='restart'){panel.hidden=false;panel.dataset.type=kind;renderRestartPanel(kind);},
  ensure:ensureSessionRevision,reload:reloadCommittedSession,receive:receiveCoopSnapshot,
  read:()=>({state,zoneEpoch,sessionReloading,sessionLoadFailed,transitioning,physicsReady,coopPanelDispose,generationPanelDispose,mapPanelDispose}),
  set(key,value){if(key==='state')state=value;else if(key==='epoch')zoneEpoch=value;else if(key==='lab')labActive=value;else if(key==='online')coop.active=value;else if(key==='pending')coopPending=value;else if(key==='status')coop.status=value;else if(key==='transition')transitioning=value;else if(key==='ready')physicsReady=value;else if(key==='loadFailed')sessionLoadFailed=value;else if(key==='reloading')sessionReloading=value;else if(key==='boot')coopBoot=value;else throw Error('Unknown fixture setting '+key);}
 };`;
 const make=new Function('initial','localStorage','sessionStorage','panel','Element','api','trace','messages','rescues','downloads',stripTypeScriptTypes('function run(){const activeConversation=null;function closeConversation(){}'+body+'}')+';return run();');
 const h=make(initial,storage,sessionStorage,panel,Element,{sameWorld,parseSave,sessionResetRevision,sessionRecoverySaves,preResetSave,createSessionResetOperation,storeSession},trace,messages,rescues,downloads);
 return {...h,initial,storage,node:(id:string)=>{const node=panel.querySelector('#'+id);assert.ok(node,`Missing control ${id}`);return node;}};
}
const count=(h:ReturnType<typeof harness>,name:string)=>h.trace.filter((item:string)=>item===name).length;
const untouched=(h:ReturnType<typeof harness>,before:Map<string,string>,writes:number)=>{assert.deepEqual(h.storage.data,before);assert.equal(h.storage.writes.length,writes);assert.equal(count(h,'reload'),0);};
const unreadableSnapshot=new Proxy({},{get(){throw Error('A stale co-op snapshot must not be inspected');}});

test('actual restart/recovery Cancel and close controls are read-only and invalidate detached confirmations',()=>{
 for(const kind of ['restart','recover'])for(const close of ['cancel','cross']){
  const storage=new Store(),original=progress(createRegionalState(73129));storeSession(storage,original,true);const current=restartSession(storage,original),h=harness(current,storage,false),before=new Map(storage.data),writes=storage.writes.length;
  h.render(kind);const confirm=h.node('reset-confirm').onclick!;assert.equal(h.node('reset-cancel').focused,true);untouched(h,before,writes);
  if(close==='cancel')h.node('reset-cancel').onclick!();else h.panel.querySelector('.close')!.onclick!();
  assert.equal(h.panel.hidden,true);confirm();untouched(h,before,writes);assert.equal(h.read().state,current);assert.deepEqual(h.trace,[]);
 }
});

test('confirmed same-seed restart reloads exactly once and tears down the complete outgoing runtime',()=>{
 for(const factory of [createState,createConnectedState,createRegionalState]){
  const initial=progress(factory(73129)),h=harness(initial),original=serializeSave(initial);h.render();const confirm=h.node('reset-confirm'),handler=confirm.onclick!;assert.equal(confirm.disabled,false);handler();
  assert.deepEqual(loadSession(h.storage),factory(initial.seed));assert.equal(preResetSave(h.storage,initial),original);assert.equal(sessionResetRevision(h.storage,initial),1);
  assert.equal(h.read().state,initial,'the outgoing document never mixes new state with old render resources');
  assert.equal(h.read().sessionReloading,true);assert.equal(h.read().transitioning,true);assert.equal(h.read().physicsReady,false);assert.equal(h.read().zoneEpoch,13);assert.equal(h.worker.onmessage,null);assert.equal(confirm.disabled,true);
  for(const action of ['clear-input','coop-panel','coop-disconnect','startup-abort','generation-panel','map-panel','generation-dispose','regional-dispose','calibration-abort','wilderness-abort','worker-terminate','render-stop','audio-suspend','reload'])assert.equal(count(h,action),1,action);
  assert.equal(h.read().coopPanelDispose,null);assert.equal(h.read().generationPanelDispose,null);assert.equal(h.read().mapPanelDispose,null);
  const after=new Map(h.storage.data),writes=h.storage.writes.length;handler();handler();h.reload();assert.deepEqual(h.storage.data,after);assert.equal(h.storage.writes.length,writes);assert.equal(count(h,'reload'),1);assert.equal(h.read().zoneEpoch,13);assert.equal(preResetSave(h.storage,initial),original);
 }
});

const blocked=[['online',true],['pending',true],['status','connecting'],['lab',true],['transition',true],['ready',false]] as const;
test('confirmation is disabled for co-op, connecting, lab and unfinished world transitions',()=>{
 for(const [key,value] of blocked){const h=harness(),before=new Map(h.storage.data),writes=h.storage.writes.length;h.set(key,value);h.render();assert.equal(h.node('reset-confirm').disabled,true,key);h.node('reset-confirm').onclick!();untouched(h,before,writes);assert.equal(h.read().zoneEpoch,12);}
});

test('confirmation rechecks lifecycle, world identity, panel route and epoch before committing',()=>{
 for(const reason of [...blocked.map(([key])=>key),'world-seed','world-flavor','epoch','hidden','navigation','loadFailed','reloading']){
  const h=harness();h.render();const confirm=h.node('reset-confirm').onclick!,before=new Map(h.storage.data),writes=h.storage.writes.length;
  const setting=blocked.find(([key])=>key===reason);if(setting)h.set(...setting);
  if(reason==='world-seed')h.set('state',createRegionalState(18));if(reason==='world-flavor')h.set('state',createConnectedState(h.initial.seed));if(reason==='epoch')h.set('epoch',14);if(reason==='hidden')h.panel.hidden=true;if(reason==='navigation')h.panel.dataset.type='settings';if(reason==='loadFailed')h.set('loadFailed',true);if(reason==='reloading')h.set('reloading',true);
  confirm();untouched(h,before,writes);assert.equal(count(h,'worker-terminate'),0,reason);
 }
});

test('same-world changes while confirmation is open reject the obsolete operation without writes',()=>{
 for(const change of ['saved','live']){
  const h=harness();h.render();if(change==='saved')storeSession(h.storage,applyAction(h.initial,{type:'tick',dt:.25}),true);else h.initial.events.push('Progress changed while confirmation was open');
  const before=new Map(h.storage.data),writes=h.storage.writes.length;h.node('reset-confirm').onclick!();untouched(h,before,writes);assert.match(h.node('reset-error').textContent,/Could not commit/);assert.equal(h.node('reset-confirm').disabled,true);
 }
});

test('actual stale-tab revision check locks the old runtime without writing or reloading',()=>{
 const h=harness();assert.equal(h.ensure(),true);assert.deepEqual(h.trace,[]);restartSession(h.storage,h.initial);const before=new Map(h.storage.data),writes=h.storage.writes.length;
 assert.equal(h.ensure(),false);untouched(h,before,writes);assert.equal(h.read().sessionLoadFailed,true);assert.equal(h.read().sessionReloading,false);assert.equal(h.read().transitioning,true);assert.equal(h.read().physicsReady,false);assert.equal(h.read().zoneEpoch,13);assert.equal(h.worker.onmessage,null);assert.equal(h.read().state,h.initial);assert.equal(h.rescues.length,1);assert.match(h.rescues[0],/older tab cannot overwrite/);
 for(const action of ['clear-input','worker-terminate','render-stop','map-panel','generation-panel','regional-dispose','generation-dispose','audio-suspend'])assert.equal(count(h,action),1,action);
 const trace=[...h.trace];assert.equal(h.ensure(),false);h.render();h.receive(unreadableSnapshot);assert.deepEqual(h.trace,trace);untouched(h,before,writes);assert.equal(h.sessionStorage.writes.length,0);
});

test('late co-op snapshots cannot inspect payloads or revive storage after a committed reload',()=>{
 for(const hasBoot of [false,true]){
  const h=harness();if(hasBoot)h.set('boot',{roomId:'old-room',solo:h.initial});h.render();h.node('reset-confirm').onclick!();const before=new Map(h.storage.data),writes=h.storage.writes.length,trace=[...h.trace];
  h.receive(unreadableSnapshot);assert.deepEqual(h.storage.data,before);assert.equal(h.storage.writes.length,writes);assert.deepEqual(h.trace,trace);assert.equal(h.sessionStorage.writes.length,0);assert.equal(count(h,'reload'),1);assert.equal(h.read().state,h.initial);
 }
});

test('incoming co-op snapshot checks a stale solo revision before writing its session handoff',()=>{
 const h=harness();restartSession(h.storage,h.initial);const before=new Map(h.storage.data),writes=h.storage.writes.length;h.receive(unreadableSnapshot);untouched(h,before,writes);assert.equal(h.sessionStorage.writes.length,0);assert.equal(h.read().sessionLoadFailed,true);assert.equal(h.rescues.length,1);
});

test('selected recovery history restores its exact saved progress while retaining the original recovery',()=>{
 const storage=new Store(),original=progress(createRegionalState(73129));storeSession(storage,original,true);
 let later=progress(restartSession(storage,original));later=applyAction(later,{type:'move',x:later.player.x+2,z:later.player.z});storeSession(storage,later,true);const laterRaw=serializeSave(later),current=restartSession(storage,later),history=sessionRecoverySaves(storage,current),selected=history.find(row=>row.epoch===2)!;
 const h=harness(current,storage,false),before=new Map(storage.data),writes=storage.writes.length;h.render('recover');const select=h.node('reset-checkpoint');assert.equal(select.value,history.find(row=>row.epoch===1)!.key);assert.equal(select.children.length,2);assert.ok(select.children.some(option=>option.textContent.includes('original protected run')));untouched(h,before,writes);
 select.value=selected.key;select.onchange!();assert.equal(h.node('reset-confirm').disabled,false);assert.match(h.node('reset-preview').textContent,/collected caches/);h.node('reset-export').onclick!();assert.deepEqual(h.downloads,[{raw:laterRaw,name:'axiom-before-restart-2.json'}]);untouched(h,before,writes);
 const confirm=h.node('reset-confirm').onclick!;confirm();assert.equal(storedSaveText(storage,current),laterRaw);assert.deepEqual(loadSession(storage),later);assert.equal(preResetSave(storage,current),serializeSave(original));assert.equal(sessionResetRevision(storage,current),3);assert.equal(count(h,'reload'),1);
 const saved=new Map(storage.data),committedWrites=storage.writes.length;confirm();assert.deepEqual(storage.data,saved);assert.equal(storage.writes.length,committedWrites);assert.equal(count(h,'reload'),1);assert.deepEqual(sessionRecoverySaves(storage,current).map(row=>row.epoch),[3,2,1]);
});
