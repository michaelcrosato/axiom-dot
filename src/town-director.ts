/** Finite, observational town requests. The director never mutates town resources,
 * facilities, needs, inventory, reputation or clocks. Solo and room authority call
 * this same reducer after active-play town steps and accepted interventions. */
import {advanceTownLife, applyTownLifeCommand, createTownLifeScenario, townLifeCommandCost, townLifeCommandPosition, townLifeFacilities, validTownLife, validTownLifeCommand, type TownLifeCommand, type TownLifeState} from './town-life.ts';
import {townResidents} from './town-residents.ts';

export const TOWN_DIRECTOR_VERSION = 1;
export const TOWN_DIRECTOR_STEP = .5;
export const TOWN_DIRECTOR_EPISODE_LIMIT = 24;
export const TOWN_DIRECTOR_REPEAT_LIMIT = 2;
export const TOWN_DIRECTOR_SERIALIZED_LIMIT = 48_000;
const LIFE_LIMIT = 1_000_000_000;
const SCAN_STEPS = 60;
const KINDS = ['water-shortage', 'material-shortage', 'service-wear', 'resident-support'] as const;
const STATUSES = ['offered', 'accepted', 'completed', 'world-resolved', 'expired', 'declined'] as const;
export type TownEpisodeKind = typeof KINDS[number];
export type TownEpisodeStatus = typeof STATUSES[number];
export interface TownDirectorTuning {restSeconds:number; deadlineSeconds:number; maxActive:number}
export const TOWN_DIRECTOR_DEFAULTS:Readonly<TownDirectorTuning> = Object.freeze({restSeconds:90, deadlineSeconds:240, maxActive:2});
export const TOWN_DIRECTOR_TUNING_REGISTRY = Object.freeze([
 {key:'restSeconds',label:'Between requests',min:30,max:300,default:90,step:1,unit:'s',description:'Active-play rest after offering or closing requests; the next 30-second scan can offer again.',timing:'apply'},
 {key:'deadlineSeconds',label:'Request deadline',min:120,max:360,default:240,step:1,unit:'s',description:'Active-play lifetime of new offers, including acceptance time. Existing deadlines remain latched.',timing:'next offer'},
 {key:'maxActive',label:'Simultaneous requests',min:1,max:2,default:2,step:1,unit:'requests',description:'Maximum offered plus accepted requests. Lowering it preserves existing requests and blocks replacements.',timing:'next offer'},
] as const);
export const TOWN_DIRECTOR_SCENARIOS = Object.freeze([
 {id:'balanced',label:'Ordinary town',description:'Existing balanced town start. The director creates no artificial needs.'},
 {id:'lean-stores',label:'Low shared stores',description:'Existing disposable living-town low-stock setup, with matching conservation baselines.'},
 {id:'service-outage',label:'Service recovery',description:'Existing disposable cookshop outage. Real maintenance or paid repairs can resolve it.'},
 {id:'social-strain',label:'Neighbors need support',description:'Existing disposable connection-pressure setup. Natural recovery earns no player credit.'},
] as const);
export type TownDirectorScenario = typeof TOWN_DIRECTOR_SCENARIOS[number]['id'];
export interface TownDirectorPreset {kind:'axiom-town-director-preset';version:1;seed:number;scenario:TownDirectorScenario;tuning:TownDirectorTuning}
export interface TownDirectorObservation {lifeRevision:number;tick:number;value:number;aux:number}
export interface TownDirectorEvidence extends TownDirectorObservation {estimatedActions:number}
export interface TownDirectorContribution {command:TownLifeCommand;lifeRevision:number;tick:number;beforeValue:number;afterValue:number;beforeAux:number;afterAux:number;count:number}
export interface TownDirectorOutcome extends TownDirectorObservation {reason:'helped'|'recovered'|'deadline'|'declined'}
export interface TownEpisode {
 id:string;kind:TownEpisodeKind;issuerId:string;serviceId:string;targetId:string;
 status:TownEpisodeStatus;deadlineSteps:number;remainingSteps:number;
 evidence:TownDirectorEvidence;accepted:TownDirectorObservation|null;
 /** Latest actual qualifying intervention, with bounded cumulative count. */
 contribution:TownDirectorContribution|null;outcome:TownDirectorOutcome|null;
}
export interface TownDirectorState {
 seed:number;version:1;revision:number;accumulator:number;phaseSteps:number;restSteps:number;
 observedLifeRevision:number;tuning:TownDirectorTuning;episodes:TownEpisode[];
}
export interface TownDirectorCandidate {kind:TownEpisodeKind;issuerId:string;serviceId:string;targetId:string;evidence:TownDirectorEvidence;severity:number}
export interface TownDirectorCommand {kind:'accept'|'decline';episodeId:string;expectedRevision:number;expectedLifeRevision:number}
export interface TownDirectorActorContext {seed:number;zone:string;player:{x:number;z:number;hp:number}}
const trusted = new WeakSet<TownDirectorState>();
const finite=(v:unknown,min:number,max:number):v is number => typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const integer=(v:unknown,min=0,max=LIFE_LIMIT):v is number => Number.isSafeInteger(v)&&finite(v,min,max);
function keys(v:unknown,names:readonly string[]):v is Record<string,unknown> {
 if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))return false;
 const own=Reflect.ownKeys(v);return own.length===names.length&&names.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return !!d&&Object.hasOwn(d,'value');});
}
function array(v:unknown,max:number):v is unknown[] {
 if(!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>max||Reflect.ownKeys(v).length!==v.length+1)return false;
 for(let i=0;i<v.length;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!Object.hasOwn(d,'value'))return false;}return true;
}
function freeze<T>(v:T):T {if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
function seal(s:TownDirectorState):TownDirectorState {freeze(s);trusted.add(s);return s;}
function requireLife(life:TownLifeState):TownLifeState {return advanceTownLife(life,0);}
function takeState(state:TownDirectorState,life:TownLifeState):TownDirectorState {
 if(trusted.has(state)){if(state.seed!==life.seed||state.observedLifeRevision>life.revision||latestRecordedTick(state)>life.tick)throw RangeError('Director and town authority do not match.');return state;}
 return immutableTownDirector(state,life);
}
const active=(e:TownEpisode)=>e.status==='offered'||e.status==='accepted';
const latestRecordedTick=(s:TownDirectorState)=>s.episodes.reduce((latest,e)=>Math.max(latest,e.evidence.tick,e.accepted?.tick??0,e.contribution?.tick??0,e.outcome?.tick??0),0);
const keyOf=(e:Pick<TownEpisode,'kind'|'targetId'>)=>`${e.kind}:${e.targetId}`;
function hash(seed:number,value:string):number {let h=(seed^2166136261)>>>0;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619)>>>0;return h;}
function issuer(seed:number,kind:TownEpisodeKind,targetId:string):string {
 if(kind==='resident-support')return targetId;
 const role=kind==='water-shortage'?'waterworks assistant':kind==='material-shortage'?'salvager':'repairer';
 const roster=townResidents(seed);return (roster.filter(r=>r.role===role).sort((a,b)=>a.id.localeCompare(b.id))[0]??roster[0])!.id;
}
function service(kind:TownEpisodeKind,targetId:string):string {return kind==='water-shortage'?'well':kind==='material-shortage'?'workshop':kind==='resident-support'?'square':targetId;}
function observe(life:TownLifeState,kind:TownEpisodeKind,targetId:string):TownDirectorObservation {
 let value=0,aux=0;
 if(kind==='water-shortage')value=life.resources.water;
 else if(kind==='material-shortage')value=life.resources.materials;
 else if(kind==='service-wear'){const f=life.facilities.find(f=>f.id===targetId)!;value=f.condition;aux=f.closedFor;}
 else {const r=life.residents.find(r=>r.id===targetId)!;value=r.needs.connection;aux=r.stress;}
 return {lifeRevision:life.revision,tick:life.tick,value,aux};
}
function resolved(kind:TownEpisodeKind,o:Pick<TownDirectorObservation,'value'|'aux'>):boolean {
 return kind==='water-shortage'?o.value>=40:kind==='material-shortage'?o.value>=16:kind==='service-wear'?o.value>60&&o.aux===0:o.value>=30&&o.aux<=60;
}
function needed(kind:TownEpisodeKind,o:Pick<TownDirectorObservation,'value'|'aux'>):boolean {
 return kind==='water-shortage'?o.value<40:kind==='material-shortage'?o.value<16:kind==='service-wear'?o.value<=60:o.value<25||o.aux>65;
}
function actionsNeeded(kind:TownEpisodeKind,o:Pick<TownDirectorObservation,'value'|'aux'>):number {
 return Math.max(1,kind==='water-shortage'?Math.ceil((40-o.value)/12):kind==='material-shortage'?Math.ceil((16-o.value)/12):kind==='service-wear'?Math.floor((60-o.value)/40)+1:Math.max(Math.ceil((30-o.value)/10),Math.ceil((o.aux-60)/12)));
}
function matchingCommand(e:Pick<TownEpisode,'kind'|'targetId'>,command:TownLifeCommand):boolean {
 const kind=e.kind==='water-shortage'?'donate-water':e.kind==='material-shortage'?'donate-supplies':e.kind==='service-wear'?'repair-service':'encourage-resident';
 return command.kind===kind&&command.targetId===e.targetId;
}
export function validTownDirectorTuning(v:unknown):v is TownDirectorTuning {
 return keys(v,TOWN_DIRECTOR_TUNING_REGISTRY.map(f=>f.key))&&TOWN_DIRECTOR_TUNING_REGISTRY.every(f=>integer(v[f.key],f.min,f.max));
}
/** Current causal candidates, sorted by severity then a seeded stable identity key.
 * This does not assume a resident will accept a gathering or create future stock. */
export function townDirectorCandidates(life:TownLifeState,tuning:TownDirectorTuning=TOWN_DIRECTOR_DEFAULTS):readonly TownDirectorCandidate[] {
 life=requireLife(life);if(!validTownDirectorTuning(tuning))throw RangeError('Unsupported director tuning.');
 const candidates:TownDirectorCandidate[]=[];
 const add=(kind:TownEpisodeKind,targetId:string,cooldown:number)=>{
  const observation=observe(life,kind,targetId);if(!needed(kind,observation))return;
  const estimatedActions=actionsNeeded(kind,observation),interval=kind==='resident-support'?60:kind==='service-wear'?20:10;
  // Allow 60 seconds for reaching the real target. All remaining actions must fit.
  if(60+cooldown+(estimatedActions-1)*interval>=tuning.deadlineSeconds)return;
  const severity=kind==='water-shortage'?100-observation.value:kind==='material-shortage'?96-observation.value:kind==='service-wear'?110-observation.value:Math.max(75-observation.value,observation.aux);
  candidates.push({kind,issuerId:issuer(life.seed,kind,targetId),serviceId:service(kind,targetId),targetId,evidence:{...observation,estimatedActions},severity});
 };
 add('water-shortage','well',life.cooldowns.donate);add('material-shortage','workshop',life.cooldowns.donate);
 for(const f of townLifeFacilities(life.seed))if(f.kind!=='home')add('service-wear',f.id,life.cooldowns.repair);
 for(const r of life.residents)add('resident-support',r.id,r.encouragementCooldown);
 candidates.sort((a,b)=>b.severity-a.severity||hash(life.seed,keyOf(a))-hash(life.seed,keyOf(b))||keyOf(a).localeCompare(keyOf(b)));
 return freeze(candidates);
}
function offer(s:TownDirectorState,life:TownLifeState) {
 if(s.restSteps>0||s.episodes.length>=TOWN_DIRECTOR_EPISODE_LIMIT)return;
 let slots=s.tuning.maxActive-s.episodes.filter(active).length;if(slots<=0)return;let added=false;
 for(const c of townDirectorCandidates(life,s.tuning)){
  const history=s.episodes.filter(e=>keyOf(e)===keyOf(c));if(history.length>=TOWN_DIRECTOR_REPEAT_LIMIT||history.some(active))continue;
  s.episodes.push({id:`town-request-${s.episodes.length+1}`,kind:c.kind,issuerId:c.issuerId,serviceId:c.serviceId,targetId:c.targetId,status:'offered',deadlineSteps:s.tuning.deadlineSeconds/TOWN_DIRECTOR_STEP,remainingSteps:s.tuning.deadlineSeconds/TOWN_DIRECTOR_STEP,evidence:{...c.evidence},accepted:null,contribution:null,outcome:null});
  s.revision++;added=true;slots--;if(slots<=0||s.episodes.length>=TOWN_DIRECTOR_EPISODE_LIMIT)break;
 }
 if(added)s.restSteps=s.tuning.restSeconds/TOWN_DIRECTOR_STEP;
}
function close(s:TownDirectorState,e:TownEpisode,life:TownLifeState,status:'completed'|'world-resolved'|'expired'|'declined',reason:TownDirectorOutcome['reason']) {
 e.status=status;e.outcome={...observe(life,e.kind,e.targetId),reason};s.restSteps=s.tuning.restSeconds/TOWN_DIRECTOR_STEP;s.revision++;
}
function reconcileMutable(s:TownDirectorState,life:TownLifeState) {
 for(const e of s.episodes)if(active(e)&&resolved(e.kind,observe(life,e.kind,e.targetId)))close(s,e,life,'world-resolved','recovered');
 s.observedLifeRevision=life.revision;
}
export function createTownDirector(life:TownLifeState,tuning:TownDirectorTuning=TOWN_DIRECTOR_DEFAULTS):TownDirectorState {
 life=requireLife(life);if(!validTownDirectorTuning(tuning))throw RangeError('Unsupported director tuning.');
 const s:TownDirectorState={seed:life.seed,version:1,revision:0,accumulator:0,phaseSteps:0,restSteps:0,observedLifeRevision:life.revision,tuning:{...tuning},episodes:[]};offer(s,life);return seal(s);
}
/** Reconcile immediately after an authoritative observation. Never issues player
 * credit. Call noteTownDirectorContribution BEFORE this for accepted commands. */
export function reconcileTownDirector(state:TownDirectorState,life:TownLifeState):TownDirectorState {
 life=requireLife(life);state=takeState(state,life);
 if(state.observedLifeRevision===life.revision&&!state.episodes.some(e=>active(e)&&resolved(e.kind,observe(life,e.kind,e.targetId))))return state;
 const s=structuredClone(state);reconcileMutable(s,life);return seal(s);
}
/** dt is only the current active-play integration delta, never wall time or a save
 * age. For exact progression call with each town fixed step (0.5 s). */
export function advanceTownDirector(state:TownDirectorState,life:TownLifeState,dt:number,tuning:TownDirectorTuning=state.tuning):TownDirectorState {
 if(!finite(dt,0,60)||!validTownDirectorTuning(tuning))throw RangeError('Director delta or tuning is outside the bounded active-play contract.');
 life=requireLife(life);state=takeState(state,life);const s=structuredClone(state);s.tuning={...tuning};reconcileMutable(s,life);
 const total=s.accumulator+dt,steps=Math.floor((total+1e-8)/TOWN_DIRECTOR_STEP),raw=total-steps*TOWN_DIRECTOR_STEP;s.accumulator=Math.abs(raw)<1e-8?0:Math.max(0,Math.round(raw*1e12)/1e12);
 for(let i=0;i<steps;i++){
  s.phaseSteps=(s.phaseSteps+1)%SCAN_STEPS;s.restSteps=Math.max(0,s.restSteps-1);
  for(const e of s.episodes)if(active(e)){e.remainingSteps=Math.max(0,e.remainingSteps-1);if(e.remainingSteps===0)close(s,e,life,'expired','deadline');}
  if(s.phaseSteps===0)offer(s,life);
 }
 return seal(s);
}
export function townDirectorInteractionPosition(state:TownDirectorState,episodeId:string):{x:number;z:number}|undefined {
 const e=state.episodes.find(e=>e.id===episodeId),f=e&&townLifeFacilities(state.seed).find(f=>f.id===e.serviceId&&f.kind!=='home');return f?{x:f.x,z:f.z}:undefined;
}
export function validTownDirectorCommand(v:unknown):v is TownDirectorCommand {
 return keys(v,['kind','episodeId','expectedRevision','expectedLifeRevision'])&&(v.kind==='accept'||v.kind==='decline')&&typeof v.episodeId==='string'&&/^town-request-([1-9]|1[0-9]|2[0-4])$/.test(v.episodeId)&&integer(v.expectedRevision,0,100)&&integer(v.expectedLifeRevision);
}
export function applyTownDirectorCommand(state:TownDirectorState,life:TownLifeState,context:TownDirectorActorContext,command:TownDirectorCommand):TownDirectorState|null {
 if(!validTownDirectorCommand(command)||!keys(context,['seed','zone','player'])||!keys(context.player,['x','z','hp'])||!integer(context.seed,0,0xffffffff)||context.zone!=='valley'||!finite(context.player.hp,.000001,100)||!finite(context.player.x,-1e6,1e6)||!finite(context.player.z,-1e6,1e6))return null;
 try{life=requireLife(life);state=takeState(state,life);}catch{return null;}
 if(context.seed!==state.seed||command.expectedRevision!==state.revision||command.expectedLifeRevision!==life.revision||state.observedLifeRevision!==life.revision)return null;
 const episode=state.episodes.find(e=>e.id===command.episodeId),p=townDirectorInteractionPosition(state,command.episodeId);
 if(!episode||!p||!active(episode)||episode.remainingSteps===0||resolved(episode.kind,observe(life,episode.kind,episode.targetId))||Math.hypot(context.player.x-p.x,context.player.z-p.z)>3.5||command.kind==='accept'&&episode.status!=='offered')return null;
 const s=structuredClone(state),e=s.episodes.find(e=>e.id===episode.id)!;
 if(command.kind==='decline')close(s,e,life,'declined','declined');else {e.status='accepted';e.accepted=observe(life,e.kind,e.targetId);s.revision++;}
 return seal(s);
}
function sameValue(a:unknown,b:unknown):boolean {
 if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>sameValue(v,b[i]));
 const ak=Object.keys(a),bk=Object.keys(b);return ak.length===bk.length&&ak.every(k=>Object.hasOwn(b,k)&&sameValue((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]));
}
/** Receives the exact command ONLY after the authoritative town reducer accepts
 * it. Replaying that reducer verifies the transition; aggregate contribution
 * counts alone never establish that this target was helped. */
export function noteTownDirectorContribution(state:TownDirectorState,before:TownLifeState,after:TownLifeState,command:TownLifeCommand):TownDirectorState {
 if(!validTownLifeCommand(command))return state;
 try{before=requireLife(before);after=requireLife(after);state=takeState(state,before);}catch{return state;}
 if(before.seed!==after.seed||state.observedLifeRevision!==before.revision||command.expectedRevision!==before.revision||after.revision!==before.revision+1||after.tick!==before.tick)return state;
 const p=townLifeCommandPosition(before,command);if(!p)return state;
 const expected=applyTownLifeCommand(before,{seed:before.seed,zone:'valley',player:{...p,hp:100},inventory:townLifeCommandCost(command.kind)},command);
 if(!expected||!sameValue(expected.life,after))return state;
 const s=structuredClone(state);
 for(const e of s.episodes){
  if(e.status!=='accepted'||!e.accepted||e.accepted.lifeRevision>before.revision||!matchingCommand(e,command)||e.remainingSteps===0)continue;
  const prior=observe(before,e.kind,e.targetId),next=observe(after,e.kind,e.targetId);
  if(resolved(e.kind,prior)||!(next.value>prior.value||next.aux<prior.aux))continue;
  e.contribution={command:{...command},lifeRevision:after.revision,tick:after.tick,beforeValue:prior.value,afterValue:next.value,beforeAux:prior.aux,afterAux:next.aux,count:Math.min(64,(e.contribution?.count??0)+1)};
  if(resolved(e.kind,next))close(s,e,after,'completed','helped');
 }
 reconcileMutable(s,after);return seal(s);
}
function observation(v:unknown,kind:TownEpisodeKind,revision:number,tick:number):v is TownDirectorObservation {
 return keys(v,['lifeRevision','tick','value','aux'])&&observationFields(v,kind,revision,tick);
}
function observationFields(v:Record<string,unknown>,kind:TownEpisodeKind,revision:number,tick:number):boolean {
 return integer(v.lifeRevision,0,revision)&&integer(v.tick,0,tick)&&finite(v.value,0,kind==='water-shortage'?1200:kind==='material-shortage'?600:100)&&finite(v.aux,0,kind==='service-wear'?480:kind==='resident-support'?100:0);
}
/** Strict inert import, with stable identity, causal snapshots and lifecycle
 * consistency. Unknown/accessor/prototype fields are rejected before reading. */
export function validTownDirector(v:unknown,life:TownLifeState):v is TownDirectorState {
 if(!validTownLife(life,life.seed)||!keys(v,['seed','version','revision','accumulator','phaseSteps','restSteps','observedLifeRevision','tuning','episodes'])||v.version!==1||v.seed!==life.seed||!integer(v.revision,0,96)||!finite(v.accumulator,0,TOWN_DIRECTOR_STEP-1e-8)||!integer(v.phaseSteps,0,SCAN_STEPS-1)||!integer(v.restSteps,0,600)||!integer(v.observedLifeRevision,0,life.revision)||!validTownDirectorTuning(v.tuning)||!array(v.episodes,TOWN_DIRECTOR_EPISODE_LIMIT))return false;
 const roster=townResidents(life.seed),facilities=townLifeFacilities(life.seed),repeat=new Map<string,number>(),activeKeys=new Set<string>();let revision=0,activeCount=0;
 for(let i=0;i<v.episodes.length;i++){
  const e=v.episodes[i];if(!keys(e,['id','kind','issuerId','serviceId','targetId','status','deadlineSteps','remainingSteps','evidence','accepted','contribution','outcome'])||e.id!==`town-request-${i+1}`||!KINDS.includes(e.kind as TownEpisodeKind)||!STATUSES.includes(e.status as TownEpisodeStatus)||typeof e.targetId!=='string')return false;
  const kind=e.kind as TownEpisodeKind,status=e.status as TownEpisodeStatus,target=e.targetId;
  if((kind==='water-shortage'&&target!=='well')||(kind==='material-shortage'&&target!=='workshop')||(kind==='service-wear'&&!facilities.some(f=>f.id===target&&f.kind!=='home'))||(kind==='resident-support'&&!roster.some(r=>r.id===target))||e.issuerId!==issuer(life.seed,kind,target)||e.serviceId!==service(kind,target)||!integer(e.deadlineSteps,240,720)||(e.deadlineSteps as number)%2!==0||!integer(e.remainingSteps,0,e.deadlineSteps as number))return false;
  const k=`${kind}:${target}`,n=(repeat.get(k)??0)+1;repeat.set(k,n);if(n>TOWN_DIRECTOR_REPEAT_LIMIT)return false;
  if(!keys(e.evidence,['lifeRevision','tick','value','aux','estimatedActions'])||!observationFields(e.evidence,kind,v.observedLifeRevision,life.tick)||!needed(kind,e.evidence as unknown as TownDirectorObservation)||!integer(e.evidence.estimatedActions,1,4)||e.evidence.estimatedActions!==actionsNeeded(kind,e.evidence as unknown as TownDirectorObservation))return false;
  const evidence=e.evidence as unknown as TownDirectorEvidence;
  if(e.accepted!==null&&(!observation(e.accepted,kind,v.observedLifeRevision,life.tick)||e.accepted.lifeRevision<evidence.lifeRevision||e.accepted.tick<evidence.tick||resolved(kind,e.accepted)))return false;
  if(e.contribution!==null){
   const c=e.contribution;
   if(!keys(c,['command','lifeRevision','tick','beforeValue','afterValue','beforeAux','afterAux','count'])||!validTownLifeCommand(c.command)||!matchingCommand({kind,targetId:target},c.command)||!integer(c.lifeRevision,1,v.observedLifeRevision)||c.command.expectedRevision!==c.lifeRevision-1||!integer(c.tick,evidence.tick,life.tick)||!integer(c.count,1,64)||e.accepted===null||c.lifeRevision<=(e.accepted as TownDirectorObservation).lifeRevision||c.tick<(e.accepted as TownDirectorObservation).tick)return false;
   const b={lifeRevision:c.lifeRevision,tick:c.tick,value:c.beforeValue,aux:c.beforeAux},a={...b,value:c.afterValue,aux:c.afterAux};
   if(!observationFields(b,kind,v.observedLifeRevision,life.tick)||!observationFields(a,kind,v.observedLifeRevision,life.tick)||resolved(kind,b as TownDirectorObservation)||!((c.afterValue as number)>(c.beforeValue as number)||(c.afterAux as number)<(c.beforeAux as number)))return false;
   const valueBefore=c.beforeValue as number,valueAfter=c.afterValue as number,auxBefore=c.beforeAux as number,auxAfter=c.afterAux as number;
   if(kind==='water-shortage'||kind==='material-shortage'){if(Math.abs(valueAfter-valueBefore-12)>1e-6||auxAfter!==0||auxBefore!==0)return false;}
   else if(kind==='service-wear'){if(valueBefore>60||valueAfter!==Math.min(100,valueBefore+40)||auxAfter!==0)return false;}
   else if(valueAfter!==Math.min(100,valueBefore+10)||auxAfter!==Math.max(0,auxBefore-12))return false;
  }
  if(e.outcome!==null&&(!keys(e.outcome,['lifeRevision','tick','value','aux','reason'])||!observationFields(e.outcome,kind,v.observedLifeRevision,life.tick)||(e.outcome.tick as number)<evidence.tick||(e.outcome.lifeRevision as number)<evidence.lifeRevision))return false;
  const outcome=e.outcome as unknown as TownDirectorOutcome|null,contribution=e.contribution as unknown as TownDirectorContribution|null;
  if(contribution&&(contribution.count>contribution.lifeRevision-(e.accepted as TownDirectorObservation).lifeRevision||status!=='completed'&&resolved(kind,{value:contribution.afterValue,aux:contribution.afterAux})))return false;
  if(status==='offered'||status==='accepted'){
   activeCount++;if(activeKeys.has(k)||e.remainingSteps===0||outcome!==null||status==='offered'&&(e.accepted!==null||contribution!==null)||status==='accepted'&&e.accepted===null)return false;activeKeys.add(k);
  }else{
   if(!outcome||status!=='expired'&&e.remainingSteps===0||(status==='expired'||status==='declined')&&resolved(kind,outcome)||status==='completed'&&(outcome.reason!=='helped'||!contribution||!e.accepted||!resolved(kind,outcome)||outcome.lifeRevision!==contribution.lifeRevision||outcome.tick!==contribution.tick||outcome.value!==contribution.afterValue||outcome.aux!==contribution.afterAux)||status==='world-resolved'&&(outcome.reason!=='recovered'||!resolved(kind,outcome))||status==='expired'&&(outcome.reason!=='deadline'||e.remainingSteps!==0)||status==='declined'&&outcome.reason!=='declined')return false;
   if(e.accepted!==null&&(outcome.lifeRevision<(e.accepted as TownDirectorObservation).lifeRevision||outcome.tick<(e.accepted as TownDirectorObservation).tick)||contribution&&(outcome.lifeRevision<contribution.lifeRevision||outcome.tick<contribution.tick))return false;
  }
  revision+=1+(e.accepted!==null?1:0)+(outcome!==null?1:0);
 }
 return activeCount<=2&&revision===v.revision&&JSON.stringify(v).length<=TOWN_DIRECTOR_SERIALIZED_LIMIT;
}
export function immutableTownDirector(v:unknown,life:TownLifeState):TownDirectorState {
 if(trusted.has(v as TownDirectorState)){const s=v as TownDirectorState;if(s.seed!==life.seed||s.observedLifeRevision>life.revision||latestRecordedTick(s)>life.tick)throw RangeError('Director and town authority do not match.');return s;}
 if(!validTownDirector(v,life))throw RangeError('Unsupported town director state.');return seal(structuredClone(v));
}
export function validTownDirectorPreset(v:unknown):v is TownDirectorPreset {
 return keys(v,['kind','version','seed','scenario','tuning'])&&v.kind==='axiom-town-director-preset'&&v.version===1&&integer(v.seed,0,0xffffffff)&&TOWN_DIRECTOR_SCENARIOS.some(s=>s.id===v.scenario)&&validTownDirectorTuning(v.tuning);
}
export function exportTownDirectorPreset(preset:TownDirectorPreset):string {
 if(!validTownDirectorPreset(preset))throw RangeError('Unsupported director preset.');return JSON.stringify(preset,null,2);
}
export function importTownDirectorPreset(text:string):TownDirectorPreset {
 if(typeof text!=='string'||text.length>4096)throw RangeError('Director preset exceeds 4 KB.');let value:unknown;try{value=JSON.parse(text);}catch{throw RangeError('Director preset must be JSON.');}
 if(!validTownDirectorPreset(value))throw RangeError('Unsupported director preset.');return freeze(structuredClone(value));
}
export function createTownDirectorScenario(seed:number,scenario:TownDirectorScenario,tuning:TownDirectorTuning=TOWN_DIRECTOR_DEFAULTS):{life:TownLifeState;director:TownDirectorState} {
 if(!integer(seed,0,0xffffffff)||!TOWN_DIRECTOR_SCENARIOS.some(s=>s.id===scenario)||!validTownDirectorTuning(tuning))throw RangeError('Unsupported director scenario.');
 const life=createTownLifeScenario(seed,scenario);return freeze({life,director:createTownDirector(life,tuning)});
}
export function townDirectorTitle(e:TownEpisode,seed:number):string {
 if(e.kind==='water-shortage')return 'Replenish shared town water';if(e.kind==='material-shortage')return 'Replenish shared repair materials';
 if(e.kind==='service-wear')return `Restore ${townLifeFacilities(seed).find(f=>f.id===e.targetId)?.label??e.targetId}`;
 return `Support ${townResidents(seed).find(r=>r.id===e.targetId)?.name??e.targetId}`;
}
export function townDirectorGoalText(e:Pick<TownEpisode,'kind'>):string {
 return e.kind==='water-shortage'?'Raise shared water to at least 40 portions.':e.kind==='material-shortage'?'Raise shared materials to at least 16 portions.':e.kind==='service-wear'?'Restore service condition above 60 and reopen the station.':'Help this resident reach 30 connection and 60 or lower stress.';
}
export const TOWN_DIRECTOR_ENGINE=Object.freeze({kind:'axiom-town-director',create:createTownDirector,advance:advanceTownDirector,reconcile:reconcileTownDirector,command:applyTownDirectorCommand,note:noteTownDirectorContribution,validate:validTownDirector,immutable:immutableTownDirector,candidates:townDirectorCandidates});
