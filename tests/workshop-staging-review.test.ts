import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {createWorkshopConstructionView,WorkshopConstructionProjection,workshopConstructionObstacles} from '../src/workshop-construction-view.ts';
import {WORKSHOP_PARCEL,workshopConstructionBoxes,workshopConstructionQuote,type WorkshopConstructionState} from '../src/workshop-construction.ts';
import {DEFAULT_WORKSHOP_DRAFT} from '../src/workshop-authoring.ts';
const outside={x:WORKSHOP_PARCEL.x+20,z:WORKSHOP_PARCEL.z};
function state(parameters={...DEFAULT_WORKSHOP_DRAFT}):WorkshopConstructionState {const q=workshopConstructionQuote(parameters);return {version:1,revision:1,parcelId:WORKSHOP_PARCEL.id,parameters,workerId:'review-fixture',materialsPaid:q.materials,work:0,workRequired:q.workSeconds,status:'building',repairs:0};}
function at(base:WorkshopConstructionState,ratio:number):WorkshopConstructionState{return {...base,work:base.workRequired*ratio,status:ratio===1?'complete':'building'};}
function geometry(view:ReturnType<typeof createWorkshopConstructionView>){const result:unknown[]=[];view.root.traverse(o=>{if(o instanceof THREE.Mesh)result.push([o.name,o.visible,o.matrixWorld.toArray(),(o.material as THREE.MeshStandardMaterial).color.getHexString()]);});return result;}

test('independent staging review keeps decorative corners inside every narrow and wide room envelope through completion',()=>{
 for(const rearRooms of [1,2,3])for(const high of [false,true]){
  const base=state({...DEFAULT_WORKSHOP_DRAFT,seed:high?0xffffffff:0,rearRooms,width:high?9.6:8.4,depth:high?8.2:7,hallDepth:high?3.7:3.1,doorwayWidth:1.4}),view=createWorkshopConstructionView(),solids=workshopConstructionObstacles(base);
  try{for(const ratio of [0,.01,1/3,2/3,1]){view.update(at(base,ratio),base,outside,true,true);assert.deepEqual(workshopConstructionObstacles(at(base,ratio)),solids);
   for(const box of workshopConstructionBoxes(base)){const mesh=view.root.getObjectByName(box.id)!;assert(mesh?.visible);mesh.traverse(child=>{if(!(child instanceof THREE.Mesh))return;for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5]){const p=new THREE.Vector3(x,y,z).applyMatrix4(child.matrixWorld);assert(Math.abs(p.x-box.center.x)<=box.half.x+1e-7,child.name+' x');assert(Math.abs(p.y-box.center.y)<=box.half.y+1e-7,child.name+' y');assert(Math.abs(p.z-box.center.z)<=box.half.z+1e-7,child.name+' z');}});}
  }}finally{view.dispose();}
 }
});

test('independent staging review reconstructs earlier saved progress after a completed view without accepting stale physics acknowledgements',()=>{
 const base=state(),projection=new WorkshopConstructionProjection(),view=createWorkshopConstructionView(),fresh=createWorkshopConstructionView();
 try{const first=projection.stage(base,0)!;assert(projection.acknowledge(first.revision,true));view.update(at(base,1),projection.confirmed,outside,true,true);assert.equal(view.root.userData.constructionStage,'complete');
  projection.reset();const resumed=JSON.parse(JSON.stringify(at(base,1/3))),before=JSON.stringify(resumed),packet=projection.stage(resumed,10,true)!;assert.equal(projection.acknowledge(first.revision,true),false);view.update(resumed,projection.confirmed,outside,true,true);assert.equal(view.root.userData.constructionStage,'unfunded');assert.equal(view.root.getObjectByName(workshopConstructionBoxes(base)[0]!.id),undefined);
  assert(projection.acknowledge(packet.revision,true));view.update(resumed,projection.confirmed,outside,true,true);fresh.update(resumed,resumed,outside,true,true);assert.equal(view.root.userData.constructionStage,'panels');assert.deepEqual(geometry(view),geometry(fresh));
  for(let frame=0;frame<120;frame++)view.update(resumed,projection.confirmed,frame%2?WORKSHOP_PARCEL:outside,true,true);view.update(resumed,projection.confirmed,outside,true,true);assert.deepEqual(geometry(view),geometry(fresh),'camera cutaway and repeated frames cannot advance a saved stage');assert.equal(JSON.stringify(resumed),before);assert.equal(projection.stage(at(base,1),1000),null,'completion cannot create late collision');
 }finally{view.dispose();fresh.dispose();}
});
