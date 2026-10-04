/** AXIOM semantic compiler v1. Pure JSON in / pure data out; no engine or evaluation hooks. */
export const FRAMEWORK_VERSION = 1 as const;
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;
export type Vec3 = { x:number; y:number; z:number };
export type Frame = { x:number; y:number; z:number; turn:0|1|2|3 };
export type Costs = Readonly<Record<string,number>>;
export type NumberExpr = number | { param:string } | { add:readonly NumberExpr[] } | { mul:readonly NumberExpr[] };
export interface ShapeDef { key:string; center:{x:NumberExpr;y:NumberExpr;z:NumberExpr}; half:{x:NumberExpr;y:NumberExpr;z:NumberExpr}; material:string; solid?:boolean }
export interface PortDef { key:string; type:'fluid'|'spatial'|'work'|'attachment'; direction:'in'|'out'|'both'; protocol:string; position:Vec3; facing:Vec3; capacity:number; unit:string; required?:boolean }
export interface Parameter { min:number; max:number; default:number; integer?:boolean }
export interface Axiom { id:string; version:number; label:string; parameters?:Readonly<Record<string,Parameter>>; shapes:readonly ShapeDef[]; ports:readonly PortDef[]; costs:Costs; properties:Readonly<Record<string,string|number|boolean>> }
export interface Endpoint { node:string; port:string }
export type Requirement = { kind:'count'; axiom:string; min:number; max:number } | {kind:'budget'; resource:string; max:number} | {kind:'acyclic'; portType:PortDef['type']} | {kind:'connected'; nodes:readonly string[]; portType:PortDef['type']};
export type Expression =
 | {op:'instantiate';key:string;axiom:string;version:number;params?:Readonly<Record<string,number>>}
 | {op:'group';children:readonly Expression[]}
 | {op:'transform';frame:Frame;child:Expression}
 | {op:'repeat';key:string;slots:readonly string[];step:Vec3;child:Expression}
 | {op:'choose';key:string;purpose:string;options:readonly {key:string;weight:number;child:Expression}[]}
 | {op:'split';key:string;axis:'x'|'z';span:number;gap:number;parts:readonly {key:string;weight:number;child:Expression}[]}
 | {op:'connect'|'attach';key:string;from:Endpoint;to:Endpoint;adapter:string}
 | {op:'require';key:string;rule:Requirement}
 | {op:'expose';key:string;endpoint:Endpoint};
export interface Recipe { id:string;version:number;expression:Expression;limits:{nodes:number;operations:number;depth:number};description:string }
export interface PlanShape {id:string;nodeId:string;key:string;center:Vec3;half:Vec3;material:string;solid:boolean}
export interface PlanPort extends PortDef { id:string;nodeId:string }
export interface PlanNode {id:string;key:string;axiom:string;version:number;frame:Frame;params:Readonly<Record<string,number>>;properties:Axiom['properties'];costs:Costs;shapes:PlanShape[];ports:PlanPort[]}
export interface PlanConnection {id:string;key:string;from:string;to:string;adapter:string;type:PortDef['type']}
export interface ConstraintResult {key:string;ok:boolean;message:string}
export interface Reservation {key:string;x:number;z:number;hx:number;hz:number;clearance?:number;maxSlope?:number}
export interface CompileContext {seed:number;owner:string;reservations?:readonly Reservation[];bounds?:Reservation;maxCost?:Costs}
export interface SemanticPlan {framework:1;recipe:{id:string;version:number};manifest:Readonly<Record<string,number>>;seed:number;owner:string;nodes:PlanNode[];shapes:PlanShape[];connections:PlanConnection[];exposed:{key:string;port:PlanPort}[];constraints:ConstraintResult[];costs:Record<string,number>;choices:Record<string,string>;valid:boolean;operations:number}
export interface ConnectionAdapter { id:string;from:PortDef['type'];to:PortDef['type'];protocol:string;coincident:boolean;opposed:boolean;directed:boolean }
export class AxiomRegistry {
 private axioms=new Map<string,Axiom>(); private adapters=new Map<string,ConnectionAdapter>();
 register(axiom:Axiom):this {axiom=freezeJSON(axiom);if(!keyOK(axiom.id)||!Number.isSafeInteger(axiom.version)||axiom.version<1||!Array.isArray(axiom.shapes)||axiom.shapes.length>512||!Array.isArray(axiom.ports)||axiom.ports.length>64||!axiom.properties||Object.keys(axiom.properties).length>32||Object.values(axiom.properties).some(v=>!['number','string','boolean'].includes(typeof v))||!axiom.costs||Object.keys(axiom.costs).length>32)throw new Error('Invalid axiom definition');const key=`${axiom.id}@${axiom.version}`;if(this.axioms.has(key))throw new Error(`Duplicate axiom ${key}`);this.axioms.set(key,freezeJSON(axiom));return this;}
 adapter(adapter:ConnectionAdapter):this {adapter=freezeJSON(adapter);if(!keyOK(adapter.id)||!['fluid','spatial','work','attachment'].includes(adapter.from)||!['fluid','spatial','work','attachment'].includes(adapter.to)||!keyOK(adapter.protocol)||![adapter.coincident,adapter.opposed,adapter.directed].every(v=>typeof v==='boolean'))throw new Error('Invalid connection adapter');if(this.adapters.has(adapter.id))throw new Error(`Duplicate adapter ${adapter.id}`);this.adapters.set(adapter.id,freezeJSON(adapter));return this;}
 get(id:string,version:number):Axiom {const a=this.axioms.get(`${id}@${version}`);if(!a)throw new Error(`Unknown axiom ${id}@${version}`);return a;}
 getAdapter(id:string):ConnectionAdapter {const a=this.adapters.get(id);if(!a)throw new Error(`Unknown connection adapter ${id}`);return a;}
 list():readonly Axiom[]{return [...this.axioms.values()].sort((a,b)=>order(a.id,b.id)||a.version-b.version);}
}
function freezeJSON<T>(value:T):T {
 let count=0;const copy=(v:unknown,depth:number):unknown=>{if(++count>100000||depth>64)throw new Error('JSON data budget exceeded');if(typeof v==='string'&&v.length>4096)throw new Error('JSON string limit exceeded');if(v===null||typeof v==='string'||typeof v==='boolean')return v;if(typeof v==='number'){if(!Number.isFinite(v))throw new Error('JSON numbers must be finite');return Object.is(v,-0)?0:v;}if(typeof v!=='object')throw new Error('Only plain JSON data is accepted');const proto=Object.getPrototypeOf(v);if(proto!==Object.prototype&&proto!==Array.prototype&&proto!==null)throw new Error('Only plain JSON objects are accepted');const out:unknown[]|Record<string,unknown>=Array.isArray(v)?[]:{};for(const [key,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(v))){if(Array.isArray(v)&&key==='length')continue;if(!('value'in descriptor)||typeof descriptor.value==='function'||['__proto__','constructor','prototype'].includes(key))throw new Error('Executable or unsafe JSON property rejected');(out as Record<string,unknown>)[key]=copy(descriptor.value,depth+1);}return Object.freeze(out);};return copy(value,0) as T;
}
export function hashSeed(text:string):number {let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);return (h^(h>>>16))>>>0;}
/** Independent named sample; unrelated samples and scheduling cannot consume this stream. */
export function seedSample(seed:number,version:number,owner:string,path:string,purpose:string,index=0):number {return hashSeed(JSON.stringify([seed,version,owner,path,purpose,index]))/4294967296;}
export function planId(seed:number,version:number,owner:string,path:string,kind:'node'|'connection'='node'){return `axiom:${version}:${seed}:${encodeURIComponent(owner)}:${kind}:${encodeURIComponent(path)}`;}
const identity:Frame={x:0,y:0,z:0,turn:0};
export function turnPoint(p:Vec3,turn:number):Vec3 {return turn===0?{...p}:turn===1?{x:-p.z,y:p.y,z:p.x}:turn===2?{x:-p.x,y:p.y,z:-p.z}:{x:p.z,y:p.y,z:-p.x};}
function point(p:Vec3,f:Frame):Vec3 {const q=turnPoint(p,f.turn);return {x:q.x+f.x,y:q.y+f.y,z:q.z+f.z};}
function compose(a:Frame,b:Frame):Frame {return {...point(b,a),turn:((a.turn+b.turn)%4) as Frame['turn']};}
function finite(n:unknown):n is number{return typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e6;}
function keyOK(k:unknown):k is string{return typeof k==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_/-]{0,159}$/.test(k)&&!k.includes('//')&&!k.split('/').some(p=>['__proto__','constructor','prototype'].includes(p));}
function frameOK(f:Frame){return f&&finite(f.x)&&finite(f.y)&&finite(f.z)&&[0,1,2,3].includes(f.turn);}
export function compileRecipe(registry:AxiomRegistry,recipe:Recipe,context:CompileContext):SemanticPlan {
 try{recipe=freezeJSON(recipe);context=freezeJSON(context);if(!recipe||typeof recipe!=='object'||Array.isArray(recipe)||!context||typeof context!=='object'||Array.isArray(context))throw new Error('Recipe and context must be JSON objects');}catch(error){return freezeJSON({framework:1,recipe:{id:'invalid',version:0},manifest:{},seed:0,owner:'invalid',nodes:[],shapes:[],connections:[],exposed:[],constraints:[{key:'compile',ok:false,message:error instanceof Error?error.message:'Invalid JSON input'}],costs:{},choices:{},valid:false,operations:0});}
 const plan:SemanticPlan={framework:1,recipe:{id:typeof recipe.id==='string'?recipe.id:'invalid',version:Number.isFinite(recipe.version)?recipe.version:0},manifest:{},seed:Number.isFinite(context.seed)?context.seed:0,owner:typeof context.owner==='string'?context.owner:'invalid',nodes:[],shapes:[],connections:[],exposed:[],constraints:[],costs:{},choices:{},valid:true,operations:0};
 const manifest:Record<string,number>={};plan.manifest=manifest;
 const fail=(key:string,message:string)=>{plan.constraints.push({key,ok:false,message});plan.valid=false;};
 const check=(key:string,ok:boolean,message:string)=>{tick();if(plan.constraints.length>=4096)throw new Error('Constraint output budget exceeded');plan.constraints.push({key,ok,message});if(!ok)plan.valid=false;};
 const costUnits:Record<string,number>={};let portCount=0;
 const requirementKeys=new Set<string>();
 const nodes=new Map<string,PlanNode>();const edges:{expression:Extract<Expression,{op:'connect'|'attach'}>;scope:string}[]=[];const required:{key:string;rule:Requirement;scope:string}[]=[];const exposed:{key:string;endpoint:Endpoint;scope:string}[]=[];
 const qualified=(scope:string,key:string)=>scope?`${scope}/${key}`:key;
 const tick=()=>{if(++plan.operations>recipe.limits.operations)throw new Error('Operation budget exceeded');};
 const numeric=(expr:NumberExpr,params:Readonly<Record<string,number>>,depth=0):number=>{tick();if(depth>16)throw new Error('Numeric expression depth exceeded');let n:number;if(typeof expr==='number')n=expr;else if(expr&&'param'in expr){if(!Object.hasOwn(params,expr.param))throw new Error(`Unknown parameter ${expr.param}`);n=params[expr.param]!;}else if(expr&&'add'in expr&&Array.isArray(expr.add)&&expr.add.length<=16)n=expr.add.reduce<number>((a,v)=>a+numeric(v,params,depth+1),0);else if(expr&&'mul'in expr&&Array.isArray(expr.mul)&&expr.mul.length<=16)n=expr.mul.reduce<number>((a,v)=>a*numeric(v,params,depth+1),1);else throw new Error('Invalid numeric expression');if(!finite(n))throw new Error('Non-finite or excessive numeric result');return Object.is(n,-0)?0:n;};
 const vec=(v:{x:NumberExpr;y:NumberExpr;z:NumberExpr},params:Readonly<Record<string,number>>):Vec3=>({x:numeric(v.x,params),y:numeric(v.y,params),z:numeric(v.z,params)});
 const walk=(e:Expression,scope:string,frame:Frame,depth:number)=>{
  tick();if(depth>recipe.limits.depth)throw new Error('Expansion depth exceeded');if(!e||typeof e!=='object')throw new Error('Invalid expression');
  switch(e.op){
   case 'group':if(!Array.isArray(e.children)||e.children.length>512)throw new Error('Group limit exceeded');for(const c of e.children)walk(c,scope,frame,depth+1);break;
   case 'transform':if(!frameOK(e.frame))throw new Error('Invalid transform');walk(e.child,scope,compose(frame,e.frame),depth+1);break;
   case 'instantiate':{
    if(!keyOK(e.key))throw new Error('Invalid semantic key');const key=qualified(scope,e.key);if(nodes.has(key))throw new Error(`Duplicate semantic key ${key}`);if(plan.nodes.length>=recipe.limits.nodes)throw new Error('Node budget exceeded');
    const axiom=registry.get(e.axiom,e.version);if(manifest[axiom.id]!==undefined&&manifest[axiom.id]!==axiom.version)throw new Error('Mixed axiom versions require separate owner plans');manifest[axiom.id]=axiom.version;
    const params:Record<string,number>={};for(const [name,spec]of Object.entries(axiom.parameters??{})){if(!keyOK(name)||!finite(spec.min)||!finite(spec.max)||spec.min>spec.max)throw new Error('Invalid parameter definition');const n=e.params?.[name]??spec.default;if(!finite(n)||n<spec.min||n>spec.max||(spec.integer&&!Number.isInteger(n)))throw new Error(`Parameter ${name} violates its bounds`);params[name]=n;}for(const name of Object.keys(e.params??{}))if(!Object.hasOwn(params,name))throw new Error(`Unknown parameter ${name}`);
    const id=planId(context.seed,recipe.version,context.owner,key);const n:PlanNode={id,key,axiom:axiom.id,version:axiom.version,frame:{...frame},params,properties:{...axiom.properties},costs:{...axiom.costs},shapes:[],ports:[]};
    const shapeKeys=new Set<string>();for(const s of axiom.shapes){tick();if(plan.shapes.length>=1024)throw new Error('Shape output budget exceeded');if(!keyOK(s.key)||shapeKeys.has(s.key))throw new Error('Duplicate or invalid shape key');shapeKeys.add(s.key);const half=vec(s.half,params);if(Math.min(half.x,half.y,half.z)<=0)throw new Error('Shape requires positive half extents');const shape:PlanShape={id:`${id}/shape/${encodeURIComponent(s.key)}`,nodeId:id,key:s.key,center:point(vec(s.center,params),frame),half:frame.turn%2?{x:half.z,y:half.y,z:half.x}:half,material:s.material,solid:s.solid!==false};n.shapes.push(shape);plan.shapes.push(shape);}
    const portKeys=new Set<string>();for(const p of axiom.ports){tick();if(++portCount>2048)throw new Error('Port output budget exceeded');if(!keyOK(p.key)||portKeys.has(p.key)||!['fluid','spatial','work','attachment'].includes(p.type)||!['in','out','both'].includes(p.direction)||!keyOK(p.protocol)||typeof p.unit!=='string'||!p.unit.length||p.unit.length>40||!finite(p.capacity)||p.capacity<=0||Math.abs(Math.hypot(p.facing.x,p.facing.y,p.facing.z)-1)>1e-6||![p.position.x,p.position.y,p.position.z,p.facing.x,p.facing.y,p.facing.z].every(finite))throw new Error('Invalid axiom port');portKeys.add(p.key);n.ports.push({...p,id:`${id}/port/${encodeURIComponent(p.key)}`,nodeId:id,position:point(p.position,frame),facing:turnPoint(p.facing,frame.turn)});}
    for(const [resource,cost]of Object.entries(axiom.costs)){tick();if(!keyOK(resource)||!finite(cost)||cost<0)throw new Error('Invalid material cost');const micro=cost*1e6;if(Math.abs(micro-Math.round(micro))>Number.EPSILON*Math.max(1,Math.abs(micro))*4)throw new Error('Material costs support at most six decimal places');costUnits[resource]=(costUnits[resource]??0)+Math.round(cost*1e6);plan.costs[resource]=costUnits[resource]/1e6;}
    nodes.set(key,n);plan.nodes.push(n);break;
   }
   case 'repeat':if(!keyOK(e.key)||!Array.isArray(e.slots)||e.slots.length>64||new Set(e.slots).size!==e.slots.length||!e.slots.every(keyOK)||![e.step.x,e.step.y,e.step.z].every(finite))throw new Error('Invalid bounded repeat');for(let i=0;i<e.slots.length;i++)walk(e.child,qualified(scope,`${e.key}/${e.slots[i]!}`),compose(frame,{x:e.step.x*i,y:e.step.y*i,z:e.step.z*i,turn:0}),depth+1);break;
   case 'choose':{
    if(!keyOK(e.key)||!keyOK(e.purpose)||!Array.isArray(e.options)||!e.options.length||e.options.length>32||new Set(e.options.map(o=>o.key)).size!==e.options.length||!e.options.every(o=>keyOK(o.key)&&finite(o.weight)&&o.weight>0))throw new Error('Invalid bounded choice');
    if(Object.hasOwn(plan.choices,qualified(scope,e.key)))throw new Error('Duplicate choice key');const options=[...e.options].sort((a,b)=>order(a.key,b.key));let roll=seedSample(context.seed,recipe.version,context.owner,qualified(scope,e.key),e.purpose)*options.reduce((a,o)=>a+o.weight,0);let selected=options.at(-1)!;for(const o of options){roll-=o.weight;if(roll<0){selected=o;break;}}plan.choices[qualified(scope,e.key)]=selected.key;walk(selected.child,qualified(scope,`${e.key}/${selected.key}`),frame,depth+1);break;
   }
   case 'split':{
    if(!keyOK(e.key)||!['x','z'].includes(e.axis)||!finite(e.span)||e.span<=0||!finite(e.gap)||e.gap<0||!Array.isArray(e.parts)||!e.parts.length||e.parts.length>32||new Set(e.parts.map(p=>p.key)).size!==e.parts.length||!e.parts.every(p=>keyOK(p.key)&&finite(p.weight)&&p.weight>0))throw new Error('Invalid bounded split');
    const available=e.span-e.gap*(e.parts.length-1);if(available<=0)throw new Error('Split clearance exceeds span');const total=e.parts.reduce((a,p)=>a+p.weight,0);let cursor=-e.span/2;for(const p of e.parts){const size=available*p.weight/total;const f={...identity,[e.axis]:cursor+size/2};walk(p.child,qualified(scope,`${e.key}/${p.key}`),compose(frame,f),depth+1);cursor+=size+e.gap;}break;
   }
   case 'connect':case 'attach':if(!keyOK(e.key))throw new Error('Invalid connection key');edges.push({expression:e,scope});break;
   case 'require':if(!keyOK(e.key))throw new Error('Invalid requirement key');if(requirementKeys.has(qualified(scope,e.key)))throw new Error('Duplicate requirement key');requirementKeys.add(qualified(scope,e.key));required.push({key:qualified(scope,e.key),rule:e.rule,scope});break;
   case 'expose':if(!keyOK(e.key))throw new Error('Invalid exposure key');exposed.push({key:qualified(scope,e.key),endpoint:e.endpoint,scope});break;
   default:throw new Error('Unknown operator');
  }
 };
 try {
  if(!Number.isInteger(context.seed)||context.seed<0||context.seed>0xffffffff||!keyOK(context.owner)||!keyOK(recipe.id)||!Number.isSafeInteger(recipe.version)||recipe.version<1||!recipe.limits||!Number.isSafeInteger(recipe.limits.nodes)||recipe.limits.nodes<0||recipe.limits.nodes>512||!Number.isSafeInteger(recipe.limits.operations)||recipe.limits.operations<1||recipe.limits.operations>50000||!Number.isSafeInteger(recipe.limits.depth)||recipe.limits.depth<1||recipe.limits.depth>32)throw new Error('Invalid compiler inputs or limits');
  const reservations=[...(context.reservations??[]),...(context.bounds?[context.bounds]:[])];if(reservations.length>512||reservations.some(r=>!keyOK(r.key)||![r.x,r.z,r.hx,r.hz,r.clearance??0,r.maxSlope??0].every(finite)||r.hx<=0||r.hz<=0||(r.clearance??0)<0||(r.maxSlope??0)<0))throw new Error('Invalid spatial reservation');
  walk(recipe.expression,'',identity,0);
  const endpoint=(e:Endpoint,scope:string)=>{if(!e||!keyOK(e.node)||!keyOK(e.port))throw new Error('Invalid endpoint');const n=nodes.get(qualified(scope,e.node));const p=n?.ports.find(p=>p.key===e.port);if(!p)throw new Error(`Unknown endpoint ${e.node}.${e.port}`);return p;};
  const used=new Set<string>(),edgeKeys=new Set<string>();for(const {expression:e,scope}of edges){tick();const key=qualified(scope,e.key);if(edgeKeys.has(key))throw new Error('Duplicate connection key');edgeKeys.add(key);const a=endpoint(e.from,scope),b=endpoint(e.to,scope),adapter=registry.getAdapter(e.adapter);const near=(a:Vec3,b:Vec3)=>Math.abs(a.x-b.x)<1e-6&&Math.abs(a.y-b.y)<1e-6&&Math.abs(a.z-b.z)<1e-6;
   const ok=a.nodeId!==b.nodeId&&a.type===adapter.from&&b.type===adapter.to&&a.protocol===adapter.protocol&&b.protocol===adapter.protocol&&a.unit===b.unit&&(!adapter.directed||(a.direction==='out'&&b.direction==='in'))&&(!adapter.coincident||near(a.position,b.position))&&(!adapter.opposed||(Math.abs(Math.hypot(a.facing.x,a.facing.y,a.facing.z)-1)<1e-6&&near(a.facing,{x:-b.facing.x,y:-b.facing.y,z:-b.facing.z})))&&!used.has(a.id)&&!used.has(b.id)&&a.capacity>0&&b.capacity>0&&(e.op!=='attach'||a.type==='attachment');
   check(key,ok,ok?`Compatible ${a.type} ports joined`:'Ports violate type, protocol, direction, frame, capacity or occupancy');if(ok){used.add(a.id);used.add(b.id);plan.connections.push({id:planId(context.seed,recipe.version,context.owner,key,'connection'),key,from:a.id,to:b.id,adapter:e.adapter,type:a.type});}
  }
  for(const n of plan.nodes)for(const p of n.ports)if(p.required)check(`${n.key}/${p.key}/required`,used.has(p.id),'Required port must be connected');
  for(const e of exposed){tick();if(plan.exposed.length>=1024)throw new Error('Exposure output budget exceeded');const p=endpoint(e.endpoint,e.scope);if(plan.exposed.some(p=>p.key===e.key))throw new Error('Duplicate exposed port key');plan.exposed.push({key:e.key,port:p});}
  for(const {key,rule:r,scope}of required){tick();let ok=false,message='Constraint failed';if(r.kind==='count'){if(!keyOK(r.axiom)||!Number.isSafeInteger(r.min)||!Number.isSafeInteger(r.max)||r.min<0||r.max<r.min||r.max>512)throw new Error('Invalid count requirement');const count=plan.nodes.filter(n=>{tick();return n.axiom===r.axiom;}).length;ok=count>=r.min&&count<=r.max;message=`${r.axiom}: ${count} nodes, allowed ${r.min}–${r.max}`;}else if(r.kind==='budget'){if(!keyOK(r.resource)||!finite(r.max)||r.max<0)throw new Error('Invalid budget requirement');ok=(plan.costs[r.resource]??0)<=r.max;message=`${r.resource}: ${plan.costs[r.resource]??0} / ${r.max}`;}else if(r.kind==='acyclic'||r.kind==='connected'){
    if(!['fluid','spatial','work','attachment'].includes(r.portType)||(r.kind==='connected'&&(!Array.isArray(r.nodes)||r.nodes.length>512||!r.nodes.every(keyOK))))throw new Error('Invalid graph requirement');const graph=new Map<string,string[]>();for(const edge of plan.connections.filter(e=>e.type===r.portType)){tick();const a=plan.nodes.find(n=>n.ports.some(p=>p.id===edge.from))!.id,b=plan.nodes.find(n=>n.ports.some(p=>p.id===edge.to))!.id;graph.set(a,[...(graph.get(a)??[]),b]);if(r.kind==='connected')graph.set(b,[...(graph.get(b)??[]),a]);}
    if(r.kind==='acyclic'){const visited=new Set<string>(),active=new Set<string>();const visit=(id:string):boolean=>{tick();if(active.has(id))return false;if(visited.has(id))return true;active.add(id);for(const n of graph.get(id)??[])if(!visit(n))return false;active.delete(id);visited.add(id);return true;};ok=plan.nodes.every(n=>visit(n.id));message=`${r.portType} directed graph is acyclic`;}else {const ids=r.nodes.map(k=>nodes.get(qualified(scope,k))?.id);const seen=new Set<string>(),todo=ids[0]?[ids[0]]:[];while(todo.length){tick();const id=todo.pop()!;if(seen.has(id))continue;seen.add(id);todo.push(...graph.get(id)??[]);}ok=ids.length>0&&ids.every(id=>id!==undefined&&seen.has(id));message=`${r.portType} endpoints are reachable`;}
   }else throw new Error('Unknown requirement');check(key,ok,message);
  }
  for(const [resource,max]of Object.entries(context.maxCost??{}))check(`context/budget/${resource}`,finite(max)&&max>=0&&(plan.costs[resource]??0)<=max,`${resource} context budget ${max}`);
  for(const s of plan.shapes.filter(s=>s.solid)){const b=context.bounds;if(b)check(`${s.id}/bounds`,Math.abs(s.center.x-b.x)+s.half.x<=b.hx+1e-6&&Math.abs(s.center.z-b.z)+s.half.z<=b.hz+1e-6,'Solid fits reserved bounds');for(const r of context.reservations??[]){const margin=r.clearance??0;check(`${s.id}/reservation/${r.key}`,!(Math.abs(s.center.x-r.x)<s.half.x+r.hx+margin&&Math.abs(s.center.z-r.z)<s.half.z+r.hz+margin),'Solid clears reserved infrastructure');}}
 }catch(error){fail('compile',error instanceof Error?error.message:'Compilation rejected');}
 plan.nodes.sort((a,b)=>order(a.key,b.key));plan.shapes.sort((a,b)=>order(a.id,b.id));plan.connections.sort((a,b)=>order(a.key,b.key));plan.exposed.sort((a,b)=>order(a.key,b.key));plan.constraints.sort((a,b)=>order(a.key,b.key));plan.manifest=Object.fromEntries(Object.entries(plan.manifest).sort(([a],[b])=>order(a,b)));plan.costs=Object.fromEntries(Object.entries(plan.costs).sort(([a],[b])=>order(a,b)));plan.choices=Object.fromEntries(Object.entries(plan.choices).sort(([a],[b])=>order(a,b)));
 try{return freezeJSON(plan);}catch(error){return freezeJSON({framework:1,recipe:plan.recipe,manifest:{},seed:plan.seed,owner:plan.owner,nodes:[],shapes:[],connections:[],exposed:[],constraints:[{key:'compile',ok:false,message:error instanceof Error?error.message:'Output budget exceeded'}],costs:{},choices:{},valid:false,operations:plan.operations});}
}
/** Typed builders produce only serializable expressions. */
export const expr={
 instantiate:(key:string,axiom:string,version=1,params?:Readonly<Record<string,number>>):Expression=>({op:'instantiate',key,axiom,version,...(params?{params}:{})}),
 group:(...children:Expression[]):Expression=>({op:'group',children}),
 transform:(frame:Frame,child:Expression):Expression=>({op:'transform',frame,child}),
 repeat:(key:string,slots:readonly string[],step:Vec3,child:Expression):Expression=>({op:'repeat',key,slots,step,child}),
 choose:(key:string,purpose:string,options:Extract<Expression,{op:'choose'}>['options']):Expression=>({op:'choose',key,purpose,options}),
 split:(key:string,axis:'x'|'z',span:number,gap:number,parts:Extract<Expression,{op:'split'}>['parts']):Expression=>({op:'split',key,axis,span,gap,parts}),
 connect:(key:string,from:Endpoint,to:Endpoint,adapter:string):Expression=>({op:'connect',key,from,to,adapter}),
 attach:(key:string,from:Endpoint,to:Endpoint,adapter:string):Expression=>({op:'attach',key,from,to,adapter}),
 require:(key:string,rule:Requirement):Expression=>({op:'require',key,rule}),
 expose:(key:string,endpoint:Endpoint):Expression=>({op:'expose',key,endpoint}),
};
