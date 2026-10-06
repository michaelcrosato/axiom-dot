import test from 'node:test';
import assert from 'node:assert/strict';
import {mountWorkshopConstruction,type WorkshopConstructionViewState} from '../src/workshop-construction-ui.ts';
import {createTownLife} from '../src/town-life.ts';
import {WORKSHOP_BOARD,applyWorkshopConstruction,advanceWorkshopConstruction} from '../src/workshop-construction.ts';
import {DEFAULT_WORKSHOP_DRAFT} from '../src/workshop-authoring.ts';
class Element {value='';textContent='';disabled=false;dataset:Record<string,string>={};files:any[]=[];nodes=new Map<string,Element>();onclick?:()=>void;oninput?:()=>void;onchange?:()=>Promise<void>;set innerHTML(html:string){this.nodes.clear();for(const m of html.matchAll(/\bid="([^"]+)"/g))this.nodes.set('#'+m[1],new Element());}querySelector(s:string){return this.nodes.get(s)??null;}getContext(){return null;}}
function base():WorkshopConstructionViewState{return {seed:42,zone:'valley',player:{...WORKSHOP_BOARD,hp:50},townLife:createTownLife(42)};}
function complete(){const state=base(),result=applyWorkshopConstruction(undefined,state.townLife!,state,{kind:'build',expectedRevision:0,parcelId:'hearthmere-west',parameters:{...DEFAULT_WORKSHOP_DRAFT,seed:42},workerId:state.townLife!.residents[0]!.id})!;assert.ok(result);let built=result.construction;while(built.status!=='complete')built=advanceWorkshopConstruction(built,Math.min(120,built.workRequired-built.work));return {...state,townLife:result.life,workshopConstruction:built};}
test('workshop exposes exact current host or movement blocker and recovers readiness without sending commands',()=>{
 const panel=new Element(),state=base();let blocked:string|null='Only the expedition host can spend shared materials.',sends=0;const ui=mountWorkshopConstruction(panel as any,{getState:()=>state,blockedReason:()=>blocked,send:()=>{sends++;},onClose(){}} as any),q=(id:string)=>panel.querySelector('#wc-'+id)!;
 assert.equal(q('build').disabled,true);assert.match(q('build-reason').textContent,/Only the expedition host/);q('build').onclick!();assert.equal(sends,0);assert.match(q('status').textContent,/Only the expedition host/);blocked='Stand upright and lower your staff.';ui.refresh();assert.match(q('repair-reason').textContent,/Stand upright/);blocked=null;ui.refresh();assert.equal(q('build').disabled,false);ui.dispose();
});
test('synchronous rejected build reports false or the exact rejection reason without claiming dispatch or changing the plan',()=>{
 const panel=new Element(),state=base(),before=JSON.stringify(state);let result:false|string=false,sends=0;const ui=mountWorkshopConstruction(panel as any,{getState:()=>state,send:()=>{sends++;return result;},onClose(){}} as any),q=(id:string)=>panel.querySelector('#wc-'+id)!;
 q('width').value='8.4';q('width').oninput!();q('build').onclick!();assert.match(q('status').textContent,/not sent|rejected/i);assert.doesNotMatch(q('status').textContent,/request sent/i);assert.equal(q('width').value,'8.4');assert.equal(ui.getApplied().width,9);result='The shared world is reconnecting; retry after it is ready.';q('build').onclick!();assert.equal(q('status').textContent,result);assert.equal(sends,2);assert.equal(JSON.stringify(state),before);ui.dispose();
});
test('paid repair rejection preserves earned workshop and exposes the dispatcher reason',()=>{
 const panel=new Element(),state=complete(),before=JSON.stringify(state),commands:any[]=[];const ui=mountWorkshopConstruction(panel as any,{getState:()=>state,send:(c:any)=>{commands.push(c);return 'Repair was rejected because the room authority changed.';},onClose(){}} as any),q=(id:string)=>panel.querySelector('#wc-'+id)!;
 assert.equal(q('repair').disabled,false);q('repair').onclick!();assert.match(q('status').textContent,/Repair was rejected/);assert.doesNotMatch(q('status').textContent,/request sent/i);assert.equal(commands[0].expectedRevision,state.workshopConstruction.revision);assert.equal(JSON.stringify(state),before);ui.dispose();
});
test('a rejection between polls refreshes finite stock and disabled actions without discarding unapplied recipe fields',()=>{
 const panel=new Element();let state=base(),sends=0;const ui=mountWorkshopConstruction(panel as any,{getState:()=>state,send:()=>{sends++;},onClose(){}}),q=(id:string)=>panel.querySelector('#wc-'+id)!;q('width').value='8.4';q('width').oninput!();state={...state,townLife:{...state.townLife!,resources:{...state.townLife!.resources,materials:0}}};q('build').onclick!();assert.equal(sends,0);assert.match(q('cost').textContent,/Available: 0/);assert.equal(q('build').disabled,true);assert.match(q('status').textContent,/materials/i);assert.equal(q('width').value,'8.4');assert.equal(ui.getApplied().width,9);ui.dispose();
});
test('dismiss and reopen retires old controls and reads fresh stock and readiness',()=>{
 const panel=new Element();let state=base(),blocked:string|null='Wait for terrain confirmation.',closed=0,sends=0;const options={getState:()=>state,blockedReason:()=>blocked,send:()=>{sends++;},onClose:()=>closed++};const old=mountWorkshopConstruction(panel as any,options as any),oldBuild=panel.querySelector('#wc-build')!,oldClose=panel.querySelector('#wc-close')!;oldClose.onclick!();assert.equal(closed,1);blocked=null;state={...state,player:{...state.player,hp:80}};const next=mountWorkshopConstruction(panel as any,options as any);oldBuild.onclick!();assert.equal(sends,0);assert.equal(panel.querySelector('#wc-build')!.disabled,false);panel.querySelector('#wc-build')!.onclick!();assert.equal(sends,1);old.dispose();next.dispose();
});

test('a null explanatory blocker never bypasses the existing readiness safety gate',()=>{
 const panel=new Element(),state=base();let sends=0;const ui=mountWorkshopConstruction(panel as any,{getState:()=>state,blockedReason:()=>null,ready:()=>false,send:()=>{sends++;},onClose(){}}),q=(id:string)=>panel.querySelector('#wc-'+id)!;assert.equal(q('build').disabled,true);q('build').onclick!();assert.equal(sends,0);assert.match(q('status').textContent,/Reach the west board/);ui.dispose();
});
