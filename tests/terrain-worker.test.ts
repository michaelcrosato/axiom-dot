import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';

type Terrain={vertices:number[];indices:number[];bound:number;step?:number};
type Obstacle={x:number;z:number;y?:number;hx:number;hy:number;hz:number};
type Snapshot={epoch:number;x:number;y:number;z:number;feetY:number;vx:number;vy:number;vz:number;grounded:boolean;crouched:boolean;stance:number;sliding:boolean;landing:number;landingSpeed:number};
type Zone={terrain?:Terrain;bound?:number;x?:number;z?:number;y?:number;obstacles?:Obstacle[]};
function grid(height:(x:number,z:number)=>number,bound=16,step=2):Terrain{
 const vertices:number[]=[],indices:number[]=[],n=2*bound/step+1;
 for(let z=0;z<n;z++)for(let x=0;x<n;x++)vertices.push(x*step-bound,height(x*step-bound,z*step-bound),z*step-bound);
 for(let z=0;z<n-1;z++)for(let x=0;x<n-1;x++){const a=z*n+x,b=a+1,c=a+n,d=c+1;indices.push(a,c,b,b,c,d);}
 return {vertices,indices,bound,step};
}
/** Production worker and real Rapier WASM, with only its interval replaced by a deterministic clock. */
async function physics(t:TestContext,initial:Zone={}){
 const worker=new Worker(`
  const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;
  self.postMessage=m=>parentPort.postMessage(m);
  globalThis.setInterval=fn=>{globalThis.physicsTick=fn;return 1;};
  parentPort.on('message',m=>{if(m.type==='advance'){for(let i=0;i<m.ticks;i++)globalThis.physicsTick();parentPort.postMessage({type:'advanced'});}else self.onmessage({data:m});});
  import(${JSON.stringify(new URL('../src/physics.worker.ts',import.meta.url).href)}).then(()=>parentPort.postMessage({type:'boot'}));
 `,{eval:true,execArgv:['--experimental-strip-types']});
 t.after(()=>worker.terminate());
 let error:Error|undefined,epoch=0,latest:Snapshot;const messages:any[]=[],snapshots:Snapshot[]=[];
 worker.on('error',e=>error=e);worker.on('message',m=>{messages.push(m);if(m.type==='error')error=new Error(m.message);if(m.type==='snapshot'){latest=m;snapshots.push(m);}});
 async function take(type:string){const deadline=Date.now()+5000;while(true){if(error)throw error;const i=messages.findIndex(m=>m.type===type);if(i>=0)return messages.splice(i,1)[0];assert.ok(Date.now()<deadline,`Timed out awaiting ${type}`);await new Promise(r=>setTimeout(r,2));}}
 const send=(m:Record<string,unknown>)=>worker.postMessage({epoch,...m});
 const tick=async(n=1)=>{const start=snapshots.length;send({type:'advance',ticks:n});await take('advanced');return snapshots.slice(start);};
 const input=(extra:Record<string,unknown>={})=>send({type:'input',x:0,z:0,...extra});
 await take('boot');send({type:'init',x:0,z:0,obstacles:[],...initial});await take('ready');await tick(5);
 return {send,input,tick,take,messages,get latest(){return latest!;},async zone(next:Zone){epoch++;send({type:'zone',x:0,z:0,obstacles:[],...next});await take('ready');await tick(5);}};
}
const close=(actual:number,expected:number,tolerance=.035)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} should be within ${tolerance} of ${expected}`);

test('terrain worker climbs and descends the renderer mesh with continuous grounded support',async t=>{
 const p=await physics(t,{terrain:grid(x=>4+x*.2),x:-10});
 assert.equal(p.latest.grounded,true);close(p.latest.feetY,2);
 p.input({x:1});const up=await p.tick(160);assert.ok(p.latest.x>1,`crosses many terrain triangles: ${JSON.stringify(p.latest)} first ${JSON.stringify(up.slice(0,5))}`);
 assert.ok(up.every(s=>s.grounded),'walkable incline retains true Rapier support');
 assert.ok(up.every(s=>Math.abs(s.feetY-(4+s.x*.2))<.035),'feet follow mesh elevation without a flat-floor correction');
 p.input({x:-1});const down=await p.tick(160);
 assert.ok(down.every(s=>s.grounded),'snap keeps contact descending the slope');
 assert.ok(down.every(s=>Math.abs(s.feetY-(4+s.x*.2))<.035));
});

test('terrain supports negative elevations, sampled and explicit teleports, and unsupported spawn falls',async t=>{
 const p=await physics(t,{terrain:grid(()=>-4)});assert.equal(p.latest.grounded,true);close(p.latest.feetY,-4);
 p.input({jump:true});const jump=await p.tick(100);
 assert.ok(Math.max(...jump.map(s=>s.feetY))>-2.95);assert.equal(jump.filter(s=>s.landing===1).length,1);close(p.latest.feetY,-4);
 p.send({type:'teleport',x:4,z:4});await p.tick(5);close(p.latest.feetY,-4);assert.equal(p.latest.grounded,true);
 p.send({type:'teleport',x:6,z:6,y:3});const air=(await p.tick())[0]!;assert.equal(air.grounded,false,JSON.stringify(air));assert.ok(air.vy<0,'spawn height is not assumed to be support');
 const fall=await p.tick(120);assert.ok(fall.some(s=>s.feetY<0&&!s.grounded),'crosses world y=0 without a phantom floor');close(p.latest.feetY,-4);assert.equal(p.latest.grounded,true);
});

test('bridge cuboid elevation is authoritative and jumping off lands on the lower terrain',async t=>{
 const p=await physics(t,{terrain:grid(()=>-3),y:2,obstacles:[{x:0,z:0,y:1.8,hx:2,hz:3,hy:.2}]});
 assert.equal(p.latest.grounded,true);close(p.latest.feetY,2);
 p.input({x:1,jump:true});const flight=await p.tick(100);
 assert.ok(Math.max(...flight.map(s=>s.feetY))>3.05,'jump starts at deck height');
 assert.ok(flight.some(s=>s.x>2.4&&s.feetY<1&&!s.grounded),'leaving bridge retains actual falling momentum');
 assert.equal(flight.filter(s=>s.landing===1).length,1);close(p.latest.feetY,-3);assert.equal(p.latest.grounded,true);
 p.send({type:'teleport',x:0,z:0,y:2});await p.tick(5);p.input({x:1,analog:true});
 for(let i=0;i<60&&p.latest.grounded;i++)await p.tick();assert.equal(p.latest.grounded,false,'walking off an elevated deck loses real support');
 p.input({x:1,analog:true,jump:true});await p.tick();assert.ok(p.latest.vy>6,'bridge edge retains the short coyote window');
});

test('jumping from elevated terrain lands at its lower mesh height with no y=0 clamp',async t=>{
 const terrain=grid(x=>x<=0?5:x>=4?-2:5-x*7/4);
 const p=await physics(t,{terrain,x:-1});close(p.latest.feetY,5);
 p.input({x:1,sprint:true,jump:true});const flight=await p.tick(115);
 assert.ok(flight.some(s=>s.x>4&&s.feetY<2&&!s.grounded));
 assert.ok(flight.some(s=>s.landingSpeed>10),'fall impact includes the terrain height difference');
 assert.equal(p.latest.grounded,true);close(p.latest.feetY,-2);
});

test('terrain controller rejects steep ascent and walks over a small grounded bridge lip',async t=>{
 const p=await physics(t,{terrain:grid(x=>x<=0?1:1+x*2),x:-4});
 p.input({x:1});await p.tick(150);assert.ok(p.latest.x<.4,`cannot climb a 63-degree face: ${p.latest.x}`);
 await p.zone({terrain:grid(()=>2),x:-4,obstacles:[{x:0,z:0,y:2.1,hx:2,hz:3,hy:.1}]});
 p.input({x:1});const walk=await p.tick(80);assert.ok(p.latest.x>1,`autostep crosses a .2m lip: ${JSON.stringify(p.latest)} first ${JSON.stringify(walk.slice(0,5))}`);assert.ok(walk.some(s=>s.x>-.5&&Math.abs(s.feetY-2.2)<.025));
});

test('terrain jumping keeps pause, buffered landing, crouch, ceiling and slide behavior',async t=>{
 const p=await physics(t,{terrain:grid(()=>3)});p.input({jump:true,crouch:true});await p.tick(14);assert.equal(p.latest.crouched,true);
 const position={x:p.latest.x,y:p.latest.y,z:p.latest.z};p.input({paused:true});const paused=await p.tick(30);assert.ok(paused.every(s=>s.x===position.x&&s.y===position.y&&s.z===position.z&&s.vy===0));
 p.input();await p.tick(22);p.input({jump:true});const buffer=await p.tick(20);assert.ok(buffer.some(s=>s.grounded));assert.ok(buffer.some(s=>s.vy>6),'fresh near-landing press buffers a second jump');
 await p.tick(100);close(p.latest.feetY,3);
 p.send({type:'cell-load',key:'roof',revision:1,obstacles:[{x:0,z:0,y:5.7,hx:3,hz:3,hy:.2}]});await p.take('cell-ack');p.input({jump:false});p.input({jump:true});const underRoof=await p.tick(75);
 assert.ok(underRoof.every(s=>s.feetY<3.37));assert.ok(underRoof.some(s=>s.feetY>3.2&&!s.grounded&&s.vy===0));close(p.latest.feetY,3);
 p.send({type:'cell-unload',key:'roof',revision:2});await p.take('cell-ack');p.input({x:1,analog:true});await p.tick(40);p.input({x:1,analog:true,crouch:true});await p.tick(12);assert.equal(p.latest.sliding,true,JSON.stringify(p.latest));
 p.input({x:1,analog:true,crouch:true,jump:true});await p.tick();assert.equal(p.latest.sliding,false);assert.equal(p.latest.grounded,false);
});

test('terrain and elevated streamed cells obey unload revisions and atomic zone epochs',async t=>{
 const p=await physics(t,{terrain:grid(()=>-2),x:-4});
 const wall=[{x:0,z:0,y:1,hx:.5,hz:4,hy:3}];
 p.send({type:'cell-load',key:'parcel',revision:1,obstacles:wall});assert.equal((await p.take('cell-ack')).count,1);
 p.input({x:1});await p.tick(90);assert.ok(p.latest.x<-.8);close(p.latest.feetY,-2);
 p.send({type:'cell-unload',key:'parcel',revision:3});await p.take('cell-ack');p.send({type:'cell-load',key:'parcel',revision:2,obstacles:wall});await p.tick(60);assert.ok(p.latest.x>3);assert.ok(!p.messages.some(m=>m.type==='cell-ack'));
 await p.zone({terrain:grid(()=>5),x:-4});
 p.send({type:'cell-load',epoch:0,key:'parcel',revision:99,obstacles:wall});p.send({type:'teleport',epoch:0,x:10,z:10,y:-20});p.send({type:'input',epoch:0,x:1,z:1,jump:true});p.send({type:'zone',epoch:0,x:1,z:1,obstacles:[]});await p.tick(30);
 assert.equal(p.latest.epoch,1);close(p.latest.x,-4);close(p.latest.feetY,5);assert.equal(p.latest.grounded,true);assert.ok(!p.messages.some(m=>m.type==='cell-ack'));
 p.send({type:'cell-load',key:'parcel',revision:1,obstacles:[{...wall[0]!,y:8}]});assert.equal((await p.take('cell-ack')).count,1);p.input({x:1});await p.tick(90);assert.ok(p.latest.x<-.8,'new epoch resets per-cell revision history');
 await p.zone({bound:80,x:60});close(p.latest.x,60);close(p.latest.feetY,0);p.input({x:1,sprint:true});await p.tick(240);assert.ok(p.latest.x>79.6&&p.latest.x<79.7,'flat dungeon can supply a larger floor/boundary');
});

test('malformed terrain and oversized geometry cannot replace a valid live collision world',async t=>{
 const good=grid(()=>2),p=await physics(t,{terrain:good});
 const invalid=[
  {...good,bound:Infinity}, {...good,bound:0}, {...good,step:NaN},
  {...good,vertices:[NaN,...good.vertices.slice(1)]}, {...good,vertices:[good.bound+1,...good.vertices.slice(1)]},
  {...good,indices:[0,1,good.vertices.length]}, {...good,indices:[0,.5,1]}, {...good,indices:[0,0,0]},
  {...good,indices:[0,1]}, {...good,vertices:Array(65537*3).fill(0)}, {...good,indices:Array(131073*3).fill(0)},
 ];
 for(const terrain of invalid){p.send({type:'zone',epoch:1,x:0,z:0,obstacles:[],terrain});await p.tick();assert.equal(p.latest.epoch,0);close(p.latest.feetY,2);}
 p.send({type:'zone',epoch:1,x:0,z:0,y:NaN,obstacles:[],terrain:good});await p.tick();assert.equal(p.latest.epoch,0);
 p.send({type:'zone',epoch:1,x:0,z:0,bound:NaN,obstacles:[],terrain:good});await p.tick();assert.equal(p.latest.epoch,0);
 await p.zone({terrain:grid(()=>-1)});assert.equal(p.latest.epoch,1);close(p.latest.feetY,-1);
});

test('generated valleys allow grounded camp, yard, settlement, bridge and elevated workshop traversal', {timeout:60_000},async t=>{
 const {generateValley,valleySurfaceHeight}=await import('../src/valley.ts');
 for(const seed of [0,73129,0xffffffff]){
  const plan=generateValley(seed),solidBoxes=[...plan.bridges,...plan.foundations,...plan.buildings.flatMap(b=>b.plan.shapes)].filter(s=>s.solid);
  const obstacles=solidBoxes.map(s=>({x:s.center.x,y:s.center.y,z:s.center.z,hx:s.half.x,hy:s.half.y,hz:s.half.z}));
  const p=await physics(t,{terrain:plan.terrain,...plan.endpoints.spawn,obstacles});
  const walked:Snapshot[]=[];
  const travel=async(target:{x:number;z:number},label:string)=>{
   for(let i=0;i<150;i++){
    const dx=target.x-p.latest.x,dz=target.z-p.latest.z,d=Math.hypot(dx,dz);if(d<.16)return;
    const strength=d<.65?.36:.58;p.input({x:dx/d*strength,z:dz/d*strength,analog:true});walked.push(...await p.tick(3));
   }
   assert.fail(`seed ${seed} blocked on ${label}: at ${JSON.stringify(p.latest)}, target ${JSON.stringify(target)}`);
  };
  const road=async(from:string,to:string)=>{
   const r=plan.roads.find(r=>r.from===from&&r.to===to||r.from===to&&r.to===from);assert.ok(r,`${from}→${to} route exists`);
   const points=r.from===from?r.points:[...r.points].reverse();for(const point of points)await travel(point,r.id);
   p.input();await p.tick(8);assert.ok(p.latest.grounded,`seed ${seed} endpoint ${to} is supported`);
   close(p.latest.feetY,valleySurfaceHeight(plan,p.latest.x,p.latest.z),.075);
  };
  await road('camp','waterworks');
  const foundation=plan.foundations[0]!;await travel(foundation.center,'waterworks foundation center');p.input();await p.tick(8);assert.equal(p.latest.grounded,true);close(p.latest.feetY,foundation.center.y+foundation.half.y,.045);
  await travel(plan.sites.find(s=>s.id==='waterworks')!.position,'waterworks road return');await road('waterworks','pump');
  await road('pump','waterworks');await road('waterworks','mossbank');
  await road('mossbank','bridge-west');await road('bridge-west','bridge-east');
  assert.ok(walked.some(s=>Math.abs(s.x-plan.bridges[0]!.center.x)<1&&Math.abs(s.z-plan.bridges[0]!.center.z)<1&&Math.abs(s.feetY-(plan.bridges[0]!.center.y+plan.bridges[0]!.half.y))<.06),'crosses the physical bridge deck above its carved river bed');
  await road('bridge-east','highmeadow');
  assert.ok(walked.filter(s=>s.grounded).length/walked.length>.985,'walkable road network retains real support');
  assert.ok(walked.every(s=>Math.abs(s.feetY-valleySurfaceHeight(plan,s.x,s.z))<.14),'rendered road surface and real collision height agree');
  for(const [index,building]of plan.buildings.entries()){
   const settlement=plan.settlements.find(s=>s.id===building.settlementId)!;
   // Exercise each different compiled floor/entry without retesting the connecting roads.
   p.send({type:'teleport',...building.spawn,y:building.elevation});await p.tick(5);
   const hall=building.rooms[0]!,entry=building.doors[0]!;
   await travel(entry.center,`${settlement.name} workshop ${index} entry`);await travel(hall.center,`${index} hall`);
   for(const room of building.rooms.slice(1)){
    const door=building.doors.find(d=>d.to===room.id)!;
    for(const point of [{x:door.center.x,z:hall.center.z},door.center,room.center,door.center,{x:door.center.x,z:hall.center.z},hall.center])await travel(point,`${index}/${room.id}`);
   }
   await travel({x:building.workplace.x,z:hall.center.z},`${index} workplace approach`);await travel(building.workplace,`${index} workplace`);
   p.input();await p.tick(8);assert.equal(p.latest.crouched,false);assert.equal(p.latest.grounded,true);close(p.latest.feetY,building.elevation,.045);
   await travel(hall.center,`${index} exit hall`);await travel(entry.center,`${index} exit door`);await travel(building.spawn,`${index} exterior`);
  }
 }
});
