import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three/webgpu';
import {CAMERA_VISIBILITY as C,zoomAtmosphere,cameraGroundFootprint} from '../src/camera-visibility.ts';
import {landscapeTile,createRegionalLandscape,createScenicWater} from '../src/regional-landscape.ts';
import {REGION_BOUND,regionalHeight,regionalCacheStats} from '../src/regional-world.ts';
const fogAmount=(d:number,near:number,far:number)=>{const t=Math.max(0,Math.min(1,(d-near)/(far-near)));return t*t*(3-2*t);};
const close=(a:number,b:number)=>assert(Math.abs(a-b)<1e-5,`${a} != ${b}`);
test('zoom fades atmosphere smoothly and removes it completely throughout the far-clipped scene by42',()=>{
 for(const regional of [true,false])for(const inside of [true,false])for(const lab of [true,false]){
  let last=-1;for(let z=17;z<=58;z+=.25){const f=zoomAtmosphere(z,regional,inside,lab);assert(f.near<f.far);assert(f.fade>=last);last=f.fade;if(z>=42){assert(f.near>C.far);assert.equal(fogAmount(C.far,f.near,f.far),0);}}
  assert.deepEqual(zoomAtmosphere(17,regional,inside,lab),zoomAtmosphere(28,regional,inside,lab));
 }
 const old=fogAmount(58*Math.hypot(1,.88),45,95);assert(old>.71&&old<.72);assert.equal(zoomAtmosphere(58,true).fade,1);
 assert(zoomAtmosphere(28.001,true).near-45<.00001);assert(513-zoomAtmosphere(41.999,true).near<.00001);
});
test('footprints include tilted actual Three frustum rays through terrain and scenic water for portrait/ultrawide, orbit, zoom and elevation',()=>{
 for(const aspect of [9/21,9/16,1,16/9,2.4,32/9,4])for(const zoom of [17,28,36,42,58])for(const orbit of [0,.6,Math.PI/2,Math.PI,4.3])for(const y of [1,35,70]){
  const target=new THREE.Vector3(-65.5,y,1580.5),camera=new THREE.PerspectiveCamera(42,aspect,.1,C.far);camera.position.set(target.x+Math.sin(orbit)*zoom,y+.88*zoom,target.z+Math.cos(orbit)*zoom);camera.lookAt(target);camera.updateMatrixWorld();const b=cameraGroundFootprint(target,zoom,orbit,aspect),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-C.sceneryFloor);
  for(const x of [-1,0,1])for(const y of [-1,0,1]){const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x,y),camera);const point=ray.ray.intersectPlane(plane,new THREE.Vector3())!;assert(point);const depth=-point.clone().applyMatrix4(camera.matrixWorldInverse).z;assert(depth<C.far,`floor clips at${depth}`);for(const t of [0,.5,1]){const p=camera.position.clone().lerp(point,t);assert(p.x>=b.minX&&p.x<=b.maxX&&p.z>=b.minZ&&p.z<=b.maxZ);}}
 }
});
test('LOD tile borders exactly match every authoritative2m terrain sample, including negative and clipped cells',()=>{
 for(const [cx,cz]of [[-1,-1],[0,0],[8,-12],[-25,24],[24,-25],[24,24]]){
  const tile=landscapeTile(73129,cx!,cz!),minX=Math.max(-REGION_BOUND,cx!*64),maxX=Math.min(REGION_BOUND,(cx!+1)*64),minZ=Math.max(-REGION_BOUND,cz!*64),maxZ=Math.min(REGION_BOUND,(cz!+1)*64);
  for(const axis of ['x','z'])for(const edge of axis==='x'?[minX,maxX]:[minZ,maxZ]){const lo=axis==='x'?minZ:minX,hi=axis==='x'?maxZ:maxX,points=[lo,hi];for(let p=(Math.floor(lo/2)+1)*2;p<hi;p+=2)points.push(p);for(const p of points){const x=axis==='x'?edge:p,z=axis==='x'?p:edge,h=regionalHeight(73129,x,z);assert(tile.vertices.some((v,i)=>i%3===0&&v===x&&tile.vertices[i+2]===z&&tile.vertices[i+1]===h),`${cx}:${cz} lacks${x}:${z}`);}}
  assert(tile.indices.every(i=>i>=0&&i<tile.vertices.length/3));for(let i=0;i<tile.indices.length;i+=3){const a=new THREE.Vector3().fromArray(tile.vertices,tile.indices[i]!*3),b=new THREE.Vector3().fromArray(tile.vertices,tile.indices[i+1]!*3),c=new THREE.Vector3().fromArray(tile.vertices,tile.indices[i+2]!*3);assert(b.sub(a).cross(c.sub(a)).y>=-1e-7);}
 }
});
test('landscape fills every uncommitted tile, removes only committed terrain, never compiles props, and disposes replaced buffers',()=>{
 const before=regionalCacheStats(),view=createRegionalLandscape(73129),bounds={minX:-64,maxX:63,minZ:-64,maxZ:63};let disposed=0;view.root.geometry.addEventListener('dispose',()=>disposed++);view.update(bounds,new Set());assert.equal(view.stats.tiles,4);assert.equal(disposed,1);const full=view.stats.triangles;view.root.geometry.addEventListener('dispose',()=>disposed++);
 for(let n=0;n<20;n++)view.update(bounds,new Set());assert.equal(view.stats.rebuilds,1);view.update(bounds,new Set(['region:0:0']));assert.equal(view.stats.tiles,3);assert(view.stats.triangles<full);assert.equal(disposed,2);view.update(bounds,new Set());assert.equal(view.stats.tiles,4);const after=regionalCacheStats();assert.equal(after.featureCompilations,before.featureCompilations);view.dispose();view.dispose();assert.equal(view.stats.tiles,0);
});
test('repeated zoom, resize, rotation, world-edge moves and scenery disposal keep bounded render-only geometry',()=>{
 const view=createRegionalLandscape(73129),water=createScenicWater();let max=0;for(let n=0;n<40;n++){const zoom=[17,36,58,42][n%4]!,aspect=[9/16,16/9,32/9,4][n%4]!,target={x:n%2?-1580:1500,y:n%3?50:2,z:n%2?1580:-1500},b=cameraGroundFootprint(target,zoom,n*.4,aspect);view.update(b,new Set());water.update(b);max=Math.max(max,view.stats.vertices);assert(view.stats.tiles<=180);assert(view.stats.vertices<40_000);assert.equal(view.root.castShadow,false);assert.equal(water.root.position.y,-32);assert(water.root.scale.x>=b.maxX-b.minX);}
 assert(max>0);view.dispose();water.dispose();
});
test('whole-world extreme-aspect fallback is budgeted and committed world-edge skirts remain',()=>{
 const view=createRegionalLandscape(42),b={minX:-5000,maxX:5000,minZ:-5000,maxZ:5000},confirmed=new Set<string>();for(let z=-25;z<=-19;z++)for(let x=-25;x<=-19;x++)confirmed.add(`region:${x}:${z}`);view.update(b,confirmed);assert(view.stats.tiles<1024);assert(view.stats.vertices<200_000);const positions=view.root.geometry.getAttribute('position');let skirt=0;for(let i=0;i<positions.count;i++)if(Math.abs(positions.getX(i)+REGION_BOUND)<.001&&positions.getY(i)===-32)skirt++;assert(skirt>0);view.dispose();
});
import fs from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
import {cameraLandscapeFootprint} from '../src/camera-visibility.ts';
test('reserved landscape contains every zoom/orbit footprint without zoom-driven geometry rebuilds',()=>{
 for(const aspect of [.42,1,16/9,4])for(const y of [1,35,70]){const target={x:-64.01,y,z:63.99},b=cameraLandscapeFootprint(target,aspect);for(let orbit=0;orbit<Math.PI*2;orbit+=.3)for(let z=17;z<=58;z++){const a=cameraGroundFootprint(target,z,orbit,aspect);assert(a.minX>=b.minX&&a.maxX<=b.maxX&&a.minZ>=b.minZ&&a.maxZ<=b.maxZ);}}
 const view=createRegionalLandscape(42),b=cameraLandscapeFootprint({x:3,y:1,z:4},16/9);view.update(b,new Set());for(let n=0;n<100;n++)view.update(cameraLandscapeFootprint({x:3+n*.01,y:1+n*.01,z:4},16/9),new Set());assert.equal(view.stats.rebuilds,1);view.dispose();
});
test('actual shared visibility hook follows zoom in paused menus, repeated resize and zone changes',()=>{
 const main=fs.readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),source=main.slice(main.indexOf('function updateCameraVisibility('),main.indexOf('function showSessionRecovery('));const scene=new THREE.Scene();scene.fog=new THREE.Fog('#a7c8b4',45,95);const camera=new THREE.PerspectiveCamera(42,16/9,.1,C.far),state={regional:{},zone:'valley'},cameraTarget=new THREE.Vector3(3,1,4);let landscapeCalls=0,waterCalls=0;const terrain={update(b:any,keys:Set<string>){landscapeCalls++;assert.deepEqual([...keys],['region:0:0']);assert(b.maxX>b.minX);}},water={update(){waterCalls++;}};
 const make=new Function('THREE','zoomAtmosphere','cameraGroundFootprint','cameraLandscapeFootprint','state','scene','camera','cameraTarget','regionalLandscape','scenicWater','regionalConfirmedObstacles',stripTypeScriptTypes(`function harness(){let zoom=36,orbit=.6,labActive=false;${source};return {update:updateCameraVisibility,set(z,l=false){zoom=z;labActive=l;}};}`,{mode:'transform'})+';return harness();');const h=make(THREE,zoomAtmosphere,cameraGroundFootprint,cameraLandscapeFootprint,state,scene,camera,cameraTarget,terrain,water,new Map([['region:0:0',[]]]));const identity=scene.fog;
 for(let repetition=0;repetition<10;repetition++)for(const aspect of [9/16,16/9,4]){camera.aspect=aspect;for(const zoom of [17,36,58,42,28,58,17]){h.set(zoom);h.update();assert.equal(scene.fog,identity);assert.equal(scene.fog.near,zoomAtmosphere(zoom,true).near);}}
 const calls=landscapeCalls;state.zone='cave';h.set(17);h.update();assert.equal(scene.fog.near,65);assert.equal(landscapeCalls,calls);state.zone='valley';h.set(17,true);h.update();assert.equal(scene.fog.near,55);assert.equal(landscapeCalls,calls);h.set(58);h.update();assert.equal(scene.fog.near,513);assert.equal(landscapeCalls,calls+1);assert.equal(waterCalls,landscapeCalls);
 assert(main.indexOf('camera.lookAt(cameraTarget);updateCameraVisibility(framing.distance);')<main.indexOf('drawMap();renderer.render(scene,camera)'));
 assert(main.includes('if(!event.persisted){regionalStreamer?.dispose();regionalLandscape?.dispose();regionalSupplyView?.dispose();regionalTradeView?.dispose();regionalFoodView?.dispose();scenicWater.dispose();}'));
});
test('actual pagehide retains renderer scenery for BFCache and disposes on final unload; startup primes before showing play',()=>{
 const main=fs.readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),start=main.indexOf("addEventListener('pagehide',(event:PageTransitionEvent)=>"),source=main.slice(start,main.indexOf('\nfunction recordRegionalTravel',start));const counts={stream:0,land:0,supply:0,trade:0,food:0,water:0,abort:0};let handler:(e:{persisted:boolean})=>void=()=>{};
 new Function('addEventListener','regionalStreamer','regionalLandscape','scenicWater','regionalCalibrationController','regionalSupplyView','regionalTradeView','regionalFoodView',stripTypeScriptTypes(source,{mode:'transform'}))((_event:string,h:typeof handler)=>{handler=h;},{dispose(){counts.stream++;}},{dispose(){counts.land++;}},{dispose(){counts.water++;}},{abort(){counts.abort++;}},{dispose(){counts.supply++;}},{dispose(){counts.trade++;}},{dispose(){counts.food++;}});handler({persisted:true});assert.deepEqual(counts,{stream:0,land:0,supply:0,trade:0,food:0,water:0,abort:1});handler({persisted:false});assert.deepEqual(counts,{stream:1,land:1,supply:1,trade:1,food:1,water:1,abort:2});
 const boot=main.slice(main.indexOf('async function start(){'),main.indexOf('// Read-only inspection hook'));assert(boot.indexOf('updateCameraVisibility()')<boot.indexOf('renderer.compileAsync'));assert(boot.indexOf('renderer.render(scene,camera)')<boot.indexOf("$('loading').remove();startup.ready();renderer.setAnimationLoop(frame)"));const show=main.slice(main.indexOf('function showZone(){'),main.indexOf('function restoreWorld('));assert(show.includes('cameraTarget.copy(targetPosition);cameraTarget.y+=1;'));
});
