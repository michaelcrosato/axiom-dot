import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleCoop} from '../server/coop-api.ts';
import {action} from '../server/coop-validation.ts';
import type {CoopRoom} from '../server/coop-authority.ts';
import type {D1Database,D1Statement} from '../server/coop-store.ts';
import type {CoopAction,CoopSnapshot} from '../src/coop-protocol.ts';
import {createState,createConnectedState,applyAction,validateSave,serializeSave,parseSave,worldObjects,type State} from '../src/world.ts';
import {causalPlan} from '../src/causal.ts';
import {commonsTradeExports,validCommonsTrade} from '../src/commons-trade.ts';
type Player={user:string;s:CoopSnapshot};
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));

/** Each player crosses a real HTTP socket; every room mutation uses the actual SQLite CAS. */
async function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  for(const file of readdirSync(new URL('../drizzle',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8'));
  let now=1_800_000_000_000,origin='',conflicts=0;
  let pause:undefined|{arrived:()=>void;gate:Promise<void>};
  const DB:D1Database={prepare(sql){
    let values:unknown[]=[];
    const statement:D1Statement={bind(...args){values=args;return statement;},
      async first<T>(){return (sqlite.prepare(sql).get(...values as never[])??null) as T|null;},
      async all<T>(){return {results:sqlite.prepare(sql).all(...values as never[]) as T[]};},
      async run(){
        if(sql.startsWith('UPDATE axiom_coop_rooms')&&pause){const pending=pause;pause=undefined;pending.arrived();await pending.gate;}
        const result=sqlite.prepare(sql).run(...values as never[]),changes=Number(result.changes);
        if(sql.startsWith('UPDATE axiom_coop_rooms')&&changes===0)conflicts++;
        return {success:true,meta:{changes}};
      }};return statement;
  }};
  const server=createServer(async(req,res)=>{
    try{
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk as Buffer);
      const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
      const body=Buffer.concat(chunks).toString('utf8');
      const result=await handleCoop(new Request(`${origin}${req.url}`,{method:req.method,headers,...(body?{body}:{})}),{DB},now);
      res.writeHead(result?.status??404,Object.fromEntries(result?.headers??[]));res.end(await result?.text());
    }catch(error){res.writeHead(500);res.end(String(error));}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert(address&&typeof address==='object');origin=`http://127.0.0.1:${address.port}`;
  async function raw(user:string,path:string,body?:unknown){
    const response=await fetch(`${origin}/api/coop${path}`,{method:body===undefined?'GET':'POST',headers:{'oai-authenticated-user-id':user,Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json(),headers:response.headers};
  }
  function holdNextCommit(){
    assert.equal(pause,undefined);let release=()=>{},arrived=()=>{};
    const gate=new Promise<void>(r=>{release=r;}),waiting=new Promise<void>(r=>{arrived=r;});pause={arrived,gate};
    return {release,waiting};
  }
  function stored(id:string):CoopRoom{return JSON.parse(String(sqlite.prepare('SELECT body FROM axiom_coop_rooms WHERE id = ?').get(id)!.body));}
  // Used only to represent pre-upgrade or corrupted durable records, never gameplay outcomes.
  function replaceStored(room:CoopRoom){sqlite.prepare('UPDATE axiom_coop_rooms SET body = ? WHERE id = ?').run(JSON.stringify(room),room.id);}
  return {raw,origin,stored,replaceStored,holdNextCommit,conflicts:()=>conflicts,time:()=>now,advance:(ms:number)=>{now+=ms;},stop:async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));sqlite.close();}};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function expedition(f:Fixture,world:State,count=4){
  const created=await f.raw('host','/rooms',{name:'Host',world});assert.equal(created.status,201,JSON.stringify(created.body));
  const players:Player[]=[{user:'host',s:created.body}];
  for(let i=1;i<count;i++){const joined=await f.raw(`guest-${i}`,'/join',{name:`Guest ${i}`,code:created.body.code});assert.equal(joined.status,200,JSON.stringify(joined.body));players.push({user:`guest-${i}`,s:joined.body});}
  return players;
}
async function input(f:Fixture,p:Player,actions:CoopAction[]=[]){
  const result=await f.raw(p.user,`/rooms/${p.s.roomId}/sync`,{seq:p.s.ack+1,sessionId:p.s.sessionId,actions});
  assert.equal(result.status,200,JSON.stringify(result.body));p.s=result.body;return p.s;
}
function command(p:Player,revision=p.s.world.causal!.commonsTrade!.revision,settlementId=causalPlan(p.s.world.seed).settlements[0]!.id):CoopAction{return {type:'commons-trade',command:{type:'water-for-scrap',settlementId,expectedRevision:revision}};}
async function current(f:Fixture,p:Player){const result=await f.raw(p.user,`/rooms/${p.s.roomId}`);assert.equal(result.status,200);p.s=result.body;return p.s;}
function source(){let s=createConnectedState(1);for(const o of worldObjects(s).filter(o=>o.kind==='water')){s=applyAction(s,{type:'move',x:o.x,z:o.z});s=applyAction(s,{type:'collect',id:o.id});}const home=causalPlan(s.seed).settlements[0]!;return applyAction(s,{type:'move',...home.position});}
function conserved(s:State){assert(validateSave(s));assert(validCommonsTrade(s.causal!.commonsTrade,s.seed,s.causal!));assert.equal(s.causal!.materials+s.causal!.agentMaterialsSpent+commonsTradeExports(s.causal,s.seed),causalPlan(s.seed).initialMaterials);assert.deepEqual(parseSave(serializeSave(s)),s);}

test('HTTP allowlist admits only one bounded exchange intent and rejects client authority injection',async()=>{
 const settlementId=causalPlan(1).settlements[0]!.id,c={type:'water-for-scrap',settlementId,expectedRevision:0};
 for(const expectedRevision of [0,1,4])assert.deepEqual(action({type:'commons-trade',command:{...c,expectedRevision}}),{type:'commons-trade',command:{...c,expectedRevision}});
 const rejected=[null,[],{},...[-1,.5,5,1e9,NaN,Infinity,'0',null,undefined].map(expectedRevision=>({...c,expectedRevision})),{...c,type:'mint'},{...c,settlementId:''},{...c,settlementId:'x'.repeat(181)},{...c,settlementId:'bad\nname'},{...c,amount:100},{...c,materials:999},{...c,playerCredit:2},{...c,playerId:'host'},{...c,at:0},{type:'water-for-scrap',expectedRevision:0}];
 const f=await fixture();try{const [host]=await expedition(f,source(),1);assert(host);
  for(const command of rejected){assert.equal(action({type:'commons-trade',command}),null);const r=await f.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:1,sessionId:host.s.sessionId,actions:[{type:'commons-trade',command}]});assert.equal(r.status,400);assert.equal(r.body.error,'invalid_input');}
  assert.equal(action({type:'commons-trade',command:c,inventory:{scrap:999}}),null);await current(f,host);assert.equal(host.s.ack,0);assert.equal(host.s.world.causal!.commonsTrade!.revision,0);assert.equal(host.s.world.inventory.water,3);
 }finally{await f.stop();}
});

for(const count of [2,4])test(`${count} real HTTP players and forced SQLite CAS commit exactly one communal debit, player credit and water delivery`,async()=>{
 const f=await fixture();try{
  const original=source(),bytes=serializeSave(original),players=await expedition(f,original,count),host=players[0]!,guest=players[1]!,homeId=causalPlan(1).settlements[0]!.id;
  const blocked=f.holdNextCommit(),before=f.conflicts();f.advance(100);const losing=input(f,guest,[command(guest,0)]);await blocked.waiting;
  try{f.advance(150);await input(f,host,[command(host,0)]);}finally{blocked.release();}
  await losing;assert.equal(f.conflicts(),before+1);assert.equal(host.s.serverTime,guest.s.serverTime);assert.deepEqual(host.s.world.causal!.commonsTrade,guest.s.world.causal!.commonsTrade);
  await Promise.all(players.map(p=>current(f,p)));
  for(const p of players){assert.equal(p.s.world.inventory.scrap,1);assert.equal(p.s.world.inventory.water,2);assert.equal(p.s.world.causal!.materials,1);assert.equal(p.s.world.causal!.playerWater,4);assert.equal(p.s.world.causal!.commonsTrade!.records.length,1);assert.equal(p.s.world.causal!.settlements.find(h=>h.id===homeId)!.reserve,4);assert.equal(p.s.world.waterRestored,false);conserved(p.s.world);}
  const receipt=copy(host.s.world.causal!.commonsTrade);const replay=await f.raw(guest.user,`/rooms/${guest.s.roomId}/sync`,{seq:guest.s.ack,sessionId:guest.s.sessionId,actions:[command(guest,0)]});assert.equal(replay.status,200);assert.deepEqual(replay.body.world.causal.commonsTrade,receipt);
  await Promise.all(players.map(p=>input(f,p,[command(p,0)])));await current(f,host);assert.deepEqual(host.s.world.causal!.commonsTrade,receipt);
  await Promise.all(players.map(p=>input(f,p,[command(p,1)])));await Promise.all(players.map(p=>current(f,p)));
  for(const p of players){assert.equal(p.s.world.inventory.scrap,2);assert.equal(p.s.world.inventory.water,1);assert.equal(p.s.world.causal!.materials,0);assert.equal(p.s.world.causal!.commonsTrade!.revision,2);assert.equal(p.s.world.causal!.playerWater,8);conserved(p.s.world);}
  await Promise.all(players.map(p=>input(f,p,[command(p,2)])));await current(f,host);assert.equal(host.s.world.causal!.commonsTrade!.revision,2);assert.equal(host.s.world.inventory.scrap,2);assert.equal(f.stored(host.s.roomId).lastTick,f.time());assert.equal(serializeSave(original),bytes);
  const saved=copy(host.s.world.causal!.commonsTrade);await f.raw(host.user,`/rooms/${host.s.roomId}/leave`,{sessionId:host.s.sessionId});f.advance(60000);await input(f,guest,[command(guest,2)]);assert(guest.s.paused);assert.deepEqual(guest.s.world.causal!.commonsTrade,saved);
  const resumed=await f.raw(host.user,`/rooms/${host.s.roomId}/resume`,{});assert.equal(resumed.status,200);host.s=resumed.body;assert.deepEqual(host.s.world.causal!.commonsTrade,saved);conserved(host.s.world);
 }finally{await f.stop();}
});

test('late room activation snapshots actual old deliveries without rewards and malformed present data is rejected before reset',async()=>{
 const f=await fixture();try{
  let old=source();old=applyAction(old,{type:'causal',command:{type:'deliver-water',settlementId:causalPlan(1).settlements[0]!.id}});const [host]=await expedition(f,old,1);assert(host);
  assert.equal(host.s.world.causal!.commonsTrade!.baseline.playerWater,4);assert.equal(host.s.world.causal!.commonsTrade!.revision,0);assert.equal(host.s.world.inventory.scrap,0);assert.equal(host.s.world.inventory.water,2);
  const absent=f.stored(host.s.roomId);delete absent.world.causal!.commonsTrade;f.replaceStored(absent);await input(f,host,[command(host,0)]);assert.equal(host.s.world.causal!.commonsTrade!.revision,1);assert.equal(host.s.world.causal!.commonsTrade!.baseline.playerWater,4);assert.equal(host.s.world.inventory.scrap,1);assert.equal(host.s.world.inventory.water,1);conserved(host.s.world);
  const malformed=f.stored(host.s.roomId);(malformed.world.causal as unknown as {commonsTrade:unknown}).commonsTrade=null;f.replaceStored(malformed);const result=await f.raw(host.user,`/rooms/${host.s.roomId}/resume`,{});assert.equal(result.status,503);assert.deepEqual(f.stored(host.s.roomId),malformed);
  const broken=source();(broken.causal as unknown as {commonsTrade:unknown}).commonsTrade={revision:4,records:[]};const rejected=await f.raw('broken','/rooms',{name:'Invalid pack',world:broken});assert.equal(rejected.status,400);assert.equal(rejected.body.error,'invalid_world');
  const [legacy]=await expedition(f,createState(),1);assert(legacy);assert.equal(legacy.s.world.causal,undefined);
 }finally{await f.stop();}
});

test('HTTP execution requires the acting player alive at the requested valley flag, not merely shared canister stock',async()=>{
 const f=await fixture();try{
  for(const kind of ['far','dead','wrong-flag','dungeon'] as const){let world=source();if(kind==='far')world=applyAction(world,{type:'move',x:70,z:70});if(kind==='wrong-flag')world=applyAction(world,{type:'move',...causalPlan(1).settlements[1]!.position});if(kind==='dead')world={...world,player:{...world.player,hp:0}};if(kind==='dungeon')world={...world,zone:'dungeon'};
   const [host,guest]=await expedition(f,world,2);assert(host&&guest);const before=copy(host.s.world);await input(f,guest,[command(guest,0)]);assert.equal(guest.s.world.causal!.commonsTrade!.revision,0,kind);assert.equal(guest.s.world.inventory.scrap,0);assert.equal(guest.s.world.inventory.water,3);assert.deepEqual(guest.s.world.causal!.settlements,before.causal!.settlements);conserved(guest.s.world);
  }
 }finally{await f.stop();}
});

test('a nearby host cannot authorize an out-of-range guest to barter shared stock',async()=>{
 const f=await fixture();try{const [host,guest]=await expedition(f,source(),2);assert(host&&guest);const home=causalPlan(1).settlements[0]!.position;
  f.advance(800);const moved=await f.raw(guest.user,`/rooms/${guest.s.roomId}/sync`,{seq:guest.s.ack+1,sessionId:guest.s.sessionId,actions:[],move:{...guest.s.peers.find(p=>p.id===guest.s.selfId)!.pose,x:home.x+6,z:home.z}});assert.equal(moved.status,200);guest.s=moved.body;assert.ok(Math.hypot(guest.s.world.player.x-home.x,guest.s.world.player.z-home.z)>3.5);
  await input(f,guest,[command(guest,0)]);assert.equal(guest.s.world.causal!.commonsTrade!.revision,0);assert.equal(guest.s.world.inventory.scrap,0);await input(f,host,[command(host,0)]);assert.equal(host.s.world.causal!.commonsTrade!.revision,1);assert.equal(host.s.world.inventory.scrap,1);conserved(host.s.world);
 }finally{await f.stop();}
});
