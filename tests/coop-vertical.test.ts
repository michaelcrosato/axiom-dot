import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {createVertical,stepVertical,requestJump,setCrouch,moveVertical,validVertical,COOP_VERTICAL,type MotionGeometry} from '../server/coop-vertical.ts';
import {COOP_BODY} from '../server/coop-movement.ts';
import type {CombatObstacle} from '../src/combat.ts';
import {createRoom,syncRoom,advanceRoom,snapshot} from '../server/coop-authority.ts';
import {createState} from '../src/world.ts';
const geometry=(obstacles:CombatObstacle[]=[]):MotionGeometry=>({obstacles,height:()=>0});
function fly(obstacles:CombatObstacle[]=[],ticks=90,crouched=false){const m=createVertical(0,crouched),g=geometry(obstacles),samples:typeof m[]=[];requestJump(m,'jump-one');for(let i=0;i<ticks;i++){stepVertical(m,0,0,g);samples.push({...m});}return {m,samples,g};}

test('bounded online flight uses the pinned impulse and gravity, finite apex and one landing',()=>{
  const {m,samples}=fly();assert.equal(samples[0]!.vy,6.3);assert(Math.abs(samples[0]!.feetY-.105)<1e-9);
  const apex=Math.max(...samples.map(s=>s.feetY));assert(apex>1.05&&apex<1.25);assert(samples.some(s=>s.vy<0));assert(m.grounded);assert.equal(m.feetY,0);assert.equal(m.vy,0);assert.equal(m.jumpId,1);assert.equal(m.landingId,1);assert(samples.every(validVertical));
});
test('airborne edges cannot double-jump; a late edge buffers one grounded launch',()=>{
  const m=createVertical(0),g=geometry();requestJump(m,'first');for(let i=0;i<8;i++)stepVertical(m,0,0,g);const vy=m.vy;requestJump(m,'early');stepVertical(m,0,0,g);assert(m.vy<vy);for(let i=0;i<80;i++)stepVertical(m,0,0,g);assert.equal(m.jumpId,1);
  requestJump(m,'second');for(let i=0;i<38;i++)stepVertical(m,0,0,g);assert(!m.grounded);requestJump(m,'buffered');for(let i=0;i<12;i++)stepVertical(m,0,0,g);assert.equal(m.jumpId,3);assert.equal(m.lastJumpIntent,'buffered');assert.equal(m.jumpStatus,'launched');assert(!m.grounded);
  for(let i=0;i<90;i++)stepVertical(m,0,0,g);assert.equal(m.jumpId,3);assert(m.grounded);
});
test('ceiling cancels ascent; crouched body preserves feet and cannot expand into a roof',()=>{
  const roof={x:0,z:0,y:2.7,hx:3,hz:3,hy:.2},normal=fly([roof]);assert(Math.max(...normal.samples.map(s=>s.feetY))<=2.5-COOP_BODY.standingHeight+1e-8);assert(normal.samples.some(s=>s.vy===0&&!s.grounded));assert(normal.m.grounded);
  const g=geometry([{...roof,y:1.5,hy:.3}]),m=createVertical(0,true);setCrouch(m,0,0,false,g);assert(m.crouched);requestJump(m,'low-jump');for(let i=0;i<90;i++){stepVertical(m,0,0,g);setCrouch(m,0,0,false,g);assert(m.crouched);assert(m.feetY+COOP_BODY.crouchingHeight<=1.2+1e-8);}assert(m.grounded);
  setCrouch(m,10,10,false,g);assert(!m.crouched);
});
test('only a real jump crosses low solids and lands on a raised support',()=>{
  const g=geometry([{x:0,z:0,y:.45,hx:1,hz:.25,hy:.45}]),m=createVertical(0);
  assert.equal(moveVertical(m,{x:0,z:-2},{x:0,z:2},g),false);requestJump(m,'clear-pipe');for(let i=0;i<15;i++)stepVertical(m,0,-2,g);assert(m.feetY>.9);
  assert.equal(moveVertical(m,{x:0,z:-2},{x:0,z:0},g),true);for(let i=0;i<40;i++)stepVertical(m,0,0,g);assert(m.grounded);assert.equal(m.feetY,.9);
  assert.equal(moveVertical(m,{x:0,z:0},{x:0,z:3},g),true);assert(!m.grounded);requestJump(m,'edge-coyote');assert.equal(m.vy,6.6);for(let i=0;i<100;i++)stepVertical(m,0,3,g);assert(m.grounded);assert.equal(m.feetY,0);
});
test('grounded horizontal updates follow sampled slopes but do not teleport down a ledge',()=>{
  const m=createVertical(0),slope={obstacles:[],height:(x:number)=>x*.2};assert(moveVertical(m,{x:0,z:0},{x:4,z:0},slope));assert(Math.abs(m.feetY-.8)<1e-8);assert(m.grounded);
  assert(moveVertical(m,{x:4,z:0},{x:-4,z:0},slope));assert(Math.abs(m.feetY+.8)<1e-8);assert(m.grounded);
  const ledge={obstacles:[],height:(x:number)=>x<0?1:0},edge=createVertical(1);assert(moveVertical(edge,{x:-1,z:0},{x:1,z:0},ledge));assert.equal(edge.feetY,1);assert(!edge.grounded);for(let i=0;i<60;i++)stepVertical(edge,1,0,ledge);assert.equal(edge.feetY,0);assert(edge.grounded);
});
test('death rejects jump edges, clears airborne state and explicit respawn resets it safely',()=>{
  const room=createRoom('host','Host',createState(97),1000),p=room.players[0]!;syncRoom(room,'host',{seq:1,sessionId:p.sessionId,actions:[{type:'jump-press',intentId:'life-hop'}]},1000);advanceRoom(room,1200);assert(p.motion!.feetY>0);
  p.player.hp=0;advanceRoom(room,1220);assert.equal(p.motion!.feetY,0);assert.equal(p.motion!.vy,0);assert(p.motion!.grounded);
  syncRoom(room,'host',{seq:2,sessionId:p.sessionId,actions:[{type:'jump-press',intentId:'dead-hop'}]},1220);assert.equal(snapshot(room,'host',1220).motion.jumpStatus,'rejected');assert.equal(p.motion!.jumpId,1);
  syncRoom(room,'host',{seq:3,sessionId:p.sessionId,actions:[{type:'respawn'}]},1220);assert.equal(p.player.hp,100);assert(p.motion!.grounded);assert.equal(p.motion!.vy,0);
});

type RapierSample={feetY:number;vy:number;grounded:boolean;crouched:boolean};
async function rapierFlight(t:TestContext,obstacles:CombatObstacle[]=[],crouched=false){
  const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);globalThis.setInterval=fn=>{globalThis.physicsTick=fn;return 1;};parentPort.on('message',m=>{if(m.type==='advance'){for(let i=0;i<m.ticks;i++)globalThis.physicsTick();parentPort.postMessage({type:'advanced'});}else self.onmessage({data:m});});import(${JSON.stringify(new URL('../src/physics.worker.ts',import.meta.url).href)}).then(()=>parentPort.postMessage({type:'boot'}));`,{eval:true,execArgv:['--experimental-strip-types']});
  t.after(()=>worker.terminate());const messages:{type:string;[key:string]:unknown}[]=[],samples:RapierSample[]=[];let error:Error|undefined;
  worker.on('error',e=>{error=e;});worker.on('message',m=>{messages.push(m);if(m.type==='snapshot')samples.push(m);if(m.type==='error')error=new Error(m.message);});
  async function take(type:string){const end=Date.now()+5000;while(true){if(error)throw error;const i=messages.findIndex(m=>m.type===type);if(i>=0)return messages.splice(i,1)[0];assert(Date.now()<end,`waiting for ${type}`);await new Promise(r=>setTimeout(r,2));}}
  const send=(m:Record<string,unknown>)=>worker.postMessage({epoch:0,...m});await take('boot');send({type:'init',x:0,z:0,obstacles});await take('ready');send({type:'advance',ticks:3});await take('advanced');
  if(crouched){send({type:'input',x:0,z:0,crouch:true});send({type:'advance',ticks:14});await take('advanced');}samples.length=0;
  send({type:'input',x:0,z:0,jump:true,crouch:crouched});send({type:'advance',ticks:90});await take('advanced');return samples;
}
test('bounded vertical model matches actual production Rapier flat-ground jump trajectory',async t=>{
  const rapier=await rapierFlight(t),bounded=fly().samples;assert.equal(rapier.length,bounded.length);
  const error=Math.max(...rapier.map((s,i)=>Math.abs(s.feetY-bounded[i]!.feetY)));assert(error<.04,`maximum trajectory error ${error}`);
  const rapierLand=rapier.findIndex((s,i)=>i>0&&s.grounded),boundedLand=bounded.findIndex((s,i)=>i>0&&s.grounded);assert(Math.abs(rapierLand-boundedLand)<=2);assert.equal(COOP_VERTICAL.gravity,18);
});
test('bounded standing ceiling and floor outcomes agree with actual production Rapier',async t=>{
  const roof={x:0,z:0,y:2.7,hx:3,hz:3,hy:.2},rapier=await rapierFlight(t,[roof]),bounded=fly([roof]).samples;
  assert(Math.abs(Math.max(...rapier.map(s=>s.feetY))-Math.max(...bounded.map(s=>s.feetY)))<.04);assert(rapier.at(-1)!.grounded&&bounded.at(-1)!.grounded);assert(Math.abs(rapier.at(-1)!.feetY-bounded.at(-1)!.feetY)<.01);
});
test('bounded crouched capsule ceiling agrees with actual production Rapier',async t=>{
  const roof={x:0,z:0,y:1.5,hx:3,hz:3,hy:.3},rapier=await rapierFlight(t,[roof],true),bounded=fly([roof],90,true).samples;
  assert(rapier.every(s=>s.crouched));assert(Math.abs(Math.max(...rapier.map(s=>s.feetY))-Math.max(...bounded.map(s=>s.feetY)))<.04);assert(rapier.at(-1)!.grounded&&bounded.at(-1)!.grounded);
});
