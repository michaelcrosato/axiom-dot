import {startingTown} from '../src/starting-town.ts';
import {regionalTownRoads} from '../src/regional-world.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createWorldMapModel,worldMapIdentity,worldMapBounds,worldMapPlayer,worldToMap,mapToWorld,fitWorldMap,mapScale,zoomWorldMap,panWorldMap,focusWorldMap,constrainMapViewport,mapVisibleBounds,mapScaleBar,
 createWorldMapRasterJob,buildWorldMapRaster,formatMapArea,formatMapDistance,MAP_MAX_ZOOM,MAP_RASTER_MAX_SIZE,type WorldMapModel,
} from '../src/world-map.ts';
import {worldValley,worldWorkshop} from '../src/generation.ts';
import {valleyHeight} from '../src/valley.ts';
import {regionalPlan,regionalHeight,regionalBiomeAt,regionalCacheStats,REGION_AREA,REGION_BOUND} from '../src/regional-world.ts';
const near=(a:number,b:number,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const region=()=>createWorldMapModel({generation:2,seed:73129,regional:{version:1}});

test('whole-world map respects save flavor and never silently expands older valleys',()=>{
 const old=createWorldMapModel({generation:1,seed:1}),connected=createWorldMapModel({generation:2,seed:73129}),regional=region();
 assert.equal(old.bound,48);assert.equal(old.area,96**2);assert.equal(connected.bound,80);assert.equal(connected.area,160**2);
 assert.equal(regional.bound,REGION_BOUND);assert.equal(regional.area,REGION_AREA);assert.equal(formatMapArea(regional.area),'10 km²');assert.equal(formatMapDistance(regional.bound*2),'3.162 km');
 assert.equal(new Set([old.identity,connected.identity,regional.identity]).size,3);assert.equal(regional.coreBound,80);assert.equal(connected.coreBound,null);
 assert.equal(worldMapIdentity({generation:1,seed:1,regional:{version:1}}),'valley1:1');
});
test('regional map overlays the exact frozen valley and regional road, river, settlement and site plans',()=>{
 const seed=73129,model=region(),valley=worldValley(seed),plan=regionalPlan(seed);
 assert.equal(model.roads.length,valley.roads.length+plan.roads.length+regionalTownRoads(seed).length);assert.deepEqual(model.roads.map(r=>r.points),[...valley.roads,...plan.roads,...regionalTownRoads(seed)].map(r=>r.points));
 assert.equal(model.water.length,3);assert.deepEqual(model.water[0]!.points,valley.river.points);assert.deepEqual(model.water.slice(1),plan.water);
 for(const site of plan.sites){const marker=model.markers.find(m=>m.id===site.id)!;assert.equal(marker.x,site.position.x);assert.equal(marker.z,site.position.z);assert.equal(marker.name,site.name);assert.equal(marker.kind,site.kind);}
 for(const settlement of valley.settlements){const marker=model.markers.find(m=>m.id===settlement.id)!;assert.equal(marker.x,settlement.center.x);assert.equal(marker.z,settlement.center.z);assert.equal(marker.name,settlement.name);}
 assert.equal(model.buildings.length,valley.buildings.length+47);assert(model.markers.some(m=>m.id===startingTown(seed).id));assert.equal(new Set(model.markers.map(m=>m.id)).size,model.markers.length);
});
test('connected and regional survey elevation uses the gameplay terrain authority',()=>{
 const model=region(),connected=createWorldMapModel({generation:2,seed:73129}),valley=worldValley(73129);
 for(const [x,z]of [[0,0],[79.4,-79.9],[-941.2,991.5],[1200,-1121.7],[-REGION_BOUND,REGION_BOUND]]){
  const sample=model.sample(x!,z!);near(sample.height,regionalHeight(73129,x!,z!));assert.equal(sample.color,regionalBiomeAt(73129,x!,z!).color);
 }
 for(const [x,z]of [[0,0],[-79.5,32.7],[21.9,-18.3]])near(connected.sample(x!,z!).height,valleyHeight(valley,x!,z!));
});
test('generation-one survey uses original authored geometry and current seeded workshop footprint',()=>{
 const model=createWorldMapModel({generation:1,seed:12}),workshop=worldWorkshop(12);
 assert.deepEqual(model.entrance,{x:-18,z:-25});assert.equal(model.roads.length,5);assert.equal(model.water[0]!.width,5.5);assert.deepEqual(model.water[0]!.points,[{x:0,z:-48},{x:0,z:48}]);
 assert.ok(model.markers.some(m=>m.name==='Mossbank'&&m.x===-16&&m.z===-4));assert.ok(model.markers.some(m=>m.name==='Eastwatch'&&m.x===21&&m.z===-16));
 assert.deepEqual(model.buildings.at(-1),{...workshop.origin,width:workshop.width,depth:workshop.depth});assert.equal(model.sample(30,40).height,0);
});
test('underground player positions are represented by the surface entrance, never cave coordinates',()=>{
 for(const model of [region(),createWorldMapModel({generation:2,seed:7}),createWorldMapModel({generation:1,seed:1})]){
  for(const zone of ['cave','dungeon']as const){const marker=worldMapPlayer(model,{zone,player:{x:0,z:24,hp:100}});assert.equal(marker.x,model.entrance.x);assert.equal(marker.z,model.entrance.z);assert.equal(marker.underground,true);assert.match(marker.description,/underground/);assert.match(marker.description,/not your underground position/);}
  const surface=worldMapPlayer(model,{zone:'valley',player:{x:12,z:18,hp:100}});assert.equal(surface.x,12);assert.equal(surface.z,18);assert.equal(surface.underground,false);
 }
});
test('a fit view includes every world corner on desktop, narrow phone and landscape viewports',()=>{
 const model=region();for(const [width,height]of [[900,600],[280,400],[800,260]]){
  const view=fitWorldMap(width!,height!);for(const x of [-model.bound,model.bound])for(const z of [-model.bound,model.bound]){const p=worldToMap(model,view,{x,z});assert.ok(p.x>=0&&p.x<=width!);assert.ok(p.y>=0&&p.y<=height!);}
  assert.deepEqual(mapVisibleBounds(model,view),worldMapBounds(model));
 }
});
test('map projections are reversible and orient +Z north/up and +X east/right',()=>{
 const model=region(),view={...fitWorldMap(800,500),centerX:410,centerZ:-360,zoom:7};
 for(const point of [{x:0,z:0},{x:171,z:-953},{x:REGION_BOUND,z:-REGION_BOUND}]){const projected=worldToMap(model,view,point),restored=mapToWorld(model,view,projected);near(restored.x,point.x);near(restored.z,point.z);}
 const center=worldToMap(model,view,{x:view.centerX,z:view.centerZ});near(center.x,400);near(center.y,250);
 assert.ok(worldToMap(model,view,{x:view.centerX,z:view.centerZ+1}).y<center.y);assert.ok(worldToMap(model,view,{x:view.centerX+1,z:view.centerZ}).x>center.x);
});
test('pointer-anchored zoom preserves the surveyed point instead of drifting toward center',()=>{
 const model=region(),view={...fitWorldMap(800,600),zoom:5},anchor={x:320,y:225},before=mapToWorld(model,view,anchor),next=zoomWorldMap(model,view,1.75,anchor),after=mapToWorld(model,next,anchor);
 near(before.x,after.x);near(before.z,after.z);near(next.zoom,8.75);
 assert.equal(zoomWorldMap(model,next,1e9).zoom,MAP_MAX_ZOOM);assert.equal(zoomWorldMap(model,next,1e-9).zoom,1);assert.equal(zoomWorldMap(model,next,NaN),next);assert.equal(zoomWorldMap(model,next,0),next);
});
test('drag and keyboard pan share a bounded world transform; locate handles border positions',()=>{
 const model=region(),view={...fitWorldMap(800,600),zoom:5},scale=mapScale(model,view),pan=panWorldMap(model,view,50,-30);
 near(pan.centerX,-50/scale);near(pan.centerZ,-30/scale);
 const clamped=panWorldMap(model,view,1e9,1e9);assert.ok(Math.abs(clamped.centerX)<model.bound);assert.ok(Math.abs(clamped.centerZ)<model.bound);
 const focused=focusWorldMap(model,view,{x:REGION_BOUND,z:REGION_BOUND},20),point=worldToMap(model,focused,{x:REGION_BOUND,z:REGION_BOUND});assert.ok(point.x<=view.width&&point.x>=0);assert.ok(point.y>=0&&point.y<=view.height);
 assert.equal(panWorldMap(model,view,NaN,0),view);assert.deepEqual(constrainMapViewport(model,{...view,centerX:NaN,centerZ:Infinity,zoom:Infinity}),fitWorldMap(800,600));
});
test('scale bar expresses a real stable 1, 2 or 5 metric distance at every zoom',()=>{
 const model=region();for(const zoom of [1,2,8,32,64]){const view={...fitWorldMap(640,480),zoom},bar=mapScaleBar(model,view);assert.ok(bar.pixels>0&&bar.pixels<=120);near(bar.pixels,mapScale(model,view)*bar.metres);assert.match(bar.label,/^[\d.]+ (?:m|km)$/);}
});
test('terrain raster is deterministic, north-first, opaque and strictly bounded',()=>{
 const model=region(),a=buildWorldMapRaster(model,32),b=buildWorldMapRaster(model,32);
 assert.deepEqual(a,b);assert.equal(a.rgba.length,32*32*4);assert.equal(a.heights.length,32*32);assert.ok(a.heights.every(Number.isFinite));
 for(let i=3;i<a.rgba.length;i+=4)assert.equal(a.rgba[i],255);
 const step=model.bound*2/32;near(a.heights[0]!,Math.fround(model.sample(-model.bound+step/2,model.bound-step/2).height));
 near(a.heights.at(-1)!,Math.fround(model.sample(model.bound-step/2,-model.bound+step/2).height));
 assert.throws(()=>buildWorldMapRaster(model,MAP_RASTER_MAX_SIZE+1),RangeError);assert.throws(()=>buildWorldMapRaster(model,0),RangeError);assert.throws(()=>buildWorldMapRaster(model,32,{minX:0,maxX:0,minZ:0,maxZ:1}),RangeError);
});
test('raster jobs yield at a fixed row budget, sample each cell once and are restartable',()=>{
 let samples=0;const model:WorldMapModel={...createWorldMapModel({generation:1,seed:1}),sample:(x,z)=>{samples++;return {height:x*.1+z*.2,color:'#779977'};}};
 const job=createWorldMapRasterJob(model,32);assert.equal(job.rowsCompleted,0);assert.equal(job.done,false);assert.equal(job.step(4),null);assert.equal(job.rowsCompleted,4);assert.equal(samples,128);
 for(let i=0;i<6;i++)assert.equal(job.step(4),null);const raster=job.step(4)!;assert.equal(job.done,true);assert.equal(samples,32**2);assert.equal(job.step(4),raster);assert.equal(samples,32**2);
 assert.throws(()=>job.step(0),RangeError);
 const cropped=buildWorldMapRaster(model,16,{minX:-5,maxX:7,minZ:2,maxZ:14});assert.equal(cropped.width,16);assert.deepEqual(cropped.bounds,{minX:-5,maxX:7,minZ:2,maxZ:14});
});
test('building, sampling and zoom detail never materialize regional feature chunks',()=>{
 const before=regionalCacheStats();for(const seed of [22,81]){const model=createWorldMapModel({generation:2,seed,regional:{version:1}});buildWorldMapRaster(model,24);const view=focusWorldMap(model,fitWorldMap(400,400),{x:850,z:-920},12);buildWorldMapRaster(model,24,mapVisibleBounds(model,view));}
 const after=regionalCacheStats();assert.equal(after.featureCompilations,before.featureCompilations);assert.equal(after.featureChunks,before.featureChunks);assert.ok(after.contexts<=after.maxContexts);
});
test('survey data generation does not mutate save identity or share mutable player references',()=>{
 const identity=Object.freeze({generation:2 as const,seed:741,regional:Object.freeze({version:1 as const})}),before=JSON.stringify(identity),model=createWorldMapModel(identity);
 assert.equal(JSON.stringify(identity),before);const player={x:3,z:7,hp:100},marker=worldMapPlayer(model,{zone:'valley',player});marker.x=99;assert.equal(player.x,3);
});
test('invalid map seeds and generations are rejected without accidental generation',()=>{
 for(const seed of [-1,1.5,2**32,NaN])assert.throws(()=>createWorldMapModel({generation:2,seed}),RangeError);
 assert.throws(()=>createWorldMapModel({generation:3 as 2,seed:1}),RangeError);
});
