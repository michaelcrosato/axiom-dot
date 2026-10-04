import {AxiomRegistry,compileRecipe,expr,hashSeed,seedSample,type Axiom,type Expression,type PortDef,type Recipe,type SemanticPlan,type ShapeDef,type Vec3} from './procedural.ts';

/** Independent restoration family. Historical body/sentry v1 is deliberately unchanged. */
export const RESTORATION_BODY_VERSION=1 as const;
export const RESTORATION_BODY_MAX_BYTES=1024;
export const RESTORATION_BODY_LIMITS=Object.freeze({nodes:40,shapes:80,operations:6000,depth:8,scrap:16,core:1});
export const RESTORATION_PARTS=Object.freeze({support:Object.freeze(['nimble','sturdy'] as const),shell:Object.freeze(['reed','alloy'] as const),organ:Object.freeze(['pump','filter','vent','beacon'] as const)});
export type RestorationSupport=typeof RESTORATION_PARTS.support[number];
export type RestorationShell=typeof RESTORATION_PARTS.shell[number];
export type RestorationOrgan=typeof RESTORATION_PARTS.organ[number];
export interface RestorationBodyRecipe {version:1;seed:number;support:RestorationSupport;shell:RestorationShell;organ:RestorationOrgan}
export const DEFAULT_RESTORATION_RECIPE:Readonly<RestorationBodyRecipe>=Object.freeze({version:1,seed:73129,support:'nimble',shell:'reed',organ:'pump'});
export interface RestorationMaterialCost {scrap:number;core:number}
export interface RestorationBodyStats {
 /** Metres/second; speedSteps is retained recipe metadata, not a runtime movement budget. */
 maxSpeed:number;speedSteps:number;reach:number;workSpeed:number;heatTolerance:number;sensorRange:number;
 /** Storage maxima only: compiling/refitting NEVER creates contents. */
 tankCapacityMl:number;chargeCapacity:number;filtrationCapacity:number;
}
export interface RestorationLeg {id:'front-left'|'front-right'|'back-left'|'back-right';side:-1|1;end:-1|1;upper:number;lower:number;phase:0|0.5;hip:Vec3;knee:Vec3;foot:Vec3;nodes:{upper:string;lower:string;foot:string}}
export interface RestorationBodyPlan {
 version:1;family:'restoration-quadruped';recipe:RestorationBodyRecipe;ref:{version:1;recipeHash:string};
 plan:SemanticPlan;body:{width:number;length:number;height:number};legs:RestorationLeg[];
 sockets:{sensor:Vec3;emitter:Vec3;fluidIn:Vec3;fluidOut:Vec3};stats:RestorationBodyStats;cost:RestorationMaterialCost;
 budget:{nodes:number;shapes:number};bounds:{radius:number;minY:number;maxY:number};
}
export interface RestorationDockPlan {version:1;family:'restoration-dock';recipe:RestorationBodyRecipe;ref:{version:1;recipeHash:string};plan:SemanticPlan;organNode:string;cost:RestorationMaterialCost;budget:{nodes:number;shapes:number}}
export const RESTORATION_RECIPE_DESCRIPTORS=Object.freeze([
 {key:'seed',default:73129,min:0,max:0xffffffff,integer:true,unit:'uint32 seed',description:'Named deterministic physical shape and sensor samples',consumer:'body compiler',effect:'refit'},
 {key:'support',default:'nimble',values:RESTORATION_PARTS.support,unit:'support type',description:'Travel versus utility preparation speed; finite structural price',consumer:'movement and utility preparation',effect:'refit'},
 {key:'shell',default:'reed',values:RESTORATION_PARTS.shell,unit:'shell type',description:'Ambient heat tolerance versus finite scrap/core price',consumer:'heat eligibility',effect:'refit'},
 {key:'organ',default:'pump',values:RESTORATION_PARTS.organ,unit:'utility organ',description:'Contact/jet/field primitive and sensor/reach bounds',consumer:'utility acceptance and target selection',effect:'next accepted action after refit'},
] as const);
export const RESTORATION_STAT_DESCRIPTORS=Object.freeze([
 {key:'maxSpeed',default:2.1,unit:'m/s',min:1.3,max:2.2,description:'Neutral rig travel speed; support variant',consumer:'restoration movement',effect:'refit'},
 {key:'speedSteps',default:2,unit:'recipe metadata',min:1,max:2,description:'Informational support class; actual movement consumes maxSpeed in metres per second.',consumer:'recipe inspection only',effect:'inspection'},
 {key:'reach',default:4,unit:'m',min:1.25,max:7,description:'Maximum utility contact/jet/field reach',consumer:'utility target eligibility',effect:'refit'},
 {key:'workSpeed',default:0.8,unit:'work ticks/tick',min:0.8,max:1.2,description:'Organ preparation progress multiplier',consumer:'restoration utility preparation',effect:'next action'},
 {key:'heatTolerance',default:65,unit:'heat units',min:65,max:100,description:'Ambient heat threshold before work is unsafe',consumer:'restoration heat eligibility',effect:'refit'},
 {key:'sensorRange',default:8.191232837270945,unit:'m',min:7,max:12,description:'Visible habitat target radius',consumer:'restoration target selection',effect:'refit'},
 {key:'tankCapacityMl',default:6000,unit:'ml',min:6000,max:6000,description:'Finite storage capacity; refit preserves contents',consumer:'restoration water ledger',effect:'capacity only'},
 {key:'chargeCapacity',default:100,unit:'energy units',min:100,max:100,description:'Finite charge capacity; no passive/compile recharge',consumer:'utility acceptance',effect:'capacity only'},
 {key:'filtrationCapacity',default:12000,unit:'contamination units',min:12000,max:12000,description:'Finite waste cartridge capacity; refit preserves captured waste',consumer:'filter acceptance',effect:'capacity only'},
] as const);

/** Read descriptors before values so getters, symbols and inherited executable data fail closed. */
export function restorationExactData(value:unknown,keys:readonly string[]):value is Record<string,unknown>{
 try {if(!value||typeof value!=='object'||Array.isArray(value))return false;const proto=Object.getPrototypeOf(value);if(proto!==Object.prototype&&proto!==null)return false;const own=Reflect.ownKeys(value);return own.length===keys.length&&own.every(k=>typeof k==='string'&&keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,k)!,'value'));}catch{return false;}
}
export function validRestorationBodyRecipe(value:unknown):value is RestorationBodyRecipe {
 try{return restorationExactData(value,['version','seed','support','shell','organ'])&&value.version===1&&Number.isInteger(value.seed)&&Number(value.seed)>=0&&Number(value.seed)<=0xffffffff&&RESTORATION_PARTS.support.includes(value.support as RestorationSupport)&&RESTORATION_PARTS.shell.includes(value.shell as RestorationShell)&&RESTORATION_PARTS.organ.includes(value.organ as RestorationOrgan);}catch{return false;}
}
function recipeCopy(value:RestorationBodyRecipe):RestorationBodyRecipe {return {version:1,seed:value.seed,support:value.support,shell:value.shell,organ:value.organ};}
export function parseRestorationBodyRecipe(raw:string):RestorationBodyRecipe {
 if(typeof raw!=='string'||raw.length>RESTORATION_BODY_MAX_BYTES||new TextEncoder().encode(raw).length>RESTORATION_BODY_MAX_BYTES)throw new Error('Restoration recipe exceeds 1024 bytes');
 let input:unknown;try{input=JSON.parse(raw);}catch{throw new Error('Restoration recipe is not JSON');}if(!validRestorationBodyRecipe(input))throw new Error('Unsupported restoration recipe fields or parts');return recipeCopy(input);
}
function deepFreeze<T>(value:T):T {if(value&&typeof value==='object'){for(const v of Object.values(value))deepFreeze(v);Object.freeze(value);}return value;}
const v=(x=0,y=0,z=0):Vec3=>({x,y,z});
const box=(key:string,center:Vec3,half:ShapeDef['half'],material:string):ShapeDef=>({key,center,half,material,solid:true});
const port=(key:string,type:PortDef['type'],protocol:string,position:Vec3,facing:Vec3,unit:string,required=false,direction:PortDef['direction']='both',capacity=1):PortDef=>({key,type,protocol,position,facing,unit,required,direction,capacity});
const mount=(key:string,position:Vec3,facing:Vec3,required=true)=>port(key,'attachment','restoration/mount/v1',position,facing,'mount',required);
const support=(key:string,position:Vec3,facing:Vec3,required=true)=>port(key,'attachment','restoration/support/v1',position,facing,'support',required);
const work=(key:string,position:Vec3,direction:'in'|'out',required=true)=>port(key,'work','restoration/energy/v1',position,v(0,0,direction==='in'?-1:1),'energy units',required,direction,100);
const water=(key:string,position:Vec3,direction:'in'|'out')=>port(key,'fluid','restoration/water/v1',position,v(0,0,direction==='in'?-1:1),'ml',false,direction,6000);
const effect=(key:string,position:Vec3)=>port(key,'work','restoration/effect/v1',position,v(0,0,1),'effect units',false,'out',12000);
const legEntries=[['front-left',-1,1],['front-right',1,1],['back-left',-1,-1],['back-right',1,-1]] as const;
const legLengths={nimble:{upper:.36,lower:.34},sturdy:{upper:.35,lower:.35}} as const;
/** Static primitives are not waterworks modules. The mobile impeller is a purpose-built organ. */
export function registerRestorationBody(registry:AxiomRegistry):AxiomRegistry {
 const defs:Axiom[]=[
  {id:'restoration/trunk',version:1,label:'Four-support modular trunk',parameters:{width:{min:.82,max:.98,default:.9},length:{min:1.04,max:1.2,default:1.12}},shapes:[box('trunk',v(),{x:{mul:[{param:'width'},.5]},y:.18,z:{mul:[{param:'length'},.5]}},'restoration-frame')],ports:[...legEntries.map(([id,side,end])=>support(id,v(side*.48,-.03,end*.42),v(0,-1,0))),mount('drive',v(0,-.12,-.2),v(0,-1,0)),mount('shell',v(0,.18,0),v(0,1,0)),mount('organ',v(0,0,.62),v(0,0,1)),port('sensor','spatial','restoration/sensor/v1',v(0,.22,.52),v(0,0,1),'m',false,'out',12)],costs:{scrap:1},properties:{role:'trunk',family:'restoration-quadruped'}},
  {id:'restoration/drive',version:1,label:'Finite-charge drive and core',shapes:[box('drive',v(0,-.055,0),v(.21,.09,.18),'restoration-drive'),box('core',v(0,-.055,0),v(.07,.1,.075),'restoration-core')],ports:[mount('mount',v(),v(0,1,0)),work('output',v(0,-.055,.18),'out')],costs:{},properties:{role:'drive',chargeCapacity:100,tankCapacityMl:6000,filtrationCapacity:12000}},
  {id:'restoration/dock',version:1,label:'Stationary utility dock',shapes:[box('base',v(0,.12,0),v(.55,.12,.48),'restoration-frame'),box('stem',v(0,.48,0),v(.12,.24,.12),'restoration-frame')],ports:[mount('organ',v(0,.72,0),v(0,0,1)),mount('drive',v(0,.24,-.2),v(0,-1,0))],costs:{scrap:2},properties:{role:'stationary-dock'}},
 ];
 for(const name of RESTORATION_PARTS.support){const l=legLengths[name],width=name==='nimble'?.055:.075;defs.push(
  {id:`restoration/support/${name}/upper`,version:1,label:`${name} upper support`,shapes:[box('upper',v(0,-l.upper/2,0),v(width,l.upper/2,width),'restoration-support')],ports:[support('hip',v(),v(0,1,0)),support('knee',v(0,-l.upper,0),v(0,-1,0))],costs:{scrap:name==='nimble'?0:1},properties:{role:'upper-support',length:l.upper}},
  {id:`restoration/support/${name}/lower`,version:1,label:`${name} lower support`,shapes:[box('lower',v(0,-l.lower/2,0),v(width*.8,l.lower/2,width*.8),'restoration-support')],ports:[support('knee',v(),v(0,1,0)),support('foot',v(0,-l.lower,0),v(0,-1,0))],costs:{},properties:{role:'lower-support',length:l.lower}},
  {id:`restoration/support/${name}/foot`,version:1,label:`${name} contact foot`,shapes:[box('foot',v(0,0,.015),v(name==='nimble'?.09:.12,.04,.13),'restoration-foot')],ports:[support('ankle',v(),v(0,1,0)),port('contact','spatial','restoration/contact/v1',v(0,-.04,0),v(0,-1,0),'m',false,'out',1)],costs:{},properties:{role:'foot'}},
 );}
 for(const name of RESTORATION_PARTS.shell)defs.push({id:`restoration/shell/${name}`,version:1,label:`${name} shell`,parameters:{width:{min:.82,max:.98,default:.9},length:{min:1.04,max:1.2,default:1.12},ridge:{min:.045,max:.09,default:.06}},shapes:[box('shell',v(0,.055,0),{x:{mul:[{param:'width'},.52]},y:.055,z:{mul:[{param:'length'},.51]}},`restoration-${name}`),box('ridge',v(0,.13,0),{x:.08,y:{param:'ridge'},z:.36},`restoration-${name}`)],ports:[mount('mount',v(),v(0,-1,0))],costs:{scrap:name==='reed'?0:2,core:name==='reed'?0:1},properties:{role:'shell',heatTolerance:name==='reed'?65:100}});
 for(const name of RESTORATION_PARTS.organ){const shapes:ShapeDef[]=[box('housing',v(0,0,.15),v(.16,.15,.16),`restoration-${name}`)];
  if(name==='pump')shapes.push(box('impeller',v(0,0,.15),v(.18,.065,.07),'restoration-core'),box('nozzle',v(0,0,.38),v(.065,.065,.1),'restoration-metal'));
  if(name==='filter')shapes.push(box('cartridge',v(0,.12,.15),v(.11,.1,.11),'restoration-cartridge'),box('intake',v(0,-.12,.34),v(.13,.045,.065),'restoration-metal'));
  if(name==='vent')shapes.push(...[-1,1].map(side=>box(side<0?'left-fin':'right-fin',v(side*.2,0,.15),v(.025,.19,.16),'restoration-metal')));
  if(name==='beacon')shapes.push(box('mast',v(0,.24,.15),v(.035,.16,.035),'restoration-metal'),box('scent-lens',v(0,.4,.15),v(.09,.065,.09),'restoration-core'));
  defs.push({id:`restoration/organ/${name}`,version:1,label:name==='pump'?'Mobile impeller pump':`${name} utility organ`,shapes,ports:[mount('mount',v(),v(0,0,-1)),work('input',v(0,-.12,0),'in'),water('fluid-in',v(-.13,-.12,.05),'in'),water('fluid-out',v(.13,-.12,.32),'out'),effect('emitter',v(0,0,.48))],costs:{scrap:name==='filter'?2:1},properties:{role:'utility-organ',organ:name,reusableIn:'mobile-and-stationary',primitive:name==='pump'?'mobile-impeller/v1':`${name}/v1`}});
 }
 for(const def of defs)registry.register(def);
 for(const kind of ['mount','support'])registry.adapter({id:`restoration/${kind}`,from:'attachment',to:'attachment',protocol:`restoration/${kind}/v1`,coincident:true,opposed:true,directed:false});
 registry.adapter({id:'restoration/energy',from:'work',to:'work',protocol:'restoration/energy/v1',coincident:false,opposed:false,directed:true});return registry;
}
export const restorationBodyRegistry=registerRestorationBody(new AxiomRegistry());
export const RESTORATION_BODY_MANIFEST=deepFreeze({framework:1,domain:'restoration-body',version:1,recipe:'restoration-quadruped@1',contentHash:hashSeed(JSON.stringify(restorationBodyRegistry.list())).toString(16).padStart(8,'0')});
const placed=(key:string,axiom:string,p:Vec3,params?:Record<string,number>)=>expr.transform({...p,turn:0},expr.instantiate(key,axiom,1,params));
const attach=(key:string,a:string,ap:string,b:string,bp:string,kind='mount')=>expr.attach(key,{node:a,port:ap},{node:b,port:bp},`restoration/${kind}`);
function finish(input:RestorationBodyRecipe,expression:Expression,id:string):SemanticPlan {
 const recipe:Recipe={id,version:1,description:'Finite restoration assembly: typed supports, attachments, fluid and energy ports.',limits:{nodes:40,operations:6000,depth:8},expression};
 const plan=compileRecipe(restorationBodyRegistry,recipe,{seed:input.seed,owner:`restoration/${id}`,maxCost:{scrap:RESTORATION_BODY_LIMITS.scrap,core:1}});
 if(!plan.valid||plan.nodes.length>40||plan.shapes.length>80)throw new Error('Restoration graph rejected: '+plan.constraints.filter(c=>!c.ok).map(c=>c.message).join('; '));return plan;
}
function pointFor(plan:SemanticPlan,node:string,key:string):Vec3 {const p=plan.nodes.find(n=>n.key===node)?.ports.find(p=>p.key===key);if(!p)throw new Error(`Missing compiled socket ${node}.${key}`);return {...p.position};}
function hash(input:RestorationBodyRecipe,plan:SemanticPlan,stats?:RestorationBodyStats):string{return hashSeed(JSON.stringify([RESTORATION_BODY_MANIFEST,input,plan,stats??null])).toString(16).padStart(8,'0');}
const bodyCache=new Map<string,RestorationBodyPlan>();
export function compileRestorationBody(input:RestorationBodyRecipe):RestorationBodyPlan {
 if(!validRestorationBodyRecipe(input))throw new Error('Invalid restoration body recipe');const cacheKey=JSON.stringify(recipeCopy(input)),cached=bodyCache.get(cacheKey);if(cached)return cached;
 if(!validRestorationBodyRecipe(input))throw new Error('Invalid restoration body recipe');const recipe=recipeCopy(input),sample=(purpose:string)=>seedSample(recipe.seed,1,'restoration/body','geometry',purpose),width=.82+sample('width')*.16,length=1.04+sample('length')*.16,ridge=.045+sample('ridge')*.045,l=legLengths[recipe.support],hipY=l.upper+l.lower+.04,trunkY=hipY+.03;
 const legs:RestorationLeg[]=legEntries.map(([id,side,end])=>({id,side,end,upper:l.upper,lower:l.lower,phase:side===end?0:.5,hip:v(side*.48,hipY,end*.42),knee:v(side*.48,hipY-l.upper,end*.42),foot:v(side*.48,.04,end*.42),nodes:{upper:`${id}-upper`,lower:`${id}-lower`,foot:`${id}-foot`}}));
 const children:Expression[]=[placed('trunk','restoration/trunk',v(0,trunkY,0),{width,length}),placed('drive','restoration/drive',v(0,trunkY-.12,-.2)),placed('shell',`restoration/shell/${recipe.shell}`,v(0,trunkY+.18,0),{width,length,ridge}),placed('organ',`restoration/organ/${recipe.organ}`,v(0,trunkY,.62)),attach('trunk-drive','trunk','drive','drive','mount'),attach('trunk-shell','trunk','shell','shell','mount'),attach('trunk-organ','trunk','organ','organ','mount'),expr.connect('organ-energy',{node:'drive',port:'output'},{node:'organ',port:'input'},'restoration/energy')];
 for(const leg of legs){for(const part of ['upper','lower','foot'] as const)children.push(placed(leg.nodes[part],`restoration/support/${recipe.support}/${part}`,part==='upper'?leg.hip:part==='lower'?leg.knee:leg.foot));children.push(attach(`${leg.id}-hip`,'trunk',leg.id,leg.nodes.upper,'hip','support'),attach(`${leg.id}-knee`,leg.nodes.upper,'knee',leg.nodes.lower,'knee','support'),attach(`${leg.id}-ankle`,leg.nodes.lower,'foot',leg.nodes.foot,'ankle','support'),expr.expose(`${leg.id}-contact`,{node:leg.nodes.foot,port:'contact'}));}
 for(const key of ['fluid-in','fluid-out','emitter'])children.push(expr.expose(key,{node:'organ',port:key}));children.push(expr.expose('sensor',{node:'trunk',port:'sensor'}),expr.require('one-trunk',{kind:'count',axiom:'restoration/trunk',min:1,max:1}),expr.require('one-organ',{kind:'count',axiom:`restoration/organ/${recipe.organ}`,min:1,max:1}),expr.require('connected-assembly',{kind:'connected',nodes:['trunk','drive','shell','organ',...legs.flatMap(l=>Object.values(l.nodes))],portType:'attachment'}),expr.require('acyclic-energy',{kind:'acyclic',portType:'work'}));
 for(const part of ['upper','lower','foot'])children.push(expr.require(`four-${part}`,{kind:'count',axiom:`restoration/support/${recipe.support}/${part}`,min:4,max:4}));
 children.push(expr.require('one-drive',{kind:'count',axiom:'restoration/drive',min:1,max:1}),expr.require('one-shell',{kind:'count',axiom:`restoration/shell/${recipe.shell}`,min:1,max:1}));
 const plan=finish(recipe,expr.group(...children),'restoration-quadruped'),stats:RestorationBodyStats={maxSpeed:recipe.support==='nimble'?2.1:1.4,speedSteps:recipe.support==='nimble'?2:1,reach:({pump:4,filter:1.25,vent:2.4,beacon:7})[recipe.organ],workSpeed:recipe.support==='nimble'?.8:1.2,heatTolerance:recipe.shell==='reed'?65:100,sensorRange:7+sample('sensor')*2+(recipe.organ==='beacon'?3:0),tankCapacityMl:6000,chargeCapacity:100,filtrationCapacity:12000};
 // The supported gait keeps foot travel within ±0.25 m. A knee can extend
 // by at most its full upper link; include link thickness and the widest foot.
 // This envelope, not only the rest pose, owns deployment and collision radius.
 const gaitRadius=Math.max(...legs.map(l=>Math.hypot(Math.abs(l.hip.x)+(recipe.support==='sturdy'?.12:.09),Math.abs(l.hip.z)+Math.max(l.upper+(recipe.support==='sturdy'?.075:.055),.25+.145))));
 const bounds={radius:Math.max(gaitRadius,...plan.shapes.map(s=>Math.hypot(Math.abs(s.center.x)+s.half.x,Math.abs(s.center.z)+s.half.z))),minY:Math.min(...plan.shapes.map(s=>s.center.y-s.half.y)),maxY:Math.max(...plan.shapes.map(s=>s.center.y+s.half.y))};
 const compiled:RestorationBodyPlan=deepFreeze({version:1,family:'restoration-quadruped',recipe,ref:{version:1,recipeHash:hash(recipe,plan,stats)},plan,body:{width,length,height:.36},legs,sockets:{sensor:pointFor(plan,'trunk','sensor'),emitter:pointFor(plan,'organ','emitter'),fluidIn:pointFor(plan,'organ','fluid-in'),fluidOut:pointFor(plan,'organ','fluid-out')},stats,cost:{scrap:plan.costs.scrap??0,core:plan.costs.core??0},budget:{nodes:plan.nodes.length,shapes:plan.shapes.length},bounds});
 if(bodyCache.size>=64)bodyCache.delete(bodyCache.keys().next().value!);bodyCache.set(cacheKey,compiled);return compiled;
}
/** A second host for exactly the same organ axiom and ports; it creates no runtime resources. */
export function compileRestorationDock(input:RestorationBodyRecipe):RestorationDockPlan {
 if(!validRestorationBodyRecipe(input))throw new Error('Invalid restoration dock recipe');const recipe=recipeCopy(input),plan=finish(recipe,expr.group(placed('dock','restoration/dock',v()),placed('drive','restoration/drive',v(0,.24,-.2)),placed('organ',`restoration/organ/${recipe.organ}`,v(0,.72,0)),attach('dock-drive','dock','drive','drive','mount'),attach('dock-organ','dock','organ','organ','mount'),expr.connect('organ-energy',{node:'drive',port:'output'},{node:'organ',port:'input'},'restoration/energy'),...['fluid-in','fluid-out','emitter'].map(key=>expr.expose(key,{node:'organ',port:key})),expr.require('connected-assembly',{kind:'connected',nodes:['dock','drive','organ'],portType:'attachment'})),'restoration-dock');
 return deepFreeze({version:1,family:'restoration-dock',recipe,ref:{version:1,recipeHash:hash(recipe,plan)},plan,organNode:plan.nodes.find(n=>n.key==='organ')!.id,cost:{scrap:plan.costs.scrap??0,core:plan.costs.core??0},budget:{nodes:plan.nodes.length,shapes:plan.shapes.length}});
}
/** Structural ledger only. Authority retains water, charge, captured waste and active actions. */
export function restorationRefitLedger(current:RestorationBodyRecipe|null,next:RestorationBodyRecipe|null,inventory:RestorationMaterialCost):{inventory:RestorationMaterialCost;refund:RestorationMaterialCost;cost:RestorationMaterialCost}|null {
 if(!restorationExactData(inventory,['scrap','core'])||![inventory.scrap,inventory.core].every(n=>Number.isSafeInteger(n)&&n>=0)||current!==null&&!validRestorationBodyRecipe(current)||next!==null&&!validRestorationBodyRecipe(next))return null;
 const refund=current?compileRestorationBody(current).cost:{scrap:0,core:0},cost=next?compileRestorationBody(next).cost:{scrap:0,core:0},scrap=inventory.scrap+refund.scrap-cost.scrap,core=inventory.core+refund.core-cost.core;if(!Number.isSafeInteger(scrap)||!Number.isSafeInteger(core)||scrap<0||core<0)return null;return {inventory:{scrap,core},refund:{...refund},cost:{...cost}};
}
