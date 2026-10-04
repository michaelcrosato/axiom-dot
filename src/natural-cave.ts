import {hashSeed,seedSample} from './procedural.ts';

/** A bounded natural-cave annex. Coordinates are metres; the cave floor is y=0. */
export interface CavePoint {x:number;z:number}
export interface CaveWall extends CavePoint {id:string;hx:number;hz:number;hy:number}
export interface CaveTile extends CavePoint {id:string;basin:0|1|2|null}
export interface CaveObject extends CavePoint {id:string;kind:'exit'|'scrap'|'core'|'water';label:string}
export interface CaveChamber extends CavePoint {id:string;name:string;radiusX:number;radiusZ:number}
export interface CaveBasin {id:string;index:0|1|2;name:string;floorY:number;area:number;maxDepth:number;tiles:CavePoint[]}
export interface CavePlan {
 version:1;seed:number;hash:string;bound:number;spawn:CavePoint;returnAnchors:CavePoint[];
 chambers:CaveChamber[];spine:CavePoint[];tiles:CaveTile[];walls:CaveWall[];objects:CaveObject[];
 anchors:{valve:CavePoint;pump:CavePoint;drain:CavePoint};basins:[CaveBasin,CaveBasin,CaveBasin];
 navigation:{id:string;from:string;to:string;points:CavePoint[]}[];
 budget:{operations:number;maxOperations:number;tiles:number;walls:number};
 constraints:{key:string;ok:boolean;message:string}[];
}
const freeze=<T>(v:T):T=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const item of Object.values(v))freeze(item);Object.freeze(v);}return v;};
export const CAVE_MANIFEST=freeze({id:'natural-river-cave',version:1,algorithmRevision:1,
 seedStream:'seedSample/framework-1:natural-cave/1:named-path-purpose-index',
 geometry:'sampled-sinuous-spine/irregular-elliptic-chambers/exposed-tile-edges',
 bounds:{halfExtent:40,tileStep:2,maxTiles:700,maxWalls:700,maxOperations:50000},
 resources:{scrap:4,core:1,water:1,exits:2},water:'conservative-three-compartment-flood@1',
 dimensions:{tileHalfSize:1,capsuleRadius:.34,wallHalfThickness:.14,minWallHalfHeight:2.4}});
export const CAVE_HASH=hashSeed(JSON.stringify(CAVE_MANIFEST)).toString(16).padStart(8,'0');
const segmentDistance=(p:CavePoint,a:CavePoint,b:CavePoint)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);};
const basinIndex=(z:number):0|1|2|null=>z>=6&&z<=12?0:z>=-2&&z<=4?1:z>=-10&&z<=-4?2:null;

/** No retry loop: a finite lattice is carved around a connected, seeded worm spine. */
export function generateNaturalCave(seed:number):CavePlan {
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new RangeError('Cave seed must be an unsigned 32-bit integer');
 const sample=(path:string,purpose:string,index=0)=>seedSample(seed,1,'natural-cave',path,purpose,index);
 const id=(key:string)=>`cave:1:${seed}:${key}`;
 const spine:CavePoint[]=Array.from({length:7},(_,i)=>({x:i===0||i===6?0:(Math.floor(sample('spine','bend',i)*5)-2)*2,z:24-i*8}));
 const chambers:CaveChamber[]=[
  {id:id('chamber/entrance'),name:'Fernlight cavern',x:0,z:24,radiusX:8,radiusZ:8},
  {id:id('chamber/grotto'),name:'Luminous grotto',x:0,z:-24,radiusX:7+sample('grotto','width')*2,radiusZ:7+sample('grotto','length')*2},
  {id:id('chamber/alcove'),name:'Calcite pocket',x:spine[3]!.x+(sample('alcove','side')<.5?-1:1)*4,z:0,radiusX:4+sample('alcove','width'),radiusZ:3.5},
 ];
 let operations=0;const tiles:CaveTile[]=[];
 for(let z=-34;z<=34;z+=2)for(let x=-18;x<=18;x+=2){
  const p={x,z};let carved=false;
  for(let i=0;i<spine.length-1;i++){operations++;const width=2.8+sample('passage','radius',i)*.8;if(segmentDistance(p,spine[i]!,spine[i+1]!)<=width)carved=true;}
  for(const c of chambers){operations++;const angle=Math.atan2((z-c.z)/c.radiusZ,(x-c.x)/c.radiusX),roughness=1+.07*Math.sin(angle*5+sample(c.name,'phase')*Math.PI*2);if(((x-c.x)/c.radiusX)**2+((z-c.z)/c.radiusZ)**2<=roughness**2)carved=true;}
  if(carved)tiles.push({id:id(`floor/${x}/${z}`),x,z,basin:basinIndex(z)});
 }
 const tileSet=new Set(tiles.map(t=>`${t.x}:${t.z}`)),walls:CaveWall[]=[];
 for(const t of tiles)for(const [dx,dz]of [[2,0],[-2,0],[0,2],[0,-2]] as const){operations++;if(!tileSet.has(`${t.x+dx}:${t.z+dz}`))walls.push({id:id(`wall/${t.x}/${t.z}/${dx}/${dz}`),x:t.x+dx/2,z:t.z+dz/2,hx:dx?.14:1.14,hz:dz?.14:1.14,hy:2.4+sample(`${t.x}/${t.z}/${dx}/${dz}`,'height')*.9});}
 const spawn={x:0,z:26},returnAnchors=[spawn,{x:0,z:-26}],anchors={valve:{x:-4,z:24},pump:{x:4,z:24},drain:{x:0,z:20}};
 const objects:CaveObject[]=[
  {id:id('exit/entrance'),kind:'exit',...returnAnchors[0]!,label:'Return to the valley'},
  {id:id('exit/grotto'),kind:'exit',...returnAnchors[1]!,label:'Emergency return line to the valley'},
  {id:id('salvage/valve-kit'),kind:'scrap',x:-4,z:28,label:'Abandoned valve kit'},
  {id:id('salvage/pump-kit'),kind:'scrap',x:4,z:28,label:'Pump maintenance salvage'},
  {id:id('salvage/power-cell'),kind:'core',x:0,z:30,label:'Cave pump power cell'},
  {id:id('cache/grotto-scrap-a'),kind:'scrap',x:-4,z:-24,label:'Dry grotto salvage'},
  {id:id('cache/grotto-scrap-b'),kind:'scrap',x:4,z:-24,label:'Survey expedition salvage'},
  {id:id('cache/grotto-water'),kind:'water',x:0,z:-28,label:'Sealed expedition canister'},
 ];
 const basins=[0,1,2].map(index=>{const points=tiles.filter(t=>t.basin===index).map(({x,z})=>({x,z}));return {id:id(`basin/${index}`),index:index as 0|1|2,name:['Upper rill','Flooded narrows','Lower sump'][index]!,floorY:0,area:points.length*4,maxDepth:1.8,tiles:points};}) as CavePlan['basins'];
 const navigation=[{id:id('route/river-course'),from:chambers[0]!.id,to:chambers[1]!.id,points:[spawn,...spine,{x:0,z:-26}]}];
 const seen=new Set<string>(),queue=[`${spine[0]!.x}:${spine[0]!.z}`];while(queue.length){const key=queue.pop()!;if(seen.has(key)||!tileSet.has(key))continue;seen.add(key);const [x,z]=key.split(':').map(Number) as [number,number];for(const [dx,dz]of [[2,0],[-2,0],[0,2],[0,-2]]){operations++;queue.push(`${x+dx!}:${z+dz!}`);}}
 const clear=(p:CavePoint)=>!walls.some(w=>Math.abs(p.x-w.x)<w.hx+.34&&Math.abs(p.z-w.z)<w.hz+.34)&&tiles.some(t=>Math.abs(t.x-p.x)<=1&&Math.abs(t.z-p.z)<=1);
 const constraints=[
  {key:'connected-carve',ok:seen.size===tiles.length,message:'Every floor tile is connected to the dry entrance'},
  {key:'dry-service-banks',ok:[...returnAnchors,...Object.values(anchors),...objects].every(p=>clear(p)&&basinIndex(p.z)===null),message:'Returns, machinery and caches occupy capsule-clear dry chambers'},
  {key:'standing-river-route',ok:navigation[0]!.points.every(clear),message:'A full-height dry capsule can follow the cave spine'},
  {key:'three-wet-compartments',ok:basins.every(b=>b.area>=32&&b.area<=160),message:'Every connected compartment has a finite floor footprint'},
  {key:'bounded-geometry',ok:tiles.length<=700&&walls.length<=700&&operations<=50000&&tiles.every(t=>Math.abs(t.x)+1.14<40&&Math.abs(t.z)+1.14<40),message:'Planning operations and physical geometry stay within their declared bounds'},
 ];
 if(constraints.some(c=>!c.ok))throw new Error(`Rejected cave plan: ${constraints.filter(c=>!c.ok).map(c=>c.key).join(', ')}`);
 return freeze({version:1,seed,hash:CAVE_HASH,bound:40,spawn,returnAnchors,chambers,spine,tiles,walls,objects,anchors,basins,navigation,budget:{operations,maxOperations:50000,tiles:tiles.length,walls:walls.length},constraints});
}

/** Retains at most four immutable plans; unrelated seed inspection cannot change geometry. */
const cache=new Map<number,CavePlan>();
export function naturalCave(seed:number):CavePlan {let plan=cache.get(seed);if(!plan){plan=generateNaturalCave(seed);if(cache.size>=4)cache.clear();cache.set(seed,plan);}return plan;}
export function caveWalkable(planOrSeed:CavePlan|number,x:number,z:number,radius=.34):boolean {
 if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(radius)||radius<0)return false;
 const plan=typeof planOrSeed==='number'?naturalCave(planOrSeed):planOrSeed;
 return plan.tiles.some(t=>Math.abs(t.x-x)<=1&&Math.abs(t.z-z)<=1)&&!plan.walls.some(w=>Math.abs(w.x-x)<w.hx+radius&&Math.abs(w.z-z)<w.hz+radius);
}
export function caveReturnNearby(plan:CavePlan,point:CavePoint,distance=3.5):boolean {return plan.returnAnchors.some(p=>Math.hypot(p.x-point.x,p.z-point.z)<=distance);}
