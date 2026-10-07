import test from 'node:test';
import assert from 'node:assert/strict';
import {runTownMainIntegration,assertTownMainIntegration,productionTownMain,type MainIntegrationOptions} from './helpers/town-main-integration.ts';

test('town integration executes complete production main handler and ordered contact/render boundary',()=>{
 const main=productionTownMain();assert.match(main.handler,/cell-ack/);assert.match(main.handler,/ready/);assert.match(main.handler,/type==='snapshot'/);assert.match(main.handler,/state=applyAction\(state,\{type:'tick'/);assert(main.frame.indexOf('syncFrontierVisuals(')<main.frame.indexOf('sendMovement();'),'current draw must precede contact packet');assert(main.names.includes('confirmRegionalCell'));assert(main.names.includes('acceptTownLifeSnapshot'));assert.equal(main.coupling,'townView?.couplePhysics();');assert.match(main.handler,/acceptPhysicsPoses/);
});

const cases:MainIntegrationOptions[]=[
 {cadence:5,fixture:'fresh',seconds:120,organic:true},
 {cadence:15,fixture:'fresh',seconds:120,organic:true},
 {cadence:60,fixture:'fresh',seconds:120,organic:true,actorWalk:true},
 {cadence:'jitter',fixture:'fresh',seconds:125,organic:true,pause:true,deliveryJitter:true},
 {cadence:5,fixture:'150',seconds:120},
 {cadence:10,fixture:'175',seconds:120},
 {cadence:30,fixture:'15',seconds:120},
 {cadence:60,fixture:'fresh',seconds:120,actorWalk:true},
 {cadence:'jitter',fixture:'150',seconds:125,pause:true,deliveryJitter:true},
];
for(const options of cases)test(`real worker/main/matrices sustain ${options.seconds}s ${options.cadence}fps ${options.fixture}${options.organic?' organic':''}${options.pause?' with jitter pause and burst recovery':''}`,{timeout:240000},async t=>{
 const result=await runTownMainIntegration(options);
 t.diagnostic(JSON.stringify({...result,finalState:undefined,residents:undefined,productionFrame:undefined}));
 assertTownMainIntegration(result);
 assert(result.workerContactSamples>=200,'actual worker crowd input/output must be observed');
 assert.equal(result.metrics.settledActorOverlapSamples,0,'resident trace respects authenticated explorer');
 if(options.pause){assert(result.duplicateSnapshots>=250,'real paused snapshots repeat the worker step');assert(result.authoritySeconds<=options.seconds!-4.5);}
 else assert(Math.abs(result.authoritySeconds-options.seconds!)<1e-6,'world time tracks accepted worker steps');
});
