import {compileRecipe,expr,type Expression,type Recipe} from './procedural.ts';
import {workshopRegistry,WORKSHOP_WALL_THICKNESS,WORKSHOP_WALL_HEIGHT,WORKSHOP_DOOR_HEIGHT,WORKSHOP_BUDGET,type WorkshopPoint,type WorkshopLayout,type WorkshopRoom,type WorkshopDoor,type CompiledWorkshop} from './building.ts';
/** Additive preview-only grammar. Never call from world generation or save restoration. */
export const WORKSHOP_AUTHORING_VERSION=1 as const;
export const WORKSHOP_AUTHORING_OWNER='preview/workshop-authoring';
export const WORKSHOP_PRESET_MAX_BYTES=4096;
export interface WorkshopDraft {seed:number;rearRooms:number;width:number;depth:number;hallDepth:number;doorwayWidth:number}
export const WORKSHOP_AUTHORING_FIELDS=Object.freeze([
 {key:'seed',label:'Preview seed',min:0,max:4294967295,step:1,default:73129,unit:'uint32',effect:'Wall finish only; geometry comes from explicit dimensions.'},
 {key:'rearRooms',label:'Rear rooms',min:1,max:3,step:1,default:2,unit:'rooms',effect:'One to three rooms opening into a fixed main hall.'},
 {key:'width',label:'Width',min:8.4,max:9.6,step:.1,default:9,unit:'m',effect:'Real foundation, walls, partitions, roof and room positions.'},
 {key:'depth',label:'Depth',min:7,max:8.2,step:.1,default:7.6,unit:'m',effect:'Real foundation, roof and rear room depth.'},
 {key:'hallDepth',label:'Hall depth',min:3.1,max:3.7,step:.1,default:3.4,unit:'m',effect:'Hall partition and doorway positions.'},
 {key:'doorwayWidth',label:'Door width',min:1.4,max:1.8,step:.1,default:1.6,unit:'m',effect:'Actual empty wall gaps and lintel spans.'},
] as const);
export const DEFAULT_WORKSHOP_DRAFT:Readonly<WorkshopDraft>=Object.freeze(Object.fromEntries(WORKSHOP_AUTHORING_FIELDS.map(f=>[f.key,f.default])) as unknown as WorkshopDraft);
function plain(value:unknown):value is Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))return false;const p=Object.getPrototypeOf(value);return p===Object.prototype||p===null;}
function exact(value:unknown,keys:readonly string[]):asserts value is Record<string,unknown>{if(!plain(value)||Object.keys(value).length!==keys.length||!keys.every(k=>Object.hasOwn(value,k)))throw new Error('Unexpected or missing preset fields');for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);if(!d||!('value' in d))throw new Error('Only data properties are accepted');}}
export function validateWorkshopDraft(value:unknown):WorkshopDraft {
 exact(value,WORKSHOP_AUTHORING_FIELDS.map(f=>f.key));const out={} as WorkshopDraft;
 for(const f of WORKSHOP_AUTHORING_FIELDS){const n=value[f.key];if(typeof n!=='number'||!Number.isFinite(n)||n<f.min||n>f.max||Math.abs((n-f.min)/f.step-Math.round((n-f.min)/f.step))>1e-7)throw new RangeError(`${f.label} must be ${f.min}–${f.max} in steps of ${f.step}`);out[f.key]=Object.is(n,-0)?0:n;}
 return Object.freeze(out);
}
export function exportWorkshopPreset(draft:WorkshopDraft):string{return JSON.stringify({format:'axiom-workshop-authoring',version:1,recipe:'frontier-workshop-editor@1',parameters:validateWorkshopDraft(draft)},null,2);}
export function importWorkshopPreset(text:string):WorkshopDraft{
 if(typeof text!=='string'||text.length>WORKSHOP_PRESET_MAX_BYTES||new TextEncoder().encode(text).length>WORKSHOP_PRESET_MAX_BYTES)throw new Error('Preset exceeds 4 KB');
 let value:unknown;try{value=JSON.parse(text);}catch{throw new Error('Enter a JSON workshop preset');}exact(value,['format','version','recipe','parameters']);
 if(value.format!=='axiom-workshop-authoring'||value.version!==1||value.recipe!=='frontier-workshop-editor@1')throw new Error('Unknown workshop preset or recipe version');return validateWorkshopDraft(value.parameters);
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

function at(p:WorkshopPoint,y:number,child:Expression):Expression {return expr.transform({x:p.x,y,z:p.z,turn:0},child);}
function recipeFor(layout:WorkshopLayout):Recipe {
 const roomNodes=layout.rooms.map((r,i)=>at(r.center,0,expr.instantiate(r.id,i===0?'workshop/hall':'workshop/room',1,i===0?undefined:{program:i-1})));
 const geometry=workshopBoxes(layout);
 const finish=(kind:'plaster'|'stone')=>expr.group(...geometry.map(b=>at(b,b.y,expr.instantiate(b.key,`workshop/${b.role}/${b.material==='plaster'?kind:b.material}`,1,{hx:b.hx,hy:b.hy,hz:b.hz}))));
 const links=layout.rooms.slice(1).map((r,i)=>expr.connect(`access-${r.id}`,{node:'hall',port:`rear-${i}`},{node:r.id,port:'hall'},'workshop/walk-path'));
 return {id:'frontier-workshop-editor',version:1,description:'Preview-only editable workshop. Explicit dimensions; fixed safe grammar and finite original primitive costs.',limits:{nodes:64,operations:3000,depth:10},expression:expr.group(
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
  expr.require('rear-rooms',{kind:'count',axiom:'workshop/room',min:layout.rooms.length-1,max:layout.rooms.length-1}),
  expr.require('all-rooms-reachable',{kind:'connected',nodes:['entrance',...layout.rooms.map(r=>r.id)],portType:'spatial'}),
  expr.require('access-tree',{kind:'acyclic',portType:'spatial'}),
  ...Object.entries(WORKSHOP_BUDGET).map(([resource,max])=>expr.require(`budget-${resource}`,{kind:'budget',resource,max})),
 )};
}

export interface WorkshopAuthoringResult {parameters:Readonly<WorkshopDraft>;recipe:Recipe;workshop:CompiledWorkshop;routes:readonly {key:string;points:readonly WorkshopPoint[]}[]}
export function compileWorkshopDraft(input:WorkshopDraft):WorkshopAuthoringResult {
 const parameters=validateWorkshopDraft(input),{seed,width,depth,hallDepth,rearRooms,doorwayWidth}=parameters;
 const layout=layoutWorkshop({x:0,z:0},width,depth,hallDepth,rearRooms,doorwayWidth,0),recipe=recipeFor(layout);
 const bounds={key:'preview-workshop-footprint',x:0,z:0,hx:5.2,hz:4.5};
 const original=compileRecipe(workshopRegistry,recipe,{seed,owner:WORKSHOP_AUTHORING_OWNER,bounds,maxCost:WORKSHOP_BUDGET});
 const workshop:CompiledWorkshop={...layout,bounds,plan:original},hall=layout.rooms[0]!;
 const routes=[{key:'entry-to-hall',points:[layout.spawn,layout.doors[0]!.center,hall.center]},
 ...layout.rooms.slice(1).map((room,i)=>({key:`hall-to-${room.id}`,points:[hall.center,{x:layout.doors[i+1]!.center.x,z:hall.center.z},layout.doors[i+1]!.center,room.center]})),
 {key:'hall-to-workplace',points:[hall.center,{x:layout.workplace.x,z:hall.center.z},layout.workplace]}];
 const clear=(a:WorkshopPoint,b:WorkshopPoint)=>!original.shapes.some(shape=>{
  if(!shape.solid||shape.center.y+shape.half.y<=.05||shape.center.y-shape.half.y>=2.16)return false;
  let enter=0,exit=1;
  for(const axis of ['x','z'] as const){const lo=shape.center[axis]-shape.half[axis]-.36,hi=shape.center[axis]+shape.half[axis]+.36,delta=b[axis]-a[axis];
   if(Math.abs(delta)<1e-12){if(a[axis]<=lo||a[axis]>=hi)return false;continue;}
   const near=(lo-a[axis])/delta,far=(hi-a[axis])/delta;enter=Math.max(enter,Math.min(near,far));exit=Math.min(exit,Math.max(near,far));if(enter>=exit)return false;
  }return enter<exit;
 });
 const checks=routes.map(route=>({key:`clearance/${route.key}`,ok:route.points.slice(1).every((point,i)=>clear(route.points[i]!,point)),message:'Exact segment/expanded-solid check; standing span 0.05–2.16 m, conservative radius 0.36 m'}));
 workshop.plan=Object.freeze({...original,constraints:Object.freeze([...original.constraints,...checks]) as unknown as typeof original.constraints,valid:original.valid&&checks.every(c=>c.ok)});
 if(!workshop.plan.valid)throw new Error('Bounded workshop failed its compiler or standing-clearance constraints');
 return {parameters,recipe,workshop,routes};
}
export function workshopAuthoringReport(result:WorkshopAuthoringResult){const p=result.workshop.plan;return {format:'axiom-workshop-authoring-report',version:1,scope:'isolated-preview',visualReview:'not-reviewed',parameters:result.parameters,identity:{seed:p.seed,owner:p.owner,framework:p.framework,recipe:p.recipe,axioms:p.manifest},budgets:result.recipe.limits,operations:p.operations,nodes:p.nodes.length,shapes:p.shapes.length,costs:p.costs,costLimits:WORKSHOP_BUDGET,choices:p.choices,constraints:p.constraints,exposed:p.exposed,connections:p.connections,routes:result.routes};}
