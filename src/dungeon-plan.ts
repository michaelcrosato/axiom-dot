import {seedSample} from './procedural.ts';
import type {WorldObject} from './world.ts';
import type {Wall} from './dungeon.ts';
export interface DungeonPoint {x:number;z:number}
export interface DungeonRoom extends DungeonPoint {id:string;name:string;hx:number;hz:number;role:'threshold'|'chamber'|'sanctum'}
export interface DungeonEdge {id:string;from:string;to:string;width:number;points:DungeonPoint[]}
export interface DungeonObjective {id:string;objectId:string;roomId:string;kind:'exit'|'scrap'|'water'|'core'|'enemy'}
export interface DungeonPlan {
 version:2;seed:number;bound:number;spawn:DungeonPoint;rooms:DungeonRoom[];tiles:DungeonPoint[];walls:Wall[];objects:WorldObject[];
 edges:DungeonEdge[];graph:{entry:string;nodes:{id:string;neighbors:string[]}[];edges:{from:string;to:string}[]};objectives:DungeonObjective[];
 budget:{operations:number;maxOperations:number};
 constraints:{key:string;ok:boolean;message:string}[];
}
const freeze=<T>(v:T):T=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const item of Object.values(v))freeze(item);Object.freeze(v);}return v;};
export const DUNGEON_RECIPE_MANIFEST=freeze({id:'branching-echo-vault',version:2,algorithmRevision:1,stream:{hash:'seedSample/framework-1',version:2,owner:'dungeon',ordering:'named-path-purpose-index'},algorithms:{graph:'connected-best-frontier-on-bounded-lattice/independent-extra-cycle-selection',rooms:'independent-rectangular-tile-carving',corridors:'cardinal-adjacent-room-carving',walls:'exposed-tile-edge-cuboids',objectives:'graph-distance-ranked-caches/named-ranked-sentries'},bounds:{halfExtent:64,columns:4,rows:4,tileStep:2},ranges:{rooms:[7,12],extraLoops:[0,3],spacingX:[18,20,22,24],spacingZ:[18,20,22,24],roomHalfWidths:[2,4,6],roomHalfDepths:[2,4,6],corridorWidths:[2,6]},dimensions:{spawn:[0,24],wallHalfThickness:.12,wallHalfLength:1.12,wallHalfHeight:1.6,capsuleRadius:.34,cacheOffset:[2,-2]},resources:{scrap:1,water:1,core:1,enemies:3,exits:1},budgets:{rooms:12,edges:14,tiles:1100,walls:1600,objects:7,objectives:7,operations:20000}});
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;
/** Bounded room-graph grammar. A seeded connected frontier grows first; independent loops follow. */
export function generateDungeonPlan(seed:number):DungeonPlan {
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new RangeError('Dungeon seed must be an unsigned 32-bit integer');
 let operations=0;
 const sample=(path:string,purpose:string,index=0)=>seedSample(seed,2,'dungeon',path,purpose,index);
 const choose=(path:string,purpose:string,count:number)=>Math.floor(sample(path,purpose)*count);
 const id=(key:string)=>`dungeon:2:${seed}:${key}`;
 const spacingX=18+choose('layout','column-spacing',4)*2,spacingZ=18+choose('layout','row-spacing',4)*2;
 const target=7+choose('graph','room-count',6),start='1,0';
 const active=new Set([start]),links:[string,string][]=[];
 const neighbors=(key:string)=>{const [c,r]=key.split(',').map(Number) as [number,number];return [[c-1,r],[c+1,r],[c,r-1],[c,r+1]].filter(([x,z])=>x!>=0&&x!<4&&z!>=0&&z!<4).map(([x,z])=>`${x},${z}`).sort(order);};
 // A finite best-frontier selection creates branches without recursive rejection sampling.
 for(let slot=1;slot<target;slot++){
  const frontier=[...active].flatMap(a=>neighbors(a).filter(b=>!active.has(b)).map(b=>({a,b,rank:sample(`${a}/${b}`,'frontier',slot)}))).sort((a,b)=>a.rank-b.rank||order(a.b,b.b)||order(a.a,b.a));
  operations+=frontier.length;const edge=frontier[0]!;active.add(edge.b);links.push([edge.a,edge.b]);
 }
 const pair=(a:string,b:string)=>[a,b].sort(order).join('/');const accepted=new Set(links.map(([a,b])=>pair(a,b)));
 const extras=[...active].flatMap(a=>neighbors(a).filter(b=>active.has(b)&&order(a,b)<0&&!accepted.has(pair(a,b))).map(b=>({a,b,rank:sample(pair(a,b),'loop-priority')}))).sort((a,b)=>a.rank-b.rank||order(pair(a.a,a.b),pair(b.a,b.b)));
 const loopCount=Math.min(extras.length,choose('graph','loop-count',4));
 for(const edge of extras.slice(0,loopCount)){links.push([edge.a,edge.b]);accepted.add(pair(edge.a,edge.b));}
 const keys=[start,...[...active].filter(k=>k!==start).sort(order)];
 const rooms:DungeonRoom[]=keys.map(key=>{const [c,r]=key.split(',').map(Number) as [number,number];return {id:id(`room/${key}`),x:(c-1)*spacingX,z:24-r*spacingZ,hx:2+choose(key,'room-half-width',3)*2,hz:2+choose(key,'room-half-depth',3)*2,name:key===start?'Threshold':`Echo chamber ${c+1}.${r+1}`,role:key===start?'threshold':'chamber'};});
 const roomByKey=new Map(keys.map((key,i)=>[key,rooms[i]!]));
 const edges:DungeonEdge[]=links.map(([a,b])=>({id:id(`passage/${pair(a,b)}`),from:roomByKey.get(a)!.id,to:roomByKey.get(b)!.id,width:sample(pair(a,b),'corridor-width')<.55?2:6,points:[{x:roomByKey.get(a)!.x,z:roomByKey.get(a)!.z},{x:roomByKey.get(b)!.x,z:roomByKey.get(b)!.z}]})).sort((a,b)=>order(a.id,b.id));
 const tileMap=new Map<string,DungeonPoint>();const carve=(x:number,z:number)=>{operations++;return tileMap.set(`${x}:${z}`,{x,z});};
 for(const room of rooms)for(let x=-room.hx;x<=room.hx;x+=2)for(let z=-room.hz;z<=room.hz;z+=2)carve(room.x+x,room.z+z);
 for(const edge of edges){const a=edge.points[0]!,b=edge.points[1]!,half=(edge.width-2)/2;
  if(a.x===b.x)for(let z=Math.min(a.z,b.z);z<=Math.max(a.z,b.z);z+=2)for(let dx=-half;dx<=half;dx+=2)carve(a.x+dx,z);
  else for(let x=Math.min(a.x,b.x);x<=Math.max(a.x,b.x);x+=2)for(let dz=-half;dz<=half;dz+=2)carve(x,a.z+dz);
 }
 const tiles=[...tileMap.values()].sort((a,b)=>a.z-b.z||a.x-b.x),walls:Wall[]=[];
 for(const t of tiles)for(const [dx,dz] of [[2,0],[-2,0],[0,2],[0,-2]] as const)if(!tileMap.has(`${t.x+dx}:${t.z+dz}`))walls.push({x:t.x+dx/2,z:t.z+dz/2,hx:dx?.12:1.12,hz:dz?.12:1.12,hy:1.6});
 operations+=tiles.length*4;
 const graph={entry:rooms[0]!.id,nodes:rooms.map(r=>({id:r.id,neighbors:edges.filter(e=>e.from===r.id||e.to===r.id).map(e=>e.from===r.id?e.to:e.from).sort(order)})),edges:edges.map(e=>({from:e.from,to:e.to}))};
 const distances=new Map([[graph.entry,0]]),queue=[graph.entry];while(queue.length){const current=queue.shift()!;for(const next of graph.nodes.find(n=>n.id===current)!.neighbors)if(!distances.has(next)){distances.set(next,distances.get(current)!+1);queue.push(next);}}
 const deepest=rooms.slice(1).sort((a,b)=>distances.get(b.id)!-distances.get(a.id)!||order(a.id,b.id));deepest[0]!.role='sanctum';deepest[0]!.name='Core sanctum';
 const objects:WorldObject[]=[],objectives:DungeonObjective[]=[];
 const add=(key:string,kind:DungeonObjective['kind'],room:DungeonRoom,offset:DungeonPoint,label:string)=>{const objectId=id(key);objects.push({id:objectId,kind,x:room.x+offset.x,z:room.z+offset.z,label});objectives.push({id:id(`objective/${key}`),objectId,roomId:room.id,kind});};
 add('exit','exit',rooms[0]!,{x:0,z:0},'Return to Verdant Reach');
 for(const [i,kind]of ['core','water','scrap'].entries())add(`cache-${kind}`,kind as 'core'|'water'|'scrap',deepest[i]!,{x:2,z:-2},kind==='core'?'Sanctum power core':kind==='water'?'Vault water reserve':'Ancient salvage');
 const sentries=rooms.slice(1).sort((a,b)=>sample(a.id,'sentry-rank')-sample(b.id,'sentry-rank')||order(a.id,b.id)).slice(0,3);
 for(let i=0;i<sentries.length;i++)add(`sentry-${i}`,'enemy',sentries[i]!,{x:0,z:0},'Vault sentinel');
 const bound=64,spawn={x:0,z:24};operations+=objects.length*walls.length+edges.length*rooms.length;
 const constraints=[{key:'connected-room-graph',ok:distances.size===rooms.length,message:'Every chamber is reachable from the threshold'},
  {key:'bounded-geometry',ok:tiles.every(t=>Math.abs(t.x)+1.12<bound&&Math.abs(t.z)+1.12<bound),message:'All floors and walls fit the bounded dungeon'},
  {key:'bounded-room-program',ok:rooms.length>=7&&rooms.length<=12&&edges.length<=14,message:'At most twelve rooms and three extra loops'},
  {key:'objective-clearance',ok:objects.every(o=>!walls.some(w=>Math.abs(o.x-w.x)<w.hx+.34&&Math.abs(o.z-w.z)<w.hz+.34)),message:'Every objective has standing-capsule clearance'},
  {key:'output-budget',ok:tiles.length<=1100&&walls.length<=1600&&objects.length===7&&operations<=20000,message:'Declared tile, wall, object and planning-work budgets enforced'},
  {key:'identity-uniqueness',ok:new Set([...rooms,...edges,...objects,...objectives].map(o=>o.id)).size===rooms.length+edges.length+objects.length+objectives.length,message:'Room, passage, object and objective identities are unique'}];
 if(constraints.some(c=>!c.ok))throw new Error(`Rejected dungeon plan: ${constraints.filter(c=>!c.ok).map(c=>c.key).join(', ')}`);
 return freeze({version:2 as const,seed,bound,spawn,rooms,tiles,walls,objects,edges,graph,objectives,budget:{operations,maxOperations:20000},constraints});
}
export function dungeonPlanWalkable(planOrSeed:DungeonPlan|number,x:number,z:number,radius=.34):boolean {
 if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(radius)||radius<0)return false;
 const plan=typeof planOrSeed==='number'?generateDungeonPlan(planOrSeed):planOrSeed;
 return plan.tiles.some(t=>Math.abs(t.x-x)<=1&&Math.abs(t.z-z)<=1)&&!plan.walls.some(w=>Math.abs(w.x-x)<w.hx+radius&&Math.abs(w.z-z)<w.hz+radius);
}
