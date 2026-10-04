import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {ECOLOGY_VISUAL_FIXTURES,ECOLOGY_REVIEW_MAX_STEPS,REVIEW_SEED,ecologyReviewStates,ecologyReviewEvidence,ecologyReviewTerrain,ecologyReviewCamera,type EcologyReviewSnapshot} from '../src/visual-fixtures.ts';
import {createEcologyState,applyEcologyCommand,advanceEcology,ecologyStage,ecologyWeather,ecologyWaterBalance,validEcology,ECOLOGY_RULES} from '../src/ecology.ts';
import {createEcologyView} from '../src/ecology-view.ts';
import {worldValley} from '../src/generation.ts';
import {valleySurfaceHeight} from '../src/valley.ts';
import {normalizeCapturePlan} from '../src/visual-capture.ts';

// Pure reducer, mesh-data and camera math only. These tests never initialize a renderer or inspect pixels.
function replay(review:ReturnType<typeof ecologyReviewStates>,snapshot:EcologyReviewSnapshot){
 let state=createEcologyState(review.seed),inventory={...review.initialContext.inventory};
 for(const input of snapshot.commands){
  while(state.tick<input.tick)state=advanceEcology(state,review.stepSeconds);
  const result=applyEcologyCommand(state,{...review.initialContext,inventory},input.command);assert.notEqual(result.state,state);state=result.state;inventory=result.inventory;
 }
 while(state.tick<snapshot.state.tick)state=advanceEcology(state,review.stepSeconds);
 assert.deepEqual(state,snapshot.state);assert.deepEqual(inventory,snapshot.inventory);
}
test('seven ecology probes are bounded, reproducible, independently replayable production states',()=>{
 const review=ecologyReviewStates();assert.deepEqual(review,ecologyReviewStates());assert.equal(ECOLOGY_VISUAL_FIXTURES.length,7);assert.equal(new Set(ECOLOGY_VISUAL_FIXTURES.map(f=>f.id)).size,7);
 assert.equal(normalizeCapturePlan({scenario:'production-ecology',ticks:ECOLOGY_VISUAL_FIXTURES.map((_,i)=>i)}).ticks.length,7);
 assert.deepEqual(review.initialContext.inventory,{scrap:0,core:0,water:1});assert.equal(review.stepSeconds,.25);assert.equal(review.maxSteps,ECOLOGY_REVIEW_MAX_STEPS);
 for(const fixture of ECOLOGY_VISUAL_FIXTURES){const snapshot=review.states[fixture.stage];assert.equal(validEcology(snapshot.state,review.seed),true,fixture.id);assert.ok(snapshot.steps<=review.maxSteps);assert.equal(snapshot.steps,snapshot.state.tick);assert.equal(snapshot.state.remainder,0);assert.equal(ecologyWaterBalance(snapshot.state),0);assert.equal(ecologyStage(snapshot.state.plots[0]!.crop),['rain','harvested'].includes(fixture.stage)?'empty':fixture.stage);replay(review,snapshot);}
 // Alternate layouts still use accepted inputs and actual growth, rather than hand-authored maturity values.
 for(const seed of [0,3,0xffffffff]){const other=ecologyReviewStates(seed);assert.equal(validEcology(other.states.ripe.state,seed),true);assert.ok(other.states.rain.steps<=ECOLOGY_REVIEW_MAX_STEPS);}
});
test('finite seed, canister and harvest ledgers remain exact and rain contributes only real soil water',()=>{
 const review=ecologyReviewStates(),s=review.states;
 assert.equal(s.empty.state.seeds,12);assert.equal(s.seeded.state.seeds,11);assert.equal(s.seeded.state.canistersSpent,1);assert.equal(s.seeded.inventory.water,0);assert.equal(s.seeded.state.water.irrigation,4000);
 for(const snapshot of Object.values(s)){const state=snapshot.state;assert.equal(state.seeds+state.plots.filter(p=>p.crop!==null).length+state.harvested,12);assert.equal(2*state.harvested,state.biomass+2*state.crafted);assert.equal(state.bioGel,0);assert.equal(state.restoredHP,0);assert.ok(state.plots.slice(1).every(p=>p.crop===null));assert.equal(snapshot.inventory.water+state.canistersSpent,1);}
 assert.equal(s.ripe.state.biomass,0);assert.equal(s.harvested.state.biomass,2);assert.equal(s.harvested.state.harvested,1);assert.equal(s.harvested.steps,s.ripe.steps);assert.deepEqual(s.harvested.state.water,s.ripe.state.water);
 assert.equal(ecologyWeather(review.seed,s.rain.state.tick*review.stepSeconds).kind,'rain');assert.ok(s.rain.state.water.rain>s.harvested.state.water.rain);assert.ok(s.rain.state.plots.reduce((n,p)=>n+p.soilWater,0)>s.harvested.state.plots.reduce((n,p)=>n+p.soilWater,0));assert.deepEqual(s.rain.inventory,s.harvested.inventory);
 assert.deepEqual(s.rain.commands.map(c=>c.command.type),['plant','water','harvest']);assert.deepEqual(s.ripe.state.records.filter(r=>['sprouted','budding','ripe'].includes(r.kind)).map(r=>r.kind),['sprouted','budding','ripe']);
});
test('export evidence has detached full state, input commands, weather and integer-mL water ledger',()=>{
 const review=ecologyReviewStates(),before=structuredClone(review),fixture=ECOLOGY_VISUAL_FIXTURES.find(f=>f.stage==='rain')!,evidence=ecologyReviewEvidence(review,fixture);
 assert.equal(evidence.waterLedger.unit,'mL');assert.equal(evidence.waterLedger.balance,0);assert.equal(evidence.waterLedger.initial+evidence.waterLedger.rain+evidence.waterLedger.irrigation,evidence.waterLedger.currentSoil+evidence.waterLedger.evaporated+evidence.waterLedger.uptake+evidence.waterLedger.runoff);assert.equal(evidence.projection.weather.kind,'rain');assert.equal(evidence.plotId,review.plotId);assert.deepEqual(evidence.state,review.states.rain.state);
 evidence.state.seeds=0;evidence.inventory.water=20;evidence.initialContext.inventory.water=20;evidence.commands[0]!.command.expectedRevision=999;evidence.projection.plots[0]!.soilWater=0;assert.deepEqual(review,before);
});
function instanceTransform(mesh:THREE.InstancedMesh,index:number){const matrix=new THREE.Matrix4();mesh.getMatrixAt(index,matrix);const e=matrix.elements;assert.ok(e.every(Number.isFinite));return {position:new THREE.Vector3(e[12],e[13],e[14]),scale:new THREE.Vector3(Math.hypot(e[0]!,e[1]!,e[2]!),Math.hypot(e[4]!,e[5]!,e[6]!),Math.hypot(e[8]!,e[9]!,e[10]!))};}
test('actual ecology renderer shows reducer-derived growth, fruit removal, moisture color and rain across repeated probes',()=>{
 const review=ecologyReviewStates(),before=structuredClone(review),model=createEcologyView(review.seed),instances=model.root.children.filter((o):o is THREE.InstancedMesh=>o instanceof THREE.InstancedMesh),plants=instances.filter(o=>o.count===15),rain=instances.find(o=>o.count===24)!;
 assert.equal(instances.length,5);assert.equal(model.root.children.length,8);assert.equal(plants.length,3);
 try{
  for(const fixture of [...ECOLOGY_VISUAL_FIXTURES,...[...ECOLOGY_VISUAL_FIXTURES].reverse()]){
   const state=review.states[fixture.stage].state;model.sync(state);assert.equal(model.root.visible,true);assert.equal(rain.visible,ecologyWeather(review.seed,state.tick*review.stepSeconds).kind==='rain');
   const stage=ecologyStage(state.plots[0]!.crop),height=stage==='empty'?0:stage==='seeded'?.08:.16+state.plots[0]!.crop!.growth/ECOLOGY_RULES.growthRequired*.8;
   for(let i=0;i<5;i++){const stem=instanceTransform(plants[0]!,i),bloom=instanceTransform(plants[2]!,i);assert.ok(Math.abs(stem.scale.y-height)<1e-6,fixture.id);assert.ok(Math.abs(bloom.scale.x-(stage==='ripe'?1:stage==='budding'?.45:0))<1e-6,fixture.id);}
   for(const mesh of plants)for(let i=5;i<15;i++)assert.equal(instanceTransform(mesh,i).scale.length(),0,'no fake crops in other beds');
   const color=new THREE.Color('#806445').lerp(new THREE.Color('#3a5144'),state.plots[0]!.soilWater/8000);assert.ok((model.plots[0]!.material as THREE.MeshStandardMaterial).color.equals(color));
   model.root.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.computeBoundingBox();});model.root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model.root,true);assert.ok([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite));
  }
  assert.deepEqual(review,before,'render sync cannot simulate, consume inputs or edit fixture state');model.sync(undefined);assert.equal(model.root.visible,false);
 }finally{model.dispose();assert.equal(model.root.children.length,0);}
});
test('inspection terrain uses real valley heights and aligns with every selected production bed vertex',()=>{
 const support=ecologyReviewTerrain(),model=createEcologyView(REVIEW_SEED),valley=worldValley(REVIEW_SEED);
 try{
  assert.equal(support.positions.length,(support.subdivisions+1)**2*3);assert.equal(support.indices.length,support.subdivisions**2*6);assert.equal(support.plotId,model.plan.plots[0]!.id);assert.ok(support.indices.every(i=>Number.isInteger(i)&&i>=0&&i<support.positions.length/3));
  const point=new Map<string,number>();for(let i=0;i<support.positions.length;i+=3){const [x,y,z]=support.positions.slice(i,i+3) as [number,number,number];assert.equal(y,valleySurfaceHeight(valley,x,z));point.set(x.toFixed(4)+','+z.toFixed(4),y);}
  const positions=model.plots[0]!.geometry.getAttribute('position');for(let i=0;i<positions.count;i++){const y=point.get(positions.getX(i).toFixed(4)+','+positions.getZ(i).toFixed(4));assert.notEqual(y,undefined);assert.ok(Math.abs(positions.getY(i)-y!-.022)<1e-5,'soil rests 22 mm above matching terrain vertices');}
  const [a,b,c]=support.indices.slice(0,3).map(i=>new THREE.Vector3().fromArray(support.positions,i*3));assert.ok(new THREE.Vector3().subVectors(b!,a!).cross(new THREE.Vector3().subVectors(c!,a!)).y>0,'support triangles face upward');
 }finally{model.dispose();}
});
test('all four fixed cameras numerically contain the selected bed, mature crop and rain envelope',()=>{
 const model=createEcologyView(REVIEW_SEED),p=model.plan.plots[0]!,valley=worldValley(REVIEW_SEED);
 try{for(const angle of ['front','side','back','three-quarter']){
  const frame=ecologyReviewCamera(REVIEW_SEED,angle),camera=new THREE.PerspectiveCamera(38,16/10,frame.near,frame.far);assert.deepEqual(frame,ecologyReviewCamera(REVIEW_SEED,angle));camera.position.set(...frame.position);camera.lookAt(new THREE.Vector3(...frame.target));camera.updateMatrixWorld(true);
  for(const dx of [-ECOLOGY_RULES.plotHalf-.04,ECOLOGY_RULES.plotHalf+.04])for(const dz of [-ECOLOGY_RULES.plotHalf-.04,ECOLOGY_RULES.plotHalf+.04])for(const y of [valleySurfaceHeight(valley,p.position.x+dx,p.position.z+dz),p.position.y+1.67]){const projected=new THREE.Vector3(p.position.x+dx,y,p.position.z+dz).project(camera);assert.ok(Math.abs(projected.x)<.9&&Math.abs(projected.y)<.9&&projected.z>-1&&projected.z<1,angle+' numeric framing');}
  const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));for(const other of model.plots.slice(1))assert.equal(frustum.intersectsBox(new THREE.Box3().setFromObject(other)),false,'other beds are outside the fixed close-up');
 }}finally{model.dispose();}
});
