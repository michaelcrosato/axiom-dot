import {AxiomRegistry,compileRecipe,expr,seedSample,hashSeed,type Axiom,type Costs,type PortDef,type Recipe,type SemanticPlan} from './procedural.ts';
/** Bounded resonant-staff pack. Metres / kilograms; geometry and behavior share one plan. */
export const EQUIPMENT_VERSION=1;
export type EquipmentRef={version:1;seed:number;recipeHash:string}|{version:2;seed:number;parts:EquipmentSpec;recipeHash:string};
/** Only this small, data-only authoring language crosses UI/save/network boundaries. */
export interface EquipmentRecipeInput{version:2;seed:number;parts:EquipmentSpec}
export const EQUIPMENT_RECIPE_MAX_BYTES=1024;
export const EQUIPMENT_PARTS=Object.freeze({grip:Object.freeze(['linen','braced']),shaft:Object.freeze(['reed','ash','alloy','ironwood']),head:Object.freeze(['prism','fork','maul','crown'])});
export interface EquipmentSpec{grip:string;shaft:string;head:string}
export interface EquipmentStats{length:number;mass:number;inertia:number;balance:number;reach:number;tempo:number;damageScale:number;staminaScale:number;gripSpacing:number}
export interface EquipmentPlan{ref:EquipmentRef;name:string;spec:EquipmentSpec;recipe:Recipe;plan:SemanticPlan;stats:EquipmentStats;cost:{scrap:number;core:number};bounds:{minY:number;maxY:number;radius:number}}
const socket=(key:string,y:number,facing:number,protocol:string,required=true):PortDef=>({key,type:'attachment',direction:'both',protocol,position:{x:0,y,z:0},facing:{x:0,y:facing,z:0},capacity:1,unit:'staff-part',required});
const shape=(key:string,y:number,h:number,w:number,material:string)=>({key,center:{x:0,y,z:0},half:{x:w/2,y:h/2,z:w/2},material,solid:true});
const defs:Axiom[]=[];
for(const [id,bore,width,density,cost]of [['linen','light',.085,420,0],['braced','heavy',.105,680,1]] as const)defs.push({id:'equipment/grip/'+id,version:1,label:id+' grip',shapes:[shape('wrap',0,.28,width,'equipment-grip')],ports:[socket('shaft',.14,1,'staff-'+bore+'/v1'),socket('dominant',0,1,'hand/v1',false),socket('support',.12,1,'hand/v1',false)],costs:{scrap:cost},properties:{role:'grip',bore,density:density*.2,gripSpacing:.12}});
for(const [id,bore,length,width,density,cost]of [['reed','light',.66,.048,500,1],['ash','light',.85,.054,600,2],['alloy','heavy',.74,.064,1500,2],['ironwood','heavy',.94,.062,1050,3]] as const)defs.push({id:'equipment/shaft/'+id,version:1,label:id+' shaft',shapes:[shape('shaft',length/2,length,width,'equipment-'+(bore==='light'?'timber':'metal'))],ports:[socket('grip',0,-1,'staff-'+bore+'/v1'),socket('head',length,1,'staff-'+bore+'/v1')],costs:{scrap:cost},properties:{role:'shaft',bore,density:density*.2,length}});
for(const [id,bore,height,width,density,focus,core]of [['prism','light',.18,.15,1200,1.35,0],['fork','light',.22,.22,1250,1.15,0],['maul','heavy',.18,.24,1600,.95,0],['crown','heavy',.25,.20,1100,1.5,1]] as const){
 const shapes=id==='fork'?[shape('hub',.035,.07,.09,'equipment-metal'),...[-1,1].map(side=>({...shape(side<0?'left-prong':'right-prong',.14,.16,.055,'equipment-crystal'),center:{x:side*.0825,y:.14,z:0}}))]:id==='crown'?[shape('collar',.045,.09,.12,'equipment-metal'),shape('crystal',.17,.16,width,'equipment-crystal')]:[shape('head',height/2,height,width,id==='maul'?'equipment-metal':'equipment-crystal')];
 defs.push({id:'equipment/head/'+id,version:1,label:id+' head',shapes,ports:[socket('shaft',0,-1,'staff-'+bore+'/v1')],costs:{scrap:1,core},properties:{role:'head',bore,density:density*.2,focus}});
}
export function registerEquipment(registry:AxiomRegistry){for(const def of defs)registry.register(def);for(const bore of ['light','heavy'])registry.adapter({id:'equipment/'+bore,from:'attachment',to:'attachment',protocol:'staff-'+bore+'/v1',coincident:true,opposed:true,directed:false});return registry;}
export const equipmentRegistry=registerEquipment(new AxiomRegistry());
export const EQUIPMENT_MANIFEST=Object.freeze({framework:1,domain:'equipment',version:1,recipe:'resonant-staff@1',contentHash:hashSeed(JSON.stringify(equipmentRegistry.list())).toString(16).padStart(8,'0')});
export const EQUIPMENT_BUDGET=Object.freeze({scrap:5,core:1});
export function seededEquipmentSpec(seed:number):EquipmentSpec {
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new RangeError('Equipment seed must be uint32');
 const choose=<T>(purpose:string,values:readonly T[])=>values[Math.floor(seedSample(seed,1,'equipment/staff','parts',purpose)*values.length)]!;
 const grip=choose('grip',['linen','braced']);return {grip,shaft:choose('shaft',grip==='linen'?['reed','ash']:['alloy','ironwood']),head:choose('head',grip==='linen'?['prism','fork']:['maul','crown'])};
}
export function equipmentRecipe(spec:EquipmentSpec):Recipe {
 const shaft=equipmentRegistry.get('equipment/shaft/'+spec.shaft,1),grip=equipmentRegistry.get('equipment/grip/'+spec.grip,1),bore=String(grip.properties.bore),top=.14+Number(shaft.properties.length);
 return {id:'resonant-staff',version:1,description:'One grip, one compatible shaft, one resonant head; all sockets joined within a finite material budget.',limits:{nodes:3,operations:900,depth:5},expression:expr.group(expr.instantiate('grip','equipment/grip/'+spec.grip),expr.transform({x:0,y:.14,z:0,turn:0},expr.instantiate('shaft','equipment/shaft/'+spec.shaft)),expr.transform({x:0,y:top,z:0,turn:0},expr.instantiate('head','equipment/head/'+spec.head)),expr.attach('grip-shaft',{node:'grip',port:'shaft'},{node:'shaft',port:'grip'},'equipment/'+bore),expr.attach('shaft-head',{node:'shaft',port:'head'},{node:'head',port:'shaft'},'equipment/'+bore),expr.expose('dominant',{node:'grip',port:'dominant'}),expr.expose('support',{node:'grip',port:'support'}),expr.require('connected',{kind:'connected',nodes:['grip','shaft','head'],portType:'attachment'}),...Object.entries(EQUIPMENT_BUDGET).map(([resource,max])=>expr.require('budget-'+resource,{kind:'budget',resource,max})))};
}
export function compileEquipment(seed:number,spec:EquipmentSpec=seededEquipmentSpec(seed),maxCost:Costs=EQUIPMENT_BUDGET):EquipmentPlan {
 const recipe=equipmentRecipe(spec),plan=compileRecipe(equipmentRegistry,recipe,{seed,owner:'equipment/staff',maxCost});
 if(!plan.valid)throw new Error('Equipment recipe rejected: '+plan.constraints.filter(c=>!c.ok).map(c=>c.message).join('; '));
 let mass=0,moment=0,inertia=0;for(const node of plan.nodes)for(const s of node.shapes){const m=8*s.half.x*s.half.y*s.half.z*Number(node.properties.density);mass+=m;moment+=m*s.center.y;inertia+=m*(s.center.x*s.center.x+s.center.y*s.center.y+(s.half.x*s.half.x+s.half.y*s.half.y)/3);}
 const minY=Math.min(...plan.shapes.map(s=>s.center.y-s.half.y)),maxY=Math.max(...plan.shapes.map(s=>s.center.y+s.half.y)),length=maxY-minY,focus=Number(plan.nodes.find(n=>n.key==='head')!.properties.focus);
 const stats={length,mass,inertia,balance:moment/mass,reach:Math.min(3.45,1.05+length+focus*.68),tempo:Math.min(1.4,.83+inertia*.23),damageScale:Math.min(1.48,.78+mass*.13),staminaScale:Math.min(1.5,.78+inertia*.20),gripSpacing:.12};
 const recipeHash=hashSeed(JSON.stringify([EQUIPMENT_MANIFEST,recipe,stats])).toString(16).padStart(8,'0');
 return {ref:{version:1,seed,recipeHash},name:`${spec.shaft[0]!.toUpperCase()+spec.shaft.slice(1)} ${spec.head} staff`,spec:{...spec},recipe,plan,stats,cost:{scrap:plan.costs.scrap??0,core:plan.costs.core??0},bounds:{minY,maxY,radius:Math.max(...plan.shapes.map(s=>Math.hypot(s.center.x+s.half.x,s.center.z+s.half.z)))}};
}
/** No arrays, inherited keys, symbols, accessors or unknown fields, even before JSON transport. */
function exactData(value:unknown,keys:readonly string[]):value is Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const proto=Object.getPrototypeOf(value);if(proto!==Object.prototype&&proto!==null)return false;
 const own=Reflect.ownKeys(value);return own.length===keys.length&&own.every(k=>typeof k==='string'&&keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,k)!,'value'));
}
function validParts(value:unknown):value is EquipmentSpec{return exactData(value,['grip','shaft','head'])&&Object.entries(EQUIPMENT_PARTS).every(([key,ids])=>typeof value[key]==='string'&&ids.includes(value[key] as string));}
export function validEquipmentRecipeInput(value:unknown):value is EquipmentRecipeInput{
 try{return exactData(value,['version','seed','parts'])&&value.version===2&&Number.isInteger(value.seed)&&Number(value.seed)>=0&&Number(value.seed)<=0xffffffff&&validParts(value.parts);}catch{return false;}
}
export function compileCustomEquipment(input:EquipmentRecipeInput):EquipmentPlan{
 if(!validEquipmentRecipeInput(input))throw new Error('Recipe must contain only version 2, a uint32 seed, and registered grip / shaft / head parts');
 const parts={grip:input.parts.grip,shaft:input.parts.shaft,head:input.parts.head},plan=compileEquipment(input.seed,parts);
 return {...plan,ref:{version:2,seed:input.seed,parts:{...parts},recipeHash:plan.ref.recipeHash}};
}
export function equipmentRecipeInput(plan:EquipmentPlan):EquipmentRecipeInput{return {version:2,seed:plan.ref.seed,parts:{grip:plan.spec.grip,shaft:plan.spec.shaft,head:plan.spec.head}};}
export function parseEquipmentRecipe(raw:string):EquipmentRecipeInput{
 if(typeof raw!=='string'||raw.length>EQUIPMENT_RECIPE_MAX_BYTES||new TextEncoder().encode(raw).length>EQUIPMENT_RECIPE_MAX_BYTES)throw new Error('Recipe JSON must be at most 1024 bytes');
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new Error('Recipe JSON is malformed');}
 if(!validEquipmentRecipeInput(value))throw new Error('Unsupported recipe fields or parts. Expected version, seed and parts only');
 return equipmentRecipeInput(compileCustomEquipment(value));
}
const cache=new Map<string,EquipmentPlan>();
export function equipmentFor(ref?:EquipmentRef):EquipmentPlan|null {
 if(ref===undefined)return null;
 if(!(exactData(ref,['version','seed','recipeHash'])||exactData(ref,['version','seed','parts','recipeHash']))||ref.version===1&&Object.hasOwn(ref,'parts')||ref.version===2&&!Object.hasOwn(ref,'parts')||!Number.isInteger(ref.seed)||ref.seed<0||ref.seed>0xffffffff||typeof ref.recipeHash!=='string'||!/^[a-f0-9]{8}$/.test(ref.recipeHash)||(ref.version!==1&&ref.version!==2)||ref.version===2&&!validParts(ref.parts))throw new Error('Unknown equipment recipe identity');
 const key=JSON.stringify(ref);let p=cache.get(key);if(!p){p=ref.version===1?compileEquipment(ref.seed):compileCustomEquipment({version:2,seed:ref.seed,parts:ref.parts});if(ref.recipeHash!==p.ref.recipeHash)throw new Error('Unknown equipment recipe identity');if(cache.size>=64)cache.clear();cache.set(key,p);}return p;
}
export interface EquipmentState{manifest:typeof EQUIPMENT_MANIFEST;active:EquipmentRef|null}
export function emptyEquipment():EquipmentState{return {manifest:EQUIPMENT_MANIFEST,active:null};}
export function validEquipment(value:unknown):value is EquipmentState {try{if(!exactData(value,['manifest','active'])||!exactData(value.manifest,Object.keys(EQUIPMENT_MANIFEST))||!Object.entries(EQUIPMENT_MANIFEST).every(([k,v])=>(value.manifest as Record<string,unknown>)[k]===v))return false;return value.active===null||!!equipmentFor(value.active as EquipmentRef);}catch{return false;}}
export function equipmentCost(state?:EquipmentState){return state?.active?equipmentFor(state.active)!.cost:{scrap:0,core:0};}
export function canSwapEquipment(combo:{phase:string;buffered:boolean;cancelLockRemaining:number;stunRemaining:number}){return combo.phase==='idle'&&!combo.buffered&&combo.cancelLockRemaining<=0&&combo.stunRemaining<=0;}
/** Refit recycles the previous assembly exactly; no accumulating stock or free duplication. */
export function refitEquipment(current:EquipmentState|undefined,inventory:{scrap:number;core:number;water:number},seed:number|null){
 const old=equipmentCost(current),plan=seed===null?null:compileEquipment(seed),cost=plan?.cost??{scrap:0,core:0};
 const next={...inventory,scrap:inventory.scrap+old.scrap-cost.scrap,core:inventory.core+old.core-cost.core};
 if(next.scrap<0||next.core<0)return null;
 return {equipment:{manifest:EQUIPMENT_MANIFEST,active:plan?.ref??null},inventory:next};
}

/** Same reversible ledger, with every cost derived by the compiler on the authority. */
export function assembleEquipment(current:EquipmentState|undefined,inventory:{scrap:number;core:number;water:number},recipe:EquipmentRecipeInput){
 const old=equipmentCost(current),plan=compileCustomEquipment(recipe),cost=plan.cost;
 if(![inventory.scrap,inventory.core,inventory.water].every(n=>Number.isFinite(n)&&n>=0))return null;
 const next={...inventory,scrap:inventory.scrap+old.scrap-cost.scrap,core:inventory.core+old.core-cost.core};
 if(next.scrap<0||next.core<0)return null;
 return {equipment:{manifest:EQUIPMENT_MANIFEST,active:plan.ref},inventory:next};
}
