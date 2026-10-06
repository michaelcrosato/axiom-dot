import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {mainFunction} from './helpers/main-source.ts';
import {WorkshopConstructionProjection} from '../src/workshop-construction-view.ts';
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
test('actual main workshop synchronization preserves readiness, zone and lab gates',()=>{
 const projection=new WorkshopConstructionProjection(),packets:unknown[]=[];
 const source=`let physicsReady=false,transitioning=false,labActive=false,state={zone:'valley',regional:true};const workshopProjection=projection,performance={now:()=>1000},sendPhysics=p=>packets.push(p);${mainFunction(main,'syncWorkshopConstructionPhysics')}return {run:syncWorkshopConstructionPhysics,set:v=>{physicsReady=v.ready;transitioning=v.transition;labActive=v.lab;state.zone=v.zone;}};`;
 const api=new Function('projection','packets',stripTypeScriptTypes('function body(){'+source+'}',{mode:'strip'})+';return body();')(projection,packets);
 for(const flags of [{ready:false,transition:false,lab:false,zone:'valley'},{ready:true,transition:true,lab:false,zone:'valley'},{ready:true,transition:false,lab:true,zone:'valley'},{ready:true,transition:false,lab:false,zone:'cave'}]){api.set(flags);api.run();}assert.equal(packets.length,0);
 api.set({ready:true,transition:false,lab:false,zone:'valley'});api.run();assert.equal(packets.length,1);api.run();assert.equal(packets.length,1);
});
test('main campaign workshop is wired into persistence, acknowledged physics and reachable interaction entry points',()=>{
 for(const text of ["m.key==='campaign-workshop'",'workshopProjection.acknowledge(m.revision,m.loaded)','workshopProjection.reject(m.revision,performance.now())','else workshopProjection.ready()','workshopProjection.stage(state.workshopConstruction,performance.now(),true)','WORKSHOP_CONSTRUCTION_VIEW_ENGINE.obstacles(workshopProjection.confirmed)','state.workshopConstruction!==lastSavedWorkshopConstruction',"object.kind==='workshop-construction'",'workshop-construction-settings','workshop-construction-lab-open',"const reason=workshopConstructionBlockReason()??(!workshopConstructionReady()"] )assert.ok(main.includes(text),text);
 const ready=mainFunction(main,'workshopConstructionReady');assert.match(ready,/townReady\(\)/);assert.match(ready,/regionalConfirmedObstacles/);assert.match(ready,/clearPulsePath/);assert.match(ready,/Math.hypot/);
});
test('actual main acknowledgement prefix ignores stale epochs and rejected or superseded workshop packets',()=>{
 const projection=new WorkshopConstructionProjection(),packet=projection.stage(undefined,0,true)!;
 const start=main.indexOf('worker.onmessage=(e)=>'),end=main.indexOf(" if(m.type==='cell-ack'&&m.key==='restoration-automaton')",start);
 const source=main.slice(start,end)+'};';const worker:{onmessage?:(event:unknown)=>void}={};
 new Function('worker','workshopProjection','startup','zoneEpoch','performance','toast',stripTypeScriptTypes(source,{mode:'strip'}))(worker,projection,{failed:false},7,{now:()=>100},()=>{});
 worker.onmessage!({data:{type:'cell-ack',key:'campaign-workshop',epoch:6,revision:packet.revision,loaded:true}});assert.ok(projection.pending);
 worker.onmessage!({data:{type:'cell-rejected',key:'campaign-workshop',epoch:7,revision:packet.revision}});assert.equal(projection.pending,null);assert.equal(projection.stage(undefined,249),null);const retry=projection.stage(undefined,250)!;
 worker.onmessage!({data:{type:'cell-ack',key:'campaign-workshop',epoch:7,revision:packet.revision,loaded:true}});assert.ok(projection.pending);
 worker.onmessage!({data:{type:'cell-ack',key:'campaign-workshop',epoch:7,revision:retry.revision,loaded:true}});assert.equal(projection.pending,null);
});
test('actual main initial and zone packets stage workshop geometry without confirming it before worker ready',async()=>{
 const packets:any[]=[],projection=new WorkshopConstructionProjection();const start=main.indexOf('async function sendWorldPacket('),source=main.slice(start,main.indexOf("addEventListener('pagehide'",start));
 const deps={zoneEpoch:2,clearRegionalProjection:()=>{},workshopProjection:projection,state:{regional:true,zone:'valley',player:{x:0,z:0}},labActive:false,startup:{failed:false,playing:true,end(){},begin(){},detail(){}},regionalStreamer:{initial:async()=>{},stats:{backend:'test'}},regionalPending:new Map(),initialCellPacket:()=>({initialCells:[]}),performance:{now:()=>10},machineWorldObstacles:()=>[],sendPhysics:(p:unknown)=>packets.push(p),zoneObstacles:()=>[],contactWorldPacket:()=>({}),worldBound:()=>100,contactSpawnY:()=>6,panel:{hidden:true},valleyPlan:null};
 const setup='let regionalLoadTarget=null,restorationConfirmedPoint=null,restorationCollisionSignature="",restorationPendingCollision=null,machineRevision=0,startupInitialCellCount=0;';
 const run=new Function(...Object.keys(deps),stripTypeScriptTypes('function body(){'+setup+source+';return sendWorldPacket;}',{mode:'strip'})+';return body();')(...Object.values(deps));
 await run('init');assert.equal(packets[0].initialCells[0].key,'campaign-workshop');assert.ok(projection.pending);assert.equal(projection.confirmed,undefined);const first=projection.pending!.revision;projection.ready();assert.equal(projection.pending,null);
 await run('zone');assert.equal(packets[1].initialCells[0].key,'campaign-workshop');assert.ok(projection.pending!.revision>first);assert.equal(projection.confirmed,undefined);
});
