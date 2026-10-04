import {CHUNK_SIZE,REGIONAL_MAX_FEATURES,regionalFeaturesNear,regionalFeatureById,regionalObstaclesNear} from './regional-world.ts';
import {worldValley} from './generation.ts';
import {valleyHeight} from './valley.ts';
import {WORKSHOP_CLEARANCE} from './building.ts';
import {withinBuildArea} from './waterworks.ts';
import {generateObjects} from './world.ts';
import {dodecahedronObstacle,nearestObstaclePoint,type WildernessObstacle,type WildernessPoint} from './wilderness-geometry.ts';
export {wildernessSegmentClear,obstacleSegmentIntersects,obstaclePlanes,type WildernessObstacle,type WildernessPlane,type WildernessPoint} from './wilderness-geometry.ts';
export interface WildernessIdentity {generation:1|2;seed:number;regional?:{version:1}}
export interface WildernessProjection {harvested:readonly string[]}
export interface WildernessFeature {
 readonly id:string;readonly sourceId:string;readonly source:'tree'|'field-rock'|'river-rock'|'decoration'|'cave-rock';readonly kind:'tree'|'rock';
 /** Tree ground base or rock mesh center; directly usable by the renderer. */
 readonly x:number;readonly y:number;readonly z:number;readonly treeScale?:number;readonly radius?:number;
 readonly scale:Readonly<WildernessPoint>;readonly color:string;readonly solids:readonly WildernessObstacle[];readonly removable:boolean;readonly harvestable:boolean;
}
const cache=new Map<string,readonly WildernessFeature[]>();
const workshopClear=(x:number,z:number,margin:number)=>Math.abs(x-WORKSHOP_CLEARANCE.x)<WORKSHOP_CLEARANCE.hx+margin&&Math.abs(z-WORKSHOP_CLEARANCE.z)<WORKSHOP_CLEARANCE.hz+margin;
/** Versioned identity includes the world foundation and the original candidate index.
 * Neither collection nor streaming can move an anchor or consume a random draw. */
export function wildernessFeatures(identity:WildernessIdentity):readonly WildernessFeature[]{
 const {generation,seed}=identity;if((generation!==1&&generation!==2)||!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new RangeError('Invalid wilderness world identity');
 const key=`${generation}:${seed}`,old=cache.get(key);if(old)return old;
 const features:WildernessFeature[]=[],plan=generation===2?worldValley(seed):undefined;
 const id=(source:string,index:number)=>`world:${generation}:${seed}/wilderness:${source}:${index}`;
 const addTree=(source:WildernessFeature['source'],index:number,x:number,y:number,z:number,s:number,sourceId=id(source,index))=>{
  const featureId=id(source,index),base=plan?Math.min(y,...[-.175,.175].flatMap(dx=>[-.175,.175].map(dz=>valleyHeight(plan,x+dx,z+dz))))-.025:y,top=y+s*1.6;
  const solid=Object.freeze({featureId,x,y:(base+top)/2,z,hx:.175,hy:(top-base)/2,hz:.175});
  features.push(Object.freeze({id:featureId,sourceId,source,kind:'tree',x,y,z,treeScale:s,scale:Object.freeze({x:1,y:1,z:1}),color:'#6c6950',solids:Object.freeze([solid]),removable:false,harvestable:true}));
 };
 const addRock=(source:WildernessFeature['source'],index:number,x:number,y:number,z:number,radius:number,scale:WildernessPoint,color='#9bac8d',sourceId=id(source,index))=>{
  const featureId=id(source,index);features.push(Object.freeze({id:featureId,sourceId,source,kind:'rock',x,y,z,radius,scale:Object.freeze(scale),color,solids:Object.freeze([dodecahedronObstacle(featureId,x,y,z,radius,scale)]),removable:(source==='field-rock'||source==='decoration')&&radius<=.75,harvestable:source!=='cave-rock'}));
 };
 if(plan){
  for(const [index,d]of plan.decorations.entries())if(d.kind==='tree')addTree('decoration',index,d.x,d.y,d.z,d.height/4,d.id);else addRock('decoration',index,d.x,d.y+d.radius*.35,d.z,d.radius,{x:1,y:.65,z:1},'#9bac8d',d.id);
 }else{
  let n=seed>>>0;const rnd=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
  // Replay the original PlaneGeometry's vertex-color draws. Its conditional
  // river color consumes no first draw for x=-2,0,2; every vertex consumes tint.
  for(let zi=0;zi<57;zi++)for(let xi=0;xi<57;xi++){if(Math.abs(-56+xi*2)>=3)rnd();rnd();}
  for(let i=0;i<37;i++)for(const side of [-1,1]){const radius=.5+rnd()*.8,x=side*(3+rnd()*.8);addRock('river-rock',i*2+(side===1?1:0),x,.15,-48+i*2.7,radius,{x:1.2,y:.6,z:1},'#94a58a');}
  const objects=generateObjects(seed);
  for(let i=0;i<130;i++){
   const x=(rnd()-.5)*96,z=(rnd()-.5)*96;
   if(withinBuildArea(x,z,.75)||Math.abs(x)<6||Math.abs(z-2)<4||Math.hypot(x+16,z+4)<14||Math.hypot(x-21,z+16)<11||Math.hypot(x+13,z-12)<4||objects.some(o=>Math.hypot(x-o.x,z-o.z)<3))continue;
   const size=.9+rnd()*1.6;if(workshopClear(x,z,1))continue;addTree('tree',i,x,0,z,size);
  }
  // Mountains consume four draws each even though they are outside the walkable
  // world. Do not restart the stream before the old small-stone field.
  for(let i=0;i<34*4;i++)rnd();
  for(let i=0;i<90;i++){const x=(rnd()-.5)*85,z=(rnd()-.5)*85;if(Math.abs(x)<4||withinBuildArea(x,z,.5))continue;const radius=.25+rnd()*.5;if(workshopClear(x,z,.5))continue;addRock('field-rock',i,x,.12,z,radius,{x:1,y:.55,z:1});}
 }
 const cave=plan?.endpoints.entrance??{x:-18,y:0,z:-26},cy=plan?valleyHeight(plan,cave.x,cave.z):0;
 for(let i=0;i<7;i++){const a=i/6*Math.PI;addRock('cave-rock',i,cave.x+Math.cos(a)*4,cy+Math.sin(a)*4,cave.z-3,2.3,{x:1,y:1,z:.8},'#526c61');}
 const result=Object.freeze(features);if(cache.size>=8)cache.clear();cache.set(key,result);return result;
}
/** Core catalog stays pinned; regional queries materialize only the requested neighborhood. */
export function wildernessFeaturesNear(identity:WildernessIdentity,x:number,z:number,radiusChunks=1):readonly WildernessFeature[]{
 if(!identity.regional)return wildernessFeatures(identity);
 if(identity.generation!==2||identity.regional.version!==1||!Number.isFinite(x)||!Number.isFinite(z))return [];
 const radius=CHUNK_SIZE*(Math.max(0,Math.min(3,Math.floor(radiusChunks)))+1)+8;
 const core=wildernessFeatures(identity).filter(f=>Math.abs(f.x-x)<=radius&&Math.abs(f.z-z)<=radius);
 return [...core,...regionalFeaturesNear(identity.seed,x,z,radiusChunks)];
}
/** Only canonical source IDs generate a chunk, and never more than that one chunk. */
export function wildernessFeatureById(identity:WildernessIdentity,id:string):WildernessFeature|undefined {
 if(typeof id!=='string'||id.length>160)return undefined;
 if(id.startsWith('region:'))return identity.generation===2&&identity.regional?.version===1?regionalFeatureById(identity.seed,id):undefined;
 return wildernessFeatures(identity).find(f=>f.id===id);
}
// Weak keys let obsolete snapshots disappear with their owners. Only frozen
// arrays of primitive data-property IDs are reusable; mutable arrays and getters
// are observed afresh so a changed caller cannot retain stale membership.
const membershipCache=new WeakMap<readonly string[],ReadonlySet<string>>();let membershipBuilds=0;
export function wildernessMembershipCacheStats(){return {builds:membershipBuilds,maxIds:REGIONAL_MAX_FEATURES+1000};}
export function wildernessHarvested(state:WildernessProjection|undefined,id:string):boolean {
 const ids=state?.harvested;if(!Array.isArray(ids))return false;
 const old=membershipCache.get(ids);if(old)return old.has(id);
 if(Object.isFrozen(ids)&&ids.length<=REGIONAL_MAX_FEATURES+1000){
  const values=new Set<string>();let immutable=true;
  for(let i=0;i<ids.length;i++){const descriptor=Object.getOwnPropertyDescriptor(ids,String(i));if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='string'){immutable=false;break;}values.add(descriptor.value);}
  if(immutable){membershipCache.set(ids,values);membershipBuilds++;return values.has(id);}
 }
 return Array.prototype.includes.call(ids,id);
}
/** Nearby regional structure and resource solids, with persisted removal projected atomically. */
export function wildernessObstaclesNear(identity:WildernessIdentity,x:number,z:number,state?:WildernessProjection):WildernessObstacle[]{
 if(!identity.regional)return wildernessObstacles(identity,state);
 const core=wildernessFeatures(identity).filter(f=>Math.abs(f.x-x)<=CHUNK_SIZE*2+8&&Math.abs(f.z-z)<=CHUNK_SIZE*2+8).flatMap(f=>wildernessFeatureObstacles(f,state));
 return [...core,...regionalObstaclesNear(identity.seed,x,z).filter(o=>!o.featureId||!wildernessHarvested(state,o.featureId)||!wildernessFeatureById(identity,o.featureId)?.removable)];
}
export const wildernessFeatureDepleted=(feature:WildernessFeature,state?:WildernessProjection)=>wildernessHarvested(state,feature.id);
export const wildernessFeatureRemaining=(feature:WildernessFeature,state?:WildernessProjection)=>!(feature.removable&&wildernessFeatureDepleted(feature,state));
export const wildernessFeatureObstacles=(feature:WildernessFeature,state?:WildernessProjection):readonly WildernessObstacle[]=>wildernessFeatureRemaining(feature,state)?feature.solids:[];
export const wildernessObstacles=(identity:WildernessIdentity,state?:WildernessProjection):WildernessObstacle[]=>wildernessFeatures(identity).flatMap(f=>wildernessFeatureObstacles(f,state));
export function nearestWildernessSolidPoint(feature:WildernessFeature,point:WildernessPoint):WildernessPoint&{distance:number}{
 let nearest={x:feature.x,y:feature.y,z:feature.z,distance:Infinity};for(const o of feature.solids){const p=nearestObstaclePoint(o,point);if(p.distance<nearest.distance)nearest=p;}return nearest;
}
export function closestWildernessFeature(identity:WildernessIdentity,point:WildernessPoint,maxDistance=3.5,state?:WildernessProjection):WildernessFeature|undefined{
 let nearest:WildernessFeature|undefined,distance=maxDistance;
 for(const f of wildernessFeaturesNear(identity,point.x,point.z)){if(!f.harvestable||wildernessFeatureDepleted(f,state))continue;const d=nearestWildernessSolidPoint(f,point).distance;if(d<=distance){nearest=f;distance=d;}}return nearest;
}
