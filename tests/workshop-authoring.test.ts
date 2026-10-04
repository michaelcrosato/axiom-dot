import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_WORKSHOP_DRAFT,WORKSHOP_AUTHORING_FIELDS,compileWorkshopDraft,exportWorkshopPreset,importWorkshopPreset,validateWorkshopDraft,workshopAuthoringReport} from '../src/workshop-authoring.ts';
import {compileWorkshop,workshopWalkable} from '../src/building.ts';
import {compileRecipe} from '../src/procedural.ts';
import {workshopRegistry} from '../src/building.ts';

test('all extreme/midpoint dimensions compile real connected passable bounded geometry',()=>{
 let count=0;
 for(const rearRooms of [1,2,3])for(const width of [8.4,9,9.6])for(const depth of [7,7.6,8.2])for(const hallDepth of [3.1,3.4,3.7])for(const doorwayWidth of [1.4,1.6,1.8]){
  const r=compileWorkshopDraft({...DEFAULT_WORKSHOP_DRAFT,rearRooms,width,depth,hallDepth,doorwayWidth,seed:count++});const w=r.workshop,p=w.plan;
  assert(p.valid);assert.equal(w.rooms.length,rearRooms+1);assert.equal(w.doors.length,rearRooms+1);assert.equal(p.connections.length,rearRooms+1);assert.equal(w.width,width);assert.equal(w.depth,depth);assert.equal(w.doorwayWidth,doorwayWidth);
  assert(p.nodes.length<=64);assert(p.operations<=3000);assert(p.shapes.length<=64);assert.deepEqual(p.exposed.map(e=>e.key),['entry','workplace']);assert(p.constraints.every(c=>c.ok));
  for(const route of r.routes)for(let i=1;i<route.points.length;i++){const a=route.points[i-1]!,b=route.points[i]!;for(let j=0;j<=100;j++)assert(workshopWalkable(w,{x:a.x+(b.x-a.x)*j/100,z:a.z+(b.z-a.z)*j/100},.36));}
  for(const n of Object.values(p.costs))assert(Number.isFinite(n)&&n>=0);
 }
 assert.equal(count,243);
});
test('geometry and versions are deterministic; changing recipe cannot alter legacy workshop',()=>{
 const legacy=JSON.stringify(compileWorkshop(73129));const r=compileWorkshopDraft(DEFAULT_WORKSHOP_DRAFT);assert.deepEqual(r,compileWorkshopDraft(DEFAULT_WORKSHOP_DRAFT));
 assert.equal(r.workshop.plan.recipe.id,'frontier-workshop-editor');assert.equal(r.workshop.plan.owner,'preview/workshop-authoring');
 const plan=compileRecipe(workshopRegistry,JSON.parse(JSON.stringify(r.recipe)),{seed:r.parameters.seed,owner:r.workshop.plan.owner,bounds:r.workshop.bounds,maxCost:{stone:48,timber:32,metal:8,labor:36}});
 assert.deepEqual(plan.shapes,r.workshop.plan.shapes);assert.deepEqual(plan.connections,r.workshop.plan.connections);
 for(const f of WORKSHOP_AUTHORING_FIELDS){const changed=compileWorkshopDraft({...DEFAULT_WORKSHOP_DRAFT,[f.key]:f.min});if(f.key!=='seed')assert.notDeepEqual(changed.workshop.plan.shapes,r.workshop.plan.shapes);}
 assert.equal(JSON.stringify(compileWorkshop(73129)),legacy);
 assert.equal(workshopAuthoringReport(r).scope,'isolated-preview');assert.equal(workshopAuthoringReport(r).visualReview,'not-reviewed');
});
test('portable input is exact versioned finite data; no coercions, scripts, accessors or excess size',()=>{
 const text=exportWorkshopPreset(DEFAULT_WORKSHOP_DRAFT);assert.deepEqual(importWorkshopPreset(text),DEFAULT_WORKSHOP_DRAFT);
 for(const version of [0,2,'1',null])assert.throws(()=>importWorkshopPreset(JSON.stringify({...JSON.parse(text),version})));
 for(const extra of [{code:'alert(1)'},{owner:'valley/workshop'},{recipe:'frontier-workshop@1'}])assert.throws(()=>importWorkshopPreset(JSON.stringify({...JSON.parse(text),...extra})));
 for(const f of WORKSHOP_AUTHORING_FIELDS)for(const value of [NaN,Infinity,-Infinity,'1',null,f.min-f.step,f.max+f.step,f.min+f.step/2])assert.throws(()=>validateWorkshopDraft({...DEFAULT_WORKSHOP_DRAFT,[f.key]:value}));
 assert.throws(()=>importWorkshopPreset(' '.repeat(4097)));assert.throws(()=>importWorkshopPreset('{'));assert.throws(()=>validateWorkshopDraft({...DEFAULT_WORKSHOP_DRAFT,execute:()=>{}}));
 let read=false;const accessor={...DEFAULT_WORKSHOP_DRAFT};Object.defineProperty(accessor,'seed',{enumerable:true,get(){read=true;return 1;}});assert.throws(()=>validateWorkshopDraft(accessor));assert(!read);
 assert.throws(()=>importWorkshopPreset(text.replace('"parameters": {','"parameters": {"__proto__": {},')));
});
