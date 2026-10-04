import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {mkdtempSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'vite';
import {type PhysicsSnapshot} from './helpers/regional-physics.ts';
import {generateRegionalChunk,regionalHeight,regionalObstaclesNear,type RegionalBox} from '../src/regional-world.ts';
import {regionalTradePlan,regionalTradeConstructionBoxes,regionalTradeProjectBoxes,type RegionalTradeState} from '../src/regional-trade.ts';
import {regionalSupplyPlan,regionalSupplyConstructionBoxes} from '../src/regional-supply.ts';
import {regionalFoodPlan,regionalFoodSiteBoxes} from '../src/regional-food.ts';
import {createRegionalFoodLabCampaign} from '../src/regional-food-lab.ts';
import {parseSave,serializeSave} from '../src/world.ts';
import {wildernessCapsuleClearance} from '../src/wilderness-lab.ts';
import type {WildernessObstacle} from '../src/wilderness-geometry.ts';
import type {Vec3} from '../src/procedural.ts';
const asSolid=(b:RegionalBox):WildernessObstacle=>({featureId:b.id,x:b.center.x,y:b.center.y,z:b.center.z,hx:b.half.x,hy:b.half.y,hz:b.half.z});
const neighborhood=(x:number,z:number)=>{const cx=Math.floor(x/64),cz=Math.floor(z/64);return [-1,0,1].flatMap(dx=>[-1,0,1].map(dz=>({cx:cx+dx,cz:cz+dz})));};
const near=(o:WildernessObstacle,p:{x:number;z:number})=>Math.abs(o.x-p.x)<o.hx+1&&Math.abs(o.z-p.z)<o.hz+1;
function clearance(seed:number,p:Vec3,solids:WildernessObstacle[]){return Math.min(...solids.filter(o=>near(o,p)).map(o=>wildernessCapsuleClearance({x:p.x,z:p.z,feetY:regionalHeight(seed,p.x,p.z),grounded:true,crouched:false,step:0},o)));}
function segment(seed:number,a:Vec3,b:Vec3,step=.25){const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/step));return Array.from({length:n+1},(_,i)=>{const x=a.x+(b.x-a.x)*i/n,z=a.z+(b.z-a.z)*i/n;return {x,y:regionalHeight(seed,x,z),z};});}
function makeCell(seed:number,cx:number,cz:number,trade:RegionalTradeState,revision=1,collectorPhase:'scaffold'|'completed'='completed'){
 const chunk=generateRegionalChunk(seed,cx,cz),supply=regionalSupplyPlan(seed).outposts.filter(p=>p.ownerChunk===chunk.key).flatMap(p=>regionalSupplyConstructionBoxes(seed,p.id)),tradeBoxes=regionalTradeProjectBoxes(seed,trade).filter(b=>Math.floor(b.center.x/64)===cx&&Math.floor(b.center.z/64)===cz);
 return {key:`region:${cx}:${cz}`,revision,bounds:chunk.bounds,terrain:chunk.terrain,obstacles:[...chunk.features.flatMap(f=>f.solids),...chunk.structures.filter(b=>b.solid).map(asSolid),...supply.map(b=>asSolid({...b,material:collectorPhase==='scaffold'?'regional-supply-scaffold':b.material})),...tradeBoxes.filter(b=>b.solid).map(asSolid)]};
}
/** Build the actual browser client and import its emitted production physics-worker
 * asset for ordinary movement tests. No browser/network or standalone WASM diagnostic. */
async function compiledPhysics(t:TestContext,config:Record<string,unknown>){
 const folder=mkdtempSync(join(tmpdir(),'axiom-regional-food-physics-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
 await build({configFile:resolve('vite.client.config.ts'),logLevel:'silent',build:{outDir:folder,emptyOutDir:true}});
 const asset=readdirSync(join(folder,'assets')).find(n=>/^physics\.worker-.*\.js$/.test(n));assert(asset,'production client emits its physics worker');writeFileSync(join(folder,'package.json'),'{"type":"module"}');
 const file=join(folder,'assets',asset),sha256=createHash('sha256').update(readFileSync(file)).digest('hex'),worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);parentPort.on('message',m=>self.onmessage({data:m}));import(${JSON.stringify(pathToFileURL(file).href)}).then(()=>parentPort.postMessage({type:'boot'}));`,{eval:true});t.after(()=>worker.terminate());
 let epoch=0,error:Error|undefined,latest:PhysicsSnapshot|undefined;const messages:any[]=[],snapshots:PhysicsSnapshot[]=[];worker.on('error',e=>error=e);worker.on('message',m=>{if(m.type==='error')error=new Error(m.message);if(m.type==='snapshot'){latest=m;snapshots.push(m);}else messages.push(m);});
 async function take(type:string,match:(m:any)=>boolean=()=>true){const deadline=Date.now()+20000;for(;;){if(error)throw error;const i=messages.findIndex(m=>m.type===type&&match(m));if(i>=0)return messages.splice(i,1)[0];assert(Date.now()<deadline,`Compiled worker timed out on ${type}: ${JSON.stringify({latest,messages})}`);await new Promise(r=>setTimeout(r,1));}}
 const send=(m:Record<string,unknown>)=>worker.postMessage({epoch,...m});async function tick(n=1){const result:PhysicsSnapshot[]=[];for(let left=n;left>0;left-=120){snapshots.length=0;send({type:'step',ticks:Math.min(left,120)});await take('stepped');result.push(...snapshots);}return result;}
 const input=(values:Record<string,unknown>={})=>send({type:'input',x:0,z:0,...values});await take('boot');send({type:'init',manual:true,streamedTerrain:true,bound:Math.sqrt(10_000_000)/2,obstacles:[],...config});await take('ready');await tick(5);
 return {send,tick,input,take,sha256,get latest(){return latest!;},async zone(config:Record<string,unknown>){epoch++;send({type:'zone',manual:true,streamedTerrain:true,bound:Math.sqrt(10_000_000)/2,obstacles:[],...config});await take('ready');await tick(5);}};
}
type Controller=Pick<Awaited<ReturnType<typeof compiledPhysics>>,'send'|'tick'|'input'|'take'|'latest'>;
function stream(p:Controller,seed:number,trade:RegionalTradeState,initial:ReturnType<typeof makeCell>[]){const active=new Map(initial.map(c=>[c.key,c])),visited=new Set(active.keys());let revision=20,peak=active.size,peakColliders=0;return {async update(){const next=neighborhood(p.latest.x,p.latest.z),keys=new Set(next.map(c=>`region:${c.cx}:${c.cz}`));for(const key of active.keys())if(!keys.has(key)){p.send({type:'cell-unload',key,revision:++revision});await p.take('cell-ack',m=>m.key===key&&!m.loaded);active.delete(key);}for(const c of next){const key=`region:${c.cx}:${c.cz}`;if(!active.has(key)){const cell=makeCell(seed,c.cx,c.cz,trade,++revision);p.send({type:'cell-load',...cell});await p.take('cell-ack',m=>m.key===key&&m.revision===cell.revision&&m.loaded);active.set(key,cell);visited.add(key);}}peak=Math.max(peak,active.size);peakColliders=Math.max(peakColliders,p.latest.streaming?.cellColliders??0);},get stats(){return {visitedCells:visited.size,peakResidentCells:peak,peakCellColliders:peakColliders};}};}
async function walk(p:Controller,seed:number,points:Vec3[],streaming?:ReturnType<typeof stream>){let samples=0,grounded=0,metres=0,maxGroundError=0,blocked=0,previous=p.latest;const began=p.latest.step;
 for(const target of points){let attempts=0;while(Math.hypot(target.x-p.latest.x,target.z-p.latest.z)>.14){assert(attempts++<1000,`route stalled at ${JSON.stringify(p.latest)} toward ${JSON.stringify(target)}`);await streaming?.update();const dx=target.x-p.latest.x,dz=target.z-p.latest.z,d=Math.hypot(dx,dz),strength=d<.5?.22:.33037037037;p.input({x:dx/d*strength,z:dz/d*strength,analog:true});const batch=await p.tick(Math.max(1,Math.min(120,Math.floor(d/(d<.5?1.05:1.8)*60*.8))));for(const s of batch){samples++;grounded+=+s.grounded;metres+=Math.hypot(s.x-previous.x,s.z-previous.z);maxGroundError=Math.max(maxGroundError,Math.abs(s.feetY-regionalHeight(seed,s.x,s.z)));blocked+=+(s.streaming?.blocked??false);previous=s;}assert(samples<500000,'bounded route samples');}}
 p.input();return {samples,groundedFraction:grounded/Math.max(samples,1),metres,simulationSeconds:(p.latest.step-began)/60,maxGroundError,blocked,...(streaming?.stats??{})};
}


test('food seed sweep samples every short route and worker approach against actual terrain and all older solids',{timeout:180_000},()=>{
 const records=[],failures:unknown[]=[];let samples=0,minimum=Infinity,maxSupportError=0;
 for(const seed of [73129,0,1,42,12345,0xffffffff]){
  const plan=regionalFoodPlan(seed),trade=regionalTradePlan(seed),oldBoxes=[...regionalSupplyPlan(seed).outposts.flatMap(o=>regionalSupplyConstructionBoxes(seed,o.id)),...[...trade.sources,...trade.projects].flatMap(p=>regionalTradeConstructionBoxes(seed,p.id))],cache=new Map<string,WildernessObstacle[]>();let localMinimum=Infinity,routeSamples=0;
  const probe=(p:Vec3,label:string)=>{const key=`${Math.floor(p.x/64)}:${Math.floor(p.z/64)}`;let solids=cache.get(key);if(!solids){solids=[...regionalObstaclesNear(seed,p.x,p.z),...oldBoxes.filter(b=>b.solid).map(asSolid)];cache.set(key,solids);}const value=clearance(seed,p,solids);minimum=Math.min(minimum,value);localMinimum=Math.min(localMinimum,value);samples++;if(value<-.015&&failures.length<50)failures.push({seed,label,point:p,clearance:value});maxSupportError=Math.max(maxSupportError,Math.abs(p.y-regionalHeight(seed,p.x,p.z)));};
  for(const farm of plan.farms){
   assert(farm.surfaceMetres>0&&farm.surfaceMetres<40);assert.equal(farm.path[0]!.x,farm.interactionPosition.x);assert.equal(farm.path.at(-1)!.x,farm.storeInteractionPosition.x);
   for(const point of [...farm.path,farm.interactionPosition,farm.workerPosition,farm.storeInteractionPosition])probe(point,farm.id+'/authored-support');
   for(let i=1;i<farm.path.length;i++)for(const point of segment(seed,farm.path[i-1]!,farm.path[i]!)){probe(point,farm.id+'/delivery');routeSamples++;}
   for(const point of segment(seed,farm.interactionPosition,farm.workerPosition))probe(point,farm.id+'/garden-work');
   const store=trade.projects.find(p=>p.id===farm.storeId)!;for(const point of segment(seed,store.interactionPosition,store.workerPosition))probe(point,farm.id+'/store-work');
   const collector=regionalSupplyPlan(seed).outposts.find(p=>p.id===farm.siteId)!;probe(collector.deliveryPosition,farm.id+'/collector');for(const resident of collector.residents)for(let i=1;i<resident.path.length;i++)for(const point of segment(seed,resident.path[i-1]!,resident.path[i]!))probe(point,resident.id+'/water');
  }
  for(const box of regionalFoodSiteBoxes(seed,undefined)){assert.equal(box.solid,false,'new shallow soil cannot trap a mature save');for(const x of [box.center.x-box.half.x,box.center.x+box.half.x])for(const z of [box.center.z-box.half.z,box.center.z+box.half.z])assert(Math.abs(regionalHeight(seed,x,z)-(box.center.y-box.half.y))<.02,'plot rests on unchanged terrain');}
  records.push({seed,farms:plan.farms.map(f=>({id:f.id,surfaceMetres:f.surfaceMetres,pathCells:[...new Set(f.path.map(p=>`${Math.floor(p.x/64)}:${Math.floor(p.z/64)}`))]})),routeSamples,minimumClearance:Number.isFinite(localMinimum)?localMinimum:null,generatedNeighborhoods:cache.size});
 }
 assert.deepEqual(failures,[],JSON.stringify(failures));assert(maxSupportError<.02);
 console.log(JSON.stringify({regionalFoodGeometry:1,scope:'Quarter-metre samples on actual generated terrain and standing-capsule clearance against every nearby original feature/shelter, old V31 collector envelope and V32 source/store solid. New plots are nonsolid. No rendered or device QA.',samples,minimumClearance:minimum,maxSupportError,seeds:records}));
});

test('Vite-emitted production controller walks all three farm-to-store paths and approaches across chunks with both collector envelopes and saved unload/revisit',{timeout:300_000},async t=>{
 const seed=73129,plan=regionalFoodPlan(seed),old=createRegionalFoodLabCampaign(seed),trade=old.frontierTrade!,first=plan.farms[0]!.path[0]!,initial=neighborhood(first.x,first.z).map(c=>makeCell(seed,c.cx,c.cz,trade)),p=await compiledPhysics(t,{x:first.x,z:first.z,initialCells:initial}),records=[];
 for(const phase of ['scaffold','completed'] as const)for(const farm of plan.farms){
  const start=farm.path[0]!,cells=neighborhood(start.x,start.z).map(c=>makeCell(seed,c.cx,c.cz,trade,1,phase));await p.zone({x:start.x,z:start.z,initialCells:cells});const streaming=stream(p,seed,trade,cells),result=await walk(p,seed,farm.path.slice(1),streaming);assert(result.groundedFraction>.999,JSON.stringify(result));assert(result.maxGroundError<.06,JSON.stringify(result));assert.equal(result.blocked,0);assert(result.peakResidentCells!<=9);assert(result.peakCellColliders!<600);assert(result.visitedCells!>9,'actual default food path crosses a streaming boundary');
  const store=regionalTradePlan(seed).projects.find(s=>s.id===farm.storeId)!,storeApproach=await walk(p,seed,[store.workerPosition],streaming);assert(storeApproach.groundedFraction>.999);assert(storeApproach.maxGroundError<.06);
  const returnToGarden=await walk(p,seed,[store.interactionPosition,...farm.path.slice(0,-1).reverse(),farm.workerPosition],streaming);assert(returnToGarden.groundedFraction>.999);assert(returnToGarden.maxGroundError<.06);assert.equal(returnToGarden.blocked,0);
  const collector=regionalSupplyPlan(seed).outposts.find(o=>o.id===farm.siteId)!,collectorCells=neighborhood(collector.deliveryPosition.x,collector.deliveryPosition.z).map(c=>makeCell(seed,c.cx,c.cz,trade,1,phase));await p.zone({x:collector.deliveryPosition.x,z:collector.deliveryPosition.z,initialCells:collectorCells});const collectorApproach=await walk(p,seed,[{x:collector.position.x+1.25,y:collector.position.y,z:collector.position.z+2},collector.residents[0]!.workPosition]);assert(collectorApproach.groundedFraction>.999);assert(collectorApproach.maxGroundError<.06);
  records.push({phase,farmId:farm.id,plannedMetres:farm.surfaceMetres,route:result,storeApproach,gardenReturn:returnToGarden,collectorApproach});
 }
 // Atomic replace, real departure/unload, then reconstruct the same supported path
 // from an unchanged saved old campaign. Food adds no solid state to the cells.
 const saved=parseSave(serializeSave(old))!;assert(saved);const farm=plan.farms[0]!,at=farm.interactionPosition,local=neighborhood(at.x,at.z).map(c=>makeCell(seed,c.cx,c.cz,trade,2));await p.zone({x:at.x,z:at.z,initialCells:local});
 for(const cell of local){const [cx,cz]=cell.key.slice(7).split(':').map(Number),replacement=makeCell(seed,cx!,cz!,saved.frontierTrade!,3);p.send({type:'cell-load',...replacement});await p.take('cell-ack',m=>m.key===cell.key&&m.revision===3&&m.loaded);}
 const remote=neighborhood(1000,-1000).map(c=>makeCell(seed,c.cx,c.cz,trade,4));for(const cell of remote){p.send({type:'cell-load',...cell});await p.take('cell-ack',m=>m.key===cell.key&&m.loaded);}p.send({type:'teleport',x:1000,z:-1000});await p.tick(10);for(const cell of local){p.send({type:'cell-unload',key:cell.key,revision:5});await p.take('cell-ack',m=>m.key===cell.key&&!m.loaded);}await p.tick(5);assert.equal(p.latest.streaming!.terrainCells,9);
 for(const cell of local){const [cx,cz]=cell.key.slice(7).split(':').map(Number),restored=makeCell(seed,cx!,cz!,saved.frontierTrade!,6);p.send({type:'cell-load',...restored});await p.take('cell-ack',m=>m.key===cell.key&&m.loaded);}p.send({type:'teleport',x:at.x,z:at.z});await p.tick(5);for(const cell of remote){p.send({type:'cell-unload',key:cell.key,revision:5});await p.take('cell-ack',m=>m.key===cell.key&&!m.loaded);}const revisit=await walk(p,seed,farm.path.slice(1),stream(p,seed,saved.frontierTrade!,local));assert(revisit.groundedFraction>.999);assert.equal(revisit.blocked,0);assert.equal(p.latest.streaming!.terrainCells,9);
 console.log(JSON.stringify({regionalFoodCompiledPhysics:1,scope:'Actual client-build emitted Rapier production physics worker. All three real local paths walked both ways and garden/store/collector approaches, each with unchanged V31 scaffold/completed envelopes, all V32 sources/stores, streamed terrain crossings, atomic replacement, physical unload and saved revisit. No browser rendering or device benchmark.',workerSha256:p.sha256,seed,probes:records,revisit,sourceCampaignSaveExact:serializeSave(saved)===serializeSave(old)}));
});
