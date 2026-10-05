import test from 'node:test';
import assert from 'node:assert/strict';
import {regionalPlan,regionalHeight,regionalTownRoads,generateRegionalChunk,regionalChunkAt,REGIONAL_MAX_ROAD_GRADE} from '../src/regional-world.ts';
import {regionalTrailGradeAudit} from '../src/regional-routes.ts';

// Seeds whose west gateway trail had a ~1 m terrain step where the flat
// Hearthmere connector blend met the graded trail (sampled grades 0.30–0.50).
// Found by the documented stress sweep (tests/helpers/regional-generation-stress.ts).
const REGRESSION_SEEDS=[1013904226,4020695695,922480359,2540510697,1687004096];
function sampledGrade(seed:number,points:readonly {x:number;z:number}[],spacing=2){
 let max=0,at={x:0,z:0};
 for(let i=1;i<points.length;i++){
  const a=points[i-1]!,b=points[i]!,length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(length/spacing));
  let previous=regionalHeight(seed,a.x,a.z);
  for(let k=1;k<=steps;k++){const t=k/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=regionalHeight(seed,x,z),grade=Math.abs(y-previous)/(length/steps);if(grade>max){max=grade;at={x,z};}previous=y;}
 }
 return {max,at};
}

test('west gateway trail stays within the regional road grade where it meets the town connector',()=>{
 for(const seed of [...REGRESSION_SEEDS,0,73129,4294967295]){
  const plan=regionalPlan(seed),trail=plan.roads.find(r=>r.from===plan.gateways[0]!.id)!;
  // Sample the first 96 m at 0.5 m: the former step sat 24–28 m from the gateway.
  const gate=trail.points[0]!,next=trail.points[1]!,head=[gate,{x:gate.x+(next.x-gate.x)*96/Math.hypot(next.x-gate.x,next.z-gate.z),z:gate.z+(next.z-gate.z)*96/Math.hypot(next.x-gate.x,next.z-gate.z)}];
  const fine=sampledGrade(seed,head,.5),whole=sampledGrade(seed,trail.points);
  assert.ok(fine.max<=REGIONAL_MAX_ROAD_GRADE,`seed ${seed}: ${fine.max} at ${fine.at.x},${fine.at.z}`);
  assert.ok(whole.max<=REGIONAL_MAX_ROAD_GRADE,`seed ${seed}: ${whole.max} at ${whole.at.x},${whole.at.z}`);
 }
});

test('town connector joins the west trail on its graded centreline and stays walkable',()=>{
 for(const seed of REGRESSION_SEEDS){
  const plan=regionalPlan(seed),gate=plan.gateways[0]!.position,trail=plan.roads.find(r=>r.from===plan.gateways[0]!.id)!;
  const connector=regionalTownRoads(seed).find(r=>r.id.endsWith('/road/valley-access'))!,join=connector.points.at(-2)!;
  assert.equal(join.x,-100);assert.equal(join.z,gate.z);
  const a=trail.points[0]!,b=trail.points[1]!,t=(join.x-a.x)/(b.x-a.x);
  assert.equal(a.z,b.z);assert.ok(Math.abs(join.y-(a.y+(b.y-a.y)*t))<1e-4,`seed ${seed}: connector join ${join.y}`);
  assert.ok(sampledGrade(seed,connector.points,.5).max<REGIONAL_MAX_ROAD_GRADE,`seed ${seed}: connector grade`);
 }
});

test('developer trail-grade audit covers every trail and town street on the committed surface',()=>{
 const seed=REGRESSION_SEEDS[0]!,audit=regionalTrailGradeAudit(seed),plan=regionalPlan(seed),town=regionalTownRoads(seed);
 assert.equal(audit.trails.length,plan.roads.length+town.length);assert.equal(audit.limit,REGIONAL_MAX_ROAD_GRADE);assert.deepEqual(audit.violations,[]);
 assert.ok(audit.trails.some(t=>t.kind==='town'&&t.id.endsWith('/road/valley-access')));
 assert.ok(audit.trails.every(t=>Number.isFinite(t.maxGrade)&&t.maxGrade<=audit.steepest.maxGrade&&t.horizontalMetres>0));
 const west=audit.trails.find(t=>t.id===plan.roads.find(r=>r.from===plan.gateways[0]!.id)!.id)!;assert.ok(west.maxGrade<=REGIONAL_MAX_ROAD_GRADE);
 assert.equal(regionalTrailGradeAudit(seed),audit,'2 m audits are cached per seed');assert.ok(Object.isFrozen(audit)&&Object.isFrozen(audit.trails));
 assert.throws(()=>regionalTrailGradeAudit(seed,0),RangeError);assert.throws(()=>regionalTrailGradeAudit(seed,Number.NaN),RangeError);assert.throws(()=>regionalTrailGradeAudit(-1),RangeError);
});

test('collision mesh matches the sampled surface across the repaired junction',()=>{
 const seed=REGRESSION_SEEDS[0]!,gate=regionalPlan(seed).gateways[0]!.position,at=regionalChunkAt(-104,gate.z),chunk=generateRegionalChunk(seed,at.cx,at.cz),v=chunk.terrain.vertices;
 for(let i=0;i<v.length;i+=3)assert.equal(v[i+1],regionalHeight(seed,v[i]!,v[i+2]!));
});
