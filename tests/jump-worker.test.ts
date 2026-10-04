import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';

type Snapshot={type:'snapshot';epoch:number;x:number;y:number;z:number;feetY:number;vx:number;vy:number;vz:number;grounded:boolean;crouched:boolean;stance:number;sliding:boolean;landing:number;landingSpeed:number};
type Obstacle={x:number;z:number;hx:number;hz:number;hy:number;y?:number};
/** Run the production worker and real Rapier WASM with a deterministic 60 Hz clock. */
async function physics(t:TestContext,obstacles:Obstacle[]=[],x=0,z=0){
 const worker=new Worker(`
  const {parentPort}=require('node:worker_threads');
  globalThis.self=globalThis;
  self.postMessage=m=>parentPort.postMessage(m);
  globalThis.setInterval=fn=>{globalThis.physicsTick=fn;return 1;};
  parentPort.on('message',m=>{
   if(m.type==='advance'){for(let i=0;i<m.ticks;i++)globalThis.physicsTick();parentPort.postMessage({type:'advanced'});}
   else self.onmessage({data:m});
  });
  import(${JSON.stringify(new URL('../src/physics.worker.ts',import.meta.url).href)}).then(()=>parentPort.postMessage({type:'boot'}));
 `,{eval:true,execArgv:['--experimental-strip-types']});
 t.after(()=>worker.terminate());
 let error:Error|undefined,epoch=0;let latest:Snapshot;const messages:any[]=[],snapshots:Snapshot[]=[];
 worker.on('error',e=>error=e);worker.on('message',m=>{messages.push(m);if(m.type==='error')error=new Error(m.message);if(m.type==='snapshot'){latest=m;snapshots.push(m);}});
 async function take(type:string){const end=Date.now()+3000;while(true){if(error)throw error;const i=messages.findIndex(m=>m.type===type);if(i>=0)return messages.splice(i,1)[0];assert.ok(Date.now()<end,`Waiting for ${type}`);await new Promise(r=>setTimeout(r,2));}}
 const send=(m:Record<string,unknown>)=>worker.postMessage({epoch,...m});
 const tick=async(n=1)=>{const start=snapshots.length;send({type:'advance',ticks:n});await take('advanced');return snapshots.slice(start);};
 const input=(extra:Record<string,unknown>={})=>send({type:'input',x:0,z:0,...extra});
 await take('boot');send({type:'init',x,z,obstacles});await take('ready');await tick(3);
 return {send,input,tick,get latest(){return latest!;},async zone(next:Obstacle[]=[],x=0,z=0){epoch++;send({type:'zone',epoch,x,z,obstacles:next});await take('ready');await tick(3);}};
}

test('worker-authoritative jump has gravity, a finite apex, floor collision and exactly one landing while held',async t=>{
 const p=await physics(t);assert.equal(p.latest.grounded,true);assert.ok(p.latest.feetY<.001);
 p.input({jump:true});const takeoff=(await p.tick())[0]!;assert.equal(takeoff.grounded,false);assert.ok(takeoff.vy>6&&takeoff.feetY>.09);
 const flight=await p.tick(130),apex=Math.max(...flight.map(s=>s.feetY));assert.ok(apex>1.05&&apex<1.25,`apex ${apex}`);
 assert.ok(flight.some(s=>!s.grounded&&s.vy<0),'gravity reverses the ascent');
 assert.equal(flight.filter(s=>s.landing===1).length,1,'held button cannot bunny-hop');
 assert.ok(flight.some(s=>s.landingSpeed>5&&s.landing>0),'impact reported for landing pose');
 assert.equal(p.latest.grounded,true);assert.equal(p.latest.vy,0);assert.ok(p.latest.feetY<.001);
 assert.ok(flight.every(s=>[s.x,s.y,s.z,s.feetY,s.vx,s.vy,s.vz].every(Number.isFinite)));
 p.input({jump:false});p.input({jump:true});p.input({jump:false});await p.tick();assert.equal(p.latest.grounded,false,'quick tap between worker ticks survives');
});

test('airborne re-press cannot double-jump; a fresh near-landing press buffers once',async t=>{
 const p=await physics(t);p.input({jump:true});await p.tick(8);const before=p.latest.vy;
 p.input({jump:false});p.input({jump:true});await p.tick();assert.ok(p.latest.vy<before,'no second impulse in flight');
 await p.tick(55);assert.equal(p.latest.grounded,true,'early buffer expires before landing');
 p.input({jump:false});p.input({jump:true});await p.tick(32);assert.equal(p.latest.grounded,false);
 p.input({jump:false});await p.tick(6);assert.ok(p.latest.feetY<.5&&p.latest.vy<0);
 p.input({jump:true});const buffered=await p.tick(18);assert.ok(buffered.some(s=>s.grounded),'lands before buffered takeoff');assert.ok(buffered.some(s=>s.vy>6),'buffer launches on the next grounded tick');
 await p.tick(100);assert.equal(p.latest.grounded,true,'held buffered press fires only once');
});

test('actual Rapier ceiling truncates ascent and falling still lands on the floor',async t=>{
 const p=await physics(t,[{x:0,z:0,y:2.7,hx:3,hz:3,hy:.2}]);p.input({jump:true});const flight=await p.tick(90);
 assert.ok(Math.max(...flight.map(s=>s.feetY))<.37,'head cannot pass the 2.5m underside');
 assert.ok(flight.some(s=>s.feetY>.2&&!s.grounded&&s.vy===0),'ceiling collision cancels ascent');
 assert.ok(flight.every(s=>s.y+1.07<=2.501),'standing capsule never penetrates roof');
 assert.equal(p.latest.grounded,true);assert.ok(p.latest.feetY<.001);
});

test('airborne pause freezes height, clears buffered input, and resumes gravity without auto-jumping',async t=>{
 const p=await physics(t);p.input({x:1,analog:true,jump:true});await p.tick(10);const stopped={x:p.latest.x,y:p.latest.y,z:p.latest.z};
 p.input({x:1,analog:true,jump:true,paused:true});const paused=await p.tick(120);
 assert.ok(paused.every(s=>s.x===stopped.x&&s.y===stopped.y&&s.z===stopped.z&&s.vy===0&&s.vx===0));
 p.input({jump:true});const resumed=await p.tick(130);assert.equal(resumed.filter(s=>s.landing===1).length,1);assert.equal(p.latest.grounded,true);assert.ok(p.latest.feetY<.001);
 p.input({jump:false,paused:true});p.input({jump:true,paused:true});await p.tick(3);p.input({jump:true});await p.tick(3);assert.equal(p.latest.grounded,true,'press begun inside a menu is discarded');
});

test('teleport and zone replacement reset airborne velocity, stance, buffers, landing and previous epochs',async t=>{
 const p=await physics(t);p.input({jump:true,crouch:true});await p.tick(13);assert.equal(p.latest.crouched,true);assert.equal(p.latest.grounded,false);
 p.send({type:'teleport',x:10,z:12});await p.tick(60);assert.equal(p.latest.x,10);assert.equal(p.latest.z,12);assert.equal(p.latest.vy,0);assert.equal(p.latest.grounded,true);assert.equal(p.latest.crouched,false);assert.ok(p.latest.feetY<.001);assert.equal(p.latest.landing,0);
 p.input({jump:true});await p.tick(8);await p.zone([],20,20);p.send({type:'input',epoch:0,x:1,z:1,jump:true});await p.tick(60);
 assert.equal(p.latest.epoch,1);assert.equal(p.latest.x,20);assert.equal(p.latest.z,20);assert.equal(p.latest.vy,0);assert.equal(p.latest.grounded,true);assert.equal(p.latest.crouched,false);assert.ok(p.latest.feetY<.001);
});

test('crouched jumps preserve the foot origin, cannot stand through low ceilings, and cancel slides',async t=>{
 const p=await physics(t);p.input({crouch:true});await p.tick(14);assert.equal(p.latest.crouched,true);const feet=p.latest.feetY;
 p.input({crouch:true,jump:true});await p.tick();assert.ok(p.latest.feetY>feet+.09);assert.equal(p.latest.crouched,true);
 p.input({jump:true});await p.tick();assert.equal(p.latest.crouched,false,'can release crouch in clear air');assert.ok(p.latest.feetY<.25,'standing changes centre, not foot height');await p.tick(80);
 p.input({x:1,analog:true});await p.tick(40);p.input({x:1,analog:true,crouch:true});await p.tick(12);assert.equal(p.latest.sliding,true);
 p.input({x:1,analog:true,crouch:true,jump:true});await p.tick();assert.equal(p.latest.sliding,false,'jump consumes grounded slide');assert.equal(p.latest.grounded,false);
 await p.zone([],0,0);p.input({crouch:true});await p.tick(14);
 p.send({type:'cell-load',key:'roof',revision:1,obstacles:[{x:0,z:0,y:1.5,hx:3,hz:3,hy:.3}]});await p.tick(2);
 p.input({crouch:false,jump:true});const underRoof=await p.tick(60);assert.ok(underRoof.every(s=>s.crouched),'headroom check prevents expansion in flight');assert.ok(underRoof.every(s=>s.y+.52<=1.201),'low capsule respects roof');assert.equal(p.latest.grounded,true);
});

test('Rapier platform support and short coyote window allow a jump just after leaving an edge',async t=>{
 const p=await physics(t);p.input({jump:true});await p.tick(18);
 p.send({type:'cell-load',key:'platform',revision:1,obstacles:[{x:0,z:0,hx:1,hz:2,hy:.35}]});await p.tick(50);
 assert.equal(p.latest.grounded,true);assert.ok(Math.abs(p.latest.feetY-.7)<.01,'lands on actual raised collider');
 p.input({x:1,analog:true});let steps=0;while(p.latest.grounded&&steps++<50)await p.tick();assert.equal(p.latest.grounded,false,'walked off raised platform');
 assert.ok(p.latest.feetY>.5);p.input({x:1,analog:true,jump:true});await p.tick();assert.ok(p.latest.vy>6,'coyote press receives one impulse');
 await p.tick(130);assert.equal(p.latest.grounded,true);assert.ok(p.latest.feetY<.001);
});

test('wall contact while jumping neither cancels upward motion nor clips through the wall',async t=>{
 const p=await physics(t,[{x:1,z:0,hx:.2,hz:3,hy:4}]);p.input({x:1,analog:true,jump:true});const snapshots=await p.tick(80);
 assert.ok(snapshots.every(s=>s.x<.49),'solid wall blocks full jump arc');assert.ok(Math.max(...snapshots.map(s=>s.feetY))>1.05,'wall normals cannot cancel jump');assert.equal(p.latest.grounded,true);
});
