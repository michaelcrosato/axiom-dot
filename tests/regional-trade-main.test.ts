import {townLifeFacilities} from '../src/town-life.ts';
import {startingTown,TOWN_SPAWN} from '../src/starting-town.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createRegionalState,enableRegionalSupply,enableRegionalTrade,applyAction,type State} from '../src/world.ts';
import {regionalSupplyPlan,regionalSupplyProjectBoxes} from '../src/regional-supply.ts';
import {regionalTradePlan,regionalTradeProjectBoxes,regionalTradeTargetSignature,regionalTradeConstructionBoxes,regionalTradeCommandPosition} from '../src/regional-trade.ts';
import {generateRegionalChunk} from '../src/regional-world.ts';
import {RegionalStreamer} from '../src/regional-stream.ts';
import {createRegionalView} from '../src/regional-view.ts';
import {wildernessFeatureRemaining,wildernessSegmentClear} from '../src/wilderness.ts';
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
function extract(start:string,end:string){const a=main.indexOf(start),b=main.indexOf(end,a+start.length);assert(a>=0&&b>a,`live source ${start}/${end}`);return main.slice(a,b);}
function harness(){
 let initial=enableRegionalTrade(enableRegionalSupply(createRegionalState(73129)));const source=regionalTradePlan(initial.seed).sources[0]!;initial=applyAction(initial,{type:'move',x:source.interactionPosition.x,z:source.interactionPosition.z});
 const functions=[extract('function regionalPhysical(', 'const regionalStreamer='),extract('function clearRegionalProjection(', 'async function sendWorldPacket('),extract('function regionalTradeChunkTargets(', '\n/** Food projections')].join('\n');
 const receiver=extract('worker.onmessage=(e)=>', " if(m.type==='online-motion-ack')")+'};';
 const at=main.indexOf('regionalTradeView?.sync(state.frontierTrade'),sync=main.slice(at,main.indexOf(';',at)+1);assert(at>=0);
 const prefix=`const {startingTown,TOWN_SPAWN,townLifeFacilities,regionalSupplyPlan,regionalSupplyProjectBoxes,regionalTradePlan,regionalTradeProjectBoxes,regionalTradeTargetSignature,regionalTradeConstructionBoxes,regionalTradeCommandPosition,generateRegionalChunk,RegionalStreamer,createRegionalView,wildernessFeatureRemaining,wildernessSegmentClear,applyAction}=deps;
 let state=initial,zoneEpoch=0,labActive=false,physicsReady=true,transitioning=false,sessionReloading=false,coopPending=false,selectedRegionalTradeTarget,renderCount=0,closed=0,mounted=null,lastPresentation=null,tradeClears=0;
 const combo={phase:'idle'},guard={},guardBusy=()=>false,contactBusy=()=>false,physicsMotion={grounded:true,crouched:false},coop={active:false,canAct:true},targetPosition={...regionalTradePlan(state.seed).sources[0].interactionPosition},movableBodies=[],traversalBodies=()=>[],combatObstacles=()=>[];
 const panel={hidden:true,dataset:{type:'settings'}},opened=[],messages=[],sent=[],regionalPending=new Map(),regionalConfirmedObstacles=new Map(),regionalConfirmedProjects=new Map(),regionalConfirmedTrade=new Map(),regionalView=createRegionalView(),regionalTravel={last:null},worker={};
 const makeLabel=()=>{},sendPhysics=m=>messages.push(m),regionalSupplyView={clear(){}},regionalFoodView={clear(){}},regionalTradeView={sync(s,options){lastPresentation={state:s,options,dt:arguments[2]}},clear(){tradeClears++}},toast=()=>{},closePanel=()=>{closed++;panel.hidden=true;},openPanel=type=>{opened.push(type);if(!panel.hidden&&panel.dataset.type===type){closePanel();return;}panel.hidden=false;panel.dataset.type=type;renderRegionalTradePanel();},mountRegionalTradePanel=(p,s,o)=>{mounted=o;renderCount++;},sendWorldAction=(action,sound)=>{sent.push({action,sound});state=applyAction(state,action);},console={warn(){}};
 const regionalStreamer=new RegionalStreamer(state.seed,{request(){throw Error('Unexpected generator')},dispose(){},backend:'extracted-main-test'},()=>{},()=>{},()=>''),confirmCell=()=>{throw Error('Unexpected legacy receipt')};`;
 const suffix=`return {show:showRegionalTrade,canRun:canRegionalTradeAction,get mounted(){return mounted},panel,opened,sent,messages,regionalPending,regionalConfirmedTrade,regionalConfirmedObstacles,regionalStreamer,movableBodies,get state(){return state},get renderCount(){return renderCount},get closed(){return closed},get tradeClears(){return tradeClears},setOnline(value){coop.active=value;},
 stage(cx,cz,revision=1){const chunk=generateRegionalChunk(state.seed,cx,cz),entry={key:'region:'+chunk.key,cx,cz,revision,chunk,signature:'fixture',confirmed:false};regionalStreamer.entries.set(entry.key,entry);stageRegionalCell(entry,false);return entry.key;},ack(key,revision,loaded=true,epoch=zoneEpoch){worker.onmessage({data:{type:'cell-ack',key,revision,loaded,epoch}});},unload(key,revision){regionalStreamer.entries.get(key).unloadingRevision=revision;},setMotion(p){Object.assign(physicsMotion,p)},setPose(p){Object.assign(targetPosition,p);state={...state,player:{...state.player,x:p.x,z:p.z}};},setFlags(p){if('labActive'in p)labActive=p.labActive;if('physicsReady'in p)physicsReady=p.physicsReady;},sync(blocked=false){const dt=.25,reducedMotion=false,document={hidden:false},windowActive=true;${sync}return lastPresentation;},clear(){clearRegionalProjection()},nextEpoch(){zoneEpoch++;clearRegionalProjection();}};`;
 return new Function('deps','initial',stripTypeScriptTypes('function createHarness(){const startup={playing:true,initialized:true,failed:false};'+prefix+functions+receiver+suffix+'}',{mode:'transform'})+';return createHarness();')({startingTown,TOWN_SPAWN,townLifeFacilities,regionalSupplyPlan,regionalSupplyProjectBoxes,regionalTradePlan,regionalTradeProjectBoxes,regionalTradeTargetSignature,regionalTradeConstructionBoxes,regionalTradeCommandPosition,generateRegionalChunk,RegionalStreamer,createRegionalView,wildernessFeatureRemaining,wildernessSegmentClear,applyAction},initial);
}
function loadSource(api:ReturnType<typeof harness>,revision=1){const source=regionalTradePlan(api.state.seed).sources[0]!,[cx,cz]=source.ownerChunk.split(':').map(Number),keys:string[]=[];for(let x=cx!-1;x<=cx!+1;x++)for(let z=cz!-1;z<=cz!+1;z++){const key=api.stage(x,z,revision);api.ack(key,revision);keys.push(key);}return keys;}

test('executed freight main keeps remote panel inspection read-only and rerenders target without toggling closed',()=>{
 const api=harness(),plan=regionalTradePlan(api.state.seed),before=JSON.stringify(api.state);api.show(plan.sources[0]!.id);api.show(plan.projects[0]!.id);api.show(plan.routes[0]!.id);assert.equal(api.panel.hidden,false);assert.equal(api.panel.dataset.type,'regional-trade');assert.equal(api.renderCount,3);assert.equal(api.closed,0);assert.deepEqual(api.opened,['regional-trade']);assert.equal(JSON.stringify(api.state),before);assert.equal(api.mounted.readState(),api.state.frontierTrade);api.clear();
});
test('executed freight commands require acknowledged ground, current signature, stance and clear new solid envelope',()=>{
 const api=harness(),source=regionalTradePlan(api.state.seed).sources[0]!,command={type:'start-source',targetId:source.id,expectedRevision:0};api.show(source.id);assert.equal(api.canRun(command),false);loadSource(api);assert.equal(api.canRun(command),true);
 api.setMotion({grounded:false});assert.equal(api.canRun(command),false);api.setMotion({grounded:true,crouched:true});assert.equal(api.canRun(command),false);api.setMotion({crouched:false});api.setFlags({labActive:true});assert.equal(api.canRun(command),false);api.setFlags({labActive:false});
 const box=regionalTradeConstructionBoxes(api.state.seed,source.id)[0]!;api.movableBodies.push({x:box.center.x,y:box.center.y,z:box.center.z,hx:.3,hy:.5,hz:.3});assert.equal(api.canRun(command),false);api.movableBodies.length=0;
 api.mounted.command(command);assert.equal(api.sent.length,1);assert.equal(api.state.frontierTrade.revision,1);assert.equal(api.canRun(command),false);api.mounted.command(command);assert.equal(api.sent.length,1);api.clear();
});
test('exact chunk acknowledgment gates source collision and presentation across stale epoch, unload and restoration',()=>{
 const api=harness(),source=regionalTradePlan(api.state.seed).sources[0]!,[cx,cz]=source.ownerChunk.split(':').map(Number);loadSource(api);api.show(source.id);api.mounted.command({type:'start-source',targetId:source.id,expectedRevision:0});const signature=regionalTradeTargetSignature(api.state.seed,api.state.frontierTrade,source.id);assert(signature);assert.equal(api.sync().options.isConfirmed(source.id,signature),false);
 const key=api.stage(cx,cz,2),packet=api.messages.at(-1);assert(packet.obstacles.some((o:any)=>o.featureId===source.id+'/work-stock'));api.ack(key,1);api.ack(key,2,true,-1);assert.equal(api.sync().options.isConfirmed(source.id,signature),false);api.ack(key,2);assert.equal(api.sync().options.isConfirmed(source.id,signature),true);assert.equal(api.sync().options.isTerrainConfirmed(source.position),true);
 api.unload(key,3);api.ack(key,3,false);assert.equal(api.sync().options.isConfirmed(source.id,signature),false);assert.equal(api.sync().options.isTerrainConfirmed(source.position),false);api.stage(cx,cz,4);api.ack(key,4);assert.equal(api.sync().options.isConfirmed(source.id,signature),true);api.nextEpoch();assert.equal(api.regionalConfirmedTrade.size,0);assert.equal(api.tradeClears,1);api.ack(key,4,true,0);assert.equal(api.sync().options.isConfirmed(source.id,signature),false);api.clear();
});

 test('executed main advances online freight presentation while a menu pauses local controls',()=>{
 const api=harness();loadSource(api);assert.equal(api.sync(true).dt,0,'solo menu is paused');api.setOnline(true);assert.equal(api.sync(true).dt,.25,'online freight shares advancing room clock even behind menu');api.setFlags({physicsReady:false});assert.equal(api.sync(true).dt,0,'unready physical world still gates projection');api.clear();
});
