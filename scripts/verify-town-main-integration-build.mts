/** Actual emitted worker/view on the same source-main VM boundary. No DOM/GPU boot. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createTownView} from '../src/town-view.ts';
import {runTownMainIntegration,assertTownMainIntegration,MAIN_INTEGRATION_SCOPE,type MainIntegrationOptions} from '../tests/helpers/town-main-integration.ts';

const root=resolve(import.meta.dirname,'..'),assets=resolve(root,'dist/client/assets'),files=readdirSync(assets);
const mainFile=files.find(f=>/^main-.*\.js$/.test(f)),workerFile=files.find(f=>/^physics\.worker-.*\.js$/.test(f));assert(mainFile&&workerFile,'actual production main and physics worker must exist');
let projectionFile='',factory:typeof createTownView|undefined;
for(const file of files.filter(f=>/^town-projection-.*\.js$/.test(f))){const module=await import(pathToFileURL(resolve(assets,file)).href);for(const value of Object.values(module))if(typeof value==='function'&&value.toString().includes('hearthmere-residents')){factory=value as typeof createTownView;projectionFile=file;}}
assert(factory,'actual emitted town projection factory');
const main=readFileSync(resolve(assets,mainFile),'utf8'),physics=readFileSync(resolve(assets,workerFile),'utf8');
assert(main.includes(projectionFile),'production main imports the exercised emitted projection');assert(main.includes(workerFile),'production main starts the exercised emitted physics worker');
assert.match(main,/\.acceptLife\(/,'built main accepts intermediate life snapshots');assert.match(main,/\.couplePhysics\(/,'built main enables coupled contact presentation');assert.match(main,/\.acceptPhysicsPoses\(/,'built main accepts worker-confirmed resident poses');
assert.match(main,/\.contactPoses\.length===100/,'built main takes the complete displayed population');
assert.match(main,/authoritativeMotion===1/,'built main checks authoritative ownership before sharing displayed poses');
assert.match(physics,/authoritativeMotion/,'emitted physics keeps the authoritative contact path');
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const identity={main:{file:mainFile,sha256:hash(main)},worker:{file:workerFile,sha256:hash(physics)},projection:{file:projectionFile,sha256:hash(readFileSync(resolve(assets,projectionFile),'utf8'))}};
const held=[...readFileSync(resolve(root,'EXPERIMENTAL-PREVIEW.md'),'utf8').matchAll(/^- (tests\/[^\n]+\.test\.ts)$/gm)].map(m=>m[1]);assert.equal(held.length,13,'preserve the existing held-test boundary');
const profiles:MainIntegrationOptions[]=[{cadence:5,fixture:'fresh',seconds:120,organic:true,actorWalk:true},{cadence:'jitter',fixture:'fresh',seconds:125,organic:true,pause:true,deliveryJitter:true},{cadence:5,fixture:'fresh',seconds:120,actorWalk:true},{cadence:'jitter',fixture:'150',seconds:125,pause:true,deliveryJitter:true}];
const cases=[];
for(const options of profiles){
 console.error('Production source boundary',JSON.stringify(options));const source=assertTownMainIntegration(await runTownMainIntegration(options));
 console.error('Production emitted worker/view boundary',JSON.stringify(options));const emitted=assertTownMainIntegration(await runTownMainIntegration({...options,factory,workerFile:pathToFileURL(resolve(assets,workerFile)),captureContacts:false}));
 assert.deepEqual(emitted.finalState,source.finalState,'emitted worker drives identical accepted world state');
 assert.deepEqual(emitted.residents,source.residents,'emitted view preserves all resident matrix displacement/task metrics');
 assert.deepEqual(emitted.physicsActorContacts,source.physicsActorContacts,'emitted physics preserves every player/resident contact interval');assert.equal(emitted.physicsMinActorGap,source.physicsMinActorGap);assert.equal(emitted.physicsOverlapSteps,source.physicsOverlapSteps);
 assert.deepEqual(emitted.progressWindows,source.progressWindows,'emitted view preserves rolling meaningful activity');
 for(const key of ['maxLag','maxRootStep','unsafeVisibleChords','completionBeforeVisibleArrival','completionBeforeAuthorityArrival','taskProgressAwayFromStation','completedActions','candidateContactPacketDifference','drawnAcceptedSnapshotDifference','acknowledgedContactSnapshots','authoritativeContactPackets','minVisibleBodyGap','minVisibleActorGap','peerOverlapSamples','actorOverlapSamples'] as const)assert.equal(emitted.metrics[key],source.metrics[key],key);
 const summary=({finalState,productionFrame,...r}:typeof source)=>r;
 cases.push({profile:options,source:summary(source),emitted:summary(emitted),stateSha256:hash(JSON.stringify(source.finalState))});
}
const result={kind:'axiom-town-production-boundary-emitted',version:1,scope:MAIN_INTEGRATION_SCOPE,emittedScope:'Actual minified production worker and view execute; the complete production source main message handler is the shared VM consumer. Built main is checked for matching imports and snapshot/display-contact bridge. The entire emitted browser entry point is not executed. Source-only read-only crowd tracing observes input/output; emitted parity is checked through actual worker snapshots driving identical world and matrix outcomes.',runtime:process.version,identity,excluded:held,cases};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
