import {AxiomRegistry,compileRecipe,expr,type Recipe,type SemanticPlan,type Expression} from './procedural.ts';
/** Waterworks pack v1. Metres, seconds and conserved litres. */
export type Part = 'pump' | 'pipe' | 'corner' | 'elbow' | 'tee' | 'reservoir' | 'outlet';
export type Rotation = 0 | 1 | 2 | 3;
export interface Module { id:string; kind:Part; x:number; z:number; rotation:Rotation }
export interface Obstacle { x:number; z:number; hx:number; hz:number; hy:number }
export interface Port { id:string; direction:'in'|'out'; fluid:'water'; x:number; z:number; dx:number; dz:number }
export interface PartDefinition { label:string; cost:{scrap:number;core:number}; ports:readonly Port[]; solids:readonly Obstacle[]; maxCount:number; capacity:number }
const input:Port={id:'in',direction:'in',fluid:'water',x:1.5,z:0,dx:1,dz:0};
const output:Port={id:'out',direction:'out',fluid:'water',x:-1.5,z:0,dx:-1,dz:0};
const branch:Port={id:'branch',direction:'out',fluid:'water',x:0,z:1.5,dx:0,dz:1};
const straight:Obstacle={x:0,z:0,hx:1.4,hz:.2,hy:.45};
const eastArm:Obstacle={x:.7,z:0,hx:.7,hz:.2,hy:.45};
const southArm:Obstacle={x:0,z:.7,hx:.2,hz:.7,hy:.45};
export const MAX_MODULES=12;
export const PART_DEFS:Record<Part,PartDefinition>={
 pump:{label:'River pump',cost:{scrap:0,core:1},ports:[output],solids:[{x:0,z:0,hx:.75,hz:.75,hy:.75},straight],maxCount:1,capacity:0},
 pipe:{label:'Straight pipe',cost:{scrap:1,core:0},ports:[input,output],solids:[straight],maxCount:MAX_MODULES,capacity:0},
 corner:{label:'Right corner',cost:{scrap:1,core:0},ports:[input,{...branch,id:'out'}],solids:[eastArm,southArm],maxCount:MAX_MODULES,capacity:0},
 elbow:{label:'Left corner',cost:{scrap:1,core:0},ports:[input,{...branch,id:'out',z:-1.5,dz:-1}],solids:[eastArm,{...southArm,z:-.7}],maxCount:MAX_MODULES,capacity:0},
 tee:{label:'Tee junction',cost:{scrap:1,core:0},ports:[input,output,branch],solids:[straight,southArm],maxCount:MAX_MODULES,capacity:0},
 reservoir:{label:'Reservoir',cost:{scrap:1,core:0},ports:[input,output],solids:[{x:0,z:0,hx:.85,hz:.85,hy:.9},straight],maxCount:1,capacity:20},
 outlet:{label:'Mossbank outlet',cost:{scrap:1,core:0},ports:[input],solids:[straight],maxCount:1,capacity:0},
};
/** Registry primitives are the single source consumed by semantic rendering, collision and connections. */
export const waterworksRegistry=new AxiomRegistry().adapter({id:'water-mating-v1',from:'fluid',to:'fluid',protocol:'water',coincident:true,opposed:true,directed:true});
for(const [kind,def]of Object.entries(PART_DEFS))waterworksRegistry.register({
 id:`waterworks/${kind}`,version:1,label:def.label,costs:def.cost,properties:{kind,capacity:def.capacity,capacityUnit:'L',maxCount:def.maxCount},
 shapes:def.solids.map((s,i)=>({key:`body-${i}`,center:{x:s.x,y:s.hy,z:s.z},half:{x:s.hx,y:s.hy,z:s.hz},material:kind==='pump'&&s.hy>.5?'#628f85':kind==='reservoir'&&s.hy>.5?'#567e72':kind==='outlet'?'#d1b67d':'#9cad9a'})),
 ports:def.ports.map(p=>({key:p.id,type:'fluid',direction:p.direction,protocol:p.fluid,position:{x:p.x,y:.45,z:p.z},facing:{x:p.dx,y:0,z:p.dz},capacity:2,unit:'L/s'})),
});
export function waterworksRecipe(w:Pick<Waterworks,'parts'|'links'>):Recipe {
 const children:Expression[]=w.parts.map(m=>expr.transform({x:m.x,y:0,z:m.z,turn:m.rotation},expr.instantiate(m.id,`waterworks/${m.kind}`,1)));
 for(const link of w.links){const match=/^([a-z][a-z0-9-]{0,31})\.([a-z]+)>([a-z][a-z0-9-]{0,31})\.([a-z]+)$/.exec(link);children.push(match?expr.connect(`${match[1]}-${match[2]}--${match[3]}-${match[4]}`,{node:match[1]!,port:match[2]!},{node:match[3]!,port:match[4]!},'water-mating-v1'):expr.connect('invalid-link',{node:'missing',port:'missing'},{node:'missing',port:'missing'},'water-mating-v1'));}
 for(const [kind,def]of Object.entries(PART_DEFS))children.push(expr.require(`count-${kind}`,{kind:'count',axiom:`waterworks/${kind}`,min:0,max:def.maxCount}));
 children.push(expr.require('fluid-dag',{kind:'acyclic',portType:'fluid'}));
 for(const m of w.parts)for(const p of PART_DEFS[m.kind]?.ports??[])children.push(expr.expose(`${m.id}-${p.id}`,{node:m.id,port:p.id}));
 return {id:'waterworks/assembly',version:1,description:'Player-authored, snapped water network. Version 1 preserves schema-5 footprints and costs.',limits:{nodes:MAX_MODULES,operations:2000,depth:8},expression:expr.group(...children)};
}
let compiledSignature='';let compiledMachine:SemanticPlan|undefined;
export function compileWaterworks(w:Pick<Waterworks,'parts'|'links'>,seed=0):SemanticPlan {
 const signature=JSON.stringify([w.parts,w.links,seed]);if(signature===compiledSignature&&compiledMachine)return compiledMachine;
 const plan=compileRecipe(waterworksRegistry,waterworksRecipe(w),{seed,owner:'waterworks',bounds:{key:'yard',x:-12.5,z:9,hx:9,hz:4.5},reservations:BUILD_EXCLUSIONS.map((o,i)=>({...o,key:`protected-${i}`}))});
 compiledSignature=signature;compiledMachine=plan;return plan;
}
const modulePlans=new Map<string,SemanticPlan>();
function compileModule(m:Module):SemanticPlan {const key=JSON.stringify(m);let plan=modulePlans.get(key);if(!plan){plan=compileRecipe(waterworksRegistry,{id:'waterworks/module',version:1,description:'A registered module',limits:{nodes:1,operations:100,depth:4},expression:expr.transform({x:m.x,y:0,z:m.z,turn:m.rotation},expr.instantiate(m.id,`waterworks/${m.kind}`,1))},{seed:0,owner:'waterworks'});if(modulePlans.size>=128)modulePlans.clear();modulePlans.set(key,plan);}return plan;}
export const COSTS:Record<Part,{scrap:number;core:number}>=Object.fromEntries(Object.entries(PART_DEFS).map(([k,v])=>[k,v.cost])) as Record<Part,{scrap:number;core:number}>;
/** Center coordinates are authoritative. The foundation edge is half a cell beyond them. */
export const BUILD_AREA=Object.freeze({minX:-20,maxX:-5,minZ:6,maxZ:12,step:3,cellSize:3,maxModules:MAX_MODULES});
export const GRID_CELLS=Object.freeze(Array.from({length:3},(_,row)=>Array.from({length:6},(_,col)=>Object.freeze({x:BUILD_AREA.minX+col*3,z:BUILD_AREA.minZ+row*3}))).flat());
export function withinBuildArea(x:number,z:number,margin=0){return x>=BUILD_AREA.minX-1.5-margin&&x<=BUILD_AREA.maxX+1.5+margin&&z>=BUILD_AREA.minZ-1.5-margin&&z<=BUILD_AREA.maxZ+1.5+margin;}
export function snapToGrid(x:number,z:number){return {x:BUILD_AREA.minX+Math.round((x-BUILD_AREA.minX)/3)*3,z:BUILD_AREA.minZ+Math.round((z-BUILD_AREA.minZ)/3)*3};}
/** Fixed world exclusions use the same authored positions as the valley. Pickups keep a clear footprint even after collection. */
export const BUILD_EXCLUSIONS:readonly Obstacle[]=[
 {x:0,z:0,hx:3.5,hz:48,hy:0}, // river
 {x:0,z:2,hx:48,hz:1.8,hy:0}, // bridge and east-west walking route
 {x:-17,z:-3,hx:1.6,hz:5.4,hy:0}, // Mossbank approach
 ...[[-20,-7],[-12,-8],[-23,1],[17,-19],[24,-19],[25,-11]].map(([x,z])=>({x:x!,z:z!,hx:2.3,hz:2.1,hy:2})),
 ...[[-8,13],[-11,13],[-14,13],[-17,13],[-9,8],[-5,0],[7,-6],[11,6],[15,10],[18,4],[7,15],[5,12],[-12,-13],[-16,-4]].map(([x,z])=>({x:x!,z:z!,hx:.55,hz:.55,hy:1})),
 {x:0,z:16,hx:2.3,hz:2.3,hy:2},
];
/** Original layout is retained as a sample and as a lossless schema-4 migration map. */
export const PADS=[
 {id:'intake',label:'River intake',x:-5,z:6,kind:'pump'},
 {id:'transfer',label:'Transfer pipe',x:-8,z:6,kind:'pipe'},
 {id:'tank',label:'Reservoir',x:-11,z:6,kind:'reservoir'},
 {id:'outlet',label:'Mossbank outlet',x:-14,z:6,kind:'outlet'},
] as const;
export type PadId=typeof PADS[number]['id'];
export const LINKS=['intake:transfer','transfer:tank','tank:outlet'] as const;
export type Link=string;
export interface Waterworks { parts:Module[]; links:Link[]; stored:number; extracted:number; delivered:number; drained:number }
export interface LegacyWaterworks { parts:PadId[]; links:typeof LINKS[number][]; stored:number; extracted:number; delivered:number; drained:number }
export const emptyWaterworks=():Waterworks=>({parts:[],links:[],stored:0,extracted:0,delivered:0,drained:0});
export type BuildCommand=
 | {type:'place';kind:Part;x:number;z:number;rotation?:Rotation;id?:string;pad?:PadId}
 | {type:'rotate';id:string;rotation:Rotation}
 | {type:'dismantle';id:string;pad?:never}
 | {type:'dismantle';pad:PadId;id?:never}
 | {type:'connect'|'disconnect';link:Link};
export function portsFor(m:Module):Port[]{return (compileModule(m).nodes[0]?.ports??[]).map(p=>({id:p.key,direction:p.direction as 'in'|'out',fluid:'water',x:p.position.x,z:p.position.z,dx:p.facing.x,dz:p.facing.z}));}
export function moduleObstacles(m:Module):Obstacle[]{return compileModule(m).shapes.filter(s=>s.solid).map(s=>({x:s.center.x,z:s.center.z,hx:s.half.x,hz:s.half.z,hy:s.half.y}));}
export function machineObstacles(w:Waterworks):Obstacle[]{return compileWaterworks(w).shapes.filter(s=>s.solid).map(s=>({x:s.center.x,z:s.center.z,hx:s.half.x,hz:s.half.z,hy:s.half.y}));}
/** Planar saves omit jump height. Restore beside a module rather than inside its floor-level collider. */
export function safeMachineSpawn(w:Waterworks,player:{x:number;z:number}):{x:number;z:number}{
 const shapes=machineObstacles(w),radius=.34;
 const touches=(p:{x:number;z:number},o:Obstacle)=>Math.hypot(Math.max(0,Math.abs(p.x-o.x)-o.hx),Math.max(0,Math.abs(p.z-o.z)-o.hz))<radius;
 if(!shapes.some(o=>touches(player,o)))return player;
 const xs=[player.x,...shapes.flatMap(o=>[o.x-o.hx-radius-.02,o.x+o.hx+radius+.02])];
 const zs=[player.z,...shapes.flatMap(o=>[o.z-o.hz-radius-.02,o.z+o.hz+radius+.02])];
 const candidates=xs.flatMap(x=>zs.map(z=>({x,z}))).filter(p=>Math.abs(p.x)<=48&&Math.abs(p.z)<=48&&!shapes.some(o=>touches(p,o))&&!BUILD_EXCLUSIONS.some(o=>touches(p,o)));
 candidates.sort((a,b)=>Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z));
 return candidates[0]??{x:-13,z:15};
}
export function machineCosts(w:Waterworks){const costs=compileWaterworks(w).costs;return {scrap:costs.scrap??0,core:costs.core??0};}
export function capacity(w:Waterworks){return w.parts.reduce((sum,m)=>sum+PART_DEFS[m.kind].capacity,0);}
function overlaps(a:Obstacle,b:Obstacle,margin=0){return Math.abs(a.x-b.x)<a.hx+b.hx+margin&&Math.abs(a.z-b.z)<a.hz+b.hz+margin;}
function safeId(id:unknown):id is string{return typeof id==='string'&&/^[a-z][a-z0-9-]{0,31}$/.test(id);}
function moduleOK(value:unknown):value is Module {
 if(!value||typeof value!=='object')return false;const m=value as Module;
 return safeId(m.id)&&Object.hasOwn(PART_DEFS,m.kind)&&Number.isInteger(m.rotation)&&m.rotation>=0&&m.rotation<=3
  &&GRID_CELLS.some(c=>c.x===m.x&&c.z===m.z)
  &&(m.kind!=='pump'||m.x===BUILD_AREA.maxX)&&(m.kind!=='outlet'||m.x<=-14)
  &&!moduleObstacles(m).some(s=>BUILD_EXCLUSIONS.some(e=>overlaps(s,e)));
}
export interface LinkEndpoint { module:Module; port:Port }
export interface LinkEndpoints { from:LinkEndpoint; to:LinkEndpoint }
function canonicalLink(link:string){
 if((LINKS as readonly string[]).includes(link)){const [a,b]=link.split(':');return `${a}.out>${b}.in`;}
 return link;
}
export function linkEndpoints(w:Waterworks,link:Link):LinkEndpoints|null {
 const match=/^([a-z][a-z0-9-]{0,31})\.([a-z]+)>([a-z][a-z0-9-]{0,31})\.([a-z]+)$/.exec(canonicalLink(link));
 if(!match)return null;
 const a=w.parts.find(m=>m.id===match[1]),b=w.parts.find(m=>m.id===match[3]);if(!a||!b||a===b)return null;
 const p=portsFor(a).find(p=>p.id===match[2]),q=portsFor(b).find(p=>p.id===match[4]);
 if(!p||!q||p.direction!=='out'||q.direction!=='in'||p.fluid!==q.fluid||p.x!==q.x||p.z!==q.z||p.dx!==-q.dx||p.dz!==-q.dz)return null;
 return {from:{module:a,port:p},to:{module:b,port:q}};
}
function graphOK(w:Waterworks){
 if(!Array.isArray(w.links)||w.links.length>MAX_MODULES*2||new Set(w.links).size!==w.links.length)return false;
 const used=new Set<string>();for(const link of w.links){if(typeof link!=='string'||canonicalLink(link)!==link||!linkEndpoints(w,link))return false;for(const port of link.split('>')){if(used.has(port))return false;used.add(port);}}
 return compileWaterworks(w).valid;
}
/** Only physically mating, unoccupied ports that keep the directed graph acyclic are offered. */
export function possibleLinks(w:Waterworks):Link[]{
 const result:Link[]=[];
 for(const a of w.parts)for(const p of portsFor(a).filter(p=>p.direction==='out'))for(const b of w.parts)for(const q of portsFor(b).filter(p=>p.direction==='in')){
  const link=`${a.id}.${p.id}>${b.id}.${q.id}`;
  if(linkEndpoints(w,link)&&!w.links.includes(link)&&graphOK({...w,links:[...w.links,link]}))result.push(link);
 }
 return result;
}
function reachable(w:Waterworks,from:Module|undefined,to:Module|undefined){
 if(!from||!to)return false;const seen=new Set<string>(),todo=[from.id];
 while(todo.length){const id=todo.pop()!;if(id===to.id)return true;if(seen.has(id))continue;seen.add(id);for(const l of w.links){const edge=linkEndpoints(w,l);if(edge?.from.module.id===id)todo.push(edge.to.module.id);}}
 return false;
}
export function inletWorking(w:Waterworks){return reachable(w,w.parts.find(m=>m.kind==='pump'),w.parts.find(m=>m.kind==='reservoir'));}
export function supplyWorking(w:Waterworks){return reachable(w,w.parts.find(m=>m.kind==='reservoir'),w.parts.find(m=>m.kind==='outlet'))&&(w.stored>0||inletWorking(w));}
export function build(w:Waterworks,inventory:{scrap:number;core:number;water:number},command:BuildCommand,player:{x:number;z:number},zone:string){
 const fail=(reason:string)=>({machine:w,inventory,reason});
 if(zone!=='valley')return fail('Build in the marked waterworks yard in the valley');
 if(!validMachine(w)||!Number.isFinite(player.x)||!Number.isFinite(player.z)||!['scrap','core','water'].every(k=>Number.isSafeInteger(inventory[k as keyof typeof inventory])&&inventory[k as keyof typeof inventory]>=0))return fail('Invalid construction state');
 if(!command||!['place','rotate','dismantle','connect','disconnect'].includes(command.type))return fail('Unknown construction command');
 if(command.type==='place'||command.type==='rotate'){
  if(command.rotation!==undefined&&(!Number.isInteger(command.rotation)||command.rotation<0||command.rotation>3))return fail('Choose a quarter-turn rotation from 0 to 3');
  if(command.type==='place'&&command.id!==undefined&&!safeId(command.id))return fail('Invalid module ID');
  const existing=command.type==='rotate'?w.parts.find(m=>m.id===command.id):undefined;
  if(command.type==='rotate'&&!existing)return fail('No module to rotate');
  const legacyPad=command.type==='place'&&command.pad?PADS.find(p=>p.id===command.pad):undefined;
  if(command.type==='place'&&command.pad&&(!legacyPad||command.kind!==legacyPad.kind||command.x!==legacyPad.x||command.z!==legacyPad.z))return fail('Choose a matching sample foundation or a free grid cell');
  let id=existing?.id??(command.type==='place'?(command.id??command.pad):'');
  if(!id){let n=1;while(w.parts.some(m=>m.id===`module-${n}`))n++;id=`module-${n}`;}
  const candidate:Module=existing?{...existing,rotation:command.rotation!}:{id,kind:(command as Extract<BuildCommand,{type:'place'}>).kind,x:(command as Extract<BuildCommand,{type:'place'}>).x,z:(command as Extract<BuildCommand,{type:'place'}>).z,rotation:command.rotation??0};
  if(!moduleOK(candidate))return fail('Use a clear snapped cell: pump on the east bank, outlet on the west side');
  if(Math.hypot(player.x-candidate.x,player.z-candidate.z)>12)return fail('Move within 12 m of this module');
  if(existing?.rotation===candidate.rotation)return fail('Module already faces that direction');
  if(!existing&&w.parts.some(m=>m.id===id))return fail('Module ID is already in use');
  const others=w.parts.filter(m=>m!==existing);
  if(others.length>=MAX_MODULES)return fail(`The yard supports at most ${MAX_MODULES} modules`);
  if(others.filter(m=>m.kind===candidate.kind).length>=PART_DEFS[candidate.kind].maxCount)return fail('This yard supports one pump, one reservoir and one outlet');
  if(others.some(m=>m.x===candidate.x&&m.z===candidate.z)||moduleObstacles(candidate).some(s=>others.some(m=>moduleObstacles(m).some(o=>overlaps(s,o)))))return fail('That cell or footprint is occupied');
  if(moduleObstacles(candidate).some(o=>Math.hypot(Math.max(0,Math.abs(player.x-o.x)-o.hx),Math.max(0,Math.abs(player.z-o.z)-o.hz))<.5))return fail('Step off the footprint before building or rotating');
  const cost=COSTS[candidate.kind];
  if(!existing&&(inventory.scrap<cost.scrap||inventory.core<cost.core))return fail('Recover more salvage or dismantle another module');
  const machine={...w,parts:existing?w.parts.map(m=>m===existing?candidate:m):[...w.parts,candidate],links:existing?w.links.filter(l=>!l.split('>').some(p=>p.split('.')[0]===existing.id)):w.links};
  const plan=compileWaterworks(machine);if(!plan.valid)return fail(plan.constraints.find(c=>!c.ok)?.message??'The semantic plan is invalid');
  return {machine,inventory:existing?inventory:{...inventory,scrap:inventory.scrap-cost.scrap,core:inventory.core-cost.core},reason:existing?'Module rotated; reconnect its sockets':`${PART_DEFS[candidate.kind].label} installed. Connect its sockets to carry water.`};
 }
 if(command.type==='dismantle'){
  const id=command.id??command.pad,m=w.parts.find(m=>m.id===id);if(!m)return fail('No module to dismantle');
  if(Math.hypot(player.x-m.x,player.z-m.z)>12)return fail('Move within 12 m of this module');
  const c=COSTS[m.kind],drain=m.kind==='reservoir'?w.stored:0;
  return {machine:{...w,parts:w.parts.filter(p=>p!==m),links:w.links.filter(l=>!l.split('>').some(p=>p.split('.')[0]===id)),stored:w.stored-drain,drained:w.drained+drain},inventory:{...inventory,scrap:inventory.scrap+c.scrap,core:inventory.core+c.core},reason:`${PART_DEFS[m.kind].label} dismantled; materials refunded${drain?' and stored water drained':''}`};
 }
 if(typeof command.link!=='string')return fail('Sockets do not mate');
 const link=canonicalLink(command.link),edge=linkEndpoints(w,link);if(!edge)return fail('Install adjacent, matching output and input sockets first');
 if(Math.min(Math.hypot(player.x-edge.from.module.x,player.z-edge.from.module.z),Math.hypot(player.x-edge.to.module.x,player.z-edge.to.module.z))>12)return fail('Move within 12 m of these sockets');
 if(command.type==='connect'){
  if(w.links.includes(link))return fail('Sockets already connected');
  const machine={...w,links:[...w.links,link]};if(!graphOK(machine))return fail('A socket can have one join; directed cycles are not allowed');
  return {machine,inventory,reason:'Fluid sockets connected'};
 }
 if(!w.links.includes(link))return fail('Already disconnected');
 return {machine:{...w,links:w.links.filter(l=>l!==link)},inventory,reason:'Fluid sockets disconnected'};
}
export function flow(w:Waterworks,dt:number):Waterworks{
 if(!Number.isFinite(dt)||dt<=0||!validMachine(w))return w;dt=Math.min(dt,1);
 const available=inletWorking(w)?2*dt:0;
 const outletConnected=reachable(w,w.parts.find(m=>m.kind==='reservoir'),w.parts.find(m=>m.kind==='outlet'));
 const outgoing=outletConnected?Math.min(dt,w.stored+available):0;
 const incoming=Math.min(available,capacity(w)-w.stored+outgoing);
 if(!incoming&&!outgoing)return w;
 return {...w,stored:Math.max(0,Math.min(capacity(w),w.stored+incoming-outgoing)),extracted:w.extracted+incoming,delivered:w.delivered+outgoing};
}
function ledgerOK(w:Pick<Waterworks,'stored'|'extracted'|'delivered'|'drained'>){return ['stored','extracted','delivered','drained'].every(k=>{const n=w[k as keyof typeof w];return Number.isFinite(n)&&n>=0&&n<=1e9;})&&Math.abs(w.extracted-w.delivered-w.drained-w.stored)<1e-5;}
export function validMachine(value:unknown):value is Waterworks{
 if(!value||typeof value!=='object')return false;const w=value as Waterworks;
 if(!Array.isArray(w.parts)||w.parts.length>MAX_MODULES||!Array.from(w.parts).every(moduleOK)||new Set(w.parts.map(m=>m.id)).size!==w.parts.length)return false;
 if(Object.entries(PART_DEFS).some(([kind,def])=>w.parts.filter(m=>m.kind===kind).length>def.maxCount))return false;
 for(let i=0;i<w.parts.length;i++)for(let j=i+1;j<w.parts.length;j++){const a=w.parts[i]!,b=w.parts[j]!;if(a.x===b.x&&a.z===b.z||moduleObstacles(a).some(s=>moduleObstacles(b).some(t=>overlaps(s,t))))return false;}
 return graphOK(w)&&ledgerOK(w)&&w.stored<=capacity(w);
}
export function validLegacyMachine(value:unknown):value is LegacyWaterworks {
 if(!value||typeof value!=='object')return false;const w=value as LegacyWaterworks;
 return Array.isArray(w.parts)&&w.parts.length<=4&&new Set(w.parts).size===w.parts.length&&Array.from(w.parts).every(id=>PADS.some(p=>p.id===id))
  &&Array.isArray(w.links)&&w.links.length<=3&&new Set(w.links).size===w.links.length&&w.links.every(l=>(LINKS as readonly string[]).includes(l)&&l.split(':').every(p=>w.parts.includes(p as PadId)))
  &&ledgerOK(w)&&w.stored<=20&&(w.parts.includes('tank')||w.stored===0);
}
export function migrateLegacyMachine(value:unknown):Waterworks|null {
 if(!validLegacyMachine(value))return null;
 const next={...value,parts:value.parts.map(id=>{const p=PADS.find(p=>p.id===id)!;return {id:p.id,kind:p.kind,x:p.x,z:p.z,rotation:0 as const};}),links:value.links.map(canonicalLink)};
 return validMachine(next)?next:null;
}
