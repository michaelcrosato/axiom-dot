import {compileWorkshop,type CompiledWorkshop} from './building.ts';
import {seedSample,type Reservation,type Vec3} from './procedural.ts';
import type {WorldObject} from './world.ts';

/** Valley domain v2: bounded, immutable planning data, independent of render/physics engines. */
export const VALLEY_BOUND=80;
export const VALLEY_STEP=2;
export const VALLEY_MAX_ROAD_GRADE=.3;
export interface ValleyRoad {id:string;width:number;points:Vec3[];from:string;to:string}
export interface ValleyBox {id:string;center:Vec3;half:Vec3;material:string;solid:boolean}
export interface ValleyBuilding extends CompiledWorkshop {id:string;settlementId:string;elevation:number}
export interface ValleySettlement {id:string;name:string;center:Vec3;buildingIds:string[]}
export interface ValleyDecoration extends Vec3 {id:string;kind:'tree'|'rock';radius:number;height:number}
export interface ValleySite {id:string;kind:'settlement'|'workplace'|'entry'|'waterworks'|'pump'|'spawn'|'dungeon';position:Vec3;owner?:string;portId?:string}
export interface ValleyPlan {
 version:2;seed:number;
 terrain:{vertices:number[];indices:number[];bound:number;step:number};
 river:{points:Vec3[];width:number;waterLevel:number};
 roads:ValleyRoad[];bridges:ValleyBox[];foundations:ValleyBox[];infrastructure:ValleyBox[];waterworksSupply:{source:Vec3;intake:Vec3;intakes:Vec3[];manifold:Vec3[];pipePath:Vec3[];protocol:'water/v1';capacity:number};buildings:ValleyBuilding[];
 settlements:ValleySettlement[];objects:(WorldObject&{y:number})[];decorations:ValleyDecoration[];
 reservations:Reservation[];
 endpoints:{spawn:Vec3;entrance:Vec3;return:Vec3;pump:Vec3;settlement:Vec3;buildOrigin:Vec3};
 sites:ValleySite[];
 routeGraph:{nodes:{id:string;position:Vec3}[];edges:{id:string;from:string;to:string;roadId:string}[]};
 budget:{operations:number;maxOperations:number};
 constraints:{key:string;ok:boolean;message:string}[];
}
interface Pad extends Reservation {y:number}
export const VALLEY_RECIPE_MANIFEST=freeze({
 id:'connected-valley',version:2,algorithmRevision:1,stream:{hash:'seedSample/framework-1',version:2,owner:'valley',ordering:'named-path-purpose-index'},
 algorithms:{layout:'two-reserved-settlement-plazas/two-compiled-workshops-each',terrain:'regular-float32-grid/upward-a-c-b-b-c-d',surface:'exact-triangle-barycentric',river:'seeded-sine-centerline/smooth-straight-crossing/carved-basin',roads:'connected-semantic-graph/nearest-segment-grading/dense-exact-surface',foundations:'last-pass-level-pads/exact-yard-support-slab',foliage:'bounded-named-candidates/reject-infrastructure-first',repair:'one-pass-ground-elevation-compression/target-grade-0.22'},
 bounds:{halfExtent:80,terrainStep:2,minimumDecorationInset:4},
 ranges:{riverCrossX:[-4,4],riverCrossZ:[-4,6],riverWidth:[5.4,6.6],riverWave:[3,7],riverPeriod:[28,42],waterLevel:-.22,bridgeTop:.8,mossbankX:[-46,-40],mossbankZ:[-15,-7],mossbankY:[1.5,2.4],highmeadowX:[43,49],highmeadowZ:[-22,-10],highmeadowY:[2.1,3.2],caveX:[-61,-54],caveZ:[-57,-49],caveY:[3.8,5.2],ridgeA:[4.5,7],ridgeB:[3,6]},
 dimensions:{settlementPad:[15,14],buildingOffsets:[[-7,-9],[7,-9]],yardTranslation:[18,30],yardLocalCenter:[-12.5,9],yardPad:[12,8.5],yardSlabHalf:[10.5,.12,5],routeWidths:[2,2.6,3.2,4],maxRoadGrade:.3,bridgeHalfWidth:2.8,bridgeHalfThickness:.18,terrainGradeShoulder:3,terrainGradeFade:7,foundationFade:3,standingRadius:.34,waterworksIntakeSlots:[[-5,6],[-5,9],[-5,12]],waterworksManifoldX:-3.5,waterworksFixtureStandOff:.24,waterworksPipeHalfWidth:.13},
 terrainParameters:{base:.8,bankScale:76,bankExponent:1.6,endRidgeScale:90,undulationAmplitude:.8,undulationPeriods:[17,23],bedBase:-1.25,bedAmplitude:.14,bedPeriod:12,channelInnerInset:.45,channelOuterOffset:2,crossingStraightRadius:9,crossingBlendLength:15},
 decorationParameters:{candidateHalfExtent:76,treeProbability:.77,treeRadius:[.42,.74],rockRadius:[.6,1.5],treeHeight:[3.5,7],rockHeight:[.65,2.3],riverClearance:3.3,objectClearance:2.5,maxHalfMetreRise:.55},
 dependencies:{workshop:'frontier-workshop@1',waterworks:'waterworks/assembly@1'},
 resources:{scrap:7,core:1,water:3,enemies:2,settlements:2},
 budgets:{vertices:6561,indices:38400,roads:12,routePoints:1200,buildings:4,objects:18,bridges:1,foundations:1,infrastructure:8,decorationCandidates:430,decorations:430,reservations:64,sites:16,operations:800000},
});
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const smooth=(t:number)=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const round=(n:number)=>Math.round(n*10000)/10000;
function freeze<T>(value:T):T {if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
function validSeed(seed:number){if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new RangeError('Valley seed must be an unsigned 32-bit integer');}
function segment(p:{x:number;z:number},a:Vec3,b:Vec3){const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);return {distance:Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz),y:a.y+(b.y-a.y)*t};}
function distanceToRoad(p:{x:number;z:number},road:ValleyRoad){let best={distance:Infinity,y:0};for(let i=1;i<road.points.length;i++){const v=segment(p,road.points[i-1]!,road.points[i]!);if(v.distance<best.distance)best=v;}return best;}
function padDistance(x:number,z:number,p:Reservation){return Math.hypot(Math.max(0,Math.abs(x-p.x)-p.hx),Math.max(0,Math.abs(z-p.z)-p.hz));}

/** Barycentric interpolation of the exact a,c,b / b,c,d mesh triangles, not bilinear noise. */
export function valleyHeight(plan:Pick<ValleyPlan,'terrain'>,x:number,z:number):number {
 if(!Number.isFinite(x)||!Number.isFinite(z))throw new RangeError('Terrain coordinates must be finite');
 const {vertices,bound,step}=plan.terrain,n=Math.round(bound*2/step)+1;
 const gx=clamp((x+bound)/step,0,n-1),gz=clamp((z+bound)/step,0,n-1),ix=Math.min(n-2,Math.floor(gx)),iz=Math.min(n-2,Math.floor(gz)),u=gx-ix,v=gz-iz;
 const a=(iz*n+ix)*3+1,b=a+3,c=a+n*3,d=c+3;
 return u+v<=1?vertices[a]!+(vertices[b]!-vertices[a]!)*u+(vertices[c]!-vertices[a]!)*v:vertices[d]!+(vertices[c]!-vertices[d]!)*(1-u)+(vertices[b]!-vertices[d]!)*(1-v);
}
/** Supporting surface includes the bridge deck while valleyHeight is strictly the terrain mesh. */
export function valleySurfaceHeight(plan:ValleyPlan,x:number,z:number):number {let y=valleyHeight(plan,x,z);for(const b of [...plan.bridges,...(plan.foundations??[])])if(Math.abs(x-b.center.x)<=b.half.x&&Math.abs(z-b.center.z)<=b.half.z)y=Math.max(y,b.center.y+b.half.y);return y;}
function elevatedWorkshop(seed:number,owner:string,origin:{x:number;z:number},elevation:number,settlementId:string):ValleyBuilding {
 const compiled=compileWorkshop(seed,{origin,owner});if(!compiled.plan.valid)throw new Error('Generated workshop failed semantic validation');
 // The compiler output is frozen. Translate a fresh semantic projection including every shape/port.
 const w=JSON.parse(JSON.stringify(compiled)) as ValleyBuilding;w.id=owner;w.settlementId=settlementId;w.elevation=elevation;
 for(const s of w.plan.shapes)s.center.y=round(s.center.y+elevation);
 for(const n of w.plan.nodes){n.frame.y=round(n.frame.y+elevation);for(const s of n.shapes)s.center.y=round(s.center.y+elevation);for(const p of n.ports)p.position.y=round(p.position.y+elevation);}
 for(const e of w.plan.exposed)e.port.position.y=round(e.port.position.y+elevation);
 return w;
}

export function generateValley(seed:number):ValleyPlan {
 validSeed(seed);
 const sample=(path:string,purpose:string,index=0)=>seedSample(seed,2,'valley',path,purpose,index);
 const between=(path:string,purpose:string,min:number,max:number)=>min+(max-min)*sample(path,purpose);
 const integer=(path:string,purpose:string,min:number,max:number)=>Math.floor(between(path,purpose,min,max+1));
 const id=(path:string)=>`valley:2:${seed}:${path}`;
 const riverX=integer('river','crossing-x',-2,2)*2,crossZ=integer('river','crossing-z',-2,3)*2;
 const width=between('river','width',5.4,6.6),waterLevel=-.22,bridgeY=.8;
 const wave=between('river','amplitude',3,7),phase=between('river','phase',0,Math.PI*2),period=between('river','period',28,42);
 const riverAt=(z:number)=>riverX+wave*Math.sin((z-crossZ)/period+phase)*smooth((Math.abs(z-crossZ)-9)/15);
 const west={x:integer('mossbank','x',-46,-40),z:integer('mossbank','z',-15,-7),y:round(between('mossbank','height',1.5,2.4))};
 const east={x:integer('highmeadow','x',43,49),z:integer('highmeadow','z',-22,-10),y:round(between('highmeadow','height',2.1,3.2))};
 const pads:Pad[]=[];const reservations:Reservation[]=[];
 const addPad=(key:string,x:number,z:number,hx:number,hz:number,y:number)=>{pads.push({key,x,z,hx,hz,y,maxSlope:.01});reservations.push({key,x,z,hx,hz,clearance:1.8,maxSlope:.01});};
 const settlements:ValleySettlement[]=[{id:id('mossbank'),name:'Mossbank',center:{...west,z:west.z+3},buildingIds:[]},{id:id('highmeadow'),name:'Highmeadow',center:{...east,z:east.z+3},buildingIds:[]}];
 for(const s of [west,east])addPad(`settlement-${s.x}`,s.x,s.z-4,15,14,s.y);
 const buildings:ValleyBuilding[]=[];
 for(let si=0;si<settlements.length;si++)for(let bi=0;bi<2;bi++){
  const settlement=settlements[si]!,p=si===0?west:east,owner=`valley-v2/seed-${seed}/settlement-${si}/workshop-${bi}`;
  const building=elevatedWorkshop(seed,owner,{x:p.x+(bi===0?-7:7),z:p.z-9},p.y,settlement.id);
  buildings.push(building);settlement.buildingIds.push(owner);
 }
 // buildOrigin is a translation of the pinned waterworks grid, never the pad center.
 const buildOrigin={x:west.x+18,y:round(west.y+.2),z:west.z+30};
 addPad('waterworks-yard',buildOrigin.x-12.5,buildOrigin.z+9,12,7.5,buildOrigin.y);
 const spawn={x:buildOrigin.x-17,y:buildOrigin.y,z:buildOrigin.z+15};
 const pump={x:buildOrigin.x-1.5,y:buildOrigin.y,z:buildOrigin.z+9};
 const entrance={x:integer('cave','x',-61,-54),y:round(between('cave','height',3.8,5.2)),z:integer('cave','z',-57,-49)};
 const returnPoint={x:entrance.x,y:entrance.y,z:entrance.z+3};
 addPad('cave-threshold',entrance.x,entrance.z+1,5.5,5.5,entrance.y);
 const bridgeHalf=width/2+4;
 const bridgeWest={x:riverX-bridgeHalf,y:bridgeY,z:crossZ},bridgeEast={x:riverX+bridgeHalf,y:bridgeY,z:crossZ};
 const bridges:ValleyBox[]=[{id:id('bridge/deck'),center:{x:riverX,y:bridgeY-.18,z:crossZ},half:{x:bridgeHalf,y:.18,z:2.8},material:'bridge-timber',solid:true}];
 // Long bridge landing plateaus keep banks and abutments level with the deck.
 addPad('bridge-west-landing',bridgeWest.x-2, crossZ,2,4,bridgeY);
 addPad('bridge-east-landing',bridgeEast.x+2, crossZ,2,4,bridgeY);
 const sites:ValleySite[]=[
  {id:'camp',kind:'spawn',position:spawn},{id:'mossbank',kind:'settlement',position:settlements[0]!.center,owner:settlements[0]!.id},
  {id:'highmeadow',kind:'settlement',position:settlements[1]!.center,owner:settlements[1]!.id},
  {id:'waterworks',kind:'waterworks',position:{x:buildOrigin.x-12.5,y:buildOrigin.y,z:buildOrigin.z+14}},
  {id:'pump',kind:'pump',position:pump},{id:'cave',kind:'dungeon',position:returnPoint},
  {id:'bridge-west',kind:'entry',position:bridgeWest},{id:'bridge-east',kind:'entry',position:bridgeEast},
 ];
 const roads:ValleyRoad[]=[];
 const addRoad=(key:string,from:string,to:string,points:Vec3[],width=3.2)=>roads.push({id:id(`road/${key}`),from,to,width,points});
 const westPlaza=settlements[0]!.center,eastPlaza=settlements[1]!.center;
 addRoad('mossbank-bridge','mossbank','bridge-west',[westPlaza,{x:west.x+17,y:west.y,z:westPlaza.z},{x:bridgeWest.x-5,y:bridgeY,z:crossZ},bridgeWest]);
 addRoad('river-crossing','bridge-west','bridge-east',[bridgeWest,bridgeEast],4);
 addRoad('bridge-highmeadow','bridge-east','highmeadow',[bridgeEast,{x:bridgeEast.x+5,y:bridgeY,z:crossZ},{x:east.x-17,y:east.y,z:eastPlaza.z},eastPlaza]);
 addRoad('mossbank-yard','mossbank','waterworks',[westPlaza,{x:west.x,y:west.y,z:west.z+12},{x:buildOrigin.x-25,y:buildOrigin.y,z:buildOrigin.z+14},sites.find(s=>s.id==='waterworks')!.position]);
 addRoad('camp-yard','camp','waterworks',[spawn,sites.find(s=>s.id==='waterworks')!.position],2.6);
 addRoad('pump-yard','waterworks','pump',[sites.find(s=>s.id==='waterworks')!.position,{x:pump.x,y:pump.y,z:buildOrigin.z+14},pump],2.6);
 addRoad('cave-mossbank','mossbank','cave',[westPlaza,{x:west.x-23,y:west.y,z:westPlaza.z},{x:west.x-23,y:entrance.y,z:entrance.z+7},{x:entrance.x,y:entrance.y,z:entrance.z+7},returnPoint]);
 for(const b of buildings){
  const prefix=`workshop-${buildings.indexOf(b)}`,entry=b.plan.exposed.find(e=>e.key==='entry')!,work=b.plan.exposed.find(e=>e.key==='workplace')!;
  sites.push({id:prefix,kind:'entry',position:{...b.spawn,y:b.elevation},owner:b.id,portId:entry.port.id},{id:`${prefix}-work`,kind:'workplace',position:{...work.port.position},owner:b.id,portId:work.port.id});
  const plaza=settlements.find(s=>s.id===b.settlementId)!.center;
  addRoad(prefix, b.settlementId===settlements[0]!.id?'mossbank':'highmeadow',prefix,[plaza,{x:b.spawn.x,y:b.elevation,z:plaza.z},{...b.spawn,y:b.elevation}],2);
 }
 // Infrastructure is committed before decoration candidates are even sampled.
 for(const road of roads)for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1]!,b=road.points[i]!;reservations.push({key:`${road.id}/${i}`,x:(a.x+b.x)/2,z:(a.z+b.z)/2,hx:Math.abs(a.x-b.x)/2+road.width/2+1.5,hz:Math.abs(a.z-b.z)/2+road.width/2+1.5,maxSlope:VALLEY_MAX_ROAD_GRADE});
 }
 const levelPads:Pad[]=[...buildings.map(b=>({key:b.id,x:b.origin.x,z:b.origin.z,hx:b.width/2+2.5,hz:b.depth/2+2.5,y:b.elevation})),{key:'yard-inner',x:buildOrigin.x-12.5,z:buildOrigin.z+9,hx:12,hz:8.5,y:buildOrigin.y}];
 const terrain={vertices:[] as number[],indices:[] as number[],bound:VALLEY_BOUND,step:VALLEY_STEP};
 const hillA=between('terrain','ridge-a',4.5,7),hillB=between('terrain','ridge-b',3,6),p1=between('terrain','phase-a',0,6),p2=between('terrain','phase-b',0,6);
 const rawHeight=(x:number,z:number)=>{
  const riverDistance=Math.abs(x-riverAt(z));
  let h=.8+hillA*Math.pow(Math.min(1,riverDistance/76),1.6)+hillB*Math.pow(Math.abs(z)/90,2)+.8*Math.sin(x/17+p1)*Math.cos(z/23+p2);
  let closest={distance:Infinity,y:0,width:0};
  for(const r of roads){const d=distanceToRoad({x,z},r);if(d.distance<closest.distance)closest={...d,width:r.width};}
  for(const pad of pads){const d=padDistance(x,z,pad);h=h+(pad.y-h)*(1-smooth(d/5));}
  h=h+(closest.y-h)*(1-smooth((closest.distance-closest.width/2-3)/7));
  for(const pad of levelPads){const d=padDistance(x,z,pad);h=h+(pad.y-h)*(1-smooth(d/3));}
  // A carved bed remains underneath the bridge. Roads never become invisible dams.
  const inner=width/2-.45,outer=width/2+2;
  if(riverDistance<outer){const channel=-1.25+.14*Math.sin(z/12+p1);h=channel+(h-channel)*smooth((riverDistance-inner)/(outer-inner));}
  return Math.fround(h);
 };
 const n=VALLEY_BOUND*2/VALLEY_STEP+1;
 for(let zi=0;zi<n;zi++)for(let xi=0;xi<n;xi++){const x=-VALLEY_BOUND+xi*VALLEY_STEP,z=-VALLEY_BOUND+zi*VALLEY_STEP;terrain.vertices.push(x,rawHeight(x,z),z);}
 for(let zi=0;zi<n-1;zi++)for(let xi=0;xi<n-1;xi++){const a=zi*n+xi,b=a+1,c=a+n,d=c+1;terrain.indices.push(a,c,b,b,c,d);}
 const draft={terrain,bridges} as ValleyPlan;
 // Rendered road ribbons follow exact triangle heights. The crossing follows the deck.
 for(const road of roads){const dense:Vec3[]=[];for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1]!,b=road.points[i]!,steps=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/1.25));
  for(let k=i===1?0:1;k<=steps;k++){const t=k/steps,x=round(a.x+(b.x-a.x)*t),z=round(a.z+(b.z-a.z)*t);dense.push({x,y:valleySurfaceHeight(draft,x,z),z});}
 }road.points=dense.filter((p,i)=>i===0||Math.hypot(p.x-dense[i-1]!.x,p.z-dense[i-1]!.z)>.001);}
 const river={points:Array.from({length:n},(_,i)=>({x:round(riverAt(-VALLEY_BOUND+i*VALLEY_STEP)),y:waterLevel,z:-VALLEY_BOUND+i*VALLEY_STEP})),width,waterLevel};
 const objects:(WorldObject&{y:number})[]=[];
 const object=(key:string,kind:WorldObject['kind'],p:{x:number;z:number},label:string)=>objects.push({id:id(key),kind,x:p.x,y:valleySurfaceHeight(draft,p.x,p.z),z:p.z,label});
 object('cave','entrance',entrance,'Enter the Echo Vault');object('pump','pump',pump,'Valley water pump');
 for(const settlement of settlements)object(settlement.id===settlements[0]!.id?'mossbank':'highmeadow','settlement',settlement.center,`${settlement.name} settlement`);
 // Quest supplies are on protected pads or reachable graded routes, with stable bounded totals.
 for(let i=0;i<4;i++)object(`build-scrap-${i}`,'scrap',{x:buildOrigin.x-20+i*3,z:buildOrigin.z+15},'Waterworks salvage');
 object('scrap-1','scrap',{x:west.x-10,z:west.z+6},'Salvage cache');object('scrap-2','scrap',{x:west.x+10,z:west.z+6},'Machine scrap');
 object('scrap-3','scrap',{x:east.x-10,z:east.z+6},'Alloy fragments');
 for(let i=0;i<3;i++)object(`water-${i+1}`,'water',{x:east.x-8+i*8,z:east.z+7},'Sealed water canister');
 object('core-1','core',{x:east.x+10,z:east.z+2},'Power core');
 object('sentry-1','enemy',{x:east.x+13,z:east.z+6},'Rogue sentry');
 object('sentry-2','enemy',{x:entrance.x+3,z:entrance.z+3},'Rogue sentry');
 const source={x:round(riverAt(buildOrigin.z+9)),y:waterLevel,z:buildOrigin.z+9},intake={x:buildOrigin.x-5,y:buildOrigin.y+.24,z:buildOrigin.z+9};
 const intakes=[6,9,12].map(z=>({x:buildOrigin.x-5,y:intake.y,z:buildOrigin.z+z})),manifold=[{x:buildOrigin.x-3.5,y:intake.y,z:buildOrigin.z+6},{x:buildOrigin.x-3.5,y:intake.y,z:buildOrigin.z+12}];
 const waterworksSupply={source,intake,intakes,manifold,pipePath:[source,{x:source.x,y:intake.y,z:source.z},intake],protocol:'water/v1' as const,capacity:2};
 const infrastructure:ValleyBox[]=[{id:id('waterworks/feeder-pipe'),center:{x:(source.x+intake.x)/2,y:intake.y,z:intake.z},half:{x:(source.x-intake.x)/2,y:.13,z:.13},material:'waterworks-pipe',solid:false},{id:id('waterworks/intake-riser'),center:{x:source.x,y:(source.y+intake.y)/2,z:source.z},half:{x:.17,y:(intake.y-source.y)/2,z:.17},material:'waterworks-pipe',solid:false}];
 infrastructure.push({id:id('waterworks/manifold'),center:{x:buildOrigin.x-3.5,y:intake.y,z:intake.z},half:{x:.13,y:.13,z:3},material:'waterworks-pipe',solid:false});
 for(let i=0;i<intakes.length;i++)infrastructure.push({id:id(`waterworks/intake-branch-${i}`),center:{x:buildOrigin.x-4.25,y:intake.y,z:intakes[i]!.z},half:{x:.75,y:.13,z:.13},material:'waterworks-pipe',solid:false});
 reservations.push({key:'waterworks-manifold',x:buildOrigin.x-4.25,z:intake.z,hx:1.2,hz:3.5,clearance:.8});
 reservations.push({key:'waterworks-feeder',x:(source.x+intake.x)/2,z:intake.z,hx:(source.x-intake.x)/2,hz:.4,clearance:.8});
 const decorations:ValleyDecoration[]=[];
 for(let i=0;i<430;i++){
  const path=`decoration/${i}`,x=round(between(path,'x',-76,76)),z=round(between(path,'z',-76,76)),kind=sample(path,'kind')<.77?'tree' as const:'rock' as const,radius=round(between(path,'radius',kind==='tree'?.42:.6,kind==='tree'?.74:1.5)),height=round(between(path,'height',kind==='tree'?3.5:.65,kind==='tree'?7:2.3));
  if(Math.abs(x-riverAt(z))<width/2+3.3||reservations.some(r=>padDistance(x,z,r)<radius+(r.clearance??0)))continue;
  if(objects.some(o=>Math.hypot(o.x-x,o.z-z)<radius+2.5))continue;
  const y=valleyHeight(draft,x,z);if(Math.max(Math.abs(valleyHeight(draft,x+.5,z)-y),Math.abs(valleyHeight(draft,x,z+.5)-y))>.55)continue;
  decorations.push({id:id(path),kind,x:round(x),y,z:round(z),radius:round(radius),height:round(height)});
 }
 const routeGraph={nodes:sites.filter(s=>s.kind!=='workplace').map(s=>({id:s.id,position:s.position})),edges:roads.map(r=>({id:r.id,from:r.from,to:r.to,roadId:r.id}))};
 const reached=new Set(['camp']);for(let i=0;i<routeGraph.nodes.length;i++)for(const edge of routeGraph.edges){if(reached.has(edge.from))reached.add(edge.to);if(reached.has(edge.to))reached.add(edge.from);}
 let maxGrade=0;for(const road of roads)for(let i=1;i<road.points.length;i++){const a=road.points[i-1]!,b=road.points[i]!;maxGrade=Math.max(maxGrade,Math.abs(b.y-a.y)/Math.hypot(b.x-a.x,b.z-a.z));}
 const foundations:ValleyBox[]=[{id:id('waterworks/foundation'),center:{x:buildOrigin.x-12.5,y:buildOrigin.y-.12,z:buildOrigin.z+9},half:{x:10.5,y:.12,z:5},material:'yard-stone',solid:true}];
 // Conservative upper bound in planning visits, not a wall-clock or physics budget.
 const operationCount=n*n*(16+roads.length*4+pads.length+levelPads.length)+430*reservations.length+buildings.reduce((sum,b)=>sum+b.plan.operations,0);
 const constraints=[{key:'route-connectivity',ok:routeGraph.nodes.every(s=>reached.has(s.id)),message:'Camp, both settlements, all workshop entries, pump, yard and cave share a connected route graph'},
  {key:'road-grade',ok:maxGrade<=VALLEY_MAX_ROAD_GRADE,message:`Maximum sampled route grade ${maxGrade.toFixed(4)}; limit ${VALLEY_MAX_ROAD_GRADE}`},
  {key:'compiled-buildings',ok:buildings.every(b=>b.plan.valid),message:'Every generated workshop passes the shared compiler'},
  {key:'bounded-terrain',ok:terrain.vertices.length===n*n*3&&terrain.indices.length===(n-1)*(n-1)*6,message:'Bounded 81 × 81 shared triangle surface'},
  {key:'output-budget',ok:roads.length<=12&&roads.reduce((sum,r)=>sum+r.points.length,0)<=1200&&buildings.length<=4&&objects.length<=18&&decorations.length<=430&&reservations.length<=64&&sites.length<=16&&bridges.length<=1&&foundations.length<=1&&infrastructure.length<=8&&operationCount<=800000,message:'Declared geometry, entity, site and planning-work budgets enforced'},
  {key:'identity-uniqueness',ok:new Set([...objects,...decorations,...bridges,...foundations,...infrastructure,...buildings,...roads,...sites].map(o=>o.id)).size===objects.length+decorations.length+bridges.length+foundations.length+infrastructure.length+buildings.length+roads.length+sites.length,message:'Entity, infrastructure and site identities are unique'},
  {key:'foundation-support',ok:buildings.every(b=>[{x:b.origin.x-b.width/2,z:b.origin.z-b.depth/2},{x:b.origin.x+b.width/2,z:b.origin.z+b.depth/2},b.spawn].every(p=>Math.abs(valleyHeight(draft,p.x,p.z)-b.elevation)<1e-5)),message:'Generated workshop floors and entrances share the leveled terrain surface'}];
 const plan:ValleyPlan={version:2,seed,terrain,river,roads,bridges,foundations,infrastructure,waterworksSupply,buildings,settlements,objects,decorations,reservations,endpoints:{spawn,entrance,return:returnPoint,pump,settlement:westPlaza,buildOrigin},sites,routeGraph,budget:{operations:operationCount,maxOperations:800000},constraints};
 // One bounded repair pass preserves the horizontal graph and building dimensions. This
 // cannot consume a random stream or alter identities; it compresses only ground elevations.
 if(maxGrade>VALLEY_MAX_ROAD_GRADE){
  const scale=.22/maxGrade,map=(y:number)=>bridgeY+(y-bridgeY)*scale,seen=new Set<object>();
  const point=(p:Vec3)=>{if(!seen.has(p)){seen.add(p);p.y=map(p.y);}};
  for(let i=1;i<terrain.vertices.length;i+=3)terrain.vertices[i]=Math.fround(map(terrain.vertices[i]!));
  for(const b of [...bridges,...foundations])b.center.y=map(b.center.y+b.half.y)-b.half.y;
  for(const b of buildings){const delta=map(b.elevation)-b.elevation;b.elevation+=delta;
   for(const shape of b.plan.shapes)shape.center.y+=delta;
   for(const node of b.plan.nodes){node.frame.y+=delta;for(const shape of node.shapes)shape.center.y+=delta;for(const port of node.ports)port.position.y+=delta;}
   for(const exposed of b.plan.exposed)exposed.port.position.y+=delta;
  }
  for(const p of Object.values(plan.endpoints))point(p);
  for(const s of settlements)point(s.center);for(const s of sites)point(s.position);for(const n of routeGraph.nodes)point(n.position);
  for(const p of river.points)point(p);river.waterLevel=map(river.waterLevel);
  for(const o of objects)point(o);for(const d of decorations)point(d);for(const b of infrastructure){point(b.center);if(b.id.endsWith('intake-riser'))b.half.y*=scale;}
  point(waterworksSupply.source);point(waterworksSupply.intake);for(const p of [...waterworksSupply.pipePath,...waterworksSupply.intakes,...waterworksSupply.manifold])point(p);
  // Fixed-size service fixtures keep their installation height above the compressed pad.
  waterworksSupply.intake.y=buildOrigin.y+.24;
  for(const p of [...waterworksSupply.intakes,...waterworksSupply.manifold,...waterworksSupply.pipePath.slice(1)])p.y=waterworksSupply.intake.y;
  for(const b of infrastructure){if(b.id.endsWith('intake-riser')){b.center.y=(waterworksSupply.source.y+waterworksSupply.intake.y)/2;b.half.y=(waterworksSupply.intake.y-waterworksSupply.source.y)/2;}else b.center.y=waterworksSupply.intake.y;}
  maxGrade=0;
  for(const road of roads){for(const p of road.points)p.y=valleySurfaceHeight(plan,p.x,p.z);for(let i=1;i<road.points.length;i++){const a=road.points[i-1]!,b=road.points[i]!;maxGrade=Math.max(maxGrade,Math.abs(a.y-b.y)/Math.hypot(a.x-b.x,a.z-b.z));}}
  for(const o of objects)o.y=valleySurfaceHeight(plan,o.x,o.z);for(const d of decorations)d.y=valleyHeight(plan,d.x,d.z);
  constraints[1]={key:'road-grade',ok:maxGrade<=VALLEY_MAX_ROAD_GRADE,message:`Deterministically repaired maximum route grade ${maxGrade.toFixed(4)}; limit ${VALLEY_MAX_ROAD_GRADE}`};
 }
 if(plan.constraints.some(c=>!c.ok))throw new Error(`Rejected valley plan: ${plan.constraints.filter(c=>!c.ok).map(c=>c.key).join(', ')}`);
 return freeze(plan);
}
