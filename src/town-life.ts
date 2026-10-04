/** Implemented contract for src/town-life.ts. IDs and pose coordinates remain authoritative. */
import {townResidents,townResidentRoutinePhase,type TownResident,type TownResidentPose} from './town-residents.ts';
import {seedSample} from './procedural.ts';
import {startingTown,TOWN_CENTER,type TownPlan} from './starting-town.ts';
import {townPathClear} from './town-crowd.ts';
import {advanceTownNavigation,townLifeTaskPoint,townLifeTaskStages,townLifeDeparturePoint,townNavigationClear,townNavigationWorkClear,townNavigationDetour,townLifeWorkArea,TOWN_NAV_STEP,type TownLifeNavigation,type TownNavigationActor} from './town-navigation.ts';
export type TownLifeNeed = 'nourishment'|'energy'|'hygiene'|'comfort'|'connection'|'fulfillment';
export type TownLifeActionKind = 'eat'|'rest'|'wash'|'socialize'|'leisure'|'garden'|'draw-water'|'cook'|'craft'|'maintain'|'recover';
export type TownLifeFacilityKind = 'home'|'cookshop'|'inn'|'apothecary'|'workshop'|'garden'|'well'|'square';
export type TownLifeDesireKind = 'share-company'|'practice-craft'|'tend-garden'|'help-town'|'settle-in';
export interface TownLifeFacility {id:string;label:string;kind:TownLifeFacilityKind;x:number;z:number;roadZ:number;capacity:number;homeIndex:number|null;actions:readonly TownLifeActionKind[]}
export interface TownLifeTuning {needRate:number;actionSpeed:number;walkSpeed:number;socialWeight:number;desireWeight:number;productionRate:number}
export interface TownLifeResidentState {id:string;index:number;homeIndex:number;householdId:string;needs:Record<TownLifeNeed,number>;traits:Record<TownLifeNeed,number>;stress:number;mood:'content'|'steady'|'strained'|'distressed';desire:{kind:TownLifeDesireKind;progress:number;completed:number};relationships:{residentId:string;affinity:number;shared:number}[];action:TownLifeActionKind|null;status:'idle'|'queued'|'traveling'|'acting';facilityId:string|null;slot:number;remaining:number;batch:number;committed:number;waited:number;lease:number;path:{x:number;z:number}[];pathIndex:number;x:number;z:number;facing:number;distance:number;speed:number;lastAction:TownLifeActionKind|null;completed:number;interruptions:number;unmetSeconds:number;encouragementCooldown:number;reason:string}
export interface TownLifeFacilityState {id:string;condition:number;closedFor:number;queue:number[];reservations:number[];occupants:number[];served:number;canceled:number}
export type TownLifeResource='pantry'|'water'|'materials'|'harvest';
export interface TownLifeSources {field:number;aquifer:number;salvage:number}
export interface TownLifeState {seed:number;version:1;navigation?:TownLifeNavigation;revision:number;tick:number;cycleTick:number;accumulator:number;residents:TownLifeResidentState[];facilities:TownLifeFacilityState[];resources:Record<TownLifeResource,number>;sources:TownLifeSources;sourceLedger:{epochs:number;initial:TownLifeSources;recharged:TownLifeSources;extracted:TownLifeSources;overflow:TownLifeSources};ledger:{epochs:number;donationBaseline:Record<TownLifeResource,number>;initial:Record<TownLifeResource,number>;produced:Record<TownLifeResource,number>;consumed:Record<TownLifeResource,number>;donated:Record<TownLifeResource,number>;overflow:Record<TownLifeResource,number>};cooldowns:{donate:number;repair:number;gather:number};gathering:number;contributions:Record<TownLifeCommand['kind'],number>;playerSpent:{scrap:number;core:number;water:number};events:{tick:number;residentId:string|null;kind:'completed'|'interrupted'|'shortage'|'aid'|'desire';text:string}[]}
export type TownLifeCommand = {kind:'donate-water'|'donate-supplies'|'repair-service'|'host-gathering'|'encourage-resident';targetId:string;expectedRevision:number};
export interface TownLifeSummary {name:string;activity:string;reason:string;mood:string;needs:{key:TownLifeNeed;value:number;label:string}[];desire:string;relationships:string[];diagnostics:string[];facility:string;progress:number}

/** The simulation is deliberately independent of regional food/weather clocks.
 * 0.5-second fixed steps; at most 120 steps per call. Counters cap at 1e9,
 * except command revision and contribution costs which reject at their bound.
 * Resources are town-local abstract portions, never campaign inventory units.
 */
export const TOWN_LIFE_STEP=.5;
/** Route/presentation revision; existing version-1 saves keep their needs and reservations. */
export const TOWN_LIFE_MOTION_VERSION=5;
export const TOWN_LIFE_OPENING_VERSION=1;
export const TOWN_LIFE_SERVICE_THRESHOLD=15;
export const TOWN_LIFE_REPAIR_THRESHOLD=60;
export const TOWN_LIFE_COUNTER_LIMIT=1_000_000_000;
export const TOWN_LIFE_NEEDS=Object.freeze(['nourishment','energy','hygiene','comfort','connection','fulfillment'] as const);
const ACTIONS=Object.freeze(['eat','rest','wash','socialize','leisure','garden','draw-water','cook','craft','maintain','recover'] as const);
const DESIRES=Object.freeze(['share-company','practice-craft','tend-garden','help-town','settle-in'] as const);
const RESOURCES=Object.freeze(['pantry','water','materials','harvest'] as const);
const COMMANDS=Object.freeze(['donate-water','donate-supplies','repair-service','host-gathering','encourage-resident'] as const);
const EVENT_KINDS=Object.freeze(['completed','interrupted','shortage','aid','desire'] as const);
export const TOWN_LIFE_DEFAULTS:Readonly<TownLifeTuning>=Object.freeze({needRate:1,actionSpeed:1,walkSpeed:1,socialWeight:1,desireWeight:1,productionRate:1});
export const TOWN_LIFE_TUNING_REGISTRY=Object.freeze([
 {key:'needRate',label:'Need decay',min:.25,max:2,default:1,step:.05,unit:'×',description:'Per-step depletion of all six needs. High values deliberately create pressure.',timing:'apply'},
 {key:'actionSpeed',label:'Action pace',min:.5,max:2,default:1,step:.05,unit:'×',description:'Elapsed work and need recovery per occupied station; input costs remain unchanged.',timing:'apply'},
 {key:'walkSpeed',label:'Walking pace',min:.5,max:2,default:1,step:.05,unit:'×',description:'Actual road movement and reservation lease estimates; no position jumps.',timing:'apply'},
 {key:'socialWeight',label:'Company priority',min:0,max:2,default:1,step:.05,unit:'×',description:'Company utility and affinity preference when selecting a real gathering.',timing:'apply'},
 {key:'desireWeight',label:'Personal ambition',min:0,max:2,default:1,step:.05,unit:'×',description:'Priority of activities that advance the resident’s active personal desire.',timing:'apply'},
 {key:'productionRate',label:'Labor yield',min:.5,max:2,default:1,step:.05,unit:'×',description:'Bounded output AND input batches for completed production, constrained by finite sources.',timing:'apply'},
] as const);
export const TOWN_LIFE_TUNING_FIELDS=TOWN_LIFE_TUNING_REGISTRY;
export const TOWN_LIFE_SCENARIOS=Object.freeze([
 {id:'balanced',label:'A living morning',description:'All 100 residents and 40 homes with provisioned local stores.'},
 {id:'lean-stores',label:'Lean stores',description:'Low pantry, water and materials. Observe labor and recovery from finite sources.'},
 {id:'service-outage',label:'Cookshop interruption',description:'The cookshop starts unavailable; household meals remain possible and maintenance can repair it.'},
 {id:'social-strain',label:'Neighbors need company',description:'Connection and stress start under pressure; meetings and player encouragement can help.'},
 {id:'urgent-needs',label:'Immediate care',description:'Selected resident starts hungry, tired and unwashed; urgent needs override the timetable.'},
 {id:'overwork',label:'After a difficult shift',description:'Low energy, comfort and fulfillment plus high stress force a recovery tradeoff.'},
]);
const CAPS:Record<TownLifeResource,number>={pantry:1200,water:1200,materials:600,harvest:1000};
const INITIAL:Record<TownLifeResource,number>={pantry:420,water:420,materials:120,harvest:220};
const SOURCE_KEYS=["field","aquifer","salvage"] as const;
const SOURCE_CAPS={field:800,aquifer:1200,salvage:600};
const DECAY:Record<TownLifeNeed,number>={nourishment:.072,energy:.063,hygiene:.052,comfort:.045,connection:.055,fulfillment:.048};
const DURATION:Record<TownLifeActionKind,number>={eat:14,rest:30,wash:18,socialize:24,leisure:22,garden:24,'draw-water':20,cook:24,craft:26,maintain:22,recover:24};
const RECOVERY:Record<TownLifeActionKind,Partial<Record<TownLifeNeed,number>>>={eat:{nourishment:76,comfort:10},rest:{energy:82,comfort:30},wash:{hygiene:86,comfort:14},socialize:{connection:76,fulfillment:12},leisure:{comfort:65,fulfillment:53,energy:12},garden:{fulfillment:57,comfort:10},'draw-water':{fulfillment:45},cook:{fulfillment:50,connection:10},craft:{fulfillment:64},maintain:{fulfillment:65},recover:{energy:45,hygiene:35,comfort:74}};
const LABELS:Record<TownLifeActionKind,string>={eat:'Eating a meal',rest:'Resting',wash:'Washing',socialize:'Spending time with neighbors',leisure:'Enjoying a personal interest',garden:'Tending and harvesting', 'draw-water':'Drawing town water',cook:'Cooking shared meals',craft:'Recovering useful materials',maintain:'Maintaining a public service',recover:'Receiving restorative care'};
const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));
const count=(n:number,add=1)=>Math.min(TOWN_LIFE_COUNTER_LIMIT,n+add);
const quant=(n:number)=>Math.round(n*1e8)/1e8;
const zeroSources=():TownLifeSources=>({field:0,aquifer:0,salvage:0});
const trustedStates=new WeakSet<TownLifeState>();
function sealState(s:TownLifeState){freeze(s);trustedStates.add(s);return s;}
const facilityCache=new WeakMap<TownPlan,readonly TownLifeFacility[]>();
const zero=():Record<TownLifeResource,number>=>({pantry:0,water:0,materials:0,harvest:0});
function freeze<T>(v:T):T{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
function traitsFor(r:TownResident):Record<TownLifeNeed,number>{return Object.fromEntries(TOWN_LIFE_NEEDS.map((k,i)=>[k,.8+((r.index*17+i*23+r.personality.length*7)%11)*.045])) as Record<TownLifeNeed,number>;}
const homeId=(n:number)=>`home-${n}`;
/** Open-air household and public stations use the existing streets/forecourts,
 * not invisible interiors. Public capacity is backed by distinct service slots. */
export function townLifeFacilities(seed:number):readonly TownLifeFacility[]{
 const plan=startingTown(seed),cached=facilityCache.get(plan);if(cached)return cached;const roster=townResidents(seed),out:TownLifeFacility[]=plan.homes.map((h,i)=>({id:homeId(i),label:h.name,kind:'home',x:h.entry.x,z:h.entry.z+Math.sign(h.entry.z-plan.center.z)*1.3,roadZ:h.entry.z,capacity:roster.filter(r=>r.homeIndex===i).length,homeIndex:i,actions:['eat','rest','wash','leisure','socialize','cook']}));
 const add=(id:string,label:string,kind:TownLifeFacilityKind,x:number,z:number,capacity:number,actions:TownLifeActionKind[],roadZ=plan.center.z)=>out.push({id,label,kind,x,z,roadZ,capacity,homeIndex:null,actions});
 const shop=(index:number,id:string,kind:TownLifeFacilityKind,capacity:number,actions:TownLifeActionKind[])=>{const b=plan.shops[index]!;add(id,b.name,kind,b.entry.x,b.entry.z+2.2,capacity,actions);};
 shop(3,'cookshop','cookshop',12,['eat','cook']);shop(4,'inn','inn',14,['rest','leisure','socialize']);shop(5,'apothecary','apothecary',8,['recover','wash']);shop(2,'workshop','workshop',14,['craft','maintain']);
 add('garden-west','West shared garden','garden',plan.center.x-30,plan.center.z+13,12,['garden','leisure','socialize']);
 add('garden-east','East shared garden','garden',plan.center.x+30,plan.center.z+13,12,['garden','leisure','socialize']);
 add('well','Town water station','well',plan.center.x+48,plan.center.z+13,10,['draw-water','wash']);
 // Public repair coordination remains reachable when the workshop itself is
 // unavailable; otherwise a workshop outage locks out its own only remedy.
 add('square','Hearthmere meeting square','square',plan.center.x,plan.center.z+10,24,['socialize','leisure','maintain']);
 const result=freeze(out);facilityCache.set(plan,result);return result;
}
function legacySlotPoint(f:TownLifeFacility,slot:number){if(f.kind==='home')return {x:f.x+(slot-(f.capacity-1)/2)*.72,z:f.z};const width=f.kind==='square'?8:5;return {x:f.x+((slot%width)-(Math.min(width,f.capacity)-1)/2)*.74,z:f.z+Math.floor(slot/width)*.74};}
function event(s:TownLifeState,kind:TownLifeState['events'][number]['kind'],text:string,residentId:string|null=null){s.events.push({tick:s.tick,residentId,kind,text});if(s.events.length>32)s.events.shift();}
/** Cold model fixture: no decisions or clock advance. Production uses createTownLifeOpening. */
export function createTownLife(seed:number):TownLifeState{
 const roster=townResidents(seed),fs=townLifeFacilities(seed);
 const residents=roster.map(r=>{const f=fs[r.homeIndex]!,slot=roster.filter(q=>q.homeIndex===r.homeIndex&&q.index<r.index).length,p=legacySlotPoint(f,slot);
 return {id:r.id,index:r.index,homeIndex:r.homeIndex,householdId:r.householdId,needs:Object.fromEntries(TOWN_LIFE_NEEDS.map((k,i)=>[k,60+(r.index*7+i*13)%31])) as Record<TownLifeNeed,number>,traits:traitsFor(r),stress:12+(r.index%12),mood:'content' as const,desire:{kind:DESIRES[r.index%DESIRES.length]!,progress:0,completed:0},relationships:r.housemateIds.map(id=>({residentId:id,affinity:55,shared:0})),action:null,status:'idle' as const,facilityId:null,slot:-1,remaining:0,batch:1,committed:0,waited:0,lease:0,path:[],pathIndex:0,...p,facing:0,distance:0,speed:0,lastAction:null,completed:0,interruptions:0,unmetSeconds:0,encouragementCooldown:0,reason:'Choosing how to begin the day.'} satisfies TownLifeResidentState;});
 for(const r of residents)updateMood(r);return sealState({seed,version:1,revision:0,tick:0,cycleTick:0,accumulator:0,residents,facilities:fs.map(f=>({id:f.id,condition:100,closedFor:0,queue:[],reservations:[],occupants:[],served:0,canceled:0})),resources:{...INITIAL},sources:{field:600,aquifer:1000,salvage:400},sourceLedger:{epochs:0,initial:{field:600,aquifer:1000,salvage:400},recharged:zeroSources(),extracted:zeroSources(),overflow:zeroSources()},ledger:{epochs:0,donationBaseline:zero(),initial:{...INITIAL},produced:zero(),consumed:zero(),donated:zero(),overflow:zero()},cooldowns:{donate:0,repair:0,gather:0},gathering:0,contributions:{'donate-water':0,'donate-supplies':0,'repair-service':0,'host-gathering':0,'encourage-resident':0},playerSpent:{scrap:0,core:0,water:0},events:[]});
}
/** Each resident keeps their real six-phase timetable, with an independent active-day
 * starting phase. Shared households no longer force 100 simultaneous breakfasts.
 * This is a deterministic preference, never an additional simulation clock. */
export function townLifePhaseOffset(resident:TownResident){return (resident.phaseOffset+(resident.index*137)%480)%480;}
export function townLifeRoutinePhase(resident:TownResident,seconds:number){
 return townResidentRoutinePhase(resident,seconds+(resident.index*137)%480);
}
const openingSample=(seed:number,purpose:string,index:number)=>seedSample(seed,TOWN_LIFE_OPENING_VERSION,'town-life-opening','resident',purpose,index);
/** A new town is already inhabited. Select real goals and reserve real slots at
 * tick zero, then generate a spread of initial route/action phases. No warmup
 * ticks, completed work, produced resources, needs recovery or offline catchup.
 * Already-present saves NEVER pass through this constructor. */
export function createTownLifeOpening(seed:number):TownLifeState{
 const s=structuredClone(createTownLife(seed)),fs=townLifeFacilities(seed),plan=startingTown(seed);initializeNavigation(s,fs,plan,TOWN_LIFE_DEFAULTS);
 for(const r of s.residents){
  for(const k of TOWN_LIFE_NEEDS)r.needs[k]=58+openingSample(seed,'need-'+k,r.index)*34;
  updateMood(r);
 }
 for(const r of s.residents)choose(s,r,fs,TOWN_LIFE_DEFAULTS);
 acquire(s,fs,plan,TOWN_LIFE_DEFAULTS);
 for(const r of s.residents){
  if(r.status==='traveling'){
   const total=r.path.reduce((n,p,i)=>n+Math.hypot(p.x-(i?r.path[i-1]!.x:r.x),p.z-(i?r.path[i-1]!.z:r.z)),0);
   const atService=openingSample(seed,'arrival',r.index)>.62||total<5;
   let remaining=atService?total:Math.max(0,total-(6+openingSample(seed,'remaining-route',r.index)*Math.min(38,Math.max(0,total-6))));
   for(let n=0;n<6&&r.pathIndex<r.path.length&&remaining>1e-8;n++){
    const p=r.path[r.pathIndex]!,dx=p.x-r.x,dz=p.z-r.z,d=Math.hypot(dx,dz),move=Math.min(d,remaining);
    if(d>1e-8){r.x+=dx/d*move;r.z+=dz/d*move;r.facing=Math.atan2(dx,dz);remaining-=move;}
    if(move>=d-1e-8){r.x=p.x;r.z=p.z;r.pathIndex++;}else break;
   }
   if(r.pathIndex>=r.path.length)begin(s,r,TOWN_LIFE_DEFAULTS);
   else {const p=r.path[r.pathIndex]!;r.facing=Math.atan2(p.x-r.x,p.z-r.z);r.speed=1.8;}
  }
  if(r.status==='acting'){
   r.remaining=Math.max(5,r.remaining*(.25+openingSample(seed,'action-phase',r.index)*.75));
   r.committed=Math.min(r.committed,r.remaining);
   r.facing=fs.find(f=>f.id===r.facilityId)!.kind==='home'?0:Math.PI;
  }
 }
 // Seed a new opening only on collision-clear points of each real route. The
 // already-paid occupied workers keep their distinct work places; travelers
 // choose another deterministic phase if their first phase crosses a neighbor.
 const placed=s.residents.filter(r=>r.status==='acting'),cold=createTownLife(seed);
 for(const r of s.residents.filter(r=>r.status==='traveling')){
  const clear=(p:{x:number;z:number})=>placed.every(q=>Math.hypot(q.x-p.x,q.z-p.z)>=.72);
  if(!clear(r)){
   const origin=cold.residents[r.index]!,points=[{x:origin.x,z:origin.z},...r.path],lengths=r.path.map((q,i)=>Math.hypot(q.x-points[i]!.x,q.z-points[i]!.z)),total=lengths.reduce((n,d)=>n+d,0);
   for(let attempt=0;attempt<100;attempt++){
    let distance=((openingSample(seed,'clear-route-phase',r.index)+attempt*.61803398875)%1)*Math.max(0,total-.2),leg=0;
    while(leg<lengths.length-1&&distance>=lengths[leg]!){distance-=lengths[leg]!;leg++;}
    const a=points[leg]!,b=points[leg+1]!,fraction=lengths[leg]!>0?distance/lengths[leg]!:0,candidate={x:a.x+(b.x-a.x)*fraction,z:a.z+(b.z-a.z)*fraction};
    if(!clear(candidate))continue;r.x=candidate.x;r.z=candidate.z;r.pathIndex=leg;r.facing=Math.atan2(b.x-r.x,b.z-r.z);break;
   }
  }
  placed.push(r);
 }
 for(const r of s.residents){const n=s.navigation!.residents[r.index]!;n.trace=[r.x,r.z,0,r.x,r.z,10];}
 s.navigation!.resolved=s.residents.every((r,i)=>s.residents.every((q,j)=>i===j||Math.hypot(r.x-q.x,r.z-q.z)>=.6));
 return sealState(s);
}
function updateMood(r:TownLifeResidentState){const low=Math.min(...TOWN_LIFE_NEEDS.map(k=>r.needs[k]));r.mood=r.stress>75||low<12?'distressed':r.stress>45||low<28?'strained':r.stress<20&&low>48?'content':'steady';}
function desired(kind:TownLifeDesireKind,action:TownLifeActionKind){return kind==='share-company'?action==='socialize':kind==='practice-craft'?action==='craft'||action==='leisure':kind==='tend-garden'?action==='garden':kind==='help-town'?['cook','draw-water','maintain'].includes(action):['rest','wash','eat'].includes(action);}
function available(f:TownLifeFacilityState){return f.closedFor<=0&&f.condition>=TOWN_LIFE_SERVICE_THRESHOLD;}
function costs(action:TownLifeActionKind,t:TownLifeTuning):Partial<Record<TownLifeResource,number>>{
 switch(action){case'eat':return{pantry:1,water:.2};case'wash':return{water:.65};case'garden':return{water:.35*t.productionRate};case'cook':return{harvest:4*t.productionRate,water:.8*t.productionRate};case'maintain':return{materials:1.5};case'recover':return{materials:.5,water:.4};default:return{};}
}
function inputsReady(s:TownLifeState,a:TownLifeActionKind,t:TownLifeTuning){if(a==='garden'&&s.sources.field<8*t.productionRate||a==='draw-water'&&s.sources.aquifer<12*t.productionRate||a==='craft'&&s.sources.salvage<4*t.productionRate)return false;return Object.entries(costs(a,t)).every(([k,n])=>s.resources[k as TownLifeResource]+1e-8>=n);}
function contributed(s:TownLifeState):Record<TownLifeResource,number>{return {pantry:0,water:s.contributions['donate-water']*12,materials:s.contributions['donate-supplies']*12,harvest:0};}
function ledgerRoom(s:TownLifeState){if(RESOURCES.some(k=>['produced','consumed','donated','overflow'].some(c=>s.ledger[c as 'produced'][k]>TOWN_LIFE_COUNTER_LIMIT-100))){s.ledger={epochs:count(s.ledger.epochs),donationBaseline:contributed(s),initial:{...s.resources},produced:zero(),consumed:zero(),donated:zero(),overflow:zero()};}}
function debit(s:TownLifeState,k:TownLifeResource,n:number){ledgerRoom(s);s.resources[k]=quant(s.resources[k]-n);s.ledger.consumed[k]=quant(s.ledger.consumed[k]+n);}
function credit(s:TownLifeState,k:TownLifeResource,n:number,kind:'produced'|'donated'='produced'){ledgerRoom(s);const add=Math.min(n,CAPS[k]-s.resources[k]);s.resources[k]=quant(s.resources[k]+add);s.ledger[kind][k]=quant(count(s.ledger[kind][k],n));s.ledger.overflow[k]=quant(count(s.ledger.overflow[k],n-add));}
function resetAction(r:TownLifeResidentState){r.action=null;r.status='idle';r.facilityId=null;r.slot=-1;r.remaining=0;r.batch=1;r.committed=0;r.waited=0;r.lease=0;r.path=[];r.pathIndex=0;r.speed=0;}
function departurePoint(s:TownLifeState,r:TownLifeResidentState,f:TownLifeFacility){
 const plan=startingTown(s.seed),direction=Math.atan2(0,f.roadZ-r.z||-1),areas=townLifeFacilities(s.seed).map(townLifeWorkArea),reserved=s.residents.filter(q=>q.index!==r.index&&q.action&&q.slot>=0).map(q=>{const d=townLifeFacilities(s.seed).find(f=>f.id===q.facilityId)!;return townLifeTaskPoint(d,q.slot,q.action!,Math.max(0,s.navigation?.residents[q.index]?.stage??0));});
 for(const radius of [1.8,2.6,3.4,4.2,5.2,6.5,8])for(let turn=0;turn<16;turn++){
  const angle=direction+(turn%2?-1:1)*Math.ceil(turn/2)*Math.PI/8,p={x:quant(r.x+Math.sin(angle)*radius),z:quant(r.z+Math.cos(angle)*radius)};
  if(areas.some(a=>p.x>a.minX-.75&&p.x<a.maxX+.75&&p.z>a.minZ-.75&&p.z<a.maxZ+.75)||!townNavigationClear(plan,r,p)||s.residents.some(q=>q.index!==r.index&&Math.hypot(q.x-p.x,q.z-p.z)<1.5)||reserved.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<1.4)||s.navigation?.residents.some((n,i)=>i!==r.index&&n.departure&&Math.hypot(n.departure.x-p.x,n.departure.z-p.z)<1.5))continue;
  return p;
 }
 return townLifeDeparturePoint(f,r);
}
function cancel(s:TownLifeState,r:TownLifeResidentState,why:string){const descriptor=townLifeFacilities(s.seed).find(f=>f.id===r.facilityId);if(s.navigation){const n=s.navigation.residents[r.index]!;n.stage=0;n.detour=null;if(descriptor)n.departure=departurePoint(s,r,descriptor);}const f=s.facilities.find(f=>f.id===r.facilityId);if(f){f.queue=f.queue.filter(i=>i!==r.index);f.reservations=f.reservations.filter(i=>i!==r.index);f.occupants=f.occupants.filter(i=>i!==r.index);f.canceled=count(f.canceled);}r.interruptions=count(r.interruptions);event(s,'interrupted',`${townResidents(s.seed)[r.index]!.name}: ${why}`,r.id);resetAction(r);r.reason=why;}
/** Shortest of a fixed set of safe Manhattan road routes. The northern market
 * building forbids the central trunk. Mid-route replanning starts at actual x/z.
 * All candidates are bounded (5 roads × 3 trunks × at most 5 waypoints). */
function route(plan:TownPlan,from:{x:number;z:number},to:{x:number;z:number},roadZ:number):{x:number;z:number}[]|null{
 // An activity at the current slot needs no journey. Nearby slots in the same
 // clear forecourt do not require a spurious trip out to the road and back.
 const direct=Math.hypot(to.x-from.x,to.z-from.z);
 if(direct<1e-7)return [];
 if(direct<=4&&townPathClear(plan,from,to,.56))return [{...to}];
 let best:{x:number;z:number}[]|null=null,bestLength=Infinity;
 const roads=[-44,-24,0,24,44].map(z=>plan.center.z+z);
 for(const startZ of roads){const anchor={x:from.x,z:startZ};if(!townPathClear(plan,from,anchor,.56))continue;
  for(const trunk of [plan.center.x-49.3,plan.center.x+.1,plan.center.x+49.3]){
   if(trunk===plan.center.x+.1&&Math.min(startZ,roadZ)<plan.center.z&&Math.abs(startZ-roadZ)>.01)continue;
   const candidates=Math.abs(startZ-roadZ)<.01?[anchor,{x:to.x,z:roadZ},to]:[anchor,{x:trunk,z:startZ},{x:trunk,z:roadZ},{x:to.x,z:roadZ},to];
   let p=from,length=0;const path:{x:number;z:number}[]=[];for(const q of candidates){const d=Math.hypot(q.x-p.x,q.z-p.z);if(d<1e-7)continue;length+=d;path.push({...q});p=q;}
   if(length>=bestLength)continue;if(path.some((q,i)=>!townPathClear(plan,i?path[i-1]!:from,q,.56)))continue;bestLength=length;best=path;
  }
 }
 return best;
}
function roadEstimate(r:TownLifeResidentState,f:TownLifeFacility){const north=Math.min(r.z,f.z)<TOWN_CENTER.z-4&&Math.abs(r.z-f.z)>10;return Math.abs(r.x-f.x)+Math.abs(r.z-f.z)+(north?Math.max(0,45-Math.abs(r.x-TOWN_CENTER.x))*.8:0);}
function rolePrefers(r:TownResident,a:TownLifeActionKind){if(['cook','baker','innkeeper','provisioner'].includes(r.role))return a==='cook';if(['gardener','orchard tender'].includes(r.role))return a==='garden';if(['waterworks assistant','courier','market porter'].includes(r.role))return a==='draw-water';if(['repairer','mason','lamplighter','apothecary','surveyor'].includes(r.role))return a==='maintain';return a==='craft';}
function actionUtility(s:TownLifeState,r:TownLifeResidentState,a:TownLifeActionKind,f:TownLifeFacility,t:TownLifeTuning){
 const gains=RECOVERY[a];let score=urgentAction(r)===a?10000:0;for(const k of TOWN_LIFE_NEEDS){const gain=gains[k]??0;if(gain){const deficit=100-r.needs[k];score+=deficit*r.traits[k]*Math.min(1,gain/65)*(k==='connection'?t.socialWeight:1);if(r.needs[k]<22&&['nourishment','energy','hygiene'].includes(k))score+=220+(22-r.needs[k])*12;}}
 const identity=townResidents(s.seed)[r.index]!,phase=townLifeRoutinePhase(identity,s.cycleTick*TOWN_LIFE_STEP);if(rolePrefers(identity,a))score+=phase.location==='work'?38:6;
 if(phase.location==='home'&&f.kind==='home')score+=12;if(phase.location==='square'&&f.kind!=='home'&&a==='socialize')score+=52*t.socialWeight;if(phase.location==='work'&&f.kind!=='home'&&['garden','draw-water','cook','craft','maintain'].includes(a))score+=42;
 // Once basic needs are satisfied, a useful shift/meeting beats repeated easy
 // home leisure. Critical needs retain their overriding utility above.
 if(phase.location!=='home'&&f.kind==='home'&&['leisure','rest','wash','eat'].includes(a)&&Math.min(r.needs.nourishment,r.needs.energy,r.needs.hygiene)>45)score-=24;
 if(desired(r.desire.kind,a))score+=(26+r.desire.progress*.22)*t.desireWeight;
 if(a==='rest'||a==='leisure'||a==='recover')score+=r.stress*.35;
 if(a==='garden')score+=clamp((180-s.resources.harvest)/2,0,90);if(a==='draw-water')score+=clamp((300-s.resources.water)/2,0,130);if(a==='cook')score+=clamp((280-s.resources.pantry)/2,0,130);if(a==='craft')score+=clamp((70-s.resources.materials),0,70);if(a==='maintain')score+=clamp((85-Math.min(...s.facilities.slice(40).map(f=>f.condition)))*2,0,130);
 if(a==='socialize'){const fstate=s.facilities.find(q=>q.id===f.id)!;const company=[...fstate.occupants,...fstate.reservations].filter(i=>i!==r.index);score+=Math.min(14,company.length*3)*t.socialWeight;const presentAffinities=r.relationships.filter(rel=>company.some(i=>s.residents[i]!.id===rel.residentId)).map(rel=>rel.affinity);if(presentAffinities.length)score+=(Math.max(...presentAffinities)*.16+Math.min(0,Math.min(...presentAffinities))*.12)*t.socialWeight;if(s.gathering>0&&f.kind==='square')score+=38*t.socialWeight;}
 if(a===r.lastAction)score-=14;
 const load=s.facilities.find(q=>q.id===f.id)!;const demand=load.queue.length+load.reservations.length+load.occupants.length;
 return score-roadEstimate(r,f)*.18-Math.max(0,demand-f.capacity*.65)*3+(r.index*11+ACTIONS.indexOf(a)*7)%9*.02;
}
function bestChoice(s:TownLifeState,r:TownLifeResidentState,fs:readonly TownLifeFacility[],t:TownLifeTuning){
 let best:{f:TownLifeFacility;a:TownLifeActionKind;score:number}|null=null;
 for(let fi=0;fi<fs.length;fi++){const f=fs[fi]!,state=s.facilities[fi]!;if(!available(state)||f.homeIndex!==null&&f.homeIndex!==r.homeIndex)continue;
  for(const a of f.actions){if(!inputsReady(s,a,t))continue;if(a==='socialize'&&f.kind==='home'&&![...state.occupants,...state.reservations,...state.queue].some(i=>i!==r.index))continue;
   if(a==='garden'&&s.resources.harvest>(r.desire.kind==='tend-garden'?980:700)||a==='draw-water'&&s.resources.water>900||a==='craft'&&s.resources.materials>300||a==='cook'&&s.resources.pantry>850||a==='maintain'&&s.facilities.slice(40).every(f=>f.condition>92))continue;
   const score=actionUtility(s,r,a,f,t);if(!best||score>best.score)best={f,a,score};
  }
 }
 return best;
}
function choose(s:TownLifeState,r:TownLifeResidentState,fs:readonly TownLifeFacility[],t:TownLifeTuning){
 const best=bestChoice(s,r,fs,t);
 if(!best){r.reason='No supplied service is available; waiting for town recovery.';return;}
 const f=s.facilities.find(f=>f.id===best.f.id)!;r.action=best.a;r.facilityId=f.id;r.status='queued';r.waited=0;r.reason=r.needs.nourishment<22&&best.a==='eat'?'An urgent need for a meal overrides today’s plans.':r.needs.energy<22&&best.a==='rest'?'Exhaustion takes priority over the timetable.':desired(r.desire.kind,best.a)?'Making time for a personal ambition.':best.a==='draw-water'&&s.resources.water<300?'The shared water store needs attention.':best.a==='cook'&&s.resources.pantry<280?'Preparing meals before the pantry runs low.':best.a==='socialize'?'Looking for company and familiar neighbors.':rolePrefers(townResidents(s.seed)[r.index]!,best.a)?`Using my ${townResidents(s.seed)[r.index]!.role} experience while balancing today’s needs.`:'Balancing current needs, travel and the daily timetable.';f.queue.push(r.index);
}
function urgentAction(r:TownLifeResidentState):TownLifeActionKind|null{if(r.needs.nourishment<14)return 'eat';if(r.needs.energy<12)return 'rest';if(r.needs.hygiene<10)return 'wash';return null;}
function urgentMismatch(r:TownLifeResidentState){const urgent=urgentAction(r);return urgent!==null&&r.action!==urgent&&(r.action!=='recover'||urgent==='eat');}
function initializeNavigation(s:TownLifeState,fs:readonly TownLifeFacility[],plan:TownPlan,t:TownLifeTuning){
 if(s.navigation)return;
 s.navigation={version:1,resolved:false,residents:s.residents.map(r=>({stage:r.status==='acting'?(r.remaining<=TOWN_LIFE_STEP?-1:townLifeTaskStages(r.action!)===1?0:Math.min(2,Math.floor((1-r.remaining/DURATION[r.action!])*3))):0,blocked:0,goal:null,best:200,departure:null,detour:null,trace:[r.x,r.z,0,r.x,r.z,10]}))};
 for(const r of s.residents)if(r.status==='queued'&&r.facilityId)s.navigation.residents[r.index]!.departure=departurePoint(s,r,fs.find(f=>f.id===r.facilityId)!);
 // Paid legacy actions move to equivalent spacious substages with their input
 // batch and remaining work intact. Physically clear near-completions may finish
 // at the old point. Unpaid travel is rerouted continuously to the spacious current destination.
 for(const r of s.residents)if(r.status==='traveling'){
  const f=fs.find(f=>f.id===r.facilityId)!,path=route(plan,r,townLifeTaskPoint(f,r.slot,r.action!),f.roadZ);
  if(path){r.path=path;r.pathIndex=0;r.lease=Math.max(r.lease,60);if(!path.length)begin(s,r,t);}else cancel(s,r,'The new work place needs another safe approach.');
 }
}
function acquire(s:TownLifeState,fs:readonly TownLifeFacility[],plan:TownPlan,t:TownLifeTuning){
 for(let fi=0;fi<fs.length;fi++){const state=s.facilities[fi]!,f=fs[fi]!;if(!available(state))continue;
  for(let tries=0;tries<100&&state.queue.length&&state.reservations.length+state.occupants.length<f.capacity;tries++){
   const index=state.queue[0]!,r=s.residents[index]!;
   if(!inputsReady(s,r.action!,t)){state.queue.shift();resetAction(r);r.reason='Required supplies ran out; choosing another useful activity.';continue;}
   const occupied=new Set([...state.reservations,...state.occupants].map(i=>s.residents[i]!.slot));
   let slot=-1,path:{x:number;z:number}[]|null=null;
   for(let candidateSlot=0;candidateSlot<f.capacity;candidateSlot++){
    const k=(candidateSlot+r.interruptions)%f.capacity;
    if(occupied.has(k))continue;const target=s.navigation?townLifeTaskPoint(f,k,r.action!):legacySlotPoint(f,k);
    // Logical vacancy never admits someone onto a former user's physical body.
    if(s.navigation&&s.residents.some(q=>q.index!==index&&Math.hypot(q.x-target.x,q.z-target.z)<.7))continue;
    const candidate=route(plan,r,target,f.roadZ);if(candidate){slot=k;path=candidate;break;}
   }
   if(slot<0||!path){r.reason='Waiting for a clear work place and a safe approach.';break;}
   state.queue.shift();r.slot=slot;r.path=path;r.pathIndex=0;r.status='traveling';
   if(s.navigation){const n=s.navigation.residents[index]!;n.stage=0;n.blocked=0;n.departure=null;n.detour=null;}
   let length=0,p={x:r.x,z:r.z};for(const q of path){length+=Math.hypot(q.x-p.x,q.z-p.z);p=q;}r.lease=Math.min(300,60+length/(1.35*t.walkSpeed));state.reservations.push(index);if(!path.length)begin(s,r,t);
  }
 }
}
function begin(s:TownLifeState,r:TownLifeResidentState,t:TownLifeTuning){
 const f=s.facilities.find(f=>f.id===r.facilityId)!,descriptor=townLifeFacilities(s.seed).find(q=>q.id===f.id)!,target=s.navigation?townLifeTaskPoint(descriptor,r.slot,r.action!):legacySlotPoint(descriptor,r.slot);
 // Path exhaustion is a bookkeeping event. Only the achieved body can arrive.
 if(Math.hypot(r.x-target.x,r.z-target.z)>1e-6)return;
 if(!inputsReady(s,r.action!,t)){cancel(s,r,'The required supply was used before arrival; seeking another option.');return;}
 for(const[k,n]of Object.entries(costs(r.action!,t)))debit(s,k as TownLifeResource,n);
 r.status='acting';r.batch=t.productionRate;r.remaining=DURATION[r.action!];r.committed=Math.min(8,r.remaining*.35);r.path=[];r.pathIndex=0;r.lease=0;r.speed=0;
 if(s.navigation){const n=s.navigation.residents[r.index]!;n.stage=0;n.blocked=0;n.departure=null;n.detour=null;}
 f.reservations=f.reservations.filter(i=>i!==r.index);f.occupants.push(r.index);
}
function bond(s:TownLifeState,a:TownLifeResidentState,b:TownLifeResidentState){for(const [r,other]of [[a,b],[b,a]]){if(!r||!other)continue;let rel=r.relationships.find(v=>v.residentId===other.id);if(!rel){if(r.relationships.length>=8){const family=townResidents(s.seed)[r.index]!.housemateIds;const removable=r.relationships.filter(v=>!family.includes(v.residentId)).sort((a,b)=>a.affinity-b.affinity||a.residentId.localeCompare(b.residentId))[0];if(!removable)continue;r.relationships=r.relationships.filter(v=>v!==removable);}rel={residentId:other.id,affinity:30,shared:0};r.relationships.push(rel);}rel.affinity=clamp(rel.affinity+(r.stress>60?-6:5),-100,100);rel.shared=count(rel.shared);}}
function finish(s:TownLifeState,r:TownLifeResidentState,t:TownLifeTuning){
 const a=r.action!,f=s.facilities.find(f=>f.id===r.facilityId)!;
 if(a==='garden'){const used=Math.min(s.sources.field,8*r.batch);extractSource(s,'field',used);credit(s,'harvest',used);}if(a==='draw-water'){const used=Math.min(s.sources.aquifer,12*r.batch);extractSource(s,'aquifer',used);credit(s,'water',used);}if(a==='craft'){const used=Math.min(s.sources.salvage,4*r.batch);extractSource(s,'salvage',used);credit(s,'materials',used);}if(a==='cook')credit(s,'pantry',6*r.batch);
 if(a==='maintain'){const target=s.facilities.slice(40).sort((a,b)=>a.condition-b.condition||a.id.localeCompare(b.id))[0]!;target.condition=clamp(target.condition+32);target.closedFor=Math.max(0,target.closedFor-30);}
 if(a==='socialize'){const others=f.occupants.filter(i=>i!==r.index);const other=others.sort((a,b)=>(r.relationships.find(v=>v.residentId===s.residents[b]!.id)?.affinity??20)-(r.relationships.find(v=>v.residentId===s.residents[a]!.id)?.affinity??20)||a-b)[0];if(other!==undefined){bond(s,r,s.residents[other]!);s.residents[other]!.needs.connection=clamp(s.residents[other]!.needs.connection+8);}else{r.needs.connection=clamp(r.needs.connection-28);r.reason='The square was quiet; next time a familiar face may be here.';}}
 if(desired(r.desire.kind,a)&&(a!=='socialize'||f.occupants.some(i=>i!==r.index))){r.desire.progress=clamp(r.desire.progress+(a==='socialize'?34:25));if(r.desire.progress>=100){r.desire.completed=count(r.desire.completed);r.desire.kind=DESIRES[(DESIRES.indexOf(r.desire.kind)+1+r.index%2)%DESIRES.length]!;r.desire.progress=0;r.needs.fulfillment=clamp(r.needs.fulfillment+18);r.stress=clamp(r.stress-14);event(s,'desire',`${townResidents(s.seed)[r.index]!.name} completed a personal ambition and chose a new one.`,r.id);}}
 if(s.navigation){const n=s.navigation.residents[r.index]!;n.departure=departurePoint(s,r,townLifeFacilities(s.seed).find(q=>q.id===f.id)!);n.stage=0;n.detour=null;}
 f.condition=clamp(f.condition-(f.id.startsWith('home-')?0:.08));f.served=count(f.served);f.occupants=f.occupants.filter(i=>i!==r.index);r.completed=count(r.completed);r.lastAction=a;const reason=r.reason;resetAction(r);r.reason=reason;if(r.completed%5===0)event(s,'completed',`${townResidents(s.seed)[r.index]!.name} finished ${LABELS[a].toLowerCase()}.`,r.id);
}
function sourceRoom(s:TownLifeState){if(SOURCE_KEYS.some(k=>['recharged','extracted','overflow'].some(c=>s.sourceLedger[c as 'recharged'][k]>TOWN_LIFE_COUNTER_LIMIT-100)))s.sourceLedger={epochs:count(s.sourceLedger.epochs),initial:{...s.sources},recharged:zeroSources(),extracted:zeroSources(),overflow:zeroSources()};}
function rechargeSource(s:TownLifeState,k:keyof TownLifeSources,n:number){sourceRoom(s);const add=Math.min(n,SOURCE_CAPS[k]-s.sources[k]);s.sources[k]=quant(s.sources[k]+add);s.sourceLedger.recharged[k]=quant(s.sourceLedger.recharged[k]+n);s.sourceLedger.overflow[k]=quant(s.sourceLedger.overflow[k]+n-add);}
function extractSource(s:TownLifeState,k:keyof TownLifeSources,n:number){sourceRoom(s);s.sources[k]=quant(s.sources[k]-n);s.sourceLedger.extracted[k]=quant(s.sourceLedger.extracted[k]+n);}
function step(s:TownLifeState,fs:readonly TownLifeFacility[],plan:TownPlan,t:TownLifeTuning,actors:readonly TownNavigationActor[]=[]){
 initializeNavigation(s,fs,plan,t);
 s.tick=count(s.tick);s.cycleTick=(s.cycleTick+1)%960; // bounded phase continues after the lifetime tick counter saturates
 rechargeSource(s,'field',.4*TOWN_LIFE_STEP);rechargeSource(s,'aquifer',.8*TOWN_LIFE_STEP);rechargeSource(s,'salvage',.045*TOWN_LIFE_STEP);
 for(const k of ['donate','repair','gather'] as const)s.cooldowns[k]=Math.max(0,s.cooldowns[k]-TOWN_LIFE_STEP);s.gathering=Math.max(0,s.gathering-TOWN_LIFE_STEP);
 for(const f of s.facilities)f.closedFor=Math.max(0,f.closedFor-TOWN_LIFE_STEP);
 const workClear=townNavigationWorkClear(s.residents,actors);
 for(const r of s.residents){
  for(const k of TOWN_LIFE_NEEDS)r.needs[k]=quant(clamp(r.needs[k]-DECAY[k]*TOWN_LIFE_STEP*t.needRate*r.traits[k]));
  const low=Math.min(...TOWN_LIFE_NEEDS.map(k=>r.needs[k]));r.unmetSeconds=low<15?count(r.unmetSeconds,TOWN_LIFE_STEP):Math.max(0,r.unmetSeconds-TOWN_LIFE_STEP);r.encouragementCooldown=Math.max(0,r.encouragementCooldown-TOWN_LIFE_STEP);
  const targetStress=clamp((55-low)*1.5+(r.status==='queued'?r.waited*.25:0));r.stress=quant(clamp(r.stress+(targetStress-r.stress)*.012));r.mood=r.stress>75||low<12?'distressed':r.stress>45||low<28?'strained':r.stress<20&&low>48?'content':'steady';
  for(const rel of r.relationships)rel.affinity=quant(clamp(rel.affinity-Math.sign(rel.affinity)*.0007*TOWN_LIFE_STEP,-100,100));
  if(r.facilityId){const f=s.facilities.find(f=>f.id===r.facilityId)!;if(!available(f)){cancel(s,r,'The service became unavailable; choosing a safe alternative.');}else if(urgentMismatch(r)&&inputsReady(s,urgentAction(r)!,t)&&r.committed<=0&&r.status!=='idle'){cancel(s,r,'A critical need interrupted the current plan.');}}
  if(r.status==='queued'){r.waited+=TOWN_LIFE_STEP;r.speed=0;if(r.waited>=90)cancel(s,r,'The queue took too long; looking for another available service.');}
  if(r.status==='traveling'){
   r.lease-=TOWN_LIFE_STEP;if(r.lease<=0){cancel(s,r,'The travel reservation expired; trying another approach.');continue;}
  }else if(r.status==='acting'){
   const nav=s.navigation!.residents[r.index]!,f=fs.find(f=>f.id===r.facilityId)!,target=nav.stage<0?legacySlotPoint(f,r.slot):townLifeTaskPoint(f,r.slot,r.action!,nav.stage);
   // Paid legacy work completes at its old point. New work only runs while
   // physically present at its actual subtask, never while queued or blocked.
   if(!workClear[r.index]||Math.hypot(r.x-target.x,r.z-target.z)>1e-6)continue;

   const elapsed=Math.min(r.remaining,TOWN_LIFE_STEP*t.actionSpeed),a=r.action!;r.remaining=Math.max(0,r.remaining-elapsed);r.committed=Math.max(0,r.committed-elapsed);
   const company=a!=='socialize'||s.facilities.find(f=>f.id===r.facilityId)!.occupants.length>1;
   for(const k of TOWN_LIFE_NEEDS){let gain=RECOVERY[a][k]??0;if(a==='socialize'&&k==='connection'&&!company)gain*=.25;r.needs[k]=quant(clamp(r.needs[k]+gain*elapsed/DURATION[a]));}
   if(['rest','leisure','socialize','recover'].includes(a))r.stress=clamp(r.stress-elapsed*.35);
   // Only free, satisfied home leisure/rest may yield to a real public plan.
   // This is an ordinary decision after its minimum commitment, never a saved
   // pose reset, paid-work shortcut, completed-action reward or output grant.
   const satisfied=r.facilityId?.startsWith('home-')&&r.committed<=0&&!urgentAction(r)&&((a==='leisure'&&r.needs.comfort>=80&&r.needs.fulfillment>=80)||(a==='rest'&&r.needs.energy>=85));
   const next=satisfied?bestChoice(s,r,fs,t):null;
   if(r.remaining<=1e-8)finish(s,r,t);
   else if(nav.stage>=0&&townLifeTaskStages(a)>1&&nav.stage<2&&r.remaining<=DURATION[a]*(2-nav.stage)/3+1e-8)nav.stage++;
   else if(next&&next.f.kind!=='home'&&next.a!==a)cancel(s,r,'I am rested and ready for a useful activity around town.');
  }
 }
 // Rotate same-tick insertion order so resident zero does not win every new race.
 for(let n=0;n<100;n++){const r=s.residents[(n+s.cycleTick)%100]!;if(r.status==='idle')choose(s,r,fs,t);}
 acquire(s,fs,plan,t);
 for(const r of s.residents)if(r.status==='queued'&&!s.navigation!.residents[r.index]!.departure){const areas=fs.map(townLifeWorkArea);if(areas.some(a=>r.x>a.minX-.75&&r.x<a.maxX+.75&&r.z>a.minZ-.75&&r.z<a.maxZ+.75))s.navigation!.residents[r.index]!.departure=departurePoint(s,r,fs.find(f=>f.id===r.facilityId)!);}
 const moved=Array(100).fill(0) as number[];
 for(const r of s.residents)s.navigation!.residents[r.index]!.trace=[r.x,r.z,0];
 for(let sub=0;sub<10;sub++){
  const targets=s.residents.map(r=>{
   const nav=s.navigation!.residents[r.index]!;
   let target:{x:number;z:number}|null=null;
   if(r.status==='traveling')target=r.path[r.pathIndex]??null;
   else if(r.status==='acting'){const f=fs.find(f=>f.id===r.facilityId)!;target=nav.stage<0?legacySlotPoint(f,r.slot):townLifeTaskPoint(f,r.slot,r.action!,nav.stage);}
   else if(r.status==='idle'||r.status==='queued')target=nav.departure;
   if(nav.detour&&(!target||!nav.goal||Math.hypot(target.x-nav.goal.x,target.z-nav.goal.z)>1e-7||Math.hypot(r.x-nav.detour.x,r.z-nav.detour.z)<.05))nav.detour=null;
   return nav.detour??target;
  });
  const speeds=s.residents.map(r=>1.8*t.walkSpeed*(r.needs.energy<20?.75:1));
  const result=advanceTownNavigation(plan,s.residents,targets,speeds,TOWN_NAV_STEP,s.cycleTick*10+sub,actors);s.navigation!.resolved=result.resolved;
  for(const r of s.residents){const i=r.index,nav=s.navigation!.residents[i]!;moved[i]!+=result.travel[i]!;if(nav.stage===-1&&result.travel[i]!>1e-8)nav.stage=townLifeTaskStages(r.action!)===1?0:Math.min(2,Math.floor((1-r.remaining/DURATION[r.action!])*3));
   nav.trace.push(Math.round(r.x*1e7)/1e7,Math.round(r.z*1e7)/1e7,sub+1);
   if(r.status==='traveling'){
    while(r.pathIndex<r.path.length){const waypoint=r.path[r.pathIndex]!,d=Math.hypot(r.x-waypoint.x,r.z-waypoint.z),next=r.path[r.pathIndex+1];if(d<1e-7||next&&d<.9&&townNavigationClear(plan,r,next))r.pathIndex++;else break;}
    if(r.pathIndex>=r.path.length)begin(s,r,t);
   }else if(nav.departure&&Math.hypot(r.x-nav.departure.x,r.z-nav.departure.z)<1e-7)nav.departure=null;
  }
 }
 for(const r of s.residents){const nav=s.navigation!.residents[r.index]!;r.speed=moved[r.index]!/TOWN_LIFE_STEP;r.distance=quant(count(r.distance,moved[r.index]!));
  const compact=nav.trace.slice(0,3);for(let j=3;j<nav.trace.length-3;j+=3){const a=compact.length-3,fraction=(nav.trace[j+2]!-compact[a+2]!)/(nav.trace[j+5]!-compact[a+2]!);if(Math.hypot(nav.trace[j]!-(compact[a]!+(nav.trace[j+3]!-compact[a]!)*fraction),nav.trace[j+1]!-(compact[a+1]!+(nav.trace[j+4]!-compact[a+1]!)*fraction))>1e-6)compact.push(...nav.trace.slice(j,j+3));}compact.push(...nav.trace.slice(-3));nav.trace=moved[r.index]! ===0?[]:compact;
  if(r.status==='traveling'&&(!r.path[r.pathIndex]||!townNavigationClear(plan,r,r.path[r.pathIndex]!))){
   const f=fs.find(f=>f.id===r.facilityId)!,path=route(plan,r,townLifeTaskPoint(f,r.slot,r.action!),f.roadZ);if(path){r.path=path;r.pathIndex=0;if(!path.length)begin(s,r,t);}else cancel(s,r,'The previous lane is obstructed; choosing a reachable approach.');
  }
  const f=r.facilityId?fs.find(f=>f.id===r.facilityId):undefined,goal=r.status==='traveling'?r.path[r.pathIndex]??null:r.status==='acting'?(nav.stage<0?legacySlotPoint(f!,r.slot):townLifeTaskPoint(f!,r.slot,r.action!,nav.stage)):nav.departure;
  const distance=goal?Math.hypot(r.x-goal.x,r.z-goal.z):0;
  if(!goal||distance<1e-6){nav.blocked=0;nav.goal=null;nav.best=200;}
  else if(!nav.goal||Math.hypot(goal.x-nav.goal.x,goal.z-nav.goal.z)>1e-7){nav.goal={...goal};nav.best=Math.round(distance*1e4)/1e4;nav.blocked=0;}
  else if(distance<nav.best-.04){nav.best=Math.round(distance*1e4)/1e4;nav.blocked=0;}
  else nav.blocked=Math.min(60,nav.blocked+TOWN_LIFE_STEP);
  if(goal&&nav.blocked>=1.5&&(!nav.detour||nav.blocked>=5&&nav.blocked%2===0))nav.detour=townNavigationDetour(plan,r,goal,s.residents,r.index,actors);
  if(nav.blocked>=12&&r.status==='traveling'){
   const f=fs.find(f=>f.id===r.facilityId)!,target=townLifeTaskPoint(f,r.slot,r.action!),path=route(plan,r,target,f.roadZ);
   if(path){r.path=path;r.pathIndex=0;r.reason='Taking a fresh safe approach around a blocked route.';}
  }
  if(nav.blocked>=30){cancel(s,r,'The work approach stayed blocked; leaving room and choosing again.');nav.blocked=0;nav.goal=null;nav.best=200;}
 }
}
export function validTownLifeTuning(v:unknown):v is TownLifeTuning{return keys(v,TOWN_LIFE_TUNING_REGISTRY.map(f=>f.key))&&TOWN_LIFE_TUNING_REGISTRY.every(f=>finite(v[f.key],f.min,f.max));}
export function advanceTownLife(state:TownLifeState,dt:number,tuning:TownLifeTuning=TOWN_LIFE_DEFAULTS,actors:readonly TownNavigationActor[]=[]):TownLifeState{
 if(!Number.isFinite(dt)||dt<0||dt>60)throw RangeError('Town life delta must be finite and between 0 and 60 seconds.');if(!Array.isArray(actors)||actors.length>8||actors.some(a=>!a||!Number.isFinite(a.x)||Math.abs(a.x)>1e6||!Number.isFinite(a.z)||Math.abs(a.z)>1e6||a.feetY!==undefined&&(!Number.isFinite(a.feetY)||Math.abs(a.feetY)>1e6)||a.id!==undefined&&(typeof a.id!=='string'||a.id.length>128)))throw RangeError('Town actors require finite authenticated positions.');if(!validTownLifeTuning(tuning))throw RangeError('Unsupported town life tuning.');
 if(!trustedStates.has(state))state=immutableTownLife(state,state.seed);if(dt===0)return state;
 actors=actors.slice().sort((a,b)=>(a.id??'').localeCompare(b.id??'')||a.x-b.x||a.z-b.z);
 const total=state.accumulator+dt,steps=Math.floor((total+1e-8)/TOWN_LIFE_STEP),raw=total-steps*TOWN_LIFE_STEP,accumulator=Math.abs(raw)<1e-8?0:Math.max(0,Math.round(raw*1e12)/1e12);if(!steps){const next=Object.freeze({...state,accumulator});trustedStates.add(next);return next;}const s=structuredClone(state);s.accumulator=accumulator;
 if(steps){const fs=townLifeFacilities(s.seed),plan=startingTown(s.seed);for(let i=0;i<steps;i++)step(s,fs,plan,tuning,actors);}return sealState(s);
}

const finite=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const integer=(v:unknown,min=0,max=TOWN_LIFE_COUNTER_LIMIT):v is number=>Number.isSafeInteger(v)&&finite(v,min,max);
/** Own inert fields only: no accessors, symbols, prototypes, sparse arrays or extras. */
function keys(v:unknown,names:readonly string[]):v is Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))return false;const own=Reflect.ownKeys(v);return own.length===names.length&&names.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return !!d&&Object.hasOwn(d,'value');});}
function array(v:unknown,max:number):v is unknown[]{if(!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>max||Reflect.ownKeys(v).length!==v.length+1)return false;for(let i=0;i<v.length;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!Object.hasOwn(d,'value'))return false;}return true;}
const point=(v:unknown):v is {x:number;z:number}=>keys(v,['x','z'])&&finite(v.x,TOWN_CENTER.x-55,TOWN_CENTER.x+55)&&finite(v.z,TOWN_CENTER.z-48,TOWN_CENTER.z+48);
const resourceRecord=(v:unknown,max:number)=>keys(v,RESOURCES)&&RESOURCES.every(k=>finite(v[k],0,max));
export function validTownLife(v:unknown,seed:number):v is TownLifeState{
 if(!integer(seed,0,0xffffffff)||!keys(v,['seed','version','revision','tick','cycleTick','accumulator','residents','facilities','resources','sources','sourceLedger','ledger','cooldowns','gathering','contributions','playerSpent','events',...(v&&typeof v==='object'&&Object.hasOwn(v,'navigation')?['navigation']:[])])||v.seed!==seed||v.version!==1||!integer(v.revision)||!integer(v.tick)||!integer(v.cycleTick,0,959)||v.tick<TOWN_LIFE_COUNTER_LIMIT&&v.cycleTick!==v.tick%960||!finite(v.accumulator,0,TOWN_LIFE_STEP-1e-8))return false;
 if(!array(v.residents,100)||v.residents.length!==100||!array(v.facilities,48)||v.facilities.length!==48)return false;
 const fs=townLifeFacilities(seed),roster=townResidents(seed),plan=startingTown(seed),navigation=v.navigation as TownLifeNavigation|undefined;
 if(Object.hasOwn(v,'navigation')&&(!keys(v.navigation,['version','resolved','residents'])||v.navigation.version!==1||typeof v.navigation.resolved!=='boolean'||!array(v.navigation.residents,100)||v.navigation.residents.length!==100))return false;
 if(navigation)for(const n of navigation.residents){
  if(!keys(n,['stage','blocked','goal','best','departure','detour','trace'])||!integer(n.stage,-1,2)||!finite(n.blocked,0,60)||!finite(n.best,0,200)||n.goal!==null&&!point(n.goal)||n.departure!==null&&!point(n.departure)||n.detour!==null&&!point(n.detour)||!array(n.trace,33)||n.trace.length>0&&n.trace.length<6||n.trace.length%3!==0)return false;
  for(let j=0;j<n.trace.length;j+=3){const x=n.trace[j]!,z=n.trace[j+1]!,at=n.trace[j+2]!;
   if(!finite(x,TOWN_CENTER.x-55,TOWN_CENTER.x+55)||!finite(z,TOWN_CENTER.z-48,TOWN_CENTER.z+48)||!integer(at,0,10)||j===0&&at!==0||j===n.trace.length-3&&at!==10)return false;
   if(j){const p={x:n.trace[j-3]!,z:n.trace[j-2]!},dt=(at-n.trace[j-1]!)*TOWN_NAV_STEP;if(dt<=0||Math.hypot(x-p.x,z-p.z)>dt*6+1e-7||!townNavigationClear(plan,p,{x,z}))return false;}
  }
 }
 if(!resourceRecord(v.resources,1200)||!RESOURCES.every(k=>finite((v.resources as Record<string,unknown>)[k],0,CAPS[k]))||!keys(v.sources,['field','aquifer','salvage'])||!Object.entries(SOURCE_CAPS).every(([k,n])=>finite((v.sources as Record<string,unknown>)[k],0,n)))return false;
 if(!keys(v.sourceLedger,['epochs','initial','recharged','extracted','overflow'])||!integer(v.sourceLedger.epochs)||!['initial','recharged','extracted','overflow'].every(c=>{const r=(v.sourceLedger as Record<string,unknown>)[c];return keys(r,SOURCE_KEYS)&&SOURCE_KEYS.every(k=>finite(r[k],0,TOWN_LIFE_COUNTER_LIMIT));}))return false;const sl=v.sourceLedger as unknown as TownLifeState['sourceLedger'];if(SOURCE_KEYS.some(k=>Math.abs(sl.initial[k]+sl.recharged[k]-sl.extracted[k]-sl.overflow[k]-(v.sources as unknown as TownLifeSources)[k])>1e-4))return false;
 if(!keys(v.ledger,['epochs','donationBaseline','initial','produced','consumed','donated','overflow'])||!integer(v.ledger.epochs)||!resourceRecord(v.ledger.donationBaseline,12*TOWN_LIFE_COUNTER_LIMIT)||!['initial','produced','consumed','donated','overflow'].every(k=>resourceRecord((v.ledger as Record<string,unknown>)[k],TOWN_LIFE_COUNTER_LIMIT)))return false;
 const ledger=v.ledger as unknown as TownLifeState['ledger'],resources=v.resources as Record<TownLifeResource,number>;
 if(RESOURCES.some(k=>Math.abs(ledger.initial[k]+ledger.produced[k]+ledger.donated[k]-ledger.consumed[k]-ledger.overflow[k]-resources[k])>1e-4))return false;
 if(!keys(v.cooldowns,['donate','repair','gather'])||!finite(v.cooldowns.donate,0,10)||!finite(v.cooldowns.repair,0,20)||!finite(v.cooldowns.gather,0,90)||!finite(v.gathering,0,60)||!keys(v.playerSpent,['scrap','core','water'])||!['scrap','core','water'].every(k=>integer((v.playerSpent as Record<string,unknown>)[k])))return false;
 if(!keys(v.contributions,COMMANDS)||!COMMANDS.every(k=>integer((v.contributions as Record<string,unknown>)[k])))return false;const contributions=v.contributions as Record<TownLifeCommand['kind'],number>,spent=v.playerSpent as {scrap:number;core:number;water:number};if(COMMANDS.reduce((n,k)=>n+contributions[k],0)!==v.revision||spent.core!==0||spent.scrap!==2*(contributions['donate-supplies']+contributions['repair-service']+contributions['host-gathering'])||spent.water!==contributions['donate-water']+contributions['host-gathering'])return false;const donationTotals=contributed(v as unknown as TownLifeState);if(RESOURCES.some(k=>Math.abs(donationTotals[k]-ledger.donationBaseline[k]-ledger.donated[k])>1e-4||ledger.epochs===0&&ledger.donationBaseline[k]!==0))return false;
 const residentKeys=['id','index','homeIndex','householdId','needs','traits','stress','mood','desire','relationships','action','status','facilityId','slot','remaining','batch','committed','waited','lease','path','pathIndex','x','z','facing','distance','speed','lastAction','completed','interruptions','unmetSeconds','encouragementCooldown','reason'];
 for(let i=0;i<100;i++){const r=v.residents[i],identity=roster[i]!;if(!keys(r,residentKeys)||r.id!==identity.id||r.index!==i||r.homeIndex!==identity.homeIndex||r.householdId!==identity.householdId||!keys(r.needs,TOWN_LIFE_NEEDS)||!TOWN_LIFE_NEEDS.every(k=>finite((r.needs as Record<string,unknown>)[k],0,100))||!keys(r.traits,TOWN_LIFE_NEEDS)||!TOWN_LIFE_NEEDS.every(k=>(r.traits as Record<string,unknown>)[k]===traitsFor(identity)[k]))return false;
  if(!finite(r.stress,0,100)||!['content','steady','strained','distressed'].includes(r.mood as string)||!keys(r.desire,['kind','progress','completed'])||!DESIRES.includes(r.desire.kind as TownLifeDesireKind)||!finite(r.desire.progress,0,100)||!integer(r.desire.completed)||!array(r.relationships,8))return false;
  const relations=new Set<string>();for(const rel of r.relationships){if(!keys(rel,['residentId','affinity','shared'])||typeof rel.residentId!=='string'||rel.residentId===r.id||!roster.some(q=>q.id===rel.residentId)||relations.has(rel.residentId)||!finite(rel.affinity,-100,100)||!integer(rel.shared))return false;relations.add(rel.residentId);}if(identity.housemateIds.some(id=>!relations.has(id)))return false;
  if(r.action!==null&&!ACTIONS.includes(r.action as TownLifeActionKind)||r.lastAction!==null&&!ACTIONS.includes(r.lastAction as TownLifeActionKind)||!['idle','queued','traveling','acting'].includes(r.status as string))return false;
  if(!finite(r.x,TOWN_CENTER.x-55,TOWN_CENTER.x+55)||!finite(r.z,TOWN_CENTER.z-48,TOWN_CENTER.z+48)||!finite(r.facing,-Math.PI,Math.PI)||!finite(r.speed,0,6)||!finite(r.distance,0,TOWN_LIFE_COUNTER_LIMIT)||!integer(r.completed)||!integer(r.interruptions)||!finite(r.unmetSeconds,0,TOWN_LIFE_COUNTER_LIMIT)||!finite(r.encouragementCooldown,0,60)||typeof r.reason!=='string'||r.reason.length>240)return false;
  if(!finite(r.remaining,0,30)||!finite(r.batch,.5,2)||!finite(r.committed,0,8)||!finite(r.waited,0,90)||!finite(r.lease,0,300)||!integer(r.slot,-1,23)||!array(r.path,5)||!r.path.every(point)||!integer(r.pathIndex,0,r.path.length))return false;
  if(navigation){const n=navigation.residents[i]!,trace=n.trace;if((trace.length?Math.hypot(trace.at(-3)!-r.x,trace.at(-2)!-r.z)>1e-7:r.speed!==0)||n.stage===-1&&r.status!=='acting'||r.status!=='acting'&&n.stage!==0||r.status==='acting'&&n.stage>=townLifeTaskStages(r.action as TownLifeActionKind))return false;if(n.stage===-1){const f=fs.find(f=>f.id===r.facilityId);if(!f||Math.hypot(r.x-legacySlotPoint(f,r.slot).x,r.z-legacySlotPoint(f,r.slot).z)>1e-7)return false;}}
  const p={x:r.x,z:r.z};if(!townPathClear(plan,p,p,.56))return false;
  for(let j=0;j<r.path.length;j++){const q=r.path[j] as {x:number;z:number};if(!townPathClear(plan,q,q,.56)||j>0&&!townPathClear(plan,r.path[j-1] as {x:number;z:number},q,.56))return false;}
  if(r.status==='idle'){if(r.facilityId!==null||r.action!==null||r.slot!==-1||r.path.length||r.pathIndex!==0||r.remaining!==0||r.committed!==0||r.waited!==0||r.lease!==0||!navigation&&r.speed!==0)return false;}
  else {const f=fs.find(f=>f.id===r.facilityId);if(!f||!f.actions.includes(r.action as TownLifeActionKind)||f.homeIndex!==null&&f.homeIndex!==r.homeIndex)return false;
   if(r.status==='queued'){if(r.slot!==-1||r.path.length||r.pathIndex!==0||r.remaining!==0||r.committed!==0||r.lease!==0||!navigation&&r.speed!==0)return false;}
   else {if(r.slot<0||r.slot>=f.capacity)return false;const dest=navigation&&navigation.residents[i]!.stage>=0?townLifeTaskPoint(f,r.slot,r.action as TownLifeActionKind,r.status==='traveling'?0:navigation.residents[i]!.stage):legacySlotPoint(f,r.slot);
    if(r.status==='traveling'){if(!r.path.length||r.pathIndex>=r.path.length||r.lease<=0||r.remaining!==0||r.committed!==0)return false;const last=r.path[r.path.length-1] as {x:number;z:number};if(Math.hypot(last.x-dest.x,last.z-dest.z)>1e-7||!townPathClear(plan,p,r.path[r.pathIndex] as {x:number;z:number},.56))return false;}
    else if(r.path.length||r.pathIndex!==0||r.remaining<=0||r.remaining>DURATION[r.action as TownLifeActionKind]||r.lease!==0||!navigation&&(r.speed!==0||Math.hypot(r.x-dest.x,r.z-dest.z)>1e-7))return false;
   }
  }
 }
 if(navigation?.resolved&&(v.residents as unknown as TownLifeResidentState[]).some((r,i,all)=>all.some((q,j)=>j>i&&Math.hypot(r.x-q.x,r.z-q.z)<.6-1e-6)))return false;
 const allMembers=new Set<number>();
 for(let i=0;i<fs.length;i++){const f=v.facilities[i],descriptor=fs[i]!;if(!keys(f,['id','condition','closedFor','queue','reservations','occupants','served','canceled'])||f.id!==descriptor.id||!finite(f.condition,0,100)||!finite(f.closedFor,0,480)||!integer(f.served)||!integer(f.canceled)||!array(f.queue,100)||!array(f.reservations,descriptor.capacity)||!array(f.occupants,descriptor.capacity)||f.reservations.length+f.occupants.length>descriptor.capacity)return false;
  const slots=new Set<number>();for(const field of ['queue','reservations','occupants'] as const){for(const n of f[field] as unknown[]){if(!integer(n,0,99)||allMembers.has(n))return false;allMembers.add(n);const r=v.residents[n] as unknown as TownLifeResidentState;if(r.facilityId!==f.id||r.status!==(field==='queue'?'queued':field==='reservations'?'traveling':'acting'))return false;if(field!=='queue'){if(slots.has(r.slot))return false;slots.add(r.slot);}}}
 }
 if(v.residents.some((r,i)=>(r as TownLifeResidentState).status!=='idle'&&!allMembers.has(i)))return false;
 if(!array(v.events,32))return false;for(const e of v.events)if(!keys(e,['tick','residentId','kind','text'])||!integer(e.tick)||e.residentId!==null&&!roster.some(r=>r.id===e.residentId)||!EVENT_KINDS.includes(e.kind as TownLifeState['events'][number]['kind'])||typeof e.text!=='string'||e.text.length>240)return false;
 return true;
}
export function immutableTownLife(value:unknown,seed:number):TownLifeState{if(!validTownLife(value,seed))throw RangeError('Invalid town life snapshot.');return sealState(structuredClone(value));}
export function validTownLifeCommand(v:unknown):v is TownLifeCommand{return keys(v,['kind','targetId','expectedRevision'])&&COMMANDS.includes(v.kind as TownLifeCommand['kind'])&&typeof v.targetId==='string'&&v.targetId.length>=1&&v.targetId.length<=80&&integer(v.expectedRevision);}
export function townLifePlayerCost(life:TownLifeState|undefined){return life?{...life.playerSpent}:{scrap:0,core:0,water:0};}
export function townLifeCommandCost(kind:TownLifeCommand['kind']){return {scrap:kind==='donate-supplies'||kind==='repair-service'||kind==='host-gathering'?2:0,core:0,water:kind==='donate-water'||kind==='host-gathering'?1:0};}
export function townLifeCommandPosition(life:TownLifeState,command:TownLifeCommand):{x:number;z:number}|undefined{if(command.kind==='encourage-resident'){const r=life.residents.find(r=>r.id===command.targetId);return r?{x:r.x,z:r.z}:undefined;}const f=townLifeFacilities(life.seed).find(f=>f.id===command.targetId);return f?{x:f.x,z:f.z}:undefined;}
export function applyTownLifeCommand(state:TownLifeState,context:{seed:number;zone:string;player:{x:number;z:number;hp:number};inventory:{scrap:number;core:number;water:number}},command:TownLifeCommand,authorityPosition?:{x:number;z:number}):{life:TownLifeState;inventory:{scrap:number;core:number;water:number};message:string}|null{
 if(!validTownLifeCommand(command)||(state.seed!==context.seed||!trustedStates.has(state)&&!validTownLife(state,context.seed))||context.zone!=='valley'||command.expectedRevision!==state.revision||state.revision>=TOWN_LIFE_COUNTER_LIMIT||!finite(context.player.hp,.000001,100)||!finite(context.player.x,-1e6,1e6)||!finite(context.player.z,-1e6,1e6))return null;
 const target=authorityPosition??townLifeCommandPosition(state,command),cost=townLifeCommandCost(command.kind);if(!target||!finite(target.x,TOWN_CENTER.x-60,TOWN_CENTER.x+60)||!finite(target.z,TOWN_CENTER.z-62,TOWN_CENTER.z+62)||Math.hypot(target.x-context.player.x,target.z-context.player.z)>3.5||(['scrap','core','water']as const).some(k=>!integer(context.inventory[k])||context.inventory[k]<cost[k]||state.playerSpent[k]+cost[k]>TOWN_LIFE_COUNTER_LIMIT))return null;
 const f=state.facilities.find(f=>f.id===command.targetId),resident=state.residents.find(r=>r.id===command.targetId);
 if(command.kind==='donate-water'&&(command.targetId!=='well'||state.cooldowns.donate>0||state.resources.water>CAPS.water-12)||command.kind==='donate-supplies'&&(command.targetId!=='workshop'||state.cooldowns.donate>0||state.resources.materials>CAPS.materials-12)||command.kind==='repair-service'&&(!f||f.id.startsWith('home-')||f.condition>TOWN_LIFE_REPAIR_THRESHOLD||state.cooldowns.repair>0)||command.kind==='host-gathering'&&(command.targetId!=='square'||state.cooldowns.gather>0||state.gathering>0)||command.kind==='encourage-resident'&&(!resident||resident.encouragementCooldown>0))return null;
 const s=structuredClone(state),inventory={...context.inventory};for(const k of ['scrap','core','water']as const){inventory[k]-=cost[k];s.playerSpent[k]+=cost[k];}s.revision++;
 let message='';switch(command.kind){case'donate-water':credit(s,'water',12,'donated');s.cooldowns.donate=10;message='Donated one canister: 12 town water portions are ready.';break;case'donate-supplies':credit(s,'materials',12,'donated');s.cooldowns.donate=10;message='Donated two scrap: 12 town repair-material portions are ready.';break;case'repair-service':{const service=s.facilities.find(f=>f.id===command.targetId)!;service.condition=clamp(service.condition+40);service.closedFor=0;s.cooldowns.repair=20;message='Two scrap restored 40 service condition and reopened the station.';break;}case'host-gathering':s.gathering=60;s.cooldowns.gather=90;message='A 60-second gathering is underway. Neighbors still choose whether their needs allow them to attend.';break;case'encourage-resident':{const r=s.residents.find(r=>r.id===command.targetId)!;r.stress=clamp(r.stress-12);r.needs.connection=clamp(r.needs.connection+10);r.desire.progress=clamp(r.desire.progress+8,0,99);r.encouragementCooldown=60;updateMood(r);message=`Encouraged ${townResidents(s.seed)[r.index]!.name}; they feel supported in their current ambition.`;break;}}
 s.contributions[command.kind]++;event(s,'aid',message,resident?.id??null);return {life:sealState(s),inventory,message};
}
export function townLifePose(life:TownLifeState,index:number):TownResidentPose{
 if(!integer(index,0,99))throw RangeError('Resident index must be 0–99.');const r=life.residents[index]!,home=r.facilityId?.startsWith('home-'),social=r.action==='socialize'||r.action==='leisure';
 const actionPose:Record<TownLifeActionKind,TownResidentPose['activity']>={eat:'eating',rest:'resting',wash:'washing',socialize:'meeting neighbors',leisure:'relaxing',garden:'gardening','draw-water':'drawing water',cook:'cooking',craft:'crafting',maintain:'repairing',recover:'receiving care'};
 const activity=r.status==='traveling'?(home?'walking home':social?'walking to the square':'walking to work'):r.status==='acting'&&r.action?actionPose[r.action]:home?'at home':'meeting neighbors';
 return {x:r.x,z:r.z,facing:r.facing,activity,moving:r.speed>.001,speed:r.speed,distance:r.distance,...(life.navigation?{authoritativeMotion:1 as const,contactResolved:life.navigation.resolved,motionPath:life.navigation.residents[index]!.trace.length?Array.from({length:life.navigation.residents[index]!.trace.length/3},(_,j)=>{const p=life.navigation!.residents[index]!.trace;return {x:p[j*3]!,z:p[j*3+1]!,t:p[j*3+2]!*TOWN_NAV_STEP};}):[{x:r.x,z:r.z,t:0},{x:r.x,z:r.z,t:TOWN_LIFE_STEP}]}:{} )};
}
export function townLifeSummary(life:TownLifeState,index:number):TownLifeSummary{
 if(!integer(index,0,99))throw RangeError('Resident index must be 0–99.');const r=life.residents[index]!,identity=townResidents(life.seed)[index]!,f=townLifeFacilities(life.seed).find(f=>f.id===r.facilityId),diagnostics:string[]=[];
 for(const k of TOWN_LIFE_NEEDS)if(r.needs[k]<25)diagnostics.push(`${k} is low (${Math.round(r.needs[k])}/100).`);if(r.status==='queued')diagnostics.push(`Waiting ${Math.round(r.waited)} seconds in a first-come service queue.`);if(r.unmetSeconds>0)diagnostics.push(`${Math.round(r.unmetSeconds)} recent seconds with a critical unmet need.`);if(life.resources.pantry<40)diagnostics.push('Town pantry is low; cooking needs harvested produce and water.');if(life.resources.water<40)diagnostics.push('Town water is low; drawing water or a donation can help.');
 const desireText:Record<TownLifeDesireKind,string>={'share-company':`Build friendships around ${identity.interest}`,'practice-craft':`Practice a personal craft inspired by ${identity.interest}`,'tend-garden':'Make the shared garden productive','help-town':'Help keep shared services supplied','settle-in':`Make life at ${identity.address} comfortable`};
 return {name:identity.name,activity:r.action?`${r.status==='traveling'?'Walking to: ':r.status==='queued'?'Waiting to: ':''}${LABELS[r.action]}`:'Considering the next activity',reason:r.reason,mood:r.mood,needs:TOWN_LIFE_NEEDS.map(key=>({key,value:r.needs[key],label:key[0]!.toUpperCase()+key.slice(1)})),desire:`${desireText[r.desire.kind]} · ${Math.round(r.desire.progress)}% · ${r.desire.completed} completed`,relationships:r.relationships.slice().sort((a,b)=>b.affinity-a.affinity).map(rel=>`${townResidents(life.seed).find(q=>q.id===rel.residentId)!.name}: ${Math.round(rel.affinity)}/100 affinity, ${rel.shared} shared moments`),diagnostics,facility:f?.label??'On a town street',progress:r.status==='acting'&&r.action?100*(1-r.remaining/DURATION[r.action]):r.desire.progress};
}
export function createTownLifeScenario(seed:number,scenario:string,starting?:{residentIndex:number;needs:Record<TownLifeNeed,number>}):TownLifeState{
 if(!TOWN_LIFE_SCENARIOS.some(s=>s.id===scenario))throw RangeError('Unknown town life scenario.');if(starting&&(!keys(starting,['residentIndex','needs'])||!integer(starting.residentIndex,0,99)||!keys(starting.needs,TOWN_LIFE_NEEDS)||!TOWN_LIFE_NEEDS.every(k=>finite(starting.needs[k],0,100))))throw RangeError('Unsupported starting needs.');
 const s=structuredClone(scenario==='balanced'?createTownLifeOpening(seed):createTownLife(seed));
 if(scenario==='lean-stores'){s.resources={pantry:12,water:12,materials:4,harvest:16};s.ledger.initial={...s.resources};}
 if(scenario==='service-outage'){const f=s.facilities.find(f=>f.id==='cookshop')!;f.condition=5;f.closedFor=120;}
 if(scenario==='social-strain')for(const r of s.residents){r.needs.connection=12+(r.index%10);r.stress=65;}
 if(scenario==='urgent-needs'){const r=s.residents[starting?.residentIndex??0]!;r.needs.nourishment=8;r.needs.energy=14;r.needs.hygiene=18;r.stress=65;}
 if(scenario==='overwork')for(const r of s.residents){r.needs.energy=18+(r.index%10);r.needs.comfort=22;r.needs.fulfillment=20;r.stress=76;}
 if(starting)s.residents[starting.residentIndex]!.needs={...starting.needs};
 for(const r of s.residents)updateMood(r);event(s,'completed',`Disposable scenario: ${TOWN_LIFE_SCENARIOS.find(v=>v.id===scenario)!.label}.`);return sealState(s);
}

export const TOWN_LIFE_ENGINE=Object.freeze({kind:"axiom-town-life",create:createTownLifeOpening,advance:advanceTownLife,validate:validTownLife,pose:townLifePose,command:applyTownLifeCommand,facilities:townLifeFacilities,summary:townLifeSummary,scenario:createTownLifeScenario});
