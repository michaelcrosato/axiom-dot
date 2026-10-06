import test from 'node:test';
import assert from 'node:assert/strict';
import {mountWorldMapPanel} from '../src/world-map-view.ts';
import {createRegionalState,enableStartingTown,enableRestoration,worldTownSupplySources,worldRestorationPlan,applyAction} from '../src/world.ts';
import {createWorldMapModel} from '../src/world-map.ts';
import {campaignGuidanceMapOverlay,campaignGuidanceMapTarget,campaignGuidanceMarkerId} from '../src/campaign-guidance-map.ts';
import {projectCampaignGuidance} from '../src/campaign-guidance.ts';
import {restorationCarePosition} from '../src/restoration-care.ts';
/** Offline DOM/canvas contract checks. These do not claim browser visual verification. */
class Element extends EventTarget {
 innerHTML='';textContent:string|null='';value='';hidden=false;style:Record<string,string>={};dataset:Record<string,string>={};attributes=new Map<string,string>();
 afterElement:Element|null=null;after(element:Element){this.afterElement=element;}
 classes=new Set<string>();classList={add:(name:string)=>this.classes.add(name),remove:(name:string)=>this.classes.delete(name)};
 setAttribute(name:string,value:string){this.attributes.set(name,value);}
 getBoundingClientRect(){return {left:0,top:0,width:700,height:430};}
 focus(){}
}
class Canvas extends Element {
 width=0;height=0;captured=new Set<number>();texts:string[]=[];draws=0;available=true;
 context=new Proxy({createImageData:(width:number,height:number)=>({data:new Uint8ClampedArray(width*height*4)}),measureText:(text:string)=>({width:text.length*6}),fillText:(text:string)=>this.texts.push(text),drawImage:()=>this.draws++},{get:(target,key)=>key in target?target[key as keyof typeof target]:()=>{},set:(target,key,value)=>{(target as Record<string|symbol,unknown>)[key]=value;return true;}});
 getContext(){return this.available?this.context:null;}
 setPointerCapture(id:number){this.captured.add(id);}
 hasPointerCapture(id:number){return this.captured.has(id);}
 releasePointerCapture(id:number){this.captured.delete(id);}
}
class Panel extends Element {
 canvas=new Canvas();viewport=new Element();loading=new Element();status=new Element();meta=new Element();caption=new Element();select=new Element();close=new Element();ownsCanvas=true;
 buttons=['out','in','fit','player','back'].map(action=>{const b=new Element();b.dataset.mapAction=action;return b;});
 querySelector(selector:string){return ({'.world-map-canvas':this.canvas,'.world-map-viewport':this.viewport,'.world-map-loading':this.loading,'.world-map-status':this.status,'.world-map-meta':this.meta,'.world-map-caption':this.caption,'select':this.select,'.close':this.close} as Record<string,Element>)[selector];}
 querySelectorAll(){return this.buttons;}
 contains(element:unknown){return this.ownsCanvas&&element===this.canvas;}
 button(action:string){return this.buttons.find(b=>b.dataset.mapAction===action)!;}
}
function event(type:string,values:Record<string,unknown>={}){const e=new Event(type,{cancelable:true});for(const [key,value]of Object.entries(values))Object.defineProperty(e,key,{value});return e;}
function harness(run:(env:{panel:Panel;frame:()=>void;timers:Map<number,()=>void>;frames:Map<number,FrameRequestCallback>;flushTimers:()=>void;disconnected:()=>boolean})=>void){
 const panel=new Panel(),timers=new Map<number,()=>void>(),frames=new Map<number,FrameRequestCallback>();let id=0,time=0,disconnected=false;
 const win=new EventTarget() as EventTarget&{setTimeout:(fn:()=>void)=>number;clearTimeout:(id:number)=>void;devicePixelRatio:number};win.setTimeout=fn=>{timers.set(++id,fn);return id;};win.clearTimeout=n=>{timers.delete(n);};win.devicePixelRatio=2;
 const patches:Record<string,unknown>={window:win,document:{createElement:()=>new Canvas()},requestAnimationFrame:(fn:FrameRequestCallback)=>{frames.set(++id,fn);return id;},cancelAnimationFrame:(n:number)=>frames.delete(n),ResizeObserver:class{observe(){}disconnect(){disconnected=true;}}};
 const prior=new Map(Object.keys(patches).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));for(const [key,value]of Object.entries(patches))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 const frame=()=>{const entry=frames.entries().next().value as [number,FrameRequestCallback]|undefined;if(!entry)return;frames.delete(entry[0]);entry[1](time+=200);};
 try{run({panel,frame,timers,frames,flushTimers:()=>{for(let guard=0;timers.size&&guard<300;guard++){const [timer,fn]=timers.entries().next().value!;timers.delete(timer);fn();}assert.equal(timers.size,0);},disconnected:()=>disconnected});}finally{for(const [key,descriptor]of prior)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as Record<string,unknown>)[key];}
}


function starting(){return enableRestoration(enableStartingTown(createRegionalState(73129)));}

test('guidance atlas adds exact finite source and habitat dock destinations without changing existing map state',()=>{
 const state=starting(),before=JSON.stringify(state),base=createWorldMapModel(state),overlay=campaignGuidanceMapOverlay(state),sources=worldTownSupplySources(state),plan=worldRestorationPlan(state.seed);
 assert.equal(overlay.routes.length,0);assert.equal(new Set([...base.markers,...overlay.markers].map(m=>m.id)).size,base.markers.length+overlay.markers.length);
 for(const source of sources){const id=campaignGuidanceMarkerId('supply',`town-supply/${source.id}`),target=campaignGuidanceMapTarget(state,id)!;assert.equal(target.selectionId,source.id);assert.equal(target.x,source.x);assert.equal(target.z,source.z);assert.equal(target.panel,'town-supply');}
 for(const site of plan.sites){const id=campaignGuidanceMarkerId('restoration',site.id),target=campaignGuidanceMapTarget(state,id)!,dock=restorationCarePosition(plan,{kind:'collect',targetId:site.id})!;assert.deepEqual({x:target.x,y:target.y,z:target.z},dock);assert.equal(target.selectionId,site.id);}
 assert(overlay.markers.some(m=>m.id===campaignGuidanceMarkerId('construction','workshop-board')));assert(overlay.markers.some(m=>m.id===campaignGuidanceMarkerId('care','habitat-care/apothecary')));
 assert.equal(JSON.stringify(state),before);assert.equal(JSON.stringify(createWorldMapModel(state)),JSON.stringify(base));assert.deepEqual(campaignGuidanceMapOverlay(state),overlay);
});

test('guidance source markers disappear after real pickup and stale target resolution refuses them',()=>{
 let state=starting();const source=worldTownSupplySources(state)[3]!,id=campaignGuidanceMarkerId('supply',`town-supply/${source.id}`);assert(campaignGuidanceMapTarget(state,id));state=applyAction({...state,player:{...state.player,x:source.x,z:source.z}},{type:'collect',id:source.id});assert(state.collected.includes(source.id));
 assert.equal(campaignGuidanceMapTarget(state,id),undefined);assert(!campaignGuidanceMapOverlay(state).markers.some(m=>m.id===id));assert.deepEqual(campaignGuidanceMapOverlay({...state,zone:'cave'}),{markers:[],routes:[]});
});

test('map initial guidance selection focuses its exact marker and survives reopening without side effects',()=>harness(({panel,frame})=>{
 const state=starting(),source=worldTownSupplySources(state)[4]!,id=campaignGuidanceMarkerId('supply',`town-supply/${source.id}`),before=JSON.stringify(state),selections:(string|null)[]=[],opened:string[]=[];
 const options={getState:()=>state,close:()=>{},getOverlay:campaignGuidanceMapOverlay,initialSelectedMarkerId:id,onSelection:(id:string|null)=>selections.push(id),inspectOverlay:(id:string)=>opened.push(id)};
 const dispose=mountWorldMapPanel(panel as unknown as HTMLElement,options);frame();assert.equal(panel.select.value,id);assert(panel.canvas.texts.includes('24.0×'));assert.equal(panel.caption.afterElement!.hidden,false);panel.caption.afterElement!.dispatchEvent(event('click'));assert.deepEqual(opened,[id]);dispose();panel.caption.afterElement!.dispatchEvent(event('click'));assert.deepEqual(opened,[id]);
 const again=mountWorldMapPanel(panel as unknown as HTMLElement,{...options,initialSelectedMarkerId:selections.at(-1)!});assert.equal(panel.select.value,id);again();assert.equal(JSON.stringify(state),before);
}));

test('live map refresh replaces an exhausted source with the current goal and never keeps a stale inspector',()=>harness(({panel,frame})=>{
 let state=starting();const source=worldTownSupplySources(state)[2]!,id=campaignGuidanceMarkerId('supply',`town-supply/${source.id}`),opened:string[]=[],selected:(string|null)[]=[];
 const dispose=mountWorldMapPanel(panel as unknown as HTMLElement,{getState:()=>state,close:()=>{},getOverlay:campaignGuidanceMapOverlay,initialSelectedMarkerId:id,onSelection:v=>selected.push(v),inspectOverlay:v=>opened.push(v)});
 state=applyAction({...state,player:{...state.player,x:source.x,z:source.z}},{type:'collect',id:source.id});frame();const target=projectCampaignGuidance(state).find(c=>c.id==='supply')!.target!,expected=campaignGuidanceMarkerId('supply',target.id);assert.equal(panel.select.value,expected);assert.equal(selected.at(-1),expected);panel.caption.afterElement!.dispatchEvent(event('click'));assert.deepEqual(opened,[expected]);
 for(const source of worldTownSupplySources(state))if(!state.collected.includes(source.id))state=applyAction({...state,player:{...state.player,x:source.x,z:source.z}},{type:'collect',id:source.id});frame();assert.equal(panel.select.value,campaignGuidanceMarkerId('supply','town-supply/workshop'));dispose();
}));

test('map reopening with a consumed source selects its current supply goal instead of stale coordinates',()=>harness(({panel})=>{
 let state=starting();const source=worldTownSupplySources(state)[0]!,id=campaignGuidanceMarkerId('supply',`town-supply/${source.id}`);state=applyAction({...state,player:{...state.player,x:source.x,z:source.z}},{type:'collect',id:source.id});const target=projectCampaignGuidance(state).find(c=>c.id==='supply')!.target!;
 const dispose=mountWorldMapPanel(panel as unknown as HTMLElement,{getState:()=>state,close:()=>{},getOverlay:campaignGuidanceMapOverlay,initialSelectedMarkerId:id,focusTarget:source});assert.equal(panel.select.value,campaignGuidanceMarkerId('supply',target.id));dispose();
}));

test('removed map destinations without a fallback clear their caption and stale inspection action',()=>harness(({panel,frame})=>{
 let state=starting(),available=true,opened=0;const dispose=mountWorldMapPanel(panel as unknown as HTMLElement,{getState:()=>state,close:()=>{},initialSelectedMarkerId:'transient',getOverlay:()=>({markers:available?[{id:'transient',targetId:'transient',name:'Transient destination',kind:'resource',x:0,z:0,detail:'Finite target'}]:[],routes:[]}),inspectOverlay:()=>opened++});
 const stale=panel.caption.afterElement!;assert.equal(stale.hidden,false);available=false;state={...state};frame();assert.equal(panel.select.value,'');assert.equal(stale.hidden,true);assert.match(panel.caption.textContent!,/no longer available/);stale.dispatchEvent(event('click'));assert.equal(opened,0);dispose();
}));
