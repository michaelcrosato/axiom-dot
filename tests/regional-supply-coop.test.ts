import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleCoop} from '../server/coop-api.ts';
import {action} from '../server/coop-validation.ts';
import {createRoom,joinRoom,makePlayer,syncRoom,advanceRoom,roomObstacles,playerMotion,type CoopRoom} from '../server/coop-authority.ts';
import {actorPathClear} from '../server/coop-movement.ts';
import {createVertical} from '../server/coop-vertical.ts';
import type {D1Database,D1Statement} from '../server/coop-store.ts';
import type {CoopAction,CoopSnapshot,CoopMove} from '../src/coop-protocol.ts';
import {createRegionalState,createConnectedState,createState,applyAction,commitWildernessGather,enableRegionalSupply,validateSave,serializeSave,parseSave,type State} from '../src/world.ts';
import {worldHeight} from '../src/generation.ts';
import {wildernessFeaturesNear} from '../src/wilderness.ts';
import {regionalSupplyPlan,createRegionalSupply,regionalSupplyWeather,regionalSupplyConstructionBoxes,regionalSupplyObstacles,type RegionalSupplyCommand} from '../src/regional-supply.ts';
import {traversalBodies,traversalFromBodies} from '../src/traversal-world.ts';

const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const at=(s:State,x:number,z:number):State=>({...s,player:{...s.player,x,z}});
const post=(s:State,index=0)=>regionalSupplyPlan(s.seed).outposts[index]!;
const command=(s:State,type:RegionalSupplyCommand['type'],index=0):CoopAction=>({type:'regional-supply',command:{type,outpostId:post(s,index).id,expectedRevision:s.frontierSupply!.revision}});
const valid=(s:State)=>{assert(validateSave(s));assert.deepEqual(parseSave(serializeSave(s)),s);};

/** Real HTTP request/response handler and real SQLite CAS, with no live Site or browser. */
function fixture(){
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
type Fixture=ReturnType<typeof fixture>;
type Peer={user:string;s:CoopSnapshot};
async function expedition(f:Fixture,world:State,count=4){const created=await f.raw('host','/rooms',{name:'Host',world});assert.equal(created.status,201,JSON.stringify(created.body));const peers:Peer[]=[{user:'host',s:created.body}];for(let i=1;i<count;i++){const joined=await f.raw(`guest-${i}`,'/join',{name:`Guest ${i}`,code:created.body.code});assert.equal(joined.status,200,JSON.stringify(joined.body));peers.push({user:`guest-${i}`,s:joined.body});}return peers;}
async function input(f:Fixture,p:Peer,actions:CoopAction[]=[],move?:CoopMove){const result=await f.raw(p.user,`/rooms/${p.s.roomId}/sync`,{seq:p.s.ack+1,sessionId:p.s.sessionId,actions,...(move?{move}:{})});assert.equal(result.status,200,JSON.stringify(result.body));p.s=result.body;return p.s;}
async function current(f:Fixture,p:Peer){const result=await f.raw(p.user,`/rooms/${p.s.roomId}`);assert.equal(result.status,200,JSON.stringify(result.body));p.s=result.body;return p.s;}

let cachedSource:State|undefined;
/** Earn every stock unit through a real gather reducer; fixtures never invent resources. */
function source(){
 if(cachedSource)return copy(cachedSource);
 let s=enableRegionalSupply(createRegionalState(73129));
 const needed={wood:24,stone:24};
 for(let cell=0;cell<50&&((s.wilderness?.wood??0)<needed.wood||(s.wilderness?.stone??0)<needed.stone);cell++){
  for(const feature of wildernessFeaturesNear(s,700+(cell%5)*130,700+Math.floor(cell/5)*70,0)){
   const material=feature.kind==='tree'?'wood':'stone';if(!feature.harvestable||(s.wilderness?.[material]??0)>=needed[material]||s.wilderness?.harvested.includes(feature.id))continue;
   const solid=feature.solids[0]!,radius=Math.max(solid.hx,solid.hz)+.65;
   for(let i=0;i<16;i++){const p=at(s,feature.x+Math.cos(i*Math.PI/8)*radius,feature.z+Math.sin(i*Math.PI/8)*radius),feet={...p.player,y:worldHeight(p,p.player.x,p.player.z)};if(!actorPathClear(feet,feet,roomObstacles(p),false))continue;const next=commitWildernessGather(p,feature.id);if(next!==p){s=next;break;}}
  }
 }
 assert.equal(s.wilderness?.wood,needed.wood);assert.equal(s.wilderness?.stone,needed.stone);
 const p=post(s);s=at(s,p.deliveryPosition.x,p.deliveryPosition.z);valid(s);cachedSource=copy(s);return s;
}
function supplied(index=0){let s=source(),p=post(s,index);s=at(s,p.deliveryPosition.x,p.deliveryPosition.z);for(let i=0;i<64;i++){const next=applyAction(s,command(s,'deliver',index));if(next===s)break;s=next;}assert(s.frontierSupply!.revision>0);valid(s);return s;}
function started(index=0){const s=supplied(index),next=applyAction(s,command(s,'build',index));assert.notEqual(next,s);assert(regionalSupplyObstacles(next.seed,next.frontierSupply!).length);valid(next);return next;}

test('regional supply HTTP allowlist rejects replacement stocks, peers, malformed commands and unbounded revisions',async()=>{
 const s=source(),id=post(s).id;
 for(const type of ['deliver','build'])for(const expectedRevision of [0,256])assert(action({type:'regional-supply',command:{type,outpostId:id,expectedRevision}}));
 const bad=[null,[],{},...[-1,.5,257,NaN,Infinity,'0',undefined].map(expectedRevision=>({type:'deliver',outpostId:id,expectedRevision})),{type:'deliver',outpostId:'',expectedRevision:0},{type:'deliver',outpostId:'bad\n',expectedRevision:0},{type:'deliver',outpostId:'x'.repeat(181),expectedRevision:0},{type:'finish',outpostId:id,expectedRevision:0},...['wood','stone','playerId','position','frontierSupply','wilderness','jobs'].map(key=>({type:'deliver',outpostId:id,expectedRevision:0,[key]:100}))];
 const f=fixture();try{const [host]=await expedition(f,s,1);assert(host);const before=f.stored(host.s.roomId);for(const c of bad){assert.equal(action({type:'regional-supply',command:c}),null);const r=await f.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:1,sessionId:host.s.sessionId,actions:[{type:'regional-supply',command:c}]});assert.equal(r.status,400);}
 const replacement=await f.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:1,sessionId:host.s.sessionId,actions:[],world:s});assert.equal(replacement.status,400);assert.deepEqual(f.stored(host.s.roomId),before);
 assert.equal((await f.raw('outsider',`/rooms/${host.s.roomId}`)).status,404);
 assert.equal((await f.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:1,sessionId:host.s.sessionId,actions:[command(s,'deliver')]},{Origin:'https://evil.invalid'})).status,403);
 }finally{f.stop();}
});

test('four regional actors race one delivery across real SQLite CAS and preserve finite source accounting',async()=>{
 const f=fixture();try{const s=source(),peers=await expedition(f,s),host=peers[0]!,guest=peers[1]!,c=command(host.s.world,'deliver'),expected=applyAction(host.s.world,c),hold=f.hold();
 const pending=input(f,guest,[c]);await hold.waiting;try{await input(f,host,[c]);}finally{hold.release();}await pending;await Promise.all(peers.slice(2).map(p=>input(f,p,[c])));await Promise.all(peers.map(p=>current(f,p)));
 assert(f.conflicts()>=1);assert.equal(host.s.world.frontierSupply!.revision,s.frontierSupply!.revision+1);
 for(const p of peers){assert.deepEqual(p.s.world.frontierSupply,expected.frontierSupply);assert.deepEqual(p.s.world.wilderness,s.wilderness);assert.deepEqual(p.s.world.inventory,s.inventory);valid(p.s.world);}
 const replay=await f.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:host.s.ack,sessionId:host.s.sessionId,actions:[c]});assert.equal(replay.status,200);assert.deepEqual(replay.body.world.frontierSupply,expected.frontierSupply);valid(f.stored(host.s.roomId).world);
 }finally{f.stop();}
});

test('concurrent build starts one conserved project, keeps the same solids through completion and rejects replay',async()=>{
 const f=fixture();try{const s=supplied(),peers=await expedition(f,s),host=peers[0]!,guest=peers[1]!,c=command(host.s.world,'build'),expected=applyAction(host.s.world,c),hold=f.hold();
 const pending=input(f,guest,[c]);await hold.waiting;try{await input(f,host,[c]);}finally{hold.release();}await pending;await Promise.all(peers.slice(2).map(p=>input(f,p,[c])));await Promise.all(peers.map(p=>current(f,p)));
 assert(f.conflicts()>=1);for(const p of peers){assert.deepEqual(p.s.world.frontierSupply,expected.frontierSupply);assert.deepEqual(p.s.world.wilderness,s.wilderness);valid(p.s.world);}
 const solids=regionalSupplyObstacles(host.s.world.seed,host.s.world.frontierSupply!);assert(solids.length);
 const ack=host.s.ack;await input(f,host,[c]);assert.deepEqual(host.s.world.frontierSupply,expected.frontierSupply);
 const duplicate=await f.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:ack,sessionId:host.s.sessionId,actions:[c]});assert.equal(duplicate.status,200);assert.deepEqual(duplicate.body.world.frontierSupply,expected.frontierSupply);
 let complete=copy(host.s.world);for(let i=0;i<120;i++)complete=applyAction(complete,{type:'tick',dt:1});assert.deepEqual(regionalSupplyObstacles(complete.seed,complete.frontierSupply!),solids);assert.notDeepEqual(complete.frontierSupply,expected.frontierSupply);valid(complete);
 }finally{f.stop();}
});

test('regional commands use each actor current settlement and authoritative idle grounded posture',()=>{
 const s=source(),a=post(s),b=post(s,1),room=createRoom('host','Host',s,1000),host=room.players[0]!,distant=at(s,b.deliveryPosition.x,b.deliveryPosition.z);room.players.push(makePlayer('guest','Guest',1,distant,1000));const guest=room.players[1]!;
 const before=copy(room.world.frontierSupply);syncRoom(room,'host',{seq:1,sessionId:host.sessionId,actions:[command(room.world,'deliver',1)]},1000);assert.deepEqual(room.world.frontierSupply,before);
 syncRoom(room,'guest',{seq:1,sessionId:guest.sessionId,actions:[command(room.world,'deliver',1)]},1000);assert.equal(room.world.frontierSupply!.revision,before!.revision+1);assert.equal(room.world.player.x,a.deliveryPosition.x);
 const next=copy(room.world.frontierSupply);syncRoom(room,'guest',{seq:2,sessionId:guest.sessionId,actions:[command(room.world,'deliver')],move:{x:a.deliveryPosition.x,z:a.deliveryPosition.z,y:a.deliveryPosition.y,grounded:true,crouched:false,facing:0}},1000);assert.deepEqual(room.world.frontierSupply,next,'zero-time forged teleport cannot switch settlement');
 for(const condition of ['jump','crouch','high','attack','guard'] as const){const testRoom=createRoom('host','Host',s,1000),p=testRoom.players[0]!,initial=copy(testRoom.world.frontierSupply);if(condition==='high')p.motion!.feetY+=10;
 const actions:CoopAction[]=[...(condition==='jump'?[{type:'jump-press' as const,intentId:'supply-air'}]:condition==='attack'?[{type:'attack-press' as const}]:condition==='guard'?[{type:'guard-press' as const,intentId:'supply-guard'}]:[]),command(testRoom.world,'deliver')];
 syncRoom(testRoom,'host',{seq:1,sessionId:p.sessionId,actions,move:{x:p.player.x,z:p.player.z,y:a.deliveryPosition.y,grounded:true,crouched:condition==='crouch',facing:0}},1000);assert.deepEqual(testRoom.world.frontierSupply,initial,condition);}
});

test('building cannot entomb any present or disconnected valley peer or the durable survey crate',()=>{
 const s=supplied(),box=regionalSupplyConstructionBoxes(s.seed,post(s).id).find(b=>b.solid)!;assert(box);
 for(const kind of ['present','disconnected','crate'] as const){const initial=copy(s),position={x:box.center.x,z:box.center.z};if(kind==='crate'){const body={...traversalBodies(initial)[0]!,...position,y:box.center.y};initial.traversal=traversalFromBodies([body],initial)!;valid(initial);}
 const room=createRoom('host','Host',initial,1000),host=room.players[0]!;
 if(kind!=='crate'){const peer=makePlayer('guest','Guest',1,at(initial,position.x,position.z),1000);if(kind==='disconnected')peer.active=false;room.players.push(peer);}
 const before=copy(room.world.frontierSupply),notices=syncRoom(room,'host',{seq:1,sessionId:host.sessionId,actions:[command(room.world,'build')]},1000);assert.deepEqual(room.world.frontierSupply,before,kind);assert(notices.some(n=>n.includes('construction footprint')),kind);assert.equal(regionalSupplyObstacles(room.world.seed,room.world.frontierSupply!).length,0);valid(room.world);
 if(kind!=='crate'){const peer=room.players[1]!;peer.player={...peer.player,x:post(s).deliveryPosition.x,z:post(s).deliveryPosition.z};peer.motion=createVertical(worldHeight(room.world,peer.player.x,peer.player.z));syncRoom(room,'host',{seq:2,sessionId:host.sessionId,actions:[command(room.world,'build')]},1000);assert.equal(room.world.frontierSupply!.revision,before!.revision+1,'same build succeeds once the saved actor clears');}
 }
});

test('new scaffold is an actual server motion solid and forged height cannot cross it',async()=>{
 const s=started(),box=regionalSupplyConstructionBoxes(s.seed,post(s).id).find(b=>b.solid)!;assert(box);const from={x:box.center.x-box.half.x-1,z:box.center.z},to={x:box.center.x+box.half.x+1,z:box.center.z},world=at(s,from.x,from.z),feet=worldHeight(world,from.x,from.z),obstacles=roomObstacles(world);
 assert.equal(actorPathClear({...from,y:feet},{...to,y:feet},obstacles,false),false);assert.equal(actorPathClear({...from,y:feet},{...from,y:feet},obstacles,false),true);
 const f=fixture();try{const [host]=await expedition(f,world,1);assert(host);f.advance(800);await input(f,host,[],{...to,y:999,grounded:false,crouched:false,facing:Math.PI/2});assert.equal(host.s.world.player.x,from.x);assert.equal(host.s.world.player.z,from.z);assert(Math.abs(host.s.motion.feetY-feet)<.01);valid(host.s.world);}finally{f.stop();}
});

test('absent old regional rooms initialize once, malformed present data rejects, and legacy rooms stay unchanged',async()=>{
 const f=fixture();try{const old=source();delete old.frontierSupply;const [host]=await expedition(f,old,1);assert(host);assert(host.s.world.frontierSupply);assert.deepEqual(host.s.world.wilderness,old.wilderness);const baseline=copy(host.s.world.frontierSupply),stored=f.stored(host.s.roomId);delete stored.world.frontierSupply;delete stored.world.frontierFood;/* Simulate a genuinely older room, before dependent V33 food existed. */f.replace(stored);await input(f,host);assert.deepEqual(host.s.world.frontierSupply,baseline);
 const good=f.stored(host.s.roomId);for(const malformed of [null,{},[],{...baseline,revision:-1},{...baseline,revision:999999}]){const invalid=copy(good);(invalid.world as unknown as {frontierSupply:unknown}).frontierSupply=malformed;f.replace(invalid);assert.equal((await f.raw(host.user,`/rooms/${host.s.roomId}`)).status,503);assert.equal((await f.raw(host.user,`/rooms/${host.s.roomId}/resume`,{})).status,503);assert.deepEqual(f.stored(host.s.roomId),invalid);assert.equal((await f.raw('other','/rooms',{name:'Other',world:invalid.world})).status,400);}f.replace(good);
 for(const legacy of [createState(73129),createConnectedState(73129)]){const [p]=await expedition(f,legacy,1);assert(p);assert.equal(p.s.world.frontierSupply,undefined);assert.equal(p.s.world.regional,undefined);}
 }finally{f.stop();}
});

test('saved build survives close/resume and replaced sessions; an absent host accrues no construction or water time',async()=>{
 const f=fixture();try{const s=started(),[host,guest]=await expedition(f,s,2);assert(host&&guest);const initial=copy(host.s.world.frontierSupply),session=host.s.sessionId;await f.raw(host.user,`/rooms/${host.s.roomId}/leave`,{sessionId:session});f.advance(3_600_000);await input(f,guest);assert(guest.s.paused);assert.deepEqual(guest.s.world.frontierSupply,initial);
 const resumed=await f.raw(host.user,`/rooms/${host.s.roomId}/resume`,{});assert.equal(resumed.status,200);host.s=resumed.body;assert.notEqual(host.s.sessionId,session);assert.deepEqual(host.s.world.frontierSupply,initial);assert.equal((await f.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:1,sessionId:session,actions:[command(host.s.world,'build')]})).status,409);
 f.advance(1000);await input(f,host);assert.notDeepEqual(host.s.world.frontierSupply,initial);const progressed=copy(host.s.world.frontierSupply),ledger=copy(host.s.world.wilderness);await f.raw(host.user,`/rooms/${host.s.roomId}/close`,{sessionId:host.s.sessionId});f.advance(3_600_000);const reopened=await f.raw(host.user,`/rooms/${host.s.roomId}/resume`,{});assert.equal(reopened.status,200);assert.deepEqual(reopened.body.world.frontierSupply,progressed);assert.deepEqual(reopened.body.world.wilderness,ledger);valid(f.stored(host.s.roomId).world);
 }finally{f.stop();}
});

test('restoring a saved player inside an existing retrofit finds clear server-owned ground',()=>{
 const s=started(),box=regionalSupplyConstructionBoxes(s.seed,post(s).id).find(b=>b.solid)!,inside=at(s,box.center.x,box.center.z),room=createRoom('host','Host',inside,1000),peer=room.players[0]!,motion=playerMotion(room,peer),feet={...peer.player,y:motion.feetY};
 assert(Math.hypot(peer.player.x-box.center.x,peer.player.z-box.center.z)>.5);assert(actorPathClear(feet,feet,roomObstacles({...room.world,player:peer.player}),motion.crouched));assert.deepEqual(room.world.frontierSupply,s.frontierSupply);assert.deepEqual(room.world.wilderness,s.wilderness);valid(room.world);
});

test('four simultaneous HTTP polls advance construction and finished resident water simulation only once',async()=>{
 for(const completed of [false,true]){let s=started();if(completed)for(let i=0;i<180;i++)s=applyAction(s,{type:'tick',dt:1});
 const f=fixture();try{const peers=await expedition(f,s),host=peers[0]!,expected=applyAction(host.s.world,{type:'tick',dt:1});f.advance(1000);await Promise.all(peers.map(p=>input(f,p)));await Promise.all(peers.map(p=>current(f,p)));for(const p of peers){assert.deepEqual(p.s.world.frontierSupply,expected.frontierSupply,completed?'resident collection/consumption':'construction work');assert.deepEqual(p.s.world.wilderness,s.wilderness);valid(p.s.world);}
 const before=copy(host.s.world.frontierSupply);await f.raw(host.user,`/rooms/${host.s.roomId}/leave`,{sessionId:host.s.sessionId});f.advance(3_600_000);await input(f,peers[1]!);assert.deepEqual(peers[1]!.s.world.frontierSupply,before,'offline time never catches up finite water production or consumption');
 }finally{f.stop();}}
});


test('regional weather and legacy rainfall both retain room-owned time across dry/recovery polls',async()=>{
 for(const version of [1,2] as const){
  let s=source();s={...s,frontierSupply:createRegionalSupply(s.seed,version)};
  for(const type of ['deliver','build'] as const)s=applyAction(s,command(s,type));
  for(let i=0;i<1800;i++)s=applyAction(s,{type:'tick',dt:1});
  assert.equal(s.frontierSupply!.version,version);if(version===2)assert.equal(regionalSupplyWeather(s.frontierSupply!,post(s).id)!.phase,'dry');
  const f=fixture();try{const peers=await expedition(f,s),host=peers[0]!,initial=copy(host.s.world.frontierSupply),expected=applyAction(host.s.world,{type:'tick',dt:1});f.advance(1000);await Promise.all(peers.map(p=>input(f,p)));await Promise.all(peers.map(p=>current(f,p)));for(const peer of peers){assert.deepEqual(peer.s.world.frontierSupply,expected.frontierSupply);assert.equal(peer.s.world.frontierSupply!.ticks,initial!.ticks+4);valid(peer.s.world);}
   const before=copy(host.s.world.frontierSupply);await f.raw(host.user,`/rooms/${host.s.roomId}/leave`,{sessionId:host.s.sessionId});f.advance(3_600_000);await input(f,peers[1]!);assert.deepEqual(peers[1]!.s.world.frontierSupply,before);
  }finally{f.stop();}
 }
});
