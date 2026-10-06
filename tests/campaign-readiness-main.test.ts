import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {mainFunction} from './helpers/main-source.ts';
import {CAMPAIGN_ACTION_READINESS_ENGINE} from '../src/campaign-action-readiness.ts';
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
function readiness(){
 const point={x:10,y:6,z:10},state={seed:7,zone:'valley',regional:true,townLife:{},restoration:{},player:{x:10,z:10,hp:100}},targetPosition={...point};
 const coop={active:false,canAct:true,status:'connected',snapshot:{selfId:'host',hostId:'host',closed:false,paused:false}},confirmed=new Map([['region:0:0',[]]]),motion={grounded:true,crouched:false};let clear=true;
 const deps={CAMPAIGN_ACTION_READINESS_ENGINE,state,targetPosition,coop,physicsMotion:motion,regionalConfirmedObstacles:confirmed,WORKSHOP_BOARD:point,worldHeight:()=>6,combatObstacles:()=>[{featureId:'wall'},{featureId:'restoration-automaton'}],clearPulsePath:()=>clear,worldRestorationPlan:()=>({}),worldTownSupplySources:()=>[],TOWN_SUPPLY_ENGINE:{position:(_s:unknown,_p:unknown,c:any)=>c.targetId==='missing'?null:point},RESTORATION_CARE_ENGINE:{position:(_p:unknown,c:any)=>c.targetId==='missing'?null:point},restorationCommandPosition:(_s:unknown,_p:unknown,c:any)=>c.targetId==='missing'?null:point,guardBusy:()=>false,contactBusy:()=>false,combo:{phase:'idle'},guard:{},LAB_OBSTACLES:[]};
 const names=['campaignControlReason','campaignTargetReason','workshopConstructionBlockReason','restorationCareBlockReason','townSupplyBlockReason','restorationBlockReason'];
 const source='let sessionReloading=false,sessionLoadFailed=false,labActive=false,coopPending=false,physicsReady=true,transitioning=false;'+names.map(n=>mainFunction(main,n)).join('\n')+'return {workshop:workshopConstructionBlockReason,care:restorationCareBlockReason,supply:townSupplyBlockReason,restoration:restorationBlockReason,setPending:v=>{coopPending=v;},setPhysics:v=>{physicsReady=v;}};';
 return {api:new Function(...Object.keys(deps),stripTypeScriptTypes('function fixture(){'+source+'}')+';return fixture();')(...Object.values(deps)),state,targetPosition,coop,confirmed,motion,clear:(v:boolean)=>{clear=v;}};
}
test('campaign main reports host, reconnect, terrain acknowledgement and path changes without changing state',()=>{
 const f=readiness(),command={kind:'deliver',targetId:'workshop',expectedRevision:0},before=JSON.stringify(f.state);
 for(const run of [()=>f.api.workshop(),()=>f.api.supply(command),()=>f.api.care(command)]){
  assert.equal(run(),null);f.coop.active=true;f.coop.snapshot.selfId='guest';assert.match(run(),/Only the host/);f.coop.snapshot.selfId='host';f.coop.canAct=false;assert.match(run(),/Connection interrupted/);f.coop.snapshot.paused=true;assert.match(run(),/host to return/);f.coop.snapshot.paused=false;f.coop.canAct=true;
  f.confirmed.clear();assert.match(run(),/collision confirmation/);f.confirmed.set('region:0:0',[]);f.clear(false);assert.match(run(),/solid obstacle/);f.clear(true);assert.equal(run(),null);f.coop.active=false;
 }
 f.api.setPending(true);assert.match(f.api.supply(command),/Connecting/);f.api.setPending(false);f.api.setPhysics(false);assert.match(f.api.workshop(),/Terrain is still preparing/);f.api.setPhysics(true);f.motion.crouched=true;assert.match(f.api.care(command),/Stand upright/);f.motion.crouched=false;assert.equal(JSON.stringify(f.state),before);
});
test('restoration main explains refit host ownership without withholding ordinary guest field actions',()=>{
 const f=readiness();f.coop.active=true;f.coop.snapshot.selfId='guest';assert.match(f.api.restoration({kind:'refit',targetId:'dock'}),/Only the host/);assert.equal(f.api.restoration({kind:'service',targetId:'dock'}),null);f.confirmed.clear();assert.match(f.api.restoration({kind:'service',targetId:'dock'}),/collision confirmation/);assert.match(f.api.supply({kind:'load',targetId:'missing'}),/Only the host/);f.coop.snapshot.selfId='host';assert.match(f.api.supply({kind:'load',targetId:'missing'}),/no longer available/);
});
test('campaign dispatch returns recoverable rejection without queuing or spending and does not claim a refused queue entry',()=>{
 const state={zone:'valley',events:[]},action={type:'town-supply',command:{kind:'deliver',targetId:'workshop',expectedRevision:0}};let ready=false,sends=0,applied=0,commits=0,accepted=false;
 const coop={active:false,canAct:true,send:()=>{sends++;return accepted;}},messages:string[]=[];
 const deps={state,coop,sessionReloading:false,labActive:false,townSupplyReady:()=>ready,townSupplyBlockReason:()=>ready?null:'Terrain at Second Life Salvage is still loading. Wait for collision confirmation.',toast:(m:string)=>messages.push(m),applyAction:()=>{applied++;return state;},commit:()=>{commits++;}};
 const send=new Function(...Object.keys(deps),stripTypeScriptTypes(mainFunction(main,'sendWorldAction'))+';return sendWorldAction;')(...Object.values(deps));
 assert.match(send(action),/collision confirmation/);assert.deepEqual([sends,applied,commits],[0,0,0]);ready=true;assert.match(send(action),/current world rejected/i);assert.deepEqual([sends,applied,commits],[0,1,1]);coop.active=true;assert.match(send(action),/not queued.*queue is full/);assert.deepEqual([sends,applied,commits],[1,1,1]);accepted=true;assert.equal(send(action),undefined);assert.deepEqual([sends,applied,commits],[2,1,1]);assert.deepEqual(state,{zone:'valley',events:[]});
});
test('accepted host snapshots immediately refresh each connected board without reopening or discarding drafts',()=>{
 const fn=mainFunction(main,'receiveCoopSnapshot'),start=fn.indexOf('acceptTownLifeSnapshot();'),end=fn.indexOf('const banner=',start);assert(start>=0&&end>start);const calls:string[]=[];
 const deps=Object.fromEntries(['acceptTownLifeSnapshot','sync','syncCavePhysics','workshopPanelRefresh','restorationCarePanelRefresh','townSupplyPanelRefresh','campaignGuidancePanelRefresh'].map(n=>[n,()=>calls.push(n)]));
 new Function(...Object.keys(deps),stripTypeScriptTypes(fn.slice(start,end)))(...Object.values(deps));assert.deepEqual(calls,Object.keys(deps));
});
test('playable restoration practice returns synchronous readiness and kernel rejection to its current panel',()=>{
 let blocked:string|null='Release the crate before using this control.';const before={},practice={state:before,context:()=>({player:{x:0,z:0}}),command:()=>({message:'Move clear of the deployment footprint.'})};let commands=0;
 const deps={restorationPracticeBlockReason:()=>blocked,restorationPractice:{...practice,command:()=>{commands++;return practice.command();}},targetPosition:{x:0,z:0},toast:()=>{},labActive:true,restorationReady:()=>false};
 const run=new Function(...Object.keys(deps),stripTypeScriptTypes(mainFunction(main,'runRestorationPracticeCommand'))+';return runRestorationPracticeCommand;')(...Object.values(deps));
 assert.equal(run({kind:'deploy'}),blocked);assert.equal(commands,0);blocked=null;assert.match(run({kind:'deploy'}),/deployment footprint/);assert.equal(commands,1);
});
test('live campaign feedback gate blocks dispatch even when the earlier pose gate still reports ready',()=>{
 for(const type of ['town-supply','restoration-care','workshop-construction']){
  const state={zone:'valley',events:[]};let calls=0;
  const deps={state,sessionReloading:false,labActive:false,coop:{active:false},townSupplyReady:()=>true,restorationCareReady:()=>true,workshopConstructionReady:()=>true,townSupplyBlockReason:()=> 'Connecting to the shared world. Wait for its current state.',restorationCareBlockReason:()=> 'Connecting to the shared world. Wait for its current state.',workshopConstructionBlockReason:()=> 'Connecting to the shared world. Wait for its current state.',applyAction:()=>{calls++;return state;},commit:()=>{calls++;},toast:()=>{}};
  const send=new Function(...Object.keys(deps),stripTypeScriptTypes(mainFunction(main,'sendWorldAction'))+';return sendWorldAction;')(...Object.values(deps));
  assert.match(send({type,command:{kind:'deliver',targetId:'workshop',expectedRevision:0}}),/Connecting/);assert.equal(calls,0);
 }
});
