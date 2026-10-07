import {constrainTownCrate} from './town-yards.ts';
import RAPIER from '@dimforge/rapier3d-compat';
import {MANTLE_TICKS,mantleSample,mantleContact,mantleWorld} from './ledge-mantle.ts';
import {emptyPlayerContact,type MovableBody,type PlayerContact,type Vec3} from './player-contact.ts';
const ROT={x:0,y:0,z:0,w:1},RADIUS=.32,HALF=.75,SKIN=.02,CENTER=HALF+RADIUS+SKIN,DT=1/60;
const copy=(v:Vec3):Vec3=>({x:v.x,y:v.y,z:v.z});
const add=(a:Vec3,b:Vec3,s=1):Vec3=>({x:a.x+b.x*s,y:a.y+b.y*s,z:a.z+b.z*s});
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
type Crate={spec:MovableBody;body:RAPIER.RigidBody;collider:RAPIER.Collider;fallSpeed:number};
type Hang={normal:Vec3;point:Vec3;left:Vec3;right:Vec3;target:Vec3;tick:number;climbing:boolean;descending?:boolean;rise?:number;ground?:RAPIER.Collider;support:RAPIER.Collider};
export interface ContactSpatialPolicy {
 /** Missing streamed support is dormancy, never an instruction to fall. */
 supportAvailable(spec:MovableBody,position:Vec3):boolean;
 constrainPosition(spec:MovableBody,position:Vec3):Vec3;
 bodyClear?(position:Vec3,hx:number,hy:number,hz:number):boolean;
}
export interface ContactMotion { p:Vec3;feetY:number;grounded:boolean;crouched:boolean;vx:number;vz:number;inputX:number;inputZ:number;grab:boolean;crouch:boolean;jump:boolean }
/** Bounded, local-only interaction. No impulses or hidden position offsets reach the motor. */
export class ContactPhysics {
 readonly crates:Crate[]=[];
 contact=emptyPlayerContact();
 diagnostic='Ready';
 private grip:Crate|null=null;
 private gripNormal:Vec3={x:0,y:0,z:0};
 private hang:Hang|null=null;
 private enabled:boolean;
 private grabPending=false;
 private latchReleased=true;
 private desired={x:0,z:0};
 private gripMode:'push'|'pull'='push';
 private movedCrate:Crate|null=null;
 private crateStart:Vec3|null=null;
 private crateDelta:Vec3|null=null;
 private world:RAPIER.World;
 private body:RAPIER.RigidBody;
 private collider:RAPIER.Collider;
 private spatialPolicy:ContactSpatialPolicy|undefined;
 constructor(world:RAPIER.World,body:RAPIER.RigidBody,collider:RAPIER.Collider,movable:MovableBody[],enabled:boolean,spatialPolicy?:ContactSpatialPolicy){
  this.world=world;this.body=body;this.collider=collider;
  this.enabled=enabled;this.spatialPolicy=spatialPolicy;
  for(const original of movable){const spec={...original,...(spatialPolicy?.constrainPosition(original,original)??original)};const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spec.x,spec.y,spec.z));const collider=world.createCollider(RAPIER.ColliderDesc.cuboid(spec.hx,spec.hy,spec.hz),body);this.crates.push({spec:{...spec},body,collider,fallSpeed:0});}
 }
 reset(){this.grip=null;this.hang=null;this.grabPending=false;this.latchReleased=true;this.contact=emptyPlayerContact();this.diagnostic='Released';}
 cancelPending(){this.grabPending=false;}
 disable(){this.enabled=false;this.reset();}
 requestGrab(){if(this.enabled)this.grabPending=true;}
 snapshot():MovableBody[]{return this.crates.map(c=>({...c.spec,...copy(c.body.translation())}));}
 isHanging(){return this.hang!==null;}
 private ray(origin:Vec3,dir:Vec3,length:number,exclude=this.collider){return this.world.castRayAndGetNormal(new RAPIER.Ray(origin,dir),length,true,undefined,undefined,exclude);}
 private supportedCrate(c:Crate,position=c.body.translation()){
  if(this.spatialPolicy&&!this.spatialPolicy.supportAvailable(c.spec,position))return false;
  // Every corner needs level support. Crates cannot float, bridge gaps, or be dragged over edges.
  return [[-.75,-.75],[.75,-.75],[-.75,.75],[.75,.75]].every(([x,z])=>{const hit=this.ray({x:position.x+x!*c.spec.hx,y:position.y-c.spec.hy+.04,z:position.z+z!*c.spec.hz},{x:0,y:-1,z:0},.1,c.collider);return !!hit&&hit.collider.handle!==this.collider.handle&&hit.normal.y>.9;});
 }
 private settleCrates(){
  for(const c of this.crates){
   if(this.spatialPolicy&&!this.spatialPolicy.supportAvailable(c.spec,c.body.translation())){
    c.fallSpeed=0;c.body.setNextKinematicTranslation(c.body.translation());if(this.grip===c)this.grip=null;continue;
   }
   if(this.supportedCrate(c)){c.fallSpeed=0;continue;}
   if(this.grip===c)this.grip=null;
   c.fallSpeed=Math.min(8,c.fallSpeed+18*DT);
   const start=c.body.translation(),delta={x:0,y:-c.fallSpeed*DT,z:0};
   const fraction=this.sweep(start,delta,new RAPIER.Cuboid(c.spec.hx,c.spec.hy-.004,c.spec.hz),c.collider);
   const next=add(start,delta,fraction);c.body.setTranslation(next,true);c.body.setNextKinematicTranslation(next);
   if(fraction<1)c.fallSpeed=0;
  }
  this.world.propagateModifiedBodyPositionsToColliders();
 }
 private palms(target:RAPIER.Collider,normal:Vec3,point:Vec3,p:Vec3,feetY:number,spread=.22):[Vec3|null,Vec3|null]{
  const tangent={x:normal.z,y:0,z:-normal.x};
  return [1,-1].map(side=>{
   const shoulder={x:p.x+tangent.x*side*.43,y:feetY+1.4,z:p.z+tangent.z*side*.43};
   const aim={x:point.x+tangent.x*side*spread-normal.x*.025,y:point.y,z:point.z+tangent.z*side*spread-normal.z*.025};
   const length=distance(shoulder,aim);if(length>.75||length<.02)return null;
   const dir={x:(aim.x-shoulder.x)/length,y:(aim.y-shoulder.y)/length,z:(aim.z-shoulder.z)/length};
   const hit=this.ray(shoulder,dir,length+.025);if(!hit||hit.collider.handle!==target.handle||Math.abs(hit.normal.y)>.65)return null;
   const surface=add(shoulder,dir,hit.timeOfImpact),palm=add(surface,normal,.06);return distance(shoulder,palm)<=.68?palm:null;
  }) as [Vec3|null,Vec3|null];
 }
 private gripEvidence(c:Crate,m:ContactMotion){
  if(!this.supportedCrate(c))return null;
  const b=c.body.translation(),y=Math.min(m.feetY+1.3,b.y+c.spec.hy-.08);
  if(y<m.feetY+.7)return null;
  const origin={x:m.p.x,y,z:m.p.z},dx=b.x-origin.x,dz=b.z-origin.z,length=Math.hypot(dx,dz);
  if(length<.001)return null;
  const hit=this.ray(origin,{x:dx/length,y:0,z:dz/length},Math.min(length,.85));
  if(!hit||hit.collider.handle!==c.collider.handle||Math.abs(hit.normal.y)>.3)return null;
  const point={x:origin.x+dx/length*hit.timeOfImpact,y,z:origin.z+dz/length*hit.timeOfImpact};
  const hands=this.palms(c.collider,hit.normal,point,m.p,m.feetY,Math.min(.22,Math.min(c.spec.hx,c.spec.hz)*.6));
  if(!hands[0]||!hands[1])return null;
  return {point,normal:copy(hit.normal),hands,distance:hit.timeOfImpact};
 }
 private clear(p:Vec3,half=HALF){return (this.spatialPolicy?.bodyClear?.(p,RADIUS,half+RADIUS,RADIUS)??true)&&!this.world.intersectionWithShape(p,ROT,new RAPIER.Capsule(half,RADIUS),undefined,undefined,this.collider);}
 private sweep(p:Vec3,delta:Vec3,shape:RAPIER.Shape,exclude:RAPIER.Collider,predicate?:(c:RAPIER.Collider)=>boolean){
  const length=Math.hypot(delta.x,delta.y,delta.z);if(length<1e-8)return 1;
  const hit=this.world.castShape(p,ROT,delta,shape,.003,1,true,undefined,undefined,exclude,undefined,predicate);
  return hit?Math.max(0,Math.min(1,hit.time_of_impact-.001/length)):1;
 }
 private pathClear(a:Vec3,b:Vec3){return this.clear(b)&&this.sweep(a,{x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},new RAPIER.Capsule(HALF,RADIUS),this.collider)>.999;}
 private mantlePosition(h:Hang,t:number){const s=mantleSample(t,h.rise);return mantleWorld(h.point,h.normal,s.depth,s.height+CENTER);}
 private mantleClear(h:Hang,t:number,previous:Vec3,previousHalf:number,previousProgress=Math.max(0,t-1/MANTLE_TICKS)){
  const s=mantleSample(t,h.rise),p=this.mantlePosition(h,t);
  // Translate the smaller capsule, then expand at its destination. Its fixed root datum
  // keeps capsule compaction separate from body motion and cannot produce an upward pop.
  if(!this.clear(p,s.half)||this.sweep(previous,{x:p.x-previous.x,y:p.y-previous.y,z:p.z-previous.z},new RAPIER.Capsule(Math.min(previousHalf,s.half),RADIUS),this.collider)<.999)return false;
  const prior=mantleSample(previousProgress,h.rise);
  for(const [along,radius] of [[.3,.26],[.77,.27],[.99,.34]]){
   const center=mantleWorld(h.point,h.normal,s.depth+Math.sin(s.lean)*along!,s.height+s.hipHeight+Math.cos(s.lean)*along!);
   const before=mantleWorld(h.point,h.normal,prior.depth+Math.sin(prior.lean)*along!,prior.height+prior.hipHeight+Math.cos(prior.lean)*along!);
   if(this.spatialPolicy?.bodyClear&&!this.spatialPolicy.bodyClear(center,radius!,radius!,radius!))return false;
   const shape=new RAPIER.Ball(radius!);
   if(this.world.intersectionWithShape(center,ROT,shape,undefined,undefined,this.collider)||this.sweep(before,{x:center.x-before.x,y:center.y-before.y,z:center.z-before.z},shape,this.collider)<.999)return false;
  }
  // Moving hands need swept clearance too, even while transferring between holds.
  for(const side of ['left','right'] as const){const hand=side==='left'?s.leftHand:s.rightHand,old=side==='left'?prior.leftHand:prior.rightHand;
   const lateral=(sample:ReturnType<typeof mantleSample>)=>side==='left'?.22+(sample.leftHand.depth+.05)/.17*.08:-.22-Math.min(1,(sample.rightHand.depth+.05)/.28)*.08;
   const at=mantleWorld(h.point,h.normal,hand.depth,hand.height,lateral(s)),before=mantleWorld(h.point,h.normal,old.depth,old.height,lateral(prior)),shape=new RAPIER.Ball(.04);
   if(this.spatialPolicy?.bodyClear&&!this.spatialPolicy.bodyClear(at,.04,.04,.04)||this.world.intersectionWithShape(at,ROT,shape,undefined,undefined,this.collider)||this.sweep(before,{x:at.x-before.x,y:at.y-before.y,z:at.z-before.z},shape,this.collider)<.999)return false;
  }
  const c=mantleContact(h.point,h.normal,t,h.rise);
  const handLeft=mantleWorld(h.point,h.normal,Math.max(.025,s.leftHand.depth),.06,.22+(s.leftHand.depth+.05)/.17*.08),handRight=mantleWorld(h.point,h.normal,Math.max(.025,s.rightHand.depth),.06,-.22-Math.min(1,(s.rightHand.depth+.05)/.28)*.08);
  const supports=[...(c.leftHandSupport?[handLeft]:[]),...(c.rightHandSupport?[handRight]:[]),...(c.leftKnee?[c.leftKnee]:[]),...(c.leftFootSupport?[c.leftFoot]:[]),...(c.rightFootSupport?[c.rightFoot]:[])];
  // The landing needs BOTH boot supports, not a single center ray on a thin platform.
  if(t===1)supports.push(c.leftFoot,c.rightFoot);
  for(const anchor of supports){const ground=!!h.ground&&anchor.y<h.point.y-.3,hit=this.ray({...anchor,y:ground?anchor.y+.08:h.point.y+.15},{x:0,y:-1,z:0},ground?.24:.22);if(!hit||hit.collider.handle!==(ground?h.ground!:h.support).handle||hit.normal.y<.9)return false;}
  return true;
 }
 private mantlePathClear(h:Hang,startTick=0){let previous=this.mantlePosition(h,startTick/MANTLE_TICKS),half=mantleSample(startTick/MANTLE_TICKS,h.rise).half;for(let tick=startTick+1;tick<=MANTLE_TICKS;tick++){const t=tick/MANTLE_TICKS;if(!this.mantleClear(h,t,previous,half))return false;previous=this.mantlePosition(h,t);half=mantleSample(t,h.rise).half;}return true;}
 private tryLowClimb(m:ContactMotion){
  const c=this.grip;if(!c||!m.grounded||m.crouched||m.crouch||!this.supportedCrate(c))return false;
  const e=this.gripEvidence(c,m);if(!e)return false;
  const top=c.body.translation().y+c.spec.hy,rise=top-m.feetY;if(rise<.8||rise>1.25)return false;
  const normal=e.normal,point={x:e.point.x-normal.x*.01,y:top+.015,z:e.point.z-normal.z*.01},tangent={x:normal.z,y:0,z:-normal.x},palm=add(point,normal,.06);palm.y=top+.06;
  const ground=this.ray({x:m.p.x,y:m.feetY+.1,z:m.p.z},{x:0,y:-1,z:0},.18);if(!ground||ground.normal.y<.9)return false;
  const h:Hang={normal,point,left:add(palm,tangent,.22),right:add(palm,tangent,-.22),target:mantleWorld(point,normal,-.375,-rise+CENTER),tick:0,climbing:true,support:c.collider,rise,ground:ground.collider};
  if(distance(m.p,h.target)>.08||!this.pathClear(m.p,h.target)||!this.mantleClear(h,0,m.p,HALF,0)||!this.mantlePathClear(h))return false;
  this.grip=null;this.hang=h;this.latchReleased=false;this.diagnostic='Climbing supported crate';return true;
 }
 private tryDescend(m:ContactMotion){
  if(!m.grounded||m.crouched||m.crouch||m.jump)return false;
  const length=Math.hypot(m.inputX,m.inputZ);if(length<.3)return false;
  const normal={x:m.inputX/length,y:0,z:m.inputZ/length};
  const top=this.ray({x:m.p.x,y:m.feetY+.1,z:m.p.z},{x:0,y:-1,z:0},.2);
  if(!top||top.normal.y<.9)return false;
  const crate=this.crates.find(c=>c.collider.handle===top.collider.handle);if(crate&&!this.supportedCrate(crate))return false;
  const face=this.ray({x:m.p.x+normal.x*.95,y:m.feetY-.2,z:m.p.z+normal.z*.95},{x:-normal.x,y:0,z:-normal.z},1.2);
  if(!face||face.collider.handle!==top.collider.handle||face.normal.x*normal.x+face.normal.z*normal.z<.99)return false;
  const edge={x:m.p.x+normal.x*(.95-face.timeOfImpact),y:m.feetY+.1-top.timeOfImpact,z:m.p.z+normal.z*(.95-face.timeOfImpact)};
  const point={x:edge.x-normal.x*.01,y:edge.y+.015,z:edge.z-normal.z*.01},tangent={x:normal.z,y:0,z:-normal.x},palm=add(point,normal,.06);palm.y=edge.y+.06;
  const h:Hang={normal,point,left:add(palm,tangent,.22),right:add(palm,tangent,-.22),target:mantleWorld(point,normal,-.375,-1.9+CENTER),tick:MANTLE_TICKS,climbing:true,descending:true,support:top.collider};
  if(crate){const floor=this.ray({x:h.target.x,y:edge.y-.1,z:h.target.z},{x:0,y:-1,z:0},1.3);if(!floor||floor.normal.y<.9)return false;const rise=.1+floor.timeOfImpact;if(rise<.8||rise>1.25)return false;h.rise=rise;h.ground=floor.collider;h.target=mantleWorld(point,normal,-.375,-rise+CENTER);}
  const start=this.mantlePosition(h,1);
  // Acquisition is a tiny swept alignment on the supported top, never an edge teleport.
  if(distance(m.p,start)>.06||!this.pathClear(m.p,start)||!this.clear(h.target)||!crate&&this.ray({x:h.target.x,y:edge.y-1.84,z:h.target.z},{x:0,y:-1,z:0},.2))return false;
  let previous=start,half=HALF;
  for(let tick=MANTLE_TICKS-1;tick>=0;tick--){const t=tick/MANTLE_TICKS;if(!this.mantleClear(h,t,previous,half,(tick+1)/MANTLE_TICKS))return false;previous=this.mantlePosition(h,t);half=mantleSample(t,h.rise).half;}
  this.hang=h;this.latchReleased=false;this.diagnostic=crate?'Climbing down to supported ground':'Lowering to supported hang';return true;
 }
 private tryHang(m:ContactMotion){
  if(!this.enabled||!this.latchReleased||!m.grab||m.grounded||m.crouched||m.crouch)return;
  const len=Math.hypot(m.inputX,m.inputZ);if(len<.3)return;
  const direction={x:m.inputX/len,y:0,z:m.inputZ/len};
  const origin={x:m.p.x,y:m.feetY+1.3,z:m.p.z},wall=this.ray(origin,direction,.8);
  if(!wall||Math.abs(wall.normal.y)>.2||this.crates.some(c=>c.collider.handle===wall.collider.handle))return;
  const normal=copy(wall.normal);if(direction.x*normal.x+direction.z*normal.z>-.7)return;
  const wallPoint=add(origin,direction,wall.timeOfImpact),tangent={x:normal.z,y:0,z:-normal.x};
  const tops=[-1,1].map(side=>this.ray({x:wallPoint.x-normal.x*.18+tangent.x*side*.23,y:m.feetY+2.45,z:wallPoint.z-normal.z*.18+tangent.z*side*.23},{x:0,y:-1,z:0},1.15));
  if(tops.some(h=>!h||h.collider.handle!==wall.collider.handle||h.normal.y<.9))return;
  const top=m.feetY+2.45-tops[0]!.timeOfImpact,top2=m.feetY+2.45-tops[1]!.timeOfImpact;
  if(Math.abs(top-top2)>.035)return;
  const feet=top-1.9;
  // A nearby floor makes this a standing brace, not a hanging state.
  const hangP={x:wallPoint.x+normal.x*(RADIUS+.055),y:feet+CENTER,z:wallPoint.z+normal.z*(RADIUS+.055)};
  if(Math.abs(m.p.y-hangP.y)>.48||distance(m.p,hangP)>.65||this.ray({x:hangP.x,y:feet+.06,z:hangP.z},{x:0,y:-1,z:0},.2)||!this.pathClear(m.p,hangP))return;
  const point={x:wallPoint.x-normal.x*.01,y:top+.015,z:wallPoint.z-normal.z*.01};
  const palm={x:point.x+normal.x*.06,y:top+.06,z:point.z+normal.z*.06};
  // Acquire only once BOTH real shoulders can reach the anchors now and at the
  // settled hang pose. The approach never reports phantom hands across empty air.
  if([m.p,hangP].some(p=>[1,-1].some(side=>distance({x:p.x+normal.x*.021+tangent.x*side*.43,y:p.y-CENTER+1.435,z:p.z+normal.z*.021+tangent.z*side*.43},add(palm,tangent,side*.22))>.675)))return;
  const candidate:Hang={normal,point,left:add(palm,tangent,.22),right:add(palm,tangent,-.22),target:hangP,tick:0,climbing:false,support:wall.collider};
  if(!this.mantlePathClear(candidate))return;
  this.hang=candidate;this.diagnostic='Hanging: fresh Jump climbs; action or Crouch drops';
  this.latchReleased=false;this.grip=null;
 }
 /** Called before the ordinary controller sweep. Returns a swept special move only for a real hang. */
 before(m:ContactMotion):{vx:number;vz:number;position?:Vec3;climbing?:boolean;consumeJump?:boolean;finished?:boolean;capsuleHalfHeight?:number}{
  this.desired={x:m.vx,z:m.vz};this.movedCrate=null;this.crateStart=null;this.crateDelta=null;
  if(!m.grab)this.latchReleased=true;
  if(!this.enabled){this.grabPending=false;return {vx:m.vx,vz:m.vz};}
  this.settleCrates();
  if(this.grabPending){this.grabPending=false;this.diagnostic='Blocked: no reachable supported crate or clear ledge path';if(this.hang){this.hang=null;this.latchReleased=false;this.contact=emptyPlayerContact();this.diagnostic='Released into gravity';return {vx:0,vz:0,consumeJump:true};}if(this.grip){this.grip=null;this.diagnostic='Crate released';}else if(m.grounded&&!m.crouched&&!m.crouch){const candidates=this.crates.map(c=>({c,e:this.gripEvidence(c,m)})).filter(v=>v.e).sort((a,b)=>a.e!.distance-b.e!.distance);if(candidates[0]){this.grip=candidates[0].c;this.gripNormal=candidates[0].e!.normal;this.diagnostic='Crate gripped';}else this.tryDescend(m);}}
  let lowJump=false;if(this.grip&&m.jump){lowJump=true;if(!this.tryLowClimb(m)){this.diagnostic='Blocked: crate climb needs close alignment, clear hands/head and both landing supports';return {vx:0,vz:0,consumeJump:true};}}
  if(this.grip&&(m.crouch||m.jump||!m.grounded||!this.gripEvidence(this.grip,m)))this.grip=null;
  if(!this.hang&&!this.grip)this.tryHang(m);
  if(this.hang){
   const h=this.hang;
   if(m.crouch||!h.support.isValid()||!this.clear(h.target)){this.hang=null;this.contact=emptyPlayerContact();this.diagnostic='Released: crouch, lost support or obstruction';return {vx:0,vz:0,consumeJump:true};}
   let consumeJump=lowJump;if(m.jump&&!h.climbing){
    consumeJump=true;if(distance(m.p,h.target)<.01&&this.mantlePathClear(h))h.climbing=true;
   }
   let next:Vec3,finished=false,half=HALF;
   if(h.climbing){
    const tick=h.tick+(h.descending?-1:1),t=tick/MANTLE_TICKS;
    if(!this.mantleClear(h,t,m.p,mantleSample(h.tick/MANTLE_TICKS,h.rise).half,h.tick/MANTLE_TICKS)){
     this.hang=null;this.contact=emptyPlayerContact();this.diagnostic='Released: traversal path obstructed';return {vx:0,vz:0,consumeJump:true};
    }
    h.tick=tick;next=this.mantlePosition(h,t);half=mantleSample(t,h.rise).half;finished=tick===MANTLE_TICKS||!!h.ground&&h.descending===true&&tick===0;
   }else{
    const dist=distance(m.p,h.target),step=Math.min(1,2*DT/Math.max(dist,1e-8));
    next={x:m.p.x+(h.target.x-m.p.x)*step,y:m.p.y+(h.target.y-m.p.y)*step,z:m.p.z+(h.target.z-m.p.z)*step};
    if(!this.pathClear(m.p,next)){this.hang=null;this.contact=emptyPlayerContact();return {vx:0,vz:0,consumeJump:true};}
   }
   this.contact={mode:h.climbing?'climb':'hang',strength:1,normal:copy(h.normal),point:copy(h.point),leftHand:copy(h.left),rightHand:copy(h.right),targetId:null,desired:{...this.desired},resolved:{x:(next.x-m.p.x)/DT,z:(next.z-m.p.z)/DT},supported:false};
   if(h.climbing){
    const t=h.tick/MANTLE_TICKS,s=mantleSample(t,h.rise),e=mantleContact(h.point,h.normal,t,h.rise);this.contact.mantle=e;
    this.contact.leftHand=t<=.55?mantleWorld(h.point,h.normal,s.leftHand.depth,s.leftHand.height,.22+(s.leftHand.depth+.05)/.17*.08):null;
    this.contact.rightHand=t<=.68?mantleWorld(h.point,h.normal,s.rightHand.depth,s.rightHand.height,-.22-Math.min(1,(s.rightHand.depth+.05)/.28)*.08):null;
    this.contact.supported=e.leftFootSupport||e.rightFootSupport||e.leftKnee!==null;
   }
   if(finished)this.hang=null;
   if(h.descending&&h.tick===0&&!h.ground){h.climbing=false;h.descending=false;this.diagnostic='Hanging: fresh Jump climbs; action or Crouch drops';}
   return {vx:this.contact.resolved.x,vz:this.contact.resolved.z,position:next,climbing:h.climbing,consumeJump,finished,capsuleHalfHeight:half};
  }
  if(this.grip){
   const c=this.grip,e=this.gripEvidence(c,m)!;this.gripNormal=e.normal;
   // Constrain movement to the crate's actual contact normal: lateral steering releases no forces.
   const intent=-(m.vx*e.normal.x+m.vz*e.normal.z),speed=Math.max(-1.15,Math.min(1.15,intent));
   let delta={x:-e.normal.x*speed*DT,y:0,z:-e.normal.z*speed*DT};const start=copy(c.body.translation());
   {const proposed=constrainTownCrate(c.spec,add(start,delta)),target=this.spatialPolicy?.constrainPosition(c.spec,proposed)??proposed;delta={x:target.x-start.x,y:0,z:target.z-start.z};}
   this.gripMode=speed<-.025?'pull':'push';
   let fraction=this.sweep(start,delta,new RAPIER.Cuboid(c.spec.hx,c.spec.hy-.004,c.spec.hz),c.collider,q=>q.handle!==this.collider.handle);
   // Both bodies sweep the same translation. Exclude only their own pair and prove their
   // relative separation stays constant, so a pull never drags a box through its owner.
   fraction=Math.min(fraction,this.sweep(m.p,delta,this.collider.shape,this.collider,q=>q.handle!==c.collider.handle));
   let next=add(start,delta,fraction);if(!this.supportedCrate(c,next)||this.spatialPolicy?.bodyClear?.(next,c.spec.hx,c.spec.hy,c.spec.hz)===false||this.spatialPolicy?.bodyClear?.(add(m.p,delta,fraction),RADIUS,this.collider.halfHeight()+RADIUS,RADIUS)===false){fraction=0;next=start;this.diagnostic='Blocked: crate support, parcel boundary or actor';}
   this.movedCrate=c;this.crateStart=start;this.crateDelta={x:delta.x*fraction,y:0,z:delta.z*fraction};
   c.body.setTranslation(next,true);c.body.setNextKinematicTranslation(next);this.world.propagateModifiedBodyPositionsToColliders();
   return {vx:delta.x*fraction/DT,vz:delta.z*fraction/DT};
  }
  return {vx:m.vx,vz:m.vz};
 }
 /** Finalize the paired move with the character's real resolved sweep, never an assumed velocity. */
 finishPair(resolved:Vec3){
  if(!this.movedCrate||!this.crateStart||!this.crateDelta)return;
  const delta=this.crateDelta,len2=delta.x*delta.x+delta.z*delta.z;
  const fraction=len2>1e-10?Math.max(0,Math.min(1,(resolved.x*delta.x+resolved.z*delta.z)/len2)):0;
  const next=add(this.crateStart,delta,fraction);this.movedCrate.body.setTranslation(next,true);this.movedCrate.body.setNextKinematicTranslation(next);this.world.propagateModifiedBodyPositionsToColliders();
 }
 after(m:ContactMotion,resolved:{x:number;z:number},collisions:RAPIER.CharacterCollision[]){
  if(this.hang)return;
  if(this.grip){const evidence=this.gripEvidence(this.grip,m);if(evidence){this.contact={mode:this.gripMode,strength:Math.min(1,.3+Math.hypot(this.desired.x,this.desired.z)/1.15*.7),normal:evidence.normal,point:evidence.point,leftHand:evidence.hands[0],rightHand:evidence.hands[1],targetId:this.grip.spec.id,desired:{...this.desired},resolved,supported:m.grounded};return;}this.grip=null;}
  let best:RAPIER.CharacterCollision|null=null,pressure=0;
  for(const c of collisions){const n=c.normal1;if(!c.collider||Math.abs(n.y)>.45)continue;const blocked=-((this.desired.x-resolved.x)*n.x+(this.desired.z-resolved.z)*n.z);if(blocked>pressure){best=c;pressure=blocked;}}
  if(best&&pressure>.035){const normal=copy(best.normal1),raw=copy(best.witness1),point={x:raw.x,y:m.feetY+1.3,z:raw.z};const hands=this.palms(best.collider!,normal,point,m.p,m.feetY);
   this.contact={mode:'wall',strength:this.contact.strength+(Math.min(1,pressure/Math.max(.1,Math.hypot(this.desired.x,this.desired.z)))-this.contact.strength)*(1-Math.exp(-DT*18)),normal,point:raw,leftHand:hands[0],rightHand:hands[1],targetId:null,desired:{...this.desired},resolved,supported:m.grounded};
  }else{
   // Release has no stale world anchors. The rig may use the decaying weight to ease home.
   const strength=this.contact.mode==='climb'?0:this.contact.strength*Math.exp(-DT*20),normal=copy(this.contact.normal);this.contact={...emptyPlayerContact(),mode:strength<.002?'none':'wall',normal:strength<.002?{x:0,y:0,z:0}:normal,strength:strength<.002?0:strength,desired:{...this.desired},resolved,supported:m.grounded};
  }
 }
}
