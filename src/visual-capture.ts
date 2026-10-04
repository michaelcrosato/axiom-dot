/** Real framebuffer capture. Numeric pose checks are deliberately not visual evidence. */
export interface CapturePlan {scenario:string;ticks:readonly number[];maxTickLateness?:number}
export interface RenderSample {scenario:string;tick:number;label?:string;details?:Record<string,unknown>}
export interface CaptureEntry {requestedTick:number;actualTick:number|null;label:string;status:'captured'|'suspect'|'missed'|'failed';reason:string|null;details:Record<string,unknown>}
export interface CaptureReport {version:1;status:'idle'|'armed'|'completed'|'interrupted';scenario:string;startedAt:string|null;finishedAt:string|null;reason:string|null;metadata:Record<string,unknown>;entries:CaptureEntry[];visualReview:'not-reviewed';scope:string}
export interface CaptureOptions {metadata:()=>Record<string,unknown>;width?:number;height?:number;now?:()=>string;makeCanvas?:()=>HTMLCanvasElement}
export const CAPTURE_LIMIT=36;
export function normalizeCapturePlan(plan:CapturePlan):{scenario:string;ticks:number[];maxTickLateness:number}{
 if(!plan.scenario.trim()||plan.scenario.length>160)throw new Error('A short scenario identifier is required');
 if(plan.ticks.length===0||plan.ticks.length>CAPTURE_LIMIT||plan.ticks.some(t=>!Number.isSafeInteger(t)||t<0))throw new Error('Use 1–36 non-negative integer sample ticks');
 const ticks=[...new Set(plan.ticks)].sort((a,b)=>a-b);if(ticks.length!==plan.ticks.length)throw new Error('Capture ticks must be unique');
 const late=plan.maxTickLateness??0;if(!Number.isSafeInteger(late)||late<0||late>6)throw new Error('Capture lateness must be 0–6 ticks');
 return {scenario:plan.scenario,ticks,maxTickLateness:late};
}
/** Only one real image can represent a presented frame, even after a worker backlog. */
export function dueCaptureTicks(ticks:readonly number[],tick:number,lateness:number){
 const due=ticks.filter(t=>t<=tick),last=due.at(-1);return {missed:due.filter(t=>t!==last||tick-t>lateness),capture:last!==undefined&&tick-last<=lateness?last:null};
}
const bounded=(value:number|undefined,fallback:number)=>Math.max(120,Math.min(960,Math.round(value??fallback)));
export function createVisualCapture(source:HTMLCanvasElement,options:CaptureOptions){
 const make=options.makeCanvas??(()=>document.createElement('canvas')),now=options.now??(()=>new Date().toISOString());
 const width=bounded(options.width,480),height=bounded(options.height,270);let pending:number[]=[],lateness=0,lastTick=-1;
 let images=new Map<number,HTMLCanvasElement>();
 const fresh=():CaptureReport=>({version:1,status:'idle',scenario:'',startedAt:null,finishedAt:null,reason:null,metadata:{},entries:[],visualReview:'not-reviewed',scope:'Actual rendered game canvas only. HUD, touch ergonomics, live gameplay continuity and device performance are not certified by these images.'});
 let report=fresh();
 const snapshot=()=>structuredClone(report);
 const finish=(reason:string|null=null)=>{report.status=reason?'interrupted':'completed';report.finishedAt=now();report.reason=reason;};
 const missed=(tick:number,reason:string)=>report.entries.push({requestedTick:tick,actualTick:null,label:'Tick '+tick,status:'missed',reason,details:{}});
 function arm(plan:CapturePlan){const normalized=normalizeCapturePlan(plan);pending=normalized.ticks;images=new Map();lastTick=-1;lateness=normalized.maxTickLateness;report={...fresh(),status:'armed',scenario:normalized.scenario,startedAt:now(),metadata:structuredClone(options.metadata())};return snapshot();}
 function afterRender(sample:RenderSample){
  if(report.status!=='armed'||sample.scenario!==report.scenario||!Number.isSafeInteger(sample.tick)||sample.tick<0||sample.tick<=lastTick)return false;
  lastTick=sample.tick;const due=dueCaptureTicks(pending,sample.tick,lateness);for(const tick of due.missed)missed(tick,'No rendered frame within the allowed worker-tick window');pending=pending.filter(t=>t>sample.tick);
  if(due.capture!==null){const tick=due.capture;const entry:CaptureEntry={requestedTick:tick,actualTick:sample.tick,label:sample.label??'Tick '+sample.tick,status:'captured',reason:null,details:structuredClone(sample.details??{})};
   try{if(source.width<1||source.height<1)throw new Error('Source canvas has no drawable size');const out=make();out.width=width;out.height=height;const context=out.getContext('2d');if(!context)throw new Error('2D capture is unavailable');
    context.fillStyle='#101c22';context.fillRect(0,0,width,height);const scale=Math.min(width/source.width,height/source.height),w=source.width*scale,h=source.height*scale,x=(width-w)/2,y=(height-h)/2;
    // Call synchronously immediately after renderer.render. No preserveDrawingBuffer needed.
    context.drawImage(source,x,y,w,h);const pixels=context.getImageData(Math.floor(x),Math.floor(y),Math.max(1,Math.floor(w)),Math.max(1,Math.floor(h))).data;
    let opaque=0,min=Infinity,max=-Infinity;for(let i=0;i<pixels.length;i+=Math.max(4,Math.floor(pixels.length/4096/4)*4)){if(pixels[i+3]!>0)opaque++;const v=pixels[i]!+pixels[i+1]!+pixels[i+2]!;min=Math.min(min,v);max=Math.max(max,v);}
    if(!opaque||max-min<3){entry.status='suspect';entry.reason='Framebuffer appears transparent or nearly uniform; inspect image before using it as visual evidence';}
    images.set(tick,out);
   }catch(error){entry.status='failed';entry.reason=error instanceof Error?error.message:String(error);}
   report.entries.push(entry);
  }
  if(!pending.length)finish();return due.capture!==null;
 }
 function cancel(reason='Capture interrupted'){if(report.status!=='armed')return snapshot();for(const tick of pending)missed(tick,reason);pending=[];finish(reason);return snapshot();}
 function contactSheet(){
  const sheet=make(),columns=Math.min(3,Math.max(1,report.entries.length)),gap=16,caption=68,header=106;sheet.width=columns*(width+gap)+gap;sheet.height=header+Math.max(1,Math.ceil(report.entries.length/columns))*(height+caption+gap)+gap;
  const c=sheet.getContext('2d');if(!c)throw new Error('2D contact-sheet rendering is unavailable');c.fillStyle='#0b151c';c.fillRect(0,0,sheet.width,sheet.height);c.fillStyle='#e3eee9';c.font='bold 24px sans-serif';c.fillText('AXIOM · '+(report.scenario||'No capture'),gap,34,sheet.width-gap*2);c.font='16px sans-serif';c.fillText('Rendered canvas evidence · visual review: NOT REVIEWED',gap,62,sheet.width-gap*2);c.fillStyle='#9cb5b4';c.fillText(`${report.status} · ${report.entries.filter(e=>e.status==='captured').length} captured · ${report.entries.filter(e=>e.status!=='captured').length} need attention`,gap,86,sheet.width-gap*2);
  for(let i=0;i<report.entries.length;i++){const e=report.entries[i]!,x=gap+(i%columns)*(width+gap),y=header+Math.floor(i/columns)*(height+caption+gap),img=images.get(e.requestedTick);c.fillStyle='#192c34';c.fillRect(x,y,width,height);if(img)c.drawImage(img,x,y);else{c.fillStyle='#ffbf85';c.font='20px sans-serif';c.fillText(e.status.toUpperCase(),x+16,y+height/2,width-32);}c.font='bold 16px sans-serif';c.fillStyle=e.status==='captured'?'#e3eee9':'#ffbf85';c.fillText(e.label,x,y+height+23,width);c.font='14px sans-serif';c.fillStyle='#9cb5b4';c.fillText(`requested ${e.requestedTick} · rendered ${e.actualTick??'none'} · ${e.status}`,x,y+height+44,width);if(e.reason)c.fillText(e.reason,x,y+height+63,width);}
  return sheet;
 }
 function download(kind:'png'|'json'='png'){const name='axiom-'+(report.scenario||'capture').replace(/[^a-z0-9-]+/gi,'-');const anchor=document.createElement('a');if(kind==='json'){const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'}));anchor.href=url;anchor.download=name+'.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}else{contactSheet().toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob);anchor.href=url;anchor.download=name+'.png';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');}}
 function clear(){pending=[];images.clear();lastTick=-1;report=fresh();}
 return {arm,afterRender,cancel,clear,contactSheet,download,report:snapshot,get active(){return report.status==='armed';}};
}
