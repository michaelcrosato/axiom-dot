import {AxiomRegistry,compileRecipe,expr,seedSample,type Costs,type Expression,type PortDef,type Recipe,type Reservation,type SemanticPlan} from './procedural.ts';
/** Constrained, renderer-independent workshop grammar. Geometry uses metres. */
export const WORKSHOP_ORIGIN = Object.freeze({x:-31,z:-14});
export const WORKSHOP_CLEARANCE = Object.freeze({x:-31,z:-13.5,hx:6,hz:6.5});
export const WORKSHOP_WALL_THICKNESS = .2;
export const WORKSHOP_WALL_HEIGHT = 3.2;
export const WORKSHOP_DOOR_HEIGHT = 2.65;
export interface WorkshopPoint {x:number;z:number}
export interface WorkshopRoom {
 id:string; role:'workshop'|'stockroom'|'finishing'|'repair';
 center:WorkshopPoint; min:WorkshopPoint; max:WorkshopPoint;
}
export interface WorkshopDoor {
 id:string; from:string; to:string; center:WorkshopPoint; width:number; height:number;
}
export interface WorkshopLayout {
 width:number; depth:number; hallDepth:number; doorwayWidth:number;
 rooms:WorkshopRoom[]; doors:WorkshopDoor[]; spawn:WorkshopPoint;
 workplace:WorkshopPoint; origin:WorkshopPoint;
}
interface BoxDraft {key:string;x:number;y:number;z:number;hx:number;hy:number;hz:number;role:'floor'|'wall'|'lintel'|'roof'|'furniture';material:'stone'|'plaster'|'timber'|'roof'|'metal'}
const round=(v:number)=>Math.round(v*10000)/10000;

/** Rear-room fan grammar: every room opens directly into the main work hall. */
function layoutWorkshop(origin:WorkshopPoint,width:number,depth:number,hallDepth:number,rearRooms:number,doorwayWidth:number,entranceOffset:number):WorkshopLayout {
 const west=origin.x-width/2,east=origin.x+width/2,north=origin.z-depth/2,south=origin.z+depth/2,partition=south-hallDepth;
 const hall:WorkshopRoom={id:'hall',role:'workshop',center:{x:origin.x,z:round((partition+south)/2)},min:{x:west,z:partition},max:{x:east,z:south}};
 const rooms=[hall];const roles=['stockroom','finishing','repair'] as const;
 const entry={x:round(origin.x+entranceOffset),z:south};
 const doors:WorkshopDoor[]=[{id:'entry',from:'outside',to:'hall',center:entry,width:doorwayWidth,height:WORKSHOP_DOOR_HEIGHT}];
 for(let i=0;i<rearRooms;i++){
  const left=round(west+width*i/rearRooms),right=round(west+width*(i+1)/rearRooms),cx=round((left+right)/2),id=`rear-${i}`;
  rooms.push({id,role:roles[i]!,center:{x:cx,z:round((north+partition)/2)},min:{x:left,z:north},max:{x:right,z:partition}});
  doors.push({id:`door-${i}`,from:'hall',to:id,center:{x:cx,z:partition},width:doorwayWidth,height:WORKSHOP_DOOR_HEIGHT});
 }
 return {origin:{...origin},width,depth,hallDepth,doorwayWidth,rooms,doors,spawn:{x:entry.x,z:round(south+1.3)},workplace:{x:round(east-1.75),z:round(south-1.25)}};
}

/** Every solid's box is reused verbatim by the render and collision adapters. */
function workshopBoxes(layout:WorkshopLayout):BoxDraft[]{
 const {width,depth,origin,rooms,doors}=layout,w=WORKSHOP_WALL_THICKNESS,h=WORKSHOP_WALL_HEIGHT;
 const west=origin.x-width/2,east=origin.x+width/2,north=origin.z-depth/2,south=origin.z+depth/2;
 const boxes:BoxDraft[]=[];
 function box(key:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,role:BoxDraft['role'],material:BoxDraft['material']){
  if(sx<=0||sy<=0||sz<=0)throw new RangeError(`Invalid workshop box ${key}`);
  boxes.push({key,x:round(x),y:round(y),z:round(z),hx:round(sx/2),hy:round(sy/2),hz:round(sz/2),role,material});
 }
 function doorway(key:string,left:number,right:number,z:number,door:WorkshopDoor){
  const a=door.center.x-door.width/2,b=door.center.x+door.width/2;
  box(`${key}/left`,(left+a)/2,h/2,z,a-left,h,w,'wall','plaster');
  box(`${key}/right`,(b+right)/2,h/2,z,right-b,h,w,'wall','plaster');
  box(`${key}/lintel`,door.center.x,(h+door.height)/2,z,door.width,h-door.height,w,'lintel','timber');
 }
 box('foundation',origin.x,-.06,origin.z,width,.12,depth,'floor','stone');
 box('west-wall',west,h/2,origin.z,w,h,depth+w,'wall','plaster');
 box('east-wall',east,h/2,origin.z,w,h,depth+w,'wall','plaster');
 box('north-wall',origin.x,h/2,north,width,h,w,'wall','plaster');
 doorway('south-wall',west,east,south,doors[0]!);
 for(let i=1;i<rooms.length;i++){
  const room=rooms[i]!,door=doors[i]!;
  doorway(`partition-${i}`,room.min.x,room.max.x,room.max.z,door);
  if(i<rooms.length-1)box(`room-divider-${i}`,room.max.x,h/2,(north+room.max.z)/2,w,h,room.max.z-north,'wall','plaster');
  // The center route and doorway stay empty; useful furniture hugs each rear wall.
  box(`room-bench-${i}`,room.center.x,.45,north+.65,Math.min(1.45,(room.max.x-room.min.x)-1.2),.9,.65,'furniture',room.role==='repair'?'metal':'timber');
 }
 box('workbench',east-.55,.5,south-1.25,.65,1,1.3,'furniture','timber');
 // The ceiling clears the full standing capsule; no invisible doorway blockers.
 box('roof',origin.x,h+.12,origin.z,width+.4,.24,depth+.4,'roof','roof');
 return boxes;
}

export interface WorkshopOptions {
 origin?:WorkshopPoint;
 owner?:string;
 maxCost?:Costs;
 bounds?:Reservation;
 reservations?:readonly Reservation[];
}
export interface CompiledWorkshop extends WorkshopLayout {
 plan:SemanticPlan;
 bounds:Reservation;
}
export const WORKSHOP_BUDGET = Object.freeze({stone:48,timber:32,metal:8,labor:36});
const WORKSHOP_OWNER='valley/workshop';
const spatial=(key:string,direction:PortDef['direction'],facing:number,required=false):PortDef=>({key,type:'spatial',direction,protocol:'walk-path/v1',position:{x:0,y:0,z:0},facing:{x:0,y:0,z:facing},capacity:1,unit:'traveler',required});

/** Registered primitives have bounded dimensions; recipes never supply executable hooks. */
export function registerWorkshop(registry:AxiomRegistry):AxiomRegistry {
 const costs:Record<BoxDraft['role'],Costs>={floor:{stone:4,labor:2},wall:{stone:2,labor:1},lintel:{timber:1,labor:1},roof:{timber:8,labor:2},furniture:{timber:2,metal:1,labor:1}};
 const materials:Record<BoxDraft['material'],string>={stone:'workshop-stone',plaster:'workshop-plaster',timber:'workshop-timber',roof:'workshop-roof',metal:'workshop-metal'};
 const primitiveKinds:readonly [BoxDraft['role'],readonly BoxDraft['material'][]][]=[['floor',['stone']],['wall',['plaster','stone']],['lintel',['timber']],['roof',['roof']],['furniture',['timber','metal']]];
 for(const [role,allowedMaterials] of primitiveKinds){
  for(const material of allowedMaterials){
   registry.register({id:`workshop/${role}/${material}`,version:1,label:`Workshop ${material} ${role}`,
    parameters:{hx:{min:.02,max:5.3,default:1},hy:{min:.02,max:2,default:1},hz:{min:.02,max:5.3,default:1}},
    shapes:[{key:'solid',center:{x:0,y:0,z:0},half:{x:{param:'hx'},y:{param:'hy'},z:{param:'hz'}},material:materials[material],solid:true}],
    ports:[],costs:costs[role],properties:{category:'building',role,material}});
  }
 }
 // Room nodes retain semantics independently of any renderer's mesh hierarchy.
 registry.register({id:'workshop/hall',version:1,label:'Main work hall',shapes:[],ports:[spatial('entry','in',1),...Array.from({length:3},(_,i)=>spatial(`rear-${i}`,'out',-1))],costs:{labor:2},properties:{category:'room',role:'workshop',walkable:true}});
 registry.register({id:'workshop/room',version:1,label:'Rear work room',parameters:{program:{min:0,max:2,integer:true,default:0}},shapes:[],ports:[spatial('hall','in',1,true)],costs:{labor:1},properties:{category:'room',walkable:true}});
 registry.register({id:'workshop/entrance',version:1,label:'Workshop entrance',shapes:[],ports:[spatial('hall','out',-1,true),spatial('outside','both',1)],costs:{},properties:{category:'entrance',doorHeight:WORKSHOP_DOOR_HEIGHT}});
 registry.register({id:'workshop/workplace',version:1,label:'Repair workbench use position',shapes:[],ports:[{key:'worker',type:'work',direction:'both',protocol:'craft/basic-v1',position:{x:0,y:0,z:0},facing:{x:1,y:0,z:0},capacity:1,unit:'worker'}],costs:{metal:2},properties:{category:'workplace',activity:'repair',workerSlots:1}});
 registry.adapter({id:'workshop/walk-path',from:'spatial',to:'spatial',protocol:'walk-path/v1',coincident:false,opposed:true,directed:true});
 return registry;
}
export const workshopRegistry=registerWorkshop(new AxiomRegistry());

function seededLayout(seed:number,owner:string,origin:WorkshopPoint):WorkshopLayout {
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new RangeError('Workshop seed must be an unsigned 32-bit integer');
 if(!Number.isFinite(origin.x)||!Number.isFinite(origin.z))throw new RangeError('Workshop origin must be finite');
 const choose=<T>(purpose:string,values:readonly T[]):T=>values[Math.floor(seedSample(seed,1,owner,'layout',purpose)*values.length)]!;
 const width=choose('footprint-width',[8.4,9,9.6]);
 const depth=choose('footprint-depth',[7,7.6,8.2]);
 const rearRooms=choose('room-count',[1,2,3]);
 const hallDepth=choose('hall-depth',[3.1,3.4,3.7]);
 const doorwayWidth=choose('door-clearance',[1.4,1.6,1.8]);
 const entranceOffset=choose('entrance-offset',[-.8,0,.8]);
 return layoutWorkshop(origin,width,depth,hallDepth,rearRooms,doorwayWidth,entranceOffset);
}
function at(p:WorkshopPoint,y:number,child:Expression):Expression {return expr.transform({x:p.x,y,z:p.z,turn:0},child);}
function recipeFor(layout:WorkshopLayout):Recipe {
 const roomNodes=layout.rooms.map((r,i)=>at(r.center,0,expr.instantiate(r.id,i===0?'workshop/hall':'workshop/room',1,i===0?undefined:{program:i-1})));
 const geometry=workshopBoxes(layout);
 const finish=(kind:'plaster'|'stone')=>expr.group(...geometry.map(b=>at(b,b.y,expr.instantiate(b.key,`workshop/${b.role}/${b.material==='plaster'?kind:b.material}`,1,{hx:b.hx,hy:b.hy,hz:b.hz}))));
 const links=layout.rooms.slice(1).map((r,i)=>expr.connect(`access-${r.id}`,{node:'hall',port:`rear-${i}`},{node:r.id,port:'hall'},'workshop/walk-path'));
 return {id:'frontier-workshop',version:1,description:'A bounded repair workshop: one hall, one to three connected rear rooms, traversable doorways and an exposed workplace.',limits:{nodes:64,operations:3000,depth:10},expression:expr.group(
  ...roomNodes,
  at(layout.doors[0]!.center,0,expr.instantiate('entrance','workshop/entrance')),
  at(layout.workplace,0,expr.instantiate('workplace','workshop/workplace')),
  // Cosmetic choices use a different stream from every structural dimension.
  expr.choose('finish','wall-material',[{key:'plaster',weight:3,child:finish('plaster')},{key:'stone',weight:1,child:finish('stone')}]),
  ...links,
  expr.connect('entry-access',{node:'entrance',port:'hall'},{node:'hall',port:'entry'},'workshop/walk-path'),
  expr.expose('entry',{node:'entrance',port:'outside'}),
  expr.expose('workplace',{node:'workplace',port:'worker'}),
  expr.require('main-hall',{kind:'count',axiom:'workshop/hall',min:1,max:1}),
  expr.require('rear-rooms',{kind:'count',axiom:'workshop/room',min:1,max:3}),
  expr.require('all-rooms-reachable',{kind:'connected',nodes:['entrance',...layout.rooms.map(r=>r.id)],portType:'spatial'}),
  expr.require('access-tree',{kind:'acyclic',portType:'spatial'}),
  ...Object.entries(WORKSHOP_BUDGET).map(([resource,max])=>expr.require(`budget-${resource}`,{kind:'budget',resource,max})),
 )};
}
/** Seed selection and serialized expansion are separate, deterministic stages. */
export function workshopRecipe(seed:number,owner=WORKSHOP_OWNER,origin:WorkshopPoint=WORKSHOP_ORIGIN):Recipe {return recipeFor(seededLayout(seed,owner,origin));}
export function compileWorkshop(seed:number,options:WorkshopOptions={}):CompiledWorkshop {
 const origin=options.origin??WORKSHOP_ORIGIN,owner=options.owner??WORKSHOP_OWNER;
 const layout=seededLayout(seed,owner,origin);
 const bounds:Reservation=options.bounds??{key:'workshop-footprint',...origin,hx:5.2,hz:4.5};
 const plan=compileRecipe(workshopRegistry,recipeFor(layout),{seed,owner,bounds,...(options.maxCost?{maxCost:options.maxCost}:{}),...(options.reservations?{reservations:options.reservations}:{})});
 return {...layout,plan,bounds};
}

/** Standing-capsule clearance check, including the true vertical span of every box. */
export function workshopWalkable(workshop:CompiledWorkshop,point:WorkshopPoint,radius=.34):boolean {
 return !workshop.plan.shapes.some(s=>s.solid&&s.center.y+s.half.y>.05&&s.center.y-s.half.y<2.16&&Math.abs(s.center.x-point.x)<s.half.x+radius&&Math.abs(s.center.z-point.z)<s.half.z+radius);
}
/** Restoring a legacy position cannot leave the player inside newly introduced walls. */
export function safeWorkshopSpawn(workshop:CompiledWorkshop,point:WorkshopPoint):WorkshopPoint {return workshopWalkable(workshop,point)?{...point}:{...workshop.spawn};}
