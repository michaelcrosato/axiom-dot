import test from 'node:test';
import assert from 'node:assert/strict';
import {generateValley,valleyHeight,valleySurfaceHeight,VALLEY_BOUND,VALLEY_MAX_ROAD_GRADE,type ValleyPlan} from '../src/valley.ts';
import {seedSample} from '../src/procedural.ts';
const SEEDS=[...Array.from({length:80},(_,i)=>i),303,331,480,73129,0x80000000,0xffffffff];
const signature=(p:ValleyPlan)=>JSON.stringify({terrain:p.terrain.vertices.filter((_,i)=>i%93===1),river:p.river.points,roads:p.roads.map(r=>r.points),buildings:p.buildings.map(b=>({x:b.origin.x,z:b.origin.z,width:b.width,depth:b.depth,rooms:b.rooms.length})),objects:p.objects.map(({kind,x,y,z})=>({kind,x,y,z}))});

test('valley plans are immutable, deterministic and genuinely variable independently of identity and call order',()=>{
 const signatures=new Set<string>();
 for(const seed of SEEDS){const p=generateValley(seed);assert.deepEqual(p,generateValley(seed));signatures.add(signature(p));assert.equal(p.version,2);assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.terrain.vertices)&&Object.isFrozen(p.buildings[0]!.plan.shapes[0]!.center));assert.ok(p.constraints.every(c=>c.ok),JSON.stringify(p.constraints));assert.equal(p.settlements.length,2);assert.equal(p.buildings.length,4);assert.ok(p.decorations.length>140&&p.decorations.length<=430);}
 assert.ok(signatures.size>=SEEDS.length-2,'Seed labels alone are not geometric variation');
 const expected=signature(generateValley(73129));for(const seed of [...SEEDS].reverse())generateValley(seed);seedSample(73129,2,'valley','irrelevant-future-system','unrelated');assert.equal(signature(generateValley(73129)),expected);
 assert.throws(()=>{generateValley(1).terrain.vertices[0]=999;},TypeError);
 for(const seed of [-1,NaN,Infinity,1.5,0x100000000])assert.throws(()=>generateValley(seed),RangeError);
});

test('terrain sampler agrees exactly with shared Float32 triangle buffers and upward winding',()=>{
 for(const seed of [0,7,73129,0xffffffff]){
  const p=generateValley(seed),{vertices:v,indices,step,bound}=p.terrain,n=bound*2/step+1;
  assert.equal(bound,VALLEY_BOUND);assert.equal(v.length,n*n*3);assert.equal(indices.length,(n-1)*(n-1)*6);
  assert.ok(v.every(x=>Number.isFinite(x)&&x===Math.fround(x)));
  for(let i=0;i<indices.length;i+=3){const a=indices[i]!*3,b=indices[i+1]!*3,c=indices[i+2]!*3;const normalY=(v[b+2]!-v[a+2]!)*(v[c]!-v[a]!)-(v[b]!-v[a]!)*(v[c+2]!-v[a+2]!);assert.ok(normalY>0);}
  for(let i=0;i<200;i++){
   const cell=Math.floor(seedSample(seed,2,'test','triangle','cell',i)*(n-1)*(n-1)),ix=cell%(n-1),iz=Math.floor(cell/(n-1)),u=seedSample(seed,2,'test','triangle','u',i),w=seedSample(seed,2,'test','triangle','v',i),a=(iz*n+ix)*3+1,b=a+3,c=a+n*3,d=c+3;
   const expected=u+w<=1?v[a]!+(v[b]!-v[a]!)*u+(v[c]!-v[a]!)*w:v[d]!+(v[c]!-v[d]!)*(1-u)+(v[b]!-v[d]!)*(1-w);
   assert.ok(Math.abs(valleyHeight(p,-bound+(ix+u)*step,-bound+(iz+w)*step)-expected)<1e-12);
  }
  assert.throws(()=>valleyHeight(p,NaN,0),RangeError);
 }
});

test('all infrastructure routes connect, remain graded and clear, and expose semantic work and supply endpoints',()=>{
 for(const seed of SEEDS){const p=generateValley(seed),reached=new Set(['camp']);
  for(let i=0;i<p.routeGraph.nodes.length;i++)for(const e of p.routeGraph.edges){if(reached.has(e.from))reached.add(e.to);if(reached.has(e.to))reached.add(e.from);}
  assert.ok(p.routeGraph.nodes.every(n=>reached.has(n.id)));
  for(const r of p.roads)for(let i=0;i<r.points.length;i++){
   const v=r.points[i]!;assert.ok(Math.abs(v.y-valleySurfaceHeight(p,v.x,v.z))<1e-5);
   if(i){const a=r.points[i-1]!,distance=Math.hypot(v.x-a.x,v.z-a.z);assert.ok(distance>.001);assert.ok(Math.abs(v.y-a.y)/distance<=VALLEY_MAX_ROAD_GRADE);}
   for(const b of p.buildings)assert.ok(!b.plan.shapes.some(s=>s.solid&&s.center.y+s.half.y>v.y+.2&&s.center.y-s.half.y<v.y+2.16&&Math.abs(s.center.x-v.x)<s.half.x+.34&&Math.abs(s.center.z-v.z)<s.half.z+.34),`Road blocked by ${b.id} at ${JSON.stringify(v)}`);
  }
  for(const b of p.buildings){assert.ok(b.plan.valid);const port=b.plan.exposed.find(e=>e.key==='workplace')!.port;assert.ok(p.sites.some(s=>s.kind==='workplace'&&s.portId===port.id));
   for(let x=b.origin.x-b.width/2;x<=b.origin.x+b.width/2;x+=1)for(let z=b.origin.z-b.depth/2;z<=b.origin.z+b.depth/2;z+=1)assert.ok(Math.abs(valleyHeight(p,x,z)-b.elevation)<1e-5);
   assert.ok(Math.abs(valleyHeight(p,b.spawn.x,b.spawn.z)-b.elevation)<1e-5);
   for(const shape of b.plan.shapes)assert.deepEqual(shape,b.plan.nodes.find(n=>n.id===shape.nodeId)!.shapes.find(s=>s.id===shape.id));
  }
  const origin=p.endpoints.buildOrigin;for(let x=-21.5;x<=-3.5;x+=1)for(let z=4.5;z<=13.5;z+=1)assert.ok(Math.abs(valleySurfaceHeight(p,x+origin.x,z+origin.z)-origin.y)<1e-5);
  assert.ok(Math.abs(p.foundations[0]!.center.y+p.foundations[0]!.half.y-origin.y)<1e-12);
  assert.equal(p.waterworksSupply.source.y,p.river.waterLevel);assert.equal(p.waterworksSupply.intake.x,origin.x-5);assert.equal(p.waterworksSupply.capacity,2);assert.ok(p.infrastructure.length>=2);
  assert.ok(valleyHeight(p,p.bridges[0]!.center.x,p.bridges[0]!.center.z)<p.river.waterLevel);assert.equal(valleySurfaceHeight(p,p.bridges[0]!.center.x,p.bridges[0]!.center.z),.8);
 }
});

test('foliage obeys already committed reservations and all resources remain reachable and bounded',()=>{
 for(const seed of SEEDS){const p=generateValley(seed);for(const d of p.decorations){assert.ok(Math.abs(d.x)+d.radius<80&&Math.abs(d.z)+d.radius<80);assert.equal(d.y,valleyHeight(p,d.x,d.z));
   for(const r of p.reservations){const distance=Math.hypot(Math.max(0,Math.abs(d.x-r.x)-r.hx),Math.max(0,Math.abs(d.z-r.z)-r.hz));assert.ok(distance+1e-4>=d.radius+(r.clearance??0));}
   for(const o of p.objects)assert.ok(Math.hypot(d.x-o.x,d.z-o.z)>=d.radius+2.4999);
  }
  assert.equal(new Set(p.objects.map(o=>o.id)).size,p.objects.length);
  assert.equal(p.objects.filter(o=>o.kind==='scrap').length,7);assert.equal(p.objects.filter(o=>o.kind==='core').length,1);assert.equal(p.objects.filter(o=>o.kind==='water').length,3);assert.equal(p.objects.filter(o=>o.kind==='enemy').length,2);
  for(const o of p.objects){assert.ok(Math.abs(o.x)<80&&Math.abs(o.z)<80);assert.equal(o.y,valleySurfaceHeight(p,o.x,o.z));assert.ok(p.reservations.some(r=>Math.abs(o.x-r.x)<=r.hx+1&&Math.abs(o.z-r.z)<=r.hz+1));}
 }
});

test('forced production grade repair preserves full-height buildings, support, semantic sites and feeder alignment',async()=>{
 const {readFileSync}=await import('node:fs'),{stripTypeScriptTypes}=await import('node:module');
 const source=readFileSync(new URL('../src/valley.ts',import.meta.url),'utf8');
 const branch=' if(maxGrade>VALLEY_MAX_ROAD_GRADE){';assert.equal(source.split(branch).length,2,'Exercise the actual single production repair branch');
 const injected=source.replace(branch,` maxGrade=2;\n${branch}`);
 const js=stripTypeScriptTypes(injected).replace("'./building.ts'",JSON.stringify(new URL('../src/building.ts',import.meta.url).href)).replace("'./procedural.ts'",JSON.stringify(new URL('../src/procedural.ts',import.meta.url).href));
 const repairModule=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`) as typeof import('../src/valley.ts');
 for(const seed of [0,73129,0xffffffff]){
  const original=generateValley(seed),p=repairModule.generateValley(seed),map=(y:number)=>.8+(y-.8)*.11;
  assert.ok(p.constraints.every(c=>c.ok));assert.ok(p.constraints.find(c=>c.key==='road-grade')!.message.startsWith('Deterministically repaired'));
  assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.terrain.vertices)&&Object.isFrozen(p.waterworksSupply.pipePath)&&Object.isFrozen(p.buildings[0]!.plan.shapes[0]!.center));
  for(let i=0;i<p.terrain.vertices.length;i+=3){assert.equal(p.terrain.vertices[i],original.terrain.vertices[i]);assert.equal(p.terrain.vertices[i+2],original.terrain.vertices[i+2]);assert.equal(p.terrain.vertices[i+1],Math.fround(map(original.terrain.vertices[i+1]!)));}
  for(let i=0;i<p.buildings.length;i++){
   const b=p.buildings[i]!,old=original.buildings[i]!,delta=b.elevation-old.elevation;assert.equal(b.elevation,map(old.elevation));
   for(const shape of b.plan.shapes){const base=old.plan.shapes.find(s=>s.id===shape.id)!;assert.deepEqual(shape.half,base.half);assert.equal(shape.center.y,base.center.y+delta);assert.deepEqual(shape,b.plan.nodes.find(n=>n.id===shape.nodeId)!.shapes.find(s=>s.id===shape.id));}
   for(const exposed of b.plan.exposed){const oldPort=old.plan.exposed.find(e=>e.port.id===exposed.port.id)!.port;assert.equal(exposed.port.position.y,oldPort.position.y+delta);assert.deepEqual(exposed.port,b.plan.nodes.find(n=>n.id===exposed.port.nodeId)!.ports.find(port=>port.id===exposed.port.id));}
   for(let x=b.origin.x-b.width/2;x<=b.origin.x+b.width/2;x+=1)for(let z=b.origin.z-b.depth/2;z<=b.origin.z+b.depth/2;z+=1)assert.ok(Math.abs(valleyHeight(p,x,z)-b.elevation)<1e-5);
   assert.ok(Math.abs(valleyHeight(p,b.spawn.x,b.spawn.z)-b.elevation)<1e-5);
  }
  for(const site of p.sites){assert.ok(Math.abs(site.position.y-valleySurfaceHeight(p,site.position.x,site.position.z))<1e-5);const node=p.routeGraph.nodes.find(n=>n.id===site.id);if(node)assert.deepEqual(node.position,site.position);if(site.portId){const port=p.buildings.flatMap(b=>b.plan.exposed).find(e=>e.port.id===site.portId)!.port;if(site.kind==='workplace')assert.deepEqual(site.position,port.position);}}
  for(const road of p.roads)for(let i=0;i<road.points.length;i++){const v=road.points[i]!;assert.equal(v.y,valleySurfaceHeight(p,v.x,v.z));if(i){const a=road.points[i-1]!;assert.ok(Math.abs(v.y-a.y)/Math.hypot(v.x-a.x,v.z-a.z)<=.3);}}
  for(const bridge of p.bridges){const old=original.bridges.find(b=>b.id===bridge.id)!;assert.deepEqual(bridge.half,old.half);assert.ok(Math.abs(bridge.center.y+bridge.half.y-map(old.center.y+old.half.y))<1e-12);assert.equal(valleySurfaceHeight(p,bridge.center.x,bridge.center.z),bridge.center.y+bridge.half.y);}
  const origin=p.endpoints.buildOrigin;assert.equal(origin.y,map(original.endpoints.buildOrigin.y));assert.ok(Math.abs(p.foundations[0]!.center.y+p.foundations[0]!.half.y-origin.y)<1e-12);
  for(let x=-21.5;x<=-3.5;x+=1)for(let z=4.5;z<=13.5;z+=1)assert.ok(Math.abs(valleySurfaceHeight(p,x+origin.x,z+origin.z)-origin.y)<1e-5);
  for(const o of p.objects)assert.equal(o.y,valleySurfaceHeight(p,o.x,o.z));for(const d of p.decorations)assert.equal(d.y,valleyHeight(p,d.x,d.z));
  const supply=p.waterworksSupply;assert.equal(supply.source.y,p.river.waterLevel);assert.equal(supply.intake.y,origin.y+.24,'Fixture stand-off is not terrain relief and must not shrink');
  for(const intake of supply.intakes)assert.equal(intake.y,supply.intake.y);for(const m of supply.manifold)assert.equal(m.y,supply.intake.y);
  for(const box of p.infrastructure){if(box.id.endsWith('intake-riser')){assert.ok(Math.abs(box.center.y-box.half.y-supply.source.y)<1e-12);assert.ok(Math.abs(box.center.y+box.half.y-supply.intake.y)<1e-12);}else{assert.equal(box.center.y,supply.intake.y);assert.ok(box.center.y-box.half.y>origin.y);}}
  assert.deepEqual(supply.pipePath[0],supply.source);assert.deepEqual(supply.pipePath.at(-1),supply.intake);assert.equal(supply.pipePath[1]!.y,supply.intake.y);
 }
});
