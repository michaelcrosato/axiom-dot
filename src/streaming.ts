import {wildernessHarvested} from './wilderness.ts';
import type {State,WorldObject} from './world.ts';
export const CELL_SIZE=16;
export const cellAt=(x:number,z:number)=>({x:Math.floor(x/CELL_SIZE),z:Math.floor(z/CELL_SIZE)});
export const cellKey=(x:number,z:number)=>`${x}:${z}`;
export const ownerOf=(p:{x:number;z:number})=>{const c=cellAt(p.x,p.z);return cellKey(c.x,c.z);};
/** Global coordinates make a border the same contract whichever neighbour requests it. */
export function borderId(x:number,z:number,side:'north'|'south'|'east'|'west'){
 if(side==='north'||side==='south')return `edge:h:${x}:${z+(side==='south'?1:0)}`;
 return `edge:v:${x+(side==='east'?1:0)}:${z}`;
}
export const semanticId=(seed:number,id:string)=>`world:1:${seed}/entity:${id}`;
export interface ResidentCell {key:string;x:number;z:number;revision:number;content:string}
export interface CellDelta {loaded:ResidentCell[];unloaded:ResidentCell[];changed:ResidentCell[]}
/** Bounded metadata catalog; resident render/physics resources are owned outside this class.
 * Saves remain authoritative even when the owner is absent. No transient residency is saved.
 */
export class CellStreamer {
 readonly active=new Map<string,ResidentCell>();
 readonly catalog=new Map<string,{x:number;z:number;objects:WorldObject[]}>();
 private revision=0;
 constructor(objects:readonly WorldObject[],extraPositions:readonly {x:number;z:number}[]=[]){
  for(const o of [...objects,...extraPositions]){const c=cellAt(o.x,o.z),key=cellKey(c.x,c.z);if(!this.catalog.has(key))this.catalog.set(key,{...c,objects:[]});}
  for(const o of objects)this.catalog.get(ownerOf(o))!.objects.push(o);
 }
 update(x:number,z:number,state:State,radius=2):CellDelta {
  const center=cellAt(x,z),result:CellDelta={loaded:[],unloaded:[],changed:[]};
  for(const [key,cell] of this.active){
   if(Math.max(Math.abs(center.x-cell.x),Math.abs(center.z-cell.z))>radius+1){this.active.delete(key);result.unloaded.push({...cell,revision:++this.revision});}
  }
  for(const [key,c] of this.catalog){
   const old=this.active.get(key);
   if(!old&&Math.max(Math.abs(center.x-c.x),Math.abs(center.z-c.z))>radius)continue;
   const content=JSON.stringify(c.objects.map(o=>[o.id,state.collected.includes(o.id),state.defeated.includes(o.id),wildernessHarvested(state.wilderness,o.id),o.kind==='pump'||o.kind==='settlement'?state.waterRestored:false]));
   if(!old||old.content!==content){const cell={key,x:c.x,z:c.z,revision:++this.revision,content};this.active.set(key,cell);(old?result.changed:result.loaded).push(cell);}
  }
  return result;
 }
}
