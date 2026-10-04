import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import {DatabaseSync} from 'node:sqlite';import {readFileSync,readdirSync} from 'node:fs';
import {handleCoop} from '../server/coop-api.ts';import {action} from '../server/coop-validation.ts';import type {CoopRoom} from '../server/coop-authority.ts';import type {D1Database,D1Statement} from '../server/coop-store.ts';
import {CoopClient} from '../src/coop.ts';import type {CoopAction,CoopSnapshot} from '../src/coop-protocol.ts';
import {createState,createConnectedState,enableWaterRequests,enableCommonsTrade,applyAction,validateSave,serializeSave,parseSave,worldObjects,type State} from '../src/world.ts';
import {causalPlan} from '../src/causal.ts';import {waterRequestView,type WaterRequestCommand} from '../src/water-requests.ts';
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
function command(p:Player,type:WaterRequestCommand['type'],id=requests(p.s.world).at(-1)!.id,revision=p.s.world.causal!.waterRequests!.revision):CoopAction{return {type:'water-request',command:{type,id,expectedRevision:revision}};}
async function current(f:Fixture,p:Player){const result=await f.raw(p.user,`/rooms/${p.s.roomId}`);assert.equal(result.status,200);p.s=result.body;return p.s;}
const requests=(s:State)=>waterRequestView(s.causal!,s.seed).episodes;
function conserved(s:State){assert.ok(validateSave(s));assert.deepEqual(parseSave(serializeSave(s)),s);assert.ok(s.causal!.renown<=64);}
/** All fixtures use actual reducers and collected water; no imported gameplay outcomes. */
function source(open=true,completed=false){
 let s=createConnectedState(1);const home=causalPlan(1).settlements[1]!,founding=s.causal!.jobs.find(j=>j.settlementId===home.id)!;
 s=applyAction(s,{type:'move',...home.position});s=applyAction(s,{type:'causal',command:{type:'accept',id:founding.id}});
 for(const o of worldObjects(s)){if(['scrap','core','water'].includes(o.kind)){s=applyAction(s,{type:'move',...o});s=applyAction(s,{type:'collect',id:o.id});}if(o.kind==='enemy'){s=applyAction(s,{type:'move',...o});s=applyAction(s,{type:'attack',id:o.id});}}
 s=applyAction(enableWaterRequests(s),{type:'move',...home.position});if(open)for(let i=0;i<91;i++)s=applyAction(s,{type:'tick',dt:1});
 if(completed){const e=requests(s).at(-1)!;s=applyAction(s,{type:'water-request',command:{type:'accept',id:e.id,expectedRevision:s.causal!.waterRequests!.revision}});s=applyAction(s,{type:'causal',command:{type:'deliver-water',settlementId:home.id}});assert.equal(requests(s).at(-1)!.status,'completed');}
 assert.equal(s.causal!.jobs.find(j=>j.id===founding.id)!.status,'completed');conserved(s);return s;
}

test('water-request HTTP allowlist accepts exact bounded commands and rejects authority injection before mutation',async()=>{
 const s=source(),id=requests(s).at(-1)!.id;
 for(const type of ['accept','claim'])for(const expectedRevision of [0,82])assert.deepEqual(action({type:'water-request',command:{type,id,expectedRevision}}),{type:'water-request',command:{type,id,expectedRevision}});
 const inputs=[null,[],{},...[-1,.25,83,NaN,Infinity,'0',null,undefined].map(expectedRevision=>({type:'accept',id,expectedRevision})),{type:'claim',id:'',expectedRevision:0},{type:'claim',id:'bad\n',expectedRevision:0},{type:'claim',id:'x'.repeat(181),expectedRevision:0},{type:'claim',id,expectedRevision:0,renown:100},{type:'claim',id,expectedRevision:0,playerId:'other'},{type:'expire',id,expectedRevision:0}];
 const f=await fixture();try{const [host]=await expedition(f,s,1);assert(host);for(const input of inputs){assert.equal(action({type:'water-request',command:input}),null);const bad=await f.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:1,sessionId:host.s.sessionId,actions:[{type:'water-request',command:input}]});assert.equal(bad.status,400);}
 await current(f,host);assert.equal(host.s.ack,0);assert.equal(host.s.world.causal!.renown,0);assert.deepEqual(host.s.world.causal!.waterRequests,s.causal!.waterRequests);
 }finally{await f.stop();}
});

test('four HTTP players share one accepted need, real delivery and once-only reward with stale revisions and duplicate retry',async()=>{
 const f=await fixture();try{const s=source(),before=serializeSave(s),players=await expedition(f,s),host=players[0]!,id=requests(s).at(-1)!.id,revision=s.causal!.waterRequests!.revision;
 await Promise.all(players.map(p=>input(f,p,[command(p,'accept',id,revision)])));await Promise.all(players.map(p=>current(f,p)));assert.equal(host.s.world.causal!.waterRequests!.records.filter(r=>r[0]===2).length,1);
 const stale=command(host,'claim',id,revision);await input(f,host,[stale]);assert.equal(host.s.world.causal!.renown,0);
 await input(f,host,[{type:'causal',command:{type:'deliver-water',settlementId:causalPlan(s.seed).settlements[1]!.id}}]);assert.equal(host.s.world.inventory.water,2);assert.equal(requests(host.s.world).at(-1)!.status,'completed');
 await Promise.all(players.map(p=>current(f,p)));const claim=command(host,'claim');await Promise.all(players.map(p=>input(f,p,[claim])));await Promise.all(players.map(p=>current(f,p)));
 for(const p of players){assert.equal(p.s.world.causal!.renown,4);assert.equal(p.s.world.causal!.waterRequests!.records.filter(r=>r[0]===5).length,1);assert.deepEqual(p.s.world.causal!.waterRequests,host.s.world.causal!.waterRequests);conserved(p.s.world);}
 const repeated=await f.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:host.s.ack,sessionId:host.s.sessionId,actions:[claim]});assert.equal(repeated.status,200);assert.equal(repeated.body.world.causal.renown,4);assert.equal(serializeSave(s),before);conserved(f.stored(host.s.roomId).world);
 }finally{await f.stop();}
});

test('simultaneous founding and recurring claims cross real SQLite CAS and conserve one shared issuer budget',async()=>{
 const f=await fixture();try{const s=source(true,true),players=await expedition(f,s),host=players[0]!,guest=players[1]!,home=causalPlan(s.seed).settlements[1]!,founding=s.causal!.jobs.find(j=>j.settlementId===home.id)!,episode=requests(s).at(-1)!;
 const held=f.holdNextCommit(),previous=f.conflicts();const pending=input(f,guest,[command(guest,'claim')]);await held.waiting;
 try{await input(f,host,[{type:'causal',command:{type:'claim',id:founding.id}}]);}finally{held.release();}await pending;await Promise.all(players.map(p=>current(f,p)));
 assert.equal(f.conflicts(),previous+1);for(const p of players){assert.equal(p.s.world.causal!.renown,founding.reward+4);assert.equal(p.s.world.causal!.jobs.find(j=>j.id===founding.id)!.status,'claimed');assert.equal(requests(p.s.world).find(e=>e.id===episode.id)!.status,'claimed');conserved(p.s.world);}
 await Promise.all(players.map(p=>input(f,p,[{type:'causal',command:{type:'claim',id:founding.id}},command(p,'claim',episode.id)])));await current(f,host);assert.equal(host.s.world.causal!.renown,founding.reward+4);conserved(f.stored(host.s.roomId).world);
 }finally{await f.stop();}
});

test('lost successful request claim response retries byte-for-byte without paying again',async()=>{
 const f=await fixture();let client:CoopClient|undefined;try{
 const requestsSent:string[]=[];let lost=false;const s=source(true,true),fetcher:typeof fetch=async(url,init)=>{const result=await fetch(url,{...init,headers:{...init?.headers,'oai-authenticated-user-id':'host',Origin:f.origin}});if(String(url).endsWith('/sync')&&JSON.parse(String(init?.body)).actions.some((a:{type:string})=>a.type==='water-request')){requestsSent.push(String(init?.body));if(!lost&&result.ok){lost=true;throw new Error('Response lost after successful SQLite commit');}}return result;};
 client=new CoopClient({baseURL:f.origin,fetch:fetcher,onSnapshot:()=>{}});await client.create({name:'Host',world:s});assert.ok(client.send({type:'water-request',command:{type:'claim',id:requests(s).at(-1)!.id,expectedRevision:s.causal!.waterRequests!.revision}}));const deadline=Date.now()+5000;
 while(client.snapshot?.world.causal?.renown!==4&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));assert.ok(lost);assert.equal(requestsSent.length,2);assert.equal(requestsSent[0],requestsSent[1]);assert.equal(client.snapshot!.world.causal!.renown,4);assert.equal(client.snapshot!.world.causal!.waterRequests!.records.filter(r=>r[0]===5).length,1);conserved(f.stored(client.snapshot!.roomId).world);
 }finally{client?.disconnect();await f.stop();}
});

test('old co-op packs baseline now, present malformed data is rejected, and host absence adds no deadline catch-up',async()=>{
 const f=await fixture();try{
 const s=source(false);delete s.causal!.waterRequests;const [host]=await expedition(f,s,1);assert(host);assert.equal(s.causal!.waterRequests,undefined);assert.equal(host.s.world.causal!.waterRequests!.startedAt,0);
 const old=f.stored(host.s.roomId);delete old.world.causal!.waterRequests;f.replaceStored(old);await input(f,host);assert.equal(host.s.world.causal!.waterRequests!.startedAt,0);assert.equal(requests(host.s.world).length,0);
 const broken=f.stored(host.s.roomId);(broken.world.causal as unknown as {waterRequests:null}).waterRequests=null;f.replaceStored(broken);assert.equal((await f.raw(host.user,`/rooms/${host.s.roomId}/resume`,{})).status,503);assert.deepEqual(f.stored(host.s.roomId),broken);
 const [other,guest]=await expedition(f,source(),2);assert(other&&guest);const before=copy(other.s.world.causal!.waterRequests);await f.raw(other.user,`/rooms/${other.s.roomId}/leave`,{sessionId:other.s.sessionId});f.advance(3600000);await input(f,guest);assert.ok(guest.s.paused);assert.deepEqual(guest.s.world.causal!.waterRequests,before);const resumed=await f.raw(other.user,`/rooms/${other.s.roomId}/resume`,{});assert.equal(resumed.status,200);assert.deepEqual(resumed.body.world.causal.waterRequests,before);conserved(f.stored(other.s.roomId).world);
 const [legacy]=await expedition(f,createState(1),1);assert(legacy);assert.equal(legacy.s.world.causal,undefined);
 }finally{await f.stop();}
});

test('four HTTP players share one accepted request, one reciprocal barter receipt and one bounded reward under concurrent retries',async()=>{
 const f=await fixture();try{let s=enableWaterRequests(enableCommonsTrade(createConnectedState(11)));for(const o of worldObjects(s)){if(['water','scrap','core','enemy'].includes(o.kind)){s=applyAction(s,{type:'move',...o});s=applyAction(s,o.kind==='enemy'?{type:'attack',id:o.id}:{type:'collect',id:o.id});}}const home=causalPlan(11).settlements[1]!;s=applyAction(s,{type:'move',...home.position});let e;for(let i=0;i<2400;i++){e=requests(s).find(e=>e.settlementId===home.id&&e.status==='offered');if(e)break;s=applyAction(s,{type:'tick',dt:.25});}assert(e);assert(s.causal!.materials>0);const players=await expedition(f,s),host=players[0]!,before={...host.s.world.inventory},materials=host.s.world.causal!.materials;
 await input(f,host,[command(host,'accept',e.id)]);const trade={type:'commons-trade',command:{type:'water-for-scrap',settlementId:home.id,expectedRevision:0}} as const;await Promise.all(players.map(p=>input(f,p,[trade])));await current(f,host);assert.equal(host.s.world.causal!.commonsTrade!.revision,1);assert.equal(host.s.world.causal!.materials,materials-1);assert.equal(host.s.world.inventory.scrap,before.scrap+1);assert.equal(host.s.world.inventory.water,before.water-1);assert.equal(requests(host.s.world).find(x=>x.id===e!.id)!.status,'completed');
 await Promise.all(players.map(p=>current(f,p)));const claims=players.map(p=>command(p,'claim',e!.id));await Promise.all(players.map((p,i)=>input(f,p,[claims[i]!,trade])));await Promise.all(players.map(p=>current(f,p)));for(const p of players){assert.equal(p.s.world.causal!.renown,4);assert.equal(p.s.world.causal!.commonsTrade!.revision,1);assert.equal(requests(p.s.world).find(x=>x.id===e!.id)!.status,'claimed');conserved(p.s.world);}conserved(f.stored(host.s.roomId).world);
 }finally{await f.stop();}
});
