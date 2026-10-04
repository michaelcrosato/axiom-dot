/** Floating analog stick: one owned pointer, no visible widget or global touch interception. */
export class FloatingStick {
  pointerId: number | null = null;
  origin = {x:0,y:0};
  value = {x:0,z:0};
  readonly radius:number; readonly deadzone:number;
  constructor(radius=58, deadzone=8) {this.radius=radius;this.deadzone=deadzone;}
  begin(id:number,x:number,y:number,width:number,eligible=true):boolean {
    if(!eligible || this.pointerId!==null || x<0 || x>=width*.5) return false;
    this.pointerId=id;this.origin={x,y};this.value={x:0,z:0};return true;
  }
  move(id:number,x:number,y:number):boolean {
    if(id!==this.pointerId)return false;
    const dx=x-this.origin.x,dz=y-this.origin.y,d=Math.hypot(dx,dz);
    const strength=Math.min(1,Math.max(0,(d-this.deadzone)/(this.radius-this.deadzone)));
    this.value=d?{x:dx/d*strength,z:dz/d*strength}:{x:0,z:0};return true;
  }
  end(id:number):boolean {if(id!==this.pointerId)return false;this.reset();return true;}
  reset(){this.pointerId=null;this.value={x:0,z:0};}
}

export const KEY_ACTIONS={KeyC:'crouch',KeyE:'interact',KeyF:'pulse',KeyG:'guard',Space:'jump',KeyK:'save',KeyB:'build',KeyJ:'journal',KeyM:'map',Escape:'close'} as const;
export type KeyAction=typeof KEY_ACTIONS[keyof typeof KEY_ACTIONS];
export function keyboardAction(code:string,controlTarget=false):KeyAction|undefined {
  if(controlTarget&&code!=='Escape')return undefined;
  return KEY_ACTIONS[code as keyof typeof KEY_ACTIONS];
}
export function hasTouchControls(maxTouchPoints:number,coarsePointer:boolean){return maxTouchPoints>0||coarsePointer;}
/** Canvas-only ownership. Left movement and button pointers are never borrowed by pinch.
 * Two touches that START in the right world half pinch; one right touch orbits. */
export class GameplayPointers {
  stick=new FloatingStick(); orbitId:number|null=null; orbitX=0;
  private cameraTouches=new Map<number,{x:number;y:number}>();
  private pinchDistance=0;
  get pointerIds(){return [...new Set([this.stick.pointerId,this.orbitId,...this.cameraTouches.keys()].filter((id):id is number=>id!==null))];}
  get pinching(){return this.cameraTouches.size===2;}
  begin(id:number,x:number,y:number,width:number,type:string,button:number,eligible:boolean){
    if(!eligible||this.pointerIds.includes(id))return false;
    if(type==='touch'&&x<width*.5)return this.stick.begin(id,x,y,width);
    if(type==='touch'&&x>=width*.5&&this.cameraTouches.size<2&&(this.orbitId===null||this.cameraTouches.has(this.orbitId))){
      this.cameraTouches.set(id,{x,y});
      if(this.orbitId===null){this.orbitId=id;this.orbitX=x;}
      if(this.pinching)this.pinchDistance=this.distance();
      return true;
    }
    if(type==='mouse'&&button===2&&this.orbitId===null){this.orbitId=id;this.orbitX=x;return true;}
    return false;
  }
  private distance(){const [a,b]=this.cameraTouches.values();return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;}
  move(id:number,x:number,y:number){
    if(this.stick.move(id,x,y))return {handled:true,orbit:0,zoomRatio:1};
    if(this.cameraTouches.has(id)){
      this.cameraTouches.set(id,{x,y});
      if(this.pinching){const d=this.distance(),previous=this.pinchDistance;this.pinchDistance=d;return {handled:true,orbit:0,zoomRatio:d>=12&&previous>=12?previous/d:1};}
    }
    if(id===this.orbitId){const delta=(this.orbitX-x)*.008;this.orbitX=x;return {handled:true,orbit:delta,zoomRatio:1};}
    return {handled:false,orbit:0,zoomRatio:1};
  }
  end(id:number){
    this.stick.end(id);
    const camera=this.cameraTouches.delete(id);
    if(camera){const first=this.cameraTouches.entries().next().value;this.orbitId=first?.[0]??null;this.orbitX=first?.[1].x??0;this.pinchDistance=0;}
    else if(id===this.orbitId)this.orbitId=null;
  }
  reset(){this.stick.reset();this.orbitId=null;this.cameraTouches.clear();this.pinchDistance=0;}
}
