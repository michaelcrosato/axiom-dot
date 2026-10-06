/** One approved, paid campaign workshop. Town portions remain the existing conserved currency. */
import {TOWN_CENTER,startingTown,type TownBox} from './starting-town.ts';
import {townResidents} from './town-residents.ts';
import {compileWorkshopDraft,validateWorkshopDraft,type WorkshopDraft} from './workshop-authoring.ts';
import {assignTownWorkshopWorker,debitTownWorkshopMaterials,type TownLifeState} from './town-life.ts';
export const WORKSHOP_PARCEL=Object.freeze({id:'hearthmere-west' as const,label:'West workshop parcel',x:TOWN_CENTER.x-50,y:6,z:TOWN_CENTER.z-56,hx:5.2,hz:4.5});
export const WORKSHOP_BOARD=Object.freeze({x:WORKSHOP_PARCEL.x,y:6,z:TOWN_CENTER.z-49});
export const WORKSHOP_REPAIR_COST=4;
export const WORKSHOP_REPAIR_HP=25;
export interface WorkshopConstructionState {version:1;revision:number;parcelId:typeof WORKSHOP_PARCEL.id;parameters:WorkshopDraft;workerId:string;materialsPaid:number;work:number;workRequired:number;status:'building'|'complete';repairs:number}
export type WorkshopConstructionCommand={kind:'build';expectedRevision:number;parcelId:typeof WORKSHOP_PARCEL.id;parameters:WorkshopDraft;workerId:string}|{kind:'repair';expectedRevision:number};
export interface WorkshopConstructionContext {seed:number;zone:string;player:{x:number;z:number;hp:number;y?:number;feetY?:number};actors?:readonly {x:number;z:number;y?:number;feetY?:number}[]}
function exact(v:unknown,names:readonly string[]):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)!,'value'));}
const integer=(n:unknown,min=0,max=1001):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;
function freeze<T>(v:T):T{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export function workshopConstructionQuote(parameters:WorkshopDraft){const {costs}=compileWorkshopDraft(parameters).workshop.plan;return Object.freeze({materials:8+Math.ceil(((costs.stone??0)+(costs.timber??0)+(costs.metal??0))/2),workSeconds:(costs.labor??0)*3,recipeCosts:costs});}
export function validWorkshopConstructionCommand(v:unknown):v is WorkshopConstructionCommand {
 if(!v||typeof v!=='object')return false;
 if(exact(v,['kind','expectedRevision'])&&v.kind==='repair')return integer(v.expectedRevision,1);
 if(!exact(v,['kind','expectedRevision','parcelId','parameters','workerId'])||v.kind!=='build'||v.expectedRevision!==0||v.parcelId!==WORKSHOP_PARCEL.id||typeof v.workerId!=='string'||v.workerId.length>128)return false;
 try{validateWorkshopDraft(v.parameters);return true;}catch{return false;}
}
export function validWorkshopConstruction(v:unknown,seed:number):v is WorkshopConstructionState {
 if(!integer(seed,0,0xffffffff)||!exact(v,['version','revision','parcelId','parameters','workerId','materialsPaid','work','workRequired','status','repairs'])||v.version!==1||v.parcelId!==WORKSHOP_PARCEL.id||!integer(v.repairs,0,1000)||v.revision!==1+v.repairs||!townResidents(seed).some(r=>r.id===v.workerId))return false;
 try{const q=workshopConstructionQuote(validateWorkshopDraft(v.parameters));return v.materialsPaid===q.materials+v.repairs*WORKSHOP_REPAIR_COST&&v.workRequired===q.workSeconds&&typeof v.work==='number'&&Number.isFinite(v.work)&&v.work>=0&&v.work<=q.workSeconds&&v.status===(v.work===q.workSeconds?'complete':'building')&&(v.status==='complete'||v.repairs===0);}catch{return false;}
}
export function immutableWorkshopConstruction(v:unknown,seed:number):WorkshopConstructionState {if(!validWorkshopConstruction(v,seed))throw RangeError('Invalid campaign workshop snapshot.');return freeze(structuredClone(v));}
const boxCache=new WeakMap<WorkshopDraft,readonly TownBox[]>();
/** Full collision exists from acceptance; growing scaffolding never traps a body later. */
export function workshopConstructionBoxes(state:Pick<WorkshopConstructionState,'parameters'>|undefined):readonly TownBox[]{
 if(!state)return [];const known=boxCache.get(state.parameters);if(known)return known;
 const boxes=freeze(compileWorkshopDraft(state.parameters).workshop.plan.shapes.map(shape=>({id:`campaign-workshop/${shape.id}`,center:{x:shape.center.x+WORKSHOP_PARCEL.x,y:shape.center.y+6,z:shape.center.z+WORKSHOP_PARCEL.z},half:{...shape.half},material:shape.material,solid:shape.solid})));
 boxCache.set(state.parameters,boxes);return boxes;
}
export function workshopConstructionPosition(){return WORKSHOP_BOARD;}
/** All permitted grammar extremes sit on existing flat terrain and outside streets/services/homes. */
export function workshopParcelClear(seed:number,parameters:WorkshopDraft){
 const boxes=workshopConstructionBoxes({parameters});return boxes.every(b=>Math.abs(b.center.x-WORKSHOP_PARCEL.x)+b.half.x<=WORKSHOP_PARCEL.hx&&Math.abs(b.center.z-WORKSHOP_PARCEL.z)+b.half.z<=WORKSHOP_PARCEL.hz&&(!b.solid||b.center.y-b.half.y>=8.16||b.center.y+b.half.y<=6.05||(b.center.z+b.half.z<TOWN_CENTER.z-47.9-.6))&&startingTown(seed).boxes.every(old=>!old.solid||Math.abs(b.center.x-old.center.x)>=b.half.x+old.half.x+.6||Math.abs(b.center.z-old.center.z)>=b.half.z+old.half.z+.6));
}
export function workshopConstructionBlockReason(current:WorkshopConstructionState|undefined,life:TownLifeState,context:WorkshopConstructionContext,command:WorkshopConstructionCommand):string|null {
 if(!validWorkshopConstructionCommand(command))return 'Unsupported workshop command.';
 if(context.seed!==life.seed||context.zone!=='valley'||context.player.hp<=0||context.player.hp>100||![context.player.hp,context.player.x,context.player.z].every(Number.isFinite)||(context.player.feetY!==undefined&&(!Number.isFinite(context.player.feetY)||Math.abs(context.player.feetY-6)>.45))||(context.player.y!==undefined&&(!Number.isFinite(context.player.y)||Math.abs(context.player.y-6)>.45))||Math.hypot(context.player.x-WORKSHOP_BOARD.x,context.player.z-WORKSHOP_BOARD.z)>3.5)return 'Reach the west workshop board on foot.';
 if(command.expectedRevision!==(current?.revision??0))return 'The workshop changed; inspect its current state.';
 if(command.kind==='repair')return !current||current.status!=='complete'?'Finish the workshop before requesting repairs.':current.repairs>=1000?'This workshop service ledger is full.':context.player.hp>=100?'Your suit does not need repairs.':life.resources.materials<4?'Repairs need 4 shared town materials.':null;
 if(current)return 'This parcel already has its workshop; demolition and refunds are not supported.';
 const quote=workshopConstructionQuote(command.parameters);if(life.resources.materials<quote.materials)return `Construction needs ${quote.materials} shared town materials.`;
 if(!workshopParcelClear(context.seed,command.parameters))return 'The approved parcel does not clear protected buildings.';
 if((context.actors??[]).some(a=>![a.x,a.z].every(Number.isFinite)||(a.y!==undefined&&!Number.isFinite(a.y))||(a.feetY!==undefined&&!Number.isFinite(a.feetY))))return 'Workshop placement requires valid explorer positions.';
 const boxes=workshopConstructionBoxes({parameters:command.parameters}).filter(b=>b.solid&&b.center.y-b.half.y<8.16&&b.center.y+b.half.y>6.05);
 const actors=[...life.residents,...(context.actors??[]),context.player];
 if(actors.some(a=>{const y='feetY' in a?a.feetY:'y' in a?a.y:6;return (y??6)<9&&(y??6)>3&&boxes.some(b=>Math.abs(a.x-b.center.x)<b.half.x+.6&&Math.abs(a.z-b.center.z)<b.half.z+.6);}))return 'Move all explorers and residents clear of the future walls and benches.';
 if(!assignTownWorkshopWorker(life,command.workerId))return 'Choose an available resident for real prefabrication work at Second Life Salvage.';
 return null;
}
export function applyWorkshopConstruction(current:WorkshopConstructionState|undefined,life:TownLifeState,context:WorkshopConstructionContext,command:WorkshopConstructionCommand):{construction:WorkshopConstructionState;life:TownLifeState;hp:number;message:string}|null {
 if(workshopConstructionBlockReason(current,life,context,command))return null;
 if(command.kind==='repair'){const next=debitTownWorkshopMaterials(life,4);if(!next||!current)return null;return {construction:freeze({...current,revision:current.revision+1,repairs:current.repairs+1,materialsPaid:current.materialsPaid+4}),life:next,hp:Math.min(100,context.player.hp+25),message:`Four town materials restored ${Math.min(25,100-context.player.hp)} suit HP at the new workshop.`};}
 const quote=workshopConstructionQuote(command.parameters),assigned=assignTownWorkshopWorker(life,command.workerId);if(!assigned)return null;const next=debitTownWorkshopMaterials(assigned,quote.materials);if(!next)return null;
 const construction:WorkshopConstructionState=freeze({version:1,revision:1,parcelId:WORKSHOP_PARCEL.id,parameters:validateWorkshopDraft(command.parameters),workerId:command.workerId,materialsPaid:quote.materials,work:0,workRequired:quote.workSeconds,status:'building',repairs:0});
 return {construction,life:next,hp:context.player.hp,message:`${quote.materials} shared materials committed. The assigned resident prefabricates at Second Life Salvage; ${quote.workSeconds} seconds of achieved craft work completes the west workshop. Materials are consumed; no refunds.`};
}
/** Only the authoritative town-life achieved-work receipt may supply this value. */
export function advanceWorkshopConstruction(state:WorkshopConstructionState,achievedSeconds:number):WorkshopConstructionState {
 if(!Number.isFinite(achievedSeconds)||achievedSeconds<0||achievedSeconds>120)throw RangeError('Invalid achieved workshop work receipt.');if(state.status==='complete'||achievedSeconds===0)return state;
 const work=Math.min(state.workRequired,Math.round((state.work+achievedSeconds)*1e8)/1e8);return freeze({...state,work,status:work===state.workRequired?'complete':'building'});
}
export const WORKSHOP_CONSTRUCTION_ENGINE=Object.freeze({kind:'axiom-workshop-construction' as const,command:validWorkshopConstructionCommand,validate:validWorkshopConstruction,immutable:immutableWorkshopConstruction,apply:applyWorkshopConstruction,advance:advanceWorkshopConstruction,boxes:workshopConstructionBoxes,quote:workshopConstructionQuote,position:workshopConstructionPosition,blockReason:workshopConstructionBlockReason});
