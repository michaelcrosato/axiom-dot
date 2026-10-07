import {TOWN_CENTER} from './starting-town.ts';
import {hashSeed} from './procedural.ts';
import type {MovableBody,Vec3} from './player-contact.ts';

/** Optional new-world geometry. Never substituted for an occupied town plan.
 * The rear yards sit beyond every resident route/work/egress envelope (z <= 53.4).
 * Crates remain in their individual yards, including after save/import. */
export const TOWN_YARDS_VERSION=1;
export const TOWN_YARD_NAMES=['Salvage sorting yard','Market packing yard','Trail loading yard'] as const;
export function townYardBounds(index:number){return {minX:TOWN_CENTER.x-30+index*30-7,maxX:TOWN_CENTER.x-30+index*30+7,minZ:TOWN_CENTER.z+55.3,maxZ:TOWN_CENTER.z+61};}
export function townYardIndex(id:string){const match=/^town-yard-crate-([0-2])$/.exec(id);return match?Number(match[1]):-1;}
export function constrainTownCrate(spec:MovableBody,p:Vec3):Vec3{
 const index=townYardIndex(spec.id);if(index<0)return p;const b=townYardBounds(index),skin=.04;
 return {x:Math.max(b.minX+spec.hx+skin,Math.min(b.maxX-spec.hx-skin,p.x)),y:p.y,z:Math.max(b.minZ+spec.hz+skin,Math.min(b.maxZ-spec.hz-skin,p.z))};
}
export function townYards(seed:number){
 const yards=TOWN_YARD_NAMES.map((name,index)=>{
  const random=hashSeed(`${seed}/town-yard/${index}`)/0xffffffff,x=TOWN_CENTER.x-30+index*30,z=TOWN_CENTER.z+58.1+(random-.5)*.7;
  const crate:MovableBody={id:`town-yard-crate-${index}`,x:x-3.8+(random-.5),y:6.57,z:z-.5,hx:.58,hy:.55,hz:.58};
  const ledge={x:x+2.1,y:7.2,z:z+.65,hx:1.8,hy:1.2,hz:1.25};
  const step={x:x-1,y:6.15,z:z+.65,hx:.65,hy:.15,hz:1.25};
  // Purposeful, gently dog-legged rear access. These are ground markings, not walls.
  const road=[{x:TOWN_CENTER.x,z:TOWN_CENTER.z+54.5},{x:x*.5+TOWN_CENTER.x*.5,z:TOWN_CENTER.z+54.7+random*.2},{x,z:z-1.9}];
  return {name,index,crate,ledge,step,road,bounds:townYardBounds(index)};
 });
 return {version:TOWN_YARDS_VERSION,yards,crates:yards.map(y=>y.crate),obstacles:yards.flatMap(y=>[y.ledge,y.step])};
}
