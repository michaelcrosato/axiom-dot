import {REGIONAL_MAX_FEATURES,regionalTownCleared} from './regional-world.ts';
import {wildernessFeatures,wildernessFeaturesNear,wildernessFeatureById,wildernessObstaclesNear,wildernessFeatureDepleted,nearestWildernessSolidPoint,wildernessSegmentClear,type WildernessFeature,type WildernessPlane} from './wilderness.ts';

/** A finite raw-material ledger, independent of machine salvage and every recipe. */
export interface WildernessState {
  version:1;
  generation:1|2;
  seed:number;
  harvested:string[];
  wood:number;
  stone:number;
}
export interface WildernessIdentity {generation:1|2;seed:number;regional?:{version:1}}
export interface WildernessQueryObstacle {
  x:number;z:number;hx:number;hz:number;y?:number;hy?:number;
  featureId?:string;convexVertices?:readonly number[];convexPlanes?:readonly WildernessPlane[];
}
export interface WildernessGatherContext extends WildernessIdentity {
  zone:string;
  player:{x:number;z:number;hp:number};
  wilderness?:WildernessState;
  /** Trusted physics/server feet elevation, never a field on the incoming action. */
  feetY:number;
  grounded?:boolean;
  obstacles:readonly WildernessQueryObstacle[];
}
export const WILDERNESS_GATHER_REACH=2.25;
export const WILDERNESS_HAND_HEIGHT=.85;

function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function exact(value:Record<string,unknown>,keys:readonly string[]):boolean {
  const prototype=Object.getPrototypeOf(value),actual=Reflect.ownKeys(value);
  return (prototype===Object.prototype||prototype===null)&&actual.length===keys.length&&actual.every(key=>typeof key==='string'&&keys.includes(key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)!,'value'));
}
function validIdentity(identity:WildernessIdentity):boolean{return (identity.generation===1||identity.generation===2)&&Number.isInteger(identity.seed)&&identity.seed>=0&&identity.seed<=0xffffffff&&(!Object.hasOwn(identity,'regional')||object(identity.regional)&&identity.generation===2&&identity.regional.version===1&&exact(identity.regional,['version']));}
// Only objects constructed here enter this cache: both the ledger and the complete
// primitive-ID array are frozen. Mutable caller objects, accessors and forged
// counters can never acquire a reusable validation verdict.
const immutableLedgers=new WeakMap<WildernessState,string>();
const identityKey=(identity:WildernessIdentity)=>`${identity.generation}:${identity.seed}:${identity.regional?.version??0}`;
function sealKnownValid(state:WildernessState,identity:WildernessIdentity):WildernessState {
 const harvested:string[]=[];for(let i=0;i<state.harvested.length;i++)harvested.push(state.harvested[i]!);
 Object.freeze(harvested);const result={version:1 as const,generation:state.generation,seed:state.seed,harvested,wood:state.wood,stone:state.stone};
 Object.freeze(result);immutableLedgers.set(result,identityKey(identity));return result;
}
/** Import/network boundary: fully verify mutable input, then isolate an immutable
 * snapshot. Reuse an identical previous certified snapshot without source replay. */
export function immutableWildernessState(value:unknown,identity:WildernessIdentity,previous?:WildernessState):WildernessState {
 if(validIdentity(identity)&&object(value)&&exact(value,['version','generation','seed','harvested','wood','stone'])&&previous&&immutableLedgers.get(previous)===identityKey(identity)&&value.version===previous.version&&value.generation===previous.generation&&value.seed===previous.seed&&value.wood===previous.wood&&value.stone===previous.stone&&Array.isArray(value.harvested)&&value.harvested.length===previous.harvested.length){
  let same=true;for(let i=0;i<previous.harvested.length;i++){const d=Object.getOwnPropertyDescriptor(value.harvested,String(i));if(!d||!Object.hasOwn(d,'value')||d.value!==previous.harvested[i]){same=false;break;}}if(same)return previous;
 }
 if(!validWildernessState(value,identity))throw new Error('Invalid wilderness resource ledger');
 return immutableLedgers.get(value)===identityKey(identity)?value:sealKnownValid(value,identity);
}
export function createWildernessState(identity:WildernessIdentity):WildernessState {
  if(!validIdentity(identity))throw new RangeError('Invalid wilderness identity');
  return sealKnownValid({version:1,generation:identity.generation,seed:identity.seed,harvested:[],wood:0,stone:0},identity);
}
export function wildernessResourceLimits(identity:WildernessIdentity):{wood:number;stone:number}{
  const totals={wood:0,stone:0};
  for(const feature of wildernessFeatures(identity))if(feature.harvestable)totals[feature.kind==='tree'?'wood':'stone']++;
  // A conservative finite bound for each regional material, without generating the region.
  if(identity.regional){totals.wood+=REGIONAL_MAX_FEATURES;totals.stone+=REGIONAL_MAX_FEATURES;}
  return totals;
}
/** Replays every known source. No unknown keys, duplicate IDs, cross-world IDs or invented stock. */
export function validWildernessState(value:unknown,identity:WildernessIdentity):value is WildernessState {
  if(!validIdentity(identity)||!object(value))return false;
  if(immutableLedgers.get(value as unknown as WildernessState)===identityKey(identity))return true;
  const keys=['version','generation','seed','harvested','wood','stone'];
  if(!exact(value,keys)||
    value.version!==1||value.generation!==identity.generation||value.seed!==identity.seed||
    !Number.isSafeInteger(value.wood)||!Number.isSafeInteger(value.stone)||(value.wood as number)<0||(value.stone as number)<0||!Array.isArray(value.harvested))return false;
  const coreCapacity=wildernessFeatures(identity).length,capacity=coreCapacity+(identity.regional?REGIONAL_MAX_FEATURES:0);
  if(value.harvested.length>capacity||(value.wood as number)+(value.stone as number)!==value.harvested.length)return false;
  const seen=new Set<string>(),totals={wood:0,stone:0};
  for(let index=0;index<value.harvested.length;index++){
    const descriptor=Object.getOwnPropertyDescriptor(value.harvested,String(index)),id=descriptor?.value;
    if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof id!=='string'||seen.has(id))return false;
    const source=wildernessFeatureById(identity,id);if(!source?.harvestable)return false;
    seen.add(id);totals[source.kind==='tree'?'wood':'stone']++;
  }
  return totals.wood===value.wood&&totals.stone===value.stone;
}

export function validWildernessGatherAction(value:unknown):value is {type:'gather-wilderness';id:string}{
  return object(value)&&value.type==='gather-wilderness'&&typeof value.id==='string'&&value.id.length>0&&value.id.length<=160&&
    exact(value,['type','id']);
}
function validContext(context:WildernessGatherContext):boolean {
  return validIdentity(context)&&context.zone==='valley'&&context.grounded!==false&&[context.player.x,context.player.z,context.player.hp,context.feetY].every(Number.isFinite)&&context.player.hp>0&&
    (!Object.hasOwn(context,'wilderness')||validWildernessState(context.wilderness,context));
}
function withinSolidBounds(feature:WildernessFeature,point:{x:number;y:number;z:number}):boolean {
  // A lower bound only: exact convex distances and visibility still decide the result.
  return feature.solids.some(solid=>Math.hypot(Math.max(0,Math.abs(point.x-solid.x)-solid.hx),Math.max(0,Math.abs(point.y-(solid.y??solid.hy))-solid.hy),Math.max(0,Math.abs(point.z-solid.z)-solid.hz))<=WILDERNESS_GATHER_REACH);
}
function candidate(context:WildernessGatherContext,feature:WildernessFeature):boolean {
  if(context.regional&&regionalTownCleared(context.seed,feature.x,feature.z))return false;
  if(!feature.harvestable||wildernessFeatureDepleted(feature,context.wilderness))return false;
  const hand={x:context.player.x,y:context.feetY+WILDERNESS_HAND_HEIGHT,z:context.player.z};
  if(!withinSolidBounds(feature,hand))return false;
  const closest=nearestWildernessSolidPoint(feature,hand);
  if(!Number.isFinite(closest.distance)||closest.distance>WILDERNESS_GATHER_REACH)return false;
  // The source is the endpoint, not an intervening wall. Depleted standing features still obstruct sight.
  const obstacles=[...context.obstacles,...wildernessObstaclesNear(context,context.player.x,context.player.z,context.wilderness)]
    .filter(obstacle=>obstacle.featureId!==feature.id)
    .map(obstacle=>({...obstacle,hy:obstacle.hy??1e6,y:obstacle.y??(obstacle.hy===undefined?0:obstacle.hy)}));
  return wildernessSegmentClear(hand,closest,obstacles);
}
export function canGatherWilderness(context:WildernessGatherContext,id:string):boolean {
  if(!validContext(context)||typeof id!=='string')return false;
  const feature=wildernessFeatureById(context,id);
  return !!feature&&candidate(context,feature);
}
/** Closest reachable solid surface wins, with stable IDs breaking exact distance ties. */
export function nearestGatherableWilderness(context:WildernessGatherContext):WildernessFeature|undefined {
  if(!validContext(context))return undefined;
  const hand={x:context.player.x,y:context.feetY+WILDERNESS_HAND_HEIGHT,z:context.player.z};
  return wildernessFeaturesNear(context,context.player.x,context.player.z)
    .filter(feature=>feature.harvestable&&!wildernessFeatureDepleted(feature,context.wilderness)&&withinSolidBounds(feature,hand))
    .map(feature=>({feature,distance:nearestWildernessSolidPoint(feature,hand).distance}))
    .filter(item=>item.distance<=WILDERNESS_GATHER_REACH)
    .sort((a,b)=>a.distance-b.distance||a.feature.id.localeCompare(b.feature.id))
    .find(item=>candidate(context,item.feature))?.feature;
}
/** A successful gather appends its source and grants exactly one raw material atomically. */
export function gatherWilderness(context:WildernessGatherContext,id:string):WildernessState|undefined {
  if(!canGatherWilderness(context,id))return context.wilderness;
  const previous=context.wilderness??createWildernessState(context),feature=wildernessFeatureById(context,id)!;
  const resource=feature.kind==='tree'?'wood':'stone';
  return sealKnownValid({...previous,harvested:[...previous.harvested,id],[resource]:previous[resource]+1},context);
}
