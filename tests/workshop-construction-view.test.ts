import test from 'node:test';
import assert from 'node:assert/strict';
import {WORKSHOP_BOARD,WORKSHOP_PARCEL,workshopConstructionQuote,workshopConstructionBoxes,type WorkshopConstructionState} from '../src/workshop-construction.ts';
import {DEFAULT_WORKSHOP_DRAFT} from '../src/workshop-authoring.ts';
import {WorkshopConstructionProjection,createWorkshopConstructionView,workshopConstructionObstacles} from '../src/workshop-construction-view.ts';
const quote=workshopConstructionQuote(DEFAULT_WORKSHOP_DRAFT);
const state:WorkshopConstructionState={version:1,revision:1,parcelId:WORKSHOP_PARCEL.id,parameters:{...DEFAULT_WORKSHOP_DRAFT},workerId:'worker',materialsPaid:quote.materials,work:0,workRequired:quote.workSeconds,status:'building',repairs:0};
test('workshop projection withholds new solids until exact acknowledgement and retries rejected revisions',()=>{
 const projection=new WorkshopConstructionProjection(),packet=projection.stage(state,0)!;assert.ok(packet.obstacles.length>0);assert.equal(projection.confirmed,undefined);assert.equal(projection.acknowledge(packet.revision+1,true),false);assert.equal(projection.acknowledge(packet.revision,false),false);
 projection.reject(packet.revision,20);assert.equal(projection.stage(state,100),null);const retry=projection.stage(state,170)!;assert.ok(retry.revision>packet.revision);assert.equal(projection.acknowledge(packet.revision,true),false);assert.equal(projection.acknowledge(retry.revision,true),true);assert.equal(projection.confirmed,state);assert.equal(projection.stage({...state,work:1},180),null);
 projection.reset();assert.equal(projection.confirmed,undefined);assert.equal(projection.acknowledge(retry.revision,true),false);const reload=projection.stage(state,200,true)!;projection.ready();assert.equal(projection.confirmed,state);assert.ok(reload.revision>retry.revision);
});
test('workshop render matrices match paid compiled solids and show actual progress only after collision confirmation',()=>{
 const view=createWorkshopConstructionView();try{
 view.update(state,undefined,WORKSHOP_BOARD,true,true);assert.equal(view.root.getObjectByName(workshopConstructionBoxes(state)[0]!.id),undefined);assert.equal(view.root.userData.stage,'unbuilt');
 view.update(state,state,WORKSHOP_BOARD,true,true);assert.equal(view.root.userData.stage,'building');const obstacles=workshopConstructionObstacles(state);assert.ok(obstacles.length>0);
 for(const b of workshopConstructionBoxes(state)){const mesh=view.root.getObjectByName(b.id)!;assert.ok(mesh);assert.deepEqual(mesh.position.toArray(),[b.center.x,b.center.y,b.center.z]);assert.deepEqual(mesh.scale.toArray(),[b.half.x*2,b.half.y*2,b.half.z*2]);assert.equal(mesh.matrixWorld.elements[12],b.center.x);}
 const progress=view.root.getObjectByName('achieved-work-progress')!;view.update({...state,work:state.workRequired/2},state,WORKSHOP_BOARD,true,true);assert.equal(progress.scale.x,.7);assert.equal(view.root.userData.work,state.workRequired/2);
 const complete={...state,work:state.workRequired,status:'complete' as const};view.update(complete,state,WORKSHOP_PARCEL,true,true);assert.equal(view.root.userData.stage,'complete');assert.equal(view.root.getObjectByName('construction-bracing'),undefined);for(const b of workshopConstructionBoxes(state).filter(b=>b.material==='workshop-roof'))assert.equal(view.root.getObjectByName(b.id)!.visible,false);
 view.update(complete,state,{x:WORKSHOP_PARCEL.x+20,z:WORKSHOP_PARCEL.z},true,true);for(const b of workshopConstructionBoxes(state).filter(b=>b.material==='workshop-roof'))assert.equal(view.root.getObjectByName(b.id)!.visible,true);
 view.update(state,state,WORKSHOP_BOARD,false,true);assert.equal(view.root.visible,false);view.update(state,state,WORKSHOP_BOARD,true,false);assert.equal(view.root.visible,false);
 }finally{view.dispose();}
});
