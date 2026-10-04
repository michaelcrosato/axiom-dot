/** Version 2 contact kernel. Legacy shared routes or current life snapshots, never a saved AI clock. */
import {startingTown,TOWN_CENTER,TOWN_BOUNDS,type TownPlan} from './starting-town.ts';
import {townResidents,townResidentPose,type TownResident,type TownResidentPose} from './town-residents.ts';
import {validTownLifePoses} from './town-life-projection.ts';
import {advanceTownNavigation,TOWN_NAV_BODY_GAP} from './town-navigation.ts';
export const TOWN_CROWD_VERSION=2;
export const TOWN_BODY_RADIUS=.30;
export const TOWN_WALL_RADIUS=.56;
export const TOWN_SPACING=.72;
export const TOWN_CROWD_HZ=20;
export const TOWN_NEIGHBOR_LIMIT=16;
/** Render-only budgets. Authority, worker stepping and save clocks are unchanged. */
export const TOWN_RENDER_TIMING=Object.freeze({version:1,maxFrameSeconds:.5,maxStepSeconds:.05,snapshotSeconds:.5,bufferSeconds:.5,networkReserveSeconds:.25,maxOnlineLeadSeconds:.5,resumeGapSeconds:1,maxSnapshots:6});
export interface TownActor {id:string;x:number;z:number;feetY?:number}
export interface CrowdPose extends TownResidentPose {speed:number;distance:number;yielding:boolean;originX?:number;originZ?:number}
type Point={x:number;z:number};
export const townClock=(causal?:{elapsed:number;accumulator:number})=>causal?causal.elapsed+causal.accumulator:0;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const smooth=(t:number)=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const yaw=(a:number,b:number,t:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
/** A tiny look-ahead only eases yaw, never cuts a path through a corner. */
function intent(resident:TownResident,plan:TownPlan,time:number):CrowdPose {
 const p=townResidentPose(resident,time,plan);
 return {...p,speed:p.speed??0,distance:p.distance??0,yielding:false};
}
const solidGrids=new WeakMap<TownPlan,Map<string,typeof planPlaceholder>>();
type SolidList=TownPlan['boxes'];const planPlaceholder=[] as SolidList;
function localSolids(plan:TownPlan,p:Point){let grid=solidGrids.get(plan);if(!grid){grid=new Map();for(const b of plan.boxes){if(!b.solid||b.center.y-b.half.y>=7.9||b.center.y+b.half.y<=6.04)continue;for(let x=Math.floor((b.center.x-b.half.x-.6)/4);x<=Math.floor((b.center.x+b.half.x+.6)/4);x++)for(let z=Math.floor((b.center.z-b.half.z-.6)/4);z<=Math.floor((b.center.z+b.half.z+.6)/4);z++){const key=`${x},${z}`,list=grid.get(key);if(list)list.push(b);else grid.set(key,[b]);}}solidGrids.set(plan,grid);}return grid.get(`${Math.floor(p.x/4)},${Math.floor(p.z/4)}`)??[];}
/** Circle/box depenetration; all dynamic spacing is clipped to real town solids. */
export function clearTownBody(plan:TownPlan,p:Point,radius=TOWN_WALL_RADIUS):Point {
 const out={...p};for(let pass=0;pass<3;pass++)for(const b of localSolids(plan,out)){
  const dx=out.x-b.center.x,dz=out.z-b.center.z,hx=b.half.x+radius+.025,hz=b.half.z+radius+.025;
  if(Math.abs(dx)<hx&&Math.abs(dz)<hz){if(hx-Math.abs(dx)<hz-Math.abs(dz))out.x=b.center.x+(dx<0?-hx:hx);else out.z=b.center.z+(dz<0?-hz:hz);}
 }return out;
}
function buckets(points:readonly Point[]){const grid=new Map<string,number[]>();for(let i=0;i<points.length;i++){const p=points[i]!,key=`${Math.floor(p.x/1.5)},${Math.floor(p.z/1.5)}`;const list=grid.get(key);if(list)list.push(i);else grid.set(key,[i]);}return grid;}
function neighbors(grid:Map<string,number[]>,p:Point){const out:number[]=[],x=Math.floor(p.x/1.5),z=Math.floor(p.z/1.5);for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)out.push(...grid.get(`${x+dx},${z+dz}`)??[]);return out;}
export class TownCrowd {
 readonly seed:number;readonly plan:TownPlan;readonly residents;private cache=new Map<number,CrowdPose[]>();private cacheKey='';pairChecks=0;maxNeighbors=0;frames=0;unresolvedActorContacts=0;
 private lifeCache:{input:readonly TownResidentPose[];signature:string;population:number;avoidance:number;poses:CrowdPose[]}|undefined;
 constructor(seed:number){this.seed=seed;this.plan=startingTown(seed);this.residents=townResidents(seed);}
 private separate(poses:CrowdPose[],origins:readonly Point[],strength:number,actors:readonly TownActor[]=[],passes=6){
  for(let pass=0;pass<passes;pass++){
   const grid=buckets(poses);
   for(let i=0;i<poses.length;i++){
    const p=poses[i]!,origin=origins[i]!;
    const near=neighbors(grid,p).filter(j=>j>i).sort((a,b)=>Math.hypot(poses[a]!.x-p.x,poses[a]!.z-p.z)-Math.hypot(poses[b]!.x-p.x,poses[b]!.z-p.z)||a-b).slice(0,TOWN_NEIGHBOR_LIMIT);
    this.maxNeighbors=Math.max(this.maxNeighbors,near.length);
    for(const j of near){this.pairChecks++;const q=poses[j]!,dx=q.x-p.x,dz=q.z-p.z,d=Math.hypot(dx,dz),limit=TOWN_SPACING*strength;if(d>=limit)continue;
     // Opposed deterministic sidesteps in exact-center ties; no random consumption.
     const angle=((i*37+j*17)%360)*Math.PI/180,nx=d>1e-7?dx/d:Math.cos(angle),nz=d>1e-7?dz/d:Math.sin(angle),push=(limit-d)*.505;
     p.x-=nx*push;p.z-=nz*push;q.x+=nx*push;q.z+=nz*push;p.yielding=q.yielding=true;
    }
    for(const a of actors){if((a.feetY??6)>7.8||(a.feetY??6)<4.1)continue;const dx=p.x-a.x,dz=p.z-a.z,d=Math.hypot(dx,dz),limit=.83;
     if(d<limit){const angle=(i*2.399963),nx=d>1e-7?dx/d:Math.cos(angle),nz=d>1e-7?dz/d:Math.sin(angle);p.x+=nx*(limit-d);p.z+=nz*(limit-d);p.yielding=true;}
    }
    const dx=p.x-origin.x,dz=p.z-origin.z,d=Math.hypot(dx,dz);if(d>1.35){p.x=origin.x+dx/d*1.35;p.z=origin.z+dz/d*1.35;}
    Object.assign(p,clearTownBody(this.plan,p));
   }
  }
 }
 private endpoint(tick:number,population:number,avoidance:number){
  let found=this.cache.get(tick);if(found)return found;
  const poses=Array.from({length:population},(_,i)=>intent(this.residents[i]!,this.plan,tick/TOWN_CROWD_HZ));const origins=poses.map(p=>({x:p.x,z:p.z}));for(const p of poses){p.originX=p.x;p.originZ=p.z;}
  if(avoidance>0){
   // Anticipate passing while still separated. A stable relative-velocity normal
   // avoids the left/right flip of plain overlap projection as walkers cross.
   const future=poses.map((_,i)=>intent(this.residents[i]!,this.plan,tick/TOWN_CROWD_HZ+.5)),past=poses.map((_,i)=>intent(this.residents[i]!,this.plan,tick/TOWN_CROWD_HZ-.5)),grid=buckets(origins),offsets=poses.map(()=>({x:0,z:0}));
   for(let i=0;i<poses.length;i++)for(const j of neighbors(grid,origins[i]!).filter(j=>j>i).slice(0,TOWN_NEIGHBOR_LIMIT)){
    const a=origins[i]!,b=origins[j]!,dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(d>=2.2)continue;
    const vx=(future[j]!.x-past[j]!.x)-(future[i]!.x-past[i]!.x),vz=(future[j]!.z-past[j]!.z)-(future[i]!.z-past[i]!.z),v=Math.hypot(vx,vz);if(v<.03)continue;
    const nx=-vz/v,nz=vx/v,lateral=dx*nx+dz*nz,nearPass=Math.max(0,1-Math.abs(lateral)/.9),weight=smooth(1-d/2.2)*nearPass*.62*avoidance;
    offsets[i]!.x-=nx*weight;offsets[i]!.z-=nz*weight;offsets[j]!.x+=nx*weight;offsets[j]!.z+=nz*weight;
   }
   for(let i=0;i<poses.length;i++){poses[i]!.x+=offsets[i]!.x;poses[i]!.z+=offsets[i]!.z;Object.assign(poses[i]!,clearTownBody(this.plan,poses[i]!));}
   this.separate(poses,origins,avoidance,[],10);
  }this.cache.set(tick,poses);while(this.cache.size>3)this.cache.delete(this.cache.keys().next().value!);return poses;
 }
 sample(time:number,population=100,avoidance=1,actors:readonly TownActor[]=[],lifePoses?:readonly TownResidentPose[]):CrowdPose[]{
  time=Number.isFinite(time)?Math.max(0,time):0;population=clamp(Math.floor(population),0,100);avoidance=clamp(avoidance,0,1);
  let poses:CrowdPose[];
  if(lifePoses!==undefined){
   if(!validTownLifePoses(lifePoses))throw new Error('Invalid authoritative town life poses');
   // Navigation has already accepted each root against residents, actors and
   // walls. Repacking it here would create a second, uncommitted simulation.
   if(lifePoses[0]?.authoritativeMotion===1){this.unresolvedActorContacts=0;this.frames++;return lifePoses.slice(0,population).map(p=>({...p,speed:p.speed??0,distance:p.distance??0,yielding:false}));}
   // A current life snapshot is already the simulation outcome. Never look up a
   // fixed-route endpoint, extrapolate its clock, or retain a hidden AI history.
   // Reuse the actor-independent projection for repeated renders/worker steps.
   // Identity is the fast owner contract; the bounded full signature also catches
   // accidental in-place changes, including activity updates at unchanged time.
   const signature=JSON.stringify(lifePoses),cached=this.lifeCache;
   if(!cached||cached.input!==lifePoses||cached.signature!==signature||cached.population!==population||cached.avoidance!==avoidance){
    const baseline=lifePoses.slice(0,population).map(p=>({...p,speed:p.speed??0,distance:p.distance??0,yielding:false}));
    const origins=baseline.map(p=>({x:p.x,z:p.z}));
    // Use the same observer-independent passing lane for life snapshots that
    // fixed routines have always used. Waiting occupants yield before a walker
    // reaches them; exact overlaps alone cannot resolve a packed service exit.
    if(avoidance>0){const grid=buckets(origins),offsets=baseline.map(()=>({x:0,z:0}));for(let i=0;i<baseline.length;i++)for(const j of neighbors(grid,origins[i]!).filter(j=>j>i).slice(0,TOWN_NEIGHBOR_LIMIT)){
     const a=baseline[i]!,b=baseline[j]!,dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(d>=2.2)continue;
     const av=a.moving?a.speed:0,bv=b.moving?b.speed:0,vx=Math.sin(b.facing)*bv-Math.sin(a.facing)*av,vz=Math.cos(b.facing)*bv-Math.cos(a.facing)*av,v=Math.hypot(vx,vz);if(v<.03)continue;
     const nx=-vz/v,nz=vx/v,lateral=dx*nx+dz*nz,weight=smooth(1-d/2.2)*Math.max(0,1-Math.abs(lateral)/.9)*.9*avoidance;
     offsets[i]!.x-=nx*weight;offsets[i]!.z-=nz*weight;offsets[j]!.x+=nx*weight;offsets[j]!.z+=nz*weight;
    }for(let i=0;i<baseline.length;i++){baseline[i]!.x+=offsets[i]!.x;baseline[i]!.z+=offsets[i]!.z;}}
    for(const p of baseline)Object.assign(p,clearTownBody(this.plan,p));
    if(avoidance>0)this.separate(baseline,origins,avoidance,[],10);
    resolveTownActorClearance(this.plan,baseline,[]);
    this.lifeCache={input:lifePoses,signature,population,avoidance,poses:baseline};
   }
   poses=this.lifeCache!.poses.map(p=>({...p}));
  }else{
   const key=`${population}:${avoidance}`;if(key!==this.cacheKey){this.cache.clear();this.cacheKey=key;}
   const scaled=time*TOWN_CROWD_HZ,tick=Math.floor(scaled+1e-9),a=this.endpoint(tick,population,avoidance),b=this.endpoint(tick+1,population,avoidance),f=clamp(scaled-tick,0,1);
   poses=Array.from({length:population},(_,i)=>{const raw=intent(this.residents[i]!,this.plan,time),pa=a[i]!,pb=b[i]!;return {...raw,x:raw.x+mix(pa.x-pa.originX!,pb.x-pb.originX!,f),z:raw.z+mix(pa.z-pa.originZ!,pb.z-pb.originZ!,f),yielding:pa.yielding||pb.yielding};});
  }
  // Actor yielding is shared snapshot input, sorted/bounded so packet order cannot matter.
  const local=actors.filter(a=>[a.x,a.z,a.feetY??6].every(Number.isFinite)&&(a.feetY??6)<=7.8&&(a.feetY??6)>=4.1&&Math.abs(a.x-TOWN_CENTER.x)<TOWN_BOUNDS.halfWidth-4&&Math.abs(a.z-TOWN_CENTER.z)<TOWN_BOUNDS.halfDepth-8).slice(0,8).sort((a,b)=>a.id.localeCompare(b.id));
  if(local.length){const origins=poses.map(p=>({x:p.x,z:p.z}));for(let i=0;i<poses.length;i++){const p=poses[i]!;for(const a of local){if((a.feetY??6)>7.8||(a.feetY??6)<4.1)continue;const d=Math.hypot(p.x-a.x,p.z-a.z);if(d<2.8){const side=i%2===0?1:-1,weight=smooth(1-d/2.8)*1.1;p.x+=Math.cos(p.facing)*side*weight;p.z-=Math.sin(p.facing)*side*weight;p.yielding=true;}}Object.assign(p,clearTownBody(this.plan,p));}this.separate(poses,origins,avoidance,local,6);}
  for(const p of poses)Object.assign(p,clearTownBody(this.plan,p));this.unresolvedActorContacts=lifePoses!==undefined&&!local.length?0:resolveTownActorClearance(this.plan,poses,local);this.frames++;return poses;
 }
}
/** Swept discs, followed by tangential slide. Never step onto a resident. */
export function slideTownCrowd(from:Point,to:Point,poses:readonly Point[],feetY=6,radius=.32){
 if(feetY>7.8||feetY<4.1)return {...to};let p={...from},remaining={x:to.x-from.x,z:to.z-from.z};const limit=radius+TOWN_BODY_RADIUS+.035;
 for(let pass=0;pass<4;pass++){
  let first=1,normal:Point|undefined;
  for(let i=0;i<poses.length;i++){const q=poses[i]!,ox=p.x-q.x,oz=p.z-q.z,c=ox*ox+oz*oz-limit*limit,a=remaining.x**2+remaining.z**2;if(a<1e-14)break;
   if(c<0){const d=Math.hypot(ox,oz),nx=d>1e-8?ox/d:1,nz=d>1e-8?oz/d:0;if(remaining.x*nx+remaining.z*nz<0){first=0;normal={x:nx,z:nz};}continue;}
   const b=2*(ox*remaining.x+oz*remaining.z),disc=b*b-4*a*c;if(b>=0||disc<0)continue;const t=(-b-Math.sqrt(disc))/(2*a);if(t>=0&&t<first){first=Math.max(0,t-.0001);const x=ox+remaining.x*t,z=oz+remaining.z*t,d=Math.hypot(x,z);normal={x:x/d,z:z/d};}
  }
  p.x+=remaining.x*first;p.z+=remaining.z*first;if(!normal)break;remaining.x*=1-first;remaining.z*=1-first;const inward=remaining.x*normal.x+remaining.z*normal.z;if(inward<0){remaining.x-=normal.x*inward;remaining.z-=normal.z*inward;}if(Math.hypot(remaining.x,remaining.z)<1e-7)break;
 }return p;
}
/** Bounded render-only clock. Pauses freeze; discontinuities reset instead of lerping teleports. */
export class TownPresentationClock {
 private value=NaN;private anchor=NaN;
 sample(authority:number,dt:number,reset=false,maxLead=.05){
  if(!Number.isFinite(authority))authority=0;
  if(dt<=0&&!reset&&Number.isFinite(this.value))return this.value;
  if(reset||!Number.isFinite(this.value)||authority<this.anchor-1e-6||Math.abs(authority-this.value)>1){this.value=authority;}
  else if(dt>0)this.value=Math.min(Math.max(this.value+Math.min(dt,TOWN_RENDER_TIMING.maxFrameSeconds),authority),authority+maxLead);
  this.anchor=authority;return this.value;
 }
}
/** Life decisions are fixed at 2 Hz. Replay the latest completed half-second
 * continuously, rather than racing to a held endpoint and braking twice a
 * second. This bounded presentation buffer is never written into authority.
 * Explicit resets discard history. Wall corners use a checked two-leg path. */
export class TownLifeRenderBuffer {
 private source='';private samples:{time:number;poses:CrowdPose[]}[]=[];private authority=NaN;private sampled=0;private networkReserve=0;private incomplete=false;
 private lastOutput:CrowdPose[]=[];
 private recovery:{time:number;target:CrowdPose[];bodies:CrowdPose[];routes:Point[][];indices:number[];best:number[];waiting:number[];steps:number;seconds:number}|undefined;
 private recoveredSeconds=0;
 /** Endpoints belong to their authority step, not the frame that first saw them.
  * At 5/15 Hz or jittered 4 Hz transport that frame is not a half-second boundary. */
 accept(target:readonly CrowdPose[],input:readonly TownResidentPose[],authority:number,reset=false){
  const signature=JSON.stringify(input),time=Math.floor((authority+1e-8)/TOWN_RENDER_TIMING.snapshotSeconds)*TOWN_RENDER_TIMING.snapshotSeconds;
  if(reset||!this.samples.length||authority<this.authority-1e-6){this.samples=[];this.sampled=time;this.networkReserve=0;this.incomplete=false;this.recovery=undefined;this.lastOutput=[];this.recoveredSeconds=0;}
  this.authority=authority;const last=this.samples.at(-1);
  if(!last||time>last.time+1e-8)this.samples.push({time,poses:target.map(p=>({...p}))});
  else if(signature!==this.source)last.poses=target.map(p=>({...p}));
  this.source=signature;const limit=target[0]?.authoritativeMotion===1?64:TOWN_RENDER_TIMING.maxSnapshots;
  while(this.samples.length>limit){if(target[0]?.authoritativeMotion===1&&this.samples[1]!.time>this.sampled+1e-8)this.incomplete=true;this.samples.shift();}
 }
 sample(presentation:number,plan:TownPlan,online=false,maxAdvance=Infinity,actors:readonly TownActor[]=[]){
  const first=this.samples[0]!,last=this.samples.at(-1)!;
  const resolved=last.poses[0]?.authoritativeMotion===1;
  if(resolved&&!this.recovery&&this.lastOutput.length){
   const next=this.samples.find(s=>s.time>this.sampled+1e-8),prior=this.samples.filter(s=>s.time<=this.sampled+1e-8).at(-1);
   if(next&&(!prior||next.poses.some((p,i)=>{const start=p.motionPath?.[0];return start?Math.hypot(start.x-prior.poses[i]!.x,start.z-prior.poses[i]!.z)>1e-7:next.time-prior.time>TOWN_RENDER_TIMING.snapshotSeconds+1e-7;}))){
    const target=next.poses.map(p=>{const {motionPath:_,...pose}=p,start=p.motionPath?.[0];return {...pose,...(start?{x:start.x,z:start.z}:{}),speed:0,moving:false};});
    this.recovery={time:next.time-TOWN_RENDER_TIMING.snapshotSeconds,target,bodies:this.lastOutput.map(p=>({...p})),routes:target.map((p,i)=>townRecoveryRoute(plan,this.lastOutput[i]!,p)),indices:target.map(()=>0),best:target.map((p,i)=>Math.hypot(p.x-this.lastOutput[i]!.x,p.z-this.lastOutput[i]!.z)),waiting:target.map(()=>0),steps:0,seconds:0};this.incomplete=true;
   }
  }
  // A genuinely missing transport segment is the only exception to exact
  // trajectory replay. Reuse the authority's bounded swept-body kernel along
  // static checked connectors. Never choose goals, debit supplies or start work.
  if(this.recovery){const r=this.recovery,dt=Number.isFinite(maxAdvance)?Math.max(0,maxAdvance):TOWN_RENDER_TIMING.maxStepSeconds,previous=r.bodies.map(p=>({...p}));
   // The explorer may now stand on an old missing endpoint. Never make all
   // bodies wait forever for that stale location: join a newer accepted trace.
   const feasible=(points:readonly Point[])=>points.every((p,i)=>actors.every(a=>(a.feetY??6)<=4.1||(a.feetY??6)>=7.8||Math.hypot(p.x-a.x,p.z-a.z)>=.72-1e-6)&&points.every((q,j)=>j<=i||Math.hypot(p.x-q.x,p.z-q.z)>=TOWN_NAV_BODY_GAP-1e-6));
   const blockedJoin=!feasible(r.target)||r.waiting.some(t=>t>2);
   if(dt>0&&blockedJoin){const candidate=this.samples.filter(s=>s.time-TOWN_RENDER_TIMING.snapshotSeconds>r.time+1e-7).reverse().find(s=>feasible(s.poses.map(p=>p.motionPath?.[0]??p)));if(candidate){r.time=candidate.time-TOWN_RENDER_TIMING.snapshotSeconds;r.target=candidate.poses.map(p=>{const {motionPath:_,...pose}=p,q=p.motionPath?.[0]??p;return {...pose,x:q.x,z:q.z};});r.routes=r.target.map((p,i)=>townRecoveryRoute(plan,r.bodies[i]!,p));r.indices=r.target.map(()=>0);r.best=r.target.map((p,i)=>Math.hypot(p.x-r.bodies[i]!.x,p.z-r.bodies[i]!.z));r.waiting=r.target.map(()=>0);}}
   if(dt>0){for(let i=0;i<r.routes.length;i++){const route=r.routes[i]!,p=r.bodies[i]!;while(r.indices[i]!<route.length&&Math.hypot(p.x-route[r.indices[i]!]!.x,p.z-route[r.indices[i]!]!.z)<1e-5)r.indices[i]=r.indices[i]!+1;}
    const goals=r.routes.map((path,i)=>path[r.indices[i]!]??null);advanceTownNavigation(plan,r.bodies,goals,r.bodies.map(()=>3),Math.min(dt,.05),r.steps++,actors);r.seconds+=dt;
   }
   for(let i=0;i<r.bodies.length;i++){const p=r.bodies[i]!,old=previous[i]!,moved=Math.hypot(p.x-old.x,p.z-old.z),remaining=Math.hypot(p.x-r.target[i]!.x,p.z-r.target[i]!.z);p.distance=old.distance+moved;p.speed=dt>0?moved/dt:old.speed;p.moving=p.speed>.001;p.activity='walking to work';if(remaining<1e-5||remaining<r.best[i]!-.02){r.best[i]=remaining;r.waiting[i]=0;}else r.waiting[i]=r.waiting[i]!+dt;}
   const complete=r.bodies.every((p,i)=>Math.hypot(p.x-r.target[i]!.x,p.z-r.target[i]!.z)<1e-5);
   this.lastOutput=r.bodies.map(p=>({...p}));
   if(complete){this.sampled=r.time;this.samples=this.samples.filter(s=>s.time>r.time+1e-8);this.samples.unshift({time:r.time,poses:r.target.map((p,i)=>({...p,distance:r.bodies[i]!.distance}))});this.recoveredSeconds+=r.seconds;this.recovery=undefined;this.incomplete=false;}
   return this.lastOutput;
  }
  // Prime one bounded transport reserve on an actual underrun. Retain it until
  // reset, rather than alternately braking/catching up for each late packet.
  // Playback never rewinds or extrapolates through an unknown future corner.
  if(online&&presentation-TOWN_RENDER_TIMING.bufferSeconds-this.networkReserve>last.time+1e-8)this.networkReserve=TOWN_RENDER_TIMING.networkReserveSeconds;
  let time=Math.max(this.sampled,clamp(presentation-this.bufferSeconds,first.time,last.time));
  // Consume accepted history after a callback gap rather than skipping its
  // corners. A bounded temporal catch-up changes playback rate, never position.
  if(resolved){
   time=Math.min(time,this.sampled+Math.max(0,maxAdvance)*1.5);
   // A bounded advance can cross a healthy endpoint and enter a later missing
   // interval in this same call. Stop at the last contiguous endpoint BEFORE
   // sampling that interval; the next substep starts diagnosed recovery from
   // the actual output, never from an already-teleported future trail start.
   for(let n=1;n<this.samples.length;n++){
    const before=this.samples[n-1]!,after=this.samples[n]!;if(before.time<this.sampled-1e-8||before.time>=time-1e-8)continue;
    const missing=after.poses.some((p,i)=>{const start=p.motionPath?.[0];return start?Math.hypot(start.x-before.poses[i]!.x,start.z-before.poses[i]!.z)>1e-7:after.time-before.time>TOWN_RENDER_TIMING.snapshotSeconds+1e-7;});
    if(missing){time=before.time;break;}
   }
  }
  this.sampled=time;
  const end=this.samples.findIndex(s=>s.time>=time-1e-8),b=this.samples[Math.max(0,end)]!,a=this.samples[Math.max(0,end-1)]!;
  const alpha=b.time>a.time?clamp((time-a.time)/(b.time-a.time),0,1):1;
  this.lastOutput=b.poses.map((p,i)=>{const from=a.poses[i]!;
   if(resolved){
    const path=p.motionPath,local=clamp(time-(b.time-TOWN_RENDER_TIMING.snapshotSeconds),0,TOWN_RENDER_TIMING.snapshotSeconds);
    if(a===b||!path){const {motionPath:_,...pose}=p;return {...pose};}
    let total=0,travel=0,x=path[0]!.x,z=path[0]!.z,facing=from.facing,speed=0;
    for(let n=1;n<path.length;n++){const q=path[n]!,prior=path[n-1]!,length=Math.hypot(q.x-prior.x,q.z-prior.z);total+=length;const f=clamp((local-prior.t)/(q.t-prior.t),0,1);travel+=length*f;if(local>=prior.t-1e-8&&local<=q.t+1e-8){x=mix(prior.x,q.x,f);z=mix(prior.z,q.z,f);speed=length/(q.t-prior.t);if(length>1e-8)facing=Math.atan2(q.x-prior.x,q.z-prior.z);}}
    const {motionPath:_,...metadata}=alpha>=1-1e-8?p:from;
    return {...metadata,x,z,facing,distance:Math.max(0,p.distance-total+travel),speed,moving:speed>.001,authoritativeMotion:1 as const};
   }
   let x=mix(from.x,p.x,alpha),z=mix(from.z,p.z,alpha);
   if(!townPathClear(plan,from,p)){
    const corners=[{x:p.x,z:from.z},{x:from.x,z:p.z}],corner=corners.find(c=>townPathClear(plan,from,c)&&townPathClear(plan,c,p));
    if(corner){const first=Math.hypot(corner.x-from.x,corner.z-from.z),second=Math.hypot(p.x-corner.x,p.z-corner.z),distance=(first+second)*alpha;if(distance<=first){const f=first?distance/first:1;x=mix(from.x,corner.x,f);z=mix(from.z,corner.z,f);}else{const f=second?(distance-first)/second:1;x=mix(corner.x,p.x,f);z=mix(corner.z,p.z,f);}}
    else{x=from.x;z=from.z;}
   }
   return {...p,x,z,facing:yaw(from.facing,p.facing,alpha),distance:mix(from.distance,p.distance,alpha)};
  });return this.lastOutput;
 }
 get delay(){return Math.max(0,(this.samples.at(-1)?.time??0)-this.sampled);}
 get bufferSeconds(){return TOWN_RENDER_TIMING.bufferSeconds+this.networkReserve;}
 get historyIncomplete(){return this.incomplete;}
 get recoveringIds(){return this.recovery?.bodies.flatMap((p,i)=>Math.hypot(p.x-this.recovery!.target[i]!.x,p.z-this.recovery!.target[i]!.z)>1e-5?[i]:[])??[];}
 get recoverySeconds(){return this.recoveredSeconds+(this.recovery?.seconds??0);}
 notePresented(poses:readonly CrowdPose[]){this.lastOutput=poses.map(p=>({...p}));}
}

/** Exceptional packet-loss connector; no service decisions or body packing. */
function townRecoveryRoute(plan:TownPlan,from:Point,to:Point):Point[]{
 if(townPathClear(plan,from,to))return [{...to}];
 let best:Point[]|undefined,length=Infinity;
 const roads=[-44,-24,0,24,44].map(z=>plan.center.z+z),trunks=[plan.center.x-49.3,plan.center.x+.1,plan.center.x+49.3];
 for(const firstZ of roads)for(const lastZ of roads)for(const x of trunks){const points=[{x:from.x,z:firstZ},{x,z:firstZ},{x,z:lastZ},{x:to.x,z:lastZ},{...to}];let p=from,total=0,valid=true;const route:Point[]=[];for(const q of points){if(!townPathClear(plan,p,q)){valid=false;break;}const d=Math.hypot(q.x-p.x,q.z-p.z);if(d>1e-8){total+=d;route.push(q);}p=q;}if(valid&&total<length){best=route;length=total;}}
 return best??[];
}
/** Presentation follows canonical motion with bounded correction; no frame can hop a wall. */
export function townPathClear(plan:TownPlan,from:Point,to:Point,radius=TOWN_WALL_RADIUS){
 const first=localSolids(plan,from),x1=Math.floor(from.x/4),z1=Math.floor(from.z/4),x2=Math.floor(to.x/4),z2=Math.floor(to.z/4);let solids=first;
 if(x1!==x2||z1!==z2){const set=new Set(first),grid=solidGrids.get(plan)!;for(let x=Math.min(x1,x2);x<=Math.max(x1,x2);x++)for(let z=Math.min(z1,z2);z<=Math.max(z1,z2);z++)for(const box of grid.get(`${x},${z}`)??[])set.add(box);solids=[...set];}
 for(const b of solids){
  let lo=0,hi=1;for(const axis of ['x','z'] as const){const d=to[axis]-from[axis],min=b.center[axis]-b.half[axis]-radius-.02,max=b.center[axis]+b.half[axis]+radius+.02;if(Math.abs(d)<1e-12){if(from[axis]<=min||from[axis]>=max){lo=2;break;}}else{const a=(min-from[axis])/d,c=(max-from[axis])/d;lo=Math.max(lo,Math.min(a,c));hi=Math.min(hi,Math.max(a,c));}}if(lo<=hi&&lo<=1&&hi>=0)return false;
 }return true;
}
export class TownRenderMotion {
 private presented:CrowdPose[]=[];private previousTargets:CrowdPose[]=[];
 update(target:readonly CrowdPose[],dt:number,plan:TownPlan,reset=false,actors:readonly TownActor[]=[],lifePassing=false){
  const old=this.presented,passing=target.map(()=>({x:0,z:0}));
  if(lifePassing&&dt>0&&!reset){const grid=buckets(old);for(let i=0;i<old.length;i++)for(const j of neighbors(grid,old[i]!).filter(j=>j>i).slice(0,TOWN_NEIGHBOR_LIMIT)){
   const a=old[i]!,b=old[j]!,ta=target[i]!,tb=target[j]!,dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(d>1.65)continue;
   const ax=ta.x-a.x,az=ta.z-a.z,bx=tb.x-b.x,bz=tb.z-b.z,al=Math.hypot(ax,az),bl=Math.hypot(bx,bz);
   // Canonical life projection already selects a passing lane around service
   // occupants. Do not add a second, potentially opposing stationary lane.
   // Below, those occupants yield through bounded intent-weighted separation.
   if(al<.08||bl<.08||(ax*bx+az*bz)/(al*bl)>-.3||(dx*ax+dz*az)/al<-.1)continue;
   const vx=ax/al-bx/bl,vz=az/al-bz/bl,v=Math.hypot(vx,vz),step=1.15*dt*smooth((1.65-d)/.8),nx=vz/v,nz=-vx/v;
   passing[i]!.x+=nx*step;passing[i]!.z+=nz*step;passing[j]!.x-=nx*step;passing[j]!.z-=nz*step;
  }}
  for(const p of passing){const d=Math.hypot(p.x,p.z);if(d>1.5*dt){p.x*=1.5*dt/d;p.z*=1.5*dt/d;}}
  this.presented=target.map((p,i)=>{
   const last=old[i];if(reset||!last)return {...p};if(dt<=0)return {...last};
   const prior=this.previousTargets[i]??last,decay=1-Math.exp(-18*dt);
   // The life buffer already supplies a continuous trajectory. Follow its
   // displacement exactly while damping only contact/tracking error; damping
   // the whole moving target made walking speed depend on frame duration.
   const dx=p.x-prior.x+(prior.x-last.x)*decay,dz=p.z-prior.z+(prior.z-last.z)*decay,d=Math.hypot(dx,dz),fraction=d>1e-8?Math.min(1,3*dt/d):0;
   let next={x:last.x+dx*fraction+passing[i]!.x,z:last.z+dz*fraction+passing[i]!.z};if(d>1e-8&&!townPathClear(plan,last,next)){
    const x={x:next.x,z:last.z},z={x:last.x,z:next.z};next=townPathClear(plan,last,x)?x:townPathClear(plan,last,z)?z:{x:last.x,z:last.z};
   }
   const distance=Math.hypot(next.x-last.x,next.z-last.z),speed=last.speed+(distance/dt-last.speed)*(1-Math.exp(-12*dt)),angle=Math.atan2(Math.sin(p.facing-last.facing),Math.cos(p.facing-last.facing));
   return {...p,...next,facing:last.facing+clamp(angle,-4*dt,4*dt),distance:last.distance+distance,speed,moving:speed>.025};
  });if(dt>0&&!reset){
   // Continuous local contact relaxation starts from the previous non-overlapping
   // display, so opposite-side canonical solutions never interpolate through bodies.
   for(let pass=0;pass<6;pass++){const grid=buckets(this.presented);for(let i=0;i<this.presented.length;i++){const p=this.presented[i]!;for(const j of neighbors(grid,p).filter(j=>j>i).slice(0,TOWN_NEIGHBOR_LIMIT)){const q=this.presented[j]!,dx=q.x-p.x,dz=q.z-p.z,d=Math.hypot(dx,dz);if(d>=.64)continue;p.yielding=q.yielding=true;const before=old[i],other=old[j],ox=other&&before?other.x-before.x:dx,oz=other&&before?other.z-before.z:dz,od=Math.hypot(ox,oz),nx=d>.1?dx/d:od>1e-8?ox/od:1,nz=d>.1?dz/d:od>1e-8?oz/od:0,push=(.64-d)*.505;
    // Use authoritative intent, never smoothed display speed: stationary
    // service users step aside instead of pinning a traveler in their grid.
    const pm=lifePassing&&target[i]!.moving,qm=lifePassing&&target[j]!.moving,pa=pm&&!qm?.15:!pm&&qm?1.85:1,pb=2-pa;
    const a={x:p.x-nx*push*pa,z:p.z-nz*push*pa},b={x:q.x+nx*push*pb,z:q.z+nz*push*pb};if(townPathClear(plan,p,a)){p.x=a.x;p.z=a.z;}if(townPathClear(plan,q,b)){q.x=b.x;q.z=b.z;}
   }}}
  }
  if(dt>0){for(let i=0;i<this.presented.length;i++){const p=this.presented[i]!,last=old[i];if(!last||reset)continue;
   let next={x:p.x,z:p.z};for(let pass=0;pass<3;pass++)for(const actor of actors){if((actor.feetY??6)>7.8||(actor.feetY??6)<4.1)continue;const dx=next.x-actor.x,dz=next.z-actor.z,d=Math.hypot(dx,dz);if(d<.665){const angle=i*2.399963,nx=d>1e-8?dx/d:Math.cos(angle),nz=d>1e-8?dz/d:Math.sin(angle);next={x:actor.x+nx*.665,z:actor.z+nz*.665};}}
   // Contact presentation may react faster than ordinary walking, but is bounded
   // and cannot accumulate packing-search teleports or cut a solid corner.
   const dx=next.x-last.x,dz=next.z-last.z,d=Math.hypot(dx,dz),fraction=d>10*dt?10*dt/d:1;next={x:last.x+dx*fraction,z:last.z+dz*fraction};if(townPathClear(plan,last,next)){p.x=next.x;p.z=next.z;}
   if(lifePassing&&target[i]!.moving){
    const fx=Math.sin(target[i]!.facing),fz=Math.cos(target[i]!.facing),back=(p.x-last.x)*fx+(p.z-last.z)*fz;
    if(back<0){const tangent={x:p.x-fx*back,z:p.z-fz*back};
     // Remove gratuitous backward correction only when the tangential result
     // remains feasible. Real actor pressure may still require outward escape.
     if(townPathClear(plan,last,tangent)&&this.presented.every((q,j)=>i===j||Math.hypot(q.x-tangent.x,q.z-tangent.z)>=.605)&&actors.every(a=>(a.feetY??6)>7.8||(a.feetY??6)<4.1||Math.hypot(a.x-tangent.x,a.z-tangent.z)>=.665)){p.x=tangent.x;p.z=tangent.z;}
    }
   }
   const distance=Math.hypot(p.x-last.x,p.z-last.z);p.distance=last.distance+distance;p.speed=last.speed+(distance/dt-last.speed)*(1-Math.exp(-12*dt));p.moving=p.speed>.025;
  }}this.previousTargets=target.map(p=>({...p}));return this.presented;
 }
}

/** Final actor exclusion handles pinch points that iterative crowd relaxation cannot solve.
 * Deterministic bounded candidate search, never sends a body through town walls. */
export function resolveTownActorClearance(plan:TownPlan,poses:CrowdPose[],actors:readonly TownActor[]){
 const active=actors.filter(a=>(a.feetY??6)>=4.1&&(a.feetY??6)<=7.8).slice().sort((a,b)=>a.id.localeCompare(b.id));
 const valid=(q:Point,i:number)=>active.every(a=>Math.hypot(q.x-a.x,q.z-a.z)>=.685)&&poses.every((p,j)=>i===j||Math.hypot(q.x-p.x,q.z-p.z)>=.605)&&Math.hypot(clearTownBody(plan,q).x-q.x,clearTownBody(plan,q).z-q.z)<1e-8;
 for(let i=0;i<poses.length;i++){const p=poses[i]!;if(active.every(a=>Math.hypot(p.x-a.x,p.z-a.z)>=.685)&&poses.every((q,j)=>i===j||Math.hypot(p.x-q.x,p.z-q.z)>=.605))continue;
  const from={x:p.x,z:p.z};let best:Point|undefined,bestScore=Infinity;
  for(let ring=1;ring<=12&&!best;ring++)for(let j=0;j<32;j++){const angle=(j+.173*(i%5))*Math.PI/16,q={x:from.x+Math.cos(angle)*ring*.2,z:from.z+Math.sin(angle)*ring*.2};if(!valid(q,i)||!townPathClear(plan,from,q))continue;const score=(q.x-from.x)**2+(q.z-from.z)**2;if(score<bestScore){best=q;bestScore=score;}}
  if(best){p.x=best.x;p.z=best.z;p.yielding=true;}
 }
 return poses.filter(p=>active.some(a=>Math.hypot(p.x-a.x,p.z-a.z)<.685)).length;
}
