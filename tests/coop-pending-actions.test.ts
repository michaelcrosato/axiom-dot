import test from 'node:test';
import assert from 'node:assert/strict';
import {CoopClient} from '../src/coop.ts';

test('co-op exposes whether a campaign action is queued or awaiting its authoritative reply',()=>{
 const client=new CoopClient({onSnapshot(){}});
 assert.equal(typeof client.hasPendingAction,'function');
 assert.equal(client.hasPendingAction('restoration'),false);
});

import type {TestContext} from 'node:test';
import {createRoom,snapshot} from '../server/coop-authority.ts';
import {createRegionalState,worldRestorationPlan} from '../src/world.ts';
import type {CoopAction,CoopSnapshot,CoopSync} from '../src/coop-protocol.ts';
const base=(()=>{const room=createRoom('host','Host',createRegionalState(73129),1000);room.revision=10;return snapshot(room,'host',1000);})();
function command(type:'restoration'|'town-supply'|'restoration-care'='restoration'):CoopAction {
 if(type==='town-supply')return {type,command:{kind:'load',targetId:'scrap-1',expectedRevision:0}};
 if(type==='restoration-care')return {type,command:{kind:'collect',targetId:worldRestorationPlan(base.world.seed).sites[0]!.id,expectedRevision:0}};
 return {type,command:{kind:'service',targetId:worldRestorationPlan(base.world.seed).sites[0]!.id,expectedRevision:0}};
}
async function drain(){for(let i=0;i<16;i++)await Promise.resolve();}
function harness(t:TestContext){
 t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
 const calls:{body:string;input:CoopSync;resolve:(s:CoopSnapshot)=>void;reject:(e:Error)=>void}[]=[],accepted:CoopSnapshot[]=[];
 const fetcher:typeof fetch=async(url,init)=>{
  if(!String(url).endsWith('/sync'))return Response.json(structuredClone(base));
  return await new Promise<Response>((resolve,reject)=>{const body=String(init?.body);calls.push({body,input:JSON.parse(body),resolve:s=>resolve(Response.json(s)),reject});});
 };
 const client=new CoopClient({fetch:fetcher,onSnapshot:s=>accepted.push(s)});t.after(()=>client.disconnect());
 const respond=(i:number,revision=11,ack=calls[i]!.input.seq)=>calls[i]!.resolve({...structuredClone(base),revision,ack});
 const tick=async(ms:number)=>{t.mock.timers.tick(ms);await drain();};
 return {client,calls,accepted,respond,tick};
}

test('pending action follows queued and in-flight work until an acknowledged unchanged model reply',async t=>{
 const h=harness(t);await h.client.create({name:'Host'});const initial=h.client.snapshot!.world.restoration!.revision;
 assert(h.client.send(command()));assert.equal(h.client.hasPendingAction('restoration'),true);assert.equal(h.client.hasPendingAction('town-supply'),false);await h.tick(125);assert.equal(h.calls.length,1);assert.equal(h.client.hasPendingAction('restoration'),true);
 assert(h.client.send(command('town-supply')));h.respond(0);await drain();assert.equal(h.client.snapshot!.world.restoration!.revision,initial,'transport acknowledgment is not a successful model mutation');assert.equal(h.client.hasPendingAction('restoration'),false);assert.equal(h.client.hasPendingAction('town-supply'),true,'later queued action remains pending independently');
 await h.tick(250);assert.equal(h.calls.length,2);assert.equal(h.calls[1]!.input.actions[0]!.type,'town-supply');h.respond(1,12);await drain();assert.equal(h.client.hasPendingAction('town-supply'),false);
});

test('an older room reply cannot clear pending work and the next poll retries the exact action packet',async t=>{
 const h=harness(t);await h.client.create({name:'Host'});assert(h.client.send(command('restoration-care')));await h.tick(125);assert.equal(h.calls.length,1);h.respond(0,9);await drain();assert.equal(h.accepted.length,1);assert.equal(h.client.snapshot!.revision,10);assert.equal(h.client.hasPendingAction('restoration-care'),true);
 await h.tick(250);assert.equal(h.calls.length,2);assert.equal(h.calls[1]!.body,h.calls[0]!.body);h.respond(1,11);await drain();assert.equal(h.client.hasPendingAction('restoration-care'),false);assert.equal(h.client.snapshot!.ack,1);
});

test('lost replies retain pending work through reconnect and retry a detached byte-identical command',async t=>{
 const h=harness(t);await h.client.create({name:'Host'});const action=command();assert(h.client.send(action));if(action.type==='restoration')action.command.expectedRevision=99;await h.tick(125);assert.equal(h.calls.length,1);assert.equal((h.calls[0]!.input.actions[0] as Extract<CoopAction,{type:'restoration'}>).command.expectedRevision,0);
 h.calls[0]!.reject(new Error('Lost response'));await drain();assert.equal(h.client.status,'reconnecting');assert.equal(h.client.hasPendingAction('restoration'),true);await h.tick(500);assert.equal(h.calls.length,2);assert.equal(h.calls[1]!.body,h.calls[0]!.body);h.respond(1);await drain();assert.equal(h.client.hasPendingAction('restoration'),false);assert.equal(h.client.status,'connected');
});

test('suspension drops unsent actions but retains sent work and its exact retry',async t=>{
 const h=harness(t);await h.client.create({name:'Host'});assert(h.client.send(command('town-supply')));assert(h.client.hasPendingAction('town-supply'));h.client.setSuspended(true);assert.equal(h.client.hasPendingAction('town-supply'),false);await h.tick(1000);assert.equal(h.calls.length,0);
 h.client.setSuspended(false);await h.tick(125);assert.equal(h.calls.length,1);assert.deepEqual(h.calls[0]!.input.actions,[]);h.respond(0);await drain();assert(h.client.send(command()));await h.tick(250);assert.equal(h.calls.length,2);h.client.setSuspended(true);h.calls[1]!.reject(new Error('Response unavailable while hidden'));await drain();assert.equal(h.client.hasPendingAction('restoration'),true);await h.tick(1000);assert.equal(h.calls.length,2);h.client.setSuspended(false);await h.tick(125);assert.equal(h.calls.length,3);assert.equal(h.calls[2]!.body,h.calls[1]!.body);h.respond(2,12);await drain();assert.equal(h.client.hasPendingAction('restoration'),false);
});

test('disconnect clears pending state and a late response cannot resurrect a departed session',async t=>{
 const h=harness(t);await h.client.create({name:'Host'});assert(h.client.send(command()));await h.tick(125);assert.equal(h.calls.length,1);assert(h.client.hasPendingAction('restoration'));h.client.disconnect();assert.equal(h.client.hasPendingAction('restoration'),false);assert.equal(h.client.active,false);h.respond(0);await drain();assert.equal(h.client.active,false);assert.equal(h.client.status,'offline');assert.equal(h.accepted.length,1);await h.tick(1000);assert.equal(h.calls.length,1);
});

import {createState,validateSave,applyAction} from '../src/world.ts';
import {townSupplyWorld,loadSupply} from './helpers/town-supply.ts';
import {readyWorkshop,buildCommand} from './helpers/workshop-construction.ts';
import {earnedCareWorld,careCommand} from './helpers/restoration-care.ts';
async function rejectsMalformedOverlay(t:TestContext,key:'workshopConstruction'|'restorationCare'|'townSupply'){
 const h=harness(t);await h.client.create({name:'Host'});const previous=h.client.snapshot!;assert(h.client.send(command()));await h.tick(125);
 const world={...createState(1),[key]:{forged:true}};assert.equal(validateSave(world),false);h.calls[0]!.resolve({...structuredClone(base),revision:11,ack:1,world});await drain();
 assert.equal(h.client.snapshot===previous,true,'invalid optional data must not replace the last confirmed snapshot');assert.equal(h.client.snapshot!.ack,0);assert.equal(h.accepted.length,1);assert.equal(h.client.status,'reconnecting');assert.equal(h.client.hasPendingAction('restoration'),true);
 await h.tick(500);assert.equal(h.calls.length,2);assert.equal(h.calls[1]!.body,h.calls[0]!.body);h.respond(1);await drain();assert.equal(h.client.hasPendingAction('restoration'),false);
}
test('malformed workshop construction without town life cannot replace a confirmed co-op snapshot',async t=>{await rejectsMalformedOverlay(t,'workshopConstruction');});
test('malformed restoration care without town life cannot replace a confirmed co-op snapshot',async t=>{await rejectsMalformedOverlay(t,'restorationCare');});
test('malformed town supply without town life cannot replace a confirmed co-op snapshot',async t=>{await rejectsMalformedOverlay(t,'townSupply');});


test('snapshot certification retains valid old worlds and each new campaign overlay',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
 const workshop=readyWorkshop(),care=earnedCareWorld(),worlds=[createState(1),createRegionalState(73129),loadSupply(townSupplyWorld(),1),applyAction(workshop,{type:'workshop-construction',command:buildCommand(workshop)}),applyAction(care,{type:'restoration-care',command:careCommand(care,'collect')})];
 for(const world of worlds){assert(validateSave(world));let accepted=0;const client=new CoopClient({fetch:async()=>Response.json({...structuredClone(base),world}),onSnapshot(){accepted++;}});try{await client.create({name:'Host'});assert.equal(accepted,1);assert.equal(client.active,true);assert.deepEqual(client.snapshot!.world,world);assert.equal(client.hasPendingAction('restoration'),false);}finally{client.disconnect();}}
});
