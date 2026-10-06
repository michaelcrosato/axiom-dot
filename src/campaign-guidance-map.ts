/** Read-only atlas destinations. Existing atlas overlays remain owned by their systems. */
import {projectCampaignGuidance,type CampaignGoalId,type CampaignGuidanceOptions,type CampaignGuidanceTarget} from './campaign-guidance.ts';
import {worldTownSupplySources,worldRestorationPlan,type State} from './world.ts';
import {townSupplyPosition} from './town-supply.ts';
import {restorationCarePosition} from './restoration-care.ts';
import {WORKSHOP_BOARD} from './workshop-construction.ts';
import type {WorldMapOverlay,WorldMapOverlayMarker} from './world-map-view.ts';
export function campaignGuidanceMarkerId(goalId:CampaignGoalId,targetId:string){return `guidance/${goalId}/${encodeURIComponent(targetId)}`;}
const labels:Record<CampaignGoalId,string>={supply:'Open town supply',construction:'Open workshop construction',restoration:'Inspect habitat restoration',care:'Inspect habitat care',regional:'Inspect regional project',town:'Inspect town life'};
function entries(state:State,options:CampaignGuidanceOptions={}){
 const out:{marker:WorldMapOverlayMarker;target:CampaignGuidanceTarget}[]=[],seen=new Set<string>();
 if(!state.regional||state.generation!==2||state.zone!=='valley')return out;
 function add(goal:CampaignGoalId,target:CampaignGuidanceTarget,detail:string){const id=campaignGuidanceMarkerId(goal,target.id);if(seen.has(id))return;seen.add(id);out.push({target,marker:{id,targetId:id,name:target.label,x:target.x,z:target.z,detail,kind:goal==='supply'?'resource':goal==='restoration'||goal==='care'&&target.panel==='restoration-care'&&target.selectionId!=='apothecary'?'habitat':goal==='care'?'repair':'project',local:goal!=='regional',inspectLabel:labels[goal],selectionGroup:`guidance/${goal}`}});}
 // Current goals come first so an exhausted source falls back to its current
 // delivery station or next feasible destination, never a stale cached point.
 for(const card of projectCampaignGuidance(state,options))if(card.target)add(card.id,card.target,`${card.title} · ${card.progress} · ${card.summary}`);
 if(state.townLife){
  const sources=worldTownSupplySources(state);for(const source of sources)if(!state.collected.includes(source.id))add('supply',{id:`town-supply/${source.id}`,label:source.label??'Valley salvage cache',x:source.x,y:source.y??0,z:source.z,panel:'town-supply',selectionId:source.id},'One finite scrap cache. Inspect to load it into shared cargo; ordinary pickup remains a separate choice.');
  const destination=townSupplyPosition(state.seed,sources,{kind:'deliver',targetId:'workshop'})!;add('supply',{id:'town-supply/workshop',label:'Second Life Salvage delivery station',...destination,panel:'town-supply',selectionId:'workshop'},'Deliver two carried scrap for twelve shared materials, or unload one into ordinary inventory.');
  add('construction',{id:'workshop-board',label:'West workshop construction board',...WORKSHOP_BOARD,panel:'workshop-construction'},'Review the bounded workshop plan, assigned resident and current cost before committing.');
 }
 if(state.restoration){const plan=worldRestorationPlan(state.seed);for(const site of plan.sites){const point=restorationCarePosition(plan,{kind:'collect',targetId:site.id})!;add('restoration',{id:site.id,label:site.label,...point,panel:'restoration',selectionId:site.id},'Exact habitat dock. Inspect the installed automaton and this habitat’s current cells and stores.');if(state.townLife)add('care',{id:site.id,label:`${site.label} care collection`,...point,panel:'restoration-care',selectionId:site.id},'Exact collection dock. Only restored, currently viable surplus can supply a finite care bundle.');}if(state.townLife){const point=restorationCarePosition(plan,{kind:'deliver',targetId:'apothecary'})!;add('care',{id:'habitat-care/apothecary',label:'Greenlight care station',...point,panel:'restoration-care',selectionId:'apothecary'},'Return carried habitat biomass here. Residents consume care only on achieved recovery arrival.');}}
 return out;
}
export function campaignGuidanceMapOverlay(state:State,options:CampaignGuidanceOptions={}):WorldMapOverlay{return {markers:entries(state,options).map(entry=>entry.marker),routes:[]};}
/** Resolve again at click time; a previously collected source never opens from a stale marker. */
export function campaignGuidanceMapTarget(state:State,markerId:string,options:CampaignGuidanceOptions={}):CampaignGuidanceTarget|undefined{return entries(state,options).find(entry=>entry.marker.id===markerId)?.target;}
