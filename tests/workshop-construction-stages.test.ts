import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_WORKSHOP_DRAFT} from '../src/workshop-authoring.ts';
import {workshopConstructionQuote,type WorkshopConstructionState} from '../src/workshop-construction.ts';
import {workshopConstructionStage} from '../src/workshop-construction-stages.ts';
const quote=workshopConstructionQuote(DEFAULT_WORKSHOP_DRAFT);
const paid=(work=0):WorkshopConstructionState=>({version:1,revision:1,parcelId:'hearthmere-west',parameters:{...DEFAULT_WORKSHOP_DRAFT},workerId:'town-resident:73129:000',materialsPaid:quote.materials,work,workRequired:quote.workSeconds,status:work===quote.workSeconds?'complete':'building',repairs:0});
test('construction stage distinguishes an absent old-world commission from funded zero achieved work',()=>{
 const absent=workshopConstructionStage();assert.equal(absent.id,'unfunded');assert.equal(absent.ratio,0);assert.equal(absent.stageIndex,-1);
 const funded=workshopConstructionStage(paid());assert.equal(funded.id,'funded');assert.equal(funded.ratio,0);assert.equal(funded.stageIndex,0);assert.match(funded.detail,/achieved/i);
});
test('construction stages follow exact achieved-work boundaries without rounding early completion',()=>{
 const total=quote.workSeconds;
 for(const [work,id,index] of [[0,'funded',0],[.000001,'frame',1],[total/3-.000001,'frame',1],[total/3,'panels',2],[2*total/3-.000001,'panels',2],[2*total/3,'finishing',3],[total-.000001,'finishing',3],[total,'complete',4]] as const){const s=workshopConstructionStage(paid(work));assert.equal(s.id,id);assert.equal(s.stageIndex,index);assert.equal(s.ratio,work/total);}
});
test('pauses, revisions, repair receipts and reload cannot manufacture a later construction stage',()=>{
 const state=paid(quote.workSeconds/2),bytes=JSON.stringify(state),first=workshopConstructionStage(state);Object.freeze(state.parameters);Object.freeze(state);
 for(let n=0;n<100;n++)assert.deepEqual(workshopConstructionStage(state),first);
 assert.equal(JSON.stringify(state),bytes);assert.deepEqual(workshopConstructionStage(JSON.parse(bytes)),first);assert.deepEqual(workshopConstructionStage({...state,revision:20,repairs:19,materialsPaid:state.materialsPaid+76}),first);
 const misleading={...paid(),status:'complete' as const};assert.equal(workshopConstructionStage(misleading).id,'funded','status text alone is never achieved work');
});
test('stage projection rejects invalid numerical work instead of showing fabricated completion',()=>{
 for(const patch of [{work:-1},{work:NaN},{work:Infinity},{work:quote.workSeconds+1},{workRequired:0},{workRequired:-1},{workRequired:NaN},{workRequired:Infinity}])assert.throws(()=>workshopConstructionStage({...paid(),...patch}),RangeError);
});
