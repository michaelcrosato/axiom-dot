import test from 'node:test';
import assert from 'node:assert/strict';
import {generateValley,valleyHeight} from '../src/valley.ts';
import {generateRegionalChunk,regionalHeight,regionalPlan,regionalFeatureById,regionalFeaturesNear,regionalObstaclesNear,regionalBiomeAt,regionalChunkAt,regionalChunkBounds,regionalCacheStats,REGION_AREA,REGION_BOUND,REGION_MIN_CHUNK,REGION_MAX_CHUNK,CHUNK_SIZE,REGION_STEP,REGIONAL_MAX_FEATURES,REGIONAL_MAX_CANDIDATES,REGIONAL_MAX_ROAD_GRADE,REGIONAL_FEATURE_CACHE_LIMIT,REGIONAL_CONTEXT_CACHE_LIMIT,type RegionalChunk} from '../src/regional-world.ts';
const SEEDS=[0,1,42,991,2026,4294967295];
const near=(a:number,b:number,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} != ${b}`);
function barycentric(chunk:RegionalChunk,x:number,z:number){
 const v=chunk.terrain.vertices;
 for(let i=0;i<chunk.terrain.indices.length;i+=3){const ia=chunk.terrain.indices[i]!*3,ib=chunk.terrain.indices[i+1]!*3,ic=chunk.terrain.indices[i+2]!*3,ax=v[ia]!,az=v[ia+2]!,bx=v[ib]!,bz=v[ib+2]!,cx=v[ic]!,cz=v[ic+2]!,det=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz),a=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/det,b=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/det,c=1-a-b;if(a>=-1e-9&&b>=-1e-9&&c>=-1e-9)return a*v[ia+1]!+b*v[ib+1]!+c*v[ic+1]!;}
 throw new Error('Point is outside mesh');
}
function edge(c:RegionalChunk,axis:'x'|'z',value:number){const v=c.terrain.vertices,out:number[][]=[];for(let i=0;i<v.length;i+=3)if(v[i+(axis==='x'?0:2)]===value)out.push([v[i]!,v[i+1]!,v[i+2]!]);return out;}

test('regional world is exactly ten square kilometres with canonical clipped chunk bounds',()=>{
 assert.equal(REGION_AREA,10_000_000);near((REGION_BOUND*2)**2,REGION_AREA,1e-8);assert.equal(CHUNK_SIZE,64);assert.equal(REGION_STEP,2);
 assert.deepEqual(regionalChunkAt(-.01,-64),{cx:-1,cz:-1});assert.deepEqual(regionalChunkAt(REGION_BOUND,REGION_BOUND),{cx:REGION_MAX_CHUNK,cz:REGION_MAX_CHUNK});
 let area=0;for(let cz=REGION_MIN_CHUNK;cz<=REGION_MAX_CHUNK;cz++)for(let cx=REGION_MIN_CHUNK;cx<=REGION_MAX_CHUNK;cx++){const b=regionalChunkBounds(cx,cz);area+=(b.maxX-b.minX)*(b.maxZ-b.minZ);if(cx<REGION_MAX_CHUNK)assert.equal(b.maxX,regionalChunkBounds(cx+1,cz).minX);}near(area,REGION_AREA,1e-5);
});
test('the original valley terrain is bit-for-bit preserved at every original vertex and exact off-grid triangles',()=>{
 for(const seed of SEEDS){const old=generateValley(seed);for(let z=-80;z<=80;z+=2)for(let x=-80;x<=80;x+=2)assert.equal(regionalHeight(seed,x,z),valleyHeight(old,x,z));for(let i=0;i<120;i++){const x=-79.9+(i*37%1597)/10,z=-79.8+(i*83%1593)/10;assert.equal(regionalHeight(seed,x,z),valleyHeight(old,x,z));}}
});
test('neighbor chunk seams are identical in either generation order, including negative and clipped edges',()=>{
 for(const seed of [0,42,4294967295])for(const [cx,cz]of [[-25,-25],[-2,-1],[-1,0],[0,0],[1,1],[12,-7],[23,23]]){
  const a=generateRegionalChunk(seed,cx!,cz!),east=generateRegionalChunk(seed,cx!+1,cz!),north=generateRegionalChunk(seed,cx!,cz!+1);
  assert.deepEqual(edge(a,'x',a.bounds.maxX),edge(east,'x',east.bounds.minX));assert.deepEqual(edge(a,'z',a.bounds.maxZ),edge(north,'z',north.bounds.minZ));const attributeEdge=(c:RegionalChunk,axis:'x'|'z',value:number,attribute:'normals'|'colors')=>{const out:number[][]=[];for(let i=0;i<c.terrain.vertices.length;i+=3)if(c.terrain.vertices[i+(axis==='x'?0:2)]===value)out.push(c.terrain[attribute].slice(i,i+3));return out;};for(const attribute of ['normals','colors']as const){assert.deepEqual(attributeEdge(a,'x',a.bounds.maxX,attribute),attributeEdge(east,'x',east.bounds.minX,attribute));assert.deepEqual(attributeEdge(a,'z',a.bounds.maxZ,attribute),attributeEdge(north,'z',north.bounds.minZ,attribute));}assert.deepEqual(generateRegionalChunk(seed,cx!,cz!),a);
 }
});
test('height authority matches generated mesh triangles at interior, seams, corners and clipped partial cells',()=>{
 for(const seed of [42,991])for(const [cx,cz]of [[-25,-25],[-25,24],[-1,1],[1,1],[10,-11],[24,24]]){const c=generateRegionalChunk(seed,cx!,cz!),b=c.bounds;for(const [u,v]of [[0,0],[1,1],[0,1],[1,0],[.137,.782],[.333,.337],[.9,.1],[.01,.01],[.997,.996]]){const x=b.minX+(b.maxX-b.minX)*u!,z=b.minZ+(b.maxZ-b.minZ)*v!;near(regionalHeight(seed,x,z),barycentric(c,x,z),2e-6);}}
});
test('chunk geometry is finite, upward wound, bounded and budgeted; all outer edges retain the true bound',()=>{
 for(const [cx,cz]of [[-25,-25],[-25,0],[0,-25],[24,24],[0,0],[-12,9],[10,-10],[0,12]]){
  const c=generateRegionalChunk(42,cx!,cz!),v=c.terrain.vertices;assert.ok(v.length/3<=1089);assert.equal(c.terrain.colors.length,v.length);assert.equal(c.terrain.normals.length,v.length);for(let i=0;i<c.terrain.normals.length;i+=3){near(Math.hypot(...c.terrain.normals.slice(i,i+3)),1,1e-7);assert.ok(c.terrain.normals[i+1]!>0);}assert.ok(c.terrain.colors.every(n=>Number.isFinite(n)&&n>=0&&n<=1));assert.equal(c.budget.candidates,REGIONAL_MAX_CANDIDATES);
  for(let i=0;i<v.length;i+=3){assert.ok(Number.isFinite(v[i+1]));assert.ok(v[i]!>=c.bounds.minX&&v[i]!<=c.bounds.maxX);assert.ok(v[i+2]!>=c.bounds.minZ&&v[i+2]!<=c.bounds.maxZ);}
  for(let i=0;i<c.terrain.indices.length;i+=3){const a=c.terrain.indices[i]!*3,b=c.terrain.indices[i+1]!*3,d=c.terrain.indices[i+2]!*3;assert.ok(d<v.length);assert.ok((v[b+2]!-v[a+2]!)*(v[d]!-v[a]!)-(v[b]!-v[a]!)*(v[d+2]!-v[a+2]!)>0);}
  for(const mesh of [...c.roads,...c.water]){assert.ok(mesh.vertices.every(Number.isFinite));for(let i=0;i<mesh.vertices.length;i+=3){assert.ok(mesh.vertices[i]!>=c.bounds.minX-1e-7&&mesh.vertices[i]!<=c.bounds.maxX+1e-7);assert.ok(mesh.vertices[i+2]!>=c.bounds.minZ-1e-7&&mesh.vertices[i+2]!<=c.bounds.maxZ+1e-7);}}
 }
});
test('small macro plan connects every named destination to both old settlements without claiming economy NPCs',()=>{
 for(const seed of SEEDS){const p=regionalPlan(seed);assert.equal(p.sites.length,12);assert.equal(p.roads.length,16);assert.equal(p.water.length,2);assert.ok(p.roads.reduce((n,r)=>n+r.points.length,0)<800);assert.ok(p.water.reduce((n,r)=>n+r.points.length,0)<210);
  const visited=new Set([p.gateways[0]!.id]);for(let k=0;k<p.routeGraph.nodes.length;k++)for(const edge of p.routeGraph.edges){if(visited.has(edge.from))visited.add(edge.to);if(visited.has(edge.to))visited.add(edge.from);}assert.ok(p.routeGraph.nodes.every(n=>visited.has(n.id)));assert.ok(p.sites.every(s=>!s.description.includes('NPC')));
  assert.ok(new Set(p.sites.map(s=>s.kind)).size>=4);assert.ok(new Set(p.sites.map(s=>regionalBiomeAt(seed,s.position.x,s.position.z).id)).size>=4);
 }
});
test('all sampled trails are walkable and form more than ten kilometres of exploration paths across seeds',()=>{
 for(const seed of SEEDS){const p=regionalPlan(seed);let maxGrade=0,total=0;
  for(const r of p.roads)for(let i=1;i<r.points.length;i++){const a=r.points[i-1]!,b=r.points[i]!,length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/2);total+=length;let previous={...a,y:regionalHeight(seed,a.x,a.z)};for(let k=1;k<=steps;k++){const t=k/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=regionalHeight(seed,x,z),d=Math.hypot(x-previous.x,z-previous.z);maxGrade=Math.max(maxGrade,Math.abs(y-previous.y)/d);previous={x,y,z};}}
  assert.ok(total>10_000);assert.ok(maxGrade<=REGIONAL_MAX_ROAD_GRADE,`seed ${seed}: ${maxGrade}`);
 }
});
test('feature identities survive eviction, validate canonically, reject cross-seed IDs and never intrude into the core',()=>{
 const seed=42,features=regionalFeaturesNear(seed,-710,590),ids=new Set(features.map(f=>f.id));assert.equal(features.length,ids.size);assert.ok(features.length>100);
 for(const f of features){assert.equal(regionalFeatureById(seed,f.id),f);assert.equal(regionalFeatureById(seed+1,f.id),undefined);assert.ok(Math.max(Math.abs(f.x),Math.abs(f.z))>=86);const at=regionalChunkAt(f.x,f.z);assert.ok(f.id.includes(`/chunk:${at.cx}:${at.cz}/`));assert.ok(f.solids.every(s=>s.featureId===f.id));if(f.kind==='rock')assert.equal(f.solids[0]!.convexPlanes!.length,12);}
 const bad=['region:1:042/chunk:0:0/feature:1','region:1:42/chunk:-0:0/feature:1','region:1:42/chunk:025:0/feature:1','region:1:42/chunk:0:0/feature:44','region:1:42/chunk:25:0/feature:1','region:2:42/chunk:0:0/feature:1','region:1:42/chunk:0:0/feature:01','__proto__'];for(const id of bad)assert.equal(regionalFeatureById(seed,id),undefined);
 for(let cz=-15;cz<-5;cz++)for(let cx=8;cx<18;cx++)regionalFeaturesNear(seed,cx*64+10,cz*64+10,0);
 assert.deepEqual(regionalFeatureById(seed,features[0]!.id),features[0]);assert.equal(REGIONAL_MAX_FEATURES,110000);
 for(let cz=-2;cz<=1;cz++)for(let cx=-2;cx<=1;cx++){const c=generateRegionalChunk(seed,cx,cz);assert.ok(c.features.every(f=>Math.max(Math.abs(f.x),Math.abs(f.z))>=86));assert.ok(c.structures.every(b=>Math.max(Math.abs(b.center.x)-b.half.x,Math.abs(b.center.z)-b.half.z)>=86),'additive town solids remain outside the core');}
});
test('structures have a single owner, supported pads, usable shelter entrances and bounded obstacle queries',()=>{
 const p=regionalPlan(42),ids=new Set<string>();for(const site of p.sites){const at=regionalChunkAt(site.position.x,site.position.z),c=generateRegionalChunk(42,at.cx,at.cz),own=c.structures.filter(b=>b.id.startsWith(site.id+'/'));assert.ok(own.length>=3);for(const b of own){assert.ok(!ids.has(b.id));ids.add(b.id);assert.ok(b.solid);assert.ok([b.center.x,b.center.y,b.center.z,b.half.x,b.half.y,b.half.z].every(Number.isFinite));}
  near(regionalHeight(42,site.position.x,site.position.z),site.position.y);assert.ok(regionalObstaclesNear(42,site.position.x,site.position.z).some(o=>o.featureId===own[0]!.id));if(site.kind==='outpost')assert.ok(!own.some(b=>Math.abs(b.center.x-site.position.x)<1&&b.center.z>site.position.z+2&&b.center.y>site.position.y+.5));
 }
});
test('cross-seed terrain/landmark/resource variation and all caches remain bounded',()=>{
 const a=generateRegionalChunk(42,-12,9),b=generateRegionalChunk(43,-12,9);assert.notDeepEqual(a.terrain.vertices,b.terrain.vertices);assert.notDeepEqual(a.features.map(f=>[f.x,f.z]),b.features.map(f=>[f.x,f.z]));assert.notDeepEqual(regionalPlan(42).sites,regionalPlan(43).sites);
 for(let seed=800;seed<806;seed++)regionalPlan(seed);const stats=regionalCacheStats();assert.ok(stats.contexts<=REGIONAL_CONTEXT_CACHE_LIMIT);assert.ok(stats.featureChunks<=REGIONAL_FEATURE_CACHE_LIMIT);
});
test('invalid seeds, coordinates, chunks and unbounded neighborhoods are rejected cheaply',()=>{
 for(const seed of [-1,1.1,Infinity,NaN,4294967296])assert.throws(()=>regionalPlan(seed),RangeError);
 for(const v of [Infinity,-Infinity,NaN])assert.throws(()=>regionalHeight(42,v,0),RangeError);
 for(const [cx,cz]of [[-26,0],[25,0],[0,25],[.5,0],[NaN,0]])assert.throws(()=>generateRegionalChunk(42,cx!,cz!),RangeError);
 for(const r of [-1,.5,4,1000000])assert.throws(()=>regionalFeaturesNear(42,0,0,r),RangeError);
 near(regionalHeight(42,REGION_BOUND+100,0),regionalHeight(42,REGION_BOUND,0));
});

test('road and water ribbons share identical clipped intersections at chunk seams',()=>{
 const points=(c:RegionalChunk,kind:'roads'|'water',axis:'x'|'z',value:number)=>{const set=new Set<string>();for(const m of c[kind])for(let i=0;i<m.vertices.length;i+=3)if(Math.abs(m.vertices[i+(axis==='x'?0:2)]!-value)<1e-7)set.add(`${m.id}|${m.vertices.slice(i,i+3).map(v=>v.toFixed(7)).join(',')}`);return [...set].sort();};
 let roadSeams=0,waterSeams=0;
 for(const [cx,cz]of [[0,5],[-1,5],[0,12],[-12,9],[-11,8],[-18,15],[4,3],[11,-10]]){const a=generateRegionalChunk(42,cx!,cz!),b=generateRegionalChunk(42,cx!+1,cz!),d=generateRegionalChunk(42,cx!,cz!+1);for(const kind of ['roads','water']as const){const east=points(a,kind,'x',a.bounds.maxX),north=points(a,kind,'z',a.bounds.maxZ);assert.deepEqual(east,points(b,kind,'x',b.bounds.minX));assert.deepEqual(north,points(d,kind,'z',d.bounds.minZ));if(east.length||north.length){if(kind==='roads')roadSeams++;else waterSeams++;}}}
 assert.ok(roadSeams>0);assert.ok(waterSeams>0);
});
test('each route junction stays open and offset structure footprints clear every incident trail',()=>{
 for(const seed of [0,42,991,4294967295]){const p=regionalPlan(seed);for(const site of p.sites){const at=regionalChunkAt(site.position.x,site.position.z),boxes=generateRegionalChunk(seed,at.cx,at.cz).structures.filter(b=>b.id.startsWith(site.id+'/'));for(const box of boxes){const clearance=Math.hypot(Math.max(0,Math.abs(box.center.x-site.position.x)-box.half.x),Math.max(0,Math.abs(box.center.z-site.position.z)-box.half.z));assert.ok(clearance>4);for(const dx of [-box.half.x,box.half.x])for(const dz of [-box.half.z,box.half.z])near(regionalHeight(seed,box.center.x+dx,box.center.z+dz),site.position.y,1e-5);}
  for(const road of p.roads.filter(r=>r.from===site.id||r.to===site.id))for(let i=1;i<road.points.length;i++){const a=road.points[i-1]!,b=road.points[i]!,length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/2);for(let k=0;k<=steps;k++){const t=k/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;if(Math.hypot(x-site.position.x,z-site.position.z)>30)continue;for(const box of boxes)assert.ok(Math.abs(x-box.center.x)>box.half.x+.4||Math.abs(z-box.center.z)>box.half.z+.4,`${road.id} hits ${box.id}`);}}
 }}
});
