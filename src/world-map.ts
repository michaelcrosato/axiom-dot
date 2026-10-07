import {regionalTownRoads} from './regional-world.ts';
import {startingTown,TOWN_CENTER} from './starting-town.ts';
import type {State} from './world.ts';
import {worldValley,worldWorkshop} from './generation.ts';
import {valleyHeight} from './valley.ts';
import {regionalPlan,regionalHeight,regionalBiomeAt} from './regional-world.ts';
import {CAVE_ENTRANCE} from './dungeon.ts';

/** Survey data only: neither this module nor its view requests regional chunks or props. */
export interface MapPoint {x:number;z:number}
export interface MapBounds {minX:number;maxX:number;minZ:number;maxZ:number}
export interface MapPath {id:string;width:number;points:readonly MapPoint[]}
export type MapMarkerKind='settlement'|'outpost'|'lookout'|'ruin'|'entrance'|'pump'|'workshop'|'spawn';
export interface MapMarker extends MapPoint {id:string;name:string;kind:MapMarkerKind;detail:string;local?:boolean}
export interface MapBuilding extends MapPoint {width:number;depth:number}
export interface MapRegion extends MapPoint {name:string;color:string}
export interface WorldMapModel {
 identity:string;title:string;bound:number;area:number;regional:boolean;generation:1|2;
 roads:readonly MapPath[];water:readonly MapPath[];markers:readonly MapMarker[];
 buildings:readonly MapBuilding[];regions:readonly MapRegion[];
 entrance:MapPoint;coreBound:number|null;
 sample:(x:number,z:number)=>{height:number;color:string};
}
export type WorldMapIdentity=Pick<State,'generation'|'seed'|'regional'|'townLayout'>;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const finite=(...values:number[])=>values.every(Number.isFinite);
export function worldMapIdentity(state:WorldMapIdentity){return `${state.regional?.version===1&&state.generation===2?'region1':`valley${state.generation}`}:${state.seed}${state.townLayout?':layout3:'+state.townLayout.manifestHash:''}`;}
export function worldMapBounds(model:Pick<WorldMapModel,'bound'>):MapBounds {return {minX:-model.bound,maxX:model.bound,minZ:-model.bound,maxZ:model.bound};}

/** Read the same frozen macro-plan and exact height authority as the playable world. */
export function createWorldMapModel(state:WorldMapIdentity):WorldMapModel {
 if((state.generation!==1&&state.generation!==2)||!Number.isInteger(state.seed)||state.seed<0||state.seed>0xffffffff)throw new RangeError('Invalid map world identity');
 const identity=worldMapIdentity(state),seed=state.seed;
 if(state.generation===1){
  const workshop=worldWorkshop(seed),bound=48;
  // Pinned authored generation-1 geometry: see the legacy scene in main.ts.
  const roads:MapPath[]=[
   {id:'legacy/west-track',width:2.6,points:[{x:-20.5,z:2},{x:-1.5,z:2}]},
   {id:'legacy/east-track',width:2.6,points:[{x:1.5,z:2},{x:22.5,z:2}]},
   {id:'legacy/mossbank-track',width:2.4,points:[{x:-17,z:-8},{x:-17,z:2}]},
   {id:'legacy/eastwatch-track',width:2.4,points:[{x:20,z:-22},{x:20,z:2}]},
   {id:'legacy/bridge',width:3.7,points:[{x:-3.5,z:2},{x:3.5,z:2}]},
  ];
  const markers:MapMarker[]=[
   {id:'mossbank',name:'Mossbank',kind:'settlement',x:-16,z:-4,detail:'Original valley settlement'},
   {id:'eastwatch',name:'Eastwatch',kind:'settlement',x:21,z:-16,detail:'Eastern settlement'},
   {id:'cave',name:'Echo Vault / river cave',kind:'entrance',...CAVE_ENTRANCE,detail:'Entrance to the underground zones'},
   {id:'pump',name:'Waterworks',kind:'pump',x:0,z:16,detail:'Valley water pump and build yard'},
   {id:'workshop',name:'Frontier workshop',kind:'workshop',...workshop.origin,detail:'Procedural workshop'},
   {id:'spawn',name:'Arrival camp',kind:'spawn',x:-13,z:12,detail:'Original deployment point'},
  ];
  return {identity,title:'Original valley',bound,area:(bound*2)**2,regional:false,generation:1,roads,water:[{id:'legacy/river',width:5.5,points:[{x:0,z:-48},{x:0,z:48}]}],markers,
   buildings:[...[[ -20,-7],[-12,-8],[-23,1],[17,-19],[24,-19],[25,-11]].map(([x,z])=>({x:x!,z:z!,width:3.8,depth:3.3})),{...workshop.origin,width:workshop.width,depth:workshop.depth}],
   regions:[],entrance:{...CAVE_ENTRANCE},coreBound:null,sample:()=>({height:0,color:'#799f72'})};
 }
 const valley=worldValley(seed),regional=state.regional?.version===1,plan=regional?regionalPlan(seed):null;
 const bound=plan?.bound??valley.terrain.bound;
 const markers:MapMarker[]=[
  ...valley.settlements.map(s=>({id:s.id,name:s.name,kind:'settlement' as const,...s.center,detail:'Connected valley settlement',local:regional})),
  {id:'valley/entrance',name:'Echo Vault / river cave',kind:'entrance',...valley.endpoints.entrance,detail:'Entrance to the underground zones',local:regional},
  {id:'valley/pump',name:'Waterworks',kind:'pump',...valley.endpoints.pump,detail:'Valley water pump and build yard',local:regional},
  {id:'valley/spawn',name:'Arrival camp',kind:'spawn',...valley.endpoints.spawn,detail:'Deployment point',local:regional},
  ...valley.buildings.map((b,i)=>({id:b.id,name:`${valley.settlements.find(s=>s.id===b.settlementId)?.name??'Valley'} workshop ${i%2+1}`,kind:'workshop' as const,...b.origin,detail:'Procedural workshop',local:true})),
  ...(regional?[{id:`town:1:${seed}`,name:'Hearthmere · starting town',kind:'settlement' as const,...TOWN_CENTER,detail:'100 residents in 40 homes: singles, couples and varied adult families; seven material-trading businesses. The east road leads to Mossbank.'},...startingTown(seed,state.townLayout).shops.map(b=>({id:b.id,name:b.name,kind:'workshop' as const,...b.entry,detail:'Hearthmere Market Street · approach the shop sign to interact'}))]:[]),
  ...(plan?.sites.map(s=>({id:s.id,name:s.name,kind:s.kind,...s.position,detail:s.description}))??[]),
 ];
 return {identity,title:regional?'The 10 km² frontier':'Connected valley',bound,area:plan?.area??(bound*2)**2,regional,generation:2,
  roads:[...valley.roads,...(plan?.roads??[]),...(regional?regionalTownRoads(seed,state.townLayout):[])],water:[{id:'valley/river',...valley.river},...(plan?.water??[])],markers,
  buildings:[...valley.buildings.map(b=>({...b.origin,width:b.width,depth:b.depth})),...(regional?[...startingTown(seed,state.townLayout).homes,...startingTown(seed,state.townLayout).shops].map(b=>({...b.center,width:b.shopIndex===undefined?5.6:9,depth:b.shopIndex===undefined?6:8})):[])],entrance:{...valley.endpoints.entrance},coreBound:regional?valley.terrain.bound:null,
  regions:plan?[{name:'Pinewatch Highlands',color:'#526f60',x:-940,z:740},{name:'Redstone Uplands',color:'#9a8067',x:840,z:-850},{name:'Windward Heath',color:'#8a9270',x:850,z:960},{name:'Sunmeadow Reach',color:'#80976b',x:-670,z:-260}]:[],
  sample:(x,z)=>{if(!finite(x,z))throw new RangeError('Invalid map sample');const height=regional?regionalHeight(seed,x,z,state.townLayout):valleyHeight(valley,x,z);return {height,color:regional?regionalBiomeAt(seed,x,z).color:height<valley.river.waterLevel+.3?'#799887':height>5?'#6b8d69':'#83a274'};},
 };
}

export interface MapPlayer extends MapPoint {underground:boolean;label:string;description:string}
/** Underground coordinates belong to a different zone, never project them onto the surface. */
export function worldMapPlayer(model:WorldMapModel,state:Pick<State,'zone'|'player'>):MapPlayer {
 if(state.zone!=='valley')return {...model.entrance,underground:true,label:'Your surface entrance',description:`You are underground in ${state.zone==='cave'?'the river cave':'the Echo Vault'}. The marker shows your valley entrance, not your underground position.`};
 return {x:state.player.x,z:state.player.z,underground:false,label:'You are here',description:`Position ${Math.round(state.player.x)} m east, ${Math.round(state.player.z)} m north`};
}
export interface MapViewport {width:number;height:number;centerX:number;centerZ:number;zoom:number}
export const MAP_MAX_ZOOM=64;
export const MAP_PADDING=28;
function viewportScale(model:Pick<WorldMapModel,'bound'>,view:MapViewport){return Math.max(1,Math.min(view.width,view.height)-MAP_PADDING*2)/(model.bound*2)*view.zoom;}
export function mapScale(model:Pick<WorldMapModel,'bound'>,view:MapViewport){return viewportScale(model,view);}
/** +X is east, +Z is north (the regional plan's Northreach / Southwind convention). */
export function worldToMap(model:Pick<WorldMapModel,'bound'>,view:MapViewport,point:MapPoint){const scale=viewportScale(model,view);return {x:view.width/2+(point.x-view.centerX)*scale,y:view.height/2-(point.z-view.centerZ)*scale};}
export function mapToWorld(model:Pick<WorldMapModel,'bound'>,view:MapViewport,point:{x:number;y:number}):MapPoint {const scale=viewportScale(model,view);return {x:view.centerX+(point.x-view.width/2)/scale,z:view.centerZ-(point.y-view.height/2)/scale};}
export function fitWorldMap(width:number,height:number):MapViewport {return {width:Math.max(1,width),height:Math.max(1,height),centerX:0,centerZ:0,zoom:1};}
export function constrainMapViewport(model:Pick<WorldMapModel,'bound'>,view:MapViewport):MapViewport {
 const next={...view,width:Math.max(1,Number.isFinite(view.width)?view.width:1),height:Math.max(1,Number.isFinite(view.height)?view.height:1),zoom:clamp(Number.isFinite(view.zoom)?view.zoom:1,1,MAP_MAX_ZOOM)};
 const scale=viewportScale(model,next),limitX=Math.max(0,model.bound-(next.width/2-MAP_PADDING)/scale),limitZ=Math.max(0,model.bound-(next.height/2-MAP_PADDING)/scale);
 return {...next,centerX:clamp(Number.isFinite(view.centerX)?view.centerX:0,-limitX,limitX),centerZ:clamp(Number.isFinite(view.centerZ)?view.centerZ:0,-limitZ,limitZ)};
}
export function zoomWorldMap(model:Pick<WorldMapModel,'bound'>,view:MapViewport,factor:number,anchor={x:view.width/2,y:view.height/2}):MapViewport {
 if(!Number.isFinite(factor)||factor<=0)return view;
 const before=mapToWorld(model,view,anchor),next={...view,zoom:clamp(view.zoom*factor,1,MAP_MAX_ZOOM)},after=mapToWorld(model,next,anchor);
 return constrainMapViewport(model,{...next,centerX:next.centerX+before.x-after.x,centerZ:next.centerZ+before.z-after.z});
}
export function panWorldMap(model:Pick<WorldMapModel,'bound'>,view:MapViewport,dx:number,dy:number):MapViewport {
 if(!finite(dx,dy))return view;const scale=viewportScale(model,view);
 return constrainMapViewport(model,{...view,centerX:view.centerX-dx/scale,centerZ:view.centerZ+dy/scale});
}
export function focusWorldMap(model:Pick<WorldMapModel,'bound'>,view:MapViewport,point:MapPoint,zoom=view.zoom):MapViewport {return constrainMapViewport(model,{...view,centerX:point.x,centerZ:point.z,zoom});}
export function mapVisibleBounds(model:Pick<WorldMapModel,'bound'>,view:MapViewport):MapBounds {
 const nw=mapToWorld(model,view,{x:0,y:0}),se=mapToWorld(model,view,{x:view.width,y:view.height});
 return {minX:Math.max(-model.bound,nw.x),maxX:Math.min(model.bound,se.x),minZ:Math.max(-model.bound,se.z),maxZ:Math.min(model.bound,nw.z)};
}
export function mapScaleBar(model:Pick<WorldMapModel,'bound'>,view:MapViewport,maxPixels=120){
 const metres=maxPixels/viewportScale(model,view),power=10**Math.floor(Math.log10(metres)),step=[5,2,1].find(n=>n*power<=metres)??1,value=step*power;
 return {metres:value,pixels:value*viewportScale(model,view),label:value>=1000?`${value/1000} km`:`${value} m`};
}
export function formatMapArea(area:number){return area>=1_000_000?`${(area/1_000_000).toFixed(2).replace(/\.00$/,'')} km²`:`${Math.round(area).toLocaleString('en-US')} m²`;}
export function formatMapDistance(metres:number){return metres>=1000?`${(metres/1000).toFixed(3)} km`:`${Math.round(metres)} m`;}

export interface MapRaster {width:number;height:number;bounds:MapBounds;rgba:Uint8ClampedArray;heights:Float32Array}
export const MAP_RASTER_MAX_SIZE=256;
/** Incremental bounded sampling keeps gestures responsive and makes close/replace cancellation cheap. */
export function createWorldMapRasterJob(model:WorldMapModel,size=224,bounds=worldMapBounds(model)){
 if(!Number.isInteger(size)||size<16||size>MAP_RASTER_MAX_SIZE)throw new RangeError('Map raster size must be 16–256');
 if(!finite(bounds.minX,bounds.maxX,bounds.minZ,bounds.maxZ)||bounds.minX>=bounds.maxX||bounds.minZ>=bounds.maxZ||bounds.minX< -model.bound||bounds.maxX>model.bound||bounds.minZ< -model.bound||bounds.maxZ>model.bound)throw new RangeError('Invalid map raster bounds');
 const raster:MapRaster={width:size,height:size,bounds:{...bounds},rgba:new Uint8ClampedArray(size*size*4),heights:new Float32Array(size*size)};
 let row=0,done=false;
 return {get rowsCompleted(){return row;},get done(){return done;},step(rows=8):MapRaster|null {
  if(!Number.isInteger(rows)||rows<1||rows>MAP_RASTER_MAX_SIZE)throw new RangeError('Invalid raster row budget');
  if(done)return raster;
  const end=Math.min(size,row+rows),dx=(bounds.maxX-bounds.minX)/size,dz=(bounds.maxZ-bounds.minZ)/size;
  for(;row<end;row++)for(let col=0;col<size;col++){
   const sample=model.sample(bounds.minX+(col+.5)*dx,bounds.maxZ-(row+.5)*dz),index=row*size+col,hex=Number.parseInt(sample.color.slice(1),16);
   raster.heights[index]=sample.height;raster.rgba[index*4]=(hex>>16)&255;raster.rgba[index*4+1]=(hex>>8)&255;raster.rgba[index*4+2]=hex&255;raster.rgba[index*4+3]=255;
  }
  if(row!==size)return null;
  // Northwest illumination, computed from the already sampled elevations only.
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const index=y*size+x,left=raster.heights[y*size+Math.max(0,x-1)]!,right=raster.heights[y*size+Math.min(size-1,x+1)]!,north=raster.heights[Math.max(0,y-1)*size+x]!,south=raster.heights[Math.min(size-1,y+1)*size+x]!;
   const shade=clamp(.91+(right-left)/(dx*2)*1.2+(south-north)/(dz*2)*1.2,.63,1.19);
   for(let c=0;c<3;c++)raster.rgba[index*4+c]=Math.round(raster.rgba[index*4+c]!*shade);
  }
  done=true;return raster;
 }};
}
export function buildWorldMapRaster(model:WorldMapModel,size=224,bounds=worldMapBounds(model)):MapRaster {const job=createWorldMapRasterJob(model,size,bounds);let raster:MapRaster|null=null;while(!raster)raster=job.step(16);return raster;}
