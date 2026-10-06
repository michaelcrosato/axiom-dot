import test from 'node:test';
import assert from 'node:assert/strict';
import {action} from '../server/coop-validation.ts';

test('town supply boundary accepts bounded escrow commands and rejects client inventory or cargo authority',()=>{
 const value={type:'town-supply',command:{kind:'load',targetId:'valley:scrap:0',expectedRevision:0}};
 assert.deepEqual(action(value),value);
 for(const command of [{...value.command,amount:10},{...value.command,expectedRevision:-1},{...value.command,kind:'refund'},{...value.command,inventory:{scrap:2,core:0,water:0}}])assert.equal(action({...value,command}),null);
});

import {createRoom,joinRoom,syncRoom,roomObstacles,type CoopRoom,type RoomPlayer} from '../server/coop-authority.ts';
import {createVertical} from '../server/coop-vertical.ts';
import {actorPathClear} from '../server/coop-movement.ts';
import {clearPulsePath} from '../src/combat.ts';
import {townSupplyPosition,type TownSupplyCommand} from '../src/town-supply.ts';
import {worldTownSupplySources,validateSave,applyAction,type State} from '../src/world.ts';
import {worldHeight} from '../src/generation.ts';
import {townSupplyWorld,supplyCommand,atSupply,loadSupply} from './helpers/town-supply.ts';
function pose(room:CoopRoom,p:RoomPlayer,x:number,z:number){const y=worldHeight(room.world,x,z);p.player={...p.player,x,z};p.motion=createVertical(y);p.pose={...p.pose,x,z,y,grounded:true,crouched:false};}
function send(room:CoopRoom,p:RoomPlayer,command:TownSupplyCommand){return syncRoom(room,p.userId,{seq:p.seq+1,sessionId:p.sessionId,actions:[{type:'town-supply',command}]},1000);}
/** Numerical standing-body and ray tests at real terrain feet, not browser traversal. */
function approach(s:State,index:number):State {
 const target=townSupplyPosition(s.seed,worldTownSupplySources(s),supplyCommand(s,'load',index))!;
 for(const radius of [0,.4,.8,1.2,1.6,2,2.4,2.8,3.2,3.4])for(let i=0;i<32;i++){
  const x=target.x+radius*Math.sin(i*Math.PI/16),z=target.z+radius*Math.cos(i*Math.PI/16),feet={x,z,y:worldHeight(s,x,z)},candidate={...s,player:{...s.player,x,z}},obstacles=roomObstacles(candidate);
  if(Math.abs(feet.y-target.y)>.45||!actorPathClear(feet,feet,obstacles,false)||!clearPulsePath(feet,target,obstacles))continue;return candidate;
 }
 throw Error(`No physical supply approach at seed ${s.seed}, source ${target.x},${target.z}`);
}

test('supply authority rejects guests and invalid posture while duplicate host requests cannot duplicate cargo',()=>{
 const world=approach(townSupplyWorld(),0),room=createRoom('host','Host',world,1000),host=room.players[0]!,guest=joinRoom(room,'guest','Guest',1000),command=supplyCommand(world,'load');assert(send(room,guest,command).some(n=>n.includes('host')));assert.equal(room.world.townSupply,undefined);
 const input={seq:host.seq+1,sessionId:host.sessionId,actions:[{type:'town-supply' as const,command}]};assert.deepEqual(syncRoom(room,'host',input,1000),[]);assert.equal(room.world.townSupply!.carried,1);const collected=room.world.collected;syncRoom(room,'host',input,1000);assert.equal(room.world.collected,collected);send(room,host,command);assert.equal(room.world.townSupply!.carried,1);assert(validateSave(room.world));
 for(const scenario of ['airborne','crouched','dead','remote'] as const){const r=createRoom('host','Host',world,1000),h=r.players[0]!;if(scenario==='airborne'){h.motion!.grounded=false;h.motion!.feetY+=1;}if(scenario==='crouched')h.motion!.crouched=true;if(scenario==='dead')h.player.hp=0;if(scenario==='remote')pose(r,h,h.player.x+20,h.player.z);assert(send(r,h,command).length,scenario);assert.equal(r.world.townSupply,undefined,scenario);}
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



test('all finite supply sources have a clear standing HTTP load approach across zero typical and uint32-max seeds',async()=>{
 const f=httpFixture();try{for(const seed of [0,73129,0xffffffff])for(let i=0;i<7;i++){
  const world=approach(townSupplyWorld(seed),i),created=await f.raw(`host-${seed}-${i}`,'/rooms',{name:'Host',world});assert.equal(created.status,201,JSON.stringify(created.body));const snap=created.body,command=supplyCommand(snap.world,'load',i);
  const response=await f.raw(`host-${seed}-${i}`,`/rooms/${snap.roomId}/sync`,{seq:snap.ack+1,sessionId:snap.sessionId,actions:[{type:'town-supply',command}]});assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.world.townSupply?.carried,1,JSON.stringify({seed,i,notices:response.body.notices}));assert.equal(response.body.world.collected.filter((id:string)=>id===command.targetId).length,1);assert(validateSave(response.body.world));
 }}finally{f.stop();}
});

test('HTTP ordinary collect versus supply load races share one canonical tombstone in either CAS order',async()=>{
 const f=httpFixture();try{for(const loadWins of [false,true]){
 const user=`host-${loadWins}`,created=await f.raw(user,'/rooms',{name:'Host',world:approach(townSupplyWorld(),0)});assert.equal(created.status,201);const host=created.body,joined=await f.raw(`guest-${loadWins}`,'/join',{name:'Guest',code:host.code});assert.equal(joined.status,200);const guest=joined.body,command=supplyCommand(host.world,'load');
 const loading=()=>f.raw(user,`/rooms/${host.roomId}/sync`,{seq:host.ack+1,sessionId:host.sessionId,actions:[{type:'town-supply',command}]}),collecting=()=>f.raw(`guest-${loadWins}`,`/rooms/${host.roomId}/sync`,{seq:guest.ack+1,sessionId:guest.sessionId,actions:[{type:'collect',id:command.targetId}]});
 const held=f.hold(),first=(loadWins?collecting:loading)();await held.waiting;const second=await(loadWins?loading:collecting)();held.release();const retried=await first;assert.equal(second.status,200);assert.equal(retried.status,200);const final=f.stored(host.roomId).world;assert.equal(final.collected.filter(id=>id===command.targetId).length,1);assert.equal(final.inventory.scrap+(final.townSupply?.carried??0),1);assert.equal(final.townSupply?.carried??0,loadWins?1:0);assert(validateSave(final));
 }assert(f.conflicts()>=2);}finally{f.stop();}
});

test('HTTP unload versus deliver conflicts and response retries cannot refund or spend the same escrow twice',async()=>{
 const f=httpFixture();try{for(const deliverWins of [false,true]){
 const user=`host-${deliverWins}`,world=atSupply(loadSupply(townSupplyWorld(),3),'deliver'),created=await f.raw(user,'/rooms',{name:'Host',world});assert.equal(created.status,201,JSON.stringify(created.body));const snap=created.body;
 const input=(kind:'deliver'|'unload')=>({seq:snap.ack+1,sessionId:snap.sessionId,actions:[{type:'town-supply',command:supplyCommand(snap.world,kind)}]}),winning=deliverWins?'deliver':'unload',losing=deliverWins?'unload':'deliver';
 const held=f.hold(),first=f.raw(user,`/rooms/${snap.roomId}/sync`,input(losing));await held.waiting;const second=await f.raw(user,`/rooms/${snap.roomId}/sync`,input(winning));held.release();const retried=await first;assert.equal(second.status,200);assert.equal(retried.status,200);assert.deepEqual(retried.body.world,second.body.world);const duplicate=await f.raw(user,`/rooms/${snap.roomId}/sync`,input(winning));assert.equal(duplicate.status,200);assert.deepEqual(duplicate.body.world,second.body.world);
 const final=f.stored(snap.roomId).world;assert.equal(final.townSupply!.carried,deliverWins?1:2);assert.equal(final.inventory.scrap,deliverWins?0:1);assert.equal(final.townSupply!.deliveries,deliverWins?1:0);assert.equal(final.townLife!.supplyDeliveries??0,deliverWins?1:0);assert.equal(final.townLife!.resources.materials,world.townLife!.resources.materials+(deliverWins?12:0));assert(validateSave(final));
 for(const mutate of [(v:any)=>delete v.townSupply,(v:any)=>v.inventory.scrap++,(v:any)=>v.townSupply.sources[0]='unknown-source',(v:any)=>v.collected.shift()]){const forged=structuredClone(final);mutate(forged);const rejected=await f.raw('forged','/rooms',{name:'Forged',world:forged});assert.equal(rejected.status,400,JSON.stringify(rejected.body));}
 }assert(f.conflicts()>=2);}finally{f.stop();}
});
