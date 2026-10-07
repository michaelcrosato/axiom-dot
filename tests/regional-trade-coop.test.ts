import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleCoop} from '../server/coop-api.ts';
import {action} from '../server/coop-validation.ts';
import {createRoom,makePlayer,syncRoom,roomObstacles,playerMotion,type CoopRoom} from '../server/coop-authority.ts';
import {actorPathClear} from '../server/coop-movement.ts';
import {createVertical} from '../server/coop-vertical.ts';
import type {D1Database,D1Statement} from '../server/coop-store.ts';
import type {CoopAction,CoopSnapshot,CoopMove} from '../src/coop-protocol.ts';
import {createRegionalState,createConnectedState,createState,applyAction,enableRegionalSupply,enableRegionalTrade,validateSave,serializeSave,parseSave,type State} from '../src/world.ts';
import {worldHeight} from '../src/generation.ts';
import {createRegionalTrade,advanceRegionalTrade,regionalTradeConservation,regionalTradeWithdrawn,regionalTradePlan,regionalTradeCommandPosition,regionalTradeConstructionBoxes,regionalTradeObstacles,type RegionalTradeCommand} from '../src/regional-trade.ts';
import {regionalSupplyPlan,regionalSupplyAvailable,regionalSupplySpent} from '../src/regional-supply.ts';
import {traversalBodies,traversalFromBodies} from '../src/traversal-world.ts';

const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const at=(s:State,x:number,z:number):State=>({...s,player:{...s.player,x,z}});
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

const plan=(s:State)=>regionalTradePlan(s.seed);
function command(s:State,type:RegionalTradeCommand['type']='start-source',index=0):CoopAction {
 const p=plan(s),targetId=(type==='start-source'?p.sources:type==='clear-route'?p.routes:p.projects)[index]!.id;
 return {type:'regional-trade',command:{type,targetId,expectedRevision:s.frontierTrade!.revision}};
}
function atCommand(s:State,type:RegionalTradeCommand['type']='start-source',index=0):State {
 const c=command(s,type,index);assert.equal(c.type,'regional-trade');const target=regionalTradeCommandPosition(s.seed,(c as Extract<CoopAction,{type:'regional-trade'}>).command)!;return at(s,target.x,target.z);
}
// Preserve the original constant-speed authority fixtures and timing assertions.
// Weather-freight authority is exercised separately for both model versions.
function source(){return atCommand({...enableRegionalSupply(createRegionalState(73129)),frontierTrade:createRegionalTrade(73129,1)});}
function started(index=0){const s=atCommand(source(),'start-source',index),next=applyAction(s,command(s,'start-source',index));assert.notEqual(next,s);valid(next);return next;}

test('regional freight HTTP allowlist rejects injected stock, poses, clocks and stale authority replacements',async()=>{
 const s=source(),id=plan(s).sources[0]!.id;
 for(const type of ['start-source','clear-route','build-store','withdraw-reserve'])for(const expectedRevision of [0,15])assert(action({type:'regional-trade',command:{type,targetId:id,expectedRevision}}));
 const bad=[null,[],{},...[-1,.5,16,NaN,Infinity,'0',undefined].map(expectedRevision=>({type:'start-source',targetId:id,expectedRevision})),{type:'start-source',targetId:'',expectedRevision:0},{type:'start-source',targetId:'bad\n',expectedRevision:0},{type:'start-source',targetId:'x'.repeat(181),expectedRevision:0},{type:'finish',targetId:id,expectedRevision:0},...['stock','remaining','cargo','ticks','playerId','position','frontierTrade','receipts'].map(key=>({type:'start-source',targetId:id,expectedRevision:0,[key]:100}))];
 const f=fixture();try{const [host]=await expedition(f,s,1);assert(host);const before=f.stored(host.s.roomId);for(const c of bad){assert.equal(action({type:'regional-trade',command:c}),null);const r=await f.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:1,sessionId:host.s.sessionId,actions:[{type:'regional-trade',command:c}]});assert.equal(r.status,400);}
 assert.equal((await f.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:1,sessionId:host.s.sessionId,actions:[],world:s})).status,400);assert.deepEqual(f.stored(host.s.roomId),before);
 assert.equal((await f.raw('outsider',`/rooms/${host.s.roomId}`)).status,404);assert.equal((await f.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:1,sessionId:host.s.sessionId,actions:[command(s)]},{Origin:'https://evil.invalid'})).status,403);
 }finally{f.stop();}
});
test('four HTTP actors race one source activation across real SQLite CAS and replay never recreates stock',async()=>{
 const f=fixture();try{const s=source(),peers=await expedition(f,s),host=peers[0]!,guest=peers[1]!,c=command(host.s.world),expected=applyAction(host.s.world,c),hold=f.hold();
 const pending=input(f,guest,[c]);await hold.waiting;try{await input(f,host,[c]);}finally{hold.release();}await pending;await Promise.all(peers.slice(2).map(p=>input(f,p,[c])));await Promise.all(peers.map(p=>current(f,p)));
 assert(f.conflicts()>=1);assert.equal(host.s.world.frontierTrade!.revision,1);for(const p of peers){assert.deepEqual(p.s.world.frontierTrade,expected.frontierTrade);assert.deepEqual(p.s.world.wilderness,s.wilderness);assert.deepEqual(p.s.world.inventory,s.inventory);assert.deepEqual(p.s.world.frontierSupply,s.frontierSupply);valid(p.s.world);}
 const replay=await f.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:host.s.ack,sessionId:host.s.sessionId,actions:[c]});assert.equal(replay.status,200);assert.deepEqual(replay.body.world.frontierTrade,expected.frontierTrade);valid(f.stored(host.s.roomId).world);
 }finally{f.stop();}
});
test('four far-apart retained actors use their own authoritative target and local neighborhood under a concurrent CAS race',async()=>{
 const f=fixture();try{const s=source(),peers=await expedition(f,s),stored=f.stored(peers[0]!.s.roomId),positions=plan(s).sources.map(p=>p.interactionPosition);positions.push(plan(s).projects[2]!.interactionPosition);
 for(let i=0;i<4;i++){const p=stored.players.find(p=>p.userId===peers[i]!.user)!,position=positions[i]!;p.player={...p.player,x:position.x,z:position.z};p.motion=createVertical(worldHeight({...s,player:p.player},position.x,position.z));delete p.wildernessCollisionVersion;}stored.world={...stored.world,player:{...stored.players[0]!.player}};f.replace(stored);await Promise.all(peers.map(p=>current(f,p)));
 assert(Math.hypot(positions[0]!.x-positions[2]!.x,positions[0]!.z-positions[2]!.z)>500);
 const hold=f.hold(),pending=input(f,peers[1]!,[command(peers[1]!.s.world,'start-source',1)]);await hold.waiting;try{await input(f,peers[0]!,[command(peers[0]!.s.world,'start-source',0)]);}finally{hold.release();}await pending;
 assert(f.conflicts()>=1);await current(f,peers[1]!);await input(f,peers[1]!,[command(peers[1]!.s.world,'start-source',1)]);await current(f,peers[2]!);await input(f,peers[2]!,[command(peers[2]!.s.world,'start-source',2)]);await current(f,peers[3]!);
 const before=copy(peers[3]!.s.world.frontierTrade);await input(f,peers[3]!,[command(peers[3]!.s.world,'start-source',0)],{...positions[0]!,y:999,grounded:true,crouched:false,facing:0});assert.deepEqual(peers[3]!.s.world.frontierTrade,before,'forged zero-time teleport does not reach another target');
 await Promise.all(peers.map(p=>current(f,p)));for(const p of peers){assert.equal(p.s.world.frontierTrade!.revision,3);assert(p.s.world.frontierTrade!.routes.every(r=>r.sourceStartedAt!==null));assert.equal(p.s.world.frontierTrade!.receipts.length,3);assert.deepEqual(p.s.world.wilderness,s.wilderness);valid(p.s.world);}const solids=regionalTradeObstacles(s.seed,peers[0]!.s.world.frontierTrade!);for(let i=0;i<3;i++)assert(roomObstacles(peers[i]!.s.world).some(o=>solids.some(solid=>solid.featureId===o.featureId)));
 }finally{f.stop();}
});
test('freight commands reject airborne crouched raised attacking and guarded poses despite client grounded claims',()=>{
 for(const condition of ['jump','crouch','high','attack','guard'] as const){const s=source(),room=createRoom('host','Host',s,1000),p=room.players[0]!,initial=copy(room.world.frontierTrade);if(condition==='high')p.motion!.feetY+=10;
 const actions:CoopAction[]=[...(condition==='jump'?[{type:'jump-press' as const,intentId:'trade-air'}]:condition==='attack'?[{type:'attack-press' as const}]:condition==='guard'?[{type:'guard-press' as const,intentId:'trade-guard'}]:[]),command(room.world)];
 syncRoom(room,'host',{seq:1,sessionId:p.sessionId,actions,move:{x:p.player.x,z:p.player.z,y:worldHeight(s,p.player.x,p.player.z),grounded:true,crouched:condition==='crouch',facing:0}},1000);assert.deepEqual(room.world.frontierTrade,initial,condition);}
});
test('source activation cannot entomb present, disconnected or expired retained peers, or the durable survey crate',()=>{
 const s=source(),box=regionalTradeConstructionBoxes(s.seed,plan(s).sources[0]!.id).find(b=>b.solid)!;assert(box);
 for(const kind of ['present','disconnected','expired','crate'] as const){const initial=copy(s),position={x:box.center.x,z:box.center.z};if(kind==='crate'){const body={...traversalBodies(initial)[0]!,...position,y:box.center.y};initial.traversal=traversalFromBodies([body,...traversalBodies(initial).slice(1)],initial)!;valid(initial);}
 const room=createRoom('host','Host',initial,1000),host=room.players[0]!;
 if(kind!=='crate'){const peer=makePlayer('guest','Guest',1,at(initial,position.x,position.z),1000);if(kind==='disconnected')peer.active=false;if(kind==='expired')peer.lastSeen=-100000;room.players.push(peer);}
 const before=copy(room.world.frontierTrade),notices=syncRoom(room,'host',{seq:1,sessionId:host.sessionId,actions:[command(room.world)]},1000);assert.deepEqual(room.world.frontierTrade,before,kind);assert(notices.some(n=>n.includes('construction footprint')),`${kind}: ${notices}`);assert.equal(regionalTradeObstacles(room.world.seed,room.world.frontierTrade!).length,0);valid(room.world);
 if(kind!=='crate'){const peer=room.players[1]!;peer.player={...peer.player,x:s.player.x,z:s.player.z};peer.motion=createVertical(worldHeight(room.world,peer.player.x,peer.player.z));syncRoom(room,'host',{seq:2,sessionId:host.sessionId,actions:[command(room.world)]},1000);assert.equal(room.world.frontierTrade!.revision,before!.revision+1,'source activates once all retained actors clear');}
 }
});
test('active source solids survive saved reload and server motion cannot use forged client height to pass through',async()=>{
 const s=started(),box=regionalTradeConstructionBoxes(s.seed,plan(s).sources[0]!.id).find(b=>b.solid)!,from={x:box.center.x-box.half.x-1,z:box.center.z},to={x:box.center.x+box.half.x+1,z:box.center.z},world=at(s,from.x,from.z),feet=worldHeight(world,from.x,from.z),obstacles=roomObstacles(world);
 assert.equal(actorPathClear({...from,y:feet},{...to,y:feet},obstacles,false),false);assert.equal(actorPathClear({...from,y:feet},{...from,y:feet},obstacles,false),true);
 const f=fixture();try{const [host]=await expedition(f,world,1);assert(host);f.advance(800);await input(f,host,[],{...to,y:999,grounded:false,crouched:false,facing:Math.PI/2});assert.equal(host.s.world.player.x,from.x);assert.equal(host.s.world.player.z,from.z);assert(Math.abs(host.s.motion.feetY-feet)<.01);valid(host.s.world);}finally{f.stop();}
 const inside=at(s,box.center.x,box.center.z),room=createRoom('host','Host',inside,1000),p=room.players[0]!,m=playerMotion(room,p);assert(Math.hypot(p.player.x-box.center.x,p.player.z-box.center.z)>.3);assert(actorPathClear({...p.player,y:m.feetY},{...p.player,y:m.feetY},roomObstacles({...room.world,player:p.player}),m.crouched));assert.deepEqual(room.world.frontierTrade,s.frontierTrade);
});
test('optional freight absence migrates once; malformed present room ledgers are refused on read resume and import',async()=>{
 const f=fixture();try{const old=enableRegionalSupply(createRegionalState(73129)),[host]=await expedition(f,old,1);assert(host);assert(host.s.world.frontierTrade);assert.deepEqual(host.s.world.frontierSupply,old.frontierSupply);const baseline=copy(host.s.world.frontierTrade),stored=f.stored(host.s.roomId);delete stored.world.frontierTrade;delete stored.world.frontierFood;/* Simulate a genuinely older room, before dependent V33 food existed. */f.replace(stored);await input(f,host);assert.deepEqual(host.s.world.frontierTrade,baseline);
 const good=f.stored(host.s.roomId);for(const malformed of [null,{},[],{...baseline,revision:-1},{...baseline,revision:999999},{...baseline,routes:[]},{...baseline,inventedStock:20}]){const invalid=copy(good);(invalid.world as unknown as {frontierTrade:unknown}).frontierTrade=malformed;f.replace(invalid);assert.equal((await f.raw(host.user,`/rooms/${host.s.roomId}`)).status,503);assert.equal((await f.raw(host.user,`/rooms/${host.s.roomId}/resume`,{})).status,503);assert.deepEqual(f.stored(host.s.roomId),invalid);assert.equal((await f.raw('other','/rooms',{name:'Other',world:invalid.world})).status,400);}f.replace(good);
 for(const legacy of [createState(73129),createConnectedState(73129)]){const [p]=await expedition(f,legacy,1);assert(p);assert.equal(p.s.world.frontierTrade,undefined);assert.equal(p.s.world.regional,undefined);}
 }finally{f.stop();}
});
test('four simultaneous polls share one bounded room clock and host absence close resume never backfill freight time',async()=>{
 const f=fixture();try{const s=started(),peers=await expedition(f,s),host=peers[0]!,expected=applyAction(host.s.world,{type:'tick',dt:1});f.advance(1000);await Promise.all(peers.map(p=>input(f,p)));await Promise.all(peers.map(p=>current(f,p)));for(const p of peers){assert.deepEqual(p.s.world.frontierTrade,expected.frontierTrade);assert.deepEqual(p.s.world.frontierSupply,expected.frontierSupply);assert.deepEqual(p.s.world.wilderness,s.wilderness);valid(p.s.world);}
 const before=copy(host.s.world.frontierTrade),supply=copy(host.s.world.frontierSupply),session=host.s.sessionId;await f.raw(host.user,`/rooms/${host.s.roomId}/leave`,{sessionId:session});f.advance(3_600_000);await input(f,peers[1]!);assert(peers[1]!.s.paused);assert.deepEqual(peers[1]!.s.world.frontierTrade,before);assert.deepEqual(peers[1]!.s.world.frontierSupply,supply);
 const resumed=await f.raw(host.user,`/rooms/${host.s.roomId}/resume`,{});assert.equal(resumed.status,200);host.s=resumed.body;assert.notEqual(host.s.sessionId,session);assert.deepEqual(host.s.world.frontierTrade,before);assert.equal((await f.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:1,sessionId:session,actions:[command(host.s.world)]})).status,409);
 f.advance(1000);await input(f,host);assert.notDeepEqual(host.s.world.frontierTrade,before);const progressed=copy(host.s.world.frontierTrade);await f.raw(host.user,`/rooms/${host.s.roomId}/close`,{sessionId:host.s.sessionId});f.advance(3_600_000);const reopened=await f.raw(host.user,`/rooms/${host.s.roomId}/resume`,{});assert.equal(reopened.status,200);assert.deepEqual(reopened.body.world.frontierTrade,progressed);valid(f.stored(host.s.roomId).world);
 }finally{f.stop();}
});
let readyCache:State|undefined;
function readyStore(){
 if(readyCache)return copy(readyCache);let s=atCommand(started(),'clear-route');s=applyAction(s,command(s,'clear-route'));
 const limit=Math.ceil(plan(s).routes[0]!.travelSeconds+120);for(let i=0;i<limit&&s.frontierTrade!.routes[0]!.destinationStock<plan(s).projects[0]!.cost;i++)s={...s,frontierTrade:advanceRegionalTrade(s.frontierTrade!,1)};
 assert(s.frontierTrade!.routes[0]!.destinationStock>=plan(s).projects[0]!.cost);s=atCommand(s,'build-store');valid(s);readyCache=copy(s);return s;
}
test('four-player repair and freight-store races commit one bounded job each and keep every material atom accounted for',async()=>{
 for(const type of ['clear-route','build-store'] as const){const f=fixture();try{
 const s=type==='clear-route'?atCommand(started(),type):readyStore(),peers=await expedition(f,s),host=peers[0]!,c=command(host.s.world,type),expected=applyAction(host.s.world,c),hold=f.hold();assert.notEqual(expected.frontierTrade,host.s.world.frontierTrade);
 const pending=input(f,peers[1]!,[c]);await hold.waiting;try{await input(f,host,[c]);}finally{hold.release();}await pending;await Promise.all(peers.slice(2).map(p=>input(f,p,[c])));await Promise.all(peers.map(p=>current(f,p)));assert(f.conflicts()>0);
 for(const p of peers){assert.deepEqual(p.s.world.frontierTrade,expected.frontierTrade,type);assert(regionalTradeConservation(p.s.world.frontierTrade!).every(r=>r.balanced));assert.deepEqual(p.s.world.frontierSupply,s.frontierSupply);assert.deepEqual(p.s.world.wilderness,s.wilderness);valid(p.s.world);}
 const before=copy(host.s.world.frontierTrade);await input(f,host,[c]);assert.deepEqual(host.s.world.frontierTrade,before);const replay=await f.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:host.s.ack,sessionId:host.s.sessionId,actions:[c]});assert.equal(replay.status,200);assert.deepEqual(replay.body.world.frontierTrade,before);
 if(type==='build-store'){assert.equal(host.s.world.frontierTrade!.routes[0]!.embodied,plan(s).projects[0]!.cost);assert.equal(host.s.world.frontierTrade!.routes[0]!.destinationStock,0);}
 }finally{f.stop();}}
});
test('store construction uses the same durable-peer and crate footprint guard as source activation',()=>{
 const s=readyStore(),box=regionalTradeConstructionBoxes(s.seed,plan(s).projects[0]!.id).find(b=>b.solid)!;assert(box);
 for(const kind of ['present','disconnected','crate'] as const){let initial=copy(s);if(kind==='crate'){initial={...initial,traversal:traversalFromBodies([{...traversalBodies(initial)[0]!,x:box.center.x,y:box.center.y,z:box.center.z},...traversalBodies(initial).slice(1)],initial)!};valid(initial);}
 const room=createRoom('host','Host',initial,1000),host=room.players[0]!;if(kind!=='crate'){const peer=makePlayer('guest','Guest',1,at(initial,box.center.x,box.center.z),1000);if(kind==='disconnected')peer.active=false;room.players.push(peer);}
 const before=copy(room.world.frontierTrade),notices=syncRoom(room,'host',{seq:1,sessionId:host.sessionId,actions:[command(room.world,'build-store')]},1000);assert.deepEqual(room.world.frontierTrade,before,kind);assert(notices.some(n=>n.includes('construction footprint')),`${kind}: ${notices}`);assert.equal(room.world.frontierTrade!.routes[0]!.embodied,0);valid(room.world);
 }
});
test('a completed finite store persists through import close and resume without mining again or recharging completed freight',async()=>{
 let s=readyStore();s=applyAction(s,command(s,'build-store'));const seconds=Math.ceil(plan(s).routes[0]!.travelSeconds*6+120);for(let i=0;i<seconds;i++)s={...s,frontierTrade:advanceRegionalTrade(s.frontierTrade!,1)};
 const route=s.frontierTrade!.routes[0]!;assert.equal(route.remaining,0);assert.equal(route.embodied,4);assert.equal(route.destinationStock,8);assert.equal(route.shipments,3);assert.equal(route.activity,'finished');assert(regionalTradeConservation(s.frontierTrade!).every(r=>r.balanced));valid(s);
 const f=fixture();try{const [host]=await expedition(f,s,1);assert(host);const before=copy(host.s.world.frontierTrade);assert.deepEqual(before,s.frontierTrade);await input(f,host,[command(host.s.world,'build-store')]);assert.deepEqual(host.s.world.frontierTrade,before);await f.raw(host.user,`/rooms/${host.s.roomId}/close`,{sessionId:host.s.sessionId});f.advance(86_400_000);const resumed=await f.raw(host.user,`/rooms/${host.s.roomId}/resume`,{});assert.equal(resumed.status,200);assert.deepEqual(resumed.body.world.frontierTrade,before);assert.deepEqual(resumed.body.world.frontierSupply,s.frontierSupply);assert.deepEqual(resumed.body.world.wilderness,s.wilderness);valid(f.stored(host.s.roomId).world);
 }finally{f.stop();}
});
function finishRoute(initial:State,index:number){
 let s=atCommand(initial,'start-source',index);s=applyAction(s,command(s,'start-source',index));s=atCommand(s,'clear-route',index);s=applyAction(s,command(s,'clear-route',index));
 const limit=Math.ceil(plan(s).routes[index]!.travelSeconds+120);for(let i=0;i<limit&&s.frontierTrade!.routes[index]!.destinationStock<plan(s).projects[index]!.cost;i++)s={...s,frontierTrade:advanceRegionalTrade(s.frontierTrade!,1)};
 s=atCommand(s,'build-store',index);s=applyAction(s,command(s,'build-store',index));for(let i=0;i<limit*6&&s.frontierTrade!.routes[index]!.activity!=='finished';i++)s={...s,frontierTrade:advanceRegionalTrade(s.frontierTrade!,1)};
 assert.equal(s.frontierTrade!.routes[index]!.activity,'finished');assert.equal(s.frontierTrade!.routes[index]!.destinationStock,8);valid(s);return s;
}
test('four-player reserve withdrawal races issue one shared credit and sequence or revision replay cannot pay again',async()=>{
 const f=fixture();try{const s=finishRoute(source(),0),peers=await expedition(f,s),host=peers[0]!,c=command(host.s.world,'withdraw-reserve'),expected=applyAction(host.s.world,c),hold=f.hold();assert.notEqual(expected.frontierTrade,host.s.world.frontierTrade);
 const pending=input(f,peers[1]!,[c]);await hold.waiting;try{await input(f,host,[c]);}finally{hold.release();}await pending;await Promise.all(peers.slice(2).map(p=>input(f,p,[c])));await Promise.all(peers.map(p=>current(f,p)));assert(f.conflicts()>0);
 for(const p of peers){assert.deepEqual(p.s.world.frontierTrade,expected.frontierTrade);assert.deepEqual(regionalTradeWithdrawn(p.s.world.frontierTrade),{wood:0,stone:8});assert.equal(p.s.world.frontierTrade!.routes[0]!.destinationStock,0);assert.equal(p.s.world.frontierTrade!.routes[0]!.embodied,4);assert(regionalTradeConservation(p.s.world.frontierTrade!).every(r=>r.balanced));assert.deepEqual(p.s.world.wilderness,s.wilderness);assert.deepEqual(p.s.world.inventory,s.inventory);valid(p.s.world);}
 const before=copy(host.s.world.frontierTrade);await input(f,host,[c]);await input(f,host,[command(host.s.world,'withdraw-reserve')]);assert.deepEqual(host.s.world.frontierTrade,before);const replay=await f.raw(host.user,`/rooms/${host.s.roomId}/sync`,{seq:host.s.ack,sessionId:host.s.sessionId,actions:[c]});assert.equal(replay.status,200);assert.deepEqual(replay.body.world.frontierTrade,before);
 }finally{f.stop();}
});
test('withdrawal neither creates a construction footprint nor spends the unchanged wilderness ledger',()=>{
 let s=finishRoute(source(),0);const box=regionalTradeConstructionBoxes(s.seed,plan(s).projects[0]!.id).find(b=>b.solid)!;s={...s,traversal:traversalFromBodies([{...traversalBodies(s)[0]!,x:box.center.x,y:box.center.y,z:box.center.z},...traversalBodies(s).slice(1)],s)!};valid(s);
 const room=createRoom('host','Host',s,1000),host=room.players[0]!,before=copy(regionalTradeObstacles(s.seed,s.frontierTrade!));const notices=syncRoom(room,'host',{seq:1,sessionId:host.sessionId,actions:[command(room.world,'withdraw-reserve')]},1000);assert.deepEqual(notices,[]);assert.deepEqual(regionalTradeWithdrawn(room.world.frontierTrade),{wood:0,stone:8});assert.deepEqual(regionalTradeObstacles(s.seed,room.world.frontierTrade!),before);assert.deepEqual(room.world.wilderness,s.wilderness);valid(room.world);
});
test('withdrawn quarry and timber reserve funds V31 collector delivery once under concurrent clients without double allocation',async()=>{
 let s=finishRoute(finishRoute(source(),0),1);s=applyAction(s,command(s,'withdraw-reserve',1));assert.deepEqual(regionalTradeWithdrawn(s.frontierTrade),{wood:8,stone:0});s=atCommand(s,'withdraw-reserve',0);
 const f=fixture();try{const peers=await expedition(f,s),host=peers[0]!;await input(f,host,[command(host.s.world,'withdraw-reserve')]);const credits=copy(host.s.world.frontierTrade),stored=f.stored(host.s.roomId),outpost=regionalSupplyPlan(s.seed).outposts[0]!;
 for(const p of stored.players){p.player={...p.player,x:outpost.deliveryPosition.x,z:outpost.deliveryPosition.z};p.motion=createVertical(worldHeight({...s,player:p.player},p.player.x,p.player.z));delete p.wildernessCollisionVersion;}stored.world={...stored.world,player:{...stored.players[0]!.player}};f.replace(stored);await Promise.all(peers.map(p=>current(f,p)));
 const c:CoopAction={type:'regional-supply',command:{type:'deliver',outpostId:outpost.id,expectedRevision:host.s.world.frontierSupply!.revision}},expected=applyAction(host.s.world,c);assert.notEqual(expected.frontierSupply,host.s.world.frontierSupply);const hold=f.hold(),pending=input(f,peers[1]!,[c]);await hold.waiting;try{await input(f,host,[c]);}finally{hold.release();}await pending;await Promise.all(peers.slice(2).map(p=>input(f,p,[c])));await Promise.all(peers.map(p=>current(f,p)));assert(f.conflicts()>0);
 for(const p of peers){assert.deepEqual(p.s.world.frontierSupply,expected.frontierSupply);assert.deepEqual(p.s.world.frontierTrade,credits);assert.deepEqual(p.s.world.wilderness,s.wilderness);assert.deepEqual(regionalSupplySpent(p.s.world.frontierSupply),outpost.cost);assert.deepEqual(regionalSupplyAvailable(p.s.world.frontierSupply,p.s.world.wilderness,p.s.world.frontierTrade),{wood:8-outpost.cost.wood,stone:8-outpost.cost.stone});valid(p.s.world);}
 const before=copy(host.s.world.frontierSupply);await input(f,host,[c]);await input(f,host,[{...c,command:{...c.command,expectedRevision:host.s.world.frontierSupply!.revision}}]);assert.deepEqual(host.s.world.frontierSupply,before);assert.deepEqual(host.s.world.frontierTrade,credits);
 const forged=copy(host.s.world);forged.frontierSupply!.outposts[0]!.delivered.wood+=1;assert.equal(validateSave(forged),false);assert.equal(parseSave(JSON.stringify(forged)),null);
 }finally{f.stop();}
});
