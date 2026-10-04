import {MANTLE_TICKS} from '../src/ledge-mantle.ts';
import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {validPlayerContact,validMovableBodies,type PlayerContact,type MovableBody} from '../src/player-contact.ts';
type Snapshot={type:string;epoch:number;step:number;x:number;y:number;z:number;feetY:number;vx:number;vy:number;vz:number;grounded:boolean;contact:PlayerContact;movable:MovableBody[]};
async function physics(t:TestContext,config:Record<string,unknown>={}){
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);parentPort.on('message',m=>self.onmessage({data:m}));import(${JSON.stringify(new URL('../src/physics.worker.ts',import.meta.url).href)}).then(()=>parentPort.postMessage({type:'boot'}));`,{eval:true,execArgv:['--experimental-strip-types']});
 t.after(()=>worker.terminate());const messages:any[]=[],snapshots:Snapshot[]=[];let error:Error|undefined,epoch=0,latest:Snapshot;
 worker.on('error',e=>error=e);worker.on('message',m=>{messages.push(m);if(m.type==='error')error=new Error(m.message);if(m.type==='snapshot'){latest=m;snapshots.push(m);}});
 const take=async(type:string)=>{const end=Date.now()+5000;for(;;){if(error)throw error;const i=messages.findIndex(m=>m.type===type);if(i>=0)return messages.splice(i,1)[0];assert.ok(Date.now()<end,`Waiting ${type}`);await new Promise(r=>setTimeout(r,2));}};
 const send=(m:Record<string,unknown>)=>worker.postMessage({epoch,...m});
 const tick=async(ticks=1)=>{const n=snapshots.length;for(let left=ticks;left>0;left-=120){send({type:'step',ticks:Math.min(120,left),requestId:Math.random()});await take('stepped');}return snapshots.slice(n);};
 const input=(values:Record<string,unknown>={})=>send({type:'input',x:0,z:0,...values});
 await take('boot');send({type:'init',x:0,z:0,obstacles:[],manual:true,interactionEnabled:true,...config});await take('ready');await tick(3);
 return {send,input,tick,get latest(){return latest!;},async zone(config:Record<string,unknown>={}){epoch++;send({type:'zone',x:0,z:0,obstacles:[],manual:true,interactionEnabled:true,...config});await take('ready');await tick(3);}};
}
const crate={id:'crate',x:1,y:.62,z:0,hx:.5,hy:.6,hz:.5};
const ledge={x:1.5,y:1.2,z:0,hx:.8,hy:1.2,hz:2};
test('contact contract rejects nonfinite and duplicate movable data',()=>{
 assert.equal(validMovableBodies([crate]),true);assert.equal(validMovableBodies([crate,crate]),false);assert.equal(validMovableBodies([{...crate,x:NaN}]),false);
});
test('production wall evidence uses real normals, obstruction and reachable palms; release clears anchors',async t=>{
 const p=await physics(t,{obstacles:[{x:1,z:0,hx:.2,hy:3,hz:2}]});p.input({x:1});await p.tick(70);const c=p.latest.contact;
 assert.equal(c.mode,'wall');assert.ok(c.strength>.8);assert.ok(c.normal.x<-.95);assert.ok(c.desired.x>c.resolved.x+.03);assert.ok(c.supported);assert.ok(c.point&&Math.abs(c.point.x-.8)<.03);assert.ok(c.leftHand&&c.rightHand);assert.ok(validPlayerContact(c));
 p.input({x:-1});const release=await p.tick(20);assert.equal(p.latest.contact.mode,'none');assert.equal(p.latest.contact.leftHand,null);assert.ok(p.latest.contact.strength<.04);assert.ok(release.every(s=>validPlayerContact(s.contact)));
 await p.zone();p.input({x:1});await p.tick(70);assert.equal(p.latest.contact.mode,'none');assert.equal(p.latest.contact.strength,0);
});
test('deliberate grip drives bounded actual crate push/pull and respects solid backing',async t=>{
 const p=await physics(t,{movable:[crate]});p.send({type:'contact-grab'});p.input({x:1});await p.tick(60);
 assert.equal(p.latest.contact.mode,'push');assert.ok(p.latest.movable[0]!.x>1.6,JSON.stringify(p.latest));assert.ok(p.latest.movable[0]!.x<2.2);const forward=p.latest.movable[0]!.x;
 p.input({x:-1});await p.tick(50);assert.equal(p.latest.contact.mode,'pull');assert.ok(p.latest.movable[0]!.x<forward-.4);assert.ok(Math.abs(p.latest.vx)<=1.151);
 p.send({type:'contact-grab'});p.input({x:-1});await p.tick(30);assert.equal(p.latest.contact.targetId,null);
 await p.zone({movable:[crate],obstacles:[{x:2.1,y:2,z:0,hx:.2,hy:2,hz:2}]});p.send({type:'contact-grab'});p.input({x:1});await p.tick(120);
 assert.ok(p.latest.movable[0]!.x+.5<=1.901);assert.ok(p.latest.x+.32<=p.latest.movable[0]!.x-.5+.001);
});
test('ledge hang is deliberate, uses real supports, drops on crouch and climbs on a fresh jump',async t=>{
 const p=await physics(t,{obstacles:[ledge]});p.input({x:.7,jump:true,grab:true});const launch=await p.tick(30);
 assert.ok(launch.some(s=>s.contact.mode==='hang'),JSON.stringify(launch.map(s=>[s.x,s.feetY,s.contact.mode])));assert.equal(p.latest.contact.mode,'hang');assert.ok(p.latest.contact.leftHand&&p.latest.contact.rightHand,'both supported hang hands remain anchored');assert.ok(Math.abs(p.latest.feetY-.5)<.01);assert.equal(p.latest.grounded,false);
 const held=await p.tick(30);assert.ok(held.every(s=>s.contact.mode==='hang'),'held takeoff jump must not climb');
 p.input({jump:false,grab:true});await p.tick();p.input({jump:true,grab:true});const climb=await p.tick(MANTLE_TICKS+12);
 assert.ok(climb.some(s=>s.contact.mode==='climb'));assert.ok(p.latest.feetY>2.38&&p.latest.feetY<2.45);assert.ok(p.latest.x>.8);assert.equal(p.latest.grounded,true);
 await p.zone({obstacles:[ledge]});p.input({x:.7,jump:true,grab:true});await p.tick(30);p.input({crouch:true});const drop=await p.tick(60);assert.ok(drop.some(s=>s.vy<0));assert.equal(p.latest.contact.mode,'none');assert.equal(p.latest.grounded,true);
});

test('crate grip requires real proximity, two reachable palms, line of sight and support',async t=>{
 const p=await physics(t,{movable:[{...crate,x:2}]});p.send({type:'contact-grab'});p.input({x:1});await p.tick(8);assert.equal(p.latest.contact.targetId,null);assert.equal(p.latest.movable[0]!.x,2);
 await p.zone({movable:[crate],obstacles:[{x:.45,z:0,y:1.3,hx:.1,hy:.15,hz:1}]});p.send({type:'contact-grab'});p.input({x:1});await p.tick(30);assert.equal(p.latest.contact.targetId,null);assert.equal(p.latest.movable[0]!.x,1);
 await p.zone({movable:[{...crate,y:1.5}]});p.send({type:'contact-grab'});p.input({x:-1});await p.tick(90);assert.equal(p.latest.contact.targetId,null);assert.equal(p.latest.movable[0]!.x,1);assert.ok(p.latest.movable[0]!.y<.65,'unsupported box settles instead of floating');
 await p.zone({movable:[{...crate,id:'far',x:-1.1,z:0},crate]});p.send({type:'contact-grab'});await p.tick();assert.equal(p.latest.contact.targetId,'crate','nearest visible supported target only');
});

test('pulling is jointly swept against player backing; ground-level boxes move without penetrating floor',async t=>{
 const p=await physics(t,{movable:[{...crate,y:.6}],obstacles:[{x:-.9,z:0,y:2,hx:.2,hy:2,hz:2}]});p.send({type:'contact-grab'});p.input({x:-1});await p.tick(120);
 assert.equal(p.latest.contact.mode,'pull');assert.ok(p.latest.x>-.39,'player blocked by backing wall');assert.ok(p.latest.movable[0]!.x>.6,'crate stopped with player');assert.ok(p.latest.movable[0]!.x<.9,'grounded box still moved');assert.ok(p.latest.movable[0]!.x-.5>=p.latest.x+.32-.002,'pair never overlaps');
});

test('supports at a cliff stop a crate before it becomes a hovering bridge',async t=>{
 const p=await physics(t,{y:1,movable:[{...crate,y:1.6}],obstacles:[{x:0,z:0,y:.5,hx:2,hy:.5,hz:3}]});p.send({type:'contact-grab'});p.input({x:1});await p.tick(120);
 assert.ok(p.latest.movable[0]!.x<1.64);assert.ok(Math.abs(p.latest.movable[0]!.y-1.6)<.001);assert.ok(p.latest.x+.32<p.latest.movable[0]!.x-.5);
});

test('online and default-off worlds suppress grip/hang while retaining real wall contact',async t=>{
 const p=await physics(t,{online:true,movable:[crate]});p.send({type:'contact-grab'});p.input({x:1,grab:true});await p.tick(120);assert.equal(p.latest.movable[0]!.x,1);assert.equal(p.latest.contact.mode,'wall');assert.equal(p.latest.contact.targetId,null);
 await p.zone({interactionEnabled:false,obstacles:[ledge]});p.input({x:.7,jump:true,grab:true});const flight=await p.tick(100);assert.ok(flight.every(s=>s.contact.mode!=='hang'&&s.contact.mode!=='climb'));assert.equal(p.latest.grounded,true);
});

test('epochs, teleport, pause, release and online authority discard old interaction state',async t=>{
 const p=await physics(t,{movable:[crate]});p.input({grab:true,x:1});p.input({grab:false,x:1});await p.tick(15);assert.equal(p.latest.contact.targetId,'crate','a press/release between ticks is preserved');
 p.send({type:'teleport',x:-4,z:0});await p.tick();assert.equal(p.latest.contact.mode,'none');const crateX=p.latest.movable[0]!.x;await p.tick(20);assert.equal(p.latest.movable[0]!.x,crateX);
 await p.zone({movable:[crate]});p.send({type:'contact-grab',epoch:0});p.send({type:'input',epoch:0,x:1,z:0,grab:true});await p.tick(30);assert.equal(p.latest.x,0);assert.equal(p.latest.contact.mode,'none');assert.equal(p.latest.movable[0]!.x,1);
 p.send({type:'contact-grab'});p.input({x:1});await p.tick(10);p.send({type:'contact-release'});p.input();await p.tick(30);assert.equal(p.latest.contact.targetId,null);
 await p.zone({obstacles:[ledge]});p.input({x:.7,jump:true,grab:true});await p.tick(30);assert.equal(p.latest.contact.mode,'hang');p.send({type:'contact-grab'});p.input();await p.tick(60);assert.equal(p.latest.contact.mode,'none');assert.equal(p.latest.grounded,true,'same deliberate action releases hang');
});

test('a ceiling or missing paired top support prevents hang, and a new roof rejects a climb',async t=>{
 const roof={x:1.5,z:0,y:4.5,hx:2,hy:.2,hz:3};
 const p=await physics(t,{obstacles:[ledge,roof]});p.input({x:.7,jump:true,grab:true});const blocked=await p.tick(100);assert.ok(blocked.every(s=>s.contact.mode!=='hang'&&s.contact.mode!=='climb'),'destination full capsule must fit below roof');
 await p.zone({obstacles:[{...ledge,hz:.15}]});p.input({x:.7,jump:true,grab:true});const narrow=await p.tick(100);assert.ok(narrow.every(s=>s.contact.mode!=='hang'),'both separated top support probes required');
 await p.zone({obstacles:[ledge]});p.input({x:.7,jump:true,grab:true});await p.tick(30);assert.equal(p.latest.contact.mode,'hang');p.send({type:'cell-load',key:'roof',revision:1,obstacles:[{...roof,y:4.1}]});await p.tick(2);p.input({grab:true});await p.tick();p.input({jump:true,grab:true});const stay=await p.tick(45);assert.ok(stay.every(s=>s.contact.mode!=='climb'));assert.ok(stay.every(s=>s.feetY<.55),'blocked climb cannot teleport above ceiling');
});

test('saved x/z inside crate resolves onto its clear top or a clear side under a low roof',async t=>{
 const p=await physics(t,{x:1,movable:[crate]});assert.ok(p.latest.feetY>1.19);assert.ok(p.latest.grounded);assert.ok(p.latest.y-1.07>=1.2);
 await p.zone({x:1,movable:[crate],obstacles:[{x:1,y:3.1,z:0,hx:.7,hy:.1,hz:.7}]});assert.ok(Math.abs(p.latest.x-1)>.8||Math.abs(p.latest.z)>.8,'safe side chosen when top has insufficient headroom');assert.ok(p.latest.feetY<.01);
});

test('manual replay is deterministic and one-shot deliberate ledge action survives an input pulse',async t=>{
 const p=await physics(t,{obstacles:[ledge]});p.input({x:.7,jump:true});await p.tick(4);p.send({type:'contact-grab'});p.input({x:.7,jump:true,grab:false});await p.tick(30);assert.equal(p.latest.contact.mode,'hang');
 const record=async()=>{await p.zone({movable:[crate]});p.send({type:'contact-grab'});p.input({x:1});const push=await p.tick(50);p.input({x:-1});const pull=await p.tick(50);return [...push,...pull].map(s=>({...s,epoch:0}));};
 const a=await record(),b=await record();assert.deepEqual(a,b);assert.ok(a.every(s=>s.step>=4&&validPlayerContact(s.contact)&&validMovableBodies(s.movable)));
});

test('explicit release drops a hang and paused grab events cannot leak through a menu',async t=>{
 const p=await physics(t,{obstacles:[ledge]});p.input({x:.7,jump:true,grab:true});await p.tick(30);assert.equal(p.latest.contact.mode,'hang');p.send({type:'contact-release'});p.input();const falling=await p.tick(4);assert.ok(falling.some(s=>s.vy<0));assert.equal(p.latest.contact.mode,'none');
 await p.zone({movable:[crate]});p.send({type:'contact-grab'});p.input({paused:true});await p.tick(5);p.send({type:'contact-grab'});p.input({paused:true,grab:true});p.input({grab:true,x:1});await p.tick(40);assert.equal(p.latest.movable[0]!.x,1);assert.equal(p.latest.contact.targetId,null);
 await p.zone({obstacles:[ledge]});p.input({paused:true,grab:true});p.input({x:.7,jump:true,grab:true});const flight=await p.tick(80);assert.ok(flight.every(s=>s.contact.mode!=='hang'&&s.contact.mode!=='climb'),'grab begun inside menu is discarded');
});

test('pause freezes committed hang/grip and resumes them without retaining pending actions',async t=>{
 const p=await physics(t,{obstacles:[ledge]});p.input({x:.7,jump:true,grab:true});await p.tick(30);assert.equal(p.latest.contact.mode,'hang');const hanging=structuredClone(p.latest);
 p.input({paused:true,jump:true});const frozen=await p.tick(60);assert.ok(frozen.every(s=>s.contact.mode==='hang'&&s.x===hanging.x&&s.y===hanging.y&&s.z===hanging.z&&s.vy===0));assert.deepEqual(p.latest.contact.leftHand,hanging.contact.leftHand);assert.deepEqual(p.latest.contact.rightHand,hanging.contact.rightHand);
 p.send({type:'contact-grab'});p.input({jump:true});await p.tick(20);assert.equal(p.latest.contact.mode,'hang','paused request is discarded and held takeoff cannot climb');assert.equal(p.latest.y,hanging.y);
 p.input({jump:false});await p.tick();p.input({jump:true});await p.tick(MANTLE_TICKS+12);assert.ok(p.latest.grounded&&p.latest.feetY>2.38,'fresh post-menu jump still climbs');
 await p.zone({movable:[crate]});p.send({type:'contact-grab'});p.input({x:1});await p.tick(15);assert.equal(p.latest.contact.targetId,'crate');const held=structuredClone(p.latest);p.input({paused:true,x:1});await p.tick(40);assert.equal(p.latest.contact.targetId,'crate');assert.equal(p.latest.x,held.x);assert.deepEqual(p.latest.movable,held.movable);p.input({x:1});await p.tick(20);assert.equal(p.latest.contact.targetId,'crate');assert.ok(p.latest.movable[0]!.x>held.movable[0]!.x+.2);
});

test('grip request receipt appears only on a snapshot after the exact request is consumed',async t=>{
 const p=await physics(t,{movable:[crate]});p.input({x:1});const queued=await p.tick(3);
 assert.ok(queued.every(s=>(s as any).contactRequestId===null));
 p.send({type:'contact-grab',requestId:'contact-0-1'});const acknowledged=(await p.tick())[0]!;
 assert.equal((acknowledged as any).contactRequestId,'contact-0-1');assert.equal(acknowledged.contact.targetId,'crate');
 assert.ok(queued.every(s=>(s as any).contactRequestId!=='contact-0-1'),'queued higher-step snapshots cannot acknowledge a later intent');
 p.send({type:'contact-grab',requestId:'contact-0-2'});await p.tick();assert.equal((p.latest as any).contactRequestId,'contact-0-2');assert.equal(p.latest.contact.targetId,null);
 await p.zone({movable:[crate]});p.send({type:'contact-grab',epoch:0,requestId:'stale'});await p.tick();assert.equal((p.latest as any).contactRequestId,null);
});
