import type {WorkshopConstructionState} from './workshop-construction.ts';
/** Presentation phases only. Existing achieved work owns progression; these phases never change collision. */
export type WorkshopConstructionStageId='unfunded'|'funded'|'frame'|'panels'|'finishing'|'complete';
export interface WorkshopConstructionStage {id:WorkshopConstructionStageId;ratio:number;stageIndex:-1|0|1|2|3|4;label:string;detail:string}
const stages=Object.freeze({
 unfunded:Object.freeze({stageIndex:-1 as const,label:'Unfunded parcel',detail:'No workshop commission has been accepted. Reviewing a recipe does not pay or begin construction.'}),
 funded:Object.freeze({stageIndex:0 as const,label:'Funded · awaiting prefabrication',detail:'Materials are committed, but no achieved prefabrication work is recorded yet. Temporary covers mark the reserved solid structure.'}),
 frame:Object.freeze({stageIndex:1 as const,label:'Frame prefabrication',detail:'The assigned resident has begun achieved craft work at Second Life Salvage. Temporary sheathing and covers remain on unfinished surfaces.'}),
 panels:Object.freeze({stageIndex:2 as const,label:'Wall and roof panel stage',detail:'At least one third of required prefabrication work is achieved. The panel finish is revealed within the existing protected structure.'}),
 finishing:Object.freeze({stageIndex:3 as const,label:'Fittings and finishes',detail:'At least two thirds of required prefabrication work is achieved. Final commissioning remains incomplete; temporary finish covers stay until all work is earned.'}),
 complete:Object.freeze({stageIndex:4 as const,label:'Workshop complete',detail:'All required prefabrication work is achieved. Temporary covers and bracing are removed; the paid repair service is available at the board.'}),
});
/** Never advances time or mutates the saved state. A status label alone cannot earn a later phase. */
export function workshopConstructionStage(state?:WorkshopConstructionState):Readonly<WorkshopConstructionStage> {
 if(!state)return Object.freeze({id:'unfunded',ratio:0,...stages.unfunded});
 const {work,workRequired}=state;
 if(!Number.isFinite(work)||!Number.isFinite(workRequired)||workRequired<=0||work<0||work>workRequired)throw RangeError('Construction stages require bounded achieved work.');
 const id:WorkshopConstructionStageId=work===0?'funded':work===workRequired?'complete':work<workRequired/3?'frame':work<2*workRequired/3?'panels':'finishing';
 return Object.freeze({id,ratio:work/workRequired,...stages[id]});
}
