import {supplyWorking,type Waterworks} from './waterworks.ts';

/** One bounded settlement, supplied only by actual network delivery. No offline simulation. */
export interface Settlement { reserve:number; consumed:number; spilled:number; served:number }
export const RESERVE_CAPACITY=24;
export const DEMAND_PER_SECOND=.5;
export const emptySettlement=(previousDelivery=0):Settlement=>({reserve:0,consumed:previousDelivery,spilled:0,served:0});
export function advanceSettlement(s:Settlement,delivered:number,dt:number):Settlement {
  if(!Number.isFinite(dt)||dt<=0||!Number.isFinite(delivered)||delivered<0)return s;
  dt=Math.min(dt,1);
  const consumed=Math.min(s.reserve+delivered,DEMAND_PER_SECOND*dt);
  const remaining=s.reserve+delivered-consumed;
  if(!delivered&&!consumed)return s;
  return {reserve:Math.min(RESERVE_CAPACITY,remaining),consumed:s.consumed+consumed,
    spilled:s.spilled+Math.max(0,remaining-RESERVE_CAPACITY),served:s.served+consumed/DEMAND_PER_SECOND};
}
export const JOBS=[
  {id:'commission',title:'Commission the river route',reward:10,description:'After accepting, deliver 20 L through the modular waterworks. Return with the outlet supplying Mossbank.'},
  {id:'reserve',title:'Secure an emergency reserve',reward:15,description:'Fill Mossbank’s reserve to 12 L and the waterworks tank to 10 L. Keep the outlet supplying water when you report back.'},
  {id:'service',title:'Keep the settlement supplied',reward:25,description:'After accepting, provide 30 seconds of water service and deliver 20 more litres. Report back with supply running.'},
] as const;
export type JobId=typeof JOBS[number]['id'];
export interface Jobs { completed:JobId[]; active:{id:JobId;deliveredAt:number;servedAt:number}|null; renown:number }
export const emptyJobs=():Jobs=>({completed:[],active:null,renown:0});
export function nextJob(j:Jobs){return JOBS[j.completed.length];}
export function jobReady(j:Jobs,s:Settlement,w:Waterworks):boolean {
  const a=j.active;if(!a||!supplyWorking(w))return false;
  const delivered=w.delivered-a.deliveredAt,served=s.served-a.servedAt;
  if(a.id==='commission')return delivered>=20-1e-7;
  if(a.id==='reserve')return s.reserve>=12-1e-7&&w.stored>=10-1e-7;
  return delivered>=20-1e-7&&served>=30-1e-7;
}
export function acceptCommission(j:Jobs,s:Settlement,w:Waterworks,id:JobId):Jobs {
  if(j.active||nextJob(j)?.id!==id)return j;
  return {...j,active:{id,deliveredAt:w.delivered,servedAt:s.served}};
}
export function claimCommission(j:Jobs,s:Settlement,w:Waterworks):Jobs {
  if(!jobReady(j,s,w)||!j.active)return j;
  const job=nextJob(j);if(!job||job.id!==j.active.id)return j;
  return {completed:[...j.completed,job.id],active:null,renown:j.renown+job.reward};
}
export function settlementNeed(s:Settlement,w:Waterworks){
  if(s.reserve<=1e-7&&!supplyWorking(w))return 'Water shortage';
  if(!supplyWorking(w))return 'Drawing on reserves';
  if(s.reserve<12)return 'Building emergency reserve';
  return 'Water needs met';
}
export function settlementTitle(renown:number){return renown>=50?'Mossbank Steward':renown>=25?'Trusted Architect':renown>=10?'Waterkeeper':'Field Architect';}
function bounded(n:unknown,max=1e9):n is number{return typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=max;}
export function validSettlement(value:unknown,w:Waterworks):value is Settlement {
  if(!value||typeof value!=='object')return false;const s=value as Settlement;
  return bounded(s.reserve,RESERVE_CAPACITY)&&bounded(s.consumed)&&bounded(s.spilled)&&bounded(s.served,2e9)
    &&s.served*DEMAND_PER_SECOND<=s.consumed+1e-5
    &&Math.abs(w.delivered-s.reserve-s.consumed-s.spilled)<1e-5;
}
export function validJobs(value:unknown,s:Settlement,w:Waterworks):value is Jobs {
  if(!value||typeof value!=='object')return false;const j=value as Jobs;
  if(!Array.isArray(j.completed)||j.completed.length>JOBS.length||!j.completed.every((id,i)=>JOBS[i]?.id===id))return false;
  if(j.renown!==JOBS.slice(0,j.completed.length).reduce((n,job)=>n+job.reward,0))return false;
  if(j.completed.length>=1&&w.delivered<20-1e-5)return false;
  if(j.completed.length===3&&(w.delivered<40-1e-5||s.served<30-1e-5))return false;
  if(j.active===null)return true;
  const a=j.active;
  return !!a&&typeof a==='object'&&a.id===nextJob(j)?.id&&bounded(a.deliveredAt,w.delivered)&&bounded(a.servedAt,s.served);
}
