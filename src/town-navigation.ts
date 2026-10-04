/** Achieved town movement. This is the only resident/body solver for navigated life.
 * Presentation replays its accepted trace; it never changes these coordinates. */
import type {TownPlan,TownBox} from './starting-town.ts';
import type {TownLifeActionKind,TownLifeFacility} from './town-life.ts';

export interface TownNavigationPoint {x:number;z:number}
export interface TownMotionPoint extends TownNavigationPoint {t:number}
export interface TownNavigationActor extends TownNavigationPoint {id?:string;feetY?:number}
export interface TownResidentNavigation {stage:number;blocked:number;goal:TownNavigationPoint|null;best:number;departure:TownNavigationPoint|null;detour:TownNavigationPoint|null;trace:number[]}
export interface TownLifeNavigation {version:1;resolved:boolean;residents:TownResidentNavigation[]}
export const TOWN_NAV_BODY_GAP=.64;
export const TOWN_NAV_STEP=.05;
export const TOWN_NAV_WALL_RADIUS=.56;

/** A work place is a small personal work area, with room to approach either side.
 * No collidable furniture belongs inside the returned work/approach envelope. */
export function townLifeSlotPoint(f:TownLifeFacility,slot:number):TownNavigationPoint {
 if(f.kind==='home')return {x:f.x+(slot-(f.capacity-1)/2)*1.75,z:f.z};
 const columns=f.kind==='square'?6:4,rows=Math.ceil(f.capacity/columns);
 return {x:f.x+(f.kind==='well'?-4:0)+((slot%columns)-(columns-1)/2)*2.5,z:f.z+Math.floor(slot/columns)*2.5-(rows>3?.2:0)};
}
export function townLifeTaskStages(a:TownLifeActionKind){return ['garden','draw-water','cook','craft','maintain','leisure','socialize'].includes(a)?3:1;}
/** Fetch/work/put-away points preserve the purpose of the current paid activity.
 * Meals, washing, rest and conversations use different real places as well. */
export function townLifeTaskPoint(f:TownLifeFacility,slot:number,a:TownLifeActionKind,stage=0):TownNavigationPoint {
 const p=townLifeSlotPoint(f,slot),home=f.kind==='home',side=Math.sign(f.z-f.roadZ)||1;
 if(townLifeTaskStages(a)>1){const offsets=home?[[-.12,-.58],[.12,.36],[-.12,.3]]:[[-.48,-.4],[.48,.4],[-.4,.5]],q=offsets[Math.max(0,Math.min(2,stage))]!;return {x:Math.round((p.x+q[0]!)*1e8)/1e8,z:Math.round((p.z+q[1]!*(home?side:1))*1e8)/1e8};}
 const q=a==='rest'?[0,.4]:a==='eat'?[-.22,-.55]:a==='wash'?[.24,.18]:a==='recover'?[.2,.35]:[0,-.4];
 return {x:Math.round((p.x+q[0]!)*1e8)/1e8,z:Math.round((p.z+q[1]!*(home?side:1))*1e8)/1e8};
}
export function townLifeDeparturePoint(f:TownLifeFacility,from:TownNavigationPoint):TownNavigationPoint {
 const dz=f.roadZ-from.z;
 return {x:from.x,z:from.z+Math.sign(dz||-1)*Math.min(2.3,Math.max(1.2,Math.abs(dz)))};
}
const workAreas=new WeakMap<TownLifeFacility,{minX:number;maxX:number;minZ:number;maxZ:number}>();
export function townLifeWorkArea(f:TownLifeFacility){
 const found=workAreas.get(f);if(found)return found;
 const points=Array.from({length:f.capacity},(_,slot)=>townLifeSlotPoint(f,slot));
 const area={minX:Math.min(...points.map(p=>p.x))-.6,maxX:Math.max(...points.map(p=>p.x))+.6,minZ:Math.min(...points.map(p=>p.z))-.6,maxZ:Math.max(...points.map(p=>p.z))+.6};workAreas.set(f,area);return area;
}

const grids=new WeakMap<TownPlan,Map<string,TownBox[]>>();
function solids(plan:TownPlan,from:TownNavigationPoint,to:TownNavigationPoint){
 let grid=grids.get(plan);if(!grid){grid=new Map();for(const b of plan.boxes){if(!b.solid||b.center.y-b.half.y>=7.9||b.center.y+b.half.y<=6.04)continue;for(let x=Math.floor((b.center.x-b.half.x-.6)/4);x<=Math.floor((b.center.x+b.half.x+.6)/4);x++)for(let z=Math.floor((b.center.z-b.half.z-.6)/4);z<=Math.floor((b.center.z+b.half.z+.6)/4);z++){const key=x+','+z,list=grid.get(key);if(list)list.push(b);else grid.set(key,[b]);}}grids.set(plan,grid);}
 const x0=Math.floor(Math.min(from.x,to.x)/4),x1=Math.floor(Math.max(from.x,to.x)/4),z0=Math.floor(Math.min(from.z,to.z)/4),z1=Math.floor(Math.max(from.z,to.z)/4);
 if(x0===x1&&z0===z1)return grid.get(x0+','+z0)??[];
 const out=new Set<TownBox>();for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)for(const b of grid.get(x+','+z)??[])out.add(b);return out;
}
/** Same swept circle/box contract as townPathClear, spatially indexed for substeps. */
export function townNavigationClear(plan:TownPlan,from:TownNavigationPoint,to:TownNavigationPoint){
 if(Math.abs(to.x-plan.center.x)>54.9||Math.abs(to.z-plan.center.z)>47.9)return false;
 for(const b of solids(plan,from,to)){let lo=0,hi=1;for(const axis of ['x','z'] as const){const d=to[axis]-from[axis],min=b.center[axis]-b.half[axis]-TOWN_NAV_WALL_RADIUS-.02,max=b.center[axis]+b.half[axis]+TOWN_NAV_WALL_RADIUS+.02;if(Math.abs(d)<1e-12){if(from[axis]<=min||from[axis]>=max){lo=2;break;}}else{const a=(min-from[axis])/d,c=(max-from[axis])/d;lo=Math.max(lo,Math.min(a,c));hi=Math.min(hi,Math.max(a,c));}}if(lo<=hi&&lo<=1&&hi>=0)return false;}return true;
}
const cell=(p:TownNavigationPoint)=>Math.floor(p.x/2)+','+Math.floor(p.z/2);
function gridOf(bodies:readonly TownNavigationPoint[]){const grid=new Map<string,number[]>();bodies.forEach((p,i)=>{const k=cell(p),list=grid.get(k);if(list)list.push(i);else grid.set(k,[i]);});return grid;}
function near(grid:Map<string,number[]>,p:TownNavigationPoint){const indices:number[]=[],x=Math.floor(p.x/2),z=Math.floor(p.z/2);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)indices.push(...grid.get((x+dx)+','+(z+dz))??[]);return indices;}
export function townNavigationWorkClear(bodies:readonly TownNavigationPoint[],actors:readonly TownNavigationActor[]=[]){
 const grid=gridOf(bodies),active=actors.filter(a=>(a.feetY??6)>4.1&&(a.feetY??6)<7.8);
 return bodies.map((p,i)=>!near(grid,p).some(j=>j!==i&&Math.hypot(p.x-bodies[j]!.x,p.z-bodies[j]!.z)<TOWN_NAV_BODY_GAP-1e-7)&&!active.some(a=>Math.hypot(p.x-a.x,p.z-a.z)<.72-1e-7));
}
function segmentDistance(a:TownNavigationPoint,b:TownNavigationPoint,p:TownNavigationPoint){const dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/l)):0;return Math.hypot(a.x+dx*t-p.x,a.z+dz*t-p.z);}
/** A bounded visibility graph supplies a real escape around a standing group.
 * Steering alone must not orbit a blocked line forever. This runs only after
 * measured progress has stopped, never once per rendered frame. */
export function townNavigationDetour(plan:TownPlan,from:TownNavigationPoint,goal:TownNavigationPoint,bodies:readonly TownNavigationPoint[],index:number,actors:readonly TownNavigationActor[]=[]):TownNavigationPoint|null {
 const obstacles=[...bodies.filter((_,i)=>i!==index).map(p=>({p,gap:TOWN_NAV_BODY_GAP+.04})),...actors.filter(a=>(a.feetY??6)>4.1&&(a.feetY??6)<7.8).map(p=>({p,gap:.76}))].filter(o=>Math.hypot(o.p.x-from.x,o.p.z-from.z)<6).sort((a,b)=>Math.hypot(a.p.x-from.x,a.p.z-from.z)-Math.hypot(b.p.x-from.x,b.p.z-from.z)).slice(0,14);
 const clear=(a:TownNavigationPoint,b:TownNavigationPoint)=>townNavigationClear(plan,a,b)&&obstacles.every(o=>segmentDistance(a,b,o.p)>=Math.min(o.gap,Math.hypot(a.x-o.p.x,a.z-o.p.z)-1e-6)-1e-7);
 if(clear(from,goal))return null;
 const nodes:TownNavigationPoint[]=[from,goal];
 for(const o of obstacles)for(let a=0;a<8;a++){const angle=a*Math.PI/4,p={x:Math.round((o.p.x+Math.sin(angle)*(o.gap+.23))*1e7)/1e7,z:Math.round((o.p.z+Math.cos(angle)*(o.gap+.23))*1e7)/1e7};if(townNavigationClear(plan,p,p)&&obstacles.every(q=>Math.hypot(p.x-q.p.x,p.z-q.p.z)>=q.gap))nodes.push(p);}
 const distance=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),closed=new Set<number>();distance[0]=0;
 for(let step=0;step<nodes.length;step++){
  let at=-1,best=Infinity;for(let i=0;i<nodes.length;i++){const h=Math.hypot(nodes[i]!.x-goal.x,nodes[i]!.z-goal.z),score=distance[i]!+h;if(!closed.has(i)&&score<best){best=score;at=i;}}
  if(at<0)return null;if(at===1){let next=1;while(previous[next]!==0&&previous[next]!==-1)next=previous[next]!;return next===1?null:{...nodes[next]!};}
  closed.add(at);for(let j=1;j<nodes.length;j++){if(closed.has(j))continue;const d=distance[at]!+Math.hypot(nodes[j]!.x-nodes[at]!.x,nodes[j]!.z-nodes[at]!.z);if(d>=distance[j]!-1e-8||!clear(nodes[at]!,nodes[j]!))continue;distance[j]=d;previous[j]=at;}
 }
 return null;
}
interface MovingBody extends TownNavigationPoint {facing:number}
/** All proposals are bounded, swept against existing bodies and committed in
 * rotating order. Existing overlapping legacy poses may only move apart. */
export function advanceTownNavigation(plan:TownPlan,bodies:MovingBody[],targets:readonly (TownNavigationPoint|null)[],speeds:readonly number[],dt:number,turn:number,actors:readonly TownNavigationActor[]=[]){
 const grid=gridOf(bodies),travel=Array(bodies.length).fill(0) as number[],activeActors=actors.filter(a=>(a.feetY??6)>4.1&&(a.feetY??6)<7.8);
 for(let n=0;n<bodies.length;n++){
  const i=(n+turn)%bodies.length,p=bodies[i]!,target=targets[i],neighbors=near(grid,p).filter(j=>j!==i),obstacles=[...neighbors.map(j=>({p:bodies[j]!,gap:TOWN_NAV_BODY_GAP})),...activeActors.map(p=>({p,gap:.72}))];
  let overlapX=0,overlapZ=0,overlaps=0;
  for(const o of obstacles){const dx=p.x-o.p.x,dz=p.z-o.p.z,d=Math.hypot(dx,dz);if(d<o.gap-1e-6){const angle=(i*2.399963+turn*.00001),nx=d>1e-7?dx/d:Math.cos(angle),nz=d>1e-7?dz/d:Math.sin(angle);overlapX+=nx*(o.gap-d+.03);overlapZ+=nz*(o.gap-d+.03);overlaps++;}}
  if(!target&&!overlaps)continue;
  let dx=target?target.x-p.x:0,dz=target?target.z-p.z:0,d=Math.hypot(dx,dz),stride=Math.min(d,(speeds[i]??1.8)*dt);
  if(overlaps){dx=overlapX;dz=overlapZ;d=Math.hypot(dx,dz);stride=Math.min(2.2*dt,d);}
  if(d<1e-9)continue;const ux=dx/d,uz=dz/d;
  const valid=(q:TownNavigationPoint)=>townNavigationClear(plan,p,q)&&obstacles.every(o=>{const before=Math.hypot(p.x-o.p.x,p.z-o.p.z),after=Math.hypot(q.x-o.p.x,q.z-o.p.z);return before<o.gap-1e-6?after>=before+Math.min(.000001,stride*.001):segmentDistance(p,q,o.p)>=o.gap-1e-7;});
  let next:TownNavigationPoint|null=null;const direct={x:p.x+ux*stride,z:p.z+uz*stride};
  if(valid(direct))next=direct;
  else {
   // Keep to one's own right while passing. A shared orientation rather than
   // resident parity lets opposing walkers select opposite world-space lanes.
   const angles=[-.38,.38,-.8,.8,-1.2,1.2,-1.57,1.57,-2.1,2.1,Math.PI];
   let best=-Infinity;for(const angle of angles){const c=Math.cos(angle),s=Math.sin(angle),q={x:p.x+(ux*c-uz*s)*stride,z:p.z+(ux*s+uz*c)*stride};if(!valid(q))continue;const progress=target?d-Math.hypot(target.x-q.x,target.z-q.z):0,clearance=obstacles.reduce((m,o)=>Math.min(m,Math.hypot(q.x-o.p.x,q.z-o.p.z)-o.gap),2),score=progress+Math.min(.4,clearance)*.18+(angle<0?.012:0);if(score>best){best=score;next=q;}}
  }
  if(!next)continue;
  const oldCell=cell(p),moved=Math.hypot(next.x-p.x,next.z-p.z);if(moved<1e-9)continue;p.facing=Math.round(Math.atan2(next.x-p.x,next.z-p.z)*1e8)/1e8;p.x=Math.round(next.x*1e8)/1e8;p.z=Math.round(next.z*1e8)/1e8;travel[i]=moved;
  const newCell=cell(p);if(oldCell!==newCell){const old=grid.get(oldCell)!;old.splice(old.indexOf(i),1);const list=grid.get(newCell);if(list)list.push(i);else grid.set(newCell,[i]);}
 }
 let resolved=true;for(let i=0;i<bodies.length;i++){const p=bodies[i]!;if(near(grid,p).some(j=>j>i&&Math.hypot(p.x-bodies[j]!.x,p.z-bodies[j]!.z)<.6-1e-6)||activeActors.some(a=>Math.hypot(p.x-a.x,p.z-a.z)<.66-1e-6)){resolved=false;break;}}
 return {travel,resolved};
}
