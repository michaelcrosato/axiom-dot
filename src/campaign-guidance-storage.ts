import {CAMPAIGN_GOAL_IDS,type CampaignGoalId} from './campaign-guidance.ts';

/** Personal pointers only. Call with the existing preview storage adapter. */
export interface CampaignGuidanceSelection {goalId:CampaignGoalId|null;sourceId?:string;siteId?:string}
export interface CampaignGuidanceIdentity {generation:1|2;seed:number;regional?:{version:1};roomId?:string}
export interface CampaignGuidanceStorage {getItem(key:string):string|null;setItem(key:string,value:string):void}
const PREFIX='axiom-campaign-guidance-v1:';
const FORMAT='axiom-campaign-guidance';
const MAX_TEXT=512;
const EMPTY:CampaignGuidanceSelection=Object.freeze({goalId:null});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POINTER=/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,127}$/;
function record(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));}
function exact(v:unknown,required:readonly string[],optional:readonly string[]=[]):v is Record<string,unknown>{
 if(!record(v))return false;const keys=Reflect.ownKeys(v);
 return required.every(k=>Object.hasOwn(v,k))&&keys.every(k=>typeof k==='string'&&(required.includes(k)||optional.includes(k))&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)!,'value'));
}
function selection(value:unknown):CampaignGuidanceSelection|null {
 if(!exact(value,['goalId'],['sourceId','siteId'])||(value.goalId!==null&&!CAMPAIGN_GOAL_IDS.includes(value.goalId as CampaignGoalId)))return null;
 if(value.goalId===null&&(Object.hasOwn(value,'sourceId')||Object.hasOwn(value,'siteId')))return null;
 for(const key of ['sourceId','siteId']as const)if(Object.hasOwn(value,key)&&(typeof value[key]!=='string'||!POINTER.test(value[key] as string)))return null;
 return Object.freeze({goalId:value.goalId as CampaignGoalId|null,...(Object.hasOwn(value,'sourceId')?{sourceId:value.sourceId as string}:{}),...(Object.hasOwn(value,'siteId')?{siteId:value.siteId as string}:{})});
}
/** Invalid identities never read or write any key. No room/session secrets are stored. */
export function campaignGuidanceStorageKey(identity:CampaignGuidanceIdentity):string|null {
 try{
  if(!exact(identity,['generation','seed'],['regional','roomId'])||(identity.generation!==1&&identity.generation!==2)||!Number.isInteger(identity.seed)||identity.seed<0||identity.seed>0xffffffff)return null;
  if(Object.hasOwn(identity,'regional')&&(!exact(identity.regional,['version'])||identity.regional.version!==1||identity.generation!==2))return null;
  if(Object.hasOwn(identity,'roomId')&&(typeof identity.roomId!=='string'||!UUID.test(identity.roomId)))return null;
  return `${PREFIX}g${identity.generation}:r${identity.regional?.version??0}:${identity.seed}:${identity.roomId?`room:${identity.roomId.toLowerCase()}`:'solo'}`;
 }catch{return null;}
}
export function loadCampaignGuidance(storage:Pick<CampaignGuidanceStorage,'getItem'>,identity:CampaignGuidanceIdentity):CampaignGuidanceSelection {
 try{
  const key=campaignGuidanceStorageKey(identity);if(!key)return EMPTY;
  const text=storage.getItem(key);if(typeof text!=='string'||text.length>MAX_TEXT)return EMPTY;
  const value:unknown=JSON.parse(text);if(!exact(value,['format','version','selection'])||value.format!==FORMAT||value.version!==1)return EMPTY;
  return selection(value.selection)??EMPTY;
 }catch{return EMPTY;}
}
/** False means the UI must keep its selection in memory and report unsaved tracking. */
export function storeCampaignGuidance(storage:Pick<CampaignGuidanceStorage,'setItem'>,identity:CampaignGuidanceIdentity,value:CampaignGuidanceSelection):boolean {
 try{
  const key=campaignGuidanceStorageKey(identity),pointer=selection(value);if(!key||!pointer)return false;
  const text=JSON.stringify({format:FORMAT,version:1,selection:pointer});if(text.length>MAX_TEXT)return false;
  storage.setItem(key,text);return true;
 }catch{return false;}
}
