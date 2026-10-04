import type {State} from './world.ts';
import {
 createWorldMapModel,worldMapIdentity,worldMapBounds,worldMapPlayer,createWorldMapRasterJob,
 worldToMap,mapToWorld,mapScale,fitWorldMap,constrainMapViewport,zoomWorldMap,panWorldMap,focusWorldMap,mapVisibleBounds,mapScaleBar,formatMapArea,formatMapDistance,
 type WorldMapModel,type MapViewport,type MapMarker,type MapMarkerKind,type MapBounds,type MapRaster,type MapPoint,
} from './world-map.ts';

export interface WorldMapOverlayMarker {id:string;name:string;x:number;z:number;detail:string;kind:'resource'|'carrier'|'repair'|'project'|'farm'|'pantry'|'habitat';targetId:string;local?:boolean;inspectLabel?:string}
export interface WorldMapOverlay {markers:WorldMapOverlayMarker[];routes:{id:string;points:readonly MapPoint[];blocked:boolean}[]}
export interface WorldMapPanelOptions {getState:()=>State;close:()=>void;back?:()=>void;continuesInMenus?:boolean;markerDetail?:(marker:MapMarker,state:State)=>string|undefined;inspectOutpost?:(id:string)=>void;getOverlay?:(state:State)=>WorldMapOverlay;inspectOverlay?:(targetId:string)=>void}
type AtlasMarker=MapMarker|WorldMapOverlayMarker;
const OVERLAY_COLORS={resource:'#9ed8b0',carrier:'#83d9e9',repair:'#f3a779',project:'#dbbded',farm:'#b9dc83',pantry:'#efc781',habitat:'#88c7ab'};
const isOverlay=(marker:AtlasMarker):marker is WorldMapOverlayMarker=>'targetId'in marker;
const markerColor=(marker:AtlasMarker)=>isOverlay(marker)?OVERLAY_COLORS[marker.kind]:COLORS[marker.kind];
const COLORS:Record<MapMarkerKind,string>={settlement:'#f3d394',outpost:'#e9cf99',lookout:'#c5dbb5',ruin:'#d6ab8c',entrance:'#b9d9e5',pump:'#77dfd2',workshop:'#c6bda6',spawn:'#d1e7c0'};
const LABELS:Record<MapMarkerKind,string>={settlement:'Settlement',outpost:'Shelter',lookout:'Lookout',ruin:'Ruins',entrance:'Cave / arch',pump:'Waterworks',workshop:'Workshop',spawn:'Arrival camp'};
const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
interface RasterLayer {canvas:HTMLCanvasElement;bounds:MapBounds}
interface LabelRect {x:number;y:number;width:number;height:number}
const overlaps=(a:LabelRect,b:LabelRect)=>a.x<b.x+b.width+5&&a.x+a.width+5>b.x&&a.y<b.y+b.height+3&&a.y+a.height+3>b.y;

/** Owns only a bounded 2D canvas and event handlers. Call its disposer on every panel replacement. */
export function mountWorldMapPanel(panel:HTMLElement,options:WorldMapPanelOptions):()=>void {
 let state=options.getState(),model=createWorldMapModel(state),disposed=false,raf=0,baseTimer=0,detailTimer=0,detailEpoch=0;
 let overlay:WorldMapOverlay=options.getOverlay?.(state)??{markers:[],routes:[]};
 const markers=():AtlasMarker[]=>[...model.markers,...overlay.markers];
 let base:RasterLayer|null=null,detail:RasterLayer|null=null,view:MapViewport=fitWorldMap(640,440),dirty=true,selected:string|null=null,lastPlayer='',lastPoll=0;
 panel.classList.add('world-map-panel');
 panel.innerHTML=`<button class="close" aria-label="Close world map">×</button><header class="world-map-header"><span class="eyebrow">FIELD ATLAS · WHOLE WORLD</span><h2>World map</h2><p class="world-map-meta"></p></header><p class="world-map-status" role="status"></p><div class="world-map-tools"><button type="button" data-map-action="out" aria-label="Zoom out">−</button><button type="button" data-map-action="in" aria-label="Zoom in">+</button><button type="button" data-map-action="fit">Fit world</button><button type="button" data-map-action="player">Locate me</button><label>Destination <select aria-label="Find a map destination"><option value="">Choose a landmark…</option></select></label>${options.back?'<button type="button" data-map-action="back">Back to menu</button>':''}</div><div class="world-map-viewport"><canvas class="world-map-canvas" tabindex="0" role="img" aria-label="Interactive whole-world map. North is up. Drag to pan; use arrow keys, plus and minus to zoom, zero to fit, and P to locate yourself." aria-describedby="world-map-help"></canvas><span class="world-map-loading" role="status">Surveying terrain…</span></div><p class="world-map-caption" aria-live="polite">Choose a destination or select a map marker to inspect it</p><ul class="world-map-legend" aria-label="Map legend"><li><span class="world-map-key" style="background:#fff4bd"></span>You / surface entrance</li><li><span class="world-map-key" style="background:#77b9c3"></span>River</li><li><span class="world-map-key" style="background:#deca9b"></span>Road / trail</li>${(['settlement','outpost','lookout','ruin','entrance','pump','workshop'] as const).map(kind=>`<li><span class="world-map-key" style="background:${COLORS[kind]}"></span>${LABELS[kind]}</li>`).join('')}${options.getOverlay?'<li><span class="world-map-key" style="background:#9ed8b0"></span>Resource site</li><li><span class="world-map-key" style="background:#88c7ab"></span>Restoration habitat</li><li><span class="world-map-key" style="background:#83d9e9"></span>Carrier / freight road</li><li><span class="world-map-key" style="background:#f3a779"></span>Freight repair</li><li><span class="world-map-key" style="background:#dbbded"></span>Freight store</li><li><span class="world-map-key" style="background:#b9dc83"></span>Regional farm</li><li><span class="world-map-key" style="background:#efc781"></span>Food pantry / meal destination</li>':''}</ul><p id="world-map-help" class="world-map-help">Drag or use arrow keys to pan · Scroll / pinch or + − to zoom · 0 fit · P locate · M / Esc close. North is +Z; east is +X. ${options.continuesInMenus?'The online world keeps running while this map is open.':'Solo simulation is paused while this map is open.'}</p>`;
 const canvas=panel.querySelector<HTMLCanvasElement>('.world-map-canvas')!,viewport=panel.querySelector<HTMLElement>('.world-map-viewport')!,loading=panel.querySelector<HTMLElement>('.world-map-loading')!,status=panel.querySelector<HTMLElement>('.world-map-status')!,meta=panel.querySelector<HTMLElement>('.world-map-meta')!,caption=panel.querySelector<HTMLElement>('.world-map-caption')!,select=panel.querySelector<HTMLSelectElement>('select')!;
 const ctx=canvas.getContext('2d');
 if(!ctx){loading.textContent='This device could not open the 2D map canvas.';const close=panel.querySelector<HTMLButtonElement>('.close')!;close.onclick=options.close;return ()=>{close.onclick=null;panel.classList.remove('world-map-panel');};}
 const context:CanvasRenderingContext2D=ctx;
 canvas.style.touchAction='none';canvas.style.width='100%';canvas.style.height='100%';canvas.style.display='block';
 // Essential sizing survives a missing stylesheet and does not pin desktop pixel dimensions.
 viewport.style.position='relative';viewport.style.minHeight='260px';
 const abort=new AbortController(),events={signal:abort.signal},pointers=new Map<number,{x:number;y:number}>();
 let pointerStart:{x:number;y:number}|null=null,gestureMoved=false;
 function populate(){
  meta.textContent=`${model.title} · ${formatMapArea(model.area)} · ${formatMapDistance(model.bound*2)} each side · seed ${state.seed}`;
  select.innerHTML='<option value="">Choose a landmark…</option>'+markers().map(marker=>`<option value="${escape(marker.id)}">${escape(marker.name)}</option>`).join('');
 }
 populate();
 function rasterLayer(raster:MapRaster):RasterLayer {
  const surface=document.createElement('canvas');surface.width=raster.width;surface.height=raster.height;
  const surfaceContext=surface.getContext('2d');if(!surfaceContext)throw new Error('Could not create map terrain canvas');
  const pixels=surfaceContext.createImageData(raster.width,raster.height);pixels.data.set(raster.rgba);surfaceContext.putImageData(pixels,0,0);
  return {canvas:surface,bounds:raster.bounds};
 }
 function releaseLayer(layer:RasterLayer|null){if(layer){layer.canvas.width=1;layer.canvas.height=1;}}
 function prepareBase(){
  window.clearTimeout(baseTimer);loading.hidden=false;loading.textContent='Surveying terrain…';
  const job=createWorldMapRasterJob(model,224),identity=model.identity;
  const next=()=>{if(disposed||model.identity!==identity)return;try{const raster=job.step(4);if(raster){releaseLayer(base);base=rasterLayer(raster);loading.hidden=true;dirty=true;scheduleDetail();}else baseTimer=window.setTimeout(next,0);}catch{loading.textContent='Terrain shading unavailable. Roads and landmarks are still shown.';dirty=true;}};
  baseTimer=window.setTimeout(next,0);
 }
 function scheduleDetail(){
  const epoch=++detailEpoch;window.clearTimeout(detailTimer);
  if(view.zoom<3||!base){releaseLayer(detail);detail=null;return;}
  detailTimer=window.setTimeout(()=>{
   if(disposed||epoch!==detailEpoch)return;
   const job=createWorldMapRasterJob(model,192,mapVisibleBounds(model,view));
   const next=()=>{if(disposed||epoch!==detailEpoch)return;try{const raster=job.step(4);if(raster){releaseLayer(detail);detail=rasterLayer(raster);dirty=true;}else detailTimer=window.setTimeout(next,0);}catch{/* A vector map remains useful if an optional detail sample cannot be built. */}};
   next();
  },180);
 }
 function setView(next:MapViewport){view=next;dirty=true;scheduleDetail();}
 function resize(){if(disposed)return;const box=viewport.getBoundingClientRect(),width=Math.max(1,Math.round(box.width)),height=Math.max(260,Math.round(box.height)),ratio=Math.min(2,window.devicePixelRatio||1);
  if(canvas.width!==Math.round(width*ratio)||canvas.height!==Math.round(height*ratio)){canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);setView(constrainMapViewport(model,{...view,width,height}));}
 }
 const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(resize);observer?.observe(viewport);window.addEventListener('resize',resize,events);
 function locate(){const player=worldMapPlayer(model,options.getState());selected=null;select.value='';if(inspect)inspect.hidden=true;caption.textContent=player.description;setView(focusWorldMap(model,view,player,model.regional?20:2));}
 function describeSelection(){const marker=markers().find(m=>m.id===selected);if(!marker)return;caption.textContent=`${marker.name} · ${isOverlay(marker)?marker.detail:options.markerDetail?.(marker,state)??marker.detail} · ${Math.round(marker.x)} m east, ${Math.round(marker.z)} m north`;if(inspect){inspect.hidden=isOverlay(marker)?!options.inspectOverlay:marker.kind!=='outpost'||!options.inspectOutpost;inspect.textContent=isOverlay(marker)?marker.inspectLabel??'Resource route & freight':'Settlement supplies & project';}}
 const inspect=options.inspectOutpost||options.inspectOverlay?document.createElement('button'):null;
 if(inspect){inspect.type='button';inspect.textContent='Settlement supplies & project';inspect.hidden=true;caption.after(inspect);inspect.addEventListener('click',()=>{const marker=markers().find(m=>m.id===selected);if(marker&&isOverlay(marker))options.inspectOverlay?.(marker.targetId);else if(marker?.kind==='outpost')options.inspectOutpost?.(marker.id);},events);}
 function choose(marker:AtlasMarker){selected=marker.id;select.value=marker.id;describeSelection();setView(focusWorldMap(model,view,marker,Math.max(view.zoom,model.regional?marker.local?24:5:2)));}
 panel.querySelector<HTMLButtonElement>('.close')!.addEventListener('click',options.close,events);
 panel.querySelectorAll<HTMLButtonElement>('[data-map-action]').forEach(button=>button.addEventListener('click',()=>{
  switch(button.dataset.mapAction){case 'in':setView(zoomWorldMap(model,view,1.5));break;case 'out':setView(zoomWorldMap(model,view,1/1.5));break;case 'fit':selected=null;select.value='';if(inspect)inspect.hidden=true;caption.textContent='Whole world fitted to view';setView(fitWorldMap(view.width,view.height));break;case 'player':locate();break;case 'back':options.back?.();break;}
 },events));
 select.addEventListener('change',()=>{const marker=markers().find(m=>m.id===select.value);if(marker)choose(marker);},events);
 function eventPoint(event:{clientX:number;clientY:number}){const rect=canvas.getBoundingClientRect();return {x:(event.clientX-rect.left)*view.width/Math.max(1,rect.width),y:(event.clientY-rect.top)*view.height/Math.max(1,rect.height)};}
 function markerVisible(marker:AtlasMarker){return !model.regional||!marker.local||view.zoom>=5||marker.id===selected;}
 canvas.addEventListener('wheel',event=>{event.preventDefault();const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?view.height:1);setView(zoomWorldMap(model,view,Math.exp(Math.max(-1,Math.min(1,-delta*.002))),eventPoint(event)));},{...events,passive:false});
 canvas.addEventListener('dblclick',event=>{event.preventDefault();setView(zoomWorldMap(model,view,2,eventPoint(event)));},events);
 canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;event.preventDefault();canvas.focus({preventScroll:true});const point=eventPoint(event);pointers.set(event.pointerId,point);canvas.setPointerCapture(event.pointerId);if(pointers.size===1){pointerStart=point;gestureMoved=false;}else gestureMoved=true;canvas.style.cursor='grabbing';
 },events);
 canvas.addEventListener('pointermove',event=>{
  const old=pointers.get(event.pointerId);if(!old)return;event.preventDefault();const point=eventPoint(event),previous=[...pointers.values()];pointers.set(event.pointerId,point);
  if(pointerStart&&Math.hypot(point.x-pointerStart.x,point.y-pointerStart.y)>5)gestureMoved=true;
  if(pointers.size===1){setView(panWorldMap(model,view,point.x-old.x,point.y-old.y));return;}
  const current=[...pointers.values()],a=previous[0]!,b=previous[1]!,c=current[0]!,d=current[1]!,oldMid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},newMid={x:(c.x+d.x)/2,y:(c.y+d.y)/2},oldDistance=Math.hypot(a.x-b.x,a.y-b.y),newDistance=Math.hypot(c.x-d.x,c.y-d.y);
  if(oldDistance>2&&newDistance>2)setView(panWorldMap(model,zoomWorldMap(model,view,newDistance/oldDistance,oldMid),newMid.x-oldMid.x,newMid.y-oldMid.y));
 },events);
 function releasePointer(event:PointerEvent){
  if(!pointers.has(event.pointerId))return;
  if(event.type==='pointerup'&&!gestureMoved&&pointers.size===1){const point=eventPoint(event),nearest=markers().filter(markerVisible).map(marker=>({marker,p:worldToMap(model,view,marker)})).map(item=>({...item,distance:Math.hypot(item.p.x-point.x,item.p.y-point.y)})).sort((a,b)=>a.distance-b.distance)[0];if(nearest&&nearest.distance<20)choose(nearest.marker);else{const where=mapToWorld(model,view,point);if(Math.abs(where.x)<=model.bound&&Math.abs(where.z)<=model.bound)caption.textContent=`Survey point · ${Math.round(where.x)} m east, ${Math.round(where.z)} m north`;}}
  pointers.delete(event.pointerId);if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);if(pointers.size===0){pointerStart=null;canvas.style.cursor='grab';}else gestureMoved=true;
 }
 canvas.addEventListener('pointerup',releasePointer,events);canvas.addEventListener('pointercancel',releasePointer,events);canvas.addEventListener('lostpointercapture',releasePointer,events);
 canvas.addEventListener('keydown',event=>{
  const pan=event.shiftKey?100:44;
  switch(event.key){case '+':case '=':setView(zoomWorldMap(model,view,1.4));break;case '-':case '_':setView(zoomWorldMap(model,view,1/1.4));break;case '0':setView(fitWorldMap(view.width,view.height));break;case 'p':case 'P':locate();break;case 'ArrowLeft':setView(panWorldMap(model,view,pan,0));break;case 'ArrowRight':setView(panWorldMap(model,view,-pan,0));break;case 'ArrowUp':setView(panWorldMap(model,view,0,pan));break;case 'ArrowDown':setView(panWorldMap(model,view,0,-pan));break;default:return;}
  event.preventDefault();event.stopPropagation();
 },events);
 function drawLayer(layer:RasterLayer){const a=worldToMap(model,view,{x:layer.bounds.minX,z:layer.bounds.maxZ}),b=worldToMap(model,view,{x:layer.bounds.maxX,z:layer.bounds.minZ});context.drawImage(layer.canvas,a.x,a.y,b.x-a.x,b.y-a.y);}
 function glyph(marker:AtlasMarker,x:number,y:number,selectedMarker=false){
  const kind=marker.kind;context.lineWidth=1.5;context.strokeStyle='#243f37';context.fillStyle=markerColor(marker);context.beginPath();
  if(kind==='entrance'||kind==='spawn'||kind==='carrier'){context.moveTo(x,y-6);context.lineTo(x+6,y+5);context.lineTo(x-6,y+5);context.closePath();}
  else if(kind==='ruin'||kind==='repair'){context.moveTo(x,y-6);context.lineTo(x+6,y);context.lineTo(x,y+6);context.lineTo(x-6,y);context.closePath();}
  else if(kind==='lookout'||kind==='pump'||kind==='resource'||kind==='farm')context.arc(x,y,5,0,Math.PI*2);
  else context.rect(x-5,y-5,10,10);
  context.fill();context.stroke();
  if(kind==='lookout'){context.beginPath();context.moveTo(x-3,y);context.lineTo(x+3,y);context.moveTo(x,y-3);context.lineTo(x,y+3);context.stroke();}
  if(selectedMarker){context.strokeStyle='#fff2ba';context.lineWidth=2;context.beginPath();context.arc(x,y,10,0,Math.PI*2);context.stroke();}
 }
 function draw(){
  const scale=mapScale(model,view),ratio=canvas.width/view.width;
  context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,view.width,view.height);context.fillStyle='#142d2a';context.fillRect(0,0,view.width,view.height);
  const nw=worldToMap(model,view,{x:-model.bound,z:model.bound}),se=worldToMap(model,view,{x:model.bound,z:-model.bound});
  context.save();context.beginPath();context.rect(nw.x,nw.y,se.x-nw.x,se.y-nw.y);context.clip();context.fillStyle='#688869';context.fillRect(nw.x,nw.y,se.x-nw.x,se.y-nw.y);
  if(base)drawLayer(base);if(detail&&view.zoom>=3)drawLayer(detail);
  const path=(points:readonly MapPoint[],width:number,color:string)=>{context.lineWidth=width;context.strokeStyle=color;context.lineCap='round';context.lineJoin='round';context.beginPath();points.forEach((point,i)=>{const p=worldToMap(model,view,point);if(i)context.lineTo(p.x,p.y);else context.moveTo(p.x,p.y);});context.stroke();};
  for(const river of model.water)path(river.points,Math.max(2,river.width*scale),'#77b9c3');
  for(const road of model.roads){path(road.points,Math.max(2.3,road.width*scale+1),'#706e50');path(road.points,Math.max(1.2,road.width*scale),'#deca9b');}
  for(const route of overlay.routes){context.setLineDash(route.blocked?[4,5]:[7,4]);path(route.points,2,route.blocked?'#e59b70':'#79cbd7');}context.setLineDash([]);
  context.fillStyle='#ddc894';context.strokeStyle='#5e6249';context.lineWidth=1;
  for(const building of model.buildings){if(building.width*scale<2)continue;const p=worldToMap(model,view,{x:building.x-building.width/2,z:building.z+building.depth/2});context.fillRect(p.x,p.y,building.width*scale,building.depth*scale);context.strokeRect(p.x,p.y,building.width*scale,building.depth*scale);}
  if(model.coreBound){const a=worldToMap(model,view,{x:-model.coreBound,z:model.coreBound}),b=worldToMap(model,view,{x:model.coreBound,z:-model.coreBound});context.strokeStyle='#f4e0a2';context.lineWidth=1.2;context.setLineDash([4,4]);context.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);context.setLineDash([]);}
  context.restore();context.strokeStyle='#8caa8d';context.lineWidth=1;context.strokeRect(nw.x,nw.y,se.x-nw.x,se.y-nw.y);
  const labels:LabelRect[]=[{x:view.width-65,y:9,width:56,height:62},{x:12,y:view.height-49,width:160,height:40}];
  function label(text:string,x:number,y:number,color='#f5edd4',force=false,font='11px system-ui'){
   context.font=font;const width=context.measureText(text).width+10,height=19,rect={x:Math.max(5,Math.min(view.width-width-5,x)),y:y-13,width,height};
   if(x+width<0||x>view.width||y<14||y>view.height-10||(!force&&labels.some(other=>overlaps(rect,other))))return;
   context.fillStyle='rgba(20,42,35,.82)';context.fillRect(rect.x,rect.y,rect.width,rect.height);context.fillStyle=color;context.fillText(text,rect.x+5,rect.y+13);labels.push(rect);
  }
  const player=worldMapPlayer(model,state),p=worldToMap(model,view,player),playerInView=p.x>=8&&p.x<=view.width-8&&p.y>=8&&p.y<=view.height-8;
  if(playerInView)label(player.underground?'Your surface entrance':'You',p.x+13,p.y-8,'#fff4bd',true,'bold 12px system-ui');
  const visibleMarkers=markers().filter(markerVisible).sort((a,b)=>Number(b.id===selected)-Number(a.id===selected));
  for(const marker of visibleMarkers){const pos=worldToMap(model,view,marker);if(pos.x< -12||pos.y< -12||pos.x>view.width+12||pos.y>view.height+12)continue;glyph(marker,pos.x,pos.y,marker.id===selected);label(marker.name,pos.x+10,pos.y-7,markerColor(marker),marker.id===selected);}
  if(model.regional&&view.zoom<5){const core=worldToMap(model,view,{x:0,z:0});label('Verdant Reach · starting valley',core.x+12,core.y+27,'#f4e0a2');}
  if(view.zoom<=2)for(const region of model.regions){const pos=worldToMap(model,view,region);label(region.name.toUpperCase(),pos.x-65,pos.y,'#dce8cf',false,'10px system-ui');}
  if(playerInView){context.fillStyle='#fff4bd';context.strokeStyle='#253f37';context.lineWidth=2;context.beginPath();context.arc(p.x,p.y,6,0,Math.PI*2);context.fill();context.stroke();context.strokeStyle='#fff4bd';context.lineWidth=1.5;context.beginPath();context.arc(p.x,p.y,10,0,Math.PI*2);context.stroke();if(player.underground){context.fillStyle='#253f37';context.fillRect(p.x-2,p.y-2,4,4);}}
  // Fixed screen overlays remain legible at every scale and don't imply loaded 3D coverage.
  const northX=view.width-37;context.fillStyle='rgba(20,42,35,.87)';context.fillRect(northX-22,10,44,62);context.fillStyle='#f4eacb';context.font='bold 13px system-ui';context.textAlign='center';context.fillText('N',northX,28);context.beginPath();context.moveTo(northX,35);context.lineTo(northX+7,55);context.lineTo(northX,51);context.lineTo(northX-7,55);context.closePath();context.fill();context.textAlign='left';
  const bar=mapScaleBar(model,view,Math.min(120,view.width/3));context.fillStyle='rgba(20,42,35,.87)';context.fillRect(10,view.height-49,bar.pixels+28,39);context.strokeStyle='#f4eacb';context.lineWidth=2;context.beginPath();context.moveTo(21,view.height-25);context.lineTo(21+bar.pixels,view.height-25);context.moveTo(21,view.height-30);context.lineTo(21,view.height-20);context.moveTo(21+bar.pixels,view.height-30);context.lineTo(21+bar.pixels,view.height-20);context.stroke();context.fillStyle='#f4eacb';context.font='11px system-ui';context.fillText(bar.label,21,view.height-34);
  context.textAlign='right';context.fillStyle='#f4eacb';context.fillText(`${view.zoom.toFixed(1)}×`,view.width-14,view.height-15);context.textAlign='left';
 }
 function updatePlayer(){
  const previous=state;state=options.getState();
  if(options.getOverlay&&previous!==state){const next=options.getOverlay(state);const oldIds=overlay.markers.map(m=>m.id).join('|');overlay=next;dirty=true;if(oldIds!==overlay.markers.map(m=>m.id).join('|')){populate();select.value=selected??'';}}
  if(selected)describeSelection();else if(inspect)inspect.hidden=true;
  if(worldMapIdentity(state)!==model.identity){model=createWorldMapModel(state);overlay=options.getOverlay?.(state)??{markers:[],routes:[]};releaseLayer(base);releaseLayer(detail);base=null;detail=null;selected=null;setView(fitWorldMap(view.width,view.height));populate();prepareBase();}
  const player=worldMapPlayer(model,state),key=`${state.zone}:${player.x}:${player.z}`;
  if(key!==lastPlayer){lastPlayer=key;status.textContent=player.underground?player.description:`Surface survey · ${player.description} · All roads and landmarks shown`;
   canvas.setAttribute('aria-label',`${model.title}. ${player.description}. North is up. Drag to pan; use arrow keys, plus and minus to zoom, zero to fit, and P to locate yourself.`);dirty=true;
  }
 }
 function tick(now:number){if(disposed)return;if(!panel.contains(canvas)){dispose();return;}if(now-lastPoll>120){lastPoll=now;updatePlayer();}if(dirty){dirty=false;draw();}raf=requestAnimationFrame(tick);}
 function dispose(){if(disposed)return;disposed=true;abort.abort();observer?.disconnect();cancelAnimationFrame(raf);window.clearTimeout(baseTimer);window.clearTimeout(detailTimer);detailEpoch++;for(const id of pointers.keys())if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);pointers.clear();releaseLayer(base);releaseLayer(detail);base=null;detail=null;canvas.width=1;canvas.height=1;if(panel.contains(canvas))panel.classList.remove('world-map-panel');}
 resize();updatePlayer();prepareBase();canvas.style.cursor='grab';raf=requestAnimationFrame(tick);
 return dispose;
}
