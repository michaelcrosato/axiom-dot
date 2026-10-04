import test from 'node:test';
import assert from 'node:assert/strict';
import {regionalPhysics,terrainCell,REGION_BOUND,type PhysicsSnapshot,type TestCell} from './helpers/regional-physics.ts';
import {generateRegionalChunk,regionalPlan,regionalHeight} from '../src/regional-world.ts';
type Physics=Awaited<ReturnType<typeof regionalPhysics>>;
type Cell=Pick<TestCell,'key'|'revision'|'bounds'|'terrain'> & {obstacles:any[]};
function neighborhood(x:number,z:number){const cx=Math.floor(x/64),cz=Math.floor(z/64),out:{cx:number;cz:number;key:string}[]=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const x=cx+dx,z=cz+dz;if(x*64>=REGION_BOUND||(x+1)*64<=-REGION_BOUND||z*64>=REGION_BOUND||(z+1)*64<=-REGION_BOUND)continue;out.push({cx:x,cz:z,key:`region:${x}:${z}`});}return out;}
function residency(p:Physics,initial:Cell[],make:(cx:number,cz:number,revision:number)=>Cell){
 const active=new Map(initial.map(c=>[c.key,c])),visited=new Set(active.keys());let revision=10,peakCells=active.size,peakColliders=0;
 return {async update(){const needed=neighborhood(p.latest.x,p.latest.z),keys=new Set(needed.map(c=>c.key));for(const [key] of active)if(!keys.has(key)){p.send({type:'cell-unload',key,revision:++revision});await p.take('cell-ack',m=>m.key===key&&!m.loaded);active.delete(key);}for(const c of needed)if(!active.has(c.key)){const cell=make(c.cx,c.cz,++revision);p.send({type:'cell-load',...cell});await p.take('cell-ack',m=>m.key===c.key&&m.loaded&&m.revision===cell.revision);active.set(c.key,cell);visited.add(c.key);}peakCells=Math.max(peakCells,active.size);peakColliders=Math.max(peakColliders,p.latest.streaming!.cellColliders);},get stats(){return {visited:visited.size,peakCells,peakColliders,resident:active.size};}};
}
async function travel(p:Physics,stream:ReturnType<typeof residency>,points:{x:number;z:number}[],height:(x:number,z:number)=>number){
 let metres=0,samples=0,grounded=0,maxGroundError=0,blocked=0,previous=p.latest;const startStep=p.latest.step;
 for(const point of points){let attempts=0;while(Math.hypot(point.x-p.latest.x,point.z-p.latest.z)>.16){
  assert.ok(attempts++<10000,`no progress toward ${JSON.stringify(point)} from ${JSON.stringify(p.latest)}`);await stream.update();
  const dx=point.x-p.latest.x,dz=point.z-p.latest.z,d=Math.hypot(dx,dz),strength=d<1.5?.36:1;p.input({x:dx/d*strength,z:dz/d*strength,analog:true});
  const batch=await p.tick(Math.max(1,Math.min(120,Math.floor(d/(strength===1?8:2)*60*.85))));
  for(const s of batch){metres+=Math.hypot(s.x-previous.x,s.z-previous.z);samples++;grounded+=Number(s.grounded);blocked+=Number(s.streaming!.blocked);maxGroundError=Math.max(maxGroundError,Math.abs(s.feetY-height(s.x,s.z)));previous=s;}
  assert.ok(samples<100_000,`journey stalled: ${JSON.stringify(p.latest)} target ${JSON.stringify(point)}`);
 }}
 return {metres,seconds:(p.latest.step-startStep)/60,samples,groundedFraction:grounded/samples,maxGroundError,blocked,...stream.stats};
}
test('real controller traverses the entire 3.162km-region flat span and returns with only radius-one colliders resident',{timeout:120_000},async t=>{
 const start={x:-REGION_BOUND+1,z:32},end={x:REGION_BOUND-1,z:32},make=(cx:number,cz:number,revision=1)=>terrainCell(cx,cz,()=>0,revision),initial=neighborhood(start.x,start.z).map(c=>make(c.cx,c.cz));
 const p=await regionalPhysics(t,{...start,initialCells:initial}),stream=residency(p,initial,make),out=await travel(p,stream,[end],()=>0),back=await travel(p,stream,[start],()=>0);
 assert.ok(out.metres>3159&&out.metres<3162);assert.ok(back.metres>3159&&back.metres<3163);assert.ok(out.groundedFraction>.9999&&back.groundedFraction>.9999);assert.ok(out.maxGroundError<.025&&back.maxGroundError<.025);assert.equal(out.blocked+back.blocked,0);assert.ok(back.visited>=150);assert.ok(back.peakCells<=9);assert.ok(p.latest.streaming!.totalColliders<=14);assert.ok(p.latest.streaming!.revisionKeys<=150);
 t.diagnostic(JSON.stringify({route:'full playable flat east/west span',worldWidthMetres:2*REGION_BOUND,marginMetres:1,out,back}));
});
test('real controller follows over a kilometre of generated regional trail with streamed terrain, trees, rocks and shelters',{timeout:120_000},async t=>{
 const seed=42,plan=regionalPlan(seed),a=plan.roads[1]!,b=plan.roads[2]!;
 const make=(cx:number,cz:number,revision=1):Cell=>{const chunk=generateRegionalChunk(seed,cx,cz);return {key:`region:${cx}:${cz}`,revision,bounds:chunk.bounds,terrain:chunk.terrain,obstacles:[...chunk.features.flatMap(f=>f.solids),...chunk.structures.filter(s=>s.solid).map(s=>({x:s.center.x,y:s.center.y,z:s.center.z,hx:s.half.x,hy:s.half.y,hz:s.half.z}))]};};
 // Production junctions remain walkable; structures sit on their own nearby pads.
 const start=a.points[0]!,points=[...a.points.slice(1),...b.points.slice(1)],initial=neighborhood(start.x,start.z).map(c=>make(c.cx,c.cz));
 const p=await regionalPhysics(t,{...start,initialCells:initial}),stream=residency(p,initial,make),result=await travel(p,stream,points,(x,z)=>regionalHeight(seed,x,z));
 assert.ok(result.metres>1000);assert.ok(result.groundedFraction>.999);assert.ok(result.maxGroundError<.06,JSON.stringify(result));assert.equal(result.blocked,0);assert.ok(result.visited>30);assert.ok(result.peakCells<=9);assert.ok(result.peakColliders<500);assert.ok(p.latest.streaming!.totalColliders<500);
 t.diagnostic(JSON.stringify({route:`${plan.sites[0]!.name} to ${plan.sites[2]!.name} via ${plan.sites[1]!.name} through open trail junctions`,seed,...result}));
});
