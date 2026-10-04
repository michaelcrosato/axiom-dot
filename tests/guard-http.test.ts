import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleCoop} from '../server/coop-api.ts';
import {createState,createConnectedState,applyAction,validateSave,serializeSave,worldEndpoints,worldObjects} from '../src/world.ts';
import {causalPlan} from '../src/causal.ts';
import {worldHeight} from '../src/generation.ts';
import type {D1Database,D1Statement} from '../server/coop-store.ts';
import type {CoopSnapshot,CoopAction,CoopMove} from '../src/coop-protocol.ts';
import {CoopClient} from '../src/coop.ts';
import {createRoom,advanceRoom,joinRoom,syncRoom,snapshot} from '../server/coop-authority.ts';
import {CoopStore} from '../server/coop-store.ts';

/** Real SQLite + real TCP HTTP clients; production code has no test-auth bypass. */
function sqliteD1(db:DatabaseSync):D1Database{
  return {prepare(sql:string):D1Statement{
    let values:unknown[]=[];
    return {bind(...args:unknown[]){values=args;return this;},
      async first<T>(){return (db.prepare(sql).get(...values as never[])??null) as T|null;},
      async all<T>(){return {results:db.prepare(sql).all(...values as never[]) as T[]};},
      async run(){const result=db.prepare(sql).run(...values as never[]);return {success:true,meta:{changes:Number(result.changes)}};}};
  }};
}
async function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  for(const file of readdirSync(new URL('../drizzle',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8'));
  const DB=sqliteD1(sqlite);let now=1_800_000_000_000;let origin='';
  const server=createServer(async(req,res)=>{
    try{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk as Buffer);
      const headers=new Headers();for(const [k,v]of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
      const body=Buffer.concat(chunks).toString('utf8');const request=new Request(`${origin}${req.url}`,{method:req.method,headers,...(body?{body}:{})});
      const response=await handleCoop(request,{DB},now);res.writeHead(response?.status??404,Object.fromEntries(response?.headers??[]));res.end(await response?.text());
    }catch(e){res.writeHead(500);res.end(String(e));}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert(address&&typeof address==='object');origin=`http://127.0.0.1:${address.port}`;
  async function raw(user:string,path:string,body?:unknown,extra:Record<string,string>={}){
    const response=await fetch(`${origin}/api/coop${path}`,{method:body===undefined?'GET':'POST',headers:{'oai-authenticated-user-id':user,Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json(),headers:response.headers};
  }
  return {raw,origin,sqlite,DB,time:()=>now,advance:(ms:number)=>{now+=ms;},stop:async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));sqlite.close();}};
}
async function expedition(f:Awaited<ReturnType<typeof fixture>>,world=createState(73129),count=4){
  const created=await f.raw('host','/rooms',{name:'Host',world});assert.equal(created.status,201,JSON.stringify(created.body));
  const players=[{user:'host',s:created.body as CoopSnapshot}];
  for(let i=1;i<count;i++){const joined=await f.raw(`guest-${i}`,'/join',{name:`Guest ${i}`,code:created.body.code});assert.equal(joined.status,200,JSON.stringify(joined.body));players.push({user:`guest-${i}`,s:joined.body});}
  return players;
}
async function input(f:Awaited<ReturnType<typeof fixture>>,p:{user:string;s:CoopSnapshot},actions:CoopAction[]=[],move?:CoopMove){
  const response=await f.raw(p.user,`/rooms/${p.s.roomId}/sync`,{seq:p.s.ack+1,sessionId:p.s.sessionId,actions,...(move?{move}:{})});
  assert.equal(response.status,200,JSON.stringify(response.body));p.s=response.body;return p.s;
}

test('real authority blocks one correctly timed front sentry contact and exposes durable receipt',async()=>{
 const f=await fixture();try{
  const source=applyAction(createState(173),{type:'move',x:5,z:10}),[host]=await expedition(f,source,1);assert(host);
  f.advance(550);await input(f,host);const warning=host.s.world.encounters!.enemies.find(e=>e.id==='sentry-1')!;assert.equal(warning.phase,'prepare');
  await input(f,host,[{type:'guard-press',intentId:'front-timed'}]);assert.equal(host.s.guard.phase,'windup');assert.equal(host.s.combo.stamina,78);
  f.advance(250);await input(f,host);assert.equal(host.s.world.player.hp,100);assert.equal(host.s.guard.lastBlock?.enemyId,'sentry-1');assert.equal(host.s.guard.lastBlock?.id,1);assert.equal(host.s.guard.spent,true);assert.equal(host.s.guard.phase,'active');assert.equal(host.s.combo.phase,'idle','intercepted contact does not stun');assert.equal(host.s.combo.stamina,78);
  f.advance(500);await input(f,host);assert.equal(host.s.guard.phase,'idle');assert.equal(host.s.guard.lastBlock?.id,1);assert.equal(host.s.world.player.hp,100);assert.equal(host.s.combo.stamina,78);
  assert(validateSave(host.s.world));assert.equal(host.s.peers[0]!.guard.lastBlock?.id,1);
 }finally{await f.stop();}
});
test('late, early and rear guards leave real HTTP sentry damage intact',async()=>{
 const f=await fixture();try{
  for(const [name,start,facing] of [['early',0,0],['late',725,0],['rear',550,Math.PI]] as const){
   const world=applyAction(createState(179),{type:'move',x:5,z:10}),[host]=await expedition(f,world,1);assert(host);
   if(start){f.advance(start);await input(f,host);}
   await input(f,host,[{type:'guard-press',intentId:name}],{x:5,z:10,y:999,facing,grounded:true,crouched:false});
   f.advance(start===0?900:250);await input(f,host);assert.equal(host.s.world.player.hp,88,name);assert.equal(host.s.guard.lastBlock,null,name);assert.equal(host.s.guard.phase,'idle',name+' interrupts on actual damage');
  }
 }finally{await f.stop();}
});
test('guard, staff and jump command order shares one stamina balance and never manufactures protection',async()=>{
 const f=await fixture();try{
  const [host]=await expedition(f,createState(181),1);assert(host);
  await input(f,host,[{type:'guard-press',intentId:'guard-first'},{type:'attack-press'},{type:'jump-press',intentId:'jump-after-guard'}]);
  assert.equal(host.s.combo.stamina,78);assert.equal(host.s.combo.attackId,0);assert.equal(host.s.guard.phase,'idle');assert.equal(host.s.guard.receipt?.status,'accepted');assert.equal(host.s.guard.lastBlock,null);assert(host.s.guard.cooldownRemaining>1);assert(!host.s.motion.grounded);
  await input(f,host,[{type:'guard-press',intentId:'air-rejected'}]);assert.equal(host.s.guard.receipt?.reason,'airborne');assert.equal(host.s.combo.stamina,78);
  const [other]=await expedition(f,createState(191),1);assert(other);
  await input(f,other,[{type:'attack-press'},{type:'guard-press',intentId:'attack-first'}]);assert.equal(other.s.combo.stamina,86);assert.equal(other.s.guard.receipt?.reason,'busy');assert.equal(other.s.guard.castId,0);
 }finally{await f.stop();}
});
test('menu, crouch, zone and session interruptions retain guard expenditure/cooldown; stale lease denied',async()=>{
 const f=await fixture();try{
  let world=createState(193);world=applyAction(world,{type:'move',...worldEndpoints(world).entrance});const [host]=await expedition(f,world,1);assert(host);
  await input(f,host,[{type:'guard-press',intentId:'before-menu'},{type:'guard-cancel'}]);assert.equal(host.s.guard.phase,'idle');assert.equal(host.s.combo.stamina,78);const cooldown=host.s.guard.cooldownRemaining;
  await input(f,host,[{type:'enter'}]);assert.equal(host.s.world.zone,'dungeon');assert.equal(host.s.combo.stamina,78);assert.equal(host.s.guard.cooldownRemaining,cooldown);
  const oldSession=host.s.sessionId,resume=await f.raw('host',`/rooms/${host.s.roomId}/resume`,{});assert.equal(resume.status,200);host.s=resume.body;assert.equal(host.s.guard.cooldownRemaining,cooldown);assert.equal(host.s.combo.stamina,78);
  const stale=await f.raw('host',`/rooms/${host.s.roomId}/sync`,{seq:host.s.ack+1,sessionId:oldSession,actions:[{type:'guard-press',intentId:'stale'}]});assert.equal(stale.status,409);assert.equal(stale.body.error,'session_replaced');
  const [croucher]=await expedition(f,createState(197),1);assert(croucher);await input(f,croucher,[{type:'guard-press',intentId:'stand'}]);await input(f,croucher,[],{x:croucher.s.world.player.x,z:croucher.s.world.player.z,y:0,facing:0,grounded:true,crouched:true});assert.equal(croucher.s.guard.phase,'idle');assert.equal(croucher.s.combo.stamina,78);
 }finally{await f.stop();}
});
test('optional old room upgrades have no migration or free stamina; malformed persisted ability fails closed',async()=>{
 const f=await fixture();try{
  const [host]=await expedition(f,createState(199),1);assert(host);
  const stored=()=>JSON.parse(String(f.sqlite.prepare('SELECT body FROM axiom_coop_rooms WHERE id = ?').get(host.s.roomId)!.body));const old=stored();delete old.players[0].guard;old.players[0].combo.stamina=19;f.sqlite.prepare('UPDATE axiom_coop_rooms SET body = ? WHERE id = ?').run(JSON.stringify(old),host.s.roomId);
  await input(f,host,[{type:'guard-press',intentId:'old-depleted'}]);assert.equal(host.s.guard.receipt?.reason,'stamina');assert.equal(host.s.combo.stamina,19);assert.equal(host.s.guard.castId,0);
  const corrupt=stored();corrupt.players[0].guard.invincible=true;f.sqlite.prepare('UPDATE axiom_coop_rooms SET body = ? WHERE id = ?').run(JSON.stringify(corrupt),host.s.roomId);assert.equal((await f.raw('host',`/rooms/${host.s.roomId}`)).status,503);
 }finally{await f.stop();}
});
test('guard HTTP protocol rejects client protection/damage/clock/recipe claims',async()=>{
 const f=await fixture();try{
  const [host]=await expedition(f,createState(211),1);assert(host);
  for(const command of [{type:'guard-press',intentId:'x',blocked:true},{type:'guard-press',intentId:'x',damage:0},{type:'guard-press',intentId:'x',time:0},{type:'guard-press',intentId:'x',stamina:100},{type:'guard-press',intentId:'x',recipe:{active:999}},{type:'guard-cancel',refund:true}]){const r=await f.raw('host',`/rooms/${host.s.roomId}/sync`,{seq:host.s.ack+1,sessionId:host.s.sessionId,actions:[command]});assert.equal(r.status,400);}
 }finally{await f.stop();}
});
test('lost committed guard response retries exact sequence/session/intent once without second cost',async()=>{
 const f=await fixture();let client:CoopClient|undefined;try{
  const requests:unknown[]=[];let lost=false;const fetcher:typeof fetch=async(url,init)=>{const response=await fetch(url,{...init,headers:{...init?.headers,'oai-authenticated-user-id':'host',Origin:f.origin}});if(String(url).endsWith('/sync')){requests.push(JSON.parse(String(init?.body)));if(!lost&&response.ok){lost=true;client!.setSuspended(true);throw new Error('Lost successful guard response');}}return response;};
  client=new CoopClient({baseURL:f.origin,fetch:fetcher,onSnapshot:()=>{}});await client.create({name:'Host',seed:223});const intent=client.guard();assert(intent);assert.equal(client.guard(),null,'one outstanding guard avoids receipt ambiguity');
  const deadline=Date.now()+3000;while(!lost&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));assert(lost);assert.equal(client.pendingGuardIntent,intent);assert.equal(client.snapshot!.guard.castId,0);client.setSuspended(false);
  while(client.snapshot!.guard.receipt?.intentId!==intent&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));assert.equal(client.snapshot!.guard.receipt?.intentId,intent);assert.equal(client.pendingGuardIntent,null);assert.equal(client.snapshot!.combo.stamina,78);assert.equal(client.snapshot!.guard.castId,1);assert.deepEqual(requests[0],requests[1]);
  const server=await f.raw('host',`/rooms/${client.snapshot!.roomId}`);assert.equal(server.body.combo.stamina,78);assert.equal(server.body.guard.castId,1);
 }finally{client?.disconnect();await f.stop();}
});
test('guard queued behind in-flight sync survives old reply and gets bounded urgent flush',async()=>{
 const f=await fixture();let client:CoopClient|undefined;try{
  let release:()=>void=()=>{},arrived:()=>void=()=>{},first=true;const gate=new Promise<void>(r=>release=r),waiting=new Promise<void>(r=>arrived=r),observed:{pending:string|null;receipt:string|null}[]=[];
  const fetcher:typeof fetch=async(url,init)=>{const response=await fetch(url,{...init,headers:{...init?.headers,'oai-authenticated-user-id':'host',Origin:f.origin}});if(String(url).endsWith('/sync')&&first){first=false;arrived();await gate;}return response;};
  client=new CoopClient({baseURL:f.origin,fetch:fetcher,onSnapshot:s=>observed.push({pending:client?.pendingGuardIntent??null,receipt:s.guard.receipt?.intentId??null})});await client.create({name:'Host',seed:227});await waiting;
  const intent=client.guard();assert(intent);release();const deadline=Date.now()+2500;while(client.snapshot!.guard.receipt?.intentId!==intent&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
  assert(observed.some(s=>s.receipt===null&&s.pending===intent));assert.equal(client.snapshot!.guard.receipt?.status,'accepted');assert.equal(client.pendingGuardIntent,null);assert.equal(client.snapshot!.combo.stamina,78);
 }finally{client?.disconnect();await f.stop();}
});

test('host pause rejects guest guard with a receipt and resuming never revives an active field',async()=>{
 const f=await fixture();try{
  const [host,guest]=await expedition(f,createState(229),2);assert(host&&guest);await input(f,guest,[{type:'guard-press',intentId:'guest-cast'}]);assert.equal(guest.s.combo.stamina,78);
  await f.raw('host',`/rooms/${host.s.roomId}/leave`,{sessionId:host.s.sessionId});f.advance(9000);await input(f,guest,[{type:'guard-press',intentId:'while-paused'}]);assert.equal(guest.s.guard.phase,'idle');assert.equal(guest.s.guard.receipt?.reason,'paused');assert.equal(guest.s.combo.stamina,78);const cooldown=guest.s.guard.cooldownRemaining;assert(Math.abs(cooldown-1.87)<1e-9);
  const resume=await f.raw('host',`/rooms/${host.s.roomId}/resume`,{});assert.equal(resume.status,200);await input(f,guest);assert.equal(guest.s.guard.phase,'idle');assert.equal(guest.s.guard.cooldownRemaining,cooldown);assert.equal(guest.s.combo.stamina,78);assert.equal(guest.s.guard.lastBlock,null);
 }finally{await f.stop();}
});

test('unblocked online sentry contact applies the same short staff stun as solo while intercepted hits do not',async()=>{const f=await fixture();try{const source=applyAction(createState(173),{type:'move',x:5,z:10}),[host]=await expedition(f,source,1);assert(host);f.advance(800);await input(f,host);assert.equal(host.s.world.player.hp,88);assert.equal(host.s.combo.phase,'stunned');assert.ok(host.s.combo.stunRemaining>0&&host.s.combo.stunRemaining<=.22);const stamina=host.s.combo.stamina;await input(f,host,[{type:'attack-press'}]);assert.equal(host.s.combo.attackId,0);assert.equal(host.s.combo.stamina,stamina);f.advance(250);await input(f,host,[{type:'attack-press'}]);assert.equal(host.s.combo.attackId,1);assert.ok(host.s.combo.stamina<stamina);}finally{await f.stop();}});

test('host leave, timeout and session replacement cannot park guest guards without an intervening paused sync',async()=>{for(const mode of ['leave','timeout-resume','timeout-sync','active-resume','close'] as const){const f=await fixture();try{const players=await expedition(f,createState(239),4),host=players[0]!,guest=players[1]!;for(const p of players)await input(f,p,[{type:'guard-press',intentId:'pause-'+p.user}]);f.advance(150);await input(f,guest);assert.ok(guest.s.peers.every(p=>p.guard.phase==='active'));const cooldown=guest.s.guard.cooldownRemaining;assert.equal(guest.s.combo.stamina,78);if(mode==='leave'||mode==='close'){const result=await f.raw('host',`/rooms/${host.s.roomId}/${mode}`,{sessionId:host.s.sessionId});assert.equal(result.status,200);const durable=JSON.parse(String(f.sqlite.prepare('SELECT body FROM axiom_coop_rooms WHERE id = ?').get(host.s.roomId)!.body));assert.ok(durable.players.every((p:any)=>p.guard.phase==='idle'),'pause transaction itself clears every field');}f.advance(mode.startsWith('timeout')?9000:100);if(mode==='timeout-sync')await input(f,host);else{const resumed=await f.raw('host',`/rooms/${host.s.roomId}/resume`,{});assert.equal(resumed.status,200);host.s=resumed.body;}if(mode==='close'){const resumed=await f.raw(guest.user,`/rooms/${guest.s.roomId}/resume`,{});assert.equal(resumed.status,200);guest.s=resumed.body;}await input(f,guest);assert.equal(guest.s.guard.phase,'idle',mode);assert.equal(guest.s.guard.lastBlock,null,mode);assert.equal(guest.s.guard.cooldownRemaining,cooldown,mode);assert.equal(guest.s.combo.stamina,78,mode);assert.ok(guest.s.peers.every(p=>p.guard.phase==='idle'),mode);assert.ok(guest.s.peers.every(p=>p.combo.stamina===78),mode+' never refunds shared stamina');}finally{await f.stop();}}});
