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

test('map panel mounts precise metadata, renders asynchronously and releases all resources on close',()=>harness(({panel,frame,flushTimers,timers,frames,disconnected})=>{
 const state=createRegionalState(73129);let calls=0,closed=0,back=0;
 const dispose=mountWorldMapPanel(panel as unknown as HTMLElement,{getState:()=>{calls++;return state;},close:()=>closed++,back:()=>back++});
 assert.equal(panel.classes.has('world-map-panel'),true);assert.match(panel.meta.textContent!,/10 km²/);assert.match(panel.meta.textContent!,/3.162 km/);assert.match(panel.status.textContent!,/Surface survey/);
 assert.equal(panel.canvas.style.touchAction,'none');assert.equal(panel.canvas.width,1400);assert.equal(panel.canvas.height,860);
 frame();flushTimers();frame();assert.equal(panel.loading.hidden,true);assert.ok(panel.canvas.draws>0);assert.ok(panel.canvas.texts.includes('N'));
 panel.close.dispatchEvent(event('click'));panel.button('back').dispatchEvent(event('click'));assert.equal(closed,1);assert.equal(back,1);
 panel.canvas.dispatchEvent(event('pointerdown',{pointerId:9,clientX:300,clientY:200,button:0}));assert.equal(panel.canvas.captured.size,1);dispose();dispose();assert.equal(panel.canvas.captured.size,0);assert.equal(frames.size,0);assert.equal(timers.size,0);assert.equal(panel.canvas.width,1);assert.equal(panel.classes.has('world-map-panel'),false);assert.equal(disconnected(),true);
 const oldCalls=calls;panel.button('player').dispatchEvent(event('click'));panel.close.dispatchEvent(event('click'));assert.equal(calls,oldCalls);assert.equal(closed,1);
}));

test('map toolbar, keyboard, wheel and pinch share working bounded navigation and selectable landmarks',()=>harness(({panel,frame})=>{
 const state=createRegionalState(73129),dispose=mountWorldMapPanel(panel as unknown as HTMLElement,{getState:()=>state,close:()=>{}});
 frame();panel.button('in').dispatchEvent(event('click'));frame();assert.ok(panel.canvas.texts.includes('1.5×'));
 const plus=event('keydown',{key:'+',shiftKey:false});panel.canvas.dispatchEvent(plus);frame();assert.equal(plus.defaultPrevented,true);assert.ok(panel.canvas.texts.includes('2.1×'));
 panel.button('fit').dispatchEvent(event('click'));frame();assert.equal(panel.canvas.texts.at(-1),'1.0×');
 panel.canvas.dispatchEvent(event('wheel',{deltaY:-200,deltaMode:0,clientX:350,clientY:210}));frame();assert.notEqual(panel.canvas.texts.at(-1),'1.0×');
 panel.canvas.dispatchEvent(event('keydown',{key:'0'}));frame();assert.equal(panel.canvas.texts.at(-1),'1.0×');
 for(const [pointerId,clientX]of [[1,280],[2,420]])panel.canvas.dispatchEvent(event('pointerdown',{pointerId,clientX,clientY:200,button:0}));
 panel.canvas.dispatchEvent(event('pointermove',{pointerId:2,clientX:560,clientY:200}));frame();assert.equal(panel.canvas.texts.at(-1),'2.0×');
 panel.canvas.dispatchEvent(event('pointercancel',{pointerId:1}));panel.canvas.dispatchEvent(event('pointerup',{pointerId:2,clientX:560,clientY:200}));assert.equal(panel.canvas.captured.size,0);assert.equal(panel.canvas.style.cursor,'grab');
 panel.button('player').dispatchEvent(event('click'));frame();assert.equal(panel.canvas.texts.at(-1),'20.0×');assert.match(panel.caption.textContent!,/Position/);
 panel.select.value='valley/pump';panel.select.dispatchEvent(event('change'));frame();assert.equal(panel.canvas.texts.at(-1),'24.0×');assert.match(panel.caption.textContent!,/Waterworks/);dispose();
}));

test('live player status handles cave coordinates, changed worlds and panel replacement',()=>harness(({panel,frame,timers,frames})=>{
 let state=createRegionalState(73129);const dispose=mountWorldMapPanel(panel as unknown as HTMLElement,{getState:()=>state,close:()=>{},continuesInMenus:true});
 assert.match(panel.innerHTML,/online world keeps running/);
 state={...state,zone:'cave',player:{x:0,z:24,hp:100}};frame();assert.match(panel.status.textContent!,/underground in the river cave/);assert.match(panel.canvas.attributes.get('aria-label')!,/not your underground position/);
 state=createState(1);frame();assert.match(panel.meta.textContent!,/Original valley/);assert.match(panel.meta.textContent!,/96 m each side/);assert.doesNotMatch(panel.meta.textContent!,/10 km²/);
 panel.ownsCanvas=false;frame();assert.equal(frames.size,0);assert.equal(timers.size,0);dispose();
}));

test('2D canvas failure is visible and leaves the close action available',()=>harness(({panel})=>{
 panel.canvas.available=false;let closed=0;const dispose=mountWorldMapPanel(panel as unknown as HTMLElement,{getState:()=>createState(1),close:()=>closed++});
 assert.match(panel.loading.textContent!,/could not open/);const close=panel.close as Element&{onclick:()=>void};close.onclick();assert.equal(closed,1);dispose();assert.equal(panel.classes.has('world-map-panel'),false);
}));


test('outpost detail and inspection stay live and selection reset hides the action',()=>harness(({panel,frame})=>{
 const state=createRegionalState(73129);let detail='4 wood and 3 stone needed',opened='';
 const dispose=mountWorldMapPanel(panel as unknown as HTMLElement,{getState:()=>state,close:()=>{},markerDetail:marker=>marker.kind==='outpost'?detail:undefined,inspectOutpost:id=>{opened=id;}});
 // Use the exact generated marker ID rather than relying on a guessed namespace.
 const option=/value="([^"]+)"[^>]*>Alder Waystation/.exec(panel.select.innerHTML);assert.ok(option);panel.select.value=option[1]!;panel.select.dispatchEvent(event('change'));
 const inspect=panel.caption.afterElement!;assert.equal(inspect.hidden,false);assert.match(panel.caption.textContent!,/4 wood and 3 stone needed/);inspect.dispatchEvent(event('click'));assert.equal(opened,option[1]);
 detail='Collector in use · 2 L drunk';frame();frame();assert.match(panel.caption.textContent!,/2 L drunk/);
 panel.button('fit').dispatchEvent(event('click'));assert.equal(inspect.hidden,true);
 panel.select.value=option[1]!;panel.select.dispatchEvent(event('change'));assert.equal(inspect.hidden,false);panel.button('player').dispatchEvent(event('click'));assert.equal(inspect.hidden,true);
 dispose();
}));

test('freight atlas overlays expose live cargo and read-only route inspection without changing world geometry',()=>harness(({panel,frame})=>{
 let state=createRegionalState(73129),opened='',cargo=4;const original=JSON.stringify(state);
 const dispose=mountWorldMapPanel(panel as unknown as HTMLElement,{getState:()=>state,close:()=>{},getOverlay:()=>({markers:[{id:'freight-fixture',name:'Stone carrier',kind:'carrier',x:-320,z:280,targetId:'source-fixture',detail:`${cargo} quarry-stone for Pinewatch · 510 m · 4.7 active minutes`}],routes:[{id:'route-fixture',points:[{x:-340,z:260},{x:-320,z:280}],blocked:true}]}),inspectOverlay:id=>{opened=id;}});
 assert.match(panel.select.innerHTML,/Stone carrier/);assert.match(panel.innerHTML,/Freight repair/);panel.select.value='freight-fixture';panel.select.dispatchEvent(event('change'));frame();assert.match(panel.caption.textContent!,/4 quarry-stone for Pinewatch/);assert.match(panel.caption.textContent!,/510 m/);
 const inspect=panel.caption.afterElement!;assert.equal(inspect.hidden,false);assert.equal(inspect.textContent,'Resource route & freight');inspect.dispatchEvent(event('click'));assert.equal(opened,'source-fixture');assert.equal(JSON.stringify(state),original,'inspection does not command the campaign');
 cargo=0;state={...state,revision:state.revision+1};frame();assert.match(panel.caption.textContent!,/0 quarry-stone/);assert(panel.canvas.texts.includes('Stone carrier'));panel.button('player').dispatchEvent(event('click'));assert.equal(inspect.hidden,true);dispose();
}));
