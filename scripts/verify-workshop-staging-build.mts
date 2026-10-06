/** Actual emitted stage presentation; boundary snapshots are numerical fixtures, not earned campaign progress. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from 'three/webgpu';
import {WORKSHOP_CONSTRUCTION_VIEW_ENGINE as source} from '../src/workshop-construction-view.ts';
import {workshopConstructionBoxes,workshopConstructionQuote,validWorkshopConstruction,WORKSHOP_BOARD,WORKSHOP_PARCEL,type WorkshopConstructionState} from '../src/workshop-construction.ts';
import {workshopConstructionStage} from '../src/workshop-construction-stages.ts';
import {DEFAULT_WORKSHOP_DRAFT,validateWorkshopDraft,type WorkshopDraft} from '../src/workshop-authoring.ts';
import {townResidents} from '../src/town-residents.ts';
const root=resolve(import.meta.dirname,'..'),assets=resolve(root,'dist/client/assets'),digest=(v:unknown)=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const matches:{file:string;engine:typeof source}[]=[];
for(const file of readdirSync(assets).filter(f=>/^workshop-construction-view-.*\.js$/.test(f))){const module=await import(pathToFileURL(resolve(assets,file)).href);for(const value of Object.values(module))if((value as any)?.kind===source.kind)matches.push({file,engine:value as typeof source});}
assert.equal(matches.length,1,'Unique actual production workshop view engine');const {file,engine}=matches[0]!;
function scene(group:THREE.Group){const rows:any[]=[];group.updateMatrixWorld(true);group.traverse((o:any)=>rows.push({name:o.name,visible:o.visible,matrix:o.matrixWorld.toArray(),stage:o.userData.constructionStage??null,...(o.isMesh?{positions:Array.from(o.geometry.attributes.position.array),color:o.material.color.toArray(),polygonOffset:o.material.polygonOffset}: {})}));return rows;}
const plans:WorkshopDraft[]=[];for(const seed of [0,73129,0xffffffff]){plans.push({...DEFAULT_WORKSHOP_DRAFT,seed});for(const rearRooms of [1,2,3])for(const width of [8.4,9.6])for(const depth of [7,8.2])for(const hallDepth of [3.1,3.7])for(const doorwayWidth of [1.4,1.8])plans.push(validateWorkshopDraft({seed,rearRooms,width,depth,hallDepth,doorwayWidth}));}
const cases:any[]=[];let frames=0,maxDetails=0;
for(const parameters of plans){const quote=workshopConstructionQuote(parameters),base:WorkshopConstructionState={version:1,revision:1,parcelId:WORKSHOP_PARCEL.id,parameters,workerId:townResidents(parameters.seed)[0]!.id,materialsPaid:quote.materials,work:0,workRequired:quote.workSeconds,status:'building',repairs:0},a=source.create(),b=engine.create(),pa=new source.Projection(),pb=new engine.Projection(),obstacles=source.obstacles(base),hash=createHash('sha256'),presentations=new Map<string,string>();
 try{
  const sa=pa.stage(base,0)!,sb=pb.stage(base,0)!;assert.deepEqual(sb,sa);assert.equal(pb.acknowledge(sb.revision+1,true),false);pa.acknowledge(sa.revision,true);pb.acknowledge(sb.revision,true);
  for(const work of [0,.000001,quote.workSeconds/3-.000001,quote.workSeconds/3,2*quote.workSeconds/3-.000001,2*quote.workSeconds/3,quote.workSeconds-.000001,quote.workSeconds]){const state:WorkshopConstructionState={...base,work,status:work===quote.workSeconds?'complete':'building'},before=JSON.stringify(state);assert(validWorkshopConstruction(state,parameters.seed));assert.deepEqual(engine.obstacles(state),obstacles);assert.equal(pa.stage(state,100),null);assert.equal(pb.stage(state,100),null);
   for(const player of [WORKSHOP_BOARD,WORKSHOP_PARCEL]){a.update(state,pa.confirmed,player,true,true);b.update(state,pb.confirmed,player,true,true);const actual=scene(b.root);assert.deepEqual(actual,scene(a.root));assert.equal(b.root.userData.constructionStage,workshopConstructionStage(state).id);hash.update(JSON.stringify(actual));frames++;
    let details=0;for(const box of workshopConstructionBoxes(state)){const mesh=b.root.getObjectByName(box.id)!;assert(mesh);assert.deepEqual(mesh.position.toArray(),[box.center.x,box.center.y,box.center.z]);assert.deepEqual(mesh.scale.toArray(),[box.half.x*2,box.half.y*2,box.half.z*2]);assert.equal(mesh.visible,box.material==='workshop-roof'&&player===WORKSHOP_PARCEL?false:true);mesh.traverse((o:any)=>{if(o.userData.nonSolid)details++;if(!o.isMesh)return;const bounds=new THREE.Box3().setFromObject(o);for(const axis of ['x','y','z'] as const){assert(bounds.min[axis]>=box.center[axis]-box.half[axis]-1e-6);assert(bounds.max[axis]<=box.center[axis]+box.half[axis]+1e-6);}});}
    maxDetails=Math.max(maxDetails,details);if(player===WORKSHOP_BOARD)presentations.set(workshopConstructionStage(state).id,digest(actual.filter(r=>r.name.startsWith('campaign-workshop/')||r.name.startsWith('stage-detail/'))));
   }assert.equal(JSON.stringify(state),before);
  }
  assert.equal(new Set(presentations.values()).size,5,'Five physically distinct presentation stages');pb.reset();b.update(base,pb.confirmed,WORKSHOP_BOARD,true,true);assert.equal(b.root.userData.constructionStage,'unfunded');assert.equal(pb.acknowledge(sb.revision,true),false);const reload=pb.stage(JSON.parse(JSON.stringify(base)),200,true)!;pb.reject(reload.revision,200);assert.equal(pb.stage(base,300),null);const retry=pb.stage(base,350)!;assert(pb.acknowledge(retry.revision,true));b.update(base,pb.confirmed,WORKSHOP_BOARD,true,true);assert.equal(b.root.userData.constructionStage,'funded');
  cases.push({parameters,stages:[...presentations.keys()],solids:obstacles.length,sha256:hash.digest('hex')});
 }finally{a.dispose();b.dispose();}
}
assert(maxDetails<512,'All extreme recipes keep bounded decoration within the original structure');
const files=['src/workshop-construction-stages.ts','src/workshop-construction-view.ts','src/workshop-construction.ts','src/workshop-authoring.ts','src/workshop-construction-ui.ts','src/workshop-construction-lab.ts','src/main.ts','src/town-supply-ui.ts','src/restoration-care-ui.ts'];
const report={kind:'axiom-workshop-staging-emitted-verification',version:1,verifiedAt:new Date().toISOString(),scope:'Source and actual emitted Three geometry/material/matrix parity across all dimension extremes and achieved-work boundaries. Boundary snapshots are validated numerical fixtures, not claims that a player earned work or visited a location. Existing workshop emitted gate separately exercises earned work, actual Rapier routes and HTTP/save authority. No browser/GPU/touch/device acceptance.',asset:{file,sha256:digest(readFileSync(resolve(assets,file),'utf8'))},sourceHashes:Object.fromEntries(files.map(f=>[f,digest(readFileSync(resolve(root,f),'utf8'))])),plans:cases.length,frames,maxDetails,colliders:'Exact original solid arrays invariant across every stage; no work-driven collision replacement',acknowledgements:'Unconfirmed, stale, reset, rejected, retry and reload paths exercised',cases};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({plans:cases.length,frames,maxDetails,file,output:process.argv[2]}));
