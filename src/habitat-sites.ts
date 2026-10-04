import {regionalPlan,regionalHeight,regionalObstaclesNear,type RegionalRoad} from './regional-world.ts';
import {seedSample} from './procedural.ts';
import {obstacleSegmentIntersects} from './wilderness-geometry.ts';
import type {HabitatSiteDescriptor} from './restoration-plan.ts';

/** Additive sites use existing cleared non-economic landmarks. No old base geometry or resources move. */
export const HABITAT_SITE_VERSION=1;
const cache=new Map<number,readonly HabitatSiteDescriptor[]>();
const frozen=<T>(value:T):T=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
const dist=(p:{x:number;z:number},a:{x:number;z:number},b:{x:number;z:number})=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);};
const corridor=(p:{x:number;z:number},road:Pick<RegionalRoad,'points'|'width'>,margin:number)=>road.points.slice(1).some((q,i)=>dist(p,road.points[i]!,q)<road.width/2+margin);
export function habitatSiteDescriptors(seed:number):readonly HabitatSiteDescriptor[]{
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw RangeError('Habitat seed must be uint32.');const previous=cache.get(seed);if(previous)return previous;
 const region=regionalPlan(seed),result:HabitatSiteDescriptor[]=[];
 for(const [ordinal,index] of [4,3,9].entries()){
  const landmark=region.sites[index]!,obstacles=regionalObstaclesNear(seed,landmark.position.x,landmark.position.z),prefix=`habitat-v1-${seed}-site-${ordinal}`;
  const phase=Math.floor(seedSample(seed,1,'habitat-sites',String(ordinal),'angle')*24);let selected:HabitatSiteDescriptor|undefined;
  for(const radius of [12,17,21])for(let attempt=0;attempt<24&&!selected;attempt++){
   const angle=((attempt+phase)%24)*Math.PI/12,x=Math.round((landmark.position.x+Math.cos(angle)*radius)*10000)/10000,z=Math.round((landmark.position.z+Math.sin(angle)*radius)*10000)/10000;
   const cells=Array.from({length:6},(_,i)=>{const px=x+(i%3-1)*2,pz=z+(Math.floor(i/3)-.5)*2;return {id:`${prefix}-cell-${i}`,x:px,y:regionalHeight(seed,px,pz),z:pz};});
   // A 1.15 m full-body clearance and 0.85 m visual patch remain away from all pinned roads, river banks and solids.
   if(cells.some(p=>region.roads.some(r=>corridor(p,r,1.8))||region.water.some(r=>corridor(p,r,3))||obstacles.some(o=>obstacleSegmentIntersects(o,{...p,y:p.y+.75},{...p,y:p.y+.75},1.15))))continue;
   const links:[[number,number],...Array<[number,number]>]=[[0,1],[1,2],[3,4],[4,5],[0,3],[1,4],[2,5]];
   const edges=links.map(([a,b],i)=>{const from=cells[a]!,to=cells[b]!,path=Array.from({length:5},(_,n)=>{const px=from.x+(to.x-from.x)*n/4,pz=from.z+(to.z-from.z)*n/4;return {x:px,y:regionalHeight(seed,px,pz),z:pz};});return {id:`${prefix}-edge-${i}`,a:from.id,b:to.id,path};});
   if(edges.some(e=>e.path.slice(1).some((p,i)=>{const a=e.path[i]!,distance=Math.hypot(p.x-a.x,p.z-a.z);return Math.abs(p.y-a.y)>distance*.3||obstacles.some(o=>obstacleSegmentIntersects(o,{...a,y:a.y+.75},{...p,y:p.y+.75},1.15));})))continue;
   const p=cells[0]!,approach=Array.from({length:25},(_,n)=>{const x=landmark.position.x+(p.x-landmark.position.x)*n/24,z=landmark.position.z+(p.z-landmark.position.z)*n/24;return {x,y:regionalHeight(seed,x,z),z};});
   if(approach.slice(1).some((p,i)=>{const a=approach[i]!,distance=Math.hypot(p.x-a.x,p.z-a.z);return Math.abs(p.y-a.y)>distance*.3||obstacles.some(o=>obstacleSegmentIntersects(o,{...a,y:a.y+1},{...p,y:p.y+1},.4));}))continue;
   selected={id:prefix,label:['Fern Hollow restoration','Old Kiln restoration','Survey Station restoration'][ordinal]!,x:p.x,y:p.y,z:p.z,cells,edges,dockCellId:p.id};
  }
  if(!selected)throw Error(`No safe bounded habitat pad beside ${landmark.name}.`);result.push(selected);
 }
 const value=frozen(result);if(cache.size>=4)cache.delete(cache.keys().next().value!);cache.set(seed,value);return value;
}
