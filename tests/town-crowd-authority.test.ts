import {townLifePoses} from '../src/town-life-runtime.ts';
import {advanceTownLife} from '../src/town-life.ts';
import test from 'node:test';import assert from 'node:assert/strict';
import {TownCrowd,slideTownCrowd,townClock,clearTownBody} from '../src/town-crowd.ts';import {startingTown,TOWN_CENTER} from '../src/starting-town.ts';import {generateRegionalChunk,REGION_BOUND} from '../src/regional-world.ts';import {regionalPhysics} from './helpers/regional-physics.ts';import {createRegionalState,enableStartingTown,serializeSave,parseSave,applyAction} from '../src/world.ts';import {createRoom,makePlayer,syncRoom,playerMotion} from '../server/coop-authority.ts';import {createVertical} from '../server/coop-vertical.ts';
const seed=73129,center=startingTown(seed).shops[0]!.entry;
const cells=()=>{const out=[];for(let z=-4;z<=-2;z++)for(let x=-4;x<=-2;x++){const c=generateRegionalChunk(seed,x,z);out.push({key:'region:'+c.key,revision:1,bounds:c.bounds,terrain:c.terrain,obstacles:c.structures.filter(s=>s.solid).map(s=>({x:s.center.x,y:s.center.y,z:s.center.z,hx:s.half.x,hy:s.half.y,hz:s.half.z}))});}return out;};
const distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
test('real worker prepares crowd paused at exact fractional time and menu pause freezes its authority',async t=>{const p=await regionalPhysics(t,{x:center.x,z:center.z,y:6,startPaused:true,initialCells:cells(),town:{seed,time:100.137,selfId:'solo',actors:[]}});assert.equal((p.latest as any).town.time,100.137);assert.equal(p.latest.step,0);await p.tick(30);assert.equal((p.latest as any).town.time,100.137);p.input({paused:false});await p.tick(60);assert(Math.abs((p.latest as any).town.time-101.137)<1e-9);p.input({paused:true});const a=p.latest;await p.tick(30);assert.equal((p.latest as any).town.time,(a as any).town.time);assert.equal(p.latest.step,a.step);});
test('online worker repeated render inputs do not restart the shared snapshot prediction window',async t=>{const p=await regionalPhysics(t,{x:center.x,z:center.z,y:6,startPaused:true,initialCells:cells(),online:true,town:{seed,time:20,selfId:'solo',actors:[]}});for(let i=0;i<12;i++){p.input({paused:false,townTime:20,townActors:[]});await p.tick();}assert(Math.abs((p.latest as any).town.time-20.2)<1e-9);await p.tick(60);assert.equal((p.latest as any).town.time,20.3);p.input({townTime:20.5,townActors:[]});await p.tick();assert(Math.abs((p.latest as any).town.time-(20.5+1/60))<1e-9);});
test('actual Rapier player advances through yielding crowd without crossing a body or town wall',async t=>{const c=new TownCrowd(seed),keeper=c.sample(0)[0]!,p=await regionalPhysics(t,{x:keeper.x,z:keeper.z+2,y:6,startPaused:true,initialCells:cells(),town:{seed,time:0,selfId:'solo',actors:[]}});p.input({x:0,z:-1,paused:false});let prior=p.latest,min=100;for(let i=0;i<120;i++){await p.tick();const next=p.latest,poses=c.sample((next as any).town.time,100,1,[{id:'solo',x:prior.x,z:prior.z,feetY:prior.feetY}]),resolved=slideTownCrowd(prior,next,poses,prior.feetY);assert(distance(resolved,next)<.002,`worker crossed body at ${i}`);for(const npc of poses)min=Math.min(min,distance(next,npc));assert(distance(next,clearTownBody(c.plan,next,.31))<.05);prior=next;}assert(p.latest.z<keeper.z+1.2,'yield/slide permits progress');assert(min>.60,`min distance ${min}`);});
test('co-op uses all peer actors for the same crowd sweep and cannot tunnel on a long movement packet',()=>{
 let s=enableStartingTown(createRegionalState(seed));const c=new TownCrowd(seed);let keeper;
 for(let second=0;second<180&&!keeper;second++){s={...s,townLife:advanceTownLife(s.townLife!,1)};keeper=c.sample(0,100,1,[],townLifePoses(s.townLife)).find(p=>Math.abs(p.x-TOWN_CENTER.x)<28&&p.z>TOWN_CENTER.z+4&&p.z<TOWN_CENTER.z+18);}
 assert(keeper,'an autonomous resident reaches the open public forecourt');
 s.player={...s.player,x:keeper.x-4,z:keeper.z};const room=createRoom('host','Host',s,1000),host=room.players[0]!;host.motion=createVertical(6);
 const guest=makePlayer('guest','Guest',1,s,1000);guest.player={...s.player,x:keeper.x+2,z:keeper.z+2};guest.motion=createVertical(6);room.players.push(guest);
 const from={...host.player},target={x:keeper.x+4,z:keeper.z};room.lastTick=1800;
 syncRoom(room,'host',{seq:1,sessionId:host.sessionId,actions:[],move:{...target,y:6,facing:Math.PI/2,grounded:true,crouched:false}},1800);
 const poses=c.sample(townClock(room.world.causal),100,1,[{id:host.id,...from,feetY:6},{id:guest.id,...guest.player,feetY:6}],townLifePoses(room.world.townLife)),expected=slideTownCrowd(from,target,poses);
 assert(distance(expected,target)>.2,'fixture exercises actual crowd contact');assert(distance(host.player,expected)<.001);assert(distance(host.player,clearTownBody(c.plan,host.player,.31))<.05);
 const before=serializeSave(room.world),restored=parseSave(before)!;assert(restored);assert(distance(restored.player,room.world.player)<1e-9,'legacy spawn-coordinate normalization is sub-nanometre only');assert.deepEqual({...restored,player:{...restored.player,x:room.world.player.x,z:room.world.player.z}},room.world);
});

test('leaving and returning regenerates identical crowd from save time without crowd save payload',()=>{const s=createRegionalState(seed),before=serializeSave(s),poses=new TownCrowd(seed).sample(townClock(s.causal));assert(!before.includes('townCrowd'));const restored=parseSave(before)!;assert.deepEqual(new TownCrowd(restored.seed).sample(townClock(restored.causal)),poses);});

test('co-op town broadphase covers the whole allowed movement segment from outside town',()=>{
 // Find an actual autonomous west-trunk commute; the old fixed routine remains covered separately.
 let s=enableStartingTown(createRegionalState(seed));const crowd=new TownCrowd(seed);let walker;
 for(let second=0;second<240&&!walker;second++){s={...s,townLife:advanceTownLife(s.townLife!,1)};walker=crowd.sample(0,100,1,[],townLifePoses(s.townLife)).find(p=>p.moving&&p.x<TOWN_CENTER.x-48.65);}
 assert(walker,'an actual life-model resident uses the west trunk');
 assert(walker.moving&&walker.x<TOWN_CENTER.x-48.65);
 s.player={...s.player,x:TOWN_CENTER.x-58.001,z:walker.z};
 const room=createRoom('host','Host',s,1000),host=room.players[0]!;host.motion=createVertical(6);
 const from={...host.player},target={x:TOWN_CENTER.x-48.401,z:walker.z};room.lastTick=1800;
 syncRoom(room,'host',{seq:1,sessionId:host.sessionId,actions:[],move:{...target,y:6,facing:Math.PI/2,grounded:true,crouched:false}},1800);
 const poses=crowd.sample(townClock(room.world.causal),100,1,[{id:host.id,...from,feetY:6}],townLifePoses(room.world.townLife)),expected=slideTownCrowd(from,target,poses);
 assert(distance(host.player,expected)<.001);assert(host.player.x<target.x-.2);
});
