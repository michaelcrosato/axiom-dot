/** Independent touch taps for buttons, including non-primary fingers. Native click remains
 * the activation path for mouse, keyboard and assistive technology. No global touch cancel. */
export function bindTouchButtons(root:HTMLElement,onTouch:()=>void=()=>{}) {
 type Press={button:HTMLButtonElement;x:number;y:number;cancelled:boolean};
 const presses=new Map<number,Press>();
 let legacyClickUntil=0;
 const release=(id:number,press:Press)=>{
  presses.delete(id);
  if(press.button.hasPointerCapture(id))press.button.releasePointerCapture(id);
 };
 const down=(event:PointerEvent)=>{
  // A real mouse press makes any later native mouse click eligible immediately.
  if(event.pointerType==='mouse'){legacyClickUntil=0;return;}
  if(event.pointerType!=='touch')return;
  onTouch();
  const button=(event.target as Element).closest<HTMLButtonElement>('button');
  if(!button||!root.contains(button)||button.hasAttribute('data-hold')||button.disabled||button.closest('[hidden]'))return;
  presses.set(event.pointerId,{button,x:event.clientX,y:event.clientY,cancelled:false});
  button.setPointerCapture(event.pointerId);
  // Do not preventDefault here: scrollable panels must still pan/cancel normally.
 };
 const move=(event:PointerEvent)=>{
  const press=presses.get(event.pointerId);if(!press)return;
  if(Math.hypot(event.clientX-press.x,event.clientY-press.y)>14)press.cancelled=true;
 };
 const up=(event:PointerEvent)=>{
  const press=presses.get(event.pointerId);if(!press)return;
  release(event.pointerId,press);
  const {button}=press,rect=button.getBoundingClientRect();
  const inside=event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom;
  // Suppress the browser's optional follow-on touch click, even for cancelled taps.
  legacyClickUntil=Date.now()+900;event.preventDefault();
  if(press.cancelled||!inside||!button.isConnected||button.disabled||button.closest('[hidden]')||!rect.width||!rect.height)return;
  button.click();
 };
 const cancel=(event:PointerEvent)=>{const press=presses.get(event.pointerId);if(press){legacyClickUntil=Date.now()+900;release(event.pointerId,press);}};
 const click=(event:MouseEvent)=>{
  const button=(event.target as Element).closest<HTMLButtonElement>('button');
  if(!button||!root.contains(button)||button.hasAttribute('data-hold'))return;
  const pointerType=(event as PointerEvent).pointerType;
  const touchSource=(event as MouseEvent&{sourceCapabilities?:{firesTouchEvents?:boolean}}).sourceCapabilities?.firesTouchEvents;
  // button.click() and native keyboard activation have detail=0 and must remain accessible.
  if(pointerType==='touch'||touchSource||(event.detail>0&&!pointerType&&Date.now()<legacyClickUntil)){
   event.preventDefault();event.stopImmediatePropagation();
  }
 };
 root.addEventListener('pointerdown',down);root.addEventListener('pointermove',move);
 root.addEventListener('pointerup',up);root.addEventListener('pointercancel',cancel);root.addEventListener('lostpointercapture',cancel);
 root.addEventListener('click',click,true);
 return {reset(){if(presses.size)legacyClickUntil=Date.now()+900;for(const [id,press] of [...presses])release(id,press);},isPressed(button:HTMLElement){return [...presses.values()].some(p=>p.button===button);}};
}

/** Hold actions own their pointers rather than relying on a synthesized click. Pointer
 * capture stays on the button when its label is rerendered. A cancelled source cannot
 * re-arm from movement/key repeat; another pointer or key may still keep the action held. */
export function bindHoldButton(button:HTMLElement,setHeld:(held:boolean)=>void) {
 const pointers=new Set<number>(),keys=new Set<string>();
 const document=button.ownerDocument,view=document.defaultView;
 let held=false;
 button.setAttribute('data-hold','');
 const available=()=>button.isConnected&&!(button as HTMLButtonElement).disabled&&!button.closest('[hidden]');
 const inside=(event:PointerEvent)=>{
  const rect=button.getBoundingClientRect();
  return rect.width>0&&rect.height>0&&event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom;
 };
 const update=()=>{const next=pointers.size>0||keys.size>0;if(next!==held){held=next;setHeld(next);}};
 const release=(id:number)=>{
  if(!pointers.delete(id))return;
  // Removal, cancellation and loss of capture can race with browser cleanup.
  try{if(button.hasPointerCapture(id))button.releasePointerCapture(id);}catch{/* Already released by the browser. */}
  update();
 };
 const reset=()=>{
  const ids=[...pointers];pointers.clear();keys.clear();
  for(const id of ids)try{if(button.hasPointerCapture(id))button.releasePointerCapture(id);}catch{/* Detached or already released. */}
  update();
 };
 const down=(event:PointerEvent)=>{
  if(!available()||!inside(event)||pointers.has(event.pointerId))return;
  if(event.pointerType!=='touch'&&event.button!==0)return;
  pointers.add(event.pointerId);
  try{button.setPointerCapture(event.pointerId);}catch{/* Document handlers still release the source. */}
  // Keep native mouse focus, while preventing compatibility touch mouse events.
  if(event.pointerType!=='mouse')event.preventDefault();
  update();
 };
 const move=(event:PointerEvent)=>{
  if(pointers.has(event.pointerId)&&(!available()||!inside(event)||(event.pointerType==='mouse'&&(event.buttons&1)===0)))release(event.pointerId);
 };
 const end=(event:PointerEvent)=>release(event.pointerId);
 const key=(event:KeyboardEvent)=>event.code==='Space'||event.code==='Enter';
 const keydown=(event:KeyboardEvent)=>{
  if(!key(event)||document.activeElement!==button||!available())return;
  event.preventDefault();
  if(event.repeat)return;
  keys.add(event.code);update();
 };
 const keyup=(event:KeyboardEvent)=>{
  if(!key(event)||!keys.has(event.code))return;
  event.preventDefault();keys.delete(event.code);update();
 };
 button.addEventListener('pointerdown',down);
 button.addEventListener('pointermove',move);
 button.addEventListener('pointerup',end);
 button.addEventListener('pointercancel',end);
 button.addEventListener('lostpointercapture',end);
 button.addEventListener('pointerleave',end);
 button.addEventListener('keydown',keydown);
 button.addEventListener('keyup',keyup);
 // Moving focus clears keyboard sources only, preserving independently held touches.
 button.addEventListener('blur',()=>{keys.clear();update();});
 // Clicks (including compatibility or native keyboard clicks) are never toggles.
 button.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();},true);
 document.addEventListener('pointermove',move);
 document.addEventListener('pointerup',end);
 document.addEventListener('pointercancel',end);
 document.addEventListener('keyup',keyup);
 view?.addEventListener('blur',reset);
 view?.addEventListener('pagehide',reset);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
 return {reset,isHeld:()=>held};
}
