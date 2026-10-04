import {townLifeFacilities} from '../src/town-life.ts';
import {startingTown,TOWN_SPAWN} from '../src/starting-town.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createRegionalState,enableRegionalSupply,applyAction,type State} from '../src/world.ts';
import {regionalSupplyPlan,regionalSupplyProjectBoxes,regionalSupplyConstructionBoxes} from '../src/regional-supply.ts';
import {generateRegionalChunk} from '../src/regional-world.ts';
import {RegionalStreamer} from '../src/regional-stream.ts';
import {createRegionalView} from '../src/regional-view.ts';
import {wildernessFeatureRemaining,wildernessSegmentClear} from '../src/wilderness.ts';
import {gatherRegionalSupplyMaterials} from '../src/regional-supply-lab.ts';

const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
function extract(start:string,end:string){const a=main.indexOf(start),b=main.indexOf(end,a+start.length);assert(a>=0&&b>a,`live main source markers ${start} / ${end}`);return main.slice(a,b);}
function fixture(){const p=regionalSupplyPlan(73129).outposts[0]!;let state=enableRegionalSupply(createRegionalState(73129));state=gatherRegionalSupplyMaterials(state,p.deliveryPosition,p.cost).state;state=applyAction(state,{type:'move',x:p.deliveryPosition.x,z:p.deliveryPosition.z});return {state,project:p};}
function harness(initial:State){
 const functions=[extract('function regionalPhysical(', 'const regionalStreamer='),extract('function clearRegionalProjection(', 'async function sendWorldPacket('),extract('function showRegionalSupply(', '\nfunction renderEconomyPanel(')].join('\n');
 const receiver=extract('worker.onmessage=(e)=>', " if(m.type==='online-motion-ack')")+'};';
 const syncStart=main.indexOf('regionalSupplyView?.sync(state.frontierSupply'),sync=main.slice(syncStart,main.indexOf(';',syncStart)+1);assert(syncStart>=0);
 const prefix=`const {startingTown,TOWN_SPAWN,townLifeFacilities,regionalSupplyPlan,regionalSupplyProjectBoxes,regionalSupplyConstructionBoxes,generateRegionalChunk,RegionalStreamer,createRegionalView,wildernessFeatureRemaining,wildernessSegmentClear,applyAction}=deps;
 let state=initial,zoneEpoch=0,labActive=false,physicsReady=true,transitioning=false,sessionReloading=false,coopPending=false,selectedRegionalOutpost,renderCount=0,closed=0,mounted=null,lastPresentation=null,supplyClears=0;
 const combo={phase:'idle'},guard={},guardBusy=()=>false,contactBusy=()=>false,physicsMotion={grounded:true,crouched:false},coop={active:false,canAct:true},targetPosition={...regionalSupplyPlan(state.seed).outposts[0].deliveryPosition},movableBodies=[],traversalBodies=()=>[],combatObstacles=()=>[];
 const panel={hidden:true,dataset:{type:'settings'}},opened=[],messages=[],sent=[],warnings=[],labels=[],regionalPending=new Map(),regionalConfirmedObstacles=new Map(),regionalConfirmedProjects=new Map(),regionalConfirmedTrade=new Map(),regionalTradeView={clear(){}},regionalFoodView={clear(){}},regionalView=createRegionalView(),regionalTravel={last:{x:1,z:1,step:1,epoch:0}},worker={};
 const makeLabel=(...values)=>labels.push(values),sendPhysics=m=>messages.push(m),regionalSupplyView={sync(s,options){lastPresentation={state:s,options}},clear(){supplyClears++}},toast=()=>{},closePanel=()=>{closed++;panel.hidden=true;},openPanel=type=>{opened.push(type);if(!panel.hidden&&panel.dataset.type===type){closePanel();return;}panel.hidden=false;panel.dataset.type=type;renderRegionalSupplyPanel();},mountRegionalSupplyPanel=(p,s,o)=>{mounted=o;renderCount++;},sendWorldAction=(action,sound)=>{sent.push({action,sound});state=applyAction(state,action);},console={warn:(...args)=>warnings.push(args)};
 const regionalStreamer=new RegionalStreamer(state.seed,{request(){throw Error('Unexpected generator')},dispose(){},backend:'extracted-main-test'},()=>{},()=>{},()=>''),confirmCell=()=>{throw Error('Unexpected legacy receipt')};
 `;
 const suffix=`return {show:showRegionalSupply,canRun:canRegionalSupplyAction,render:renderRegionalSupplyPanel,get mounted(){return mounted},panel,opened,sent,messages,labels,regionalPending,regionalConfirmedProjects,regionalConfirmedObstacles,regionalView,regionalStreamer,get renderCount(){return renderCount},get closed(){return closed},get state(){return state},get selected(){return selectedRegionalOutpost},get supplyClears(){return supplyClears},regionalTravel,
 stage(chunk,revision,initial=false){const entry={key:'region:'+chunk.key,cx:chunk.cx,cz:chunk.cz,revision,chunk,signature:'fixture',confirmed:false};regionalStreamer.entries.set(entry.key,entry);stageRegionalCell(entry,initial);return entry;},ack(key,revision,loaded=true,epoch=zoneEpoch){worker.onmessage({data:{type:'cell-ack',key,revision,loaded,epoch}});},unload(key,revision){regionalStreamer.entries.get(key).unloadingRevision=revision;},setState(next){state=next;},setPose(pose){Object.assign(targetPosition,pose);state={...state,player:{...state.player,x:targetPosition.x,z:targetPosition.z}};},setMotion(values){Object.assign(physicsMotion,values);},setFlags(values){if('labActive'in values)labActive=values.labActive;if('physicsReady'in values)physicsReady=values.physicsReady;},setPanel(type,hidden=false){panel.dataset.type=type;panel.hidden=hidden;},sync(){const blocked=false,dt=.25,reducedMotion=false;${sync}return lastPresentation;},clear(){clearRegionalProjection();},nextEpoch(){zoneEpoch++;clearRegionalProjection();}};`;
 return new Function('deps','initial',stripTypeScriptTypes('function createHarness(){const startup={playing:true,initialized:true,failed:false};'+prefix+functions+receiver+suffix+'}',{mode:'transform'})+';return createHarness();')({startingTown,TOWN_SPAWN,townLifeFacilities,regionalSupplyPlan,regionalSupplyProjectBoxes,regionalSupplyConstructionBoxes,generateRegionalChunk,RegionalStreamer,createRegionalView,wildernessFeatureRemaining,wildernessSegmentClear,applyAction},initial);
}
test('executed main supply navigation rerenders selected outposts in place without toggling the panel closed',()=>{
 const {state,project}=fixture(),api=harness(state),second=regionalSupplyPlan(state.seed).outposts[1]!;
 api.show(project.id);assert.equal(api.panel.hidden,false);assert.equal(api.panel.dataset.type,'regional-supply');assert.equal(api.selected,project.id);assert.equal(api.renderCount,1);assert.deepEqual(api.opened,['regional-supply']);
 api.show(second.id);api.show(second.id);assert.equal(api.panel.hidden,false);assert.equal(api.selected,second.id);assert.equal(api.renderCount,3);assert.equal(api.closed,0);assert.deepEqual(api.opened,['regional-supply'],'repeated selection bypasses the toggle-oriented openPanel path');
 api.setPanel('map');api.show(project.id);assert.equal(api.selected,project.id);assert.equal(api.renderCount,4);assert.deepEqual(api.opened,['regional-supply','regional-supply']);
 api.setState(createRegionalState(73129));api.show(second.id);assert.equal(api.selected,project.id);assert.equal(api.renderCount,4);api.clear();
});
test('executed main stages actual supply collision and gates started presentation on exact acknowledgments, unload and reset',()=>{
 const {state,project}=fixture(),api=harness(state),[cx,cz]=project.ownerChunk.split(':').map(Number),chunk=generateRegionalChunk(state.seed,cx!,cz!),key='region:'+chunk.key;
 api.stage(chunk,1,true);assert.equal(api.messages.length,0);assert.equal(api.regionalView.count,0);assert.equal(api.regionalConfirmedProjects.has(project.id),false);assert.equal(api.sync().options.isConfirmed(project.id,false),false);
 api.ack(key,1);assert.equal(api.regionalView.count,1);assert.equal(api.regionalConfirmedProjects.get(project.id),false);assert(api.sync().options.isConfirmed(project.id,false));assert.equal(api.sync().options.isConfirmed(project.id,true),false);
 let current=api.state;for(const type of ['deliver','build'] as const)current=applyAction(current,{type:'regional-supply',command:{type,outpostId:project.id,expectedRevision:current.frontierSupply!.revision}});api.setState(current);
 api.stage(chunk,2);const packet=api.messages.at(-1);assert.equal(packet.type,'cell-load');assert.equal(packet.revision,2);assert(packet.obstacles.some((o:any)=>o.featureId===project.id+'/supply/storage'));assert.equal(api.sync().options.isConfirmed(project.id,true),false,'new structure stays hidden until matching worker collision acknowledgment');
 api.ack(key,1);api.ack(key,2,true,-1);assert.equal(api.sync().options.isConfirmed(project.id,true),false,'old revision and old zone epoch cannot expose unaccepted structure');assert.equal(api.regionalPending.size,1);
 api.ack(key,2);assert.equal(api.regionalPending.size,0);assert.equal(api.regionalView.count,1);assert(api.sync().options.isConfirmed(project.id,true));assert(api.regionalConfirmedObstacles.get(key).some((o:any)=>o.featureId===project.id+'/supply/storage'));
 api.unload(key,3);api.ack(key,3,false);assert.equal(api.regionalView.count,0);assert.equal(api.regionalConfirmedProjects.has(project.id),false);assert.equal(api.regionalConfirmedObstacles.size,0);assert.equal(api.sync().options.isConfirmed(project.id,true),false);
 api.stage(chunk,4);api.ack(key,4);assert(api.sync().options.isConfirmed(project.id,true));api.stage(chunk,5);assert.equal(api.regionalPending.size,1);api.nextEpoch();assert.equal(api.regionalView.count,0);assert.equal(api.regionalPending.size,0);assert.equal(api.regionalConfirmedProjects.size,0);assert.equal(api.regionalConfirmedObstacles.size,0);assert.equal(api.supplyClears,1);assert.equal(api.regionalTravel.last,null);
 api.ack(key,5,true,0);assert.equal(api.regionalView.count,0);assert.equal(api.sync().options.isConfirmed(project.id,true),false);api.clear();
});
test('executed main panel uses accepted physical pose and collision readiness before dispatching real delivery/build commands',()=>{
 const {state,project}=fixture(),api=harness(state),[cx,cz]=project.ownerChunk.split(':').map(Number),chunk=generateRegionalChunk(state.seed,cx!,cz!),key='region:'+chunk.key;
 api.show(project.id);let deliver={type:'deliver',outpostId:project.id,expectedRevision:state.frontierSupply!.revision};assert.equal(api.mounted.canRun(deliver),false);api.stage(chunk,1);api.ack(key,1);assert(api.mounted.canRun(deliver));
 api.setMotion({grounded:false});assert.equal(api.canRun(deliver),false);api.setMotion({grounded:true,crouched:true});assert.equal(api.canRun(deliver),false);api.setMotion({crouched:false});api.setFlags({labActive:true});assert.equal(api.canRun(deliver),false);api.setFlags({labActive:false});
 api.mounted.command(deliver);assert.equal(api.sent.length,1);assert.equal(api.state.frontierSupply.outposts[0].delivered.wood,project.cost.wood);assert.equal(api.canRun(deliver),false);
 const build={type:'build',outpostId:project.id,expectedRevision:api.state.frontierSupply.revision};assert(api.canRun(build));api.setPose(project.storagePosition);assert.equal(api.canRun(build),false,'body occupies the future physical scaffold');api.setPose(project.deliveryPosition);api.mounted.command(build);assert.equal(api.sent.length,2);assert.equal(api.state.frontierSupply.outposts[0].buildStartedAt,0);api.clear();
});
