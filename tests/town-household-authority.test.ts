import {townLifePoses} from '../src/town-life-runtime.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {TownCrowd,slideTownCrowd,townClock,townPathClear,clearTownBody} from '../src/town-crowd.ts';
import {townResidents,townResidentPose,townHouseholds,TOWN_RESIDENT_CYCLE_SECONDS} from '../src/town-residents.ts';
import {startingTown,TOWN_CENTER,TOWN_LAYOUT_VERSION,safeTownPosition} from '../src/starting-town.ts';
import {generateRegionalChunk} from '../src/regional-world.ts';
import {createRegionalState,enableStartingTown,applyAction,serializeSave,parseSave,validateSave} from '../src/world.ts';
import {createRoom,makePlayer,playerMotion,syncRoom} from '../server/coop-authority.ts';
import {createVertical} from '../server/coop-vertical.ts';
import {regionalPhysics} from './helpers/regional-physics.ts';

const seed=73129,homeTime=30;
const distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
const cells=(x:number,z:number)=>{
 const out=[];
 for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
  const c=generateRegionalChunk(seed,Math.floor(x/64)+dx,Math.floor(z/64)+dz);
  out.push({key:'region:'+c.key,revision:1,bounds:c.bounds,terrain:c.terrain,
   obstacles:[...c.structures.filter(s=>s.solid).map(s=>({x:s.center.x,y:s.center.y,z:s.center.z,hx:s.half.x,hy:s.half.y,hz:s.half.z})),...c.features.flatMap(f=>f.solids)]});
 }
 return out;
};
const outerResident=(side:-1|1)=>{
 const plan=startingTown(seed),resident=townResidents(seed).find(r=>r.homeIndex>=20
  &&Math.sign(plan.homes[r.homeIndex]!.entry.z-TOWN_CENTER.z)===side
  &&townResidentPose(r,homeTime,plan).activity==='at home');
 assert(resident,'outer row must contain a resident spending this part of the day at home');
 return resident;
};
const stateAt=(time:number)=>{
 let state=createRegionalState(seed);
 // Advance through the real bounded campaign clock, rather than forge a causal ledger.
 for(let remaining=time;remaining>1e-8;remaining-=1)state=applyAction(state,{type:'tick',dt:Math.min(1,remaining)});
 assert(Math.abs(townClock(state.causal)-time)<1e-8);assert(validateSave(state));return state;
};

test('outer north and south household residents yield to both peer actors with shared wall and body clearance',()=>{
 const crowd=new TownCrowd(seed),raw=crowd.sample(homeTime);
 for(const side of [-1,1] as const){
  const resident=outerResident(side),pose=raw[resident.index]!;
  assert(Math.abs(pose.z-TOWN_CENTER.z)>36,'fixture lies outside the former authority rectangle');
  const actors=[{id:'a',x:pose.x-.65,z:pose.z,feetY:6},{id:'b',x:pose.x+.65,z:pose.z,feetY:6}];
  const a=crowd.sample(homeTime,100,1,actors),b=crowd.sample(homeTime,100,1,[...actors].reverse());
  assert.deepEqual(a,b);assert.equal(crowd.unresolvedActorContacts,0);
  for(let i=0;i<a.length;i++){
   assert(distance(a[i]!,clearTownBody(crowd.plan,a[i]!))<1e-8);
   for(const actor of actors)assert(distance(a[i]!,actor)>=.685-1e-8);
   for(let j=i+1;j<a.length;j++)assert(distance(a[i]!,a[j]!)>=.605-1e-8);
  }
  assert(distance(a[resident.index]!,pose)>.1,'expanded actor filter must actually react');
 }
});

test('actual source Rapier applies yielding crowd sweeps on both added household streets',async t=>{
 const crowd=new TownCrowd(seed);
 for(const side of [-1,1] as const){
  const resident=outerResident(side),pose=crowd.sample(homeTime)[resident.index]!,start={x:pose.x-2,z:pose.z};
  const physics=await regionalPhysics(t,{...start,y:6,startPaused:true,initialCells:cells(start.x,start.z),town:{seed,time:homeTime,selfId:'solo',actors:[]}});
  physics.input({x:1,z:0,paused:false});let prior=physics.latest,min=Infinity;
  for(let tick=0;tick<120;tick++){
   await physics.tick();const next=physics.latest,poses=crowd.sample((next as typeof next&{town:{time:number}}).town.time,100,1,[{id:'solo',x:prior.x,z:prior.z,feetY:prior.feetY}]);
   assert(distance(slideTownCrowd(prior,next,poses,prior.feetY),next)<.002,`outer row ${side} crossed a body at tick ${tick}`);
   for(const npc of poses)min=Math.min(min,distance(next,npc));
   assert(townPathClear(crowd.plan,prior,next,.31));prior=next;
  }
  assert(physics.latest.x>start.x+.8,'yielding permits forward progress');assert(min>.60,`minimum outer-row body separation ${min}`);
 }
});

test('co-op long movement packets cannot tunnel through residents on either added household street',()=>{
 for(const side of [-1,1] as const){
  const state=enableStartingTown(stateAt(homeTime)),crowd=new TownCrowd(seed),resident=outerResident(side),pose=crowd.sample(homeTime,100,1,[],townLifePoses(state.townLife))[resident.index]!;
  state.player={...state.player,x:pose.x-4,z:pose.z};
  const room=createRoom('host','Host',state,1000),host=room.players[0]!,guest=makePlayer('guest','Guest',1,state,1000);
  guest.player={...guest.player,x:pose.x+2,z:pose.z-side*2};guest.motion=createVertical(6);room.players.push(guest);
  const from={...host.player},target={x:pose.x+4,z:pose.z},actors=[{id:host.id,...from,feetY:6},{id:guest.id,...guest.player,feetY:6}];
  room.lastTick=1800;
  const expected=slideTownCrowd(from,target,crowd.sample(homeTime,100,1,actors,townLifePoses(room.world.townLife)));
  assert(distance(expected,target)>.2,'fixture must exercise actual crowd contact');assert(townPathClear(crowd.plan,from,expected,.32));
  syncRoom(room,'host',{seq:1,sessionId:host.sessionId,actions:[],move:{...target,y:6,facing:Math.PI/2,grounded:true,crouched:false}},1800);
  assert(distance(host.player,expected)<.001,`outer row ${side} shared authority diverged`);assert(validateSave(room.world));
 }
});

test('stored room collision v1 upgrades actors overlapping added houses exactly once without changing shared goods',()=>{
 const room=createRoom('host','Host',stateAt(homeTime),1000),host=room.players[0]!,guest=makePlayer('guest','Guest',1,room.world,1000);
 room.players.push(guest);const plan=startingTown(seed),before=serializeSave(room.world);
 for(const [index,actor] of [host,guest].entries()){
  const wall=plan.homes[index?39:20]!.boxes.find(b=>b.id.endsWith('/back'))!;
  actor.player={...actor.player,x:wall.center.x,z:wall.center.z};actor.pose={...actor.pose,x:wall.center.x,z:wall.center.z,y:6};
  actor.motion=createVertical(6);actor.townCollisionVersion=1;actor.wildernessCollisionVersion=1;
  const original={...actor.player};playerMotion(room,actor);
  assert.equal(actor.townCollisionVersion,TOWN_LAYOUT_VERSION);assert(distance(actor.player,original)>.4);
  assert.deepEqual(safeTownPosition(seed,actor.player),actor.player);
  const recovered=JSON.stringify(actor);playerMotion(room,actor);assert.equal(JSON.stringify(actor),recovered,'migration must be idempotent');
 }
 syncRoom(room,'host',{seq:1,sessionId:host.sessionId,actions:[]},1000);
 const old=parseSave(before)!;assert.deepEqual({...room.world,player:old.player},old);assert(validateSave(room.world));
 const reloaded=JSON.parse(JSON.stringify(room));for(const actor of reloaded.players){const saved=JSON.stringify(actor);playerMotion(reloaded,actor);assert.equal(JSON.stringify(actor),saved);}
});

test('layout upgrade preserves an accepted airborne trajectory on an unobstructed outer street',()=>{
 const state=stateAt(homeTime);state.player={...state.player,...startingTown(seed).homes[20]!.entry};
 const room=createRoom('host','Host',state,1000),host=room.players[0]!;
 host.townCollisionVersion=1;host.wildernessCollisionVersion=1;
 host.motion={...createVertical(8.5),grounded:false,vy:4,jumpId:3,landingId:2,coyote:0,lastJumpIntent:'accepted-jump',jumpStatus:'launched'};
 const position={...host.player},trajectory={...host.motion};playerMotion(room,host);
 assert.equal(host.townCollisionVersion,TOWN_LAYOUT_VERSION);assert.deepEqual(host.player,position);assert.deepEqual(host.motion,trajectory);
});

test('household and routine inspection regenerates after reload without adding save payload or changing finite shop receipts',()=>{
 let state=createRegionalState(seed);state.player={...state.player,...startingTown(seed).shops[0]!.entry};
 state=applyAction(state,{type:'town-purchase',command:{offerId:'arrival-kit',expectedRevision:0}});
 assert.equal(state.town?.revision,1);state.player={...state.player,...startingTown(seed).homes[39]!.entry};
 const saved=serializeSave(state),roster=townResidents(seed),households=townHouseholds(seed),crowd=new TownCrowd(seed);
 for(let time=0;time<=TOWN_RESIDENT_CYCLE_SECONDS;time+=10){crowd.sample(time);for(const resident of roster)townResidentPose(resident,time,crowd.plan);}
 assert.equal(serializeSave(state),saved);for(const word of ['householdId','housemateIds','phaseOffset','townCrowd'])assert(!saved.includes(word));
 const restored=parseSave(saved);assert(restored);assert.equal(serializeSave(restored),saved);assert.equal(restored.town?.version,1);
 assert.deepEqual(townHouseholds(restored.seed),households);assert.deepEqual(townResidents(restored.seed),roster);
 assert.deepEqual(new TownCrowd(restored.seed).sample(townClock(restored.causal)),new TownCrowd(seed).sample(townClock(state.causal)));
});

test('all household routine path segments clear actual expanded house walls and lamps over a full day',()=>{
 for(const currentSeed of [0,73129,0xffffffff]){
  const plan=startingTown(currentSeed);
  for(const resident of townResidents(currentSeed)){
   let previous=townResidentPose(resident,0,plan);
   for(let time=.5;time<=TOWN_RESIDENT_CYCLE_SECONDS;time+=.5){
    const next=townResidentPose(resident,time,plan);
    assert(townPathClear(plan,previous,next),`seed ${currentSeed} resident ${resident.index} path blocked at ${time}`);
    previous=next;
   }
  }
 }
});
