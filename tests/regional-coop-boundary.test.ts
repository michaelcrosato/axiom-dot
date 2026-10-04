import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createRoom,joinRoom,playerMotion,syncRoom,snapshot,type CoopRoom} from '../server/coop-authority.ts';
import {createVertical} from '../server/coop-vertical.ts';
import {handleCoop} from '../server/coop-api.ts';
import {createState,createConnectedState,createRegionalState,validateSave,worldBound,worldEndpoints,type State} from '../src/world.ts';
import {worldHeight} from '../src/generation.ts';
import {REGION_BOUND} from '../src/regional-world.ts';
import {REGIONAL_PLAYER_MARGIN,REGIONAL_PLAYER_RADIUS,REGIONAL_PLAYER_SKIN,regionalCenterBound} from '../src/regional-bounds.ts';
import type {D1Database,D1Statement} from '../server/coop-store.ts';
import type {CoopSnapshot} from '../src/coop-protocol.ts';
const LIMIT=regionalCenterBound(REGION_BOUND);
const at=(s:State,x:number,z:number):State=>({...s,player:{...s.player,x,z}});
const directions=[{name:'east edge',x:1,z:0},{name:'west edge',x:-1,z:0},{name:'north edge',x:0,z:1},{name:'south edge',x:0,z:-1},{name:'north-east corner',x:1,z:1},{name:'north-west corner',x:-1,z:1},{name:'south-east corner',x:1,z:-1},{name:'south-west corner',x:-1,z:-1}];
function bounded(room:CoopRoom){
 for(const p of room.players){const m=playerMotion(room,p);assert(Math.abs(p.player.x)<=LIMIT&&Math.abs(p.player.z)<=LIMIT);assert(Math.abs(p.player.x)+REGIONAL_PLAYER_RADIUS+REGIONAL_PLAYER_SKIN<=REGION_BOUND);assert(Math.abs(p.player.z)+REGIONAL_PLAYER_MARGIN<=REGION_BOUND);assert.equal(p.pose.x,p.player.x);assert.equal(p.pose.z,p.player.z);assert.equal(p.pose.y,m.feetY);}
}
for(const direction of directions)test(`online ${direction.name}: 30 seconds outward movement contains the entire capsule through jump/crouch and permits tangent glide`,t=>{
 const world=at(createRegionalState(73129),direction.x*(REGION_BOUND-2),direction.z*(REGION_BOUND-2)),room=createRoom('host','Host',world,1000),p=room.players[0]!;
 let now=1000,sawAir=false,sawCrouch=false;
 for(let i=0;i<120;i++){
  now+=250;const crouched=i>=40&&i<80,jump=i===12||i===52||i===92;
  syncRoom(room,'host',{seq:p.seq+1,sessionId:p.sessionId,actions:jump?[{type:'jump-press',intentId:`boundary-jump-${i}`}]:[],move:{x:p.player.x+direction.x*4,z:p.player.z+direction.z*4,y:i%2?999:-999,grounded:false,crouched,facing:0}},now);
  bounded(room);sawAir||=!p.motion!.grounded;sawCrouch||=p.motion!.crouched;
  if(p.motion!.grounded)assert(Math.abs(p.motion!.feetY-worldHeight(room.world,p.player.x,p.player.z))<1e-6,'normalized outward motion stays on real terrain');
  assert.equal(p.player.hp,100);assert(Math.abs(p.motion!.feetY)<200,'claimed client elevation has no authority');
 }
 assert(sawAir&&sawCrouch);assert.equal(p.motion!.jumpId,3);assert(p.motion!.grounded);assert.equal(p.motion!.crouched,false);
 if(direction.x)assert.equal(p.player.x,direction.x*LIMIT);if(direction.z)assert.equal(p.player.z,direction.z*LIMIT);
 // Keep pressure on one wall while asking for a real tangential displacement.
 // At a corner the tangent points inward from the second wall.
 const wallAxis=direction.x?'x':'z',tangentAxis=wallAxis==='x'?'z':'x',wallSign=direction[wallAxis],tangentSign=direction[tangentAxis]?-direction[tangentAxis]:1,start=p.player[tangentAxis];
 for(let i=0;i<12;i++){
  now+=250;const next={x:p.player.x,z:p.player.z};next[wallAxis]+=wallSign*4;next[tangentAxis]+=tangentSign;
  syncRoom(room,'host',{seq:p.seq+1,sessionId:p.sessionId,actions:[],move:{...next,y:999,grounded:false,crouched:i>=4&&i<8,facing:0}},now);
  bounded(room);assert.equal(p.player[wallAxis],wallSign*LIMIT);assert(p.motion!.grounded,'wall-normal clipping must not manufacture free fall');
 }
 const glide=(p.player[tangentAxis]-start)*tangentSign;assert(glide>8,`tangent glide only advanced ${glide}m`);assert(glide<=9.600001);assert(validateSave(room.world));
 t.diagnostic(`${direction.name}: 120 outward polls / 30 simulation seconds, 3 accepted jumps, ${glide.toFixed(3)}m tangent glide; center limit ${LIMIT}`);
});

test('regional imports, already-migrated saved actors, rejoin and guest placement share the capsule center bound',()=>{
 for(const direction of directions){
  const world=at(createRegionalState(73129),direction.x*REGION_BOUND,direction.z*REGION_BOUND);assert(validateSave(world),'old extent remains a valid saved world');
  const room=createRoom('host','Host',world,1000),p=room.players[0]!;bounded(room);if(direction.x)assert.equal(p.player.x,direction.x*LIMIT);if(direction.z)assert.equal(p.player.z,direction.z*LIMIT);
  assert.equal(p.motion!.feetY,worldHeight(room.world,p.player.x,p.player.z));
  // Reproduce a durable room from the old version, including its completed
  // migration marker. No incoming client movement chooses this recovery.
  p.player={...p.player,x:world.player.x,z:world.player.z};p.pose={...p.pose,x:p.player.x,z:p.player.z};p.motion=createVertical(worldHeight(world,p.player.x,p.player.z));p.wildernessCollisionVersion=1;room.world={...room.world,player:{...p.player}};
  snapshot(room,'host',1000);bounded(room);assert.equal(p.motion!.feetY,worldHeight(room.world,p.player.x,p.player.z));assert.deepEqual(room.world.player,p.player);
  const guest=joinRoom(room,'guest','Guest',1000);bounded(room);assert.deepEqual(guest.player,p.player);assert.equal(guest.motion!.feetY,p.motion!.feetY);
  guest.player={...guest.player,x:-REGION_BOUND,z:REGION_BOUND};guest.motion=createVertical(worldHeight(room.world,guest.player.x,guest.player.z));guest.wildernessCollisionVersion=1;joinRoom(room,'guest','Guest',1000);bounded(room);assert.equal(guest.player.x,-LIMIT);assert.equal(guest.player.z,LIMIT);
 }
});

test('regional snapshot/rejoin normalization preserves genuine airborne elevation, velocity and jump history',()=>{
 const world=at(createRegionalState(73129),REGION_BOUND-2,-REGION_BOUND+2),room=createRoom('host','Host',world,1000),p=room.players[0]!;
 p.player={...p.player,x:REGION_BOUND,z:-REGION_BOUND};p.pose={...p.pose,x:p.player.x,z:p.player.z};p.motion={...createVertical(worldHeight(world,p.player.x,p.player.z)+1.2),grounded:false,vy:-2.5,coyote:0,buffer:0,jumpId:7,landingId:3,lastJumpIntent:'preserved-flight',jumpStatus:'launched'};p.wildernessCollisionVersion=1;
 const airborne=structuredClone(p.motion);snapshot(room,'host',1000);bounded(room);assert.deepEqual(p.motion,airborne);assert.equal(p.player.x,LIMIT);assert.equal(p.player.z,-LIMIT);
 joinRoom(room,'host','Host',1000);bounded(room);assert.equal(p.motion!.feetY,airborne.feetY);assert.equal(p.motion!.vy,airborne.vy);assert.equal(p.motion!.grounded,false);assert.equal(p.motion!.jumpId,7);assert.equal(p.motion!.landingId,3);
 syncRoom(room,'host',{seq:1,sessionId:p.sessionId,actions:[],move:{x:10000,z:-10000,y:999,grounded:true,crouched:true,facing:0}},1000);bounded(room);assert.equal(p.motion!.feetY,airborne.feetY);assert.equal(p.motion!.vy,airborne.vy);assert.equal(p.motion!.grounded,false,'forged grounded input cannot settle the accepted fall');
});

test('regional respawn stays safe and legacy or underground worlds retain their previous limits',()=>{
 const world=at(createRegionalState(73129),REGION_BOUND,-REGION_BOUND),room=createRoom('host','Host',{...world,player:{...world.player,hp:0}},1000),p=room.players[0]!;
 syncRoom(room,'host',{seq:1,sessionId:p.sessionId,actions:[{type:'respawn'}]},1000);bounded(room);assert.equal(p.player.hp,100);assert.deepEqual({x:p.player.x,z:p.player.z},{x:worldEndpoints(world).spawn.x,z:worldEndpoints(world).spawn.z});
 for(const original of [createState(73129),createConnectedState(73129)]){
  const bound=worldBound(original),legacy=at(original,bound,bound),old=createRoom('legacy','Legacy',legacy,1000),actor=old.players[0]!;
  assert.equal(actor.player.x,bound);assert.equal(actor.player.z,bound);
  syncRoom(old,'legacy',{seq:1,sessionId:actor.sessionId,actions:[],move:{x:10000,z:10000,y:999,grounded:false,crouched:false,facing:0}},1800);
  assert.equal(actor.player.x,bound);assert.equal(actor.player.z,bound);assert.equal(old.world.regional,undefined);
 }
 const underground={...createRegionalState(73129),zone:'dungeon' as const},bound=worldBound(underground),old=createRoom('underground','Underground',at(underground,bound,bound),1000);
 assert.equal(old.players[0]!.player.x,bound);assert.equal(old.players[0]!.player.z,bound,'regional marker does not change underground bounds');
});

function fixture(){
 const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8'));
 const DB:D1Database={prepare(sql:string):D1Statement{let values:unknown[]=[];return {bind(...args:unknown[]){values=args;return this;},async first<T>(){return (sqlite.prepare(sql).get(...values as never[])??null) as T|null;},async all<T>(){return {results:sqlite.prepare(sql).all(...values as never[]) as T[]};},async run(){const r=sqlite.prepare(sql).run(...values as never[]);return {success:true,meta:{changes:Number(r.changes)}};}};}};
 const origin='https://axiom-tests.invalid';let now=1_800_000_000_000;
 return {sqlite,advance:(ms:number)=>{now+=ms;},stop:()=>sqlite.close(),async raw(user:string,path:string,body?:unknown){const response=await handleCoop(new Request(`${origin}/api/coop${path}`,{method:body===undefined?'GET':'POST',headers:{'oai-authenticated-user-id':user,Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}),{DB},now);assert(response);return {status:response.status,body:await response.json()};}};
}
test('real API import and durable resume normalize old edge poses; genuinely outside or nonfinite imports and moves are rejected',async()=>{
 const f=fixture();try{
  const source=createRegionalState(73129);
  for(const point of [{x:REGION_BOUND+.01,z:0},{x:Infinity,z:0},{x:0,z:NaN}])assert.equal((await f.raw('host','/rooms',{name:'Host',world:at(source,point.x,point.z)})).status,400);
  const created=await f.raw('host','/rooms',{name:'Host',world:at(source,REGION_BOUND,REGION_BOUND)});assert.equal(created.status,201);let s=created.body as CoopSnapshot;assert.equal(s.world.player.x,LIMIT);assert.equal(s.world.player.z,LIMIT);
  const row=f.sqlite.prepare('SELECT body FROM axiom_coop_rooms WHERE id = ?').get(s.roomId)!,stored=JSON.parse(String(row.body)) as CoopRoom,p=stored.players[0]!;
  p.player={...p.player,x:-REGION_BOUND,z:REGION_BOUND};stored.world.player={...p.player};p.pose={...p.pose,x:p.player.x,z:p.player.z};p.motion=createVertical(worldHeight(stored.world,p.player.x,p.player.z));p.wildernessCollisionVersion=1;
  f.sqlite.prepare('UPDATE axiom_coop_rooms SET body = ? WHERE id = ?').run(JSON.stringify(stored),s.roomId);
  const read=await f.raw('host',`/rooms/${s.roomId}`);assert.equal(read.status,200);assert.equal(read.body.world.player.x,-LIMIT);assert.equal(read.body.world.player.z,LIMIT);assert.equal(read.body.motion.feetY,worldHeight(source,-LIMIT,LIMIT));
  const resumed=await f.raw('host',`/rooms/${s.roomId}/resume`,{name:'Host'});assert.equal(resumed.status,200);s=resumed.body;
  const persisted=JSON.parse(String(f.sqlite.prepare('SELECT body FROM axiom_coop_rooms WHERE id = ?').get(s.roomId)!.body)) as CoopRoom;bounded(persisted);assert.equal(persisted.world.player.x,-LIMIT);
  const invalidMove=await f.raw('host',`/rooms/${s.roomId}/sync`,{seq:s.ack+1,sessionId:s.sessionId,actions:[],move:{x:null,z:LIMIT,y:999,grounded:true,crouched:false,facing:0}});assert.equal(invalidMove.status,400);
  f.advance(250);const moved=await f.raw('host',`/rooms/${s.roomId}/sync`,{seq:s.ack+1,sessionId:s.sessionId,actions:[{type:'jump-press',intentId:'edge-http-jump'}],move:{x:-10000,z:10000,y:999,grounded:true,crouched:false,facing:0}});assert.equal(moved.status,200);assert.equal(moved.body.world.player.x,-LIMIT);assert.equal(moved.body.world.player.z,LIMIT);assert.equal(moved.body.motion.grounded,false);assert.equal(moved.body.motion.jumpId,1);assert(moved.body.motion.feetY<100);
 }finally{f.stop();}
});
