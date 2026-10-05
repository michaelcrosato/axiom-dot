import {startingTown,townChunkBoxes,townReserved,townTerrainHeight,TOWN_CENTER,TOWN_BOUNDS} from './starting-town.ts';
import {generateValley,valleyHeight,type ValleyPlan} from './valley.ts';
import {seedSample,type Vec3} from './procedural.ts';
import type {WildernessFeature} from './wilderness.ts';
import {dodecahedronObstacle,type WildernessObstacle} from './wilderness-geometry.ts';

/** A separately opted-in, versioned 10 km² world. No full-region mesh or prop list exists. */
export const REGIONAL_VERSION=1 as const;
export const REGION_AREA=10_000_000;
export const REGION_BOUND=Math.sqrt(REGION_AREA)/2;
export const CHUNK_SIZE=64;
export const REGION_STEP=2;
export const REGION_MIN_CHUNK=Math.floor(-REGION_BOUND/CHUNK_SIZE);
export const REGION_MAX_CHUNK=Math.floor(REGION_BOUND/CHUNK_SIZE);
export const REGIONAL_MAX_CANDIDATES=44;
export const REGIONAL_FEATURE_CACHE_LIMIT=96;
export const REGIONAL_CONTEXT_CACHE_LIMIT=4;
export const REGIONAL_MAX_ROAD_GRADE=.3;
const CORE_BOUND=80,CORE_CLEARANCE=86,BLEND_END=240;
export interface RegionalBounds {minX:number;maxX:number;minZ:number;maxZ:number}
export type RegionalBiomeId='valley'|'meadow'|'pine-highlands'|'redstone-uplands'|'river-wetland'|'windward-heath';
export interface RegionalBiome {id:RegionalBiomeId;name:string;color:string;treeDensity:number;rockDensity:number}
export interface RegionalSite {id:string;name:string;kind:'outpost'|'lookout'|'ruin'|'entrance';position:Vec3;radius:number;description:string;ownerChunk:string;structureOffset:{x:number;z:number}}
export interface RegionalRoad {id:string;from:string;to:string;width:number;points:Vec3[]}
export interface RegionalWater {id:string;name:string;width:number;points:Vec3[]}
export interface RegionalMesh {id:string;vertices:number[];indices:number[];color:string}
export interface RegionalBox {id:string;center:Vec3;half:Vec3;material:string;solid:boolean}
export interface RegionalPlan {
 version:1;seed:number;area:number;bound:number;chunkSize:number;terrainStep:number;
 bounds:RegionalBounds;biomes:RegionalBiome[];roads:RegionalRoad[];water:RegionalWater[];sites:RegionalSite[];
 gateways:{id:string;position:Vec3;coreSiteId:string}[];
 routeGraph:{nodes:{id:string;position:Vec3}[];edges:{id:string;from:string;to:string}[]};
 budget:{maxSites:number;maxRoads:number;maxCandidatesPerChunk:number;maxTerrainVerticesPerChunk:number;maxCachedFeatureChunks:number};
}
export interface RegionalChunk {
 version:1;seed:number;cx:number;cz:number;key:string;bounds:RegionalBounds;
 terrain:{vertices:number[];indices:number[];colors:number[];normals:number[];bound:number;step:number};
 biomes:RegionalBiomeId[];roads:RegionalMesh[];water:RegionalMesh[];structures:RegionalBox[];features:WildernessFeature[];
 sites:RegionalSite[];budget:{candidates:number;vertices:number;triangles:number};
}
interface Segment {a:Vec3;b:Vec3;width:number;id:string}
interface Context {plan:RegionalPlan;valley:ValleyPlan;phases:number[];roads:Segment[];rivers:Segment[];roadIndex:Map<string,Segment[]>;riverIndex:Map<string,Segment[]>;townRoads:RegionalRoad[];townSegments:Segment[]}
const contexts=new Map<number,Context>();
const featureCache=new Map<string,WildernessFeature[]>();
let featureCompilations=0,contextCompilations=0;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const smooth=(t:number)=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const round=(n:number)=>Math.round(n*10000)/10000;
const idFor=(seed:number,path:string)=>`region:1:${seed}/${path}`;
const chunkKey=(cx:number,cz:number)=>`${cx}:${cz}`;
function freeze<T>(value:T):T {if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
function validSeed(seed:number){if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new RangeError('Regional seed must be an unsigned 32-bit integer');}
function validCoordinates(x:number,z:number){if(!Number.isFinite(x)||!Number.isFinite(z))throw new RangeError('Regional coordinates must be finite');}
function validChunk(cx:number,cz:number){if(!Number.isInteger(cx)||!Number.isInteger(cz)||cx<REGION_MIN_CHUNK||cx>REGION_MAX_CHUNK||cz<REGION_MIN_CHUNK||cz>REGION_MAX_CHUNK)throw new RangeError('Regional chunk coordinates are outside the world');}
export function regionalChunkAt(x:number,z:number){validCoordinates(x,z);return {cx:Math.floor(clamp(x,-REGION_BOUND,REGION_BOUND)/CHUNK_SIZE),cz:Math.floor(clamp(z,-REGION_BOUND,REGION_BOUND)/CHUNK_SIZE)};}
export function regionalChunkBounds(cx:number,cz:number):RegionalBounds {validChunk(cx,cz);return {minX:Math.max(-REGION_BOUND,cx*CHUNK_SIZE),maxX:Math.min(REGION_BOUND,(cx+1)*CHUNK_SIZE),minZ:Math.max(-REGION_BOUND,cz*CHUNK_SIZE),maxZ:Math.min(REGION_BOUND,(cz+1)*CHUNK_SIZE)};}
function owner(x:number,z:number){const {cx,cz}=regionalChunkAt(x,z);return chunkKey(cx,cz);}
function nearSegment(x:number,z:number,s:Segment){const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,t=clamp(((x-s.a.x)*dx+(z-s.a.z)*dz)/(dx*dx+dz*dz||1),0,1);return {distance:Math.hypot(x-s.a.x-t*dx,z-s.a.z-t*dz),y:s.a.y+(s.b.y-s.a.y)*t};}
function indexSegments(segments:Segment[],margin:number){const index=new Map<string,Segment[]>();for(const s of segments){const loX=Math.floor((Math.min(s.a.x,s.b.x)-margin-s.width)/CHUNK_SIZE),hiX=Math.floor((Math.max(s.a.x,s.b.x)+margin+s.width)/CHUNK_SIZE),loZ=Math.floor((Math.min(s.a.z,s.b.z)-margin-s.width)/CHUNK_SIZE),hiZ=Math.floor((Math.max(s.a.z,s.b.z)+margin+s.width)/CHUNK_SIZE);for(let cz=loZ;cz<=hiZ;cz++)for(let cx=loX;cx<=hiX;cx++){const key=chunkKey(cx,cz),list=index.get(key)??[];list.push(s);index.set(key,list);}}return index;}
function segments(items:{id:string;width:number;points:Vec3[]}[]):Segment[]{return items.flatMap(item=>item.points.slice(1).map((b,i)=>({a:item.points[i]!,b,width:item.width,id:item.id})));}
const BIOMES:RegionalBiome[]=[
 {id:'valley',name:'The Starting Valley',color:'#69866a',treeDensity:.68,rockDensity:.17},
 {id:'meadow',name:'Sunmeadow Reach',color:'#80976b',treeDensity:.27,rockDensity:.13},
 {id:'pine-highlands',name:'Pinewatch Highlands',color:'#526f60',treeDensity:.8,rockDensity:.18},
 {id:'redstone-uplands',name:'Redstone Uplands',color:'#9a8067',treeDensity:.14,rockDensity:.47},
 {id:'river-wetland',name:'Reedwater Corridor',color:'#617e67',treeDensity:.24,rockDensity:.1},
 {id:'windward-heath',name:'Windward Heath',color:'#8a9270',treeDensity:.22,rockDensity:.25},
];
function macroHeight(c:Pick<Context,'phases'>,x:number,z:number){const [p=0,q=0,r=0]=c.phases;return 7+4*Math.sin(x/330+p)*Math.cos(z/410+q)+2.4*Math.sin((x+z)/170+r)+1*Math.sin(x/53+q)*Math.cos(z/67+p)+42*Math.exp(-(((x+930)/630)**2)-((z-910)/640)**2)+35*smooth((x-430)/800)*smooth((-z-220)/900)+10*smooth((z-620)/800);}
function ungradedHeight(c:Pick<Context,'phases'|'valley'>,x:number,z:number){
 const distance=Math.max(Math.abs(x),Math.abs(z));if(distance<=CORE_BOUND)return valleyHeight(c.valley,x,z);
 const ex=clamp(x,-CORE_BOUND,CORE_BOUND),ez=clamp(z,-CORE_BOUND,CORE_BOUND),dx=x-ex,dz=z-ez;
 const base=valleyHeight(c.valley,ex,ez),sx=dx===0?0:(base-valleyHeight(c.valley,ex-Math.sign(dx)*2,ez))/2*Math.sign(dx),sz=dz===0?0:(base-valleyHeight(c.valley,ex,ez-Math.sign(dz)*2))/2*Math.sign(dz);
 const extended=base+sx*dx*Math.exp(-Math.abs(dx)/32)+sz*dz*Math.exp(-Math.abs(dz)/32),t=smooth((distance-CORE_BOUND)/(BLEND_END-CORE_BOUND));
 return extended+(macroHeight(c,x,z)-extended)*t;
}
/** A small bounded A* finds a genuinely walkable exit through the frozen valley mesh. */
function valleyExit(valley:ValleyPlan,side:number):Vec3[]{
 const start=valley.settlements[side<0?0:1]!.center,n=81,sx=Math.round((start.x+80)/2),sz=Math.round((start.z+80)/2),first=sz*n+sx,target=side<0?0:80;
 const costs=new Float64Array(n*n).fill(Infinity),previous=new Int32Array(n*n).fill(-1),closed=new Uint8Array(n*n),heap:{index:number;score:number}[]=[];
 const push=(entry:{index:number;score:number})=>{heap.push(entry);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p]!.score<=entry.score)break;heap[i]=heap[p]!;i=p;}heap[i]=entry;};
 const pop=()=>{const top=heap[0]!,last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1]!.score<heap[child]!.score)child++;if(last.score<=heap[child]!.score)break;heap[i]=heap[child]!;i=child;}heap[i]=last;}return top;};
 const heights=valley.terrain.vertices,blocked=(x:number,z:number)=>valley.buildings.some(b=>Math.abs(x-b.origin.x)<b.width/2+.7&&Math.abs(z-b.origin.z)<b.depth/2+.7)||valley.decorations.some(d=>Math.hypot(x-d.x,z-d.z)<d.radius+1.15)||Math.hypot(x-valley.endpoints.entrance.x,z-valley.endpoints.entrance.z)<6;
 costs[first]=0;push({index:first,score:Math.abs(sx-target)*2});let finish=-1;
 for(let visits=0;heap.length&&visits<n*n*4;visits++){
  const current=pop().index;if(closed[current])continue;closed[current]=1;const ix=current%n,iz=Math.floor(current/n),x=ix*2-80,z=iz*2-80;
  if(ix===target&&Math.abs(z)<=66){finish=current;break;}
  for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=ix+dx!,nz=iz+dz!;if(nx<0||nx>=n||nz<0||nz>=n)continue;const next=nz*n+nx;if(closed[next])continue;const px=nx*2-80,pz=nz*2-80;if(blocked(px,pz))continue;const rise=Math.abs(heights[next*3+1]!-heights[current*3+1]!);if(rise/2>.27)continue;const cost=costs[current]!+2+rise*2;if(cost>=costs[next]!)continue;costs[next]=cost;previous[next]=current;push({index:next,score:cost+Math.abs(nx-target)*2});}
 }
 if(finish<0)throw new Error('Regional valley gateway has no traversable route');
 const path:Vec3[]=[];for(let at=finish;at>=0;at=previous[at]!){path.push({x:(at%n)*2-80,y:heights[at*3+1]!,z:Math.floor(at/n)*2-80});if(at===first)break;}path.reverse();if(Math.hypot(path[0]!.x-start.x,path[0]!.z-start.z)>.001)path.unshift({...start});return path;
}
function context(seed:number):Context {
 validSeed(seed);const old=contexts.get(seed);if(old){contexts.delete(seed);contexts.set(seed,old);return old;}
 contextCompilations++;
 const sample=(path:string,purpose:string)=>seedSample(seed,REGIONAL_VERSION,'regional-world',path,purpose);
 const valley=generateValley(seed),phases=[sample('terrain','phase-a')*Math.PI*2,sample('terrain','phase-b')*Math.PI*2,sample('terrain','phase-c')*Math.PI*2];
 const partial={valley,phases};
 const exitPaths=[valleyExit(valley,-1),valleyExit(valley,1)];
 const gateway=(side:number)=>{const core=valley.settlements[side<0?0:1]!,position=exitPaths[side<0?0:1]!.at(-1)!;return {id:idFor(seed,`gateway/${side<0?'west':'east'}`),position,coreSiteId:core.id};};
 const gateways=[gateway(-1),gateway(1)];
 const definitions:[string,RegionalSite['kind'],number,number,string][]=[
  ['Alder Waystation','outpost',-300,160,'A roofed exploration shelter and a trail marker above the meadow'],
  ['Pinewatch Camp','outpost',-710,590,'A highland shelter among pines, connected to the valley trail'],
  ['Farwatch Cairn','lookout',-1180,1080,'A stone lookout over the western highlands'],
  ['Old Kiln Ruins','ruin',-1110,80,'Broken kiln walls and scattered reclaimable stone'],
  ['Fern Hollow','entrance',-650,-630,'A shallow open rock arch marking an old survey hollow'],
  ['Southwind Refuge','outpost',-1210,-1160,'A remote roofed refuge on the long southern trail'],
  ['Reedbank Shelter','outpost',280,180,'A dry exploration shelter east of the river corridor'],
  ['Windward Beacon','lookout',710,700,'A tall cairn above the rolling heath'],
  ['Northreach Refuge','outpost',1200,1200,'The northernmost trail shelter and broad heath overlook'],
  ['Fallen Survey Station','ruin',1170,140,'The foundations of a forgotten regional survey station'],
  ['Redstone Arch','entrance',660,-610,'An open stone arch at the edge of the redstone uplands'],
  ['Emberwatch Shelter','outpost',1160,-1170,'A sheltered lookout on the redstone plateau'],
 ];
 const sites:RegionalSite[]=definitions.map(([name,kind,px,pz,description],i)=>{const x=round(px+(sample(`site/${i}`,'x')-.5)*100),z=round(pz+(sample(`site/${i}`,'z')-.5)*100),y=ungradedHeight(partial,x,z);return {id:idFor(seed,`site/${i}`),name,kind,position:{x,y:Math.fround(y),z},radius:25,description,ownerChunk:owner(x,z),structureOffset:{x:0,z:0}};});
 const roads:RegionalRoad[]=[];
 const addRoad=(a:{id:string;position:Vec3},b:{id:string;position:Vec3},index:number)=>{
  const path=`road/${index}`,width=index===0||index===7?4:3.2,points:Vec3[]=[],waypoints=[a.position];
  // Leave the legacy boundary perpendicularly before bending: this preserves its
  // traversable final grid edge instead of cutting across an untouched bank.
  if(a.id.includes('/gateway/')){const x=Math.sign(a.position.x)*144,z=a.position.z;waypoints.push({x,y:ungradedHeight(partial,x,z),z});}waypoints.push(b.position);
  for(let part=1;part<waypoints.length;part++){
   const aa=waypoints[part-1]!,bb=waypoints[part]!,length=Math.hypot(bb.x-aa.x,bb.z-aa.z),steps=Math.max(1,Math.ceil(length/96));
   for(let i=part===1?0:1;i<=steps;i++){const t=i/steps,x=round(aa.x+(bb.x-aa.x)*t),z=round(aa.z+(bb.z-aa.z)*t);points.push({x,y:Math.fround(ungradedHeight(partial,x,z)),z});}
  }
  points[0]={...a.position};points[points.length-1]={...b.position};roads.push({id:idFor(seed,path),from:a.id,to:b.id,width,points});
 };
 // Two connected trees join through the already existing bridge and settled valley.
 for(let side=0;side<2;side++){const o=side*6;addRoad(gateways[side]!,sites[o]!,roads.length);for(const [a,b]of [[0,1],[1,2],[1,3],[0,4],[4,5],[3,5]])addRoad(sites[o+a!]!,sites[o+b!]!,roads.length);}
 const water:RegionalWater[]=[];
 for(const direction of [-1,1]){const edge=direction<0?valley.river.points[0]!:valley.river.points.at(-1)!,points:Vec3[]=[];const steps=Math.ceil((REGION_BOUND-CORE_BOUND)/16);for(let i=0;i<=steps;i++){const z=direction*(CORE_BOUND+(REGION_BOUND-CORE_BOUND)*i/steps),distance=Math.abs(z)-CORE_BOUND,x=edge.x+smooth(distance/160)*(28*Math.sin(distance/350+phases[0]!)+14*Math.sin(distance/119+phases[1]!)),y=valley.river.waterLevel+(z-direction*CORE_BOUND)*.002;points.push({x,y,z});}water.push({id:idFor(seed,`river/${direction<0?'south':'north'}`),name:direction<0?'Low Reedwater':'Upper Reedwater',width:valley.river.width+1.2,points});}
 for(let side=0;side<2;side++)roads.push({id:idFor(seed,`road/core-exit-${side}`),from:valley.settlements[side]!.id,to:gateways[side]!.id,width:2,points:exitPaths[side]!});
 const roadSegments=segments(roads),riverSegments=segments(water);
 // Keep the route junction itself open. Each landmark/shelter is placed in the
 // widest free sector beside its incident trails, on the same supporting pad.
 for(const site of sites){let best=-Infinity,chosen={x:0,z:14};const nearby=roadSegments.filter(s=>nearSegment(site.position.x,site.position.z,s).distance<48);for(let i=0;i<24;i++){const angle=i*Math.PI*2/24,offset={x:Math.cos(angle)*14,z:Math.sin(angle)*14},distance=Math.min(...nearby.map(s=>nearSegment(site.position.x+offset.x,site.position.z+offset.z,s).distance));if(distance>best){best=distance;chosen=offset;}}site.structureOffset={x:round(chosen.x),z:round(chosen.z)};}
 const nodes=[...valley.settlements.map(s=>({id:s.id,position:s.center})),...gateways.map(g=>({id:g.id,position:g.position})),...sites.map(s=>({id:s.id,position:s.position}))];
 const plan:RegionalPlan={version:1,seed,area:REGION_AREA,bound:REGION_BOUND,chunkSize:CHUNK_SIZE,terrainStep:REGION_STEP,bounds:{minX:-REGION_BOUND,maxX:REGION_BOUND,minZ:-REGION_BOUND,maxZ:REGION_BOUND},biomes:BIOMES.map(b=>({...b})),roads,water,sites,gateways,routeGraph:{nodes,edges:[...roads.map(r=>({id:r.id,from:r.from,to:r.to})),{id:idFor(seed,'route/core-valley-bridge'),from:valley.settlements[0]!.id,to:valley.settlements[1]!.id}]},budget:{maxSites:12,maxRoads:16,maxCandidatesPerChunk:REGIONAL_MAX_CANDIDATES,maxTerrainVerticesPerChunk:1089,maxCachedFeatureChunks:REGIONAL_FEATURE_CACHE_LIMIT}};
 const tc=TOWN_CENTER,townRoads:RegionalRoad[]=[];
 const street=(key:string,points:Vec3[],width=4)=>townRoads.push({id:`town:1:${seed}/road/${key}`,from:'town',to:'town',width,points});
 for(const z of [-44,-24,0,24,44])street('row-'+z,[{x:tc.x-48,y:6,z:tc.z+z},{x:tc.x+48,y:6,z:tc.z+z}],z===0?6:4);
 for(const x of [-48,0,48])street('lane-'+x,[{x:tc.x+x,y:6,z:tc.z+(x===0?0:-44)},{x:tc.x+x,y:6,z:tc.z+44}]);
 // The connector's final leg shares the west trail's centreline. Join it at the
 // trail's own graded profile: a flat gateway-height leg left a ~1 m step where
 // its blend ended (up to 0.5 grade on about one seed in ten).
 const gate=gateways[0]!.position,join=segments([roads[0]!]).map(s=>nearSegment(-100,gate.z,s)).reduce((a,b)=>b.distance<a.distance?b:a);
 street('valley-access',[{x:tc.x+48,y:6,z:tc.z},{x:-100,y:6,z:tc.z},{x:-100,y:Math.fround(join.y),z:gate.z},{...gate}],4);
 const result:Context={townRoads:freeze(townRoads),townSegments:segments(townRoads),plan:freeze(plan),valley,phases,roads:roadSegments,rivers:riverSegments,roadIndex:indexSegments(roadSegments,16),riverIndex:indexSegments(riverSegments,16)};
 if(contexts.size>=REGIONAL_CONTEXT_CACHE_LIMIT)contexts.delete(contexts.keys().next().value!);contexts.set(seed,result);return result;
}
/** Small immutable macro metadata only; querying it never constructs chunks or props. */
export function regionalPlan(seed:number):RegionalPlan{return context(seed).plan;}

/** Upper bound for a sparse harvested-ID ledger, without materializing the world. */
export const REGIONAL_MAX_FEATURES=(REGION_MAX_CHUNK-REGION_MIN_CHUNK+1)**2*REGIONAL_MAX_CANDIDATES;
function localSegments(index:Map<string,Segment[]>,x:number,z:number){return index.get(chunkKey(Math.floor(x/CHUNK_SIZE),Math.floor(z/CHUNK_SIZE)))??[];}
function vertexHeight(c:Context,x:number,z:number):number {
 if(Math.max(Math.abs(x),Math.abs(z))<=CORE_BOUND)return valleyHeight(c.valley,x,z);
 let h=ungradedHeight(c,x,z),closest={distance:Infinity,y:0,width:0};
 for(const s of localSegments(c.roadIndex,x,z)){const p=nearSegment(x,z,s);if(p.distance<closest.distance)closest={...p,width:s.width};}
 const coreBlend=smooth((Math.max(Math.abs(x),Math.abs(z))-CORE_BOUND)/32);
 if(closest.distance<closest.width/2+12)h+=(closest.y-h)*(1-smooth((closest.distance-closest.width/2-3)/9))*coreBlend;
 // Carve a continuous bed, including under the water's join with the unchanged valley.
 let river={distance:Infinity,y:0,width:0};
 for(const s of localSegments(c.riverIndex,x,z)){const p=nearSegment(x,z,s);if(p.distance<river.distance)river={...p,width:s.width};}
 if(river.distance<river.width/2+6){const t=(1-smooth((river.distance-river.width/2+1)/(7)))*smooth((Math.max(Math.abs(x),Math.abs(z))-CORE_BOUND)/12);h+=(river.y-1.1-h)*t;}
 for(const site of c.plan.sites){const distance=Math.hypot(x-site.position.x,z-site.position.z);if(distance<site.radius+18)h+=(site.position.y-h)*(1-smooth((distance-site.radius)/18));}
 return Math.fround(h);
}
function townVertexHeight(c:Context,x:number,z:number){let h=vertexHeight(c,x,z);if(Math.max(Math.abs(x),Math.abs(z))<=CORE_BOUND||x<TOWN_CENTER.x-80||x> -72||z<TOWN_CENTER.z-TOWN_BOUNDS.halfDepth-20||z>c.plan.gateways[0]!.position.z+8)return h;for(const segment of c.townSegments){const p=nearSegment(x,z,segment);if(p.distance<segment.width/2+5){const t=1-smooth((p.distance-segment.width/2-1)/4);h+=(p.y-h)*t;}}return townTerrainHeight(x,z,h);}
function townCleared(c:Context,x:number,z:number){if(x<TOWN_CENTER.x-83||x> -70||z<TOWN_CENTER.z-TOWN_BOUNDS.halfDepth-23||z>c.plan.gateways[0]!.position.z+10)return false;return townReserved(x,z,23)||c.townSegments.some(s=>nearSegment(x,z,s).distance<s.width/2+8);}
/** Exact barycentric surface of global 2 m triangles, including clipped boundary cells. */
function sampleRegionalHeight(seed:number,x:number,z:number,town:boolean):number {
 validCoordinates(x,z);const c=context(seed);x=clamp(x,-REGION_BOUND,REGION_BOUND);z=clamp(z,-REGION_BOUND,REGION_BOUND);
 if(Math.max(Math.abs(x),Math.abs(z))<=CORE_BOUND)return valleyHeight(c.valley,x,z);
 const ix=Math.min(Math.floor((REGION_BOUND-1e-9)/REGION_STEP),Math.floor(x/REGION_STEP)),iz=Math.min(Math.floor((REGION_BOUND-1e-9)/REGION_STEP),Math.floor(z/REGION_STEP));
 const x0=Math.max(-REGION_BOUND,ix*REGION_STEP),x1=Math.min(REGION_BOUND,(ix+1)*REGION_STEP),z0=Math.max(-REGION_BOUND,iz*REGION_STEP),z1=Math.min(REGION_BOUND,(iz+1)*REGION_STEP),u=(x-x0)/(x1-x0),v=(z-z0)/(z1-z0),sample=town?townVertexHeight:vertexHeight,a=sample(c,x0,z0),b=sample(c,x1,z0),d=sample(c,x1,z1),e=sample(c,x0,z1);
 return u+v<=1?a+(b-a)*u+(e-a)*v:d+(e-d)*(1-u)+(b-d)*(1-v);
}
export function regionalHeight(seed:number,x:number,z:number){return sampleRegionalHeight(seed,x,z,true);}
export function legacyRegionalHeight(seed:number,x:number,z:number){return sampleRegionalHeight(seed,x,z,false);}
function terrainAxes(min:number,max:number){const points=[min];for(let p=(Math.floor(min/REGION_STEP)+1)*REGION_STEP;p<max-1e-8;p+=REGION_STEP)points.push(p);points.push(max);return points;}
function nearestRiver(c:Context,x:number,z:number){let closest={distance:Infinity,y:0,width:0};for(const s of localSegments(c.riverIndex,x,z)){const v=nearSegment(x,z,s);if(v.distance<closest.distance)closest={...v,width:s.width};}return closest;}
export function regionalBiomeAt(seed:number,x:number,z:number):RegionalBiome {
 validCoordinates(x,z);const c=context(seed);let id:RegionalBiomeId;
 if(Math.max(Math.abs(x),Math.abs(z))<=CORE_BOUND)id='valley';
 else if(nearestRiver(c,x,z).distance<42)id='river-wetland';
 else if(x< -380&&z>180)id='pine-highlands';
 else if(x>350&&z< -260)id='redstone-uplands';
 else if(z>430||x>740)id='windward-heath';else id='meadow';
 return c.plan.biomes.find(b=>b.id===id)!;
}
function featureId(seed:number,cx:number,cz:number,index:number){return idFor(seed,`chunk:${cx}:${cz}/feature:${index}`);}
function featuresFor(c:Context,cx:number,cz:number):WildernessFeature[]{
 validChunk(cx,cz);const key=idFor(c.plan.seed,`chunk:${cx}:${cz}`),cached=featureCache.get(key);if(cached){featureCache.delete(key);featureCache.set(key,cached);return cached;}
 featureCompilations++;
 const bounds=regionalChunkBounds(cx,cz),features:WildernessFeature[]=[],sample=(index:number,purpose:string)=>seedSample(c.plan.seed,1,'regional-world',`chunk:${cx}:${cz}/feature:${index}`,purpose);
 for(let i=0;i<REGIONAL_MAX_CANDIDATES;i++){
  // A candidate lives in exactly one half-open chunk; round only after a safe inset.
  const x=round(bounds.minX+2+sample(i,'x')*(bounds.maxX-bounds.minX-4)),z=round(bounds.minZ+2+sample(i,'z')*(bounds.maxZ-bounds.minZ-4));
  if(Math.max(Math.abs(x),Math.abs(z))<CORE_CLEARANCE)continue;
  const biome=regionalBiomeAt(c.plan.seed,x,z),roll=sample(i,'kind'),kind=roll<biome.treeDensity?'tree':roll<biome.treeDensity+biome.rockDensity?'rock':undefined;if(!kind)continue;
  const radius=kind==='tree'?.24:round(.35+sample(i,'radius')*1.35),size=round(.95+sample(i,'scale')*1.45);
  if(c.plan.sites.some(s=>Math.hypot(x-s.position.x,z-s.position.z)<s.radius+4))continue;
  if(localSegments(c.roadIndex,x,z).some(s=>nearSegment(x,z,s).distance<s.width/2+radius+3))continue;
  if(nearestRiver(c,x,z).distance<9+radius)continue;
  const ground=legacyRegionalHeight(c.plan.seed,x,z),offsets=[legacyRegionalHeight(c.plan.seed,x-1,z),legacyRegionalHeight(c.plan.seed,x+1,z),legacyRegionalHeight(c.plan.seed,x,z-1),legacyRegionalHeight(c.plan.seed,x,z+1)];
  if(Math.max(...offsets)-Math.min(...offsets)>.85)continue;
  // Reject only earlier candidates from this bounded chunk; border candidates keep an inset.
  if(features.some(f=>Math.hypot(f.x-x,f.z-z)<radius+(f.radius??.3)+1.1))continue;
  const id=featureId(c.plan.seed,cx,cz,i);
  if(kind==='tree'){
   const base=Math.min(ground,...offsets)-.06,top=ground+size*1.6,solid:WildernessObstacle={featureId:id,x,y:(base+top)/2,z,hx:.175,hy:(top-base)/2,hz:.175};
   features.push(freeze({id,sourceId:id,source:'tree',kind,x,y:ground,z,treeScale:size,scale:{x:1,y:1,z:1},color:biome.id==='pine-highlands'?'#556d55':'#6c6950',solids:[solid],removable:false,harvestable:true}));
  }else{
   const scale={x:1,y:.55+sample(i,'rock-height')*.3,z:.85+sample(i,'rock-width')*.35},y=ground+radius*.29;
   features.push(freeze({id,sourceId:id,source:'field-rock',kind,x,y,z,radius,scale,color:biome.id==='redstone-uplands'?'#af826a':'#9bac8d',solids:[dodecahedronObstacle(id,x,y,z,radius,scale)],removable:radius<=.75,harvestable:true}));
  }
 }
 freeze(features);if(featureCache.size>=REGIONAL_FEATURE_CACHE_LIMIT)featureCache.delete(featureCache.keys().next().value!);featureCache.set(key,features);return features;
}
/** At most a 7×7 neighborhood; large untrusted radii cannot materialize the region. */
export function regionalFeaturesNear(seed:number,x:number,z:number,radiusChunks=1):WildernessFeature[]{
 validCoordinates(x,z);if(!Number.isInteger(radiusChunks)||radiusChunks<0||radiusChunks>3)throw new RangeError('Regional neighborhood radius must be an integer from 0 to 3');
 const c=context(seed),at=regionalChunkAt(x,z),out:WildernessFeature[]=[];
 for(let cz=Math.max(REGION_MIN_CHUNK,at.cz-radiusChunks);cz<=Math.min(REGION_MAX_CHUNK,at.cz+radiusChunks);cz++)for(let cx=Math.max(REGION_MIN_CHUNK,at.cx-radiusChunks);cx<=Math.min(REGION_MAX_CHUNK,at.cx+radiusChunks);cx++)out.push(...featuresFor(c,cx,cz).filter(f=>!townCleared(c,f.x,f.z)));return out;
}
/** Strict canonical identity lookup visits at most one bounded chunk of candidates. */
export function regionalFeatureById(seed:number,id:string):WildernessFeature|undefined {
 validSeed(seed);if(typeof id!=='string'||id.length>110)return undefined;
 const match=/^region:1:(0|[1-9]\d*)\/chunk:(0|-?[1-9]\d*):(0|-?[1-9]\d*)\/feature:(0|[1-9]\d*)$/.exec(id);if(!match)return undefined;
 const world=Number(match[1]),cx=Number(match[2]),cz=Number(match[3]),index=Number(match[4]);
 if(world!==seed||cx<REGION_MIN_CHUNK||cx>REGION_MAX_CHUNK||cz<REGION_MIN_CHUNK||cz>REGION_MAX_CHUNK||index>=REGIONAL_MAX_CANDIDATES||featureId(seed,cx,cz,index)!==id)return undefined;
 return featuresFor(context(seed),cx,cz).find(f=>f.id===id);
}
function siteStructures(site:RegionalSite):RegionalBox[]{
 const {y}=site.position,x=site.position.x+site.structureOffset.x,z=site.position.z+site.structureOffset.z,out:RegionalBox[]=[];
 const box=(part:string,dx:number,dy:number,dz:number,hx:number,hy:number,hz:number,material:string)=>out.push({id:`${site.id}/structure/${part}`,center:{x:x+dx,y:y+dy,z:z+dz},half:{x:hx,y:hy,z:hz},material,solid:true});
 if(site.kind==='outpost'){
  // Open front, full supporting pad, roof and posts: a real usable shelter, without NPC promises.
  box('floor',0,-.12,0,5,.12,4,'regional-foundation');box('roof',0,3.7,0,5.5,.22,4.6,'regional-timber');
  for(const dx of [-4.5,4.5])for(const dz of [-3.5,3.5])box(`post-${dx}-${dz}`,dx,1.75,dz,.24,1.75,.24,'regional-timber');
  box('back-wall',0,1.45,-3.65,4.5,1.45,.18,'regional-timber');box('bench',-2,.4,-2.7,1.7,.4,.5,'regional-timber');
 }else if(site.kind==='lookout'){
  box('cairn-base',0,.6,0,1.5,.6,1.5,'regional-stone');box('cairn-mid',0,1.8,0,1,.6,1,'regional-stone');box('cairn-top',0,3.1,0,.55,.7,.55,'regional-stone');
 }else if(site.kind==='ruin'){
  box('foundation',0,-.12,0,6,.12,5,'regional-stone');box('west-wall',-5,1.2,-1,.45,1.2,3.5,'regional-ruin');box('back-wall',-2,1.8,-4,3.5,1.8,.45,'regional-ruin');box('fallen-pillar',3,.55,2,2.5,.55,.65,'regional-ruin');
 }else{
  box('arch-left',-3,2.4,0,1,2.4,1.2,'regional-stone');box('arch-right',3,2.4,0,1,2.4,1.2,'regional-stone');box('arch-lintel',0,5.2,0,4, .7,1.2,'regional-stone');
 }
 return out;
}
function structuresFor(c:Context,cx:number,cz:number){const key=chunkKey(cx,cz);return [...c.plan.sites.filter(s=>s.ownerChunk===key).flatMap(siteStructures),...townChunkBoxes(c.plan.seed,cx,cz)];}
export function regionalObstaclesNear(seed:number,x:number,z:number):WildernessObstacle[]{
 validCoordinates(x,z);const c=context(seed),at=regionalChunkAt(x,z),out:WildernessObstacle[]=[];
 for(let cz=Math.max(REGION_MIN_CHUNK,at.cz-1);cz<=Math.min(REGION_MAX_CHUNK,at.cz+1);cz++)for(let cx=Math.max(REGION_MIN_CHUNK,at.cx-1);cx<=Math.min(REGION_MAX_CHUNK,at.cx+1);cx++){
  for(const f of featuresFor(c,cx,cz))if(!townCleared(c,f.x,f.z))out.push(...f.solids);
  for(const b of structuresFor(c,cx,cz))if(b.solid)out.push({featureId:b.id,x:b.center.x,y:b.center.y,z:b.center.z,hx:b.half.x,hy:b.half.y,hz:b.half.z});
 }return out;
}
interface ClipPoint {x:number;y:number;z:number}
function clipPolygon(points:ClipPoint[],bounds:RegionalBounds):ClipPoint[]{
 let out=points;
 for(const [axis,limit,sign]of [['x',bounds.minX,1],['x',bounds.maxX,-1],['z',bounds.minZ,1],['z',bounds.maxZ,-1]] as const){const input=out;out=[];for(let i=0;i<input.length;i++){const a=input[i]!,b=input[(i+1)%input.length]!,insideA=(a[axis]-limit)*sign>=-1e-9,insideB=(b[axis]-limit)*sign>=-1e-9;if(insideA)out.push(a);if(insideA!==insideB){const t=(limit-a[axis])/(b[axis]-a[axis]);out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,[axis]:limit});}}}
 return out;
}
function ribbon(c:Context,item:RegionalRoad|RegionalWater,bounds:RegionalBounds,isWater:boolean):RegionalMesh|undefined {
 const vertices:number[]=[],indices:number[]=[];
 for(let i=1;i<item.points.length;i++){
  const a=item.points[i-1]!,b=item.points[i]!,dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(length<1e-8)continue;
  const margin=item.width/2+1;if(Math.max(a.x,b.x)+margin<bounds.minX||Math.min(a.x,b.x)-margin>bounds.maxX||Math.max(a.z,b.z)+margin<bounds.minZ||Math.min(a.z,b.z)-margin>bounds.maxZ)continue;
  const nx=-dz/length*item.width/2,nz=dx/length*item.width/2,steps=Math.max(1,Math.ceil(length/(isWater?8:2)));
  for(let k=0;k<steps;k++){
   const t0=k/steps,t1=(k+1)/steps,ax=a.x+dx*t0,az=a.z+dz*t0,bx=a.x+dx*t1,bz=a.z+dz*t1,ay=a.y+(b.y-a.y)*t0,by=a.y+(b.y-a.y)*t1;
   const polygon=clipPolygon([{x:ax-nx,y:ay,z:az-nz},{x:ax+nx,y:ay,z:az+nz},{x:bx+nx,y:by,z:bz+nz},{x:bx-nx,y:by,z:bz-nz}],bounds);if(polygon.length<3)continue;
   const base=vertices.length/3;for(const p of polygon)vertices.push(p.x,isWater?p.y+.015:regionalHeight(c.plan.seed,p.x,p.z)+.045,p.z);
   for(let j=1;j<polygon.length-1;j++)indices.push(base,base+j,base+j+1);
  }
 }
 return vertices.length?{id:item.id,vertices,indices,color:isWater?'#5c9995':'#b4a486'}:undefined;
}
export function generateRegionalChunk(seed:number,cx:number,cz:number):RegionalChunk {
 validChunk(cx,cz);const c=context(seed),bounds=regionalChunkBounds(cx,cz),xs=terrainAxes(bounds.minX,bounds.maxX),zs=terrainAxes(bounds.minZ,bounds.maxZ),vertices:number[]=[],indices:number[]=[],colors:number[]=[],normals:number[]=[];
 const heightMemo=new Map<string,number>(),height=(x:number,z:number)=>{const key=`${x}:${z}`;let h=heightMemo.get(key);if(h===undefined){h=townVertexHeight(c,x,z);heightMemo.set(key,h);}return h;};
 const linear=(v:number)=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
 for(const z of zs)for(const x of xs){
  const h=height(x,z);vertices.push(x,h,z);const hex=Number.parseInt(regionalBiomeAt(seed,x,z).color.slice(1),16),tint=.94+.06*Math.sin(x*.077+z*.051+seed);colors.push(linear(((hex>>16)&255)/255)*tint,linear(((hex>>8)&255)/255)*tint,linear((hex&255)/255)*tint);
  // Shared global samples make boundary normals independent of load order and
  // the owning chunk, preventing visible lighting seams between equal meshes.
  const loX=Math.max(-REGION_BOUND,x-2),hiX=Math.min(REGION_BOUND,x+2),loZ=Math.max(-REGION_BOUND,z-2),hiZ=Math.min(REGION_BOUND,z+2),nx=-(height(hiX,z)-height(loX,z))/(hiX-loX),nz=-(height(x,hiZ)-height(x,loZ))/(hiZ-loZ),length=Math.hypot(nx,1,nz);normals.push(nx/length,1/length,nz/length);
 }
 for(let iz=0;iz<zs.length-1;iz++)for(let ix=0;ix<xs.length-1;ix++){const a=iz*xs.length+ix,b=a+1,e=a+xs.length,d=e+1;indices.push(a,e,b,b,e,d);}
 const roads=[...c.plan.roads,...c.townRoads].map(r=>ribbon(c,r,bounds,false)).filter((m):m is RegionalMesh=>!!m),water=c.plan.water.map(r=>ribbon(c,r,bounds,true)).filter((m):m is RegionalMesh=>!!m),key=chunkKey(cx,cz);
 const biomes=[...new Set([{x:bounds.minX,z:bounds.minZ},{x:bounds.maxX,z:bounds.maxZ},{x:(bounds.minX+bounds.maxX)/2,z:(bounds.minZ+bounds.maxZ)/2}].map(p=>regionalBiomeAt(seed,p.x,p.z).id))];
 return {version:1,seed,cx,cz,key,bounds,terrain:{vertices,indices,colors,normals,bound:REGION_BOUND,step:REGION_STEP},biomes,roads,water,structures:structuresFor(c,cx,cz),features:featuresFor(c,cx,cz).filter(f=>!townCleared(c,f.x,f.z)),sites:c.plan.sites.filter(s=>s.ownerChunk===key),budget:{candidates:REGIONAL_MAX_CANDIDATES,vertices:vertices.length/3,triangles:indices.length/3}};
}
/** Read-only diagnostics expose bounds, never mutable cache entries. */
export function regionalCacheStats(){return {contexts:contexts.size,featureChunks:featureCache.size,featureCompilations,contextCompilations,maxContexts:REGIONAL_CONTEXT_CACHE_LIMIT,maxFeatureChunks:REGIONAL_FEATURE_CACHE_LIMIT};}

/** Legacy identity lookup is retained for saved receipts; new gathering excludes developed streets. */
export function regionalTownCleared(seed:number,x:number,z:number){return townCleared(context(seed),x,z);}

export function regionalTownRoads(seed:number):readonly RegionalRoad[]{return context(seed).townRoads;}
