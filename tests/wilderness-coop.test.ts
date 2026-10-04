import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleCoop} from '../server/coop-api.ts';
import {createState,createConnectedState,validateSave,wildernessGatherContext,applyAction,worldEndpoints,type State} from '../src/world.ts';
import {worldHeight} from '../src/generation.ts';
import {wildernessFeatures,type WildernessFeature} from '../src/wilderness.ts';
import {dodecahedronObstacle} from '../src/wilderness-geometry.ts';
import {roomObstacles,createRoom,syncRoom,advanceRoom,joinRoom,playerMotion} from '../server/coop-authority.ts';
import {actorPathClear,convexFeetInterval,COOP_BODY} from '../server/coop-movement.ts';
import {createVertical,requestJump,stepVertical,moveVertical,supportBelow} from '../server/coop-vertical.ts';
import {clearPulsePath} from '../src/combat.ts';
import {encounterClear} from '../src/encounters.ts';
import {canGatherWilderness} from '../src/wilderness-state.ts';
import {action} from '../server/coop-validation.ts';
import type {D1Database,D1Statement} from '../server/coop-store.ts';
import type {CoopSnapshot,CoopAction,CoopMove} from '../src/coop-protocol.ts';

/** Real HTTP and SQLite CAS, with identities confined to this test server. */
async function fixture(){
 const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8'));
 const DB:D1Database={prepare(sql:string):D1Statement{let values:unknown[]=[];return {bind(...args:unknown[]){values=args;return this;},async first<T>(){return (sqlite.prepare(sql).get(...values as never[])??null) as T|null;},async all<T>(){return {results:sqlite.prepare(sql).all(...values as never[]) as T[]};},async run(){const r=sqlite.prepare(sql).run(...values as never[]);return {success:true,meta:{changes:Number(r.changes)}};}};}};
 let now=1_800_000_000_000,origin='';const server=createServer(async(req,res)=>{try{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk as Buffer);const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);const body=Buffer.concat(chunks).toString('utf8'),response=await handleCoop(new Request(`${origin}${req.url}`,{method:req.method,headers,...(body?{body}:{})}),{DB},now);res.writeHead(response?.status??404,Object.fromEntries(response?.headers??[]));res.end(await response?.text());}catch(e){res.writeHead(500);res.end(String(e));}});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert(address&&typeof address==='object');origin=`http://127.0.0.1:${address.port}`;
 const raw=async(user:string,path:string,body?:unknown)=>{const r=await fetch(`${origin}/api/coop${path}`,{method:body===undefined?'GET':'POST',headers:{'oai-authenticated-user-id':user,Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};};
 return {raw,sqlite,advance:(ms:number)=>{now+=ms;},stop:async()=>{await new Promise<void>(r=>server.close(()=>r()));sqlite.close();}};
}
const state=(generation:1|2)=>generation===2?createConnectedState(73129):createState(73129);
const at=(s:State,x:number,z:number)=>({...s,player:{...s.player,x,z}});
function clearFeature(s:State,kind:'tree'|'rock',small=false){
 const obstacles=roomObstacles(s);
 for(const feature of wildernessFeatures(s)){
  if(feature.kind!==kind||small&&(kind==='tree'?(feature.treeScale??2)>1.3:(feature.radius??2)>.8))continue;
  const solid=feature.solids[0]!,span=Math.max(solid.hx,solid.hz)+1,from={x:feature.x-span,z:feature.z},to={x:feature.x+span,z:feature.z},around=feature.z+solid.hz+COOP_BODY.radius+.4;
  const others=obstacles.filter(o=>o.featureId!==feature.id),g={obstacles,height:(x:number,z:number)=>worldHeight(s,x,z)},m=createVertical(g.height(from.x,from.z));
  if(!actorPathClear({...from,y:m.feetY},{...from,y:m.feetY},obstacles,false)||!actorPathClear({...to,y:g.height(to.x,to.z)},{...to,y:g.height(to.x,to.z)},obstacles,false))continue;
  if(!actorPathClear({...from,y:m.feetY},{...to,y:g.height(to.x,to.z)},others,false)||moveVertical({...m},from,to,g))continue;
  const route=[from,{x:from.x,z:around},{x:to.x,z:around},to];let ok=true;for(let i=1;i<route.length;i++)if(!moveVertical(m,route[i-1]!,route[i]!,g)){ok=false;break;}
  if(ok)return {feature,from,to,route};
 }
 throw new Error(`No isolated ${small?'small ':''}${kind} route in generation ${s.generation}`);
}
async function host(f:Awaited<ReturnType<typeof fixture>>,world:State){const r=await f.raw('host','/rooms',{name:'Host',world});assert.equal(r.status,201,JSON.stringify(r.body));return r.body as CoopSnapshot;}
async function send(f:Awaited<ReturnType<typeof fixture>>,s:CoopSnapshot,actions:CoopAction[]=[],move?:CoopMove,user='host'){const r=await f.raw(user,`/rooms/${s.roomId}/sync`,{seq:s.ack+1,sessionId:s.sessionId,actions,...(move?{move}:{})});assert.equal(r.status,200,JSON.stringify(r.body));return r.body as CoopSnapshot;}

for(const generation of [1,2] as const){
 test(`generation ${generation} server catalog includes every actual tree and rock with exact feature identity`,()=>{
  const s=state(generation),catalog=wildernessFeatures(s),obstacles=roomObstacles(s);assert(catalog.some(f=>f.kind==='tree'));assert(catalog.some(f=>f.kind==='rock'));
  for(const f of catalog){assert.deepEqual(obstacles.filter(o=>o.featureId===f.id),f.solids);if(f.kind==='rock')assert(f.solids.every(o=>o.convexPlanes?.length&&o.convexVertices?.length));}
 });
 for(const kind of ['tree','rock'] as const)test(`generation ${generation} HTTP sprint cannot cross ${kind}; a real route around remains open`,async()=>{
  const f=await fixture();try{const source=state(generation),path=clearFeature(source,kind,kind==='tree');let s=await host(f,at(source,path.from.x,path.from.z));const initial={...s.world.player};
   f.advance(800);s=await send(f,s,[],{...path.to,y:999,grounded:false,crouched:false,facing:0});assert.equal(s.world.player.x,initial.x);assert.equal(s.world.player.z,initial.z);assert(s.motion.feetY<100,'claimed height cannot fly through a solid');
   for(const point of path.route.slice(1)){f.advance(800);s=await send(f,s,[],{...point,y:-999,grounded:true,crouched:false,facing:0});assert(Math.hypot(s.world.player.x-point.x,s.world.player.z-point.z)<1e-6);}
   assert(validateSave(s.world));
  }finally{await f.stop();}
 });
 test(`generation ${generation} concurrent tree gather commits one deadwood yield and keeps its trunk`,async()=>{
  const f=await fixture();try{const source=state(generation),path=clearFeature(source,'tree',true);let s=await host(f,at(source,path.from.x,path.from.z));const peers=[{user:'host',s}];for(let i=1;i<4;i++){const r=await f.raw(`guest-${i}`,'/join',{name:`Guest ${i}`,code:s.code});assert.equal(r.status,200);peers.push({user:`guest-${i}`,s:r.body});}
   await Promise.all(peers.map(p=>send(f,p.s,[{type:'gather-wilderness',id:path.feature.id}],undefined,p.user)));
   const current=await f.raw('host',`/rooms/${s.roomId}`);s=current.body;assert.equal(s.world.wilderness?.wood,1);assert.equal(s.world.wilderness?.stone,0);assert.equal(s.world.wilderness?.harvested.filter(id=>id===path.feature.id).length,1);assert(roomObstacles(s.world).some(o=>o.featureId===path.feature.id));assert(validateSave(s.world));
   const replay=await f.raw('host',`/rooms/${s.roomId}/sync`,{seq:1,sessionId:s.sessionId,actions:[{type:'gather-wilderness',id:path.feature.id}]});assert.equal(replay.status,200);assert.equal(replay.body.world.wilderness.wood,1);
   const row=f.sqlite.prepare('SELECT body FROM axiom_coop_rooms WHERE id = ?').get(s.roomId)!;assert.equal(JSON.parse(String(row.body)).world.wilderness.wood,1);
  }finally{await f.stop();}
 });
}

test('convex rocks preserve empty bounding-box corners, raised paths and tight low support',()=>{
 const rock=dodecahedronObstacle('test-rock',0,.26,0,.6,{x:1,y:.5,z:1}),g={obstacles:[rock],height:()=>0},from={x:0,z:-2},m=createVertical(0);
 assert.equal(actorPathClear({...from,y:0},{x:0,y:0,z:2},[rock],false),false);
 assert.equal(actorPathClear({...from,y:1.2},{x:0,y:1.2,z:2},[rock],false),true);
 requestJump(m,'low-stone');for(let i=0;i<15;i++)stepVertical(m,from.x,from.z,g);assert(moveVertical(m,from,{x:0,z:0},g));for(let i=0;i<60;i++)stepVertical(m,0,0,g);assert(m.grounded);assert(m.feetY>.35&&m.feetY<=rock.y+rock.hy+.001);assert(Math.abs(m.feetY-supportBelow(0,0,m.feetY,g))<1e-6);
 let found=false;for(let x=.3;x<=1;x+=.02)for(let z=.3;z<=1;z+=.02){const feet={x,y:0,z};if(actorPathClear(feet,feet,[rock],false)&&!actorPathClear(feet,feet,[{...rock,convexPlanes:undefined,convexVertices:undefined}],false))found=true;}assert(found,'convex hull must release real empty corner space');
 const edge=convexFeetInterval(rock.hx+.1,0,rock);if(edge)assert(edge.top<rock.y+rock.hy,'sloping edge support must not create a flat invisible box top');
});

test('canopy space is clear above a trunk and convex combat/sentry sight does not become a box',()=>{
 const s=state(1),tree=wildernessFeatures(s).find(f=>f.kind==='tree')!,trunk=tree.solids[0]!,high=trunk.y+trunk.hy+.1;assert(actorPathClear({x:tree.x-2,y:high,z:tree.z},{x:tree.x+2,y:high,z:tree.z},tree.solids,false));
 const rock=dodecahedronObstacle('sight-rock',0,1,0,1,{x:1,y:1,z:1});let found=false;for(let x=.4;x<1.2;x+=.02){const a={x,y:1,z:.9},b={x:x+.01,y:1,z:.9};const clear=clearPulsePath({...a,y:a.y-1},{...b,y:b.y-1},[rock]);if(clear&&!clearPulsePath({...a,y:a.y-1},{...b,y:b.y-1},[{...rock,convexPlanes:undefined,convexVertices:undefined}])){assert(encounterClear({...a,y:a.y-.7},{...b,y:b.y-.7},[rock]));found=true;break;}}assert(found);
});

test('gather input has no inventory/height escape hatch and authoritative distance rejects remote claims',()=>{
 assert(action({type:'gather-wilderness',id:'tree-1'}));for(const extra of [{wood:99},{stone:99},{y:0},{feetY:0},{harvested:[]}])assert.equal(action({type:'gather-wilderness',id:'tree-1',...extra}),null);
 const s=state(1),feature=wildernessFeatures(s).find(f=>Math.hypot(f.x-s.player.x,f.z-s.player.z)>10)!,room=createRoom('host','Host',s,1000),p=room.players[0]!;
 const notices=syncRoom(room,'host',{seq:1,sessionId:p.sessionId,actions:[{type:'gather-wilderness',id:feature.id}],move:{x:p.player.x,z:p.player.z,y:feature.y,grounded:true,crouched:false,facing:0}},1000);assert(!room.world.wilderness?.harvested.includes(feature.id));assert(notices.length);
});

for(const generation of [1,2] as const)test(`generation ${generation} gathered small stones disappear while larger rock remains solid`,async()=>{
 const f=await fixture();try{const source=state(generation);
  for(const removable of [true,false]){
   let candidate:{feature:WildernessFeature;world:State}|undefined;
   for(const feature of wildernessFeatures(source).filter(f=>f.kind==='rock'&&f.harvestable&&f.removable===removable)){
    const o=feature.solids[0]!;for(const side of [-1,1]){const world=at(source,feature.x+side*(o.hx+.6),feature.z),feetY=worldHeight(world,world.player.x,world.player.z),feet={...world.player,y:feetY};
     if(actorPathClear(feet,feet,roomObstacles(world),false)&&canGatherWilderness(wildernessGatherContext(world,{feetY}),feature.id)){candidate={feature,world};break;}
    }if(candidate)break;
   }
   assert(candidate,`reachable ${removable?'small':'large'} rock`);let s=await host(f,candidate.world);s=await send(f,s,[{type:'gather-wilderness',id:candidate.feature.id},{type:'gather-wilderness',id:candidate.feature.id}]);
   assert.equal(s.world.wilderness?.stone,1);assert.equal(s.world.wilderness?.harvested.length,1);assert.equal(roomObstacles(s.world).some(o=>o.featureId===candidate.feature.id),!removable);assert(validateSave(s.world));
  }
 }finally{await f.stop();}
});

test('server staff contact is accepted once per active stage and never grants wilderness goods',()=>{
 const source=state(1),path=clearFeature(source,'tree',true),room=createRoom('host','Host',at(source,path.from.x,path.from.z),1000),p=room.players[0]!;
 syncRoom(room,'host',{seq:1,sessionId:p.sessionId,actions:[{type:'attack-press'},{type:'gather-wilderness',id:path.feature.id}],move:{...path.from,y:999,grounded:true,crouched:false,facing:Math.PI/2}},1000);
 assert(!p.combo.hitIds.includes(path.feature.id));assert(!room.world.wilderness);
 advanceRoom(room,1200);assert.equal(p.combo.hitIds.filter(id=>id===path.feature.id).length,1);assert(!room.world.wilderness);
 const attackId=p.combo.attackId;syncRoom(room,'host',{seq:1,sessionId:p.sessionId,actions:[{type:'attack-press'}]},1220);assert.equal(p.combo.attackId,attackId);assert.equal(p.combo.hitIds.filter(id=>id===path.feature.id).length,1);
 advanceRoom(room,1250);assert.equal(p.combo.hitIds.filter(id=>id===path.feature.id).length,1);assert(!room.world.wilderness);
});

test('jump, crouch and a real high server elevation cannot collect using a forged grounded pose',()=>{
 const source=state(1),path=clearFeature(source,'tree',true);
 for(const condition of ['jump','crouch','high'] as const){const room=createRoom('host','Host',at(source,path.from.x,path.from.z),1000),p=room.players[0]!;
  if(condition==='high')p.motion!.feetY+=10;
  const notices=syncRoom(room,'host',{seq:1,sessionId:p.sessionId,actions:[...(condition==='jump'?[{type:'jump-press' as const,intentId:'no-air-gather'}]:[]),{type:'gather-wilderness',id:path.feature.id}],move:{...path.from,y:0,grounded:true,crouched:condition==='crouch',facing:0}},1000);
  assert(!room.world.wilderness?.harvested.includes(path.feature.id));assert(notices.length,condition);
 }
});

for(const generation of [1,2] as const)test(`generation ${generation} old rooms recover an overlapping actor deterministically without client coordinates`,()=>{
 const source=state(generation),path=clearFeature(source,'tree',true),spawn=at(source,path.from.x,path.from.z),room=createRoom('host','Host',spawn,1000),p=room.players[0]!;
 const originalPose={...p.pose},originalMotion={...p.motion!};delete p.wildernessCollisionVersion;playerMotion(room,p);assert.deepEqual(p.pose,originalPose);assert.deepEqual(p.motion,originalMotion,'a valid pose and live jump clocks remain untouched');
 p.player={...p.player,x:path.feature.x,z:path.feature.z};p.motion=createVertical(worldHeight(source,p.player.x,p.player.z));delete p.wildernessCollisionVersion;
 const copy=structuredClone(room),old={...p.player};joinRoom(room,'host','Host',1000);joinRoom(copy,'host','Host',1000);
 assert.deepEqual(p.player,copy.players[0]!.player);assert(Math.hypot(p.player.x-old.x,p.player.z-old.z)>0);assert(Math.hypot(p.player.x-old.x,p.player.z-old.z)<=12);
 const feet={...p.player,y:p.motion!.feetY};assert(actorPathClear(feet,feet,roomObstacles({...room.world,player:p.player}),p.motion!.crouched));assert(p.motion!.grounded);assert.equal(p.wildernessCollisionVersion,1);
 const recovered={...p.player};syncRoom(room,'host',{seq:1,sessionId:p.sessionId,actions:[],move:{x:999,z:999,y:999,grounded:false,crouched:false,facing:0}},1000);assert.deepEqual(p.player,recovered,'migration does not grant extra movement time');
});


test('all six legacy huts retain online movement, staff sight and sentry blockers beside wilderness',async()=>{
 const f=await fixture();try{const source=state(1),obstacles=roomObstacles(source);
  for(const [x,z]of [[-20,-7],[-12,-8],[-23,1],[17,-19],[24,-19],[25,-11]]){
   assert(obstacles.some(o=>o.x===x&&o.z===z&&o.hx===1.9&&o.hz===1.7&&o.hy===2&&!o.featureId),`hut ${x},${z} retains authored collider`);
   const from={x:x!-3.25,y:0,z:z!},to={x:x!+3.25,y:0,z:z!};assert.equal(actorPathClear(from,to,obstacles,false),false);assert.equal(clearPulsePath(from,to,obstacles),false);assert.equal(encounterClear(from,to,obstacles),false);
   let s=await host(f,at(source,from.x,from.z));const before={...s.world.player};f.advance(800);s=await send(f,s,[],{...to,y:999,grounded:false,crouched:false,facing:Math.PI/2});assert.deepEqual(s.world.player,before,`HTTP sprint cannot cross hut ${x},${z}`);
  }
 }finally{await f.stop();}
});


for(const [generation,seed]of [[1,17],[1,85],[1,147],[2,73129]] as const)test(`HTTP generation ${generation} seed ${seed} exits and recall recheck pinned wilderness after prior migration`,async()=>{
 const f=await fixture();try{const source=generation===1?createState(seed):createConnectedState(seed),entrance=worldEndpoints(source).entrance,dungeon=applyAction(at(source,entrance.x,entrance.z),{type:'enter'});assert.equal(dungeon.zone,'dungeon');
  let s=await host(f,dungeon);s=await send(f,s,[{type:'exit'}]);assert.equal(s.world.zone,'valley');
  const clearAndWalk=async(snapshot:CoopSnapshot)=>{
   const feet={x:snapshot.world.player.x,y:snapshot.motion.feetY,z:snapshot.world.player.z},g={obstacles:roomObstacles(snapshot.world),height:(x:number,z:number)=>worldHeight(snapshot.world,x,z)};
   assert(actorPathClear(feet,feet,g.obstacles,snapshot.motion.crouched),'accepted destination must be outside every current solid');
   let goal:{x:number;z:number}|undefined;for(let i=0;i<32;i++){const angle=i*Math.PI/16,next={x:feet.x+Math.cos(angle)*.6,z:feet.z+Math.sin(angle)*.6},trial={...createVertical(feet.y,snapshot.motion.crouched)};if(moveVertical(trial,feet,next,g)){goal=next;break;}}
   assert(goal,'a destination must permit an ordinary step away');f.advance(250);const result=await send(f,snapshot,[],{...goal,y:999,grounded:false,crouched:false,facing:0});assert(Math.hypot(result.world.player.x-goal.x,result.world.player.z-goal.z)<1e-6);return result;
  };
  if(generation===1){const original=worldEndpoints(source).return;assert(!actorPathClear({...original,y:0},{...original,y:0},roomObstacles(source),false),'pinned legacy reproducer overlaps its old return');assert(Math.hypot(s.world.player.x-original.x,s.world.player.z-original.z)>0);}
  s=await clearAndWalk(s);
  if(generation===1){
   // A room saved by the earlier exit path may already carry its migration marker.
   const row=f.sqlite.prepare('SELECT body FROM axiom_coop_rooms WHERE id = ?').get(s.roomId)!,saved=JSON.parse(String(row.body)),point=worldEndpoints(source).return;
   saved.world.player={...saved.world.player,...point};saved.players[0].player={...saved.players[0].player,...point};Object.assign(saved.players[0].motion,{feetY:0,vy:0,grounded:true,crouched:false});saved.players[0].wildernessCollisionVersion=1;
   f.sqlite.prepare('UPDATE axiom_coop_rooms SET body = ? WHERE id = ?').run(JSON.stringify(saved),s.roomId);
   const resumed=await f.raw('host',`/rooms/${s.roomId}/resume`,{});assert.equal(resumed.status,200);s=await clearAndWalk(resumed.body);
  }
  // Load a durable server-dead actor, as after an underground encounter. Browser data never writes HP.
  let dead=await host(f,dungeon);const row=f.sqlite.prepare('SELECT body FROM axiom_coop_rooms WHERE id = ?').get(dead.roomId)!,room=JSON.parse(String(row.body));room.world.player.hp=0;room.players[0].player.hp=0;assert.equal(room.players[0].wildernessCollisionVersion,1);f.sqlite.prepare('UPDATE axiom_coop_rooms SET body = ? WHERE id = ?').run(JSON.stringify(room),dead.roomId);
  dead=await send(f,dead,[{type:'respawn'}]);assert.equal(dead.world.zone,'valley');assert.equal(dead.world.player.hp,100);await clearAndWalk(dead);assert(validateSave(dead.world));
 }finally{await f.stop();}
});
