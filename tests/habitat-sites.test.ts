import test from 'node:test';
import assert from 'node:assert/strict';
import {habitatSiteDescriptors} from '../src/habitat-sites.ts';
import {restorationPlan,validHabitatSiteDescriptors} from '../src/restoration-plan.ts';
import {regionalPlan,regionalHeight,regionalObstaclesNear} from '../src/regional-world.ts';
import {obstacleSegmentIntersects} from '../src/wilderness-geometry.ts';
test('additive habitats compile three six-cell plots on clear ground without changing base landmarks',()=>{
 const seeds=[0,1,19,73129,0xffffffff,...Array.from({length:25},(_,i)=>Math.imul(i+1,2654435761)>>>0)];let edges=0;
 for(const seed of seeds){const region=regionalPlan(seed),before=JSON.stringify(region),sites=habitatSiteDescriptors(seed);assert(validHabitatSiteDescriptors(sites));assert.equal(sites.length,3);assert(Object.isFrozen(sites));assert.equal(habitatSiteDescriptors(seed),sites);const model=restorationPlan(seed,sites);assert.equal(model.sites.length,3);
  for(const site of sites){assert.equal(site.cells.length,6);assert.equal(site.edges.length,7);const solids=regionalObstaclesNear(seed,site.x,site.z);
   for(const c of site.cells){assert.equal(c.y,regionalHeight(seed,c.x,c.z));assert(!solids.some(o=>obstacleSegmentIntersects(o,{...c,y:c.y+.75},{...c,y:c.y+.75},1.15)));}
   for(const edge of site.edges){edges++;for(let i=1;i<edge.path.length;i++){const a=edge.path[i-1]!,b=edge.path[i]!;assert(Math.abs(a.y-b.y)<=Math.hypot(a.x-b.x,a.z-b.z)*.3+1e-8);assert(!solids.some(o=>obstacleSegmentIntersects(o,{...a,y:a.y+.75},{...b,y:b.y+.75},1.15)));}}
  }
  assert.equal(JSON.stringify(region),before,'no old landmark or terrain mutation');
 }
 assert.equal(edges,seeds.length*21);
});
test('habitat placement is seed-variable geometry and independent of cache and query order',()=>{
 const a=habitatSiteDescriptors(73129),geometry=(p:ReturnType<typeof habitatSiteDescriptors>)=>p.map(s=>s.cells.map(c=>[c.x,c.y,c.z]));const before=geometry(a);for(const seed of [8,7,6,5,4,3,2,1])habitatSiteDescriptors(seed);assert.deepEqual(geometry(habitatSiteDescriptors(73129)),before);assert.notDeepEqual(geometry(habitatSiteDescriptors(0)),before);for(const seed of [-1,NaN,1.5,0x100000000])assert.throws(()=>habitatSiteDescriptors(seed));
});
