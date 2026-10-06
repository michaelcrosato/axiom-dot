import {validRestorationCareCommand} from '../src/restoration-care.ts';
import {validWorkshopConstructionCommand} from '../src/workshop-construction.ts';
import {validRestorationCommand} from '../src/restoration.ts';
import {validTownDirectorCommand} from '../src/town-director.ts';
import {validTownLifeCommand} from '../src/town-life.ts';
import {validTownCommand} from '../src/starting-town.ts';
import {validRegionalFoodCommand} from '../src/regional-food.ts';
import {validRegionalTradeCommand} from '../src/regional-trade.ts';
import {validRegionalSupplyCommand} from '../src/regional-supply.ts';
import {validWaterRequestCommand} from '../src/water-requests.ts';
import {validEquipmentRecipeInput,compileCustomEquipment} from '../src/equipment.ts';
import type {CoopAction,CoopMove,CoopSync} from '../src/coop-protocol.ts';
import {JOBS} from '../src/settlement.ts';
import {PART_DEFS} from '../src/waterworks.ts';
export const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).every(k=>keys.includes(k));
const id=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=180&&!/[\u0000-\u001f]/.test(v);
const num=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export const seed=(v:unknown):v is number=>num(v,0,0xffffffff)&&Number.isInteger(v);
export function name(value:unknown){return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,32):'';}
export function action(value:unknown):CoopAction|null{
  if(!record(value)||typeof value.type!=='string')return null;
  const t=value.type;
  if(['claim-commission','repair','repair-pump','deliver','deliver-water','accept','accept-job','enter','enter-cave','exit','respawn','attack-press','attack-cancel','guard-cancel','visit-town'].includes(t))
    return exact(value,['type'])?value as CoopAction:null;
  if(t==='jump-press'||t==='guard-press')return exact(value,['type','intentId'])&&typeof value.intentId==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(value.intentId)?value as CoopAction:null;
  if(t==='collect'||t==='gather-wilderness')return exact(value,['type','id'])&&id(value.id)?value as CoopAction:null;
  if(t==='accept-commission')return exact(value,['type','id'])&&JOBS.some(j=>j.id===value.id)?value as CoopAction:null;
  if(t==='assemble-equipment'){
    if(!exact(value,['type','recipe'])||Reflect.ownKeys(value).length!==2||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)||!validEquipmentRecipeInput(value.recipe))return null;
    try{compileCustomEquipment(value.recipe);return value as CoopAction;}catch{return null;}
  }
  if(t==='refit-equipment')return exact(value,['type','seed'])&&(value.seed===null||seed(value.seed))?value as CoopAction:null;
  if(t==='restoration')return Reflect.ownKeys(value).length===2&&exact(value,['type','command'])&&validRestorationCommand(value.command)?value as CoopAction:null;
  if(t==='town-director')return Reflect.ownKeys(value).length===2&&exact(value,['type','command'])&&validTownDirectorCommand(value.command)?value as CoopAction:null;
  if(t==='restoration-care')return Reflect.ownKeys(value).length===2&&exact(value,['type','command'])&&validRestorationCareCommand(value.command)?value as CoopAction:null;
  if(t==='workshop-construction')return Reflect.ownKeys(value).length===2&&exact(value,['type','command'])&&validWorkshopConstructionCommand(value.command)?value as CoopAction:null;
  if(t==='town-life')return Reflect.ownKeys(value).length===2&&exact(value,['type','command'])&&validTownLifeCommand(value.command)?value as CoopAction:null;
  if(t==='town-purchase')return Reflect.ownKeys(value).length===2&&exact(value,['type','command'])&&validTownCommand(value.command)?value as CoopAction:null;
  if(t==='regional-food')return exact(value,['type','command'])&&validRegionalFoodCommand(value.command)&&id(value.command.targetId)?value as CoopAction:null;
  if(t==='regional-trade')return exact(value,['type','command'])&&validRegionalTradeCommand(value.command)&&id(value.command.targetId)?value as CoopAction:null;
  if(t==='regional-supply')return exact(value,['type','command'])&&validRegionalSupplyCommand(value.command)&&id(value.command.outpostId)?value as CoopAction:null;
  if(t==='water-request')return exact(value,['type','command'])&&validWaterRequestCommand(value.command)?value as CoopAction:null;
  if(t==='causal'){
    if(!exact(value,['type','command'])||!record(value.command))return null;
    const c=value.command;
    if(c.type==='repair-source')return exact(c,['type'])?value as CoopAction:null;
    const key=c.type==='accept'||c.type==='claim'?'id':c.type==='deliver-water'?'settlementId':c.type==='repair-workplace'?'workplaceId':null;
    return key&&exact(c,['type',key])&&id(c[key])?value as CoopAction:null;
  }
  if(t==='commons-trade'){
    if(!exact(value,['type','command'])||!record(value.command))return null;const c=value.command;
    return exact(c,['type','settlementId','expectedRevision'])&&c.type==='water-for-scrap'&&id(c.settlementId)&&num(c.expectedRevision,0,4)&&Number.isSafeInteger(c.expectedRevision)?value as CoopAction:null;
  }
  if(t==='cave-supply')return exact(value,['type','command'])&&record(value.command)&&exact(value.command,['type'])&&value.command.type==='connect-outfall'?value as CoopAction:null;
  if(t==='cave-water'){
    if(!exact(value,['type','command'])||!record(value.command))return null;const c=value.command;
    if(['repair-valve','repair-pump','clear-drain'].includes(String(c.type)))return exact(c,['type'])?value as CoopAction:null;
    if(c.type==='set-source'||c.type==='set-pump')return exact(c,['type','on'])&&typeof c.on==='boolean'?value as CoopAction:null;
  }
  if(t==='economy'){
    if(!exact(value,['type','command'])||!record(value.command))return null;const c=value.command;
    if(['commission-kit','collect-kit','recycle-kit'].includes(String(c.type)))return exact(c,['type','workplaceId'])&&id(c.workplaceId)?value as CoopAction:null;
    if(c.type==='repair-press')return exact(c,['type','incidentId'])&&id(c.incidentId)?value as CoopAction:null;
  }
  if(t==='ecology'){
    if(!exact(value,['type','command'])||!record(value.command))return null;
    const c=value.command;
    if(!num(c.expectedRevision,0,96)||!Number.isSafeInteger(c.expectedRevision))return null;
    if(c.type==='plant')return exact(c,['type','plotId','species','expectedRevision'])&&id(c.plotId)&&(c.species==='sunleaf'||c.species==='reedmoss')?value as CoopAction:null;
    if(c.type==='water'||c.type==='harvest')return exact(c,['type','plotId','expectedRevision'])&&id(c.plotId)?value as CoopAction:null;
    if(c.type==='craft-gel'||c.type==='use-gel')return exact(c,['type','expectedRevision'])?value as CoopAction:null;
  }
  if(t==='build'){
    if(!exact(value,['type','command'])||!record(value.command))return null;
    const c=value.command,rotation=c.rotation===undefined||num(c.rotation,0,3)&&Number.isInteger(c.rotation);
    if(c.type==='place')return exact(c,['type','kind','x','z','rotation','id','pad'])&&typeof c.kind==='string'&&Object.hasOwn(PART_DEFS,c.kind)&&num(c.x,-200,200)&&num(c.z,-200,200)&&rotation&&(c.id===undefined||id(c.id))&&(c.pad===undefined||['intake','transfer','tank','outlet'].includes(String(c.pad)))?value as CoopAction:null;
    if(c.type==='rotate')return exact(c,['type','id','rotation'])&&id(c.id)&&c.rotation!==undefined&&rotation?value as CoopAction:null;
    if(c.type==='dismantle')return exact(c,['type','id','pad'])&&((id(c.id)&&c.pad===undefined)||(c.id===undefined&&['intake','transfer','tank','outlet'].includes(String(c.pad))))?value as CoopAction:null;
    if(c.type==='connect'||c.type==='disconnect')return exact(c,['type','link'])&&id(c.link)?value as CoopAction:null;
  }
  return null;
}
export function move(value:unknown):CoopMove|null{
  if(!record(value)||!exact(value,['x','z','y','facing','grounded','crouched']))return null;
  return num(value.x,-10000,10000)&&num(value.z,-10000,10000)&&num(value.y,-1000,1000)&&num(value.facing,-Math.PI*2,Math.PI*2)&&typeof value.grounded==='boolean'&&typeof value.crouched==='boolean'?value as unknown as CoopMove:null;
}
export function sync(value:unknown):CoopSync|null{
  if(!record(value)||!exact(value,['seq','sessionId','actions','move'])||!id(value.sessionId)||!num(value.seq,1,Number.MAX_SAFE_INTEGER)||!Number.isSafeInteger(value.seq)||!Array.isArray(value.actions)||value.actions.length>8)return null;
  const actions=value.actions.map(action);if(actions.some(a=>!a))return null;
  const pose=value.move===undefined?undefined:move(value.move);if(pose===null)return null;
  return {seq:value.seq,sessionId:value.sessionId,actions:actions as CoopAction[],...(pose?{move:pose}:{})};
}
