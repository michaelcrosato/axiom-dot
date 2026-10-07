import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {startingTown,newTownLayout,validTownLayout,TOWN_CENTER} from '../src/starting-town.ts';
import {townRoadRoute} from '../src/town-road-route.ts';
import {townLifeFacilities,createTownLifeOpening,advanceTownLife,validTownLife,TOWN_LIFE_ENGINE} from '../src/town-life.ts';
import {townNavigationClear,townLifeTaskPoint,townLifeDeparturePoint,townLifeWorkArea} from '../src/town-navigation.ts';
import {townResidents} from '../src/town-residents.ts';
import {createOrganicRegionalState,createRegionalState,enableStartingTown,validateSave,serializeSave,parseSave} from '../src/world.ts';
import {traversalBodies,traversalFromBodies} from '../src/traversal-world.ts';
import {townYards} from '../src/town-yards.ts';
import {generateRegionalChunk,regionalHeight,regionalObstaclesNear} from '../src/regional-world.ts';
import {createRegionalGenerator,validRegionalChunk,type RegionalPort} from '../src/regional-stream.ts';
import {saveKey,storeSession,savedWorlds,selectRegionalSeed,loadSession,restartSession} from '../src/session.ts';
import {createTownView as sourceView} from '../src/town-view.ts';
import {townLifePoses} from '../src/town-life-runtime.ts';
import {DEFAULT_TOWN_TUNING} from '../src/town-population.ts';
import {createRoom,syncRoom,snapshot,roomObstacles} from '../server/coop-authority.ts';
import {createVertical} from '../server/coop-vertical.ts';
const viewFactory:typeof sourceView=process.env.AXIOM_LAYOUT_VIEW?(await import(process.env.AXIOM_LAYOUT_VIEW))[process.env.AXIOM_LAYOUT_VIEW_EXPORT!]:sourceView;
const lifeEngine:typeof TOWN_LIFE_ENGINE=process.env.AXIOM_LAYOUT_LIFE?(await import(process.env.AXIOM_LAYOUT_LIFE))[process.env.AXIOM_LAYOUT_LIFE_EXPORT!]:TOWN_LIFE_ENGINE;
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const corpus=[0,1,2,7,17,42,99,1234,73129,100003,2147483647,4294967295];
class Store {data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);}get length(){return this.data.size;}key(i:number){return [...this.data.keys()][i]??null;}}

test('versioned organic parcels preserve exact legacy manifests, 100 identities and all service work/egress envelopes',()=>{
 const legacyHashes=['1ced73e3e5f7a253aec28c5e321f3b1f80aa748a3df38757469d9bd78094a84f','ce7bb7fb86af436ce13fdb1a7e9ee282de2a9691f14129e3e2767e30881f3d8c','7cdd29f22f637ea3379bd213b6841238c67bbe11f5c848f5ab1fc3799a68b8a0','7b1c797e607c07d938fa75967f4049faee8b747d001cb12bb10af692a84a1e0c'];
 [0,1,73129,4294967295].forEach((seed,i)=>assert.equal(digest(startingTown(seed)),legacyHashes[i]));
 const manifests=new Set<string>();
 for(const seed of corpus){
  const identity=newTownLayout(seed),plan=startingTown(seed,identity),legacy=startingTown(seed),roster=townResidents(seed),facilities=townLifeFacilities(seed,identity);manifests.add(identity.manifestHash);
  assert.deepEqual(newTownLayout(seed),identity);assert.equal(plan.homes.length,40);assert.equal(plan.shops.length,7);assert.equal(roster.length,100);
  assert.deepEqual(plan.homes.map(b=>b.id),legacy.homes.map(b=>b.id));assert.deepEqual(plan.shops.map(b=>b.id),legacy.shops.map(b=>b.id));assert.ok(new Set(plan.homes.map(h=>h.center.z)).size>30);assert.notDeepEqual(plan.homes.map(h=>h.entry),legacy.homes.map(h=>h.entry));
  const buildings=[...plan.homes,...plan.shops];for(let i=0;i<buildings.length;i++)for(let j=0;j<i;j++){const a=buildings[i]!.boxes.find(b=>b.id.endsWith('/roof'))!,b=buildings[j]!.boxes.find(b=>b.id.endsWith('/roof'))!;assert.ok(Math.abs(a.center.x-b.center.x)>=a.half.x+b.half.x+.1||Math.abs(a.center.z-b.center.z)>=a.half.z+b.half.z+.1,'separate roofs');}
  assert.deepEqual(facilities.filter(f=>f.kind!=='home'),townLifeFacilities(seed).filter(f=>f.kind!=='home'),'public paid-service coordinates intentionally retained');
  for(const f of facilities){
   for(let slot=0;slot<f.capacity;slot++)for(const action of f.actions)for(let stage=0;stage<3;stage++){const p=townLifeTaskPoint(f,slot,action,stage),d=townLifeDeparturePoint(f,p);assert.ok(townNavigationClear(plan,p,p),`${seed}/${f.id}/${slot}/${action}/${stage}`);assert.ok(townNavigationClear(plan,p,d),'clear egress');}
   for(const h of plan.homes){const route=townRoadRoute(plan,h.entry,f);assert.ok(route,`${seed}/${h.id}/${f.id}`);let p=h.entry;for(const q of route){assert.ok(townNavigationClear(plan,p,q));p=q;}}
  }
  for(const b of buildings){assert.ok(townNavigationClear(plan,b.entry,b.entry));assert.ok(townRoadRoute(plan,b.entry,plan.spawn));}
  for(const street of plan.streets!)for(const p of street.points){assert.ok(townNavigationClear(plan,p,p));assert.ok(townRoadRoute(plan,p,plan.spawn),'connected road vertices');}
  for(const yard of townYards(seed).yards){for(const b of plan.boxes)assert.ok(b.center.z+b.half.z<yard.bounds.minZ||b.center.x+b.half.x<yard.bounds.minX||b.center.x-b.half.x>yard.bounds.maxX);for(const f of facilities)assert.ok(townLifeWorkArea(f).maxZ<yard.bounds.minZ);}
 }
 assert.equal(manifests.size,corpus.length);
});

test('organic and occupied legacy slots coexist; strict imports retain layout, moved crates, households and current routes',()=>{
 const store=new Store(),legacy=enableStartingTown(createRegionalState(73129)),fresh=enableStartingTown(createOrganicRegionalState(73129)),bytes=serializeSave(legacy);storeSession(store,legacy,true);storeSession(store,fresh,true);
 assert.notEqual(saveKey(legacy),saveKey(fresh));assert.equal(store.getItem(saveKey(legacy)),bytes);assert.equal(savedWorlds(store).length,2);assert.deepEqual(selectRegionalSeed(store,73129),legacy);assert.deepEqual(loadSession(store),fresh);
 const bodies=traversalBodies(fresh);bodies[1]!.x+=.25;let world={...fresh,traversal:traversalFromBodies(bodies,fresh)!};world={...world,townLife:advanceTownLife(world.townLife!,20)};assert.ok(validateSave(world));assert.deepEqual(parseSave(serializeSave(world)),world);
 const reordered={...world,townLayout:{manifestHash:world.townLayout!.manifestHash,recipe:1 as const,version:3 as const}};assert.ok(validateSave(reordered));assert.ok(parseSave(JSON.stringify(reordered)));
 for(const townLayout of [null,{...world.townLayout,version:4},{...world.townLayout,recipe:2},{...world.townLayout,manifestHash:'bad'},{...world.townLayout,extra:true},newTownLayout(42)]){assert.equal(validateSave({...world,townLayout}),false);assert.equal(parseSave(JSON.stringify({...world,townLayout})),null);}
 const removed={...world};delete removed.townLayout;assert.equal(validateSave(removed),false);assert.equal(validateSave({...world,townLife:legacy.townLife}),false);
 const reset=restartSession(store,fresh);assert.deepEqual(reset.townLayout,fresh.townLayout);assert.equal(store.getItem(saveKey(legacy)),bytes);assert.deepEqual(traversalBodies(parseSave(serializeSave(world))!),bodies);
});

test('regional chunks, world heights and server collision resolve the same pinned parcel plan; stale layout results fail',async t=>{
 const seed=73129,identity=newTownLayout(seed),plan=startingTown(seed,identity);
 for(const [cx,cz] of [[-4,-4],[-3,-3],[-2,-2]]){const c=generateRegionalChunk(seed,cx!,cz!,identity);assert.ok(validRegionalChunk(c,seed,cx!,cz!,identity));assert.equal(validRegionalChunk(c,seed,cx!,cz!),false);assert.equal(validRegionalChunk(generateRegionalChunk(seed,cx!,cz!),seed,cx!,cz!,identity),false);for(let i=0;i<c.terrain.vertices.length;i+=3)assert.ok(Math.abs(c.terrain.vertices[i+1]!-regionalHeight(seed,c.terrain.vertices[i]!,c.terrain.vertices[i+2]!,identity))<1e-5);for(const b of c.structures.filter(b=>b.id.startsWith(plan.id)))assert.deepEqual(b,plan.boxes.find(q=>q.id===b.id));}
 let receive:RegionalPort['onmessage']=null;const sent:any[]=[];const port:RegionalPort={postMessage:v=>sent.push(v),terminate(){},get onmessage(){return receive;},set onmessage(v){receive=v;},onerror:null,onmessageerror:null};
 const generator=createRegionalGenerator(()=>port,identity);t.after(()=>generator.dispose());const pending=generator.request(seed,-3,-3);await Promise.resolve();const msg=sent[0];receive!({data:{type:'chunk',id:msg.id,seed,cx:-3,cz:-3,chunk:generateRegionalChunk(seed,-3,-3)}} as MessageEvent);await assert.rejects(pending,/Invalid regional worker result/);
 const world=enableStartingTown(createOrganicRegionalState(seed)),room=createRoom('host','Host',world,1000),obstacles=roomObstacles(room.world);const home=plan.homes[0]!.boxes[0]!;
 assert.ok(regionalObstaclesNear(seed,home.center.x,home.center.z,identity).some(b=>b.x===home.center.x&&b.z===home.center.z));assert.ok(obstacles.some(b=>b.x===home.center.x&&b.z===home.center.z));
 const host=room.players[0]!,entry=plan.shops[0]!.entry;host.player={...host.player,...entry};host.motion=createVertical(6);const command={type:'town-purchase' as const,command:{offerId:'arrival-kit',expectedRevision:0}};syncRoom(room,'host',{seq:1,sessionId:host.sessionId,actions:[command]},1000);assert.equal(room.world.town!.revision,1);syncRoom(room,'host',{seq:1,sessionId:host.sessionId,actions:[command]},1000);assert.equal(room.world.town!.revision,1);assert.deepEqual(snapshot(room,'host',1000).world.townLayout,identity);
});

test('actual regional generation worker reloads both layout identities without stale geometry reuse',async t=>{
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);parentPort.on('message',m=>self.onmessage({data:m}));import(${JSON.stringify(process.env.AXIOM_LAYOUT_WORKER??new URL('../src/regional.worker.ts',import.meta.url).href)}).then(()=>parentPort.postMessage({type:'boot'}));`,{eval:true,execArgv:['--experimental-strip-types']});t.after(()=>worker.terminate());
 const request=(m?:unknown)=>new Promise<any>((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);if(m)worker.postMessage(m);});await request();
 for(const [id,layout] of [undefined,newTownLayout(73129),undefined,newTownLayout(73129)].entries()){const m=await request({type:'generate',id,seed:73129,cx:-3,cz:-3,townLayout:layout});assert.equal(m.type,'chunk');assert.ok(validRegionalChunk(m.chunk,73129,-3,-3,layout));assert.deepEqual(m.chunk,generateRegionalChunk(73129,-3,-3,layout));}
});

test('organic authority achieves journeys and work for 100 residents; source or emitted matrices remain live at variable FPS',()=>{
 const seed=73129,identity=newTownLayout(seed);let life=createTownLifeOpening(seed,identity),built=lifeEngine.create(seed,identity);assert.deepEqual(built,life);const start=life.residents.map(r=>r.distance),plan=startingTown(seed,identity);
 for(let i=0;i<480;i++){const actors=i<40?[{id:'first',x:TOWN_CENTER.x-49.3,z:TOWN_CENTER.z},{id:'second',x:TOWN_CENTER.x+49.3,z:TOWN_CENTER.z}]:[];life=advanceTownLife(life,.5,undefined,actors);built=lifeEngine.advance(built,.5,undefined,actors);if(i%40===0){assert.deepEqual(built,life);assert.ok(validTownLife(life,seed));for(const r of life.residents)assert.ok(townNavigationClear(plan,r,r));}}
 assert.equal(life.residents.filter((r,i)=>r.distance-start[i]!>5).length,100,'every resident achieves walking');assert.equal(life.residents.filter(r=>r.completed>0).length,100,'every resident completes real activity');assert.ok(validateSave({...enableStartingTown(createOrganicRegionalState(seed)),townLife:life,townDirector:undefined})===false,'unknown present optional field rejected');
 for(const profile of [[.2],[1/15],[1/60],[.017,.12,.035,.2,.06]]){const view=viewFactory(seed,identity);let current=life,time=240,frame=0;const hashes=new Set<number>();view.update(time,TOWN_CENTER,()=>true,true,DEFAULT_TOWN_TUNING,true,0,[],false,townLifePoses(current));for(let elapsed=0;elapsed<4-1e-8;){const dt=Math.min(profile[frame++%profile.length]!,4-elapsed);current=advanceTownLife(current,dt);elapsed+=dt;time+=dt;const poses=townLifePoses(current)!;view.acceptLife(time,poses);view.update(time,TOWN_CENTER,()=>true,true,DEFAULT_TOWN_TUNING,false,dt,[],false,poses);for(const e of view.matrixEvidence())hashes.add(e.matrixHash);assert.equal(view.poses.length,100);}assert.ok(hashes.size>150,'actual matrices continue changing');assert.ok(view.poses.some(p=>p.speed>.1));view.dispose();}
});
