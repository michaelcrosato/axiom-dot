import test from 'node:test';
import assert from 'node:assert/strict';
import {regionalPhysics,terrainCell,REGION_BOUND} from './helpers/regional-physics.ts';
import {regionalBodyCenterBound} from '../src/regional-bounds.ts';
const prop=(p:Awaited<ReturnType<typeof regionalPhysics>>)=>(p.latest as any).movable[0] as {x:number;y:number;z:number;hx:number;hy:number;hz:number};
// Existing support ray starts4cm above each bottom corner and spans10cm,
// so a settled drop is supported within6cm of the authored half-height.
const crate={id:'survey-crate',x:36,y:4,z:32,hx:.56,hy:.74,hz:.56};

test('dropped regional crate stays exact while its terrain unloads and resumes real support on revisit',async t=>{
 const p=await regionalPhysics(t,{movable:[crate],interactionEnabled:true});await p.tick(150);assert.ok(prop(p).y>=prop(p).hy-.005&&prop(p).y<=prop(p).hy+.061,JSON.stringify(prop(p)));const settled={...prop(p)};
 p.send({type:'cell-load',...terrainCell(10,0)});await p.take('cell-ack');p.send({type:'teleport',x:672,z:32});await p.tick(3);p.send({type:'cell-unload',key:'region:0:0',revision:2});await p.take('cell-ack');await p.tick(1800);assert.deepEqual(prop(p),settled,'no gravity or position churn while support is absent');assert.equal(p.latest.streaming!.terrainCells,1);assert.equal(p.latest.streaming!.totalColliders,7,'one remote finite prop does not pin or duplicate terrain');
 p.send({type:'cell-load',...terrainCell(0,0,()=>0,3)});await p.take('cell-ack');p.send({type:'teleport',x:32,z:32});await p.tick(120);assert.ok(Math.abs(prop(p).y-settled.y)<.002);assert.equal(prop(p).x,settled.x);assert.equal(prop(p).z,settled.z);assert.equal(p.latest.streaming!.terrainCells,2);
 t.diagnostic(JSON.stringify({scope:'One actual dropped prop,30s after supporting chunk unload, then reload/revisit',dormantY:settled.y,revisitedY:prop(p).y,remoteTotalColliders:7}));
});

test('cold-loaded distant saved crate and partial-footprint crate freeze until all support collision is ready',async t=>{
 const far={...crate,x:1000,y:7},p=await regionalPhysics(t,{movable:[far],interactionEnabled:true});await p.tick(1800);assert.deepEqual(prop(p),far,'no terrain under distant saved prop, no fabricated floor or falling');
 p.send({type:'cell-load',...terrainCell(15,0)});await p.take('cell-ack');const before=prop(p).y;await p.tick(5);assert.ok(prop(p).y<before,'real gravity resumes after collision-ready ack');await p.tick(180);assert.ok(prop(p).y>=prop(p).hy-.005&&prop(p).y<=prop(p).hy+.061,JSON.stringify(prop(p)));const farRestY=prop(p).y;
 const partial={...crate,x:63.8,y:4};await p.zone({x:32,z:32,movable:[partial],interactionEnabled:true});await p.tick(1800);assert.equal(prop(p).y,4,'crate center support alone cannot authorize an incomplete footprint');p.send({type:'cell-load',...terrainCell(1,0)});await p.take('cell-ack');await p.tick(180);assert.ok(prop(p).y>=prop(p).hy-.005&&prop(p).y<=prop(p).hy+.061,JSON.stringify(prop(p)));
 t.diagnostic(JSON.stringify({scope:'Cold distant saved prop plus partial footprint,30s dormancy each; actual gravity resumes only after complete terrain readiness',farRestY,partialRestY:prop(p).y}));
});

test('regional crate constructor and repeated paired pushes obey the shared half-extent plus skin bound',async t=>{
 const bound=regionalBodyCenterBound(REGION_BOUND,.56),edge={...crate,x:bound-.5,y:.74},p=await regionalPhysics(t,{x:edge.x-.98,z:32,initialCells:[terrainCell(24,0)],movable:[edge],interactionEnabled:true});
 p.send({type:'contact-grab'});p.input({x:1,analog:true});const motion=await p.tick(1800);assert.ok(motion.some(s=>(s as any).contact.mode==='push'),'actual contact kernel acquires the crate');for(const s of motion){const c=(s as any).movable[0];assert.ok(c.x<=bound&&Math.abs(c.z)<=bound);assert.ok(s.x+.32<=c.x-c.hx+.004,'paired push retains separation');}assert.ok(prop(p).x>edge.x+.2);assert.ok(prop(p).x<=bound);
 await p.zone({x:REGION_BOUND-3,z:32,initialCells:[terrainCell(24,0)],movable:[{...edge,x:REGION_BOUND-.565}],interactionEnabled:true});assert.equal(prop(p).x,bound,'old near-edge prop pose normalizes before simulation');assert.ok(prop(p).y>=prop(p).hy-.005&&prop(p).y<=prop(p).hy+.061,JSON.stringify(prop(p)));
 t.diagnostic(JSON.stringify({scope:'Actual30s paired push plus near-edge saved crate normalization',halfExtent:.56,centerBound:bound,finalCrateX:prop(p).x}));
});

test('held crate cannot advance its full footprint into an unready terrain cell and resumes after readiness',async t=>{
 const edge={...crate,x:62.8,y:.74},p=await regionalPhysics(t,{x:edge.x-.98,z:32,movable:[edge],interactionEnabled:true});p.send({type:'contact-grab'});p.input({x:1,analog:true});const before=await p.tick(300);assert.ok(before.some(s=>(s as any).contact.mode==='push'));assert.ok(prop(p).x+prop(p).hx+.02<=64.00001,'future complete footprint stops at ready terrain edge');assert.ok(prop(p).x>63,'actually approaches the missing neighbor');const stopped=prop(p).x;p.send({type:'cell-load',...terrainCell(1,0)});await p.take('cell-ack');await p.tick(180);assert.ok(prop(p).x>stopped+1,'same real grip advances only after both terrains are ready');assert.ok(prop(p).y>=prop(p).hy-.005&&prop(p).y<=prop(p).hy+.061,JSON.stringify(prop(p)));
});
