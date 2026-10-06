import test from 'node:test';
import assert from 'node:assert/strict';
import {action} from '../server/coop-validation.ts';

test('restoration care accepts bounded transport intents and rejects client supplied cargo authority',()=>{
 const value={type:'restoration-care',command:{kind:'collect',targetId:'habitat-v1-73129-site-0',expectedRevision:0}};
 assert.deepEqual(action(value),value);
 for(const command of [{...value.command,amount:100},{...value.command,expectedRevision:-1},{...value.command,kind:'refund'},{...value.command,stock:20}])assert.equal(action({...value,command}),null);
});

import {createRoom,joinRoom,syncRoom,roomObstacles,type CoopRoom,type RoomPlayer} from '../server/coop-authority.ts';
import {createVertical} from '../server/coop-vertical.ts';
import {restorationCarePosition,type RestorationCareCommand} from '../src/restoration-care.ts';
import {worldRestorationPlan,validateSave,applyAction,type State} from '../src/world.ts';
import {clearPulsePath} from '../src/combat.ts';
import {worldHeight} from '../src/generation.ts';
function careCommand(s:State,kind:'collect'|'deliver'):RestorationCareCommand {return {kind,targetId:kind==='collect'?worldRestorationPlan(s.seed).sites[0]!.id:'apothecary',expectedRevision:s.restorationCare?.revision??0};}
function atCare(s:State,kind:'collect'|'deliver'):State {const point=restorationCarePosition(worldRestorationPlan(s.seed),careCommand(s,kind))!;return {...s,player:{...s.player,x:point.x,z:point.z}};}
function pose(room:CoopRoom,p:RoomPlayer,x:number,z:number){const y=worldHeight(room.world,x,z);p.player={...p.player,x,z};p.motion=createVertical(y);p.pose={...p.pose,x,z,y,grounded:true,crouched:false};}
function send(room:CoopRoom,p:RoomPlayer,command:RestorationCareCommand){return syncRoom(room,p.userId,{seq:p.seq+1,sessionId:p.sessionId,actions:[{type:'restoration-care',command}]},1000);}

import {earnedCareWorld} from './helpers/restoration-care.ts';

test('care cargo is host-authoritative, duplicate-safe, range-checked and usable at both real endpoints',()=>{
 const room=createRoom('host','Host',earnedCareWorld(),1000),host=room.players[0]!,guest=joinRoom(room,'guest','Guest',1000),collect=careCommand(room.world,'collect');
 assert(send(room,guest,collect).some(n=>n.includes('host')));assert.equal(room.world.restorationCare,undefined);
 const input={seq:host.seq+1,sessionId:host.sessionId,actions:[{type:'restoration-care' as const,command:collect}]};assert.deepEqual(syncRoom(room,'host',input,1000),[]);assert.equal(room.world.restorationCare!.carried,5);const paid=room.world.restoration;syncRoom(room,'host',input,1000);assert.equal(room.world.restoration,paid);send(room,host,collect);assert.equal(room.world.restorationCare!.carried,5);
 const target=restorationCarePosition(worldRestorationPlan(room.world.seed),careCommand(room.world,'deliver'))!;pose(room,host,target.x,target.z);assert.deepEqual(send(room,host,careCommand(room.world,'deliver')),[]);assert.equal(room.world.restorationCare!.delivered,5);assert.equal(room.world.townLife!.habitatCare!.stock,5);assert(validateSave(room.world));
});

test('care authority rejects airborne, crouched, dead, remote and wall-occluded transfers',()=>{
 for(const scenario of ['airborne','crouched','dead','remote','occluded'] as const){const carried=applyAction(earnedCareWorld(),{type:'restoration-care',command:careCommand(earnedCareWorld(),'collect')}),world=atCare(carried,'deliver'),room=createRoom('host','Host',world,1000),host=room.players[0]!,command=careCommand(world,'deliver');
 if(scenario==='airborne'){host.motion!.grounded=false;host.motion!.feetY+=1;}
 if(scenario==='crouched')host.motion!.crouched=true;
 if(scenario==='dead')host.player.hp=0;
 if(scenario==='remote')pose(room,host,0,0);
 if(scenario==='occluded'){const target=restorationCarePosition(worldRestorationPlan(world.seed),command)!;pose(room,host,target.x+1.7,target.z-6.0);assert.equal(clearPulsePath({...host.player,y:6},target,roomObstacles({...world,player:host.player})),false);}
 const previous=room.world.restorationCare;assert(send(room,host,command).length,scenario);assert.equal(room.world.restorationCare,previous,scenario);assert.equal(room.world.townLife!.habitatCare,undefined,scenario);
 }
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


test('HTTP care collection and delivery survive real SQLite CAS conflicts and duplicate retries exactly once',async()=>{
 const f=httpFixture();try{
 const created=await f.raw('host','/rooms',{name:'Host',world:earnedCareWorld()});assert.equal(created.status,201,JSON.stringify(created.body));let snap=created.body;
 async function race(kind:'collect'|'deliver'){
  const input={seq:snap.ack+1,sessionId:snap.sessionId,actions:[{type:'restoration-care',command:careCommand(snap.world,kind)}]},held=f.hold(),first=f.raw('host',`/rooms/${snap.roomId}/sync`,input);await held.waiting;
  const second=await f.raw('host',`/rooms/${snap.roomId}/sync`,input);held.release();const retried=await first;assert.equal(second.status,200,JSON.stringify(second.body));assert.equal(retried.status,200,JSON.stringify(retried.body));assert.deepEqual(retried.body.world,second.body.world);
  const duplicate=await f.raw('host',`/rooms/${snap.roomId}/sync`,input);assert.equal(duplicate.status,200);assert.deepEqual(duplicate.body.world,second.body.world);snap=duplicate.body;
 }
 await race('collect');assert.equal(snap.world.restorationCare.carried,5);assert.equal(snap.world.restoration.sites[0].careExported,5);
 const stored=f.stored(snap.roomId),target=restorationCarePosition(worldRestorationPlan(stored.world.seed),careCommand(stored.world,'deliver'))!;pose(stored,stored.players[0]!,target.x,target.z);stored.world={...stored.world,player:{...stored.players[0]!.player}};f.replace(stored);const current=await f.raw('host',`/rooms/${snap.roomId}`);assert.equal(current.status,200);snap=current.body;
 await race('deliver');assert.equal(snap.world.restorationCare.delivered,5);assert.equal(snap.world.restorationCare.carried,0);assert.deepEqual(snap.world.townLife.habitatCare,{received:5,stock:5,used:0});assert(f.conflicts()>=2);assert(validateSave(f.stored(snap.roomId).world));
 for(const mutate of [(v:any)=>delete v.restorationCare,(v:any)=>v.restorationCare.carried+=5,(v:any)=>v.townLife.habitatCare.stock++,(v:any)=>v.restoration.sites[0].careExported+=5]){const world=structuredClone(snap.world);mutate(world);const invalid=await f.raw('other','/rooms',{name:'Other',world});assert.equal(invalid.status,400,JSON.stringify(invalid.body));}
 }finally{f.stop();}
});
