import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,createConnectedState,createRegionalState,applyAction,commitWildernessGather,parseSave,serializeSave,validateSave,wildernessGatherContext,enableRegionalSupply,type State} from '../src/world.ts';
import {regionalPlan,regionalFeaturesNear,regionalHeight,regionalFeatureById} from '../src/regional-world.ts';
import {canGatherWilderness} from '../src/wilderness-state.ts';
import {gatherRegionalSupplyMaterials,runRegionalSupplyLab} from '../src/regional-supply-lab.ts';
import {regionalSupplyPlan,regionalSupplyAvailable,regionalSupplyProjectBoxes,regionalSupplyConstructionBoxes,regionalSupplyObstacles,createRegionalSupply,advanceRegionalSupply} from '../src/regional-supply.ts';
import {wildernessCapsuleClearance} from '../src/wilderness-lab.ts';
import {regionalObstaclesNear} from '../src/regional-world.ts';
import {obstacleSegmentIntersects} from '../src/wilderness-geometry.ts';

const seed=73129;
const immutable=<T>(value:T):T=>JSON.parse(JSON.stringify(value));

test('regional supply fixtures earn every material from reachable canonical wilderness sources and reject repeats',()=>{
 const initial=createRegionalState(seed),before=immutable(initial),site=regionalPlan(seed).sites.find(p=>p.kind==='outpost')!;
 const gathered=gatherRegionalSupplyMaterials(initial,site.position,{wood:4,stone:3});
 assert.equal(gathered.receipts.length,7);assert.equal(new Set(gathered.receipts.map(r=>r.id)).size,7);
 assert.deepEqual(gathered.state.wilderness?.harvested,gathered.receipts.map(r=>r.id));
 assert.equal(gathered.state.wilderness?.wood,4);assert.equal(gathered.state.wilderness?.stone,3);
 assert(gathered.receipts.every(r=>r.duplicateRejected&&r.minimumBodyClearance>=-.005));
 assert(gathered.receipts.every(r=>regionalFeatureById(seed,r.id)?.kind===r.kind));
 assert.deepEqual(initial,before);assert(validateSave(gathered.state));
 for(const receipt of gathered.receipts){
  const moved=applyAction(gathered.state,{type:'move',x:receipt.x,z:receipt.z});
  assert.equal(commitWildernessGather(moved,receipt.id,{feetY:receipt.feetY,grounded:true}),moved);
 }
 assert.deepEqual(gathered.state.inventory,initial.inventory);
 assert.deepEqual(gathered.state.collected,initial.collected);
});

test('regional source exhaustion survives cache eviction and reload without duplicating delivered-material inputs',()=>{
 const initial=createRegionalState(seed),site=regionalPlan(seed).sites.find(p=>p.kind==='outpost')!,gathered=gatherRegionalSupplyMaterials(initial,site.position,{wood:2,stone:2}),raw=serializeSave(gathered.state);
 for(let i=0;i<110;i++)regionalFeaturesNear(seed,-1450+(i%30)*96,-1350+Math.floor(i/30)*700,0);
 let restored=parseSave(raw)!;assert(restored);
 for(const receipt of gathered.receipts){
  restored=applyAction(restored,{type:'move',x:receipt.x,z:receipt.z});
  assert.equal(canGatherWilderness(wildernessGatherContext(restored,{feetY:receipt.feetY,grounded:true}),receipt.id),false);
  assert.equal(commitWildernessGather(restored,receipt.id,{feetY:receipt.feetY,grounded:true}),restored);
 }
 assert.deepEqual(restored.wilderness,gathered.state.wilderness);assert(validateSave(restored));
});

test('adding regional-supply support does not migrate old generations or rewrite unopted regional positions, resources, IDs or terrain',()=>{
 const old=[createState(seed),createConnectedState(seed),applyAction(createRegionalState(seed),{type:'move',x:1011,z:-997})];
 for(const state of old){
  const raw=serializeSave(state),restored=parseSave(raw)!;assert(restored);assert.equal(Object.hasOwn(restored,'frontierSupply'),false);
  assert.deepEqual(restored,state);assert.equal(serializeSave(restored),raw);
 }
 const regional=old[2]!,site=regionalPlan(seed).sites.find(p=>p.kind==='outpost')!,paid=gatherRegionalSupplyMaterials(regional,site.position,{wood:2,stone:1}).state;
 const saved=parseSave(serializeSave(paid))!;assert(saved);assert.deepEqual(saved.wilderness,paid.wilderness);assert.deepEqual(saved.player,paid.player);assert.equal(Object.hasOwn(saved,'frontierSupply'),false);
 const plan=regionalPlan(seed),ids=plan.sites.map(p=>p.id),roads=immutable(plan.roads),samples=plan.sites.map(p=>regionalHeight(seed,p.position.x,p.position.z));
 for(const identity of [0,1,3,444,899,0xffffffff])regionalPlan(identity);
 assert.deepEqual(regionalPlan(seed).sites.map(p=>p.id),ids);assert.deepEqual(regionalPlan(seed).roads,roads);assert.deepEqual(regionalPlan(seed).sites.map(p=>regionalHeight(seed,p.position.x,p.position.z)),samples);
});

test('complete disposable developer scenarios repeat deterministic real gathering, construction, hydration and reload',{timeout:30_000},()=>{
 const report=runRegionalSupplyLab(seed,3,{sourceRevision:'integration-test'});assert.equal(report.status,'complete',report.error);assert.equal(report.runs.length,3);assert.equal(report.sourceRevision,'integration-test');
 for(const run of report.runs)assert.deepEqual(run.checks.filter(c=>!c.pass),[],JSON.stringify(run));
 const deterministic=report.runs.map(run=>Object.fromEntries(Object.entries(run.metrics).filter(([key])=>key!=='elapsedMilliseconds')));
 assert.deepEqual(deterministic,[deterministic[0],deterministic[0],deterministic[0]]);
 console.log(JSON.stringify({regionalSupplyScenario:1,scope:report.scope,runs:report.runs}));
});

test('optional enable is idempotent, forbidden on old foundations, and no-op commands cannot mutate absent supply',()=>{
 for(const initial of [createState(seed),createConnectedState(seed)]){assert.equal(enableRegionalSupply(initial),initial);assert.equal(applyAction(initial,{type:'regional-supply',command:{type:'deliver',outpostId:'missing',expectedRevision:0}}),initial);}
 const initial=createRegionalState(seed),enabled=enableRegionalSupply(initial);assert.notEqual(enabled,initial);assert.equal(enableRegionalSupply(enabled),enabled);
 const untouched=immutable(initial);assert.deepEqual(initial,untouched);assert(validateSave(enabled));assert.deepEqual(parseSave(serializeSave(enabled)),enabled);
 const project=regionalSupplyPlan(seed).outposts[0]!,action={type:'regional-supply' as const,command:{type:'build' as const,outpostId:project.id,expectedRevision:0}};
 assert.equal(applyAction(initial,action),initial);assert.equal(applyAction(enabled,action),enabled);
});

test('all six biome-scaled projects spend actual gathered stock once and residents obtain water without original resource rewards',{timeout:30_000},()=>{
 let state=enableRegionalSupply(createRegionalState(seed));const plan=regionalSupplyPlan(seed),before=immutable(state),costs=new Set(plan.outposts.map(p=>`${p.cost.wood}/${p.cost.stone}`));assert(costs.size>=2,'biomes affect material requirements');
 for(const project of plan.outposts){
  state=gatherRegionalSupplyMaterials(state,project.deliveryPosition,project.cost).state;
  state=applyAction(state,{type:'move',x:project.deliveryPosition.x,z:project.deliveryPosition.z});
  const command=(type:'deliver'|'build')=>({type:'regional-supply' as const,command:{type,outpostId:project.id,expectedRevision:state.frontierSupply!.revision}});
  const before=state;state=applyAction(state,command('deliver'));assert.notEqual(state,before);assert.deepEqual(regionalSupplyAvailable(state.frontierSupply!,state.wilderness),{wood:0,stone:0});
  state=applyAction(state,command('build'));assert.equal(state.frontierSupply!.outposts.find(o=>o.id===project.id)!.builtAt,null);
 }
 const lifetime={wood:state.wilderness!.wood,stone:state.wilderness!.stone},total=plan.outposts.reduce((sum,o)=>({wood:sum.wood+o.cost.wood,stone:sum.stone+o.cost.stone}),{wood:0,stone:0});assert.deepEqual(lifetime,total);
 for(let i=0;i<2400&&!state.frontierSupply!.outposts.every(o=>o.builtAt!==null&&o.residents.every(r=>r.drunk>0));i++)state=applyAction(state,{type:'tick',dt:.25});
 assert(state.frontierSupply!.outposts.every(o=>o.builtAt!==null&&o.workTicks===48&&o.consumed>0&&o.residents.every(r=>r.drunk>0)));
 assert.deepEqual({wood:state.wilderness!.wood,stone:state.wilderness!.stone},lifetime);assert.deepEqual(state.inventory,before.inventory);assert.equal(state.waterRestored,false);assert.equal(state.jobAccepted,false);assert.deepEqual(state.collected,before.collected);
 assert(validateSave(state));assert.deepEqual(parseSave(serializeSave(state)),state);assert(JSON.stringify(state.frontierSupply).length<20_000);
 console.log(JSON.stringify({regionalSupplyAllOutposts:1,projectCount:plan.outposts.length,costs:[...costs],harvested:lifetime,simulationSeconds:state.frontierSupply!.ticks*.25,supplyBytes:JSON.stringify(state.frontierSupply).length,waterDrunk:state.frontierSupply!.outposts.map(o=>({id:o.id,drunk:o.residents.reduce((n,r)=>n+r.drunk,0)}))}));
});

test('model geometry leaves every resident path and original road corridor clear for a standing body',()=>{
 let minimum=Infinity,samples=0;const plan=regionalSupplyPlan(seed);
 for(const project of plan.outposts){
  const solids=[...regionalObstaclesNear(seed,project.position.x,project.position.z),...regionalSupplyConstructionBoxes(seed,project.id).filter(b=>b.solid).map(b=>({x:b.center.x,y:b.center.y,z:b.center.z,hx:b.half.x,hy:b.half.y,hz:b.half.z}))].filter(o=>Math.abs(o.x-project.position.x)<=8+o.hx&&Math.abs(o.z-project.position.z)<=8+o.hz);
  for(const resident of project.residents){
   const points=[resident.homePosition,...resident.path,resident.workPosition];
   for(let i=1;i<points.length;i++){
    const from=points[i-1]!,to=points[i]!,steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.2));
    for(let step=0;step<=steps;step++){
     const t=step/steps,x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t,feetY=from.y+(to.y-from.y)*t;
     const clearance=Math.min(...solids.map(o=>wildernessCapsuleClearance({x,z,feetY,grounded:true,crouched:false,step},o)));minimum=Math.min(minimum,clearance);samples++;
     assert(clearance>=-.01,JSON.stringify({outpost:project.id,resident:resident.id,x,z,feetY,clearance}));
    }
   }
  }
  for(const shape of regionalSupplyConstructionBoxes(seed,project.id).filter(b=>b.solid))for(const road of regionalPlan(seed).roads)for(let i=1;i<road.points.length;i++){
   const obstacle={x:shape.center.x,y:shape.center.y,z:shape.center.z,hx:shape.half.x,hy:shape.half.y,hz:shape.half.z},from={...road.points[i-1]!,y:shape.center.y},to={...road.points[i]!,y:shape.center.y};
   assert(!obstacleSegmentIntersects(obstacle,from,to,road.width/2+.34),`${shape.id} blocks ${road.id}`);
  }
 }
 console.log(JSON.stringify({regionalSupplyGeometry:1,scope:'Production model geometry, capsule-distance and road-corridor checks; not an executed physics traversal',samples,minimumClearance:minimum}));
});

test('save authority rejects forged allocation, duplicate project identities and malformed optional ledgers without resetting them',()=>{
 const state=enableRegionalSupply(createRegionalState(seed)),good=state.frontierSupply!;
 assert.equal(validateSave({...state,frontierSupply:undefined}),false);
 const invalid:unknown[]=[null,{},[],{...good,version:3},{...good,seed:seed+1},{...good,outposts:[...good.outposts,good.outposts[0]]},{...good,outposts:good.outposts.map((o,i)=>i?o:{...o,delivered:{wood:99,stone:99}})},{...good,outposts:good.outposts.map((o,i)=>i?o:{...o,water:1})},{...good,receipts:Array(500).fill({})}];
 for(const frontierSupply of invalid){assert.equal(validateSave({...state,frontierSupply}),false);assert.equal(parseSave(JSON.stringify({...state,frontierSupply})),null);}
});
