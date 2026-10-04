import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';

test('actual physics worker initializes, blocks buildings, teleports, and stops', { timeout: 10_000 }, async () => {
  const url = new URL('../src/physics.worker.ts', import.meta.url).href;
  const worker = new Worker(`
    const { parentPort } = require('node:worker_threads');
    // Rapier uses global browser facilities through self, so alias the real scope.
    globalThis.self = globalThis;
    self.postMessage = message => parentPort.postMessage(message);
    parentPort.on('message', message => self.onmessage({ data: message }));
    import(${JSON.stringify(url)}).then(() => parentPort.postMessage({ type: 'boot' }));
  `, { eval: true, execArgv: ['--experimental-strip-types'] });
  const acknowledgements: {key:string;revision:number;loaded:boolean;count:number}[]=[];
  let boot = false, ready = false, snapshots = 0;
  let error: Error | undefined;
  let latest = { x: 0, y: 0, z: 0, grounded: false };
  worker.on('error', value => { error = value; });
  worker.on('message', message => {
    if(message.type==='cell-ack')acknowledgements.push(message);
    if (message.type === 'boot') boot = true;
    if (message.type === 'ready') {
      ready = true;
      if (message.version !== '0.20.0') error = new Error('Unexpected Rapier version');
    }
    if (message.type === 'snapshot') {
      latest = message;
      snapshots++;
      if (![message.x, message.y, message.z].every(Number.isFinite)) error = new Error('Nonfinite worker position');
    }
  });
  async function until(predicate: () => boolean) {
    const deadline = Date.now() + 2500;
    while (!predicate()) {
      if (error) throw error;
      assert.ok(Date.now() < deadline, 'Worker response timed out');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    if (error) throw error;
  }
  async function ticks(count: number) {
    const target = snapshots + count;
    await until(() => snapshots >= target);
  }
  try {
    await until(() => boot);
    worker.postMessage({ type: 'init', x: -20, z: -3, obstacles: [
      { x: -20, z: -7, hx: 1.9, hz: 1.7, hy: 2 },
      { x: 0, z: 16, hx: 1, hz: 1, hy: 1.5 },
    ] });
    await until(() => ready);
    worker.postMessage({ type: 'input', x: 0, z: -1, sprint: false });
    await ticks(55);
    assert.ok(latest.z > -5.01 && latest.z < -4.9, `Hut collision: ${latest.z}`);
    assert.equal(latest.grounded, true);
    worker.postMessage({ type: 'input', x: 0, z: 0, sprint: false });
    worker.postMessage({ type: 'teleport', x: 0, z: 20 });
    await ticks(4);
    assert.ok(Math.abs(latest.x) < .01 && Math.abs(latest.z - 20) < .01, 'Teleport acknowledged');
    worker.postMessage({ type: 'input', x: 0, z: -1, sprint: false });
    await ticks(55);
    assert.ok(latest.z > 17.3 && latest.z < 17.4, `Pump collision: ${latest.z}`);
    worker.postMessage({ type: 'input', x: 0, z: 0, sprint: false });
    await ticks(4);
    const stopped = latest.z;
    await ticks(6);
    assert.ok(Math.abs(latest.z - stopped) < .001, 'Neutral input stops movement');
    worker.postMessage({type:'teleport',x:30,z:30});
    worker.postMessage({type:'cell-load',key:'1:1',revision:1,obstacles:[{x:30,z:27,hx:2,hz:.5,hy:3}]});
    await until(()=>acknowledgements.length===1);assert.equal(acknowledgements[0]!.count,1);
    worker.postMessage({type:'input',x:0,z:-1,sprint:false});await ticks(40);
    assert.ok(latest.z>27.8,'Loaded cell collider blocks player');
    worker.postMessage({type:'cell-unload',key:'1:1',revision:3});await until(()=>acknowledgements.length===2);
    worker.postMessage({type:'cell-load',key:'1:1',revision:2,obstacles:[{x:30,z:27,hx:2,hz:.5,hy:3}]});
    await ticks(35);assert.ok(latest.z<26,'Eviction removes collider and stale reload cannot resurrect it');assert.equal(acknowledgements.length,2);
    worker.postMessage({type:'cell-load',key:'1:1',revision:4,obstacles:[]});await until(()=>acknowledgements.length===3);assert.equal(acknowledgements[2]!.count,0);

  } finally {
    await worker.terminate();
  }
});

test('zone epochs atomically replace collision worlds and reject delayed previous-world messages', {timeout:10_000},async()=>{
 const {generateDungeon}=await import('../src/dungeon.ts');
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);parentPort.on('message',m=>self.onmessage({data:m}));import(${JSON.stringify(new URL('../src/physics.worker.ts',import.meta.url).href)}).then(()=>parentPort.postMessage({type:'boot'}));`,{eval:true,execArgv:['--experimental-strip-types']});
 let boot=false,ready=-1;let latest={epoch:-1,x:0,z:0};let error:Error|undefined;
 worker.on('error',e=>error=e);worker.on('message',m=>{if(m.type==='boot')boot=true;if(m.type==='ready')ready=m.epoch;if(m.type==='snapshot')latest=m;});
 const until=async(p:()=>boolean)=>{const end=Date.now()+2500;while(!p()){if(error)throw error;assert.ok(Date.now()<end,`Worker timeout epoch ${ready} position ${JSON.stringify(latest)}`);await new Promise(r=>setTimeout(r,10));}};
 try{
  await until(()=>boot);worker.postMessage({type:'init',epoch:0,x:0,z:24,obstacles:[{x:0,z:20,hx:8,hz:1,hy:3}]});await until(()=>ready===0);
  worker.postMessage({type:'zone',epoch:1,x:0,z:24,obstacles:generateDungeon(73129).walls});await until(()=>ready===1);
  worker.postMessage({type:'cell-load',epoch:0,key:'stale',revision:99,obstacles:[{x:0,z:22,hx:8,hz:1,hy:3}]});
  worker.postMessage({type:'teleport',epoch:0,x:40,z:40});worker.postMessage({type:'input',epoch:1,x:0,z:-1,sprint:true});await until(()=>latest.epoch===1&&latest.z<18);
  assert.ok(Math.abs(latest.x)<.01,'No stale teleport or collider affects dungeon');
  worker.postMessage({type:'zone',epoch:2,x:30,z:30,obstacles:[]});await until(()=>ready===2&&latest.epoch===2);
  worker.postMessage({type:'input',epoch:1,x:1,z:1,sprint:true});await new Promise(r=>setTimeout(r,150));assert.ok(Math.abs(latest.x-30)<.01&&Math.abs(latest.z-30)<.01,'Transition clears movement, stale input ignored');
  worker.postMessage({type:'zone',epoch:1,x:0,z:24,obstacles:generateDungeon(73129).walls});await new Promise(r=>setTimeout(r,100));assert.equal(latest.epoch,2);
  worker.postMessage({type:'input',epoch:2,x:0,z:-1,sprint:true});await until(()=>latest.z<24);assert.ok(latest.z>20,'Return world is movable with no dungeon walls');
 }finally{await worker.terminate();}
});


test('machine collider updates block, dismantle clears, zone reset restores only current assembly', {timeout:10_000},async()=>{
 const {machineObstacles,emptyWaterworks}=await import('../src/waterworks.ts');
 const obstacles=machineObstacles({...emptyWaterworks(),parts:[{id:'tank',kind:'reservoir',x:-11,z:6,rotation:0}]});
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);parentPort.on('message',m=>self.onmessage({data:m}));import(${JSON.stringify(new URL('../src/physics.worker.ts',import.meta.url).href)}).then(()=>parentPort.postMessage({type:'boot'}));`,{eval:true,execArgv:['--experimental-strip-types']});
 let boot=false,ready=-1,ack=0,count=0;let latest={epoch:-1,x:0,z:0};let error:Error|undefined;
 worker.on('error',e=>error=e);worker.on('message',m=>{if(m.type==='boot')boot=true;if(m.type==='ready')ready=m.epoch;if(m.type==='snapshot'){latest=m;count++;}if(m.type==='cell-ack')ack++;});
 const until=async(p:()=>boolean)=>{const end=Date.now()+2500;while(!p()){if(error)throw error;assert.ok(Date.now()<end,'Machine worker timeout');await new Promise(r=>setTimeout(r,10));}};
 const ticks=async(n:number)=>{const end=count+n;await until(()=>count>=end);};
 try{
  await until(()=>boot);worker.postMessage({type:'init',epoch:0,x:-11,z:10,obstacles:[]});await until(()=>ready===0);
  worker.postMessage({type:'cell-load',epoch:0,key:'waterworks',revision:1,obstacles});await until(()=>ack===1);
  worker.postMessage({type:'input',epoch:0,x:0,z:-1});await ticks(60);assert.ok(latest.z>7.15&&latest.z<7.3);
  worker.postMessage({type:'cell-load',epoch:0,key:'waterworks',revision:2,obstacles:[]});await until(()=>ack===2);await ticks(55);assert.ok(latest.z<4,`Accelerates through dismantled reservoir: ${latest.z}`);
  worker.postMessage({type:'zone',epoch:1,x:-11,z:10,obstacles:[]});await until(()=>ready===1);
  worker.postMessage({type:'cell-load',epoch:0,key:'waterworks',revision:99,obstacles});worker.postMessage({type:'input',epoch:1,x:0,z:-1});await ticks(75);assert.ok(latest.z<5);assert.equal(ack,2);
  worker.postMessage({type:'zone',epoch:2,x:-11,z:10,obstacles:[]});await until(()=>ready===2);
  worker.postMessage({type:'cell-load',epoch:2,key:'waterworks',revision:3,obstacles});await until(()=>ack===3);worker.postMessage({type:'input',epoch:2,x:0,z:-1});await ticks(60);assert.ok(latest.z>7.15&&latest.z<7.3);
 }finally{await worker.terminate();}
});

test('analog worker preserves graded speed, caps diagonal speed, reports wall contact, and hard-pauses', {timeout:15_000},async()=>{
 const {analogSpeed}=await import('../src/locomotion.ts');
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);parentPort.on('message',m=>self.onmessage({data:m}));import(${JSON.stringify(new URL('../src/physics.worker.ts',import.meta.url).href)}).then(()=>parentPort.postMessage({type:'boot'}));`,{eval:true,execArgv:['--experimental-strip-types']});
 let boot=false,ready=false,count=0,error:Error|undefined;let latest={x:0,z:0,vx:0,vz:0,crouched:false,sliding:false};
 worker.on('error',e=>error=e);worker.on('message',m=>{if(m.type==='boot')boot=true;if(m.type==='ready')ready=true;if(m.type==='snapshot'){latest=m;count++;}});
 const until=async(p:()=>boolean)=>{const end=Date.now()+3000;while(!p()){if(error)throw error;assert.ok(Date.now()<end,'Analog worker timeout');await new Promise(r=>setTimeout(r,5));}};
 const ticks=async(n:number)=>{const end=count+n;await until(()=>count>=end);};
 try{
  await until(()=>boot);worker.postMessage({type:'init',x:-20,z:0,obstacles:[{x:0,z:0,hx:1,hz:5,hy:3}]});await until(()=>ready);
  for(const strength of [.1,.35,.58,.8,1]){worker.postMessage({type:'teleport',x:-20,z:10});worker.postMessage({type:'input',x:strength,z:0,analog:true});await ticks(35);assert.ok(Math.abs(Math.hypot(latest.vx,latest.vz)-analogSpeed(strength))<.002,`actual analog ${strength}: ${latest.vx}`);}
  worker.postMessage({type:'input',x:1,z:1,analog:true});await ticks(35);assert.ok(Math.abs(Math.hypot(latest.vx,latest.vz)-8)<.003,'diagonal bounded in worker');
  worker.postMessage({type:'input',x:0,z:0,paused:true});await ticks(2);const x=latest.x,z=latest.z;await ticks(8);assert.equal(latest.x,x);assert.equal(latest.z,z);
  worker.postMessage({type:'teleport',x:-6,z:0});worker.postMessage({type:'input',x:1,z:0,analog:true});await ticks(80);assert.ok(latest.x<-1.3&&latest.x>-1.4);assert.ok(Math.abs(latest.vx)<.01,'blocked intent does not report walking velocity');
 }finally{await worker.terminate();}
});

test('low capsule traverses overhead clearance, cannot stand into roof, and slide respects pause', {timeout:18_000},async()=>{
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);parentPort.on('message',m=>self.onmessage({data:m}));import(${JSON.stringify(new URL('../src/physics.worker.ts',import.meta.url).href)}).then(()=>parentPort.postMessage({type:'boot'}));`,{eval:true,execArgv:['--experimental-strip-types']});
 let boot=false,ready=false,count=0,error:Error|undefined;let latest={x:0,y:0,z:0,vx:0,vz:0,crouched:false,sliding:false};
 worker.on('error',e=>error=e);worker.on('message',m=>{if(m.type==='boot')boot=true;if(m.type==='ready')ready=true;if(m.type==='snapshot'){latest=m;count++;}});
 const until=async(p:()=>boolean)=>{const end=Date.now()+4000;while(!p()){if(error)throw error;assert.ok(Date.now()<end,`Low worker timeout: ${JSON.stringify(latest)}`);await new Promise(r=>setTimeout(r,5));}};
 const ticks=async(n:number)=>{const end=count+n;await until(()=>count>=end);};
 try{
  await until(()=>boot);worker.postMessage({type:'init',x:-4,z:15,obstacles:[{x:0,y:1.6,z:15,hx:2,hy:.4,hz:2}]});await until(()=>ready);
  worker.postMessage({type:'input',x:1,z:0,analog:true});await ticks(40);assert.ok(latest.x<-2.3,'upright blocked by overhead');
  worker.postMessage({type:'input',x:1,z:0,analog:true,crouch:true});await until(()=>latest.x>-.2);assert.equal(latest.crouched,true);assert.ok(latest.y+.52<1.2,'lower capsule fits');
  worker.postMessage({type:'input',x:0,z:0,analog:true,crouch:false,paused:true});await ticks(8);assert.equal(latest.crouched,true,'rise rejected under roof');
  worker.postMessage({type:'input',x:1,z:0,analog:true,crouch:false});await until(()=>latest.x>2.5);await ticks(3);assert.equal(latest.crouched,false,'rises after clearing roof');
  worker.postMessage({type:'teleport',x:0,z:30});worker.postMessage({type:'input',x:1,z:0,analog:true});await ticks(40);
  worker.postMessage({type:'input',x:0,z:1,analog:true,crouch:true});await until(()=>latest.sliding);await ticks(12);assert.ok(latest.vx>4&&Math.abs(latest.vz)<.01,'slide follows actual momentum');assert.equal(latest.crouched,true);
  worker.postMessage({type:'input',x:0,z:0,paused:true});await ticks(3);assert.equal(latest.sliding,false);assert.ok(Math.hypot(latest.vx,latest.vz)<.01,'menu cancels momentum');
 }finally{await worker.terminate();}
});
