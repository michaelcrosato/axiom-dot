import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import {RestorationPractice,RESTORATION_PRACTICE_SPAWN} from '../src/restoration-practice.ts';
import {restorationBodyObstacle} from '../src/restoration-collision.ts';
import {compileRestorationBody,RESTORATION_PARTS,type RestorationBodyRecipe} from '../src/restoration-body.ts';
import {createRestorationBodyView,createRestorationView} from '../src/restoration-view.ts';
import {restorationBalances,restorationMachinePosition,restorationPlayerCost,validRestoration,type RestorationCommand} from '../src/restoration.ts';
import {createRegionalState,enableRestoration,serializeSave} from '../src/world.ts';
import {townLifePhysics,terrainCell} from './helpers/town-life-physics.ts';
const seed=73129,zero={waterMl:0,contaminant:0,energy:0,smoke:0,scent:0,organic:0,filter:0};
function command(p:RestorationPractice,player:{x:number;z:number},c:Record<string,unknown>){return p.command({...c,expectedRevision:p.state.revision} as RestorationCommand,player);}
function prepared(organ:'pump'|'filter'|'vent'|'beacon'='filter'){
 const p=new RestorationPractice(seed,'independent-integration'),site=p.plan.sites[0]!,player={x:site.x,z:site.z-2.5};
 const result=command(p,player,{kind:'refit',targetId:site.id,recipe:{version:1,seed,support:'nimble',shell:'reed',organ},ability:{version:1,organ,strength:1,tempo:'steady'}});assert.equal(result.state.machine?.status,'packed',result.message);
 command(p,player,{kind:'service',targetId:site.id});assert.equal(p.state.machine!.charge,100);
 return {p,site,player};
}
function snapshotInput(s:{step:number;x:number;z:number;feetY:number;grounded:boolean}){return {step:s.step,x:s.x,z:s.z,feetY:s.feetY,grounded:s.grounded};}
function bounds(view:ReturnType<typeof createRestorationBodyView>){const root=view.root;root.updateMatrixWorld(true);let radius=0,minY=Infinity,maxY=-Infinity;root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const points=o.geometry.getAttribute('position');for(let i=0;i<points.count;i++){const p=new THREE.Vector3().fromBufferAttribute(points,i).applyMatrix4(o.matrixWorld);p.sub(root.position);radius=Math.max(radius,Math.hypot(p.x,p.z));minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}});return {radius,minY,maxY};}

test('actual Rapier worker stops the explorer outside the neutral convex body, retreats, and reapproaches',async t=>{
 const {p,site,player}=prepared();command(p,player,{kind:'deploy',targetId:site.id});const obstacle=restorationBodyObstacle(p.state,p.plan)!;assert.equal(obstacle.convexVertices!.length,96);assert.equal(obstacle.convexPlanes!.length,18);
 const physics=await townLifePhysics(t,{...RESTORATION_PRACTICE_SPAWN,streamedTerrain:false,initialCells:[],bound:48,sandbox:true,obstacles:[obstacle]});
 physics.input({z:1});const first=await physics.tick(120);first.forEach(s=>p.step(snapshotInput(s)));const stopped=physics.latest;
 const body=compileRestorationBody(p.state.machine!.recipe);assert(Math.abs(stopped.x-site.x)<.04);assert(stopped.z<site.z-body.bounds.radius-.25,JSON.stringify({stopped,radius:body.bounds.radius}));assert(stopped.z>site.z-body.bounds.radius-.5);assert(first.every(s=>s.z<site.z-body.bounds.radius-.25));assert(stopped.grounded);
 physics.input({z:-1});const retreat=await physics.tick(30);retreat.forEach(s=>p.step(snapshotInput(s)));assert(physics.latest.z<stopped.z-1);
 physics.input({z:1});const second=await physics.tick(120);second.forEach(s=>p.step(snapshotInput(s)));assert(Math.abs(physics.latest.z-stopped.z)<.03);assert(second.every(s=>s.z<site.z-body.bounds.radius-.25));assert.equal(p.steps,270);assert.equal(p.lastStep,physics.latest.step);assert.equal(p.droppedSteps,0);assert.deepEqual(restorationBalances(p.state,p.plan),zero);
});

test('deploy occupancy rejects the actual worker explorer before installing the real route collision cell',async t=>{
 const {p,site,player}=prepared(),physics=await townLifePhysics(t,{x:site.x,z:site.z,streamedTerrain:false,initialCells:[],bound:48,sandbox:true,obstacles:[]});const before=p.state;
 const rejected=command(p,physics.latest,{kind:'deploy',targetId:site.id});assert.equal(rejected.state,before);assert.match(rejected.message,/footprint/);
 physics.input({z:-1});await physics.tick(32);physics.input();await physics.tick(20);assert(Math.hypot(physics.latest.x-site.x,physics.latest.z-site.z)>1.5);
 const deployed=command(p,physics.latest,{kind:'deploy',targetId:site.id});assert.equal(deployed.state.machine?.status,'idle',deployed.message);const obstacle=restorationBodyObstacle(p.state,p.plan)!;
 physics.send({type:'cell-load',key:'restoration-automaton',revision:1,obstacles:[obstacle]});assert.equal((await physics.take('cell-ack',m=>m.key==='restoration-automaton')).count,1);
 const view=createRestorationView(p.plan);t.after(()=>view.dispose());view.update(p.state,physics.latest,()=>true,true,1/60,null);assert.equal(view.stats.bodyVisible,false);view.update(p.state,physics.latest,()=>true,true,1/60,restorationMachinePosition(p.state,p.plan));assert.equal(view.stats.bodyVisible,true);
 const target=site.cells[1]!;const started=command(p,physics.latest,{kind:'start',sourceId:target.id,targetId:target.id});assert.equal(started.state.machine?.status,'working',started.message);let revision=1,prior=restorationMachinePosition(p.state,p.plan)!;const initial={...prior};let installed=0;
 for(let n=0;n<12;n++){
  const frames=await physics.tick(15);frames.forEach(s=>p.step(snapshotInput(s)));const point=restorationMachinePosition(p.state,p.plan)!;assert(Math.hypot(point.x-prior.x,point.z-prior.z)<=compileRestorationBody(p.state.machine!.recipe).stats.maxSpeed*.25+.002);assert(point.x>=site.x&&point.x<=target.x&&Math.abs(point.z-site.z)<.001);
  if(point.x!==prior.x||point.z!==prior.z){physics.send({type:'cell-load',key:'restoration-automaton',revision:++revision,obstacles:[restorationBodyObstacle(p.state,p.plan)!]});await physics.take('cell-ack',m=>m.key==='restoration-automaton'&&m.revision===revision);installed++;}
  view.update(p.state,physics.latest,()=>true,true,1/60,point);view.root.updateMatrixWorld(true);const rig=view.root.getObjectByName('neutral-restoration-automaton')!;assert(rig.visible);assert(rig.position.x>=initial.x&&rig.position.x<=point.x+.001);assert(rig.matrixWorld.elements.every(Number.isFinite));prior=point;
 }
 assert(installed>=3);assert.equal(prior.x,target.x);assert(p.state.machine!.waste>0);assert.equal(p.state.machine!.filter+p.state.machine!.waste,p.plan.sites[0]!.initialFilter);assert.deepEqual(restorationBalances(p.state,p.plan),zero);assert(validRestoration(JSON.parse(JSON.stringify(p.state)),p.plan));
});

test('practice consumes monotonic actual snapshots only; finite stock, resets, reports, and campaign bytes stay independent',async t=>{
 const campaign=enableRestoration(createRegionalState(seed)),bytes=serializeSave(campaign),{p,site,player}=prepared();const pristine=new RestorationPractice(seed,'independent-integration');command(p,player,{kind:'deploy',targetId:site.id});command(p,player,{kind:'start',sourceId:site.dockCellId,targetId:site.dockCellId});
 const physics=await townLifePhysics(t,{...RESTORATION_PRACTICE_SPAWN,streamedTerrain:false,initialCells:[],bound:48,sandbox:true,obstacles:[]});physics.input();const snapshots=await physics.tick(240);snapshots.forEach(s=>p.step(snapshotInput(s)));assert(p.state.machine!.waste>0);const state=p.state,steps=p.steps,last=p.lastStep;
 for(const s of [snapshots.at(-1)!,snapshots.at(-2)!,snapshots[0]!])p.step(snapshotInput(s));assert.equal(p.steps,steps,'duplicate and older worker snapshots must be inert');assert.equal(p.lastStep,last);assert.equal(p.state,state);
 for(let n=0;n<8;n++){const reset=new RestorationPractice(seed,'independent-integration');assert.deepEqual(reset.report(),pristine.report());}
 assert.equal(p.inventory.scrap+restorationPlayerCost(p.state).scrap,16);assert.equal(p.inventory.core+restorationPlayerCost(p.state).core,1);assert.equal(serializeSave(campaign),bytes);
 for(let n=0;n<140;n++)p.command({kind:'service',targetId:site.id,expectedRevision:0},player);assert.equal(p.actions.length,128);assert(p.actionsTruncated);assert.equal(p.state,state);const report=JSON.parse(JSON.stringify(p.report()));assert.equal(report.kind,'axiom-restoration-playable-evidence');assert.equal(report.mode,'isolated-real-explorer');assert.equal(report.seed,seed);assert.equal(report.source,'independent-integration');assert.deepEqual(report.balances,zero);assert.equal(report.seconds,steps/60);assert(!JSON.stringify(report).includes('sessionId'));assert(!Object.hasOwn(report,'campaign'));assert(!Object.hasOwn(report,'sessionId'));
});

test('all compiled body variants have matching actual Three mesh transforms, bounded walking matrices, and complete disposal',()=>{
 for(const bodySeed of [0,73129,0xffffffff])for(const support of RESTORATION_PARTS.support)for(const shell of RESTORATION_PARTS.shell)for(const organ of RESTORATION_PARTS.organ){
  const recipe:RestorationBodyRecipe={version:1,seed:bodySeed,support,shell,organ},compiled=compileRestorationBody(recipe),view=createRestorationBodyView(recipe),host=new THREE.Group();host.add(view.root);view.update({x:0,y:0,z:0},'same',0,true);
  const meshes:THREE.Mesh[]=[];view.root.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});assert.equal(meshes.length,compiled.plan.shapes.length);assert.equal(view.plan.ref.recipeHash,compiled.ref.recipeHash);
  for(const shape of compiled.plan.shapes){const mesh=view.root.getObjectByName(shape.id)! as THREE.Mesh;assert(mesh,shape.id);const position=new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);assert(position.distanceTo(new THREE.Vector3(shape.center.x,shape.center.y,shape.center.z))<1e-10);assert.deepEqual(mesh.scale.toArray(),[shape.half.x*2,shape.half.y*2,shape.half.z*2]);}
  for(let frame=0;frame<180;frame++){const angle=frame/75;view.update({x:Math.sin(angle)*2,y:0,z:Math.cos(angle)*2},'same',1/60,true);const b=bounds(view);assert(b.radius<=compiled.bounds.radius+1e-7,JSON.stringify({recipe,frame,b,compiled:compiled.bounds}));assert(b.minY>=compiled.bounds.minY-.015-1e-7,JSON.stringify({recipe,frame,b,compiled:compiled.bounds}));assert(b.maxY<=compiled.bounds.maxY+.015+1e-7);assert(meshes.every(m=>m.matrixWorld.elements.every(Number.isFinite)));}
  const geometries=new Set(meshes.map(m=>m.geometry)),materials=new Set(meshes.flatMap(m=>Array.isArray(m.material)?m.material:[m.material]));let geometryDisposals=0,materialDisposals=0;geometries.forEach(g=>g.addEventListener('dispose',()=>geometryDisposals++));materials.forEach(m=>m.addEventListener('dispose',()=>materialDisposals++));view.dispose();assert.equal(geometryDisposals,geometries.size);assert.equal(materialDisposals,materials.size);assert.equal(view.root.parent,null);
 }
});

test('field instance matrices/colors are direct state projection and every field resource is disposed',()=>{
 const {p,site,player}=prepared(),view=createRestorationView(p.plan),parent=new THREE.Group();parent.add(view.root);view.update(p.state,player,()=>false,true,0);assert.equal(view.stats.visibleSites,0);view.update(p.state,player,()=>true,true,0);assert.equal(view.stats.visibleSites,3);
 const group=view.root.getObjectByName(site.id)!,[dirt,water,plants,smoke,scent]=group.children as THREE.InstancedMesh[],cell=p.state.sites[0]!.cells[0]!,matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion(),color=new THREE.Color();water!.getMatrixAt(0,matrix);matrix.decompose(position,rotation,scale);assert(Math.abs(position.y-(site.y+.022+cell.waterMl/1_500_000))<1e-6);assert(Math.abs(scale.x-(.18+Math.min(1,cell.waterMl/2000)*.62))<1e-6);water!.getColorAt(0,color);assert.equal(color.getHexString(),new THREE.Color(cell.contaminant>4?'#9b9860':'#75bdbb').getHexString());plants!.getMatrixAt(0,matrix);matrix.decompose(position,rotation,scale);assert(Math.abs(scale.y-(.1+Math.min(1,cell.biomass/24)*.3))<1e-6);smoke!.getMatrixAt(0,matrix);matrix.decompose(position,rotation,scale);assert(Math.abs(scale.y-Math.min(.9,cell.smoke/50))<1e-6);scent!.getMatrixAt(0,matrix);assert(matrix.elements.every(Number.isFinite));
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),instances:THREE.InstancedMesh[]=[];view.root.traverse((o:any)=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(o.isInstancedMesh)instances.push(o);});let gs=0,ms=0,is=0;geometries.forEach(g=>g.addEventListener('dispose',()=>gs++));materials.forEach(m=>m.addEventListener('dispose',()=>ms++));instances.forEach(m=>m.addEventListener('dispose',()=>is++));view.dispose();assert.equal(gs,geometries.size);assert.equal(ms,materials.size);assert.equal(is,15);assert.equal(parent.children.length,0);
});

for(const streamedTerrain of [false,true])test(`actual worker rejects overlapping rig replacement, retains old body, and safely retries (${streamedTerrain?'streamed world':'flat practice'})`,async t=>{
 const {p,site,player}=prepared();command(p,player,{kind:'deploy',targetId:site.id});const original=restorationBodyObstacle(p.state,p.plan)!,physics=await townLifePhysics(t,{...RESTORATION_PRACTICE_SPAWN,streamedTerrain,...(!streamedTerrain?{bound:48,sandbox:true}:{}),initialCells:[...(streamedTerrain?[terrainCell(-1,0)]:[]),{key:'restoration-automaton',revision:1,obstacles:[original]}],obstacles:[]});
 const attempted={...original,x:physics.latest.x,z:physics.latest.z},revision=2;physics.send({type:'cell-load',key:'restoration-automaton',revision,obstacles:[attempted]});const rejected=await physics.take('cell-rejected',m=>m.key==='restoration-automaton');assert.equal(rejected.reason,'player-overlap');assert.equal(rejected.loaded,true);
 physics.input({z:1});await physics.tick(90);const oldStop=physics.latest;assert(oldStop.z>site.z-original.hz-.5);assert(oldStop.z<site.z-original.hz-.2,'original native collider remains after rejection');
 physics.input({z:-1});await physics.tick(65);physics.input();await physics.tick(20);assert(physics.latest.z<attempted.z-original.hz-.5);physics.send({type:'cell-load',key:'restoration-automaton',revision,obstacles:[attempted]});const ack=await physics.take('cell-ack',m=>m.key==='restoration-automaton'&&m.revision===revision);assert.equal(ack.count,1);
 physics.input({z:1});const retryFrames=await physics.tick(90),clearances=retryFrames.map(s=>Math.hypot(s.x-attempted.x,s.z-attempted.z));assert(Math.min(...clearances)>=compileRestorationBody(p.state.machine!.recipe).bounds.radius+.28,'all actual capsule samples remain outside acknowledged replacement body');assert(Math.min(...clearances)<original.hz+.45,'the explorer reaches and contacts the acknowledged replacement body');
});
