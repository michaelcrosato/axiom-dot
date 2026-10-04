import test from 'node:test';
import assert from 'node:assert/strict';
import {mountWorldMapPanel} from '../src/world-map-view.ts';
import {createState,createRegionalState} from '../src/world.ts';

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

test('food atlas marks have distinct legend, exact pantry dispatch, and live read-only detail',()=>harness(({panel,frame})=>{
 let state=createRegionalState(73129);let stock=2,opened='';const before=JSON.stringify(state);
 const dispose=mountWorldMapPanel(panel as unknown as HTMLElement,{getState:()=>state,close(){},getOverlay:()=>({markers:[{id:'food-fixture',name:'Alder Garden',kind:'farm',x:-320,z:280,targetId:'food-fixture',inspectLabel:'Regional food & meals',detail:'New rain overflow grows real food'},{id:'food-fixture/pantry',name:'Alder food pantry',kind:'pantry',x:-315,z:285,targetId:'food-fixture',inspectLabel:'Regional food & meals',detail:`${stock} stored food · 1 meal consumed`}],routes:[{id:'food-fixture/delivery',points:[{x:-320,z:280},{x:-318,z:280},{x:-315,z:285}],blocked:false}]}),inspectOverlay:id=>{opened=id;}});
 assert.match(panel.innerHTML,/Regional farm/);assert.match(panel.innerHTML,/Food pantry \/ meal destination/);assert.match(panel.select.innerHTML,/Alder Garden/);assert.match(panel.select.innerHTML,/Alder food pantry/);
 panel.select.value='food-fixture/pantry';panel.select.dispatchEvent(event('change'));frame();assert.match(panel.caption.textContent!,/2 stored food/);const inspect=panel.caption.afterElement!;assert.equal(inspect.textContent,'Regional food & meals');inspect.dispatchEvent(event('click'));assert.equal(opened,'food-fixture');
 stock=1;state={...state};frame();frame();assert.match(panel.caption.textContent!,/1 stored food/);assert.equal(JSON.stringify(state),before);panel.button('fit').dispatchEvent(event('click'));assert.equal(inspect.hidden,true);dispose();
}));
