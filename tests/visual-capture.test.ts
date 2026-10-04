import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCapturePlan,dueCaptureTicks,createVisualCapture} from '../src/visual-capture.ts';
import {VISUAL_FIXTURES,labReplayFixture,LAB_CAPTURE_TICKS} from '../src/visual-fixtures.ts';
import {LAB_SCRIPTS} from '../src/lab-script.ts';
import * as THREE from 'three/webgpu';
import {createAvatar} from '../src/avatar.ts';
import {compileEquipment} from '../src/equipment.ts';

// These checks validate orchestration and fixtures only. They do not render pixels.
test('capture plans are finite and bounded; backlogs never duplicate a rendered image for old ticks',()=>{
 assert.deepEqual(normalizeCapturePlan({scenario:'jump',ticks:[40,0,10]}),{scenario:'jump',ticks:[0,10,40],maxTickLateness:0});
 for(const ticks of [[],[0,0],[-1],[NaN],[.5],Array.from({length:37},(_,i)=>i)])assert.throws(()=>normalizeCapturePlan({scenario:'test',ticks}));
 assert.throws(()=>normalizeCapturePlan({scenario:'',ticks:[0]}));assert.throws(()=>normalizeCapturePlan({scenario:'test',ticks:[0],maxTickLateness:7}));
 assert.deepEqual(dueCaptureTicks([0,5,10,20],11,2),{missed:[0,5],capture:10});
 assert.deepEqual(dueCaptureTicks([0,5,10,20],11,0),{missed:[0,5,10],capture:null});
});
function harness(mode:'varied'|'uniform'|'throw'='varied'){
 let draws=0;const data=mode==='varied'?new Uint8ClampedArray([0,0,0,255,200,100,10,255]):new Uint8ClampedArray([100,100,100,255,100,100,100,255]);
 const makeCanvas=()=>({width:0,height:0,getContext:()=>({fillStyle:'',fillRect(){},drawImage(){draws++;if(mode==='throw')throw new Error('Synthetic capture failure');},getImageData:()=>({data})})}) as unknown as HTMLCanvasElement;
 const capture=createVisualCapture({width:800,height:500} as HTMLCanvasElement,{metadata:()=>({scope:'non-rendering unit test'}),makeCanvas,now:()=> '2026-10-01T00:00:00Z'});
 return {capture,draws:()=>draws};
}
test('capture consumes only matching new rendered ticks; review starts and stays unapproved',()=>{
 const {capture,draws}=harness();capture.arm({scenario:'jump',ticks:[0,5,10],maxTickLateness:1});
 assert.equal(capture.afterRender({scenario:'other',tick:0}),false);assert.equal(draws(),0);
 assert.equal(capture.afterRender({scenario:'jump',tick:0}),true);assert.equal(capture.afterRender({scenario:'jump',tick:0}),false);
 assert.equal(capture.afterRender({scenario:'jump',tick:10}),true);
 const report=capture.report();assert.equal(report.status,'completed');assert.equal(report.visualReview,'not-reviewed');assert.equal(draws(),2);assert.deepEqual(report.entries.map(e=>e.status),['captured','missed','captured']);assert.equal(report.entries[1]!.actualTick,null);
 report.entries[0]!.status='failed';assert.equal(capture.report().entries[0]!.status,'captured','Report consumers cannot mutate stored evidence');
});
test('blank-like frames and capture failures are visible; interrupt never fabricates missing frames',()=>{
 for(const [mode,expected]of [['uniform','suspect'],['throw','failed']]as const){const {capture}=harness(mode);capture.arm({scenario:'test',ticks:[0,10]});capture.afterRender({scenario:'test',tick:0});capture.cancel('Window lost focus');const r=capture.report();assert.equal(r.status,'interrupted');assert.equal(r.entries[0]!.status,expected);assert.ok(r.entries[0]!.reason);assert.equal(r.entries[1]!.status,'missed');assert.equal(r.entries[1]!.actualTick,null);}
});
test('pose IDs and replay sample windows are stable, unique and finite',()=>{
 assert.equal(VISUAL_FIXTURES.length,24);assert.equal(new Set(VISUAL_FIXTURES.map(f=>f.id)).size,24);
 for(const f of VISUAL_FIXTURES){assert.ok(f.watch.length>15);for(const v of Object.values(f.animation))if(typeof v==='number')assert.ok(Number.isFinite(v));}
 for(const [id,script]of Object.entries(LAB_SCRIPTS)){const a=labReplayFixture(id);assert.deepEqual(a,labReplayFixture(id));assert.equal(a.frames.length,Math.round(script.seconds*60));assert.ok(LAB_CAPTURE_TICKS[id]!.every(t=>t>=0&&t<a.frames.length));assert.deepEqual(a.frames[0]!.input,script.input(0));}
 assert.throws(()=>labReplayFixture('unknown'));
});
test('every authored pose compiles with each review loadout and retains a finite above-floor mesh envelope',()=>{
 const avatar=createAvatar();
 for(const gear of [null,compileEquipment(73129,{grip:'linen',shaft:'reed',head:'prism'}),compileEquipment(73130,{grip:'braced',shaft:'ironwood',head:'crown'})]){
  avatar.setEquipment(gear);for(const f of VISUAL_FIXTURES){avatar.update(f.animation,f.action,f.progress,f.combo);avatar.root.position.y=f.floorY;avatar.root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(avatar.root,true);assert.ok(Number.isFinite(box.max.y),f.id);assert.ok(box.min.y>=f.floorY-.002,f.id+' mesh below its feet plane');}
 }
});

test('discard clears completed image evidence and a later recording starts empty',()=>{const {capture}=harness();capture.arm({scenario:'town-motion',ticks:[0]});capture.afterRender({scenario:'town-motion',tick:0});assert.equal(capture.report().entries.length,1);capture.clear();assert.equal(capture.report().status,'idle');assert.deepEqual(capture.report().entries,[]);capture.arm({scenario:'town-motion',ticks:[5]});assert.deepEqual(capture.report().entries,[]);});
