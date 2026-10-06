import test from 'node:test';
import assert from 'node:assert/strict';
import {readyWorkshop,buildCommand} from './helpers/workshop-construction.ts';
import {action} from '../server/coop-validation.ts';

test('workshop construction command boundary admits bounded host requests and rejects payload authority',()=>{
 const value={type:'workshop-construction',command:buildCommand(readyWorkshop())};
 assert(action(value),'the campaign must admit construction intents');
 assert.equal(action({...value,command:{...value.command,materials:999}}),null);
 assert.equal(action({...value,command:{...value.command,expectedRevision:-1}}),null);
});

import {createRoom,joinRoom,syncRoom,roomObstacles,advanceRoom,type CoopRoom,type RoomPlayer} from '../server/coop-authority.ts';
import {createVertical} from '../server/coop-vertical.ts';
import {WORKSHOP_BOARD,workshopConstructionBoxes} from '../src/workshop-construction.ts';
import {validateSave} from '../src/world.ts';
function send(room:CoopRoom,p:RoomPlayer,command=buildCommand(room.world),now=1000){return syncRoom(room,p.userId,{seq:p.seq+1,sessionId:p.sessionId,actions:[{type:'workshop-construction',command}]},now);}
function pose(p:RoomPlayer,x:number,z:number,y=6){p.player={...p.player,x,z};p.motion=createVertical(y);p.pose={...p.pose,x,z,y,grounded:true,crouched:false};}

test('shared workshop host authority, stale revisions and duplicate packets preserve the single debit',()=>{
 const room=createRoom('host','Host',readyWorkshop(),1000),host=room.players[0]!,guest=joinRoom(room,'guest','Guest',1000),command=buildCommand(room.world),before=room.world.townLife!.resources.materials;
 assert(send(room,guest,command).some(n=>n.includes('host')));assert.equal(room.world.workshopConstruction,undefined);
 const input={seq:host.seq+1,sessionId:host.sessionId,actions:[{type:'workshop-construction' as const,command}]};assert.deepEqual(syncRoom(room,'host',input,1000),[]);assert(room.world.workshopConstruction);
 const paid=room.world.townLife!.resources.materials;assert(paid<before);syncRoom(room,'host',input,1000);assert.equal(room.world.townLife!.resources.materials,paid);send(room,host,command);assert.equal(room.world.townLife!.resources.materials,paid);assert(validateSave(room.world));
 const solids=workshopConstructionBoxes(room.world.workshopConstruction).filter(b=>b.solid);for(const b of solids)assert(roomObstacles(room.world).some(o=>o.x===b.center.x&&o.z===b.center.z&&o.y===b.center.y&&o.hx===b.half.x));
});

test('workshop reservation protects disconnected actors, airborne operators and remote requests',()=>{
 for(const scenario of ['absent-peer','airborne','remote'] as const){const room=createRoom('host','Host',readyWorkshop(),1000),host=room.players[0]!,guest=joinRoom(room,'guest','Guest',1000),command=buildCommand(room.world);
 if(scenario==='absent-peer'){assert.equal(command.kind,'build');if(command.kind!=='build')throw Error();const wall=workshopConstructionBoxes({parameters:command.parameters}).find(b=>b.solid&&b.half.y>1)!;pose(guest,wall.center.x,wall.center.z);guest.active=false;}
 if(scenario==='airborne'){host.motion!.grounded=false;host.motion!.feetY=8;}
 if(scenario==='remote')pose(host,0,0);
 assert(send(room,host,command).length);assert.equal(room.world.workshopConstruction,undefined,scenario);
 }
});

test('absent host cannot advance commissioned labor and duplicate polling cannot multiply work',()=>{
 const room=createRoom('host','Host',readyWorkshop(),1000),host=room.players[0]!;send(room,host);assert(room.world.workshopConstruction);const before=room.world.workshopConstruction.work;advanceRoom(room,10000);assert.equal(room.world.workshopConstruction.work,before);advanceRoom(room,10000);assert.equal(room.world.workshopConstruction.work,before);
});

import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleCoop} from '../server/coop-api.ts';
import type {D1Database,D1Statement} from '../server/coop-store.ts';
function httpFixture(){
 const sqlite=new DatabaseSync(':memory:');
 for(const name of readdirSync(new URL('../drizzle',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL(`../drizzle/${name}`,import.meta.url),'utf8'));
 let now=1_800_000_000_000,conflicts=0,pause:undefined|{arrived:()=>void;gate:Promise<void>};
 const DB:D1Database={prepare(sql){let values:unknown[]=[];const statement:D1Statement={bind(...args){values=args;return statement;},async first<T>(){return (sqlite.prepare(sql).get(...values as never[])??null) as T|null;},async all<T>(){return {results:sqlite.prepare(sql).all(...values as never[]) as T[]};},async run(){if(sql.startsWith('UPDATE axiom_coop_rooms')&&pause){const p=pause;pause=undefined;p.arrived();await p.gate;}const result=sqlite.prepare(sql).run(...values as never[]),changes=Number(result.changes);if(sql.startsWith('UPDATE axiom_coop_rooms')&&!changes)conflicts++;return {success:true,meta:{changes}};}};return statement;}};
 const raw=async(user:string,path:string,body?:unknown,headers:Record<string,string>={})=>{const response=await handleCoop(new Request(`https://axiom-tests.invalid/api/coop${path}`,{method:body===undefined?'GET':'POST',headers:{'oai-authenticated-user-id':user,Origin:'https://axiom-tests.invalid',...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),{DB},now);assert(response);return {status:response.status,body:await response.json()};};
 const stored=(id:string):CoopRoom=>JSON.parse(String(sqlite.prepare('SELECT body FROM axiom_coop_rooms WHERE id = ?').get(id)!.body));
 const replace=(room:CoopRoom)=>sqlite.prepare('UPDATE axiom_coop_rooms SET body = ? WHERE id = ?').run(JSON.stringify(room),room.id);
 const hold=()=>{assert.equal(pause,undefined);let release=()=>{},arrived=()=>{};const gate=new Promise<void>(r=>{release=r;}),waiting=new Promise<void>(r=>{arrived=r;});pause={arrived,gate};return {release,waiting};};
 return {raw,stored,replace,hold,conflicts:()=>conflicts,time:()=>now,advance:(ms:number)=>{now+=ms;},stop:()=>sqlite.close()};
}

test('HTTP SQLite CAS retries and response-loss retries commit construction exactly once and reject forged imports',async()=>{
 const f=httpFixture();try{
 const created=await f.raw('host','/rooms',{name:'Host',world:readyWorkshop()});assert.equal(created.status,201,JSON.stringify(created.body));const snap=created.body;
 const command=buildCommand(snap.world),input={seq:snap.ack+1,sessionId:snap.sessionId,actions:[{type:'workshop-construction',command}]},before=snap.world.townLife.resources.materials;
 const blocked=f.hold(),first=f.raw('host',`/rooms/${snap.roomId}/sync`,input);await blocked.waiting;
 const second=await f.raw('host',`/rooms/${snap.roomId}/sync`,input);assert.equal(second.status,200);blocked.release();const retried=await first;assert.equal(retried.status,200);assert(f.conflicts()>0);
 const paid=f.stored(snap.roomId);assert(paid.world.workshopConstruction);assert.equal(before-paid.world.townLife!.resources.materials,paid.world.workshopConstruction.materialsPaid);assert(validateSave(paid.world));
 const duplicate=await f.raw('host',`/rooms/${snap.roomId}/sync`,input);assert.equal(duplicate.status,200);assert.equal(duplicate.body.world.townLife.resources.materials,paid.world.townLife!.resources.materials);
 const forged=structuredClone(paid.world);forged.workshopConstruction!.materialsPaid=0;const invalid=await f.raw('other','/rooms',{name:'Other',world:forged});assert.equal(invalid.status,400);
 }finally{f.stop();}
});
