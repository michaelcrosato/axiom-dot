/** Conserved habitat biomass delivery. Neither regional food nor player inventory is involved. */
import {exportRestorationCare,restorationCareHarvestable,restorationFreeze,restorationInteger,restorationKeys,validRestoration,type RestorationState,type RestorationPlan} from './restoration.ts';
import {townLifeFacilities,receiveTownHabitatCare,type TownLifeState} from './town-life.ts';
export const RESTORATION_CARE_BATCH=5;
export const RESTORATION_CARE_CARRY_CAP=10;
export const RESTORATION_CARE_STOCK_CAP=20;
export interface RestorationCareState {version:1;revision:number;carried:number;delivered:number;deliveries:number}
export interface RestorationCareCommand {kind:'collect'|'deliver';targetId:string;expectedRevision:number}
export interface RestorationCareContext {seed:number;zone:string;player:{x:number;z:number;hp:number;y?:number;feetY?:number}}
export function restorationCareExported(restoration:RestorationState){return restoration.sites.reduce((n,site)=>n+(site.careExported??0),0);}
export function validRestorationCareCommand(v:unknown):v is RestorationCareCommand{return restorationKeys(v,['kind','targetId','expectedRevision'])&&(v.kind==='collect'||v.kind==='deliver')&&typeof v.targetId==='string'&&v.targetId.length>0&&v.targetId.length<=64&&restorationInteger(v.expectedRevision,4000);}
export function validRestorationCare(v:unknown,restoration:RestorationState,life:TownLifeState):v is RestorationCareState {
 if(!restorationKeys(v,['version','revision','carried','delivered','deliveries'])||v.version!==1||!restorationInteger(v.revision,4000)||!restorationInteger(v.carried,10)||v.carried%5!==0||!restorationInteger(v.delivered,10000)||v.delivered%5!==0||!restorationInteger(v.deliveries,2000))return false;
 const exported=restorationCareExported(restoration);return restoration.seed===life.seed&&exported===v.carried+v.delivered&&v.delivered===(life.habitatCare?.received??0)&&v.delivered/10<=v.deliveries&&v.deliveries<=v.delivered/5&&v.revision===exported/5+v.deliveries;
}
export function immutableRestorationCare(v:unknown,restoration:RestorationState,life:TownLifeState):RestorationCareState {if(!validRestorationCare(v,restoration,life))throw RangeError('Invalid habitat care transfer ledger.');return restorationFreeze(structuredClone(v));}
export function restorationCarePosition(plan:RestorationPlan,command:Pick<RestorationCareCommand,'kind'|'targetId'>):{x:number;y:number;z:number}|null {
 if(command.kind==='deliver'){if(command.targetId!=='apothecary')return null;const f=townLifeFacilities(plan.seed).find(f=>f.id==='apothecary')!;return {x:f.x,y:6,z:f.z};}
 const site=plan.sites.find(s=>s.id===command.targetId),dock=site?.cells.find(c=>c.id===site.dockCellId);return dock?{x:dock.x,y:dock.y,z:dock.z}:null;
}
export function restorationCareBlockReason(care:RestorationCareState|undefined,restoration:RestorationState,plan:RestorationPlan,life:TownLifeState,ctx:RestorationCareContext,command:RestorationCareCommand):string|null {
 if(!validRestorationCareCommand(command)||!validRestoration(restoration,plan)||ctx.seed!==plan.seed||life.seed!==plan.seed)return 'Unsupported habitat care transfer.';
 if(care?!validRestorationCare(care,restoration,life):restorationCareExported(restoration)!==0||(life.habitatCare?.received??0)!==0)return 'The habitat care transfer ledger is incomplete.';
 if(command.expectedRevision!==(care?.revision??0))return 'This transfer changed; inspect its current ledger.';
 const target=restorationCarePosition(plan,command),p=ctx.player;
 if(ctx.zone!=='valley'||![p.x,p.z,p.hp].every(Number.isFinite)||p.hp<=0||p.hp>100||!target||Math.hypot(p.x-target.x,p.z-target.z)>3.5||(p.feetY!==undefined&&(!Number.isFinite(p.feetY)||Math.abs(p.feetY-target.y)>.45))||(p.y!==undefined&&(!Number.isFinite(p.y)||Math.abs(p.y-target.y)>.45)))return 'Reach this habitat dock or Greenlight care station on foot.';
 if(command.kind==='collect'){
  if((care?.carried??0)>5)return 'Carry at most 10 biomass portions; deliver the current bundle first.';
  if(restoration.revision>=1_000_000_000)return 'The habitat command ledger is full.';
  const site=restoration.sites.find(s=>s.id===command.targetId);if(!site||site.completedAtTick===null)return 'Complete restoration of this habitat first.';
  if(restorationCareHarvestable(restoration,command.targetId)<5)return 'Keep every cell viable and at least 70 health, with 5 surplus biomass above the two-per-cell reserve.';
 }else {if(!care||care.carried===0)return 'Collect a surplus biomass bundle from a restored habitat first.';if((life.habitatCare?.stock??0)+care.carried>20)return 'Greenlight has room for 20 care portions; residents must use the current stock first.';if((life.habitatCare?.received??0)+care.carried>10000)return 'The care delivery ledger is full.';}
 return null;
}
export function applyRestorationCare(care:RestorationCareState|undefined,restoration:RestorationState,plan:RestorationPlan,life:TownLifeState,ctx:RestorationCareContext,command:RestorationCareCommand):{care:RestorationCareState;restoration:RestorationState;life:TownLifeState;message:string}|null {
 if(restorationCareBlockReason(care,restoration,plan,life,ctx,command))return null;
 const state:RestorationCareState=care??{version:1,revision:0,carried:0,delivered:0,deliveries:0};
 if(command.kind==='collect'){const next=exportRestorationCare(restoration,plan,command.targetId);if(!next)return null;return {care:restorationFreeze({...state,revision:state.revision+1,carried:state.carried+5}),restoration:next,life,message:'Collected 5 real surplus biomass portions. Every habitat cell retains two; carry these to Greenlight Apothecary.'};}
 const next=receiveTownHabitatCare(life,state.carried);if(!next)return null;return {care:restorationFreeze({...state,revision:state.revision+1,carried:0,delivered:state.delivered+state.carried,deliveries:state.deliveries+1}),restoration,life:next,message:`Delivered ${state.carried} habitat care portions. Each achieved apothecary care session can consume one for stronger recovery.`};
}
export const RESTORATION_CARE_ENGINE=Object.freeze({kind:'axiom-restoration-care' as const,apply:applyRestorationCare,validate:validRestorationCare,immutable:immutableRestorationCare,command:validRestorationCareCommand,position:restorationCarePosition,blockReason:restorationCareBlockReason,exported:restorationCareExported});
