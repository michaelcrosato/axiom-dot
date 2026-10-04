import {worldValley} from './generation.ts';
import {hashSeed,seedSample,type Vec3} from './procedural.ts';
import {valleySurfaceHeight,type ValleyPlan} from './valley.ts';

/** Optional, bounded field ecology. Original terrain, plants and resource manifests are never modified. */
export const ECOLOGY_RULES=Object.freeze({version:1,plots:3,plotHalf:1.05,standingClearance:.8,preferredCandidates:144,fallbackCandidates:1369,step:.25,maxSteps:4,weatherSeconds:24,daySeconds:240,soilCapacity:8,initialSoilWater:1.6,canisterWater:4,maxCanisters:48,starterSeeds:12,harvestYield:2,biomassCapacity:6,bioGelCapacity:3,biomassPerGel:2,repairHP:20,growthRequired:30,interactionReach:3.5});
export type EcologySpecies='sunleaf'|'reedmoss';
export type EcologyWeatherKind='clear'|'overcast'|'rain'|'breeze';
export type EcologyHabitat='sunny'|'sheltered';
export const ECOLOGY_CROPS=Object.freeze({
 sunleaf:Object.freeze({name:'Sunleaf',preferredHabitat:'sunny',temperature:22,temperatureTolerance:13,optimalMoisture:52/15,uptake:2/75}),
 reedmoss:Object.freeze({name:'Reedmoss',preferredHabitat:'sheltered',temperature:17,temperatureTolerance:13,optimalMoisture:5.2,uptake:.032})
});
export const ECOLOGY_CLIMATE=Object.freeze({baseTemperature:18,temperatureSpan:7,rainLitresPerSecond:8/75,evaporationLitresPerSecond:Object.freeze({rain:.025*2/15,breeze:.16*2/15,clear:.13*2/15,overcast:.07*2/15}),soilMillilitresPerLitre:1000});
export const ECOLOGY_ACTIONS=Object.freeze({
 plant:Object.freeze({seedPackets:1,output:'one planted crop',requires:'empty reachable bed'}),
 water:Object.freeze({waterCanisters:1,soilMillilitres:4000,requires:'reachable bed with at least 4 L free capacity'}),
 harvest:Object.freeze({ripeCrops:1,biomass:2,requires:'reachable ripe bed and biomass pouch capacity'}),
 'craft-gel':Object.freeze({biomass:2,bioGel:1,requires:'reachable bed and gel pouch capacity'}),
 'use-gel':Object.freeze({bioGel:1,maxSuitIntegrity:20,requires:'living architect with missing suit integrity'})
});
export const ECOLOGY_HASH=hashSeed(JSON.stringify([ECOLOGY_RULES,ECOLOGY_CROPS,ECOLOGY_CLIMATE,ECOLOGY_ACTIONS,'safe-valley-plots@1','seeded-weather-ledger@1'])).toString(16).padStart(8,'0');
export interface EcologyPlotPlan {id:string;name:string;position:Vec3;habitat:EcologyHabitat;shade:number;retention:number;temperatureOffset:number}
export interface EcologyPlan {version:1;seed:number;plots:EcologyPlotPlan[];candidateCount:number;fallbackUsed:boolean;maxCandidates:number}
export interface EcologyCrop {species:EcologySpecies;growth:number;plantedTick:number}
export interface EcologyPlot {id:string;soilWater:number;crop:EcologyCrop|null}
export interface EcologyWaterLedger {initial:number;rain:number;irrigation:number;evaporated:number;uptake:number;runoff:number}
export type EcologyRecordKind='planted'|'watered'|'harvested'|'crafted'|'used'|'sprouted'|'budding'|'ripe';
export interface EcologyRecord {id:string;kind:EcologyRecordKind;tick:number;plotId:string|null;species:EcologySpecies|null;amount:number;revision:number}
export interface EcologyState {version:1;hash:string;seed:number;tick:number;remainder:number;revision:number;seeds:number;biomass:number;bioGel:number;harvested:number;crafted:number;used:number;restoredHP:number;canistersSpent:number;plots:EcologyPlot[];water:EcologyWaterLedger;records:EcologyRecord[]}
export interface EcologyInventory {scrap:number;core:number;water:number}
export interface EcologyContext {seed:number;generation:number;zone:string;player:{x:number;z:number;hp:number};inventory:EcologyInventory}
export type EcologyCommand=({type:'plant';plotId:string;species:EcologySpecies}|{type:'water'|'harvest';plotId:string}|{type:'craft-gel'|'use-gel'})&{expectedRevision:number};
const EPS=1e-8;
/** Soil and ledger values are integer millilitres; public rates/capacities use litres (1,000 mL). */
export const ECOLOGY_WATER_SCALE=ECOLOGY_CLIMATE.soilMillilitresPerLitre;
const MAX_VALID_TICK=4_000_000_000_000; // More than 31,000 years of active play; keeps every cumulative mL below safe-integer limits.
const EPOCH_TICKS=ECOLOGY_RULES.weatherSeconds/ECOLOGY_RULES.step;
const CYCLE_TICKS=EPOCH_TICKS*4;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const validSeed=(seed:number)=>Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff;
const segmentDistance=(p:{x:number;z:number},a:{x:number;z:number},b:{x:number;z:number})=>{const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);};
const squareDistance=(p:{x:number;z:number},x:number,z:number,hx:number,hz:number)=>Math.hypot(Math.max(0,Math.abs(p.x-x)-hx),Math.max(0,Math.abs(p.z-z)-hz));
/** Uses actual production reservations, dense road segments, solids, river, resources and native foliage. */
export function ecologyPlotClearance(plan:ValleyPlan,p:{x:number;z:number},others:readonly {position:Vec3}[]=[]):boolean {
 const radius=ECOLOGY_RULES.plotHalf*Math.SQRT2+ECOLOGY_RULES.standingClearance;
 if(!Number.isFinite(p.x)||!Number.isFinite(p.z)||Math.max(Math.abs(p.x),Math.abs(p.z))>plan.terrain.bound-radius-1)return false;
 if(plan.reservations.some(r=>squareDistance(p,r.x,r.z,r.hx,r.hz)<radius+(r.clearance??0)))return false;
 if([...plan.bridges,...plan.foundations,...plan.infrastructure,...plan.buildings.flatMap(b=>b.plan.shapes)].some(s=>s.solid&&squareDistance(p,s.center.x,s.center.z,s.half.x,s.half.z)<radius))return false;
 if(plan.roads.some(r=>r.points.some((b,i)=>i>0&&segmentDistance(p,r.points[i-1]!,b)<r.width/2+radius+1)))return false;
 if(plan.river.points.some((b,i)=>i>0&&segmentDistance(p,plan.river.points[i-1]!,b)<plan.river.width/2+radius+2))return false;
 if(plan.decorations.some(d=>Math.hypot(d.x-p.x,d.z-p.z)<d.radius+radius+.25))return false;
 if(plan.objects.some(o=>Math.hypot(o.x-p.x,o.z-p.z)<radius+(o.kind==='enemy'?12:2.5)))return false;
 if(others.some(o=>Math.hypot(o.position.x-p.x,o.position.z-p.z)<radius*2+1))return false;
 const y=valleySurfaceHeight(plan,p.x,p.z);
 return [-1,0,1].every(x=>[-1,0,1].every(z=>Math.abs(valleySurfaceHeight(plan,p.x+x*radius,p.z+z*radius)-y)<=.32))&&y>plan.river.waterLevel+.8;
}
const planCache=new Map<number,EcologyPlan>();
/** Finite preferred rings, then a deterministic exhaustive 37×37 fallback. Never clear/reseed native plants. */
export function ecologyPlan(seed:number):EcologyPlan {
 if(!validSeed(seed))throw new RangeError('Ecology seed must be an unsigned 32-bit integer');
 const cached=planCache.get(seed);if(cached)return cached;
 const valley=worldValley(seed),plots:EcologyPlotPlan[]=[],sample=(path:string,purpose:string)=>seedSample(seed,1,'ecology',path,purpose);
 let candidateCount=0,fallbackUsed=false;
 const accept=(p:{x:number;z:number})=>{
  candidateCount++;if(!ecologyPlotClearance(valley,p,plots))return;
  const index=plots.length,id=`ecology:1:${seed}:plot/${index}`,nearestTree=Math.min(30,...valley.decorations.filter(d=>d.kind==='tree').map(d=>Math.hypot(d.x-p.x,d.z-p.z)-d.radius)),shade=clamp((11-nearestTree)/11,0,1),y=valleySurfaceHeight(valley,p.x,p.z);
  plots.push({id,name:['Camp garden','Field bed','Nursery bed'][index]!,position:{x:p.x,y,z:p.z},habitat:shade>=.45?'sheltered':'sunny',shade,retention:.8+shade*.3+sample(id,'soil')*.2,temperatureOffset:-y*.35-shade*2});
 };
 const anchors=[valley.endpoints.spawn,...valley.settlements.map(s=>s.center)];
 for(let n=0;n<ECOLOGY_RULES.preferredCandidates&&plots.length<ECOLOGY_RULES.plots;n++){
  const anchor=anchors[Math.floor(n/48)]!,ring=Math.floor(n%48/12),angle=(n%12)/12*Math.PI*2+sample(`anchor/${Math.floor(n/48)}`,'angle')*.4,radius=9+ring*6;
  accept({x:Math.round((anchor.x+Math.cos(angle)*radius)*100)/100,z:Math.round((anchor.z+Math.sin(angle)*radius)*100)/100});
 }
 if(plots.length<ECOLOGY_RULES.plots){
  fallbackUsed=true;const grid=Array.from({length:ECOLOGY_RULES.fallbackCandidates},(_,n)=>({x:-72+n%37*4,z:-72+Math.floor(n/37)*4}));
  grid.sort((a,b)=>Math.hypot(a.x-valley.endpoints.spawn.x,a.z-valley.endpoints.spawn.z)-Math.hypot(b.x-valley.endpoints.spawn.x,b.z-valley.endpoints.spawn.z)||a.z-b.z||a.x-b.x);
  for(const p of grid){if(plots.length===ECOLOGY_RULES.plots)break;accept(p);}
 }
 if(plots.length!==ECOLOGY_RULES.plots)throw new Error('No safe optional ecology layout within the declared candidate budget');
 const result:EcologyPlan={version:1,seed,plots,candidateCount,fallbackUsed,maxCandidates:ECOLOGY_RULES.preferredCandidates+ECOLOGY_RULES.fallbackCandidates};
 // Freeze optional planning data, never a shared original valley object.
 for(const p of result.plots){Object.freeze(p.position);Object.freeze(p);}Object.freeze(result.plots);Object.freeze(result);
 if(planCache.size>=8)planCache.clear();planCache.set(seed,result);return result;
}
export function ecologyWeather(seed:number,seconds:number){
 const elapsed=clamp(Number.isFinite(seconds)?seconds:0,0,MAX_VALID_TICK*ECOLOGY_RULES.step),epoch=Math.floor(elapsed/ECOLOGY_RULES.weatherSeconds),phase=hashSeed(`ecology/weather/${seed}`)%4;
 const kind=(['clear','overcast','rain','breeze'] as const)[(epoch+phase)%4]!,light=.65+.35*Math.sin((elapsed%ECOLOGY_RULES.daySeconds)/ECOLOGY_RULES.daySeconds*Math.PI*2+seedSample(seed,1,'ecology','climate','day-phase')*Math.PI*2);
 const weatherCooling=kind==='rain'?-3:kind==='overcast'?-1:kind==='breeze'?-2:1;
 return {kind,epoch,temperature:ECOLOGY_CLIMATE.baseTemperature+ECOLOGY_CLIMATE.temperatureSpan*light+weatherCooling,light:kind==='rain'?light*.55:kind==='overcast'?light*.72:light,rainRate:kind==='rain'?ECOLOGY_CLIMATE.rainLitresPerSecond:0,evaporationRate:ECOLOGY_CLIMATE.evaporationLitresPerSecond[kind],nextIn:ECOLOGY_RULES.weatherSeconds-elapsed%ECOLOGY_RULES.weatherSeconds};
}
export function ecologyStage(crop:EcologyCrop|null):'empty'|'seeded'|'sprouted'|'budding'|'ripe' {return !crop?'empty':crop.growth>=30-EPS?'ripe':crop.growth>=20-EPS?'budding':crop.growth>=10-EPS?'sprouted':'seeded';}
export function createEcologyState(seed:number):EcologyState {
 const plan=ecologyPlan(seed);
 return {version:1,hash:ECOLOGY_HASH,seed,tick:0,remainder:0,revision:0,seeds:ECOLOGY_RULES.starterSeeds,biomass:0,bioGel:0,harvested:0,crafted:0,used:0,restoredHP:0,canistersSpent:0,plots:plan.plots.map(p=>({id:p.id,soilWater:ECOLOGY_RULES.initialSoilWater*ECOLOGY_WATER_SCALE,crop:null})),water:{initial:plan.plots.length*Math.round(ECOLOGY_RULES.initialSoilWater*ECOLOGY_WATER_SCALE),rain:0,irrigation:0,evaporated:0,uptake:0,runoff:0},records:[]};
}
function record(s:EcologyState,kind:EcologyRecordKind,plotId:string|null=null,species:EcologySpecies|null=null,amount=0){s.records.push({id:`ecology:1:${s.seed}:event/${s.records.length+1}`,kind,tick:s.tick,plotId,species,amount,revision:s.revision});}
function factors(s:EcologyState,p:EcologyPlot,plan:EcologyPlotPlan,weather=ecologyWeather(s.seed,s.tick*ECOLOGY_RULES.step)){
 if(!p.crop)return {moisture:0,temperature:0,habitat:0,rate:0};
 const crop=ECOLOGY_CROPS[p.crop.species],moisture=clamp((p.soilWater/ECOLOGY_WATER_SCALE-.4)/(crop.optimalMoisture-.4),0,1)*(p.soilWater>7.2*ECOLOGY_WATER_SCALE?.6:1),temperature=clamp(1-Math.abs(weather.temperature+plan.temperatureOffset-crop.temperature)/crop.temperatureTolerance,.1,1),habitat=crop.preferredHabitat===plan.habitat?1:.68;
 return {moisture,temperature,habitat,rate:moisture*temperature*habitat*(.7+.3*weather.light)};
}
function waterRates(pp:EcologyPlotPlan,weather:ReturnType<typeof ecologyWeather>){return {rain:Math.round(weather.rainRate*ECOLOGY_RULES.step*(1-pp.shade*.3)*ECOLOGY_WATER_SCALE),evaporation:Math.round(weather.evaporationRate*ECOLOGY_RULES.step*(1-pp.shade*.55)/pp.retention*ECOLOGY_WATER_SCALE)};}
function step(s:EcologyState,plan:EcologyPlan){
 const weather=ecologyWeather(s.seed,s.tick*ECOLOGY_RULES.step);s.tick++;
 for(const [i,p]of s.plots.entries()){
  const pp=plan.plots[i]!,rates=waterRates(pp,weather),room=ECOLOGY_RULES.soilCapacity*ECOLOGY_WATER_SCALE-p.soilWater,accepted=Math.min(room,rates.rain);
  p.soilWater+=accepted;s.water.rain+=rates.rain;s.water.runoff+=rates.rain-accepted;
  const evaporated=Math.min(p.soilWater,rates.evaporation);p.soilWater-=evaporated;s.water.evaporated+=evaporated;
  if(!p.crop||ecologyStage(p.crop)==='ripe')continue;
  const before=ecologyStage(p.crop),rate=factors(s,p,pp,weather).rate,remaining=ECOLOGY_RULES.growthRequired-p.crop.growth,growth=Math.min(remaining,rate*ECOLOGY_RULES.step),uptake=Math.min(p.soilWater,Math.round(growth*ECOLOGY_CROPS[p.crop.species].uptake*ECOLOGY_WATER_SCALE));
  p.crop.growth+=growth;p.soilWater-=uptake;s.water.uptake+=uptake;
  const after=ecologyStage(p.crop);if(after!==before&&after!=='empty'&&after!=='seeded')record(s,after,p.id,p.crop.species,p.crop.growth);
 }
}
/** Exact integer solution of identical no-growth quarter-second transfers, within one weather epoch. */
function idleSpan(s:EcologyState,plan:EcologyPlan,ticks:number){
 const weather=ecologyWeather(s.seed,s.tick*ECOLOGY_RULES.step);
 for(const [i,p]of s.plots.entries()){
  const {rain,evaporation}=waterRates(plan.plots[i]!,weather),before=p.soilWater;
  if(rain===0){p.soilWater=Math.max(0,before-ticks*evaporation);s.water.evaporated+=before-p.soilWater;}
  else { // The pinned rain rate always exceeds evaporation, even under full canopy.
   p.soilWater=Math.min(ECOLOGY_RULES.soilCapacity*ECOLOGY_WATER_SCALE-evaporation,before+ticks*(rain-evaporation));
   s.water.rain+=ticks*rain;s.water.evaporated+=ticks*evaporation;s.water.runoff+=before+ticks*(rain-evaporation)-p.soilWater;
  }
 }
 s.tick+=ticks;
}
function idleTo(s:EcologyState,plan:EcologyPlan,target:number){
 const spans=(until:number)=>{while(s.tick<until)idleSpan(s,plan,Math.min(until-s.tick,EPOCH_TICKS-s.tick%EPOCH_TICKS));};
 spans(Math.min(target,Math.ceil(s.tick/CYCLE_TICKS)*CYCLE_TICKS));
 let cycles=Math.floor((target-s.tick)/CYCLE_TICKS),warmCycles=0;
 while(cycles>0){
  const soil=s.plots.map(p=>p.soilWater),ledger={...s.water};spans(s.tick+CYCLE_TICKS);cycles--;warmCycles++;
  if(s.plots.every((p,i)=>p.soilWater===soil[i])){
   for(const key of ['rain','evaporated','runoff'] as const)s.water[key]+=(s.water[key]-ledger[key])*cycles;
   s.tick+=cycles*CYCLE_TICKS;cycles=0;
  }
  // Each cycle supplies at least 0.7 litres net; saturation is reached in < 12 cycles.
  if(warmCycles>16)throw new Error('Pinned idle-water convergence invariant failed');
 }
 spans(target);
}
/** Replay work depends on the finite planted crops, not on total elapsed session time. */
function replayTo(s:EcologyState,plan:EcologyPlan,target:number,budget:{steps:number}){
 while(s.tick<target){
  if(!s.plots.some(p=>p.crop&&ecologyStage(p.crop)!=='ripe')){idleTo(s,plan,target);return;}
  if(++budget.steps>196608)throw new Error('Finite crop-growth replay budget exceeded');
  step(s,plan);
 }
}
/** At most one simulated second per call. Excess/hidden-tab elapsed time is discarded, never banked. */
export function advanceEcology(state:EcologyState,dt:number):EcologyState {
 if(!Number.isFinite(dt)||dt<=0||state.tick>=MAX_VALID_TICK)return state;
 const s=clone(state),plan=ecologyPlan(state.seed);let budget=s.remainder+Math.min(dt,ECOLOGY_RULES.step*ECOLOGY_RULES.maxSteps),count=0;
 while(budget+EPS>=ECOLOGY_RULES.step&&count<ECOLOGY_RULES.maxSteps&&s.tick<MAX_VALID_TICK){step(s,plan);budget-=ECOLOGY_RULES.step;count++;}
 s.remainder=s.tick===MAX_VALID_TICK||Math.abs(budget)<EPS?0:clamp(budget,0,ECOLOGY_RULES.step-Number.EPSILON);return s;
}
export function ecologyCost(s:EcologyState|undefined):EcologyInventory {return {scrap:0,core:0,water:s?.canistersSpent??0};}
export function ecologyWaterBalance(s:EcologyState){return s.water.initial+s.water.rain+s.water.irrigation-s.plots.reduce((n,p)=>n+p.soilWater,0)-s.water.evaporated-s.water.uptake-s.water.runoff;}
/** The only mutating helper is private and operates on a fresh transition or validation replay. */
function transact(s:EcologyState,command:EcologyCommand,hp:number):{hpEffect:number;message:string}|null {
 if(command.expectedRevision!==s.revision)return null;
 const p='plotId'in command?s.plots.find(p=>p.id===command.plotId):undefined;
 if(command.type==='plant'){
  if(!p||p.crop||s.seeds<1||!Object.hasOwn(ECOLOGY_CROPS,command.species)||s.tick>=MAX_VALID_TICK)return null;
  s.seeds--;p.crop={species:command.species,growth:0,plantedTick:s.tick};s.revision++;record(s,'planted',p.id,command.species,1);
  return {hpEffect:0,message:`Planted ${ECOLOGY_CROPS[command.species].name}: 1 seed packet consumed. Soil water, weather and habitat now determine its growth.`};
 }
 if(command.type==='water'){
  if(!p||s.canistersSpent>=ECOLOGY_RULES.maxCanisters||p.soilWater>(ECOLOGY_RULES.soilCapacity-ECOLOGY_RULES.canisterWater)*ECOLOGY_WATER_SCALE||s.tick>=MAX_VALID_TICK)return null;
  p.soilWater+=ECOLOGY_RULES.canisterWater*ECOLOGY_WATER_SCALE;s.water.irrigation+=ECOLOGY_RULES.canisterWater*ECOLOGY_WATER_SCALE;s.canistersSpent++;s.revision++;record(s,'watered',p.id,p.crop?.species??null,ECOLOGY_RULES.canisterWater);
  return {hpEffect:0,message:'Spent 1 sealed water canister: 4 litres transferred into this garden’s soil.'};
 }
 if(command.type==='harvest'){
  if(!p?.crop||ecologyStage(p.crop)!=='ripe'||s.biomass+ECOLOGY_RULES.harvestYield>ECOLOGY_RULES.biomassCapacity)return null;
  const species=p.crop.species;p.crop=null;s.biomass+=ECOLOGY_RULES.harvestYield;s.harvested++;s.revision++;record(s,'harvested',p.id,species,ECOLOGY_RULES.harvestYield);
  return {hpEffect:0,message:'Harvested 2 biomass into your field pouch. The bed is empty; another crop needs another finite seed packet.'};
 }
 if(command.type==='craft-gel'){
  if(s.biomass<ECOLOGY_RULES.biomassPerGel||s.bioGel>=ECOLOGY_RULES.bioGelCapacity)return null;
  s.biomass-=ECOLOGY_RULES.biomassPerGel;s.bioGel++;s.crafted++;s.revision++;record(s,'crafted',null,null,1);
  return {hpEffect:0,message:'Crafted 1 bio-gel from 2 harvested biomass. Apply it to restore up to 20 suit integrity.'};
 }
 if(command.type==='use-gel'){
  if(s.bioGel<1||!Number.isFinite(hp)||hp<=0||hp>=100)return null;
  const hpEffect=Math.min(ECOLOGY_RULES.repairHP,100-hp);s.bioGel--;s.used++;s.restoredHP+=hpEffect;s.revision++;record(s,'used',null,null,hpEffect);
  return {hpEffect,message:`Consumed 1 bio-gel: restored ${Number(hpEffect.toFixed(2))} suit integrity. This is a fictional suit-repair material.`};
 }
 return null;
}
/** Pure atomic result. Parent MUST commit pack, inventory and exact hpEffect together. */
export function applyEcologyCommand(state:EcologyState,ctx:EcologyContext,command:EcologyCommand):{state:EcologyState;inventory:EcologyInventory;hpEffect:number;message:string} {
 const no=(message:string)=>({state,inventory:ctx.inventory,hpEffect:0,message});
 if(!command||!['plant','water','harvest','craft-gel','use-gel'].includes(command.type)||command.expectedRevision!==state.revision)return no('That field action is stale or unknown. Review the current garden.');
 if(ctx.seed!==state.seed||ctx.generation!==2||![ctx.player.x,ctx.player.z,ctx.player.hp].every(Number.isFinite)||ctx.player.hp<=0||ctx.player.hp>100||![ctx.inventory.scrap,ctx.inventory.core,ctx.inventory.water].every(n=>Number.isSafeInteger(n)&&n>=0))return no('A living field architect and a valid connected-world inventory are required.');
 if(command.type!=='use-gel'){
  if(ctx.zone!=='valley')return no('Return to a valley garden for planting, watering, harvesting or mixing.');
  const near=ecologyPlan(state.seed).plots.filter(p=>Math.hypot(ctx.player.x-p.position.x,ctx.player.z-p.position.z,valleySurfaceHeight(worldValley(state.seed),ctx.player.x,ctx.player.z)-p.position.y)<=ECOLOGY_RULES.interactionReach);
  if(!near.length||'plotId'in command&&!near.some(p=>p.id===command.plotId))return no('Move within 3.5 m of this garden bed.');
 }
 if(command.type==='water'&&ctx.inventory.water<1)return no('Watering costs 1 sealed water canister. Rain also adds real soil water.');
 const s=clone(state),result=transact(s,command,ctx.player.hp);
 if(!result)return no(command.type==='use-gel'?'Carry a bio-gel and have missing suit integrity.':command.type==='craft-gel'?'Mixing requires 2 biomass and room for 1 bio-gel.':command.type==='harvest'?'This crop must be ripe, with room for 2 biomass.':command.type==='water'?'The soil must have room for all 4 litres; the field water budget must remain available.':'Choose an empty bed and an available seed packet.');
 return {state:s,inventory:command.type==='water'?{...ctx.inventory,water:ctx.inventory.water-1}:ctx.inventory,...result};
}
function object(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
function keys(v:Record<string,unknown>,list:string[]){return Object.keys(v).length===list.length&&list.every(k=>Object.hasOwn(v,k));}
function number(v:unknown,max:number){return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;}
function integer(v:unknown,max:number){return number(v,max)&&Number.isSafeInteger(v);}
const actionKinds=['planted','watered','harvested','crafted','used'];
/** Reject malformed optional data; replay deterministic weather, soil, stages and every finite goods transaction. */
export function validEcology(value:unknown,seed:number):value is EcologyState {try{return validate(value,seed);}catch{return false;}}
function validate(value:unknown,seed:number):value is EcologyState {
 if(!validSeed(seed)||!object(value)||!keys(value,['version','hash','seed','tick','remainder','revision','seeds','biomass','bioGel','harvested','crafted','used','restoredHP','canistersSpent','plots','water','records'])||value.version!==1||value.hash!==ECOLOGY_HASH||value.seed!==seed)return false;
 const s=value as unknown as EcologyState;
 if(!integer(s.tick,MAX_VALID_TICK)||!number(s.remainder,ECOLOGY_RULES.step)||s.remainder>=ECOLOGY_RULES.step||s.tick===MAX_VALID_TICK&&s.remainder!==0||!integer(s.revision,96)||!integer(s.seeds,12)||!integer(s.biomass,6)||!integer(s.bioGel,3)||!integer(s.harvested,12)||!integer(s.crafted,12)||!integer(s.used,12)||!number(s.restoredHP,240)||!integer(s.canistersSpent,48))return false;
 if(!Array.isArray(s.plots)||s.plots.length!==3||!Array.isArray(s.records)||s.records.length>132||!object(s.water)||!keys(s.water,['initial','rain','irrigation','evaporated','uptake','runoff'])||!Object.values(s.water).every(n=>integer(n,1e15)))return false;
 const plan=ecologyPlan(seed);
 for(const [i,p]of s.plots.entries())if(!object(p)||!keys(p,['id','soilWater','crop'])||p.id!==plan.plots[i]!.id||!integer(p.soilWater,ECOLOGY_RULES.soilCapacity*ECOLOGY_WATER_SCALE)||p.crop!==null&&(!object(p.crop)||!keys(p.crop,['species','growth','plantedTick'])||!Object.hasOwn(ECOLOGY_CROPS,p.crop.species)||!number(p.crop.growth,30)||!integer(p.crop.plantedTick,s.tick)))return false;
 let priorTick=0;
 for(const r of s.records){
  if(!object(r)||!keys(r,['id','kind','tick','plotId','species','amount','revision'])||!['planted','watered','harvested','crafted','used','sprouted','budding','ripe'].includes(r.kind)||!integer(r.tick,s.tick)||r.tick<priorTick||!integer(r.revision,s.revision)||!number(r.amount,300)||!(r.plotId===null||plan.plots.some(p=>p.id===r.plotId))||!(r.species===null||Object.hasOwn(ECOLOGY_CROPS,r.species)))return false;priorTick=r.tick;
 }
 if(Math.abs(ecologyWaterBalance(s))>1e-6)return false;
 const replay=createEcologyState(seed),budget={steps:0};
 for(const r of s.records){
  if(!actionKinds.includes(r.kind))continue;
  replayTo(replay,plan,r.tick,budget);
  const common={expectedRevision:replay.revision};let command:EcologyCommand;
  if(r.kind==='planted'){if(r.plotId===null||r.species===null)return false;command={...common,type:'plant',plotId:r.plotId,species:r.species};}
  else if(r.kind==='watered'||r.kind==='harvested'){if(r.plotId===null)return false;command={...common,type:r.kind==='watered'?'water':'harvest',plotId:r.plotId};}
  else command={...common,type:r.kind==='crafted'?'craft-gel':'use-gel'};
  if(!transact(replay,command,r.kind==='used'?100-r.amount:100))return false;
 }
 replayTo(replay,plan,s.tick,budget);
 replay.remainder=s.remainder;
 return sameData(replay,s);
}
function sameData(a:unknown,b:unknown):boolean {
 if(a===b)return true;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>sameData(v,b[i]));
 return object(a)&&object(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&sameData(a[k],b[k]));
}
/** Snapshot projection, including only actually committed history. */
export function ecologyView(s:EcologyState){
 const plan=ecologyPlan(s.seed),weather=ecologyWeather(s.seed,s.tick*ECOLOGY_RULES.step);
 const descriptions:Record<EcologyRecordKind,(r:EcologyRecord)=>string>={planted:r=>`Planted ${ECOLOGY_CROPS[r.species!].name}; 1 seed packet consumed`,watered:()=>`Spent 1 canister; ${ECOLOGY_RULES.canisterWater} litres entered the soil`,harvested:()=>`Harvested 2 biomass; the mature crop was removed`,crafted:()=>`Consumed 2 biomass to craft 1 bio-gel`,used:r=>`Consumed 1 bio-gel to restore ${Number(r.amount.toFixed(2))} suit integrity`,sprouted:()=>`A planted crop sprouted from actual growing conditions`,budding:()=>`A planted crop reached the budding stage`,ripe:()=>`A planted crop ripened and is ready to harvest`};
 return {weather,elapsed:s.tick*ECOLOGY_RULES.step,seeds:s.seeds,biomass:s.biomass,bioGel:s.bioGel,waterBalance:ecologyWaterBalance(s),plots:s.plots.map((p,i)=>({...plan.plots[i]!,...p,soilLitres:p.soilWater/ECOLOGY_WATER_SCALE,stage:ecologyStage(p.crop),temperature:weather.temperature+plan.plots[i]!.temperatureOffset,growthFactors:factors(s,p,plan.plots[i]!,weather)})),history:s.records.map(r=>({id:r.id,at:r.tick*ECOLOGY_RULES.step,kind:r.kind,text:`${r.plotId?`${plan.plots.find(p=>p.id===r.plotId)!.name}: `:''}${descriptions[r.kind](r)}.`}))};
}
