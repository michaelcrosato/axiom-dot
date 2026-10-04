import {createPanelNavigation} from '../src/panel-navigation.ts';
import {createGuardState,requestGuard} from '../src/guard.ts';import {createComboState} from '../src/combat.ts';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
import {bindTouchButtons,bindHoldButton} from '../src/touch-buttons.ts';import {GameplayPointers,keyboardAction} from '../src/controls.ts';
import {movementInput} from '../src/locomotion.ts';
/** Node-native EventTarget with the small DOM contract used by the production bindings.
 * This executes installed handlers and propagation/default-prevention; it is not browser QA. */
class Surface extends EventTarget {
 captures=new Set<number>();captureEvents=new EventTarget();
 ownerDocument:DocumentSurface|null=null;
 closest(_selector:string):Button|null{return null;}
 override addEventListener(type:string,listener:EventListenerOrEventListenerObject|null,options?:boolean|AddEventListenerOptions){
  if(options===true||(typeof options==='object'&&options.capture))this.captureEvents.addEventListener(type,listener,options);
  else super.addEventListener(type,listener,options);
 }
 setPointerCapture(id:number){this.captures.add(id);}
 hasPointerCapture(id:number){return this.captures.has(id);}
 releasePointerCapture(id:number){this.captures.delete(id);}
}
class DocumentSurface extends Surface {activeElement:Button|null=null;hidden=false;defaultView=new Surface();}
class Root extends Surface {
 constructor(){super();this.ownerDocument=new DocumentSurface();}
 contains(button:Button){return button.root===this&&button.isConnected;}
}
class ButtonContent {textContent='';readonly button:Button;constructor(button:Button){this.button=button;}closest(selector:string){return this.button.closest(selector);}}
class Button extends Surface {
 disabled=false;isConnected=true;hidden=false;actions=0;attributes=new Map<string,string>();label=new ButtonContent(this);
 rect={left:600,right:700,top:300,bottom:360,width:100,height:60};content='';
 root:Root;constructor(root:Root){super();this.root=root;this.ownerDocument=root.ownerDocument;this.addEventListener('click',()=>this.actions++);}
 override closest(selector:string):Button|null{return selector==='button'?this:selector==='[hidden]'&&this.hidden?this:selector==='[data-hold]'&&this.hasAttribute('data-hold')?this:null;}
 hasAttribute(name:string){return this.attributes.has(name);}
 setAttribute(name:string,value:string){this.attributes.set(name,value);}
 getBoundingClientRect(){return this.rect;}
 querySelector(selector:string){return selector==='.action-title'?this.label:null;}
 set innerHTML(value:string){this.content=value;this.label=new ButtonContent(this);}
 get innerHTML(){return this.content;}
 focus(){if(this.ownerDocument!.activeElement===this)return;this.ownerDocument!.activeElement?.blur();this.ownerDocument!.activeElement=this;this.dispatchEvent(event('focus',this));}
 blur(){if(this.ownerDocument!.activeElement===this)this.ownerDocument!.activeElement=null;this.dispatchEvent(event('blur',this));}
 click(){click(this,{});}
}
function event(type:string,target:object,fields:Record<string,unknown>={}){
 const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,Object.fromEntries(Object.entries({target,...fields}).map(([k,value])=>[k,{value,configurable:true}])));return e;
}
/** Minimal DOM path using native EventTargets for capture and bubble listeners. */
function dispatch(surface:Surface,e:Event){
 const path:Surface[]=surface instanceof Button?[surface,surface.root]:[surface];
 if(surface.ownerDocument)path.push(surface.ownerDocument);
 const document=surface instanceof DocumentSurface?surface:surface.ownerDocument;if(document)path.push(document.defaultView);
 for(const current of [...path].reverse()){current.captureEvents.dispatchEvent(e);if(e.cancelBubble)return e;}
 for(const current of path){current.dispatchEvent(e);if(e.cancelBubble)return e;}
 return e;
}
function pointer(surface:Surface,type:string,id:number,x=650,y=330,fields:Record<string,unknown>={}){
 const e=event(type,surface,{pointerId:id,clientX:x,clientY:y,pointerType:'touch',button:0,buttons:type==='pointerup'?0:1,isPrimary:false,...fields});
 dispatch(surface,e);
 // Browser default focus after an uncancelled primary-button mouse press.
 if(surface instanceof Button&&type==='pointerdown'&&(e as PointerEvent).pointerType==='mouse'&&(e as PointerEvent).button===0&&!e.defaultPrevented)surface.focus();
 return e;
}
function click(button:Button,fields:Record<string,unknown>){return dispatch(button,event('click',button,{detail:0,...fields}));}
function keyboard(surface:Surface,type:string,code:string,fields:Record<string,unknown>={}){return dispatch(surface,event(type,surface,{code,repeat:false,...fields}));}
function harness(){
 const root=new Root(),canvas=new Surface(),pulse=new Button(root),interact=new Button(root),crouch=new Button(root),jump=new Button(root);const pointers=new GameplayPointers();canvas.ownerDocument=root.ownerDocument;
 const held={crouch:false,jump:false},changes={crouch:[] as boolean[],jump:[] as boolean[]};
 const crouchHold=bindHoldButton(crouch as unknown as HTMLElement,value=>{held.crouch=value;changes.crouch.push(value);crouch.innerHTML=value?'Crouching':'Crouch';});
 const jumpHold=bindHoldButton(jump as unknown as HTMLElement,value=>{held.jump=value;changes.jump.push(value);jump.innerHTML=value?'Jumping':'Jump';});
 const buttons=bindTouchButtons(root as unknown as HTMLElement);
 const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
 const from=main.indexOf("canvas.addEventListener('pointerdown'"),to=main.indexOf("addEventListener('blur',",from);assert(from>=0&&to>from,'actual pointer-handler slice is nonempty');const handlers=main.slice(from,to);
 const code=stripTypeScriptTypes(handlers,{mode:'strip'});
 const api=new Function('canvas','pointers','THREE',`const activeConversation=null;let touchUI=false,inputMode='desktop',orbit=0,zoom=36,innerWidth=800,physicsReady=true,transitioning=false;const panel={hidden:true};function updateTouchUI(){};${code};return {panel,getCamera:()=>({zoom,orbit}),stop:()=>{const ids=pointers.pointerIds;pointers.reset();for(const id of ids)if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}};`)(canvas,pointers,{MathUtils:{clamp:(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x))}});
 return {root,canvas,pulse,interact,crouch,jump,crouchHold,jumpHold,held,changes,pointers,buttons,api};
}
test('actual canvas bindings plus independent non-primary button taps keep primary movement active',()=>{
 const h=harness();pointer(h.canvas,'pointerdown',1,70,200,{isPrimary:true});pointer(h.canvas,'pointermove',1,128,200,{isPrimary:true});
 assert.equal(h.pointers.stick.value.x,1);assert.deepEqual([...h.canvas.captures],[1]);
 pointer(h.pulse,'pointerdown',2);pointer(h.pulse,'pointerup',2); // deliberately no browser click
 assert.equal(h.pulse.actions,1);assert.equal(h.pointers.stick.pointerId,1);assert.equal(h.pointers.stick.value.x,1);assert.equal(h.canvas.hasPointerCapture(1),true);
 pointer(h.interact,'pointerdown',3);pointer(h.interact,'pointerup',3);assert.equal(h.interact.actions,1);assert.equal(h.pointers.stick.value.x,1);
 pointer(h.canvas,'pointerup',1,128,200,{isPrimary:true});assert.equal(h.pointers.stick.pointerId,null);
});
test('touch synthetic clicks do not duplicate, while mouse, keyboard and assistive activation still fire once',()=>{
 const h=harness();pointer(h.pulse,'pointerdown',2);pointer(h.pulse,'pointerup',2);
 assert.equal(click(h.pulse,{detail:1,pointerType:'touch',pointerId:2}).defaultPrevented,true);assert.equal(h.pulse.actions,1);
 assert.equal(click(h.pulse,{detail:1}).defaultPrevented,true);assert.equal(h.pulse.actions,1);
 pointer(h.pulse,'pointerdown',9,650,330,{pointerType:'mouse',isPrimary:true});click(h.pulse,{detail:1,pointerType:'mouse'});assert.equal(h.pulse.actions,2);
 click(h.pulse,{});assert.equal(h.pulse.actions,3);
 pointer(h.pulse,'pointerdown',2);pointer(h.pulse,'pointerup',2);assert.equal(h.pulse.actions,4);
});
test('tap cancellation, drag/scroll, removal, disabling and menu reset never trigger stale button actions',()=>{
 for(const finish of ['pointercancel','lostpointercapture']){const h=harness();pointer(h.pulse,'pointerdown',2);pointer(h.pulse,finish,2);pointer(h.pulse,'pointerup',2);assert.equal(h.pulse.actions,0);assert.equal(h.pulse.captures.size,0);}
 for(const invalid of ['drag','outside','removed','disabled','hidden','reset']){
  const h=harness();pointer(h.pulse,'pointerdown',2);
  if(invalid==='drag')pointer(h.pulse,'pointermove',2,690,330);
  if(invalid==='removed')h.pulse.isConnected=false;if(invalid==='disabled')h.pulse.disabled=true;if(invalid==='hidden')h.pulse.hidden=true;if(invalid==='reset')h.buttons.reset();
  pointer(h.pulse,'pointerup',2,invalid==='outside'?730:650,330);assert.equal(h.pulse.actions,0,invalid);
 }
});
test('real canvas handlers pinch while moving, clamp zoom, recover orbit and reject modal gestures',()=>{
 const h=harness();pointer(h.canvas,'pointerdown',1,70,200);pointer(h.canvas,'pointermove',1,128,200);
 pointer(h.canvas,'pointerdown',2,500,200);pointer(h.canvas,'pointerdown',3,600,200);pointer(h.canvas,'pointermove',3,700,200);
 assert.equal(h.api.getCamera().zoom,18);assert.equal(h.api.getCamera().orbit,0);assert.equal(h.pointers.stick.value.x,1);
 pointer(h.canvas,'pointermove',3,1000,200);assert.equal(h.api.getCamera().zoom,17);
 pointer(h.canvas,'pointermove',3,520,200);assert.equal(h.api.getCamera().zoom,58);
 pointer(h.canvas,'pointercancel',2,500,200);pointer(h.canvas,'pointermove',3,530,200);assert.equal(h.api.getCamera().orbit,-.08);assert.equal(h.pointers.stick.value.x,1);
 h.api.stop();h.buttons.reset();assert.deepEqual(h.pointers.pointerIds,[]);assert.equal(h.canvas.captures.size,0);
 h.api.panel.hidden=false;pointer(h.canvas,'pointerdown',4,500,200);pointer(h.canvas,'pointerdown',5,600,200);assert.deepEqual(h.pointers.pointerIds,[]);
});
test('multiple button fingers remain independent of each other and camera pointer ownership',()=>{
 const h=harness();pointer(h.canvas,'pointerdown',1,70,200);pointer(h.canvas,'pointerdown',2,500,200);
 pointer(h.pulse,'pointerdown',3);pointer(h.interact,'pointerdown',4);pointer(h.pulse,'pointercancel',3);pointer(h.interact,'pointerup',4);
 assert.equal(h.pulse.actions,0);assert.equal(h.interact.actions,1);assert.equal(h.pointers.orbitId,2);assert.equal(h.pointers.stick.pointerId,1);
});


test('native select and other non-button controls retain their touch clicks',()=>{
 const root=new Root();bindTouchButtons(root as unknown as HTMLElement);
 const select={closest:()=>null};const e=event('click',select,{detail:1,pointerType:'touch'});root.dispatchEvent(e);assert.equal(e.defaultPrevented,false);
});


test('move, crouch and jump hold simultaneously with non-primary fingers and every release order',()=>{
 const orders=[['move','crouch','jump'],['move','jump','crouch'],['crouch','move','jump'],['crouch','jump','move'],['jump','move','crouch'],['jump','crouch','move']];
 for(const order of orders){
  const h=harness();pointer(h.canvas,'pointerdown',1,70,200,{isPrimary:true});pointer(h.canvas,'pointermove',1,128,200,{isPrimary:true});
  pointer(h.crouch,'pointerdown',2);pointer(h.jump,'pointerdown',3);
  assert.deepEqual(h.held,{crouch:true,jump:true});assert.equal(h.pointers.stick.value.x,1);
  assert.equal(h.buttons.isPressed(h.crouch as unknown as HTMLElement),false);assert.equal(h.buttons.isPressed(h.jump as unknown as HTMLElement),false);
  const active=new Set(order);
  for(const action of order){
   if(action==='move')pointer(h.canvas,'pointerup',1,128,200);else pointer(action==='crouch'?h.crouch:h.jump,'pointerup',action==='crouch'?2:3);
   active.delete(action);assert.equal(h.held.crouch,active.has('crouch'));assert.equal(h.held.jump,active.has('jump'));assert.equal(h.pointers.stick.value.x,active.has('move')?1:0);
  }
  assert.deepEqual(h.changes,{crouch:[true,false],jump:[true,false]});assert.equal(h.crouch.actions+h.jump.actions,0);
 }
});
test('each held pointer cancels independently; leaving never re-arms before a fresh down',()=>{
 for(const finish of ['pointercancel','lostpointercapture','pointerleave','outside']){
  const h=harness();pointer(h.crouch,'pointerdown',2);pointer(h.crouch,'pointerdown',3);pointer(h.jump,'pointerdown',4);
  pointer(h.crouch,finish==='outside'?'pointermove':finish,2,finish==='outside'?710:650,330);
  assert.equal(h.crouchHold.isHeld(),true,finish);assert.equal(h.crouch.hasPointerCapture(2),false,finish);
  pointer(h.crouch,'pointerup',3);assert.equal(h.crouchHold.isHeld(),false,finish);assert.equal(h.held.jump,true);
  pointer(h.crouch,'pointermove',2);pointer(h.crouch,'pointerup',2);assert.equal(h.held.crouch,false,finish);
  pointer(h.crouch,'pointerdown',5);assert.equal(h.held.crouch,true,finish);pointer(h.crouch,'pointerup',5);pointer(h.jump,'pointerup',4);
 }
});
test('hold cancellation and reset consume compatibility clicks without triggering a toggle',()=>{
 for(const stop of ['up','cancel','leave','reset']){
  const h=harness();pointer(h.crouch,'pointerdown',2);
  if(stop==='reset')h.crouchHold.reset();else pointer(h.crouch,stop==='up'?'pointerup':stop==='cancel'?'pointercancel':'pointerleave',2);
  for(const fields of [{detail:1,pointerType:'touch'},{detail:1},{detail:0},{detail:1,pointerType:'mouse'}])assert.equal(click(h.crouch,fields).defaultPrevented,true);
  assert.equal(h.crouch.actions,0);assert.equal(h.held.crouch,false);assert.deepEqual(h.changes.crouch,[true,false]);
 }
});
test('native mouse focus and focused Space/Enter holds combine without duplicate presses',()=>{
 const h=harness();pointer(h.crouch,'pointerdown',2,650,330,{pointerType:'mouse',button:2});assert.equal(h.held.crouch,false);
 const down=pointer(h.crouch,'pointerdown',2,650,330,{pointerType:'mouse',isPrimary:true});assert.equal(down.defaultPrevented,false);assert.equal(h.root.ownerDocument!.activeElement,h.crouch);
 assert.equal(keyboard(h.crouch,'keydown','Space').defaultPrevented,true);keyboard(h.crouch,'keydown','Space',{repeat:true});keyboard(h.crouch,'keydown','Enter');
 pointer(h.crouch,'pointerup',2,650,330,{pointerType:'mouse',isPrimary:true});assert.equal(h.held.crouch,true);
 keyboard(h.crouch,'keyup','Space');assert.equal(h.held.crouch,true);keyboard(h.crouch,'keyup','Enter');assert.equal(h.held.crouch,false);
 assert.deepEqual(h.changes.crouch,[true,false]);assert.equal(click(h.crouch,{detail:1,pointerType:'mouse'}).defaultPrevented,true);assert.equal(h.crouch.actions,0);
 h.jump.focus();assert.equal(keyboard(h.crouch,'keydown','Space').defaultPrevented,false);assert.equal(h.held.crouch,false);
 keyboard(h.jump,'keydown','Space');h.crouch.focus();assert.equal(h.held.jump,false);
 h.jump.focus();keyboard(h.jump,'keydown','Space',{repeat:true});assert.equal(h.held.jump,false);keyboard(h.jump,'keyup','Space');keyboard(h.jump,'keydown','Space');assert.equal(h.held.jump,true);
});
test('keyboard blur does not release independently held touches; window blur resets all sources',()=>{
 const h=harness();h.crouch.focus();keyboard(h.crouch,'keydown','Enter');pointer(h.crouch,'pointerdown',2);pointer(h.jump,'pointerdown',3);
 h.jump.focus();assert.deepEqual(h.held,{crouch:true,jump:true});
 h.root.ownerDocument!.defaultView.dispatchEvent(event('blur',h.root.ownerDocument!.defaultView));
 assert.deepEqual(h.held,{crouch:false,jump:false});assert.equal(h.crouch.captures.size+h.jump.captures.size,0);
 pointer(h.crouch,'pointermove',2);pointer(h.jump,'pointermove',3);keyboard(h.jump,'keydown','Space',{repeat:true});assert.deepEqual(h.held,{crouch:false,jump:false});
});
test('menu reset, page lifecycle, disabled/hidden/removal and mouse release cannot leave stale holds',()=>{
 for(const stop of ['reset','pagehide','hidden-page','disabled','hidden-button','removed','mouse-buttons']){
  const h=harness();const mouse=stop==='mouse-buttons';pointer(h.crouch,'pointerdown',2,650,330,{pointerType:mouse?'mouse':'touch'});h.crouch.focus();keyboard(h.crouch,'keydown','Space');
  if(stop==='reset')h.crouchHold.reset();
  else if(stop==='pagehide')h.root.ownerDocument!.defaultView.dispatchEvent(event('pagehide',h.root.ownerDocument!.defaultView));
  else if(stop==='hidden-page'){h.root.ownerDocument!.hidden=true;h.root.ownerDocument!.dispatchEvent(event('visibilitychange',h.root.ownerDocument!));}
  else {keyboard(h.crouch,'keyup','Space');if(stop==='disabled')h.crouch.disabled=true;if(stop==='hidden-button')h.crouch.hidden=true;if(stop==='removed')h.crouch.isConnected=false;pointer(h.crouch,'pointermove',2,650,330,{pointerType:mouse?'mouse':'touch',buttons:0});}
  assert.equal(h.held.crouch,false,stop);assert.equal(h.crouch.captures.size,0,stop);pointer(h.crouch,'pointerup',2);assert.equal(h.crouch.actions,0,stop);
 }
});
test('hold remains captured on the stable button through rerendered label content',()=>{
 const h=harness(),label=h.crouch.label;
 pointer(h.crouch,'pointerdown',2,650,330,{target:label});assert.notEqual(h.crouch.label,label);assert.equal(h.crouch.hasPointerCapture(2),true);assert.equal(h.held.crouch,true);
 h.crouch.innerHTML='<span>Updated stance</span>';pointer(h.crouch,'pointermove',2,680,330,{target:h.crouch.label});assert.equal(h.held.crouch,true);
 pointer(h.crouch,'pointerup',2,680,330,{target:h.crouch.label});assert.equal(h.held.crouch,false);assert.equal(h.crouch.captures.size,0);
});
test('document-level fallback releases a hold when pointer capture is unavailable',()=>{
 const h=harness();h.crouch.setPointerCapture=()=>{throw new Error('capture no longer active');};pointer(h.crouch,'pointerdown',2);assert.equal(h.held.crouch,true);
 pointer(h.root.ownerDocument!,'pointerup',2);assert.equal(h.held.crouch,false);
});


/** Execute the production held-action aggregation, lifecycle reset and keyboard handlers. */
function inputHarness(){
 const root=new Root(),canvas=new Surface(),crouch=new Button(root),jump=new Button(root);canvas.ownerDocument=root.ownerDocument;
 const pointers=new GameplayPointers(),buttons=bindTouchButtons(root as unknown as HTMLElement);
 const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
 const source=main.slice(main.indexOf('const crouchHold=bindHoldButton'),main.indexOf("canvas.addEventListener('wheel'"));
 const code=stripTypeScriptTypes(source,{mode:'strip'}),messages:Record<string,unknown>[]=[];
 const document=root.ownerDocument!,view=document.defaultView;
 Object.assign(document,{documentElement:{classList:{remove(){}}}});
 const api=new Function('createPanelNavigation','$','bindHoldButton','keyboardAction','movementInput','pointers','canvas','touchButtons','document','addEventListener','sendPhysics',`
 const activeConversation=null;function closeConversation(){}const startup={playing:true,initialized:true,failed:false};
  const state={regional:false,zone:'valley',player:{hp:100}};const labActive=false,livePractice=null,sessionReloading=false,sessionLoadFailed=false;let generationPanelDispose=null,mapPanelDispose=null,coopPanelDispose=null,equipmentPanelDispose=null;function cancelLabEntry(){}const history={state:null,pushState(value){this.state=value},replaceState(value){this.state=value},back(){this.state=null;panelNavigation.popped()}};const keys=new Set(),stick=pointers.stick,panel={hidden:true};let heldCrouch=false,heldJump=false,crouch=false,jump=false,transitioning=false,physicsReady=true,windowActive=true,inputMode='desktop',orbit=0;
  const coop={active:false,canAct:true,setSuspended(){}},coopPending=false;let coopJumpHeld=false,contactRequestId=null;function cancelGuardInput(){}function pressGuard(){}function interact(){}function attack(){}function persist(){}function openPanel(){panel.hidden=false;clearInput();}
  ${code}
  return {clearInput,panel,getHeld:()=>({crouch,jump}),getKeys:()=>[...keys]};
 `)(createPanelNavigation,(id:string)=>id==='crouch-btn'?crouch:jump,bindHoldButton,keyboardAction,movementInput,pointers,canvas,buttons,document,view.addEventListener.bind(view),(message:Record<string,unknown>)=>messages.push(message));
 return {root,canvas,crouch,jump,pointers,api,messages};
}
test('production input aggregation preserves C/Space and touch holds until their last source releases',()=>{
 const h=inputHarness();keyboard(h.canvas,'keydown','KeyC');keyboard(h.canvas,'keydown','Space');assert.deepEqual(h.api.getHeld(),{crouch:true,jump:true});
 pointer(h.crouch,'pointerdown',2);pointer(h.jump,'pointerdown',3);keyboard(h.canvas,'keyup','KeyC');keyboard(h.canvas,'keyup','Space');
 assert.deepEqual(h.api.getHeld(),{crouch:true,jump:true});pointer(h.crouch,'pointerup',2);assert.deepEqual(h.api.getHeld(),{crouch:false,jump:true});pointer(h.jump,'pointerup',3);assert.deepEqual(h.api.getHeld(),{crouch:false,jump:false});
 pointer(h.crouch,'pointerdown',4);pointer(h.jump,'pointerdown',5);keyboard(h.canvas,'keydown','KeyC');keyboard(h.canvas,'keydown','Space');pointer(h.crouch,'pointerup',4);pointer(h.jump,'pointerup',5);
 assert.deepEqual(h.api.getHeld(),{crouch:true,jump:true});keyboard(h.canvas,'keyup','Space');assert.deepEqual(h.api.getHeld(),{crouch:true,jump:false});keyboard(h.canvas,'keyup','KeyC');assert.deepEqual(h.api.getHeld(),{crouch:false,jump:false});
 assert.equal(h.messages.at(-1)?.crouch,false);assert.equal(h.messages.at(-1)?.jump,false);
});
test('production clearInput clears every held source and repeat cannot revive a stale key',()=>{
 const h=inputHarness();h.pointers.begin(1,70,200,800,'touch',0,true);h.pointers.move(1,128,200);
 keyboard(h.canvas,'keydown','KeyC');keyboard(h.canvas,'keydown','Space');pointer(h.crouch,'pointerdown',2);pointer(h.jump,'pointerdown',3);
 h.api.clearInput();assert.deepEqual(h.api.getHeld(),{crouch:false,jump:false});assert.deepEqual(h.pointers.pointerIds,[]);assert.equal(h.crouch.captures.size+h.jump.captures.size,0);assert.equal(h.messages.at(-1)?.paused,true);
 keyboard(h.canvas,'keydown','KeyC',{repeat:true});keyboard(h.canvas,'keydown','Space',{repeat:true});pointer(h.jump,'pointerdown',4);
 assert.deepEqual(h.api.getHeld(),{crouch:false,jump:true});pointer(h.jump,'pointerup',4);assert.deepEqual(h.api.getHeld(),{crouch:false,jump:false});
 keyboard(h.canvas,'keyup','KeyC');keyboard(h.canvas,'keydown','KeyC');assert.equal(h.api.getHeld().crouch,true);
});
test('production focused hold keys stay local to the focused action and ordinary controls stay native',()=>{
 const h=inputHarness();h.crouch.focus();keyboard(h.crouch,'keydown','Space');assert.deepEqual(h.api.getHeld(),{crouch:true,jump:false});assert.deepEqual(h.api.getKeys(),[]);
 keyboard(h.crouch,'keyup','Space');h.jump.focus();keyboard(h.jump,'keydown','Enter');assert.deepEqual(h.api.getHeld(),{crouch:false,jump:true});keyboard(h.jump,'keyup','Enter');
 const ordinary=new Button(h.root);ordinary.focus();assert.equal(keyboard(ordinary,'keydown','Space').defaultPrevented,false);assert.deepEqual(h.api.getHeld(),{crouch:false,jump:false});
});

test('independent Guard tap preserves movement thumb, supports nonprimary touch and rejects duplicate spending',()=>{const root=new Root(),button=new Button(root),pointers=new GameplayPointers();let guard=createGuardState(),combo=createComboState(),intents=0;bindTouchButtons(root as unknown as HTMLElement);button.addEventListener('click',()=>{const result=requestGuard(guard,combo,{player:{x:0,y:0,z:0,facing:0,hp:100,grounded:true,crouched:false},playing:true,obstacles:[]},'tap-'+(++intents));guard=result.state;combo=result.combo;});pointers.stick.begin(1,40,200,800);pointer(button,'pointerdown',2);pointer(button,'pointerup',2);assert.equal(intents,1);assert.equal(combo.stamina,78);assert.equal(pointers.stick.pointerId,1);click(button,{detail:1,pointerType:'touch'});assert.equal(intents,1);pointer(button,'pointerdown',3);pointer(button,'pointerup',3);assert.equal(intents,2);assert.equal(combo.stamina,78);pointer(button,'pointerdown',4);pointer(button,'pointercancel',4);pointer(button,'pointerup',4);assert.equal(intents,2);assert.equal(pointers.stick.pointerId,1);});
