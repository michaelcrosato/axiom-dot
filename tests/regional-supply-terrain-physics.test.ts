import test from 'node:test';
import assert from 'node:assert/strict';
import {regionalPhysics} from './helpers/regional-physics.ts';
import {generateRegionalChunk,regionalHeight} from '../src/regional-world.ts';
import {createRegionalState,enableRegionalSupply,applyAction,serializeSave,parseSave,type State} from '../src/world.ts';
import {regionalSupplyPlan,regionalSupplyProjectBoxes,regionalSupplyObstacles} from '../src/regional-supply.ts';
import {gatherRegionalSupplyMaterials} from '../src/regional-supply-lab.ts';
import {wildernessFeatureRemaining} from '../src/wilderness.ts';
import {wildernessCapsuleClearance} from '../src/wilderness-lab.ts';

const neighborhood=(x:number,z:number)=>{const cx=Math.floor(x/64),cz=Math.floor(z/64);return [-1,0,1].flatMap(dx=>[-1,0,1].map(dz=>({cx:cx+dx,cz:cz+dz})));};
function cell(state:State,cx:number,cz:number,revision=1){
 const chunk=generateRegionalChunk(state.seed,cx,cz),outposts=regionalSupplyPlan(state.seed).outposts.filter(o=>o.ownerChunk===chunk.key);
 const projects=regionalSupplyProjectBoxes(state.seed,state.frontierSupply).filter(box=>outposts.some(o=>box.id.startsWith(o.id+'/')));
 return {key:'region:'+chunk.key,revision,bounds:chunk.bounds,terrain:chunk.terrain,obstacles:[...chunk.features.filter(f=>wildernessFeatureRemaining(f,state.wilderness)).flatMap(f=>f.solids),...chunk.structures.filter(s=>s.solid).map(s=>({x:s.center.x,y:s.center.y,z:s.center.z,hx:s.half.x,hy:s.half.y,hz:s.half.z})),...projects.filter(s=>s.solid).map(s=>({featureId:s.id,x:s.center.x,y:s.center.y,z:s.center.z,hx:s.half.x,hy:s.half.y,hz:s.half.z}))]};
}
test('actual regional terrain, shelter, scaffold and saved tank support real controller approaches across unload and reload',{timeout:30_000},async t=>{
 const seed=73129,plan=regionalSupplyPlan(seed).outposts[0]!;let state=enableRegionalSupply(createRegionalState(seed));
 state=gatherRegionalSupplyMaterials(state,plan.deliveryPosition,plan.cost).state;state=applyAction(state,{type:'move',x:plan.deliveryPosition.x,z:plan.deliveryPosition.z});
 for(const type of ['deliver','build'] as const)state=applyAction(state,{type:'regional-supply',command:{type,outpostId:plan.id,expectedRevision:state.frontierSupply!.revision}});
 const local=neighborhood(plan.deliveryPosition.x,plan.deliveryPosition.z).map(c=>cell(state,c.cx,c.cz)),p=await regionalPhysics(t,{x:plan.deliveryPosition.x,z:plan.deliveryPosition.z,initialCells:local});
 const ground=(x:number,z:number)=>regionalHeight(seed,x,z),samples=await p.tick(60);assert(samples.every(s=>s.grounded));assert(Math.abs(p.latest.feetY-plan.deliveryPosition.y)<.03);assert(Math.abs(p.latest.feetY-ground(p.latest.x,p.latest.z))<.03);
 // Walk the clear central aisle from board to resident work approach, then toward the tank.
 const waypoints=[{x:plan.position.x+1.25,z:plan.position.z+2},{x:plan.position.x+1.25,z:plan.position.z-1.6}];
 for(const point of waypoints){let steps=0;while(Math.hypot(point.x-p.latest.x,point.z-p.latest.z)>.13){assert(steps++<300,'shelter aisle walk made no progress');const dx=point.x-p.latest.x,dz=point.z-p.latest.z,d=Math.hypot(dx,dz);p.input({x:dx/d*.3,z:dz/d*.3,analog:true});samples.push(...await p.tick(2));}}
 p.input({x:1,analog:true});samples.push(...await p.tick(80));const stopped=p.latest,scaffold=regionalSupplyObstacles(seed,state.frontierSupply),tank=scaffold.find(o=>o.featureId?.endsWith('/storage'))!;
 assert(stopped.x<tank.x-tank.hx-.25&&stopped.x>plan.position.x+1.2,'the physical scaffold stops a real approach in its generated shelter');assert(samples.every(s=>s.grounded));
 const clearance=Math.min(...samples.flatMap(s=>scaffold.map(o=>wildernessCapsuleClearance(s,o)))),maxGroundError=Math.max(...samples.map(s=>Math.abs(s.feetY-ground(s.x,s.z))));assert(clearance>=-.04);assert(maxGroundError<.035);
 for(let i=0;i<1200&&state.frontierSupply!.outposts[0]!.builtAt===null;i++)state=applyAction(state,{type:'tick',dt:.25});assert.notEqual(state.frontierSupply!.outposts[0]!.builtAt,null);
 const restored=parseSave(serializeSave(state))!;assert(restored);assert.deepEqual(restored.frontierSupply,state.frontierSupply);
 p.input();const remote=neighborhood(1000,-1000).map(c=>cell(restored,c.cx,c.cz));for(const c of remote){p.send({type:'cell-load',...c});await p.take('cell-ack',m=>m.key===c.key&&m.loaded);}
 p.send({type:'teleport',x:1000,z:-1000});await p.tick(5);for(const c of local){p.send({type:'cell-unload',key:c.key,revision:2});await p.take('cell-ack',m=>m.key===c.key&&!m.loaded);}await p.tick(60);assert.equal(p.latest.streaming!.terrainCells,9);
 const reloaded=neighborhood(plan.deliveryPosition.x,plan.deliveryPosition.z).map(c=>cell(restored,c.cx,c.cz,3));for(const c of reloaded){p.send({type:'cell-load',...c});await p.take('cell-ack',m=>m.key===c.key&&m.revision===3&&m.loaded);}
 p.send({type:'teleport',x:plan.deliveryPosition.x,z:plan.deliveryPosition.z});await p.tick(5);for(const c of remote){p.send({type:'cell-unload',key:c.key,revision:2});await p.take('cell-ack',m=>m.key===c.key&&!m.loaded);}
 const supported=await p.tick(60);assert(supported.every(s=>s.grounded));assert(Math.abs(p.latest.feetY-plan.deliveryPosition.y)<.03);assert.equal(p.latest.streaming!.terrainCells,9);assert.equal(p.latest.streaming!.cellColliders,local.reduce((n,c)=>n+c.obstacles.length+1,0));
 p.send({type:'teleport',x:plan.position.x+1.25,z:plan.position.z-1.6});await p.tick(5);p.input({x:1,analog:true});const returned=await p.tick(80);assert(returned.every(s=>s.grounded));assert(p.latest.x<tank.x-tank.hx-.25);assert(Math.abs(p.latest.x-stopped.x)<.005,'persisted catchment has the exact accepted collision envelope on revisit');
 console.log(JSON.stringify({regionalSupplyTerrainPhysics:1,scope:'Actual generated regional 3×3 terrain chunks, original shelter/tree/rock solids, production Rapier controller and new project colliders; actual unload/reload and persisted completed tank. No browser visual or device benchmark.',seed,outpostId:plan.id,samples:samples.length+supported.length+returned.length,minimumProjectClearance:clearance,maxTerrainSupportError:maxGroundError,residentTerrainCells:p.latest.streaming!.terrainCells,cellColliders:p.latest.streaming!.cellColliders,savedStructureExact:true}));
});
