import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {mainFunction} from './helpers/main-source.ts';
import {TOWN_SUPPLY_ENGINE} from '../src/town-supply.ts';
import {createRegionalState,enableStartingTown,worldTownSupplySources} from '../src/world.ts';
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
test('actual main town supply gates load and delivery on actual ground, range, terrain acknowledgement, host and clear path',()=>{
 const state=enableStartingTown(createRegionalState(73129)),sources=worldTownSupplySources(state),source=sources[0]!,command={kind:'load' as const,targetId:source.id,expectedRevision:0},point=TOWN_SUPPLY_ENGINE.position(state.seed,sources,command)!;
 Object.assign(state.player,{x:point.x,z:point.z});const targetPosition={...point},coop={active:false,snapshot:{selfId:'host',hostId:'host'}},confirmed=new Map([[`region:${Math.floor(point.x/64)}:${Math.floor(point.z/64)}`,[]]]);let ready=true,clear=true;
 const deps={state,targetPosition,coop,TOWN_SUPPLY_ENGINE,worldTownSupplySources,townReady:()=>ready,regionalConfirmedObstacles:confirmed,combatObstacles:()=>[],clearPulsePath:()=>clear};
 const run=new Function(...Object.keys(deps),stripTypeScriptTypes(mainFunction(main,'townSupplyReady'))+';return townSupplyReady;')(...Object.values(deps));
 assert.equal(run(command),true);ready=false;assert.equal(run(command),false);ready=true;targetPosition.y+=.5;assert.equal(run(command),false);targetPosition.y=point.y;state.player.x+=4;assert.equal(run(command),false);state.player.x=point.x;clear=false;assert.equal(run(command),false);clear=true;confirmed.clear();assert.equal(run(command),false);confirmed.set(`region:${Math.floor(point.x/64)}:${Math.floor(point.z/64)}`,[]);coop.active=true;coop.snapshot.selfId='guest';assert.equal(run(command),false);coop.snapshot.selfId='host';assert.equal(run(command),true);assert.equal(run({...command,targetId:'missing'}),false);
 for(const kind of ['unload','deliver'] as const){const c={kind,targetId:'workshop',expectedRevision:0},workshop=TOWN_SUPPLY_ENGINE.position(state.seed,sources,c)!;Object.assign(state.player,{x:workshop.x,z:workshop.z});Object.assign(targetPosition,workshop);confirmed.set(`region:${Math.floor(workshop.x/64)}:${Math.floor(workshop.z/64)}`,[]);assert.equal(run(c),true);}
});
test('actual town supply dispatch gates before reducers and preserves solo versus online authority',()=>{
 const action={type:'town-supply',command:{kind:'deliver',targetId:'workshop',expectedRevision:0}},state={zone:'valley',events:['Delivered']},coop={active:false,send:()=>{sent++;return true;}};let ready=false,sent=0,applied=0,committed=0;
 const deps={state,coop,sessionReloading:false,labActive:false,townSupplyReady:()=>ready,townSupplyBlockReason:()=>ready?null:'Stand on clear ground.',toast:()=>{},applyAction:()=>{applied++;return state;},commit:()=>{committed++;}};
 const dispatch=new Function(...Object.keys(deps),stripTypeScriptTypes(mainFunction(main,'sendWorldAction'))+';return sendWorldAction;')(...Object.values(deps));dispatch(action);assert.deepEqual([applied,committed,sent],[0,0,0]);ready=true;dispatch(action);assert.deepEqual([applied,committed,sent],[1,1,0]);coop.active=true;dispatch(action);assert.deepEqual([applied,committed,sent],[1,1,1]);
});
test('actual cargo HUD reports the conserved load and real workshop distance and hides empty or isolated lab stock',()=>{
 const state={...createRegionalState(73129),townSupply:{version:1 as const,revision:1,sources:['scrap'],carried:1,unloaded:0,deliveries:0}},label={hidden:true,textContent:''};const deps={state,TOWN_SUPPLY_ENGINE,worldTownSupplySources,document:{getElementById:()=>label}};
 const source='let labActive=false;'+mainFunction(main,'syncTownSupplyCargo')+';return {sync:syncTownSupplyCargo,lab:()=>{labActive=true;}};';const run=new Function(...Object.keys(deps),stripTypeScriptTypes('function body(){'+source+'}')+';return body();')(...Object.values(deps));run.sync();assert.equal(label.hidden,false);assert.match(label.textContent,/Cargo 1\/4 · Second Life Salvage \d+ m/);state.townSupply.carried=0;run.sync();assert.equal(label.hidden,true);state.townSupply.carried=2;run.lab();run.sync();assert.equal(label.hidden,true);
});
test('town supply retains normal town service and scrap interaction while wiring refresh, save dirtiness and developer access',()=>{
 for(const text of ['appendTownSupplyEntry();',"if(object.kind==='town-life-service')",'selectedTownFacility=object.id',"openPanel('town-life');return;",'town-supply-settings','town-supply-lab-open','townSupplyPanelRefresh=mounted.refresh','townSupplyPanelRefresh=null;mounted.dispose()','townSupplyPanelRefresh?.()','state.townSupply!==lastSavedTownSupply','lastSavedTownSupply=state.townSupply'])assert.ok(main.includes(text),text);
 assert.match(mainFunction(main,'appendTownSupplyEntry'),/Town supply · haul salvage/);
});
