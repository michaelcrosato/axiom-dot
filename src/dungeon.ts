import type {WorldObject} from './world.ts';
export const CAVE_ENTRANCE={x:-18,z:-25};
export const CAVE_RETURN={x:-18,z:-23};
export const DUNGEON_SPAWN={x:0,z:24};
export interface Wall {x:number;z:number;hx:number;hz:number;hy:number}
/** Versioned grid grammar: connected chambers carved before walls. No random load-order inputs. */
export function generateDungeon(seed:number){
 let n=(seed^0xa710cafe)>>>0;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
 const side=random()<.5?-1:1;
 const rooms=[{x:0,z:24,name:'Threshold'},{x:0,z:8,name:'Watch chamber'},{x:side*16,z:8,name:'Supply vault'},{x:0,z:-8,name:'Echo gallery'},{x:side*-16,z:-8,name:'Core sanctum'}];
 const tiles=new Map<string,{x:number;z:number}>();const carve=(x:number,z:number)=>tiles.set(`${x}:${z}`,{x,z});
 for(const r of rooms)for(let x=-4;x<=4;x+=2)for(let z=-4;z<=4;z+=2)carve(r.x+x,r.z+z);
 const links=[[0,1],[1,2],[1,3],[3,4]];
 for(const [a,b] of links){const p=rooms[a!]!,q=rooms[b!]!;for(let x=Math.min(p.x,q.x);x<=Math.max(p.x,q.x);x+=2)for(let z=Math.min(p.z,q.z);z<=Math.max(p.z,q.z);z+=2)carve(x,z);}
 const walls:Wall[]=[];for(const t of tiles.values())for(const [dx,dz] of [[2,0],[-2,0],[0,2],[0,-2]])if(!tiles.has(`${t.x+dx!}:${t.z+dz!}`))walls.push({x:t.x+dx!/2,z:t.z+dz!/2,hx:dx?.12:1.12,hz:dz?.12:1.12,hy:1.5});
 const id=(s:string)=>`dungeon:1:${seed}:${s}`;
 const objects:WorldObject[]=[{id:id('exit'),kind:'exit',...DUNGEON_SPAWN,label:'Return to Verdant Reach'}];
 for(const i of [1,3,4]){const r=rooms[i]!;objects.push({id:id(`sentry-${i}`),kind:'enemy',x:r.x,z:r.z,label:'Vault sentinel'});}
 for(const [i,kind] of [[2,'scrap'],[3,'water'],[4,'core']] as const){const r=rooms[i]!;objects.push({id:id(`cache-${i}`),kind,x:r.x+2,z:r.z-2,label:kind==='core'?'Sanctum power core':kind==='water'?'Vault water reserve':'Ancient salvage'});}
 return {version:1,rooms,tiles:[...tiles.values()],walls,objects};
}
export function dungeonWalkable(seed:number,x:number,z:number){const dungeon=generateDungeon(seed);return dungeon.tiles.some(t=>Math.abs(t.x-x)<=1&&Math.abs(t.z-z)<=1)&&!dungeon.walls.some(w=>Math.abs(w.x-x)<w.hx+.34&&Math.abs(w.z-z)<w.hz+.34);}
