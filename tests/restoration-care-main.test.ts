import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {mainFunction} from './helpers/main-source.ts';
import {RESTORATION_CARE_ENGINE} from '../src/restoration-care.ts';
import {worldRestorationPlan} from '../src/world.ts';
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
test('actual main habitat care controls require achieved ground pose, nearby confirmed terrain, clear path and shared host',()=>{
 const plan=worldRestorationPlan(73129),command={kind:'deliver' as const,targetId:'apothecary',expectedRevision:0},point=RESTORATION_CARE_ENGINE.position(plan,command)!;
 const state={seed:73129,regional:true,restoration:{},townLife:{},player:{x:point.x,z:point.z}},targetPosition={...point},coop={active:false,snapshot:{selfId:'host',hostId:'host'}},confirmed=new Map([[`region:${Math.floor(point.x/64)}:${Math.floor(point.z/64)}`,[]]]);let ready=true,clear=true,obstacles:any[]=[];
 const deps={state,targetPosition,coop,RESTORATION_CARE_ENGINE,worldRestorationPlan,townReady:()=>ready,regionalConfirmedObstacles:confirmed,combatObstacles:()=>[{featureId:'restoration-automaton'},{featureId:'real-wall'}],clearPulsePath:(_a:unknown,_b:unknown,values:unknown[])=>{obstacles=values;return clear;}};
 const run=new Function(...Object.keys(deps),stripTypeScriptTypes(mainFunction(main,'restorationCareReady'))+';return restorationCareReady;')(...Object.values(deps));
 assert.equal(run(command),true);assert.deepEqual(obstacles,[{featureId:'real-wall'}]);ready=false;assert.equal(run(command),false);ready=true;targetPosition.y+=.5;assert.equal(run(command),false);targetPosition.y=point.y;state.player.x+=4;assert.equal(run(command),false);state.player.x=point.x;clear=false;assert.equal(run(command),false);clear=true;confirmed.clear();assert.equal(run(command),false);confirmed.set(`region:${Math.floor(point.x/64)}:${Math.floor(point.z/64)}`,[]);
 coop.active=true;coop.snapshot.selfId='guest';assert.equal(run(command),false);coop.snapshot.selfId='host';assert.equal(run(command),true);assert.equal(run({...command,targetId:'missing'}),false);
 const collect={kind:'collect' as const,targetId:plan.sites[0]!.id,expectedRevision:0},dock=RESTORATION_CARE_ENGINE.position(plan,collect)!;state.player.x=dock.x;state.player.z=dock.z;Object.assign(targetPosition,dock);confirmed.set(`region:${Math.floor(dock.x/64)}:${Math.floor(dock.z/64)}`,[]);assert.equal(run(collect),true);
});
test('main care transfer dispatch rejects blocked input before reducers and routes accepted requests through authority',()=>{
 const action={type:'restoration-care',command:{kind:'deliver',targetId:'apothecary',expectedRevision:0}},state={zone:'valley',events:['Transferred care']},coop={active:false,send:()=>{sent++;return true;}};let ready=false,sent=0,applied=0,committed=0;
 const deps={state,coop,sessionReloading:false,labActive:false,restorationCareReady:()=>ready,restorationCareBlockReason:()=>ready?null:'Stand on clear ground.',toast:()=>{},applyAction:()=>{applied++;return state;},commit:()=>{committed++;}};
 const dispatch=new Function(...Object.keys(deps),stripTypeScriptTypes(mainFunction(main,'sendWorldAction'))+';return sendWorldAction;')(...Object.values(deps));
 dispatch(action);assert.equal(applied,0);assert.equal(committed,0);assert.equal(sent,0);ready=true;dispatch(action);assert.equal(applied,1);assert.equal(committed,1);coop.active=true;dispatch(action);assert.equal(sent,1);assert.equal(applied,1);
});
test('care entry points, progress refresh, disposal and save dirtiness are wired into production main',()=>{
 for(const value of ["type==='restoration-care'","type==='restoration-care-lab'","object.id==='apothecary'&&state.restoration",'restoration-care-settings','restoration-care-lab-open','restorationCarePanelRefresh=mounted.refresh','restorationCarePanelRefresh=null;mounted.dispose()','restorationCarePanelRefresh?.()','state.restorationCare!==lastSavedRestorationCare','lastSavedRestorationCare=state.restorationCare'])assert.ok(main.includes(value),value);
 for(const file of ['restoration-ui.ts','town-ui.ts'])assert.match(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),/options\.care/);
 assert.match(readFileSync(new URL('../src/town-ui.ts',import.meta.url),'utf8'),/habitatCare\?\.stock/);
});
