import type {State} from './world.ts';
import type {ComboState,CombatObstacle} from './combat.ts';
import {wildernessFeaturesNear,wildernessFeatureRemaining,nearestWildernessSolidPoint,wildernessSegmentClear,type WildernessPoint,type WildernessObstacle} from './wilderness.ts';
export interface WildernessStrike {id:string;kind:'tree'|'rock';point:WildernessPoint}
/** Physical feedback follows the committed staff window. Only explicit gathering awards goods. */
export function resolveWildernessStrikes(combo:ComboState,world:Pick<State,'generation'|'seed'|'zone'|'wilderness'|'regional'>,player:WildernessPoint,obstacles:readonly CombatObstacle[]):{state:ComboState;hits:WildernessStrike[]}{
 const hits:WildernessStrike[]=[];
 if(world.zone!=='valley'||combo.phase!=='active'||!combo.attack||!combo.stage||![player.x,player.y,player.z,combo.facing].every(Number.isFinite))return {state:combo,hits};
 const origin={x:player.x,y:player.y+.85,z:player.z},hitIds=new Set(combo.hitIds),fx=Math.sin(combo.facing),fz=Math.cos(combo.facing),limit=Math.cos(combo.attack.arc/2);
 for(const feature of wildernessFeaturesNear(world,player.x,player.z)){
  if(hitIds.has(feature.id)||!wildernessFeatureRemaining(feature,world.wilderness))continue;
  // Broad-phase before exact convex triangle distance.
  if(Math.hypot(feature.x-player.x,feature.z-player.z)>combo.attack.range+(feature.radius??.3)*Math.max(feature.scale.x,feature.scale.z)+.1)continue;
  const point=nearestWildernessSolidPoint(feature,origin);if(point.distance>combo.attack.range)continue;
  const dx=point.x-player.x,dz=point.z-player.z,horizontal=Math.hypot(dx,dz);if(horizontal>1e-8&&(dx*fx+dz*fz)/horizontal<limit)continue;
  const blocking=obstacles.filter(o=>o.featureId!==feature.id).map(o=>({...o,hy:o.hy??10000})) as WildernessObstacle[];
  if(!wildernessSegmentClear(origin,point,blocking))continue;
  hitIds.add(feature.id);hits.push({id:feature.id,kind:feature.kind,point:{x:point.x,y:point.y,z:point.z}});
 }
 return {state:hits.length?{...combo,hitIds:[...hitIds]}:combo,hits};
}
