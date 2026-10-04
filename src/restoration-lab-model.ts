import {advanceRestoration,applyRestorationCommand,createRestoration,restorationBalances,restorationMachinePosition,restorationPlayerCost,validRestorationCommand,type RestorationCommand,type RestorationContext,type RestorationInventory,type RestorationState} from './restoration.ts';
import {RESTORATION_DEFAULTS,RESTORATION_TUNING_REGISTRY,restorationFreeze,restorationInteger,restorationKeys,restorationPlan,validRestorationTuning,type HabitatSiteDescriptor,type RestorationPlan,type RestorationTuning} from './restoration-plan.ts';
import {compileRestorationBody,DEFAULT_RESTORATION_RECIPE,validRestorationBodyRecipe,type RestorationBodyRecipe} from './restoration-body.ts';
import {compileUtilityAbility,DEFAULT_UTILITY_RECIPE,validUtilityRecipeInput,type UtilityRecipeInput} from './utility-ability.ts';

/** A disposable numerical experiment. This module has no campaign, save, or room dependency. */
export const RESTORATION_LAB_VERSION=1 as const;
export const RESTORATION_LAB_BUILD='restoration-lab-v1' as const;
export const RESTORATION_LAB_SOURCE='axiom-restoration-runtime/v1' as const;
export const RESTORATION_LAB_KIND='axiom-restoration-lab-preset' as const;
export const RESTORATION_LAB_SCOPE='disposable-model-only' as const;
export const RESTORATION_LAB_MAX_PRESET_BYTES=24*1024;
export const RESTORATION_LAB_MAX_SECONDS=1200;
export const RESTORATION_LAB_MAX_ACTIONS=128;
export {RESTORATION_TUNING_REGISTRY};

function standaloneSite(id:string,label:string,x:number,z:number):HabitatSiteDescriptor {
 const cells=[{id:`${id}-dock`,x,y:0,z},{id:`${id}-bed`,x:x+2,y:0,z},{id:`${id}-grove`,x:x+2,y:0,z:z+2}];
 return {id,label,x,y:0,z,dockCellId:cells[0]!.id,cells,edges:[
  {id:`${id}-dock-bed`,a:cells[0]!.id,b:cells[1]!.id,path:cells.slice(0,2).map(({x,y,z})=>({x,y,z}))},
  {id:`${id}-bed-grove`,a:cells[1]!.id,b:cells[2]!.id,path:cells.slice(1,3).map(({x,y,z})=>({x,y,z}))},
 ]};
}
/** Three independent certified practice routes near the origin; no campaign geometry is imported. */
export const RESTORATION_LAB_SITES:readonly HabitatSiteDescriptor[]=restorationFreeze([
 standaloneSite('lab-west','West habitat',-8,-3),
 standaloneSite('lab-north','North habitat',-1,5),
 standaloneSite('lab-east','East habitat',6,-3),
]);
export const RESTORATION_LAB_SCENARIOS=restorationFreeze([
 {id:'balanced',label:'Finite starter stock',description:'16 scrap, 1 core and 100 HP. Dock charge, filters, scent, water and nutrients are finite.',inventory:{scrap:16,core:1,water:0},hp:100},
 {id:'lean-stock',label:'Lean structural stock',description:'3 scrap, no core and 100 HP. Existing habitat reserves are unchanged; refits must stay affordable.',inventory:{scrap:3,core:0,water:0},hp:100},
 {id:'damaged-suit',label:'Damaged suit',description:'16 scrap, 1 core and 40 HP. Repair still requires an actually restored habitat and consumes biomass.',inventory:{scrap:16,core:1,water:0},hp:40},
] as const);
export type RestorationLabScenario=typeof RESTORATION_LAB_SCENARIOS[number]['id'];
export interface RestorationLabPreset {
 version:1;kind:typeof RESTORATION_LAB_KIND;scope:typeof RESTORATION_LAB_SCOPE;
 build:string;source:string;
 seed:number;scenario:RestorationLabScenario;tuning:RestorationTuning;recipe:RestorationBodyRecipe;ability:UtilityRecipeInput;
}
export const RESTORATION_LAB_DEFAULT_PRESET:RestorationLabPreset=restorationFreeze({
 version:1,kind:RESTORATION_LAB_KIND,scope:RESTORATION_LAB_SCOPE,build:RESTORATION_LAB_BUILD,source:RESTORATION_LAB_SOURCE,
 seed:73129,scenario:'balanced',tuning:{...RESTORATION_DEFAULTS},recipe:{...DEFAULT_RESTORATION_RECIPE},ability:{...DEFAULT_UTILITY_RECIPE},
});
const provenance=(value:unknown):value is string=>typeof value==='string'&&value.length>=1&&value.length<=160&&/^[a-zA-Z0-9][a-zA-Z0-9._:/ -]*$/.test(value);
const PRESET_KEYS=['version','kind','scope','build','source','seed','scenario','tuning','recipe','ability'];
export function validRestorationLabPreset(value:unknown):value is RestorationLabPreset {
 try{return restorationKeys(value,PRESET_KEYS)&&value.version===1&&value.kind===RESTORATION_LAB_KIND&&value.scope===RESTORATION_LAB_SCOPE&&provenance(value.build)&&provenance(value.source)&&restorationInteger(value.seed,0xffffffff)&&RESTORATION_LAB_SCENARIOS.some(s=>s.id===value.scenario)&&validRestorationTuning(value.tuning)&&validRestorationBodyRecipe(value.recipe)&&validUtilityRecipeInput(value.ability)&&value.ability.organ===value.recipe.organ;}catch{return false;}
}
function copyPreset(preset:RestorationLabPreset):RestorationLabPreset {
 if(!validRestorationLabPreset(preset))throw new Error('Unsupported restoration laboratory preset fields or values.');
 return restorationFreeze({version:1,kind:RESTORATION_LAB_KIND,scope:RESTORATION_LAB_SCOPE,build:preset.build,source:preset.source,seed:preset.seed,scenario:preset.scenario,tuning:{...preset.tuning},recipe:{...preset.recipe},ability:{...preset.ability}});
}
/** JSON.parse alone permits duplicate keys; reject them, including escaped duplicate spellings. */
function rejectDuplicateKeys(raw:string):void {
 const tokens=raw.match(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)!;let index=0;
 function value(){const token=tokens[index++];if(token==='{'){const keys=new Set<string>();while(tokens[index]!=='}'){const key=JSON.parse(tokens[index++]!);if(keys.has(key))throw new Error('Duplicate restoration laboratory preset field.');keys.add(key);index++;value();if(tokens[index]!==',')break;index++;}index++;}else if(token==='['){while(tokens[index]!==']'){value();if(tokens[index]!==',')break;index++;}index++;}}
 value();
}
/** Parsing stages a configuration only. No restoration state or live authority can be imported. */
export function parseRestorationLabPreset(raw:string):RestorationLabPreset {
 if(typeof raw!=='string'||raw.length>RESTORATION_LAB_MAX_PRESET_BYTES||new TextEncoder().encode(raw).length>RESTORATION_LAB_MAX_PRESET_BYTES)throw new Error('Restoration laboratory preset exceeds 24 KB.');
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new Error('Restoration laboratory preset is not valid JSON.');}
 rejectDuplicateKeys(raw);if(!validRestorationLabPreset(value))throw new Error('Unsupported restoration laboratory preset fields or values.');return copyPreset(value);
}
export function serializeRestorationLabPreset(preset:RestorationLabPreset):string {
 const raw=JSON.stringify(copyPreset(preset),null,2);if(new TextEncoder().encode(raw).length>RESTORATION_LAB_MAX_PRESET_BYTES)throw new Error('Restoration laboratory preset exceeds 24 KB.');return raw;
}

export interface RestorationLabAction {
 sequence:number;kind:'command'|'relocate'|'tuning'|'advance';atSeconds:number;tick:number;accepted:boolean;message:string;
 command?:RestorationCommand;targetId?:string;from?:{x:number;z:number};to?:{x:number;z:number};tuning?:RestorationTuning;
 advancedSeconds?:number;advancedTicks?:number;revisionBefore?:number;revisionAfter?:number;
}
export type RestorationLabContext=RestorationContext&{restoration:RestorationState};
export interface RestorationLabEvidence {
 version:1;kind:'axiom-restoration-lab-evidence';scope:typeof RESTORATION_LAB_SCOPE;build:string;source:string;
 seed:number;scenario:RestorationLabScenario;elapsed:number;limitSeconds:number;planId:string;
 actual:{preset:RestorationLabPreset;player:RestorationContext['player'];inventory:RestorationInventory;restoration:RestorationState};
 intended:{preset:RestorationLabPreset;recipe:RestorationBodyRecipe;ability:UtilityRecipeInput;tuning:RestorationTuning;bodyStats:ReturnType<typeof compileRestorationBody>['stats'];materialCost:ReturnType<typeof compileRestorationBody>['cost'];utility:ReturnType<typeof compileUtilityAbility>};
 actions:readonly RestorationLabAction[];actionCount:number;droppedActions:number;
 balances:ReturnType<typeof restorationBalances>;structuralBalances:RestorationInventory;
}
export interface RestorationLabProvenance {build:string;source:string}
export interface RestorationLab {
 version:1;currentProvenance:RestorationLabProvenance;context:RestorationLabContext;plan:RestorationPlan;appliedPreset:RestorationLabPreset;elapsed:number;
 actions:readonly RestorationLabAction[];actionCount:number;droppedActions:number;lastMessage:string;evidence:RestorationLabEvidence;
}
type LabCore=Omit<RestorationLab,'evidence'>;
function evidenceFor(lab:LabCore,intendedPreset:RestorationLabPreset):RestorationLabEvidence {
 const intended=copyPreset(intendedPreset),body=compileRestorationBody(intended.recipe),stock=RESTORATION_LAB_SCENARIOS.find(s=>s.id===lab.appliedPreset.scenario)!.inventory,cost=restorationPlayerCost(lab.context.restoration);
 return restorationFreeze({version:1,kind:'axiom-restoration-lab-evidence',scope:RESTORATION_LAB_SCOPE,build:lab.currentProvenance.build,source:lab.currentProvenance.source,seed:lab.context.seed,scenario:lab.appliedPreset.scenario,elapsed:lab.elapsed,limitSeconds:RESTORATION_LAB_MAX_SECONDS,planId:lab.plan.id,
  actual:{preset:lab.appliedPreset,player:lab.context.player,inventory:lab.context.inventory,restoration:lab.context.restoration},intended:{preset:intended,recipe:intended.recipe,ability:intended.ability,tuning:intended.tuning,bodyStats:body.stats,materialCost:body.cost,utility:compileUtilityAbility(intended.ability)},actions:lab.actions,actionCount:lab.actionCount,droppedActions:lab.droppedActions,balances:restorationBalances(lab.context.restoration,lab.plan),structuralBalances:{scrap:stock.scrap-lab.context.inventory.scrap-cost.scrap,core:stock.core-lab.context.inventory.core-cost.core,water:stock.water-lab.context.inventory.water-cost.water}});
}
/** Exportable evidence may compare a staged intended preset with the unchanged actual experiment. */
export function createRestorationLabEvidence(lab:RestorationLab,intendedPreset:RestorationLabPreset=lab.appliedPreset):RestorationLabEvidence {return evidenceFor(lab,intendedPreset);}
function finish(lab:LabCore):RestorationLab {return restorationFreeze({...lab,evidence:evidenceFor(lab,lab.appliedPreset)});}

function journal(lab:LabCore,entry:Omit<RestorationLabAction,'sequence'|'atSeconds'|'tick'>,atSeconds=lab.elapsed,tick=lab.context.restoration.tick):LabCore {
 const last=lab.actions.at(-1);if(entry.kind==='advance'&&last?.kind==='advance')return {...lab,lastMessage:entry.message,actions:[...lab.actions.slice(0,-1),{...last,advancedSeconds:(last.advancedSeconds??0)+(entry.advancedSeconds??0),advancedTicks:(last.advancedTicks??0)+(entry.advancedTicks??0),message:entry.message}]};
 const actionCount=lab.actionCount+1,actions=[...lab.actions,{...entry,sequence:actionCount,atSeconds,tick}];
 return {...lab,lastMessage:entry.message,actionCount,droppedActions:lab.droppedActions+Math.max(0,actions.length-RESTORATION_LAB_MAX_ACTIONS),actions:actions.slice(-RESTORATION_LAB_MAX_ACTIONS)};
}
export function createRestorationLab(preset:RestorationLabPreset=RESTORATION_LAB_DEFAULT_PRESET,currentProvenance:RestorationLabProvenance={build:RESTORATION_LAB_BUILD,source:RESTORATION_LAB_SOURCE}):RestorationLab {
 if(!restorationKeys(currentProvenance,['build','source'])||!provenance(currentProvenance.build)||!provenance(currentProvenance.source))throw new Error('Invalid current restoration laboratory provenance.');
 const appliedPreset=copyPreset(preset),plan=restorationPlan(appliedPreset.seed,RESTORATION_LAB_SITES),scenario=RESTORATION_LAB_SCENARIOS.find(s=>s.id===appliedPreset.scenario)!,dock=plan.sites[0]!.cells.find(c=>c.id===plan.sites[0]!.dockCellId)!;
 return finish({version:1,currentProvenance:{...currentProvenance},context:{seed:appliedPreset.seed,zone:'valley',player:{x:dock.x,z:dock.z-2.5,hp:scenario.hp},inventory:{...scenario.inventory},restoration:createRestoration(plan)},plan,appliedPreset,elapsed:0,actions:[],actionCount:0,droppedActions:0,lastMessage:'Fresh disposable model. Actor starts 2.5 m beside the dock, outside the full body footprint. Refit, service and deploy using the real finite-stock commands.'});
}
/** All numerical evolution flows through the runtime quarter-second clock, including fractional remainders. */
export function stepRestorationLab(lab:RestorationLab,seconds=.25):RestorationLab {
 if(!Number.isFinite(seconds)||seconds<=0||lab.elapsed>=RESTORATION_LAB_MAX_SECONDS)return lab;
 const applied=Math.min(seconds,RESTORATION_LAB_MAX_SECONDS-lab.elapsed);let remaining=applied,state=lab.context.restoration;
 while(remaining>1e-10){const delta=Math.min(.25,remaining);state=advanceRestoration(state,lab.plan,delta,lab.context,lab.appliedPreset.tuning);remaining-=delta;}
 if(state===lab.context.restoration)return lab;
 const elapsed=state.tick*.25+state.remainder,next={...lab,context:{...lab.context,restoration:state},elapsed};
 return finish(journal(next,{kind:'advance',accepted:true,advancedSeconds:elapsed-lab.elapsed,advancedTicks:state.tick-lab.context.restoration.tick,message:elapsed>=RESTORATION_LAB_MAX_SECONDS?'Disposable model reached its 1200-second limit. Reset to run a new experiment.':`Advanced to ${elapsed.toFixed(2)} active-play seconds.`},lab.elapsed,lab.context.restoration.tick));
}
/** The caller supplies the revision it observed. Rejected or stale intents are never silently rewritten. */
export function applyRestorationLabCommand(lab:RestorationLab,command:RestorationCommand):RestorationLab {
 const result=applyRestorationCommand(lab.context.restoration,lab.plan,lab.context,command),accepted=result.state!==lab.context.restoration;
 const appliedPreset=accepted&&command.kind==='refit'?copyPreset({...lab.appliedPreset,recipe:command.recipe,ability:command.ability}):lab.appliedPreset;
 // Commands are copied only after runtime validation; malformed executable objects are not exported in evidence.
 const recorded=accepted||validRestorationCommand(command)?structuredClone(command):undefined;
 return finish(journal({...lab,appliedPreset,context:{...lab.context,restoration:result.state,inventory:result.inventory,player:{...lab.context.player,hp:result.hp}}},{kind:'command',accepted,message:result.message,...(recorded?{command:recorded}:{}),revisionBefore:lab.context.restoration.revision,revisionAfter:result.state.revision}));
}
/** Explicit numerical-only actor relocation for command testing; it does not move the machine or simulate travel. */
export function moveRestorationLabActor(lab:RestorationLab,targetId:string):RestorationLab {
 const site=lab.plan.sites.find(s=>s.id===targetId),point=targetId==='machine'?restorationMachinePosition(lab.context.restoration,lab.plan):site?.cells.find(c=>c.id===site.dockCellId);
 if(!point)return finish(journal(lab,{kind:'relocate',accepted:false,targetId:typeof targetId==='string'?targetId.slice(0,64):'invalid',message:'No selected dock or deployed machine exists in this disposable model.'}));
 const from={x:lab.context.player.x,z:lab.context.player.z},to={x:point.x,z:point.z-2.5};
 return finish(journal({...lab,context:{...lab.context,player:{...lab.context.player,...to}}},{kind:'relocate',accepted:true,targetId,from,to,message:`Numerical model-only actor relocation 2.5 m beside ${targetId}; no machine, habitat or resource state was moved.`}));
}
/** Live tuning does not reconstruct sites, refill reserves, recompile active abilities, or reset time. */
export function updateRestorationLabTuning(lab:RestorationLab,tuning:RestorationTuning):RestorationLab {
 if(!validRestorationTuning(tuning))throw new Error('Invalid restoration tuning; use the registered integer bounds.');
 return finish(journal({...lab,appliedPreset:copyPreset({...lab.appliedPreset,tuning})},{kind:'tuning',accepted:true,tuning:{...tuning},message:'Registered tuning applied to subsequent runtime ticks. Existing stocks and habitat progress are preserved.'}));
}
