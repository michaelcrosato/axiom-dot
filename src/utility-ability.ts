import {restorationExactData,type RestorationOrgan} from './restoration-body.ts';

/** Fixed .25-second utility clock. Pure decisions only; the habitat authority owns all ledgers. */
export const UTILITY_VERSION=1 as const;
export const UTILITY_TICK_SECONDS=.25;
export const UTILITY_RECIPE_MAX_BYTES=512;
export type UtilityDelivery='contact'|'jet'|'local-field';
export type UtilityTempo='careful'|'steady'|'brisk';
export interface UtilityRecipeInput {version:1;organ:RestorationOrgan;strength:1|2|3;tempo:UtilityTempo}
export interface UtilityAbilityPlan {version:1;recipe:UtilityRecipeInput;delivery:UtilityDelivery;prepTicks:number;activeTicks:number;recoveryTicks:number;cooldownTicks:number;strengthUnits:number;strengthUnit:'ml'|'contamination units'|'heat units'|'scent units';energyCost:number;filtrationCost:number}
export const DEFAULT_UTILITY_RECIPE:Readonly<UtilityRecipeInput>=Object.freeze({version:1,organ:'pump',strength:1,tempo:'steady'});
export const UTILITY_TUNING_DESCRIPTORS=Object.freeze([
 {key:'strength',default:1,min:1,max:3,integer:true,unit:'strength tier',description:'Scales real effect and finite charge/cartridge demand',consumer:'utility pulse',effect:'next accepted action'},
 {key:'tempo',default:'steady',values:Object.freeze(['careful','steady','brisk']),unit:'cadence',description:'Trades preparation/recovery/cooldown against charge cost',consumer:'utility timer and charge debit',effect:'next accepted action'},
 {key:'workSpeed',default:1,min:.8,max:1.2,unit:'work ticks/tick',description:'Compiler-owned support speed shortens or lengthens prep only',consumer:'utility preparation',effect:'latched on acceptance'},
] as const);
const organs=['pump','filter','vent','beacon'] as const,tempos=['careful','steady','brisk'] as const;
const safeInt=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const finite=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const targetId=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_/-]{0,79}$/.test(v)&&!v.includes('//')&&!v.split('/').some(k=>['__proto__','prototype','constructor'].includes(k));
const freeze=<T>(v:T):T=>{if(v&&typeof v==='object'){for(const item of Object.values(v))freeze(item);Object.freeze(v);}return v;};
export function validUtilityRecipeInput(v:unknown):v is UtilityRecipeInput {try{return restorationExactData(v,['version','organ','strength','tempo'])&&v.version===1&&organs.includes(v.organ as RestorationOrgan)&&safeInt(v.strength,1,3)&&tempos.includes(v.tempo as UtilityTempo);}catch{return false;}}
const abilityCache=new Map<string,UtilityAbilityPlan>();
export function compileUtilityAbility(input:UtilityRecipeInput):UtilityAbilityPlan {
 if(!validUtilityRecipeInput(input))throw new Error('Invalid utility recipe: expected version, organ, strength tier 1–3 and registered tempo');
 const recipe:UtilityRecipeInput={version:1,organ:input.organ,strength:input.strength,tempo:input.tempo},cacheKey=JSON.stringify(recipe),cached=abilityCache.get(cacheKey);if(cached)return cached;
 const base={pump:{delivery:'jet',prep:4,active:2,recovery:3,cooldown:3,strength:1000,unit:'ml',energy:4},filter:{delivery:'contact',prep:5,active:3,recovery:3,cooldown:4,strength:400,unit:'contamination units',energy:5},vent:{delivery:'local-field',prep:3,active:3,recovery:2,cooldown:3,strength:80,unit:'heat units',energy:3},beacon:{delivery:'local-field',prep:3,active:2,recovery:2,cooldown:4,strength:40,unit:'scent units',energy:2}}[recipe.organ] as {delivery:UtilityDelivery;prep:number;active:number;recovery:number;cooldown:number;strength:number;unit:UtilityAbilityPlan['strengthUnit'];energy:number};
 const delta=recipe.tempo==='careful'?2:recipe.tempo==='brisk'?-1:0,strengthUnits=base.strength*recipe.strength;
 const compiled:UtilityAbilityPlan=freeze({version:1,recipe,delivery:base.delivery,prepTicks:base.prep+delta,activeTicks:base.active,recoveryTicks:base.recovery+delta,cooldownTicks:base.cooldown+delta,strengthUnits,strengthUnit:base.unit,energyCost:(base.energy+(recipe.tempo==='careful'?-1:recipe.tempo==='brisk'?2:0))*recipe.strength,filtrationCost:recipe.organ==='filter'?strengthUnits:0});
 if(abilityCache.size>=64)abilityCache.delete(abilityCache.keys().next().value!);abilityCache.set(cacheKey,compiled);return compiled;
}
export function parseUtilityRecipe(raw:string):UtilityRecipeInput {
 if(typeof raw!=='string'||raw.length>UTILITY_RECIPE_MAX_BYTES||new TextEncoder().encode(raw).length>UTILITY_RECIPE_MAX_BYTES)throw new Error('Utility recipe exceeds 512 bytes');let v:unknown;try{v=JSON.parse(raw);}catch{throw new Error('Utility recipe is not JSON');}if(!validUtilityRecipeInput(v))throw new Error('Unsupported utility recipe');return {...compileUtilityAbility(v).recipe};
}
export function validUtilityAbilityPlan(v:unknown):v is UtilityAbilityPlan {
 try {if(!restorationExactData(v,['version','recipe','delivery','prepTicks','activeTicks','recoveryTicks','cooldownTicks','strengthUnits','strengthUnit','energyCost','filtrationCost'])||!validUtilityRecipeInput(v.recipe))return false;const p=compileUtilityAbility(v.recipe);return Object.keys(p).every(key=>key==='recipe'||v[key]===p[key as keyof UtilityAbilityPlan]);}catch{return false;}
}
export type UtilityPhase='idle'|'prep'|'active'|'recovery'|'cooldown';
export type UtilityRejectReason='invalid'|'replayed'|'busy'|'energy'|'filtration';
export type UtilityInterruptReason='stop'|'refit'|'blocked'|'heat'|'depleted'|'invalid';
export interface UtilityIntent {intentId:number;sourceId:string;targetId:string}
export interface UtilityReceipt {intentId:number;castId:number;status:'accepted'|'rejected';reason:UtilityRejectReason|null}
export interface UtilityState {
 version:1;timeTicks:number;phase:UtilityPhase;remainingTicks:number;castId:number;lastIntentId:number;
 recipe:UtilityAbilityPlan|null;target:{sourceId:string;targetId:string}|null;intentId:number|null;
 workSpeed:number;prepTicks:number;pulsed:boolean;receipt:UtilityReceipt|null;
}
export interface UtilityRequestContext {energyAvailable:number;filtrationAvailable:number;workSpeed:number}
export interface UtilityStepContext {energyAvailable:number;filtrationAvailable:number;interrupted:boolean;occluded:boolean;overheated:boolean}
export interface UtilityPulse {castId:number;intentId:number;sourceId:string;targetId:string;organ:RestorationOrgan;delivery:UtilityDelivery;effectUnits:number;consumedEnergy:number;consumedFiltration:number}
export type UtilityEvent={type:'phase';phase:UtilityPhase;castId:number;atTick:number}|{type:'rejected';reason:UtilityRejectReason;castId:number;atTick:number}|{type:'interrupted';reason:UtilityInterruptReason;castId:number;atTick:number}|{type:'pulse';pulse:UtilityPulse;castId:number;atTick:number};
export interface UtilityResult {state:UtilityState;events:UtilityEvent[];pulse:UtilityPulse|null}
export function createUtilityState():UtilityState{return {version:1,timeTicks:0,phase:'idle',remainingTicks:0,castId:0,lastIntentId:0,recipe:null,target:null,intentId:null,workSpeed:1,prepTicks:0,pulsed:false,receipt:null};}
export function utilityBusy(state:UtilityState):boolean{return state.phase!=='idle';}
const result=(state:UtilityState,events:UtilityEvent[]=[],pulse:UtilityPulse|null=null):UtilityResult=>({state,events,pulse});
const base=(state:UtilityState)=>({castId:state.castId,atTick:state.timeTicks});
const validIntent=(v:unknown):v is UtilityIntent=>restorationExactData(v,['intentId','sourceId','targetId'])&&safeInt(v.intentId,1)&&targetId(v.sourceId)&&targetId(v.targetId);
const available=(v:unknown)=>safeInt(v,0,1000000000);
function validRequestContext(v:unknown):v is UtilityRequestContext{return restorationExactData(v,['energyAvailable','filtrationAvailable','workSpeed'])&&available(v.energyAvailable)&&available(v.filtrationAvailable)&&finite(v.workSpeed,.8,1.2);}
function validStepContext(v:unknown):v is UtilityStepContext{return restorationExactData(v,['energyAvailable','filtrationAvailable','interrupted','occluded','overheated'])&&available(v.energyAvailable)&&available(v.filtrationAvailable)&&typeof v.interrupted==='boolean'&&typeof v.occluded==='boolean'&&typeof v.overheated==='boolean';}
/** Monotonic intent numbers prevent delayed A/B/A packets from creating a second pulse. */
export function requestUtility(state:UtilityState,input:UtilityRecipeInput,intent:UtilityIntent,context:UtilityRequestContext):UtilityResult {
 if(!validUtilityState(state))return result(state,[{...base(createUtilityState()),type:'rejected',reason:'invalid'}]);
 const valid=validIntent(intent),recipe=validUtilityRecipeInput(input)?compileUtilityAbility(input):null;
 const reason:UtilityRejectReason|null=!valid||!recipe||!validRequestContext(context)?'invalid':intent.intentId<=state.lastIntentId?'replayed':utilityBusy(state)?'busy':context.energyAvailable<recipe.energyCost?'energy':recipe.filtrationCost>0&&context.filtrationAvailable===0?'filtration':state.castId===Number.MAX_SAFE_INTEGER?'invalid':null;
 if(reason){if(!valid||intent.intentId<=state.lastIntentId)return result(state,[{...base(state),type:'rejected',reason}]);const next:UtilityState={...state,lastIntentId:intent.intentId,receipt:{intentId:intent.intentId,castId:state.castId,status:'rejected',reason}};return result(next,[{...base(next),type:'rejected',reason}]);}
 const prepTicks=Math.ceil(recipe!.prepTicks/context.workSpeed),next:UtilityState={...state,phase:'prep',remainingTicks:prepTicks,castId:state.castId+1,lastIntentId:intent.intentId,recipe:recipe!,target:freeze({sourceId:intent.sourceId,targetId:intent.targetId}),intentId:intent.intentId,workSpeed:context.workSpeed,prepTicks,pulsed:false,receipt:{intentId:intent.intentId,castId:state.castId+1,status:'accepted',reason:null}};
 return result(next,[{...base(next),type:'phase',phase:'prep'}]);
}
/** Cancelling never grants charge, cartridge capacity or an immediate recast. */
export function interruptUtility(state:UtilityState,reason:UtilityInterruptReason):UtilityResult {
 if(!validUtilityState(state)||!['stop','refit','blocked','heat','depleted','invalid'].includes(reason))return result(state);
 if(state.phase==='idle'||state.phase==='cooldown'||!state.recipe)return result(state);
 const next:UtilityState={...state,phase:'cooldown',remainingTicks:state.recipe.cooldownTicks};return result(next,[{...base(next),type:'interrupted',reason},{...base(next),type:'phase',phase:'cooldown'}]);
}
function clear(state:UtilityState):UtilityState{return {...state,phase:'idle',remainingTicks:0,recipe:null,target:null,intentId:null,workSpeed:1,prepTicks:0,pulsed:false};}
/** Advance exactly one tick. Caller applies each returned pulse once in its authoritative step. */
export function stepUtility(state:UtilityState,context:UtilityStepContext):UtilityResult {
 if(!validUtilityState(state)||!validStepContext(context)||state.timeTicks===Number.MAX_SAFE_INTEGER)return result(state);
 let next:UtilityState={...state,timeTicks:state.timeTicks+1};
 if(next.phase==='idle')return result(next);
 const reason:UtilityInterruptReason|null=context.interrupted?'stop':context.occluded?'blocked':context.overheated?'heat':null;
 if(reason&&next.phase!=='cooldown')return interruptUtility(next,reason);
 next={...next,remainingTicks:next.remainingTicks-1};if(next.remainingTicks>0)return result(next);
 const recipe=next.recipe!;
 if(next.phase==='prep'){
  if(context.energyAvailable<recipe.energyCost||recipe.filtrationCost>0&&context.filtrationAvailable===0){const paused:UtilityState={...next,remainingTicks:1};return interruptUtility(paused,'depleted');}
  const effectUnits=recipe.filtrationCost>0?Math.min(recipe.strengthUnits,context.filtrationAvailable):recipe.strengthUnits,pulse:UtilityPulse={castId:next.castId,intentId:next.intentId!,sourceId:next.target!.sourceId,targetId:next.target!.targetId,organ:recipe.recipe.organ,delivery:recipe.delivery,effectUnits,consumedEnergy:recipe.energyCost,consumedFiltration:recipe.filtrationCost>0?effectUnits:0};
  next={...next,phase:'active',remainingTicks:recipe.activeTicks,pulsed:true};return result(next,[{...base(next),type:'phase',phase:'active'},{...base(next),type:'pulse',pulse}],pulse);
 }
 const phase=next.phase==='active'?'recovery':next.phase==='recovery'?'cooldown':'idle';
 next=phase==='idle'?clear(next):{...next,phase,remainingTicks:phase==='recovery'?recipe.recoveryTicks:recipe.cooldownTicks};return result(next,[{...base(next),type:'phase',phase}]);
}
/** Strict save/import validator, including canonical compiled recipe and clock invariants. */
export function validUtilityState(v:unknown):v is UtilityState {
 try{
  if(!restorationExactData(v,['version','timeTicks','phase','remainingTicks','castId','lastIntentId','recipe','target','intentId','workSpeed','prepTicks','pulsed','receipt'])||v.version!==1||!safeInt(v.timeTicks)||!safeInt(v.castId)||!safeInt(v.lastIntentId)||!safeInt(v.remainingTicks,0,16)||!safeInt(v.prepTicks,0,16)||(typeof v.phase!=='string'||!['idle','prep','active','recovery','cooldown'].includes(v.phase))||typeof v.pulsed!=='boolean'||!finite(v.workSpeed,.8,1.2))return false;
  const s=v as unknown as UtilityState;if(s.castId>s.lastIntentId)return false;
  if(s.receipt!==null){const r=s.receipt;if(!restorationExactData(r,['intentId','castId','status','reason'])||!safeInt(r.intentId,1)||r.intentId!==s.lastIntentId||!safeInt(r.castId,0,s.castId)||!['accepted','rejected'].includes(r.status)||r.status==='accepted'&&(r.reason!==null||r.castId!==s.castId||r.castId===0)||r.status==='rejected'&&(typeof r.reason!=='string'||!['invalid','replayed','busy','energy','filtration'].includes(r.reason)))return false;}else if(s.lastIntentId!==0||s.castId!==0)return false;
  if(s.phase==='idle')return s.remainingTicks===0&&s.recipe===null&&s.target===null&&s.intentId===null&&s.workSpeed===1&&s.prepTicks===0&&!s.pulsed;
  if(!validUtilityAbilityPlan(s.recipe)||!restorationExactData(s.target,['sourceId','targetId'])||!targetId(s.target.sourceId)||!targetId(s.target.targetId)||!safeInt(s.intentId,1,s.lastIntentId)||s.castId===0||s.remainingTicks===0||s.prepTicks!==Math.ceil(s.recipe.prepTicks/s.workSpeed))return false;
  const duration=s.phase==='prep'?s.prepTicks:s.phase==='active'?s.recipe.activeTicks:s.phase==='recovery'?s.recipe.recoveryTicks:s.recipe.cooldownTicks;
  return s.remainingTicks<=duration&&(s.phase==='prep'?!s.pulsed:s.phase==='active'||s.phase==='recovery'?s.pulsed:true);
 }catch{return false;}
}
