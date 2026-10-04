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
test('four independent HTTP clients join one SQLite-backed room; fifth and unrelated accounts cannot read it',async()=>{
  const f=await fixture();try{
    const players=await expedition(f),room=players[0]!.s;
    assert.match(room.code,/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$/);
    const fifth=await f.raw('fifth','/join',{name:'Fifth',code:room.code});assert.equal(fifth.status,409);assert.equal(fifth.body.error,'room_full');
    const outsider=await f.raw('outsider',`/rooms/${room.roomId}`);assert.equal(outsider.status,404);
    const view=await f.raw('host',`/rooms/${room.roomId}`);assert.equal(view.body.peers.length,4);
    assert(!JSON.stringify(view.body).includes('userId'));assert(!JSON.stringify(view.body).includes('ownerId'));
    assert.equal(view.headers.get('cache-control'),'private, no-store');
    const saves=await f.raw('host','/rooms');assert.equal(saves.body.rooms.length,1);
    assert.equal((await f.raw('guest-1','/rooms')).body.rooms.length,0);
  }finally{await f.stop();}
});
test('concurrent collection, repeated requests and old sequence replay never duplicate inventory',async()=>{
  const f=await fixture();try{
    const world=applyAction(createState(7),{type:'move',x:-9,z:8}),solo=serializeSave(world),players=await expedition(f,world);
    const posts=await Promise.all(players.map(p=>input(f,p,[{type:'collect',id:'scrap-1'}])));
    const current=await f.raw('host',`/rooms/${posts[0]!.roomId}`);assert.equal(current.body.world.inventory.scrap,1);assert.equal(current.body.world.collected.filter((id:string)=>id==='scrap-1').length,1);assert(validateSave(current.body.world));
    const p=players[0]!;const replay=await f.raw(p.user,`/rooms/${p.s.roomId}/sync`,{seq:p.s.ack,sessionId:p.s.sessionId,actions:[{type:'collect',id:'scrap-2'}]});assert.equal(replay.status,200);assert.equal(replay.body.world.inventory.scrap,1);
    assert.equal(serializeSave(world),solo,'hosting is a copy and never mutates the source solo state');
  }finally{await f.stop();}
});
test('simultaneous construction spends shared stock once and applies exactly one placement',async()=>{
  const f=await fixture();try{
    let world=createState(9);world=applyAction(world,{type:'move',x:-9,z:8});world=applyAction(world,{type:'collect',id:'scrap-1'});world=applyAction(world,{type:'move',x:-13,z:13});
    const players=await expedition(f,world);
    await Promise.all(players.map(p=>input(f,p,[{type:'build',command:{type:'place',kind:'pipe',x:-11,z:9,id:'shared-pipe'}}])));
    const current=await f.raw('host',`/rooms/${players[0]!.s.roomId}`);assert.equal(current.body.world.waterworks.parts.length,1);assert.equal(current.body.world.inventory.scrap,0);assert(validateSave(current.body.world));
  }finally{await f.stop();}
});
test('host disconnect pauses authority; saved room resumes; stale browser lease loses control',async()=>{
  const f=await fixture();try{
    const players=await expedition(f),host=players[0]!,guest=players[1]!;
    const leave=await f.raw('host',`/rooms/${host.s.roomId}/leave`,{sessionId:host.s.sessionId});assert.equal(leave.status,200);
    f.advance(20000);const waiting=await input(f,guest,[{type:'accept'}]);assert(waiting.paused);assert.equal(waiting.world.jobAccepted,false);
    const resume=await f.raw('host',`/rooms/${host.s.roomId}/resume`,{});assert.equal(resume.status,200);assert(!resume.body.paused);
    const stale=await f.raw('host',`/rooms/${host.s.roomId}/sync`,{seq:host.s.ack+1,sessionId:host.s.sessionId,actions:[]});assert.equal(stale.status,409);assert.equal(stale.body.error,'session_replaced');
    host.s=resume.body;f.advance(250);await input(f,host);assert(!host.s.paused);
    const close=await f.raw('host',`/rooms/${host.s.roomId}/close`,{sessionId:host.s.sessionId});assert.equal(close.status,200);assert(close.body.closed);
    assert.equal((await f.raw('new','/join',{name:'New',code:host.s.code})).status,410);
    const saved=await f.raw('host',`/rooms/${host.s.roomId}/resume`,{});assert.equal(saved.status,200);assert.notEqual(saved.body.code,host.s.code);assert(validateSave(saved.body.world));
  }finally{await f.stop();}
});
test('server rejects raw kills, client time, malformed commands, cross-origin requests and oversize data',async()=>{
  const f=await fixture();try{
    const [host]=await expedition(f,createState(1),1);assert(host);
    for(const command of [{type:'attack',id:'sentry-1'},{type:'tick',dt:999},{type:'build',command:{type:'place',kind:'__proto__',x:0,z:0}},{type:'collect',id:'scrap-1',inventory:{scrap:999}}]){
      const result=await f.raw('host',`/rooms/${host.s.roomId}/sync`,{seq:1,sessionId:host.s.sessionId,actions:[command]});assert.equal(result.status,400);
    }
    assert.equal((await f.raw('',`/rooms/${host.s.roomId}`)).status,401);
    assert.equal((await f.raw('host','/rooms',{name:'X',seed:1},{Origin:'https://evil.invalid'})).status,403);
    assert.equal((await f.raw('host','/rooms',{name:'x'.repeat(200000),seed:1})).status,413);
    const forged=await f.raw('host',`/rooms/${host.s.roomId}/sync`,{seq:1,sessionId:host.s.sessionId,actions:[],move:{x:9999,z:9999,y:9999,facing:0,grounded:true,crouched:false}});assert.equal(forged.status,400);
    f.advance(250);const before={...host.s.world.player};await input(f,host,[],{x:999,z:999,y:0,facing:0,grounded:true,crouched:false});assert(Math.hypot(host.s.world.player.x-before.x,host.s.world.player.z-before.z)<=3.36);
  }finally{await f.stop();}
});
test('four polling clients advance one shared simulation clock and room data survives independent requests',async()=>{
  const f=await fixture();try{
    const players=await expedition(f),before=players[0]!.s.world.encounters!.step;
    f.advance(250);await Promise.all(players.map(p=>input(f,p)));
    const current=await f.raw('guest-2',`/rooms/${players[0]!.s.roomId}`);
    assert.equal(current.body.world.encounters.step-before,15,'4 peers must not multiply time by four');
    const rows=f.sqlite.prepare('SELECT body FROM axiom_coop_rooms').all();assert.equal(rows.length,1);assert.equal(JSON.parse(String(rows[0]!.body)).revision,7);
    const host=players[0]!;const closedByGuest=await f.raw('guest-1',`/rooms/${host.s.roomId}/close`,{sessionId:players[1]!.s.sessionId});assert.equal(closedByGuest.status,403);
  }finally{await f.stop();}
});
test('join slots expire after reconnect grace, owner slot stays reserved, rooms are isolated',async()=>{
  const f=await fixture();try{
    const players=await expedition(f),room=players[0]!.s;
    f.advance(61000);
    const fifth=await f.raw('fifth','/join',{name:'Fifth',code:room.code});assert.equal(fifth.status,200);assert.equal(fifth.body.peers.length,2);assert(fifth.body.peers.some((p:{host:boolean})=>p.host));
    const other=await f.raw('other-host','/rooms',{name:'Other',seed:5});assert.equal(other.status,201);assert.notEqual(other.body.roomId,room.roomId);assert.notEqual(other.body.code,room.code);
    assert.equal((await f.raw('fifth',`/rooms/${other.body.roomId}`)).status,404);
  }finally{await f.stop();}
});
test('per-identity request budget bounds write pressure and recovers in the next window',async()=>{
  const f=await fixture();try{
    const [host]=await expedition(f,createState(2),1);assert(host);
    let limited=false;
    for(let i=0;i<95;i++){const result=await f.raw('host',`/rooms/${host.s.roomId}/sync`,{seq:1,sessionId:host.s.sessionId,actions:[]});if(result.status===429){limited=true;break;}}
    assert(limited);f.advance(10000);assert.equal((await f.raw('host',`/rooms/${host.s.roomId}/sync`,{seq:2,sessionId:host.s.sessionId,actions:[]})).status,200);
  }finally{await f.stop();}
});
test('players in different zones still advance exactly one encounter clock',async()=>{
  const f=await fixture();try{
    let source=createState(13);source=applyAction(source,{type:'move',...worldEndpoints(source).entrance});
    const players=await expedition(f,source);await input(f,players[1]!,[{type:'enter'}]);assert.equal(players[1]!.s.world.zone,'dungeon');
    const before=players[1]!.s.world.encounters!.step;f.advance(250);await Promise.all(players.map(p=>input(f,p)));
    const host=await f.raw('host',`/rooms/${players[0]!.s.roomId}`),guest=await f.raw('guest-1',`/rooms/${players[0]!.s.roomId}`);
    assert.equal(host.body.world.zone,'valley');assert.equal(guest.body.world.zone,'dungeon');assert.equal(host.body.world.encounters.step-before,15);assert.equal(guest.body.world.encounters.step-before,15);
  }finally{await f.stop();}
});
test('shared combat resolves server-side timed hits from four clients, with one final defeat',async()=>{
  const f=await fixture();try{
    const source=applyAction(createState(17),{type:'move',x:5,z:10}),players=await expedition(f,source);
    await Promise.all(players.map(p=>input(f,p,[{type:'attack-press'}])));
    assert.equal(players[0]!.s.world.encounters!.enemies.find(e=>e.id==='sentry-1')!.hp,100,'pressing does not declare an immediate hit');
    f.advance(200);await Promise.all(players.map(p=>input(f,p)));
    const hit=await f.raw('host',`/rooms/${players[0]!.s.roomId}`);assert.equal(hit.body.enemyHP['sentry-1'],4);assert(!hit.body.world.defeated.includes('sentry-1'));
    const host=players[0]!;const replay=await f.raw('host',`/rooms/${host.s.roomId}/sync`,{seq:1,sessionId:host.s.sessionId,actions:[{type:'attack-press'}]});assert.equal(replay.body.enemyHP['sentry-1'],4);
    f.advance(400);await Promise.all(players.map(p=>input(f,p,[{type:'attack-press'}])));f.advance(200);await Promise.all(players.map(p=>input(f,p)));
    const final=await f.raw('host',`/rooms/${host.s.roomId}`);assert.equal(final.body.enemyHP['sentry-1'],0);assert.equal(final.body.world.defeated.filter((id:string)=>id==='sentry-1').length,1);assert(validateSave(final.body.world));
  }finally{await f.stop();}
});
test('flooding movement packets cannot create elapsed time or free displacement',async()=>{
  const f=await fixture();try{
    const [host]=await expedition(f,createState(23),1);assert(host);const start={...host.s.world.player};
    for(let i=0;i<12;i++)await input(f,host,[],{x:start.x+30,z:start.z,y:worldHeight(host.s.world,start.x,start.z),facing:0,grounded:true,crouched:false});
    assert.equal(host.s.world.player.x,start.x);assert.equal(host.s.world.player.z,start.z);
    f.advance(250);await input(f,host,[],{x:start.x+30,z:start.z,y:0,facing:0,grounded:true,crouched:false});assert(Math.abs(host.s.world.player.x-start.x)<=3.000001);
  }finally{await f.stop();}
});
test('browser transport retries a lost successful response with identical sequence and input',async()=>{
  const f=await fixture();let client:CoopClient|undefined;
  try{
    const requests:{seq:number;actions:unknown[]}[]=[],statuses:string[]=[];let lost=false;
    const fetcher:typeof fetch=async(url,init)=>{
      const response=await fetch(url,{...init,headers:{...init?.headers,'oai-authenticated-user-id':'host',Origin:f.origin}});
      if(String(url).endsWith('/sync')){
        requests.push(JSON.parse(String(init?.body)));
        if(!lost&&response.ok){lost=true;client!.setSuspended(true);throw new Error('Simulated network loss after successful server commit');}
      }
      return response;
    };
    client=new CoopClient({baseURL:f.origin,fetch:fetcher,onSnapshot:()=>{},onStatus:s=>statuses.push(s)});
    const source=applyAction(createState(29),{type:'move',x:-9,z:8});await client.create({name:'Host',world:source});
    assert(client.send({type:'collect',id:'scrap-1'}));
    while(!lost)await new Promise(resolve=>setTimeout(resolve,10));
    await new Promise(resolve=>setTimeout(resolve,650));assert.equal(requests.length,1,'suspension stops retry heartbeats');assert.equal(client.canAct,false);client.setSuspended(false);
    const deadline=Date.now()+4000;while(client.snapshot?.world.inventory.scrap!==1&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(client.snapshot?.world.inventory.scrap,1);assert(requests.length>=2);assert.deepEqual(requests[0],requests[1]);assert(statuses.includes('reconnecting'));assert(client.canAct);
    assert.equal((await f.raw('host',`/rooms/${client.snapshot!.roomId}`)).body.world.inventory.scrap,1);
    await client.leave();assert.equal(client.active,false);assert.equal(client.status,'offline');
  }finally{client?.disconnect();await f.stop();}
});
test('suspension clears unsent movement/actions, lets host lease expire, and resumes with a fresh heartbeat',async()=>{
  const f=await fixture();let client:CoopClient|undefined;try{
    const sent:Record<string,unknown>[]=[];const fetcher:typeof fetch=async(url,init)=>{if(String(url).endsWith('/sync'))sent.push(JSON.parse(String(init?.body)));return fetch(url,{...init,headers:{...init?.headers,'oai-authenticated-user-id':'host',Origin:f.origin}});};
    client=new CoopClient({baseURL:f.origin,fetch:fetcher,onSnapshot:()=>{}});
    await client.create({name:'Host',world:applyAction(createState(43),{type:'move',x:-9,z:8})});
    const room=client.snapshot!;assert(client.move({x:-5,z:8,y:0,facing:0,grounded:true,crouched:false}));assert(client.send({type:'collect',id:'scrap-1'}));client.setSuspended(true);
    const joined=await f.raw('guest','/join',{name:'Guest',code:room.code});assert.equal(joined.status,200);
    await new Promise(resolve=>setTimeout(resolve,350));assert.equal(sent.length,0);assert.equal(client.canAct,false);
    f.advance(9000);const guest={user:'guest',s:joined.body};const waiting=await input(f,guest);assert.equal(waiting.paused,true);
    client.setSuspended(false);const deadline=Date.now()+2000;while(!client.canAct&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));assert(client.canAct);
    assert.deepEqual(sent[0]!.actions,[]);assert(!Object.hasOwn(sent[0]!,'move'));assert.equal(client.snapshot!.world.inventory.scrap,0);assert.equal(client.snapshot!.world.player.x,-9);
  }finally{client?.disconnect();await f.stop();}
});
test('shared online economy initializes automatically, validates intents and conserves concurrent commissions',async()=>{
  const f=await fixture();try{
    let source=createConnectedState(73129);for(const o of worldObjects(source).filter(o=>o.kind==='scrap').slice(0,2)){source=applyAction(source,{type:'move',x:o.x,z:o.z});source=applyAction(source,{type:'collect',id:o.id});}
    const plan=causalPlan(source.seed),place=plan.workplaces.find(w=>plan.agents.some(a=>a.workplaceId===w.id)&&source.causal!.workplaces.find(c=>c.id===w.id)!.operational)!;assert(place);source=applyAction(source,{type:'move',...place.position});
    const players=await expedition(f,source,2);assert(players[0]!.s.world.economy);assert.equal(players[0]!.s.world.inventory.scrap,2);
    await Promise.all(players.map(p=>input(f,p,[{type:'economy',command:{type:'commission-kit',workplaceId:place.id}}])));
    const current=await f.raw('host',`/rooms/${players[0]!.s.roomId}`);assert.equal(current.body.world.inventory.scrap,0);assert.equal(current.body.world.economy.records.filter((r:{kind:string})=>r.kind==='commissioned').length,1);assert.equal(current.body.world.economy.workshops.find((w:{id:string})=>w.id===place.id).feedstock,2);assert(validateSave(current.body.world));
    f.advance(250);await Promise.all(players.map(p=>input(f,p)));const advanced=await f.raw('host',`/rooms/${players[0]!.s.roomId}`);assert.equal(advanced.body.world.economy.elapsed,advanced.body.world.causal.elapsed);assert.equal(advanced.body.world.economy.elapsed,.25);
    for(const command of [{type:'collect-kit',workplaceId:place.id},{type:'recycle-kit',workplaceId:place.id},{type:'repair-press',incidentId:'missing'}]){const host=players[0]!;await input(f,host,[{type:'economy',command} as CoopAction]);}
    const invalid=await f.raw('host',`/rooms/${players[0]!.s.roomId}/sync`,{seq:players[0]!.s.ack+1,sessionId:players[0]!.s.sessionId,actions:[{type:'economy',command:{type:'commission-kit',workplaceId:place.id,scrap:-999}}]});assert.equal(invalid.status,400);
  }finally{await f.stop();}
});
test('authoritative movement cannot use a cosmetic jump to cross a low constructed pipe',async()=>{
  const f=await fixture();try{
    let source=createState(47);source=applyAction(source,{type:'move',x:-9,z:8});source=applyAction(source,{type:'collect',id:'scrap-1'});source=applyAction(source,{type:'move',x:-13,z:13});source=applyAction(source,{type:'build',command:{type:'place',kind:'pipe',x:-11,z:9,id:'blocking-pipe'}});assert.equal(source.waterworks.parts.length,1);source=applyAction(source,{type:'move',x:-11,z:6});
    const [host]=await expedition(f,source,1);assert(host);f.advance(500);await input(f,host,[],{x:-11,z:12,y:4,facing:0,grounded:false,crouched:false});assert.equal(host.s.world.player.z,6);assert.equal(host.s.world.player.x,-11);
    f.advance(500);await input(f,host,[],{x:-11,z:12,y:0,facing:0,grounded:true,crouched:true});assert.equal(host.s.world.player.z,6);
  }finally{await f.stop();}
});
test('an invited guest can finish reload bootstrap without gaining host room-management authority',async()=>{
  const f=await fixture();try{
    const [host,guest]=await expedition(f,createState(53),2);assert(host&&guest);const code=host.s.code;
    const resumed=await f.raw(guest.user,`/rooms/${guest.s.roomId}/resume`,{});assert.equal(resumed.status,200);assert.equal(resumed.body.selfId,guest.s.selfId);assert.notEqual(resumed.body.sessionId,guest.s.sessionId);assert.equal(resumed.body.hostId,host.s.selfId);assert.equal(resumed.body.code,code);
    assert.equal((await f.raw(guest.user,`/rooms/${guest.s.roomId}/close`,{sessionId:resumed.body.sessionId})).status,403);
    assert.equal((await f.raw('outsider',`/rooms/${guest.s.roomId}/resume`,{})).status,404);
    await f.raw('host',`/rooms/${host.s.roomId}/close`,{sessionId:host.s.sessionId});const closed=await f.raw(guest.user,`/rooms/${guest.s.roomId}/resume`,{});assert.equal(closed.status,410);
  }finally{await f.stop();}
});
test('stale host tabs cannot leave or close a replacement browser lease',async()=>{
  const f=await fixture();try{
    const [host]=await expedition(f,createState(59),1);assert(host);const oldSession=host.s.sessionId;
    const resumed=await f.raw('host',`/rooms/${host.s.roomId}/resume`,{});assert.equal(resumed.status,200);host.s=resumed.body;assert.notEqual(host.s.sessionId,oldSession);
    for(const operation of ['leave','close']){
      const stale=await f.raw('host',`/rooms/${host.s.roomId}/${operation}`,{sessionId:oldSession});assert.equal(stale.status,409);assert.equal(stale.body.error,'session_replaced');
      f.advance(250);await input(f,host);assert.equal(host.s.paused,false);assert.equal(host.s.closed,false);assert.equal(host.s.peers.find(p=>p.id===host.s.selfId)!.connected,true);
    }
    for(const operation of ['leave','close'])assert.equal((await f.raw('host',`/rooms/${host.s.roomId}/${operation}`,{})).status,400,'missing session cannot affect active room');
    const close=await f.raw('host',`/rooms/${host.s.roomId}/close`,{sessionId:host.s.sessionId});assert.equal(close.status,200);assert.equal(close.body.closed,true);
  }finally{await f.stop();}
});
test('direct authority clocks do not regress or double-count out-of-order timestamps',()=>{
  const origin=1_800_000_000_000;
  const chronological=createRoom('host','Host',createConnectedState(73129),origin),reordered=createRoom('host','Host',createConnectedState(73129),origin);
  for(const [room,times]of [[chronological,[100,200,300]],[reordered,[200,100,300]]] as const){
    const host=room.players[0]!;for(const [i,t]of times.entries())syncRoom(room,'host',{seq:i+1,sessionId:host.sessionId,actions:[]},origin+t);
  }
  assert.equal(reordered.world.encounters!.step,18);assert.equal(reordered.world.encounters!.step,chronological.world.encounters!.step);
  assert(Math.abs(reordered.world.causal!.accumulator-chronological.world.causal!.accumulator)<1e-9);assert(Math.abs(reordered.world.causal!.accumulator-.05)<1e-9);
  assert.equal(reordered.lastTick,origin+300);assert.equal(reordered.players[0]!.lastSeen,origin+300);
  advanceRoom(reordered,origin+50);assert.equal(reordered.lastTick,origin+300);
  joinRoom(reordered,'guest','Guest',origin+500);const guest=reordered.players.find(p=>p.userId==='guest')!;joinRoom(reordered,'guest','Guest',origin+10);assert.equal(guest.lastSeen,origin+500);assert.equal(guest.lastMove,origin+500);
  joinRoom(reordered,'host','Host',origin+20);assert.equal(reordered.lastTick,origin+500);assert.equal(reordered.players[0]!.lastSeen,origin+500);assert.equal(snapshot(reordered,'host',origin+1).serverTime,origin+500);
});
test('an older request forced through a D1 CAS conflict cannot rewind committed simulation time',async()=>{
  const f=await fixture();try{
    const [host,guest]=await expedition(f,createConnectedState(73129),2);assert(host&&guest);const start=f.time();
    let unblock:()=>void=()=>{},reached:()=>void=()=>{},block=true;const gate=new Promise<void>(resolve=>{unblock=resolve;}),waiting=new Promise<void>(resolve=>{reached=resolve;});
    const delayed:D1Database={prepare(sql){const original=f.DB.prepare(sql);const proxy:D1Statement={bind(...values){original.bind(...values);return proxy;},first:()=>original.first(),all:()=>original.all(),async run(){if(block&&sql.startsWith('UPDATE axiom_coop_rooms')){block=false;reached();await gate;}return original.run();}};return proxy;}};
    const request=(p:typeof host,seq:number)=>new Request(`${f.origin}/api/coop/rooms/${p.s.roomId}/sync`,{method:'POST',headers:{'oai-authenticated-user-id':p.user,Origin:f.origin,'Content-Type':'application/json'},body:JSON.stringify({seq,sessionId:p.s.sessionId,actions:[]})});
    const older=handleCoop(request(guest,1),{DB:delayed},start+100);await waiting;
    const newer=await handleCoop(request(host,1),{DB:f.DB},start+200);assert.equal(newer!.status,200);unblock();
    const late=await older;assert.equal(late!.status,200);const lateBody=await late!.json() as CoopSnapshot;assert.equal(lateBody.serverTime,start+200);assert.equal(lateBody.world.encounters!.step,12);
    const final=await handleCoop(request(host,2),{DB:f.DB},start+300);assert.equal(final!.status,200);const finalBody=await final!.json() as CoopSnapshot;assert.equal(finalBody.world.encounters!.step,18);assert(Math.abs(finalBody.world.causal!.accumulator-.05)<1e-9);
    const row=f.sqlite.prepare('SELECT updated_at, body FROM axiom_coop_rooms WHERE id = ?').get(host.s.roomId)!;const room=JSON.parse(String(row.body));assert.equal(row.updated_at,start+300);assert.equal(room.updatedAt,start+300);assert.equal(room.lastTick,start+300);assert.equal(room.players.find((p:{userId:string})=>p.userId===guest.user).lastSeen,start+200);
  }finally{await f.stop();}
});
test('join, resume, leave, close and snapshot timestamps remain monotonic after a delayed request',async()=>{
  const f=await fixture();try{
    const [host]=await expedition(f,createState(61),1);assert(host);const start=f.time();f.advance(500);await input(f,host,[],{x:host.s.world.player.x,z:host.s.world.player.z,y:0,facing:0,grounded:true,crouched:false});
    f.advance(-400);const guest=await f.raw('guest','/join',{name:'Guest',code:host.s.code});assert.equal(guest.status,200);assert.equal(guest.body.serverTime,start+500);
    for(const op of ['resume','leave','resume','close','resume'] as const){
      f.advance(-10);const response=await f.raw('host',`/rooms/${host.s.roomId}/${op}`,op==='resume'?{}:{sessionId:host.s.sessionId});assert.equal(response.status,200);host.s=response.body;assert.equal(host.s.serverTime,start+500);
      const row=f.sqlite.prepare('SELECT updated_at, body FROM axiom_coop_rooms WHERE id = ?').get(host.s.roomId)!;const room=JSON.parse(String(row.body));assert.equal(row.updated_at,start+500);assert.equal(room.updatedAt,start+500);assert.equal(room.lastTick,start+500);for(const p of room.players){assert(p.lastSeen>=start+500);assert(p.lastMove>=start+500);}
    }
    assert.equal(host.s.inviteExpiresAt,start+500+24*60*60*1000);
  }finally{await f.stop();}
});
test('an old delayed rate window cannot reset a newer request budget',async()=>{
  const f=await fixture();try{
    const store=new CoopStore(f.DB),start=f.time();assert(await store.allowRequest('clock-user',start+20000));assert(await store.allowRequest('clock-user',start+10000));
    let row=f.sqlite.prepare('SELECT window, requests FROM axiom_coop_rate WHERE user_id = ?').get('clock-user')!;assert.equal(row.window,Math.floor((start+20000)/10000));assert.equal(row.requests,2);
    for(let i=0;i<88;i++)assert(await store.allowRequest('clock-user',start));assert.equal(await store.allowRequest('clock-user',start),false);
    row=f.sqlite.prepare('SELECT window, requests FROM axiom_coop_rate WHERE user_id = ?').get('clock-user')!;assert.equal(row.window,Math.floor((start+20000)/10000));assert.equal(row.requests,91);
    assert(await store.allowRequest('clock-user',start+30000));assert.equal(f.sqlite.prepare('SELECT requests FROM axiom_coop_rate WHERE user_id = ?').get('clock-user')!.requests,1);
  }finally{await f.stop();}
});
test('four authoritative jumps share one clock, ignore fake height, and land without replay impulses',async()=>{
  const f=await fixture();try{
    const players=await expedition(f,createState(67));await Promise.all(players.map((p,i)=>input(f,p,[{type:'jump-press',intentId:`jump-${i}`}])));
    for(const p of players){assert.equal(p.s.motion.vy,6.6);assert.equal(p.s.motion.grounded,false);assert.equal(p.s.motion.jumpId,1);}
    f.advance(250);await Promise.all(players.map(p=>input(f,p,[],{x:p.s.world.player.x,z:p.s.world.player.z,y:999,facing:0,grounded:true,crouched:false})));
    const height=players[0]!.s.motion.feetY;assert(height>1&&height<1.1);for(const p of players){assert.equal(p.s.world.encounters!.step,15);assert.equal(p.s.motion.feetY,height);assert.equal(p.s.peers.find(q=>q.id===p.s.selfId)!.pose.y,height);}
    const host=players[0]!;const replay=await f.raw('host',`/rooms/${host.s.roomId}/sync`,{seq:1,sessionId:host.s.sessionId,actions:[{type:'jump-press',intentId:'jump-0'}]});assert.equal(replay.body.motion.jumpId,1);assert.equal(replay.body.motion.vy,host.s.motion.vy);
    f.advance(1000);await Promise.all(players.map(p=>input(f,p)));for(const p of players){assert.equal(p.s.motion.grounded,true);assert.equal(p.s.motion.feetY,0);assert.equal(p.s.motion.vy,0);assert.equal(p.s.motion.jumpId,1);assert.equal(p.s.motion.landingId,1);}
    await input(f,host,[{type:'jump-press',intentId:'jump-0'}]);assert.equal(host.s.motion.jumpId,1,'repeating the same processed intent in a fresh sequence cannot relaunch');assert(host.s.motion.grounded);
  }finally{await f.stop();}
});
test('real online jump clears a low constructed pipe; height spoofing alone still cannot',async()=>{
  const f=await fixture();try{
    let source=createState(71);source=applyAction(source,{type:'move',x:-9,z:8});source=applyAction(source,{type:'collect',id:'scrap-1'});source=applyAction(source,{type:'move',x:-13,z:13});source=applyAction(source,{type:'build',command:{type:'place',kind:'pipe',x:-11,z:9,id:'jump-pipe'}});source=applyAction(source,{type:'move',x:-11,z:7.5});
    const [host]=await expedition(f,source,1);assert(host);await input(f,host,[{type:'jump-press',intentId:'pipe-hop'}]);f.advance(250);
    await input(f,host,[],{x:-11,z:10.5,y:0,facing:0,grounded:true,crouched:false});assert.equal(host.s.world.player.z,10.5);assert(host.s.motion.feetY>.9);assert.equal(host.s.motion.grounded,false);
    f.advance(1000);await input(f,host);assert(host.s.motion.grounded);assert.equal(host.s.world.player.z,10.5);assert.equal(host.s.motion.feetY,0);
  }finally{await f.stop();}
});
test('timed online jump evades a low enemy strike while a forged airborne pose does not',async()=>{
  const f=await fixture();try{
    const source=applyAction(createState(73),{type:'move',x:5,z:10}),[jumper]=await expedition(f,source,1),[forger]=await expedition(f,source,1);assert(jumper&&forger);
    f.advance(500);await input(f,jumper);await input(f,forger);assert.equal(jumper.s.world.encounters!.enemies.find(e=>e.id==='sentry-1')!.phase,'prepare');
    await input(f,jumper,[{type:'jump-press',intentId:'dodge-warning'}]);await input(f,forger,[],{x:5,z:10,y:4,facing:0,grounded:false,crouched:false});assert.equal(forger.s.motion.feetY,0);
    f.advance(450);await input(f,jumper);await input(f,forger);assert.equal(jumper.s.world.player.hp,100);assert.equal(forger.s.world.player.hp,88);assert(jumper.s.motion.feetY>.85);
  }finally{await f.stop();}
});
test('airborne room pause/resume preserves velocity without offline gravity or automatic repeated launch',async()=>{
  const f=await fixture();try{
    const [host]=await expedition(f,createState(79),1);assert(host);await input(f,host,[{type:'jump-press',intentId:'pause-hop'}]);f.advance(200);await input(f,host);const before={...host.s.motion};
    const leave=await f.raw('host',`/rooms/${host.s.roomId}/leave`,{sessionId:host.s.sessionId});assert.equal(leave.status,200);f.advance(10000);
    const paused=await f.raw('host',`/rooms/${host.s.roomId}`);assert.equal(paused.body.motion.feetY,before.feetY);assert.equal(paused.body.motion.vy,before.vy);assert(paused.body.paused);
    const resume=await f.raw('host',`/rooms/${host.s.roomId}/resume`,{});assert.equal(resume.status,200);host.s=resume.body;assert.equal(host.s.motion.feetY,before.feetY);f.advance(1000);await input(f,host);assert(host.s.motion.grounded);assert.equal(host.s.motion.jumpId,1);
  }finally{await f.stop();}
});
test('zone changes reset authoritative vertical motion and older room records upgrade safely',async()=>{
  const f=await fixture();try{
    let source=createState(83);source=applyAction(source,{type:'move',...worldEndpoints(source).entrance});const [host]=await expedition(f,source,1);assert(host);
    const row=f.sqlite.prepare('SELECT body FROM axiom_coop_rooms WHERE id = ?').get(host.s.roomId)!;const old=JSON.parse(String(row.body));for(const p of old.players){delete p.motion;p.pose.y=500;p.pose.grounded=false;}f.sqlite.prepare('UPDATE axiom_coop_rooms SET body = ? WHERE id = ?').run(JSON.stringify(old),host.s.roomId);
    const restored=await f.raw('host',`/rooms/${host.s.roomId}`);assert.equal(restored.body.motion.feetY,0);assert.equal(restored.body.motion.vy,0);assert.equal(restored.body.motion.grounded,true);
    await input(f,host,[{type:'jump-press',intentId:'threshold-hop'},{type:'enter'}]);assert.equal(host.s.world.zone,'dungeon');assert.equal(host.s.motion.feetY,0);assert.equal(host.s.motion.vy,0);assert.equal(host.s.motion.grounded,true);assert.equal(host.s.motion.lastJumpIntent,'threshold-hop');
    const bad=await f.raw('host',`/rooms/${host.s.roomId}/sync`,{seq:host.s.ack+1,sessionId:host.s.sessionId,actions:[{type:'jump-press',intentId:'bad-hop',vy:100}]});assert.equal(bad.status,400);
  }finally{await f.stop();}
});
test('jump queued behind an in-flight sync retains its receipt until the server processes the edge',async()=>{
  const f=await fixture();let client:CoopClient|undefined;try{
    let release:()=>void=()=>{},arrived:()=>void=()=>{},first=true;const gate=new Promise<void>(r=>{release=r;}),waiting=new Promise<void>(r=>{arrived=r;});const observed:{receipt:string|null;pending:string|null}[]=[];
    const fetcher:typeof fetch=async(url,init)=>{const response=await fetch(url,{...init,headers:{...init?.headers,'oai-authenticated-user-id':'host',Origin:f.origin}});if(String(url).endsWith('/sync')&&first){first=false;arrived();await gate;}return response;};
    client=new CoopClient({baseURL:f.origin,fetch:fetcher,onSnapshot:s=>observed.push({receipt:s.motion.lastJumpIntent,pending:client?.pendingJumpIntent??null})});await client.create({name:'Host',seed:89});await waiting;
    const intent=client.jump();assert(intent);assert.equal(client.pendingJumpIntent,intent);release();const deadline=Date.now()+2500;while(client.snapshot!.motion.lastJumpIntent!==intent&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
    assert(observed.some(s=>s.receipt===null&&s.pending===intent),'pre-jump reply must not clear queued receipt');assert.equal(client.snapshot!.motion.lastJumpIntent,intent);assert.equal(client.snapshot!.motion.jumpStatus,'launched');assert.equal(client.snapshot!.motion.jumpId,1);assert.equal(client.pendingJumpIntent,null);
  }finally{client?.disconnect();await f.stop();}
});
test('connected world and independent cave entry preserve the shared water ledger and other players',async()=>{
  const f=await fixture();try{
    let source=createConnectedState(73129);source=applyAction(source,{type:'move',...worldEndpoints(source).entrance});
    const players=await expedition(f,source),guest=players[1]!;
    await input(f,guest,[{type:'enter-cave'}]);assert.equal(guest.s.world.zone,'cave');assert(guest.s.world.caveWater);
    const start=guest.s.world.caveWater.elapsed;f.advance(250);await Promise.all(players.map(p=>input(f,p)));
    const host=await f.raw('host',`/rooms/${guest.s.roomId}`),cave=await f.raw('guest-1',`/rooms/${guest.s.roomId}`);
    assert.equal(host.body.world.zone,'valley');assert.equal(cave.body.world.zone,'cave');assert.equal(cave.body.world.caveWater.elapsed-start,.25);assert(validateSave(cave.body.world));assert(validateSave(host.body.world));
    assert.equal(host.body.world.caveWater.extracted,cave.body.world.caveWater.extracted);
    assert(Buffer.byteLength(JSON.stringify(cave.body))<196608,'one authoritative snapshot stays under the request-size budget');
  }finally{await f.stop();}
});
test('expired invitation cannot admit a new account; owner can reopen the durable save with a new code',async()=>{
  const f=await fixture();try{
    const [host]=await expedition(f,createState(31),1);assert(host);const code=host.s.code;
    f.advance(24*60*60*1000+1);assert.equal((await f.raw('new','/join',{name:'New',code})).status,410);
    const resumed=await f.raw('host',`/rooms/${host.s.roomId}/resume`,{});assert.equal(resumed.status,200);assert.notEqual(resumed.body.code,code);assert.equal(resumed.body.world.seed,31);
    assert.equal((await f.raw('new','/join',{name:'New',code:resumed.body.code})).status,200);
  }finally{await f.stop();}
});
