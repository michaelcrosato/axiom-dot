import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import {DatabaseSync} from 'node:sqlite';import {readFileSync,readdirSync} from 'node:fs';
import {handleCoop} from '../server/coop-api.ts';import type {CoopRoom} from '../server/coop-authority.ts';import type {D1Database,D1Statement} from '../server/coop-store.ts';
import {CoopClient} from '../src/coop.ts';import type {CoopAction,CoopSnapshot,CoopMove} from '../src/coop-protocol.ts';
import {createConnectedState,applyAction,worldObjects,worldEndpoints,validateSave,serializeSave,parseSave,type State} from '../src/world.ts';
import {naturalCave} from '../src/natural-cave.ts';import {causalPlan} from '../src/causal.ts';import {caveSettlementWaterBalance} from '../src/cave-supply.ts';
type Player={user:string;s:CoopSnapshot};
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
const connect:CoopAction={type:'cave-supply',command:{type:'connect-outfall'}};
function expeditionSource(){
 let s=createConnectedState(73129);for(const o of worldObjects(s)){if(['scrap','core','water'].includes(o.kind)){s=applyAction(s,{type:'move',...o});s=applyAction(s,{type:'collect',id:o.id});}if(o.kind==='enemy'){s=applyAction(s,{type:'move',...o});s=applyAction(s,{type:'attack',id:o.id});}}
 for(const j of s.causal!.jobs.filter(j=>j.kind==='water')){s=applyAction(s,{type:'move',...causalPlan(s.seed).settlements.find(h=>h.id===j.targetId)!.position});s=applyAction(s,{type:'causal',command:{type:'accept',id:j.id}});}
 s=applyAction(s,{type:'move',...worldEndpoints(s).entrance});s=applyAction(s,{type:'enter-cave'});s=applyAction(s,{type:'move',...naturalCave(s.seed).anchors.drain});assert.ok(validateSave(s));return s;
}
async function expedition(f:Fixture,count=2){
 const source=expeditionSource(),response=await f.raw('host','/rooms',{name:'Host',world:source});assert.equal(response.status,201,JSON.stringify(response.body));const players:Player[]=[{user:'host',s:response.body}];
 for(let i=1;i<count;i++){const joined=await f.raw(`guest-${i}`,'/join',{name:`Guest ${i}`,code:response.body.code});assert.equal(joined.status,200);players.push({user:`guest-${i}`,s:joined.body});}return {source,players};
}
async function input(f:Fixture,p:Player,actions:CoopAction[]=[],move?:CoopMove){const r=await f.raw(p.user,`/rooms/${p.s.roomId}/sync`,{seq:p.s.ack+1,sessionId:p.s.sessionId,actions,...(move?{move}:{})});assert.equal(r.status,200,JSON.stringify(r.body));p.s=r.body;return p.s;}
async function current(f:Fixture,p:Player){const r=await f.raw(p.user,`/rooms/${p.s.roomId}`);assert.equal(r.status,200,JSON.stringify(r.body));p.s=r.body;return p.s;}
function conserved(s:State){assert.ok(validateSave(s));assert.ok(Math.abs(caveSettlementWaterBalance(s.caveWater!,s.causal!))<1e-5);assert.deepEqual(parseSave(serializeSave(s)),s);}

test('concurrent cave connections cross real HTTP and SQLite CAS, spend exactly 2 scrap and safely replay',async()=>{
 const f=await fixture();try{
  const {source,players}=await expedition(f),host=players[0]!,guest=players[1]!,before=source.inventory.scrap,blocked=f.holdNextCommit(),conflicts=f.conflicts();
  f.advance(100);const old=input(f,guest,[connect]);await blocked.waiting;
  try{f.advance(150);await input(f,host,[connect]);}finally{blocked.release();}await old;
  assert.equal(f.conflicts(),conflicts+1);assert.equal(host.s.world.inventory.scrap,before-2);assert.equal(guest.s.world.inventory.scrap,before-2);assert.equal(host.s.world.caveSupply!.connected,true);assert.equal(host.s.world.caveSupply!.connectedAt,.25);assert.equal(host.s.world.caveSupply!.drained.captured,0);assert.equal(host.s.world.causal!.caveReceipts,undefined);assert.deepEqual(host.s.world.caveSupply,guest.s.world.caveSupply);assert.equal(host.s.serverTime,guest.s.serverTime);
  const replay=await f.raw(guest.user,`/rooms/${guest.s.roomId}/sync`,{seq:guest.s.ack,sessionId:guest.s.sessionId,actions:[connect]});assert.equal(replay.status,200);assert.deepEqual(replay.body.world.caveSupply,guest.s.world.caveSupply);assert.equal(replay.body.world.inventory.scrap,before-2);
  const stored=f.stored(host.s.roomId);assert.equal(stored.lastTick,f.time());assert.equal(stored.world.inventory.scrap,before-2);conserved(stored.world);
  const forged=await f.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:host.s.ack+1,sessionId:host.s.sessionId,actions:[{type:'cave-supply',command:{type:'connect-outfall',received:9999}}]});assert.equal(forged.status,400);assert.deepEqual(f.stored(host.s.roomId).world.caveSupply,stored.world.caveSupply);
 }finally{await f.stop();}
});

test('lost successful connection response is retried byte-for-byte by browser transport without a second debit',async()=>{
 const f=await fixture();let client:CoopClient|undefined;
 try{
  const requests:string[]=[];let lost=false;const source=expeditionSource(),before=serializeSave(source),fetcher:typeof fetch=async(url,init)=>{const response=await fetch(url,{...init,headers:{...init?.headers,'oai-authenticated-user-id':'host',Origin:f.origin}});
   if(String(url).endsWith('/sync')&&JSON.parse(String(init?.body)).actions.some((a:{type:string})=>a.type==='cave-supply')){requests.push(String(init?.body));if(!lost&&response.ok){lost=true;throw new Error('Response lost after actual SQLite commit');}}return response;};
  client=new CoopClient({baseURL:f.origin,fetch:fetcher,onSnapshot:()=>{}});await client.create({name:'Host',world:source});assert.ok(client.send(connect));const deadline=Date.now()+5000;
  while(!client.snapshot?.world.caveSupply?.connected&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
  assert.ok(lost);assert.equal(requests.length,2);assert.equal(requests[0],requests[1]);assert.ok(client.canAct);assert.equal(client.snapshot!.world.inventory.scrap,source.inventory.scrap-2);assert.equal(client.snapshot!.world.causal!.caveReceipts,undefined);assert.equal(serializeSave(source),before);conserved(f.stored(client.snapshot!.roomId).world);
 }finally{client?.disconnect();await f.stop();}
});

test('mixed-zone HTTP players share one physical supply clock, real carrier receipts and durable resume without catch-up',async()=>{
 const f=await fixture();try{
  const {source,players}=await expedition(f,3),host=players[0]!,dungeon=players[1]!,valley=players[2]!;await input(f,host,[connect]);
  f.advance(600);const bank=naturalCave(source.seed).spawn,move={...bank,y:0,facing:0,grounded:true,crouched:false};await Promise.all([input(f,dungeon,[{type:'exit'}],move),input(f,valley,[{type:'exit'}],move)]);assert.equal(dungeon.s.world.zone,'valley');assert.equal(valley.s.world.zone,'valley');await input(f,dungeon,[{type:'enter'}]);assert.equal(dungeon.s.world.zone,'dungeon');
  await current(f,host);assert.equal(host.s.world.zone,'cave');const before=host.s.world.causal!.elapsed,beforeCapture=host.s.world.causal!.caveReceipts!.received;
  f.advance(250);await Promise.all(players.map(p=>input(f,p)));assert.ok(players.every(p=>p.s.world.causal!.elapsed===before+.25));assert.ok(Math.abs(host.s.world.causal!.caveReceipts!.received-beforeCapture-.125)<1e-8);
  for(let second=0;second<400;second++){f.advance(1000);if(second%4===0)await Promise.all(players.map(p=>input(f,p)));else await input(f,host);}
  await Promise.all(players.map(p=>current(f,p)));assert.ok(host.s.world.causal!.caveReceipts!.households.every(h=>h.litres>0));assert.ok(host.s.world.causal!.jobs.filter(j=>j.kind==='water').every(j=>j.status==='completed'&&j.playerEvidence.includes('cave')));
  for(const p of players){assert.deepEqual(p.s.world.caveSupply,host.s.world.caveSupply);assert.deepEqual(p.s.world.causal!.caveReceipts,host.s.world.causal!.caveReceipts);assert.equal(p.s.world.inventory.scrap,source.inventory.scrap-2);assert.equal(p.s.world.inventory.water,source.inventory.water);conserved(p.s.world);}
  const saved=structuredClone(host.s.world.caveSupply),receipts=structuredClone(host.s.world.causal!.caveReceipts);assert.deepEqual(f.stored(host.s.roomId).world.caveSupply,saved);
  await f.raw(host.user,`/rooms/${host.s.roomId}/leave`,{sessionId:host.s.sessionId});f.advance(3600000);await input(f,valley);assert.ok(valley.s.paused);assert.deepEqual(valley.s.world.caveSupply,saved);
  const resumed=await f.raw(host.user,`/rooms/${host.s.roomId}/resume`,{});assert.equal(resumed.status,200);host.s=resumed.body;assert.deepEqual(host.s.world.caveSupply,saved);assert.deepEqual(host.s.world.causal!.caveReceipts,receipts);conserved(f.stored(host.s.roomId).world);
 }finally{await f.stop();}
});

test('first same-time HTTP action on an old stored cave room baselines historical outflow before connecting',async()=>{
 const f=await fixture();try{
  const {players}=await expedition(f),host=players[0]!;f.advance(1000);await input(f,host);const old=f.stored(host.s.roomId),output=old.world.caveWater!.drained,before=old.world.inventory.scrap;assert.ok(output>0);assert.equal(old.world.causal!.caveReceipts,undefined);
  delete old.world.caveSupply;f.replaceStored(old);await input(f,host,[connect]);assert.ok(host.s.world.caveSupply!.connected);assert.equal(host.s.world.caveSupply!.drained.baseline,output);assert.equal(host.s.world.caveSupply!.drained.seen,output);assert.equal(host.s.world.caveSupply!.drained.captured,0);assert.equal(host.s.world.caveSupply!.connectedAt,old.world.caveWater!.elapsed);assert.equal(host.s.world.inventory.scrap,before-2);assert.equal(host.s.world.causal!.caveReceipts,undefined);
  f.advance(250);await input(f,host);assert.equal(host.s.world.causal!.caveReceipts!.received,.125);assert.equal(host.s.world.caveSupply!.drained.baseline,output);assert.equal(host.s.world.causal!.extracted,old.world.causal!.extracted);assert.equal(host.s.world.causal!.networkCaptured,old.world.causal!.networkCaptured);assert.ok(host.s.world.causal!.jobs.filter(j=>j.kind==='water').every(j=>!j.playerContribution));conserved(f.stored(host.s.roomId).world);
 }finally{await f.stop();}
});
