/** Disposable preparation executes real paid commands and active ticks, never edits habitat completion. */
import {createRestoration,applyRestorationCommand,advanceRestoration,restorationMachinePosition,restorationPlan,restorationBalances,RESTORATION_DEFAULTS,validRestorationTuning,type RestorationCommand,type RestorationPlan,type RestorationTuning} from './restoration.ts';
import {habitatSiteDescriptors} from './habitat-sites.ts';
import {createTownLifeScenario} from './town-life.ts';
import {applyRestorationCare,restorationCarePosition,type RestorationCareState} from './restoration-care.ts';
export const RESTORATION_CARE_SCENARIOS=Object.freeze(['unopened','restored','delivered'] as const);
export type RestorationCareScenario=typeof RESTORATION_CARE_SCENARIOS[number];
export function earnRestorationCareHabitat(plan:RestorationPlan,tuning:RestorationTuning=RESTORATION_DEFAULTS){
 if(!validRestorationTuning(tuning))throw RangeError('Unsupported restoration tuning.');
 let restoration=createRestoration(plan),inventory={scrap:16,core:1,water:2};const site=plan.sites[0]!,preparationActions:unknown[]=[];
 let player={x:site.x,z:site.z-2.5,hp:70};
 const command=(extra:Record<string,unknown>)=>{const command={targetId:site.id,...extra,expectedRevision:restoration.revision} as RestorationCommand;const result=applyRestorationCommand(restoration,plan,{seed:plan.seed,zone:'valley',player,inventory},command);if(result.state===restoration)throw Error('Care scenario preparation: '+result.message);preparationActions.push({kind:'command',command,player:{...player}});restoration=result.state;inventory=result.inventory;};
 const advance=(ticks:number,until?:()=>boolean)=>{let done=0;for(;done<ticks&&!until?.();done++){const point=restorationMachinePosition(restoration,plan);if(point)player={...player,x:point.x,z:point.z-2.5};restoration=advanceRestoration(restoration,plan,.25,{player},tuning);}preparationActions.push({kind:'advance',ticks:done,followRig:true});};
 command({kind:'refit',recipe:{version:1,seed:plan.seed,support:'nimble',shell:'alloy',organ:'filter'},ability:{version:1,organ:'filter',strength:1,tempo:'steady'}});
 command({kind:'service'});command({kind:'deploy'});advance(160);
 for(let attempt=0;attempt<30;attempt++){
  const target=restoration.sites[0]!.cells.reduce((a,b)=>a.contaminant>b.contaminant?a:b);if(target.contaminant<=4)break;
  const point=restorationMachinePosition(restoration,plan)!;player={...player,x:point.x,z:point.z-2.5};command({kind:'start',sourceId:target.id,targetId:target.id});advance(320,()=>restoration.machine!.status==='idle');
  if(restoration.machine!.status==='working')command({kind:'stop'});
  const current=restorationMachinePosition(restoration,plan)!;player={...player,x:current.x,z:current.z-2.5};command({kind:'recall'});advance(320,()=>restoration.machine!.status==='packed');
  if(restoration.machine!.status!=='packed')throw Error('Care scenario recall did not reach the dock.');
  player={...player,x:site.x,z:site.z-2.5};command({kind:'service'});command({kind:'deploy'});
 }
 advance(2000,()=>restoration.sites[0]!.completedAtTick!==null);
 if(restoration.sites[0]!.completedAtTick===null)throw Error('Care scenario did not earn restoration within its bounded preparation.');
 const point=restorationMachinePosition(restoration,plan)!;player={...player,x:point.x,z:point.z-2.5};command({kind:'recall'});advance(320,()=>restoration.machine!.status==='packed');
 if(restoration.machine!.status!=='packed')throw Error('Care scenario final recall blocked.');
 player={...player,x:site.x,z:site.z-2.5};
 if(Object.values(restorationBalances(restoration,plan)).some(n=>n!==0))throw Error('Care scenario violated habitat conservation.');
 return {restoration,inventory,initialInventory:{scrap:16,core:1,water:2},player,preparationActions,preparationTicks:restoration.tick};
}
export function createRestorationCareScenario(seed:number,scenario:RestorationCareScenario,tuning:RestorationTuning=RESTORATION_DEFAULTS){
 if(!RESTORATION_CARE_SCENARIOS.includes(scenario)||!validRestorationTuning(tuning))throw RangeError('Unsupported habitat care scenario.');
 const plan=restorationPlan(seed,habitatSiteDescriptors(seed)),site=plan.sites[0]!;
 let prepared=scenario==='unopened'?{restoration:createRestoration(plan),inventory:{scrap:16,core:1,water:2},initialInventory:{scrap:16,core:1,water:2},player:{x:site.x,z:site.z-2.5,hp:70},preparationActions:[] as unknown[],preparationTicks:0}:earnRestorationCareHabitat(plan,tuning);
 // Existing disposable overwork setup retains all 100 identities and their ordinary navigation owner.
 let life=createTownLifeScenario(seed,'overwork'),care:RestorationCareState|undefined;
 if(scenario==='delivered'){
  for(const command of [{kind:'collect' as const,targetId:site.id,expectedRevision:0},{kind:'deliver' as const,targetId:'apothecary',expectedRevision:1}]){
   const position=restorationCarePosition(plan,command)!;prepared={...prepared,player:{...prepared.player,x:position.x,z:position.z}};
   const result=applyRestorationCare(care,prepared.restoration,plan,life,{seed,zone:'valley',player:prepared.player},command);if(!result)throw Error('Care scenario transfer rejected.');
   prepared.preparationActions.push({kind:'care-command',command,player:{...prepared.player}});prepared={...prepared,restoration:result.restoration};life=result.life;care=result.care;
  }
 }
 return {seed,zone:'valley' as const,plan,...prepared,life,care};
}
