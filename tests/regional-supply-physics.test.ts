import test from 'node:test';
import assert from 'node:assert/strict';
import {regionalPhysics,terrainCell} from './helpers/regional-physics.ts';
import {createRegionalState,enableRegionalSupply,applyAction,serializeSave,parseSave} from '../src/world.ts';
import {regionalSupplyPlan,regionalSupplyObstacles} from '../src/regional-supply.ts';
import {gatherRegionalSupplyMaterials} from '../src/regional-supply-lab.ts';
import {wildernessCapsuleClearance} from '../src/wilderness-lab.ts';

/** Ordinary production-worker integration, in an explicitly isolated flat fixture.
 * The authored project colliders are translated intact; no runtime diagnostic. */
test('real controller collides with supply scaffolding, accepts complete collider replacement and recreates saved geometry',{timeout:30_000},async t=>{
 const seed=73129,project=regionalSupplyPlan(seed).outposts[0]!;let state=enableRegionalSupply(createRegionalState(seed));
 state=gatherRegionalSupplyMaterials(state,project.deliveryPosition,project.cost).state;
 state=applyAction(state,{type:'move',x:project.deliveryPosition.x,z:project.deliveryPosition.z});
 for(const type of ['deliver','build'] as const)state=applyAction(state,{type:'regional-supply',command:{type,outpostId:project.id,expectedRevision:state.frontierSupply!.revision}});
 const translated=(source:typeof state)=>regionalSupplyObstacles(seed,source.frontierSupply!).map(o=>({...o,x:o.x-project.position.x,z:o.z-project.position.z,y:(o.y??o.hy)-project.position.y}));
 const scaffold=translated(state),target=scaffold.filter(o=>(o.y??o.hy)+o.hy>1.3&&(o.y??o.hy)-o.hy<1).sort((a,b)=>a.hx*a.hz-b.hx*b.hz)[0];assert(target,'a scaffold upright must be a real obstacle');
 const cells=[terrainCell(-1,-1),terrainCell(0,-1),terrainCell(-1,0),terrainCell(0,0)],first={x:target.x-target.hx-3,z:target.z};
 const p=await regionalPhysics(t,{...first,initialCells:[...cells,{key:'supply-project',revision:1,obstacles:scaffold}]});p.input({x:1,analog:true});const samples=await p.tick(100);
 assert(p.latest.x<target.x-target.hx-.25,'standing capsule stops before the scaffold upright');assert(p.latest.x>first.x+.5,'controller actually approaches the new solid');assert(p.latest.grounded);
 const min=Math.min(...samples.flatMap(s=>scaffold.map(o=>wildernessCapsuleClearance(s,o))));assert(min>=-.04,`scaffold capsule clearance ${min}`);
 for(let i=0;i<1200&&state.frontierSupply!.outposts[0]!.builtAt===null;i++)state=applyAction(state,{type:'tick',dt:.25});assert.notEqual(state.frontierSupply!.outposts[0]!.builtAt,null);
 const completed=translated(state);assert.deepEqual(completed,scaffold,'completion preserves the authorized scaffold collision envelope');
 p.input();p.send({type:'teleport',x:24,z:24});await p.tick(4);p.send({type:'cell-load',key:'supply-project',revision:2,obstacles:completed});await p.take('cell-ack',m=>m.key==='supply-project'&&m.revision===2);
 const restored=parseSave(serializeSave(state))!;assert(restored);assert.deepEqual(translated(restored),completed);
 const tank=completed.filter(o=>(o.y??o.hy)+o.hy>1.3&&(o.y??o.hy)-o.hy<1).sort((a,b)=>b.hx*b.hz-a.hx*a.hz)[0]!;
 const beforeTank={x:tank.x-tank.hx-3,z:tank.z};await p.zone({...beforeTank,initialCells:[...cells,{key:'supply-project',revision:1,obstacles:translated(restored)}]});p.input({x:1,analog:true});const final=await p.tick(100);
 assert(p.latest.x<tank.x-tank.hx-.25);assert(p.latest.grounded);const finalMin=Math.min(...final.flatMap(s=>completed.map(o=>wildernessCapsuleClearance(s,o))));assert(finalMin>=-.04);
 console.log(JSON.stringify({regionalSupplyPhysics:1,scope:'Actual production Rapier controller in isolated flat-ground project fixtures; no browser visual, regional path traversal, or device benchmark',scaffoldColliders:scaffold.length,completedColliders:completed.length,scaffoldSamples:samples.length,completedSamples:final.length,minimumScaffoldClearance:min,minimumCompletedClearance:finalMin,savedGeometryExact:true}));
});
