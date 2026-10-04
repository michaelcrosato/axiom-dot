import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
function harness(){
 const at=main.indexOf('function regionalFoodTerrainConfirmed(');assert(at>=0);
 const functions=main.slice(at),projectionAt=main.indexOf('regionalFoodView?.sync(state.frontierFood'),projection=main.slice(projectionAt,main.indexOf(';',projectionAt)+1);assert(projectionAt>=0);
 const prefix=`let state={seed:73129,zone:'valley',player:{x:12,z:12,hp:100},frontierFood:{revision:0}},selectedRegionalFoodFarm,physicsReady=true,transitioning=false,labActive=false,sessionReloading=false,coopPending=false,visible=false,lineClear=true,lastSync=null,mounted=null,renderCount=0,closed=0;
 const point={x:12,y:4,z:12},targetPosition={...point},physicsMotion={grounded:true,crouched:false},coop={active:false,canAct:true},combo={phase:'idle'},guard={},panel={hidden:true,dataset:{type:'settings'}},sent=[],opened=[],regionalConfirmedObstacles=new Map(),regionalConfirmedTrade=new Map();
 const regionalView={has(){return visible}},regionalFoodView={sync(s,c,dt){lastSync={s,c,dt}}},regionalTradeTargetSignature=()=>'',guardBusy=()=>false,contactBusy=()=>false,wildernessSegmentClear=()=>lineClear,combatObstacles=()=>[],regionalFoodCommandPosition=()=>point,regionalFoodPlan=()=>({farms:[{id:'farm-0'}]}),toast=()=>{},closePanel=()=>{closed++;panel.hidden=true;},openPanel=type=>{opened.push(type);panel.hidden=false;panel.dataset.type=type;renderRegionalFoodPanel()},mountRegionalFoodPanel=(p,s,o)=>{mounted=o;renderCount++},applyAction=(s,a)=>a.command.expectedRevision===s.frontierFood.revision?{...s,frontierFood:{revision:s.frontierFood.revision+1}}:s,sendWorldAction=a=>{sent.push(a);state=applyAction(state,a)};`;
 const suffix=`return {show:showRegionalFood,canRun:canRegionalFoodAction,get mounted(){return mounted},get state(){return state},get renderCount(){return renderCount},get closed(){return closed},panel,sent,opened,point,targetPosition,physicsMotion,coop,regionalConfirmedObstacles,setVisible(v){visible=v},setLineClear(v){lineClear=v},setFlags(v){if('physicsReady'in v)physicsReady=v.physicsReady;if('transitioning'in v)transitioning=v.transitioning;if('labActive'in v)labActive=v.labActive;if('sessionReloading'in v)sessionReloading=v.sessionReloading;if('coopPending'in v)coopPending=v.coopPending;},sync(blocked=false,hidden=false,focused=true){const dt=.25,reducedMotion=false,document={hidden},windowActive=focused;${projection}return lastSync;}};`;
 return new Function(stripTypeScriptTypes('function harness(){'+prefix+functions+suffix+'}',{mode:'transform'})+';return harness();')();
}
const command={type:'start',farmId:'farm-0',expectedRevision:0};
function loaded(h:any){h.regionalConfirmedObstacles.set('region:0:0',[]);h.setVisible(true);}
test('executed food main makes journal/map inspection read-only and switches farm without closing panel',()=>{
 const h=harness(),before=JSON.stringify(h.state);h.show('farm-0');h.show('farm-1');assert.equal(h.renderCount,2);assert.equal(h.closed,0);assert.deepEqual(h.opened,['regional-food']);assert.equal(h.mounted.farmId,'farm-1');assert.equal(h.mounted.readState(),h.state.frontierFood);assert.equal(JSON.stringify(h.state),before);assert.deepEqual(h.sent,[]);
});
test('executed food main requires acknowledged visible ground, reach, upright grounded live control and clear line before command',()=>{
 const h=harness();h.show('farm-0');assert.equal(h.canRun(command),false);h.regionalConfirmedObstacles.set('region:0:0',[]);assert.equal(h.canRun(command),false,'collider alone does not render farm or authorize interaction');h.setVisible(true);assert.equal(h.canRun(command),true);
 for(const key of ['transitioning','labActive','sessionReloading','coopPending']){h.setFlags({[key]:true});assert.equal(h.canRun(command),false,key);h.setFlags({[key]:false});}
 h.setFlags({physicsReady:false});assert.equal(h.canRun(command),false);h.setFlags({physicsReady:true});h.physicsMotion.grounded=false;assert.equal(h.canRun(command),false);h.physicsMotion.grounded=true;h.physicsMotion.crouched=true;assert.equal(h.canRun(command),false);h.physicsMotion.crouched=false;h.targetPosition.y+=1;assert.equal(h.canRun(command),false);h.targetPosition.y-=1;h.state.player.x+=4;assert.equal(h.canRun(command),false);h.state.player.x-=4;h.setLineClear(false);assert.equal(h.canRun(command),false);h.setLineClear(true);h.state.player.hp=0;assert.equal(h.canRun(command),false);h.state.player.hp=100;assert.equal(h.canRun(command),true);
 h.mounted.command(command);assert.equal(h.sent.length,1);assert.equal(h.state.frontierFood.revision,1);h.mounted.command(command);assert.equal(h.sent.length,1,'stale intent cannot reapply after accepted revision');
});
test('executed food presentation pauses in solo menu and background but follows accepted online room while menu is open',()=>{
 const h=harness();loaded(h);assert.equal(h.sync(true).dt,0);h.coop.active=true;assert.equal(h.sync(true).dt,.25);assert.equal(h.sync(true,true).dt,0);assert.equal(h.sync(true,false,false).dt,0);h.setFlags({physicsReady:false});assert.equal(h.sync(true).dt,0);h.setFlags({physicsReady:true});h.coop.canAct=false;assert.equal(h.sync(true).dt,0);
});
test('food main uses existing E/X interaction and protected recovery, clears/disposes projection with world lifecycle',()=>{
 assert(main.includes("kind:'regional-food'"));assert(main.includes("if(object.kind==='regional-food'){showRegionalFood(object.id);return;}"));assert(main.includes("if(type==='regional-food'){renderRegionalFoodPanel();return;}"));assert(main.includes('regionalFoodView?.clear()'));assert(main.includes('regionalFoodView?.dispose()'));assert(main.includes('preRegionalFoodSave(localStorage,state)'));assert(main.includes('enableRegionalFood(enableRegionalTrade(enableRegionalSupply('));assert(main.includes('getOverlay:(current:State)=>{const freight=regionalTradeMapOverlay'));
});
