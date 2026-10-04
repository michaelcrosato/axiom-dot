import assert from 'node:assert/strict';import {readFileSync,readdirSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {createTownView} from '../src/town-view.ts';import {townFrameSeconds,TownSnapshotContinuity} from '../src/town-life-runtime.ts';
import {TownActivityMonitor} from '../src/town-activity.ts';
import {steadyCase,worldCase,assertSteadyCase,assertWorldCase,assertMainFrameContract,TEMPORAL_SCOPE} from '../tests/helpers/town-frame-cases.ts';
const root=resolve(import.meta.dirname,'..'),assets=resolve(root,'dist/client/assets'),files=readdirSync(assets);
let emittedView:typeof createTownView|undefined,emittedSeconds:typeof townFrameSeconds|undefined,helperFile='',helperExport='',emittedContinuity:typeof TownSnapshotContinuity|undefined,emittedMonitor:typeof TownActivityMonitor|undefined;
for(const file of files.filter(f=>/^(?:town-(?:projection|director|life|activity)|world)-.*\.js$/.test(f))){
 const module=await import(pathToFileURL(resolve(assets,file)).href);
 for(const [key,value] of Object.entries(module) as [string,any][]){
  if(typeof value==='function'&&value.toString().includes('hearthmere-residents'))emittedView=value;
  if(typeof value==='function'&&/^function/.test(value.toString())&&value.toString().includes('maxFrameSeconds')&&value.toString().includes('Number.isFinite')&&!value.toString().includes('hearthmere-residents')){assert.equal(value(100),.1);assert.equal(value(2000),.5);emittedSeconds=value;helperFile=file;helperExport=key;}
  if(typeof value==='function'&&value.prototype?.note&&value.prototype?.take&&value.toString().includes('resumeGapSeconds'))emittedContinuity=value;
  if(value?.kind==='axiom-town-activity-watchdog')emittedMonitor=value.Monitor;
 }
}
assert(emittedView&&emittedSeconds&&emittedMonitor&&emittedContinuity,'Actual emitted view, frame helper and monitor must be discoverable');
const mainFile=files.find(f=>/^main-.*\.js$/.test(f))!,main=readFileSync(resolve(assets,mainFile),'utf8');
const imports=[...main.matchAll(/import\{([^}]+)\}from["'`]\.\/([^"'`]+)["'`]/g)],imported=imports.find(m=>m[2]===helperFile);assert(imported);
const entry=imported[1]!.split(',').map(s=>s.trim()).find(s=>s.split(/\s+as\s+/)[0]===helperExport);assert(entry);const local=entry.split(/\s+as\s+/).at(-1)!;const escaped=local.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');assert([...main.matchAll(new RegExp('\\b'+escaped+'\\(', 'g'))].length>=2,'Emitted main must use the real helper in both live frame branches');
const sourceContinuity=new TownSnapshotContinuity(),compiledContinuity=new emittedContinuity();for(const [status,gap]of [['connected',30],['reconnecting',0],['connected',30],['connected',30],['paused',0],['connected',.5],['reconnecting',0],['offline',30],['connected',30]] as const){sourceContinuity.note(status);compiledContinuity.note(status);assert.equal(compiledContinuity.take(gap),sourceContinuity.take(gap));}
assertMainFrameContract(emittedSeconds);for(const raw of [-1,0,1,8.33,1000/15,100,200,499,500,2000,Infinity,NaN])assert.equal(emittedSeconds(raw),townFrameSeconds(raw));
const steady=[];for(const cadence of ['fps5','variable'] as const)for(const online of [false,true]){const options={cadence,online},source=assertSteadyCase(steadyCase(createTownView,townFrameSeconds,options)),emitted=assertSteadyCase(steadyCase(emittedView,emittedSeconds,options));assert.deepEqual(emitted,source);steady.push(emitted);}
const worlds=[];for(const options of [{fixture:'15',cadence:'fps5',online:false},{fixture:'150',cadence:'variable',online:true},{fixture:'150',cadence:'gap2000',online:false},{fixture:'150',cadence:'gap5000',online:true}] as const){const source=assertWorldCase(worldCase(createTownView,townFrameSeconds,options)),emitted=assertWorldCase(worldCase(emittedView,emittedSeconds,options));assert.deepEqual(emitted,source);worlds.push(emitted);}
// Source/emitted diagnostic interpretation must agree on the same exported evidence.
const sourceMonitor=new TownActivityMonitor(),compiledMonitor=new emittedMonitor();
const {createTownLifeOpening,advanceTownLife}=await import('../src/town-life.ts');let life=createTownLifeOpening(73129);
for(let n=0;n<=30;n++){if(n)life=advanceTownLife(life,.5);const now=n*500,matrices=life.residents.map(r=>({index:r.index,x:r.x-5,z:r.z,matrixHash:n*101+r.index,instances:17,inFrustum:true,screenX:0,screenY:0})),input={now,seed:73129,life,matrices,expectedDrawn:100,physicsStep:n*30,renderFrames:n*5+1,renderTime:n*.5,paused:false,mode:'solo' as const,camera:[]};sourceMonitor.sample(input,'emitted-parity');compiledMonitor.sample(input,'emitted-parity');}
assert.deepEqual(compiledMonitor.report(),sourceMonitor.report());const summary=compiledMonitor.report().recentSummary!;assert(summary.lagging.length===100);assert.equal(summary.renderFps,10);assert(summary.warnings.some(w=>w.includes('still moving')));assert(summary.warnings.some(w=>w.includes('Low render cadence')));
const report={kind:'axiom-town-frame-emitted',scope:TEMPORAL_SCOPE,mainFile,helperFile,helperExport,steady,worlds,diagnostics:summary};if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
