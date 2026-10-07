/** Explicit local evidence from real game render callbacks. No storage or networking. */
import type {TownActivityReport} from './town-activity.ts';
import type {TownLifeState} from './town-life.ts';
import {TOWN_LIFE_MOTION_VERSION} from './town-life.ts';
import type {CrowdPose} from './town-crowd.ts';
import {sameTownLayout,type TownLayout,TOWN_CENTER} from './starting-town.ts';
export const TOWN_MOTION_CAPTURE={version:1,seconds:15,maxFrames:3600,subjects:4} as const;
type Point=[number,number];
export interface TownMotionSubject {index:number;status:string;action:string|null;reason:string;facility:string|null;next:Point|null;authority:Point;target:Point;display:Point;speed:number;distance:number;yielding:boolean;visible:boolean}
export interface TownMotionFrame {frame:number;seconds:number;dt:number;authorityTick:number;authorityFraction:number;renderTime:number;paused:boolean;mode:'solo'|'online';observer:Point;camera:[number,number,number];counts:{traveling:number;acting:number;queued:number;idle:number;visible:number};subjects:TownMotionSubject[]}
export interface TownMotionReport {townLayout?:TownLayout;kind:'axiom-town-motion';version:1;motionVersion:number;status:'idle'|'recording'|'completed'|'interrupted';reason:string|null;seed:number;source:string;selected:number;subjects:number[];duration:number;frames:TownMotionFrame[];scope:string}
const number=(n:number)=>Number.isFinite(n)?Math.round(n*100000)/100000:0;
const point=(p:{x:number;z:number}):Point=>[number(p.x),number(p.z)];
const fresh=():TownMotionReport=>({kind:'axiom-town-motion',version:1,motionVersion:TOWN_LIFE_MOTION_VERSION,status:'idle',reason:null,seed:0,source:'not-recorded',selected:0,subjects:[],duration:0,frames:[],scope:'Explicit local capture of actual game render callbacks. Numeric root trajectories and separate game-canvas contact sheet; no automatic visual approval. Contains only town activity/position evidence, no inventory, saves, account, room IDs/tokens or network data. No automatic upload. Timestamped render interpolation trails completed authority steps by half a second; an online underrun may prime one additional quarter-second reserve.'});
export class TownMotionRecorder {
 private value=fresh();private started=0;
 get active(){return this.value.status==='recording';}
 get status(){return this.value.status;}
 get duration(){return this.value.duration;}
 get frameCount(){return this.value.frames.length;}
 arm(seed:number,source:string,selected:number,observer:{x:number;z:number},life:TownLifeState,now:number){
  if(!Number.isInteger(selected)||selected<0||selected>=100||life.seed!==seed||!Number.isFinite(now))throw Error('Choose a current resident and a ready town.');
  const nearby=life.residents.map(r=>({index:r.index,d:Math.hypot(r.x-observer.x,r.z-observer.z)})).sort((a,b)=>a.d-b.d||a.index-b.index);
  this.value={...fresh(),...(life.townLayout?{townLayout:life.townLayout}:{}),status:'recording',seed,source:/^[\w.-]{1,100}$/.test(source)?source:'not-recorded',selected,subjects:[selected,...nearby.filter(r=>r.index!==selected).slice(0,TOWN_MOTION_CAPTURE.subjects-1).map(r=>r.index)]};this.started=now;
 }
 stop(reason='Stopped by player'){if(this.active){this.value.status='interrupted';this.value.reason=reason;}}
 record(input:{now:number;dt:number;seed:number;life:TownLifeState|undefined;poses:readonly CrowdPose[];targets:readonly CrowdPose[];visible:readonly number[];renderTime:number;paused:boolean;mode:'solo'|'online';observer:{x:number;z:number};camera:{x:number;y:number;z:number}}){
  if(!this.active)return;
  if(input.seed!==this.value.seed||!input.life||!sameTownLayout(input.life.townLayout,this.value.townLayout)){this.stop('World or town changed');return;}
  const prior=this.value.frames.at(-1);if(prior&&input.life.tick<prior.authorityTick){this.stop('Authority time restarted');return;}
  const elapsed=Math.max(0,(input.now-this.started)/1000);if(!Number.isFinite(elapsed)){this.stop('Invalid callback time');return;}
  const life=input.life,counts={traveling:0,acting:0,queued:0,idle:0,visible:input.visible.length};for(const r of life.residents)counts[r.status]++;
  const subjects:TownMotionSubject[]=this.value.subjects.map(index=>{const r=life.residents[index]!,p=input.poses[index],t=input.targets[index],next=r.path[r.pathIndex];
   const reason=r.status==='acting'?'Performing the reserved activity':r.status==='traveling'?'Following the reserved service route':r.status==='queued'?'Waiting for a service slot':'Choosing an available activity';
   return {index,status:r.status,action:r.action,reason,facility:r.facilityId,next:next?point(next):null,authority:point(r),target:point(t??r),display:point(p??r),speed:number(p?.speed??0),distance:number(p?.distance??0),yielding:p?.yielding??false,visible:input.visible.includes(index)};
  });
  this.value.frames.push({frame:this.value.frames.length,seconds:number(elapsed),dt:number(input.dt),authorityTick:life.tick,authorityFraction:number(life.accumulator),renderTime:number(input.renderTime),paused:input.paused,mode:input.mode,observer:point(input.observer),camera:[number(input.camera.x),number(input.camera.y),number(input.camera.z)],counts,subjects});this.value.duration=number(elapsed);
  if(elapsed>=TOWN_MOTION_CAPTURE.seconds||this.value.frames.length>=TOWN_MOTION_CAPTURE.maxFrames){this.value.status='completed';this.value.reason=elapsed>=TOWN_MOTION_CAPTURE.seconds?'15-second recording finished':'Bounded render-frame limit reached';}
 }
 report():TownMotionReport{return structuredClone(this.value);}
 clear(){this.value=fresh();}
}
export function mountTownMotionPanel(panel:HTMLElement,options:{selected:number;report:()=>TownMotionReport;revision?:()=>string;activity?:()=>TownActivityReport;start:(selected:number)=>void;stop:()=>void;clear:()=>void;downloadJSON:(r:TownMotionReport)=>void;downloadPNG:()=>void;captureSummary:()=>string;close:()=>void}){
 let alive=true,last=-1,cached:TownMotionReport|undefined,cachedRevision:string|undefined;
 const read=()=>{const key=options.revision?.();if(!cached||key===undefined||key!==cachedRevision){cached=options.report();cachedRevision=key;}return cached;};
 panel.innerHTML='<button class="close" aria-label="Close motion report">×</button><span class="eyebrow">Local game evidence</span><h2>Town activity & movement</h2><h3>Automatic population check</h3><p>The first 15 active seconds and the latest 15-second window check all 100 residents: authority, routes, real body matrices and camera-frustum inclusion. The report separates achieved walking, visible task gestures, resting, waiting, quiet stations and blocked routes, as well as callback rate and display lag. Visible task gestures require at least 18 cm of measured hand motion while the action actually progresses. A changed body matrix can be tiny breathing; it does not establish visible animation or a bustling town. These are code checks, not automatic visual approval.</p><pre id="motion-activity"></pre><button id="motion-activity-export">Export population check</button><h3>Record the game</h3><p>Choose a resident in the Town directory, then record here. The game resumes for 15 seconds and records that person plus three nearby residents on each actual render callback, with 12 game-canvas images. Walk or turn the camera to show the problem. Nothing uploads automatically.</p><div class="row"><button id="motion-start">Record 15 seconds &amp; return to game</button><button id="motion-stop">Stop recording</button><button id="motion-clear">Discard recording</button></div><p id="motion-status" role="status"></p><label for="motion-frame">Replay recorded frame</label><input id="motion-frame" type="range" min="0" max="0" step="1" value="0"><canvas id="motion-map" width="640" height="280" aria-label="Recorded town root paths: white displayed, gold authority, teal next waypoint"></canvas><p>This is a replay of recorded positions, not a new simulation. White is the displayed root, gold the authoritative position and teal the next route waypoint. The image sheet contains actual game-canvas pixels, without interface overlays.</p><div class="row"><button id="motion-json">Download motion JSON</button><button id="motion-png">Download game image sheet</button></div><label for="motion-text">Motion JSON · copy fallback</label><textarea id="motion-text" rows="6" readonly></textarea><pre id="motion-details"></pre>';
 const q=<T extends HTMLElement>(id:string)=>panel.querySelector<T>('#'+id)!;
 function draw(){if(!alive)return;const r=read(),slider=q<HTMLInputElement>('motion-frame');slider.max=String(Math.max(0,r.frames.length-1));if(last!==r.frames.length){slider.value=slider.max;last=r.frames.length;}
  q('motion-stop').toggleAttribute('disabled',r.status!=='recording');q('motion-json').toggleAttribute('disabled',!r.frames.length);q('motion-png').toggleAttribute('disabled',!r.frames.length);
  q('motion-status').textContent=`${r.status} · ${r.duration.toFixed(1)} seconds · ${r.frames.length} render callbacks · ${options.captureSummary()}`;
  const activity=options.activity?.();q('motion-activity').textContent=activity?JSON.stringify({status:activity.status,callbackAgeSeconds:activity.callbackAgeSeconds,callbackGaps:activity.callbackGaps,paused:activity.paused,opening:activity.openingSummary,recent:activity.recentSummary},null,2):'Population evidence is available during live gameplay.';
  const frame=r.frames[Number(slider.value)];q('motion-details').textContent=frame?JSON.stringify(frame,null,2):'No recording yet. Start while near the town.';
  const ctx=q<HTMLCanvasElement>('motion-map').getContext('2d');if(!ctx)return;ctx.fillStyle='#12382f';ctx.fillRect(0,0,640,280);if(!frame)return;
  const xy=(p:Point)=>[320+(p[0]-TOWN_CENTER.x)*5.5,140+(p[1]-TOWN_CENTER.z)*2.65] as const;
  for(const subject of frame.subjects){ctx.strokeStyle='#ffffff80';ctx.beginPath();for(const prior of r.frames.slice(Math.max(0,frame.frame-120),frame.frame+1)){const p=prior.subjects.find(p=>p.index===subject.index);if(p){const [x,y]=xy(p.display);ctx.lineTo(x,y);}}ctx.stroke();for(const [p,color] of [[subject.target,'#c982de'],[subject.authority,'#efd389'],[subject.display,'#ffffff'],[subject.next,'#76ddd0']] as const){if(!p)continue;const[x,y]=xy(p);ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();}const[x,y]=xy(subject.display);ctx.fillStyle='#ffffff';ctx.font='12px sans-serif';ctx.fillText(String(subject.index),x+5,y-5);}
 }
 panel.querySelector<HTMLButtonElement>('.close')!.onclick=options.close;q('motion-start').onclick=()=>options.start(options.selected);q('motion-stop').onclick=()=>{options.stop();draw();};q('motion-clear').onclick=()=>{options.clear();q<HTMLTextAreaElement>('motion-text').value='';draw();};q<HTMLInputElement>('motion-frame').oninput=draw;
 q('motion-activity-export').onclick=()=>{const r=options.activity?.();if(!r)return;q<HTMLTextAreaElement>('motion-text').value=JSON.stringify(r);try{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'}));a.href=url;a.download='axiom-town-activity.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{q('motion-status').textContent='Download unavailable. Copy the JSON text below.';}};
 q('motion-json').onclick=()=>{const r=options.report();q<HTMLTextAreaElement>('motion-text').value=JSON.stringify(r);try{options.downloadJSON(r);}catch{q('motion-status').textContent='Download unavailable. Copy the JSON text below.';}};
 q('motion-png').onclick=()=>{try{options.downloadPNG();}catch{q('motion-status').textContent='Image download unavailable. The numeric JSON still records the movement.';}};
 draw();const timer=setInterval(draw,500);return()=>{alive=false;clearInterval(timer);};
}
