import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleCoop} from '../server/coop-api.ts';
import {createRoom,joinRoom,makePlayer,roomObstacles,playerMotion,advanceRoom,syncRoom,snapshot,type CoopRoom} from '../server/coop-authority.ts';
import {actorPathClear} from '../server/coop-movement.ts';
import {createVertical,moveVertical} from '../server/coop-vertical.ts';
import {createRegionalState,createConnectedState,validateSave,worldBound,wildernessGatherContext,type State} from '../src/world.ts';
import {worldHeight} from '../src/generation.ts';
import {regionalFeaturesNear,REGION_BOUND} from '../src/regional-world.ts';
import {wildernessFeaturesNear,type WildernessFeature} from '../src/wilderness.ts';
import {canGatherWilderness} from '../src/wilderness-state.ts';
import type {D1Database,D1Statement} from '../server/coop-store.ts';
import type {CoopSnapshot,CoopAction,CoopMove} from '../src/coop-protocol.ts';
const at=(s:State,x:number,z:number):State=>({...s,player:{...s.player,x,z}});
/** Direct HTTP Request/Response handler and real SQLite CAS; no listener or live Site. */
function fixture(){
 const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8'));
 const DB:D1Database={prepare(sql:string):D1Statement{let values:unknown[]=[];return {bind(...args:unknown[]){values=args;return this;},async first<T>(){return (sqlite.prepare(sql).get(...values as never[])??null) as T|null;},async all<T>(){return {results:sqlite.prepare(sql).all(...values as never[]) as T[]};},async run(){const r=sqlite.prepare(sql).run(...values as never[]);return {success:true,meta:{changes:Number(r.changes)}};}};}};
 let now=1_800_000_000_000;const origin='https://axiom-tests.invalid';
 const raw=async(user:string,path:string,body?:unknown)=>{const r=await handleCoop(new Request(`${origin}/api/coop${path}`,{method:body===undefined?'GET':'POST',headers:{'oai-authenticated-user-id':user,Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}),{DB},now);assert(r);return {status:r.status,body:await r.json()};};
 return {raw,sqlite,advance:(ms:number)=>{now+=ms;},stop:()=>sqlite.close()};
}
function treeFixture(s:State,x:number,z:number){
 for(const feature of wildernessFeaturesNear(s,x,z).filter(f=>f.kind==='tree'&&f.harvestable)){
  const span=Math.max(feature.solids[0]!.hx,feature.solids[0]!.hz)+1,from={x:feature.x-span,z:feature.z},to={x:feature.x+span,z:feature.z};
  const state=at(s,from.x,from.z),obstacles=roomObstacles(state),g={obstacles,height:(x:number,z:number)=>worldHeight(state,x,z)},m=createVertical(g.height(from.x,from.z)),around=feature.z+feature.solids[0]!.hz+.8;
  if(!actorPathClear({...from,y:m.feetY},{...from,y:m.feetY},obstacles,false)||!actorPathClear({...to,y:g.height(to.x,to.z)},{...to,y:g.height(to.x,to.z)},obstacles,false))continue;
  if(moveVertical({...m},from,to,g)||!canGatherWilderness(wildernessGatherContext(state),feature.id))continue;
  const route=[from,{x:from.x,z:around},{x:to.x,z:around},to];let clear=true;for(let i=1;i<route.length;i++)if(!moveVertical(m,route[i-1]!,route[i]!,g)){clear=false;break;}
  if(clear)return {feature,from,to,route,state};
 }
 throw new Error(`Missing regional tree fixture near ${x},${z}`);
}
async function host(f:ReturnType<typeof fixture>,world:State){const r=await f.raw('host','/rooms',{name:'Host',world});assert.equal(r.status,201,JSON.stringify(r.body));return r.body as CoopSnapshot;}
async function send(f:ReturnType<typeof fixture>,s:CoopSnapshot,actions:CoopAction[]=[],move?:CoopMove,user='host'){const r=await f.raw(user,`/rooms/${s.roomId}/sync`,{seq:s.ack+1,sessionId:s.sessionId,actions,...(move?{move}:{})});assert.equal(r.status,200,JSON.stringify(r.body));return r.body as CoopSnapshot;}

test('four distant regional actors retain their own solid, support, staff and resource neighborhoods',()=>{
 const source=createRegionalState(73129),fixtures=[[-950,-950],[950,950],[-950,950],[950,-950]].map(([x,z])=>treeFixture(source,x!,z!));
 const room=createRoom('host','Host',fixtures[0]!.state,1000);
 // Trusted persisted actor fixtures, never a client-selected teleport/motion input.
 for(let i=1;i<4;i++)room.players.push(makePlayer(`guest-${i}`,`Guest ${i}`,i,fixtures[i]!.state,1000));
 for(let i=0;i<4;i++){
  const p=room.players[i]!,f=fixtures[i]!,s={...room.world,player:p.player},obstacles=roomObstacles(s);
  assert(Math.abs(p.player.x)>500&&Math.abs(p.player.z)>500);assert(obstacles.some(o=>o.featureId===f.feature.id));assert(obstacles.length<1000);
  for(let j=0;j<4;j++)if(i!==j)assert(!obstacles.some(o=>o.featureId===fixtures[j]!.feature.id),'distant actor chunks are not retained in another actor query');
  syncRoom(room,p.userId,{seq:1,sessionId:p.sessionId,actions:[{type:'attack-press'}],move:{...f.from,y:999,grounded:false,crouched:false,facing:Math.PI/2}},1000);
 }
 advanceRoom(room,1200);
 for(let i=0;i<4;i++){
  const p=room.players[i]!,f=fixtures[i]!;assert(p.combo.hitIds.includes(f.feature.id),`distant actor ${i} uses their own staff geometry`);assert.equal(p.motion!.feetY,worldHeight({...room.world,zone:p.zone},p.player.x,p.player.z));
 }
 assert.equal(room.world.wilderness,undefined,'staff contacts grant no material');assert(validateSave(room.world));
});

test('regional HTTP movement beyond ±80 uses local terrain and obstacles, with no client height or speed authority',async()=>{
 const f=fixture();try{
  const fixtureTree=treeFixture(createRegionalState(73129),1100,-900);let s=await host(f,fixtureTree.state);const initial={...s.world.player};
  assert(s.world.player.x>80);f.advance(800);s=await send(f,s,[],{...fixtureTree.to,y:999,grounded:false,crouched:false,facing:Math.PI/2});assert.deepEqual(s.world.player,initial);assert(s.motion.feetY<100);
  for(const point of fixtureTree.route.slice(1)){f.advance(800);s=await send(f,s,[],{...point,y:-999,grounded:true,crouched:false,facing:0});assert(Math.hypot(s.world.player.x-point.x,s.world.player.z-point.z)<1e-6);}
  const before={...s.world.player};s=await send(f,s,[],{x:-1500,z:1500,y:999,grounded:true,crouched:false,facing:0});assert.deepEqual(s.world.player,before,'zero server time grants zero travel');
  f.advance(800);s=await send(f,s,[],{x:10000,z:10000,y:999,grounded:true,crouched:false,facing:0});assert(Math.hypot(s.world.player.x-before.x,s.world.player.z-before.z)<=9.600001);assert(Math.abs(s.world.player.x)<=REGION_BOUND);assert(validateSave(s.world));
 }finally{f.stop();}
});

test('distant four-client CAS harvest is once-only across replay, cache eviction, durable room reopen and session replacement',async()=>{
 const f=fixture();try{
  const tree=treeFixture(createRegionalState(73129),-1100,1100);let s=await host(f,tree.state);const peers=[{user:'host',s}];
  for(let i=1;i<4;i++){const r=await f.raw(`guest-${i}`,'/join',{name:`Guest ${i}`,code:s.code});assert.equal(r.status,200);peers.push({user:`guest-${i}`,s:r.body});}
  await Promise.all(peers.map(p=>send(f,p.s,[{type:'gather-wilderness',id:tree.feature.id}],undefined,p.user)));
  s=(await f.raw('host',`/rooms/${s.roomId}`)).body;assert.equal(s.world.wilderness!.wood,1);assert.deepEqual(s.world.wilderness!.harvested,[tree.feature.id]);
  const row=f.sqlite.prepare('SELECT body FROM axiom_coop_rooms WHERE id = ?').get(s.roomId)!;const durable=JSON.parse(String(row.body)) as CoopRoom;assert.equal(durable.world.wilderness!.wood,1);assert(validateSave(durable.world));
  for(let i=0;i<140;i++)regionalFeaturesNear(s.world.seed,-1500+i%40*75,-1400+Math.floor(i/40)*600,0);
  const oldSession=s.sessionId,oldSeq=s.ack;const closed=await f.raw('host',`/rooms/${s.roomId}/close`,{sessionId:s.sessionId});assert.equal(closed.status,200);
  f.advance(1000);const reopened=await f.raw('host',`/rooms/${s.roomId}/resume`,{name:'Host'});assert.equal(reopened.status,200);s=reopened.body;
  assert.equal(s.world.regional?.version,1);assert(Math.abs(s.world.player.x)>500);assert.equal(s.world.wilderness!.wood,1);assert.notEqual(s.sessionId,oldSession);
  assert.equal((await f.raw('host',`/rooms/${s.roomId}/sync`,{seq:oldSeq+1,sessionId:oldSession,actions:[{type:'gather-wilderness',id:tree.feature.id}]})).status,409);
  s=await send(f,s,[{type:'gather-wilderness',id:tree.feature.id}]);assert.equal(s.world.wilderness!.wood,1);
  const replay=await f.raw('host',`/rooms/${s.roomId}/sync`,{seq:s.ack,sessionId:s.sessionId,actions:[{type:'gather-wilderness',id:tree.feature.id}]});assert.equal(replay.status,200);assert.equal(replay.body.world.wilderness.wood,1);
  assert(roomObstacles(s.world).some(o=>o.featureId===tree.feature.id));
 }finally{f.stop();}
});

test('regional HTTP imported ledgers reject forged source IDs, marker changes and resource inflation',async()=>{
 const f=fixture();try{
  const source=createRegionalState(73129),tree=treeFixture(source,1000,1000),id=tree.feature.id;
  const invalid:unknown[]=[{...source,regional:{version:2}},{...createConnectedState(73129),regional:{version:1,enabled:true}},
   {...source,player:{x:REGION_BOUND+1,z:0,hp:100}},
   {...source,wilderness:{version:1,generation:2,seed:73129,wood:1,stone:0,harvested:[id.replace('/feature:','/feature:0')]}},
   {...source,wilderness:{version:1,generation:2,seed:73129,wood:2,stone:0,harvested:[id]}},
   {...createConnectedState(73129),wilderness:{version:1,generation:2,seed:73129,wood:1,stone:0,harvested:[id]}},
  ];
  for(const world of invalid){const r=await f.raw('host','/rooms',{name:'Host',world});assert.equal(r.status,400);assert.equal(r.body.error,'invalid_world');}
  const s=await host(f,source);const remote=await send(f,s,[{type:'gather-wilderness',id}]);assert.equal(remote.world.wilderness,undefined);
  assert.equal((await f.raw('host',`/rooms/${s.roomId}/sync`,{seq:remote.ack+1,sessionId:s.sessionId,actions:[{type:'gather-wilderness',id,wood:1}]})).status,400);
 }finally{f.stop();}
});

test('repeated API polls reuse a bounded certified ledger cache without historical chunk generation or stale membership',async t=>{
 const {coopLedgerCacheStats}=await import('../server/coop-api.ts');
 const {regionalCacheStats}=await import('../src/regional-world.ts');
 const {createWildernessState}=await import('../src/wilderness-state.ts');
 const f=fixture();try{
  const seed=73129,world=createRegionalState(seed),ledger=createWildernessState(world),harvested:string[]=[],totals={wood:0,stone:0};
  for(let i=0;i<135&&harvested.length<125;i++){
   const source=regionalFeaturesNear(seed,-1400+(i%15)*200,-1400+Math.floor(i/15)*350,0).find(f=>f.harvestable);if(!source)continue;
   harvested.push(source.id);totals[source.kind==='tree'?'wood':'stone']++;
  }
  assert.equal(harvested.length,125);world.wilderness={...ledger,harvested,...totals};assert(validateSave(world));
  let s=await host(f,world);const guest=(await f.raw('guest','/join',{name:'Guest',code:s.code})).body as CoopSnapshot;
  // More room/seed identities than cache capacity must evict, with no unbounded
  // retention of previously decoded worlds or their member/session collections.
  for(let i=0;i<coopLedgerCacheStats().maxRooms+1;i++){
   const other=createRegionalState(900+i);other.wilderness=createWildernessState(other);
   const r=await f.raw(`owner-${i}`,'/rooms',{name:`Owner ${i}`,world:other});assert.equal(r.status,201);
   assert(coopLedgerCacheStats().rooms<=coopLedgerCacheStats().maxRooms);
  }
  f.advance(250);s=await send(f,s); // Strict validation once after LRU eviction.
  const before=regionalCacheStats(),start=performance.now();
  for(let i=0;i<8;i++){f.advance(250);s=await send(f,s);assert.equal(s.world.wilderness!.harvested.length,125);}
  const elapsed=performance.now()-start,after=regionalCacheStats();
  assert.equal(after.featureCompilations,before.featureCompilations,'second and later polls never rebuild historical source chunks');
  assert.equal(after.contextCompilations,before.contextCompilations);assert(coopLedgerCacheStats().rooms<=4);assert(elapsed<2000);
  t.diagnostic(`125 source chunks; 8 full API/SQLite polls ${elapsed.toFixed(1)}ms; ${after.featureCompilations-before.featureCompilations} historical/local feature recompilations; ${coopLedgerCacheStats().rooms}/4 ledger entries`);
  const row=f.sqlite.prepare('SELECT body FROM axiom_coop_rooms WHERE id = ?').get(s.roomId)!,saved=String(row.body),stored=JSON.parse(saved) as CoopRoom;
  // Cached certification cannot hide changed untrusted data, including world flavor.
  stored.world.wilderness!.wood++;
  f.sqlite.prepare('UPDATE axiom_coop_rooms SET body = ? WHERE id = ?').run(JSON.stringify(stored),s.roomId);
  assert.equal((await f.raw('host',`/rooms/${s.roomId}`)).status,503);
  const changedId=JSON.parse(saved) as CoopRoom;changedId.world.wilderness!.harvested[0]=changedId.world.wilderness!.harvested[0]!.replace('region:1:73129/','region:1:73130/');
  f.sqlite.prepare('UPDATE axiom_coop_rooms SET body = ? WHERE id = ?').run(JSON.stringify(changedId),s.roomId);
  assert.equal((await f.raw('host',`/rooms/${s.roomId}`)).status,503,'identical counters cannot hide a changed source identity');
  const wrongFlavor=JSON.parse(saved) as CoopRoom;delete wrongFlavor.world.regional;
  f.sqlite.prepare('UPDATE axiom_coop_rooms SET body = ? WHERE id = ?').run(JSON.stringify(wrongFlavor),s.roomId);
  assert.equal((await f.raw('host',`/rooms/${s.roomId}`)).status,503);
  const changedMembership=JSON.parse(saved) as CoopRoom;changedMembership.players=changedMembership.players.filter(p=>p.userId!=='guest');
  f.sqlite.prepare('UPDATE axiom_coop_rooms SET body = ? WHERE id = ?').run(JSON.stringify(changedMembership),s.roomId);
  assert.equal((await f.raw('guest',`/rooms/${guest.roomId}`)).status,404,'ledger cache never retains or restores revoked membership');
  assert.equal((await f.raw('host',`/rooms/${s.roomId}`)).status,200);
 }finally{f.stop();}
});
