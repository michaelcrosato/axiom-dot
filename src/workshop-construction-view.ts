import * as THREE from 'three/webgpu';
import {workshopConstructionStage} from './workshop-construction-stages.ts';
import {WORKSHOP_BOARD,WORKSHOP_PARCEL,workshopConstructionBoxes,type WorkshopConstructionState} from './workshop-construction.ts';

export function workshopConstructionObstacles(state:WorkshopConstructionState|undefined){return workshopConstructionBoxes(state).filter(b=>b.solid).map(b=>({featureId:b.id,x:b.center.x,y:b.center.y,z:b.center.z,hx:b.half.x,hy:b.half.y,hz:b.half.z}));}
/** A dedicated cell is projected only after its exact worker acknowledgement. */
export class WorkshopConstructionProjection {
 revision=0;signature='';retryAt=0;confirmed:WorkshopConstructionState|undefined;pending:{revision:number;state:WorkshopConstructionState|undefined}|null=null;
 reset(){this.signature='';this.retryAt=0;this.confirmed=undefined;this.pending=null;}
 stage(state:WorkshopConstructionState|undefined,now:number,initial=false){const signature=JSON.stringify(state?.parameters??null);if(!initial&&(now<this.retryAt||signature===this.signature))return null;this.signature=signature;this.pending={revision:++this.revision,state};return {key:'campaign-workshop',revision:this.revision,obstacles:workshopConstructionObstacles(state)};}
 acknowledge(revision:number,loaded:boolean){if(!loaded||this.pending?.revision!==revision)return false;this.confirmed=this.pending.state;this.pending=null;return true;}
 ready(){if(this.pending)this.acknowledge(this.pending.revision,true);}
 reject(revision:number,now:number){if(this.pending?.revision!==revision)return;this.pending=null;this.signature='';this.retryAt=now+150;}
}
export function createWorkshopConstructionView(){
 const root=new THREE.Group(),building=new THREE.Group(),board=new THREE.Group();root.name='campaign-workshop';root.add(building,board);const geometry=new THREE.BoxGeometry(1,1,1),materials=new Map<string,THREE.MeshStandardMaterial>();let disposed=false;
 const palette:Record<string,string>={'workshop-stone':'#83998b','workshop-plaster':'#dcc99a','workshop-timber':'#997c59','workshop-roof':'#426d65','workshop-metal':'#83a8a0'};
 function material(color:string,detail=false){const key=color+(detail?'/detail':'');let value=materials.get(key);if(!value){value=new THREE.MeshStandardMaterial({color,roughness:.9,...(detail?{polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}:{})});materials.set(key,value);}return value;}
 function box(parent:THREE.Object3D,name:string,x:number,y:number,z:number,w:number,h:number,d:number,color:string,detail=false){const mesh=new THREE.Mesh(geometry,material(color,detail));mesh.name=name;mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 box(board,'workshop-board-post',WORKSHOP_BOARD.x,6.65,WORKSHOP_BOARD.z+.5,.12,1.3,.12,'#997c59');box(board,'workshop-board',WORKSHOP_BOARD.x,7.15,WORKSHOP_BOARD.z+.5,1.6,.65,.09,'#426d65');
 const progress=box(board,'achieved-work-progress',WORKSHOP_BOARD.x-.7,7.15,WORKSHOP_BOARD.z+.44,.01,.13,.04,'#dac78a');
 const milestones=Array.from({length:5},(_,i)=>box(board,`workshop-stage-marker-${i}`,WORKSHOP_BOARD.x-.56+i*.28,7.37,WORKSHOP_BOARD.z+.4575,.16,.07,.005,'#344b45',true));let signature='';const roofs:THREE.Mesh[]=[];
 /** Decoration is normalized inside its existing solid. Coplanar face details use
  * polygon offset rather than protruding into the certified entrance routes. */
 function detail(mesh:THREE.Mesh,name:string,x:number,y:number,z:number,w:number,h:number,d:number,color:string){const child=box(mesh,'stage-detail/'+name,x,y,z,w,h,d,color,true);child.userData.nonSolid=true;return child;}
 function topSeams(mesh:THREE.Mesh,color:string,count:number){for(let i=0;i<count;i++)detail(mesh,`top-seam-${i}`,-.4+i*.8/Math.max(1,count-1),.4925,0,.018,.015,.94,color);}
 function facePattern(mesh:THREE.Mesh,thinX:boolean,index:number){
  for(const side of [-1,1]){const face=new THREE.Group();face.name='stage-detail/sheathing-face';face.userData.nonSolid=true;face.position.set(thinX?side*.4925:0,0,thinX?0:side*.4925);if(thinX)face.rotation.y=Math.PI/2;mesh.add(face);
   const strip=(name:string,x:number,y:number,w:number,h:number,color:string,turn=0)=>{const child=box(face,`stage-detail/${name}`,x,y,0,w,h,.015,color,true);child.rotation.z=turn;child.userData.nonSolid=true;return child;};
   if(index<=1){for(const x of [-.3,0,.3])strip('timber-seam',x,0,.025,.94,'#6d553d');}
   if(index===0){for(const y of [-.3,.3])strip('shipping-strap',0,y,.94,.045,'#414f48');}
   if(index===1){strip('frame-rail',0,.39,.94,.065,'#d4b57c');strip('frame-rail',0,-.39,.94,.065,'#d4b57c');const brace=strip('diagonal-frame-brace',0,0,.85,.045,'#d4b57c',Math.PI/4);brace.name='construction-bracing';}
   if(index===2){strip('panel-joint',0,0,.024,.94,'#81745e');for(const x of [-.3,.3])strip('panel-fastening',x,-.32,.055,.055,'#99886c');}
   if(index===3){strip('finish-tape',0,-.43,.94,.035,'#dfd1b0');}
  }
 }
 function decorate(mesh:THREE.Mesh,b:ReturnType<typeof workshopConstructionBoxes>[number],index:number){
  if(index===4)return;
  const role=decodeURIComponent(b.id),foundation=role.includes('/foundation/'),roof=b.material==='workshop-roof',fixture=role.includes('bench');
  if(foundation){topSeams(mesh,index===0?'#c3b793':'#65786e',index===0?5:3);return;}
  if(roof){topSeams(mesh,index<3?'#c0b493':'#304f49',index===0?3:index===1?5:7);if(index<3)for(const z of [-.28,.28])detail(mesh,'roof-cover-tie',0,.4925,z,.94,.015,.035,'#46534a');return;}
  if(fixture){for(const x of [-.28,.28]){detail(mesh,'fixture-wrap-top',x,.4925,0,.075,.015,.98,'#a99772');for(const z of [-.4925,.4925])detail(mesh,'fixture-wrap-side',x,0,z,.075,.98,.015,'#a99772');}if(index>=2)detail(mesh,'fixture-package-label',0,.4925,0,.24,.015,.28,index===3?'#d9cfad':'#5c7568');return;}
  facePattern(mesh,b.half.x<b.half.z,index);
 }
 function surfaceColor(b:ReturnType<typeof workshopConstructionBoxes>[number],index:number){const role=decodeURIComponent(b.id);if(index===4)return palette[b.material]??'#a9b59b';if(role.includes('/foundation/'))return palette['workshop-stone']!;if(b.material==='workshop-roof')return index>=3?palette['workshop-roof']!:'#6e796a';if(role.includes('bench'))return index>=3?'#b1b098':'#8b957f';if(index>=2)return palette[b.material]??'#a9b59b';return index===0?'#b29a70':'#957d58';}
 function update(state:WorkshopConstructionState|undefined,confirmed:WorkshopConstructionState|undefined,player:{x:number;z:number},terrain:boolean,enabled:boolean){
  if(disposed)return;root.visible=enabled&&terrain&&Math.hypot(player.x-WORKSHOP_PARCEL.x,player.z-WORKSHOP_PARCEL.z)<100;board.visible=root.visible;
  const current=confirmed&&state&&JSON.stringify(confirmed.parameters)===JSON.stringify(state.parameters)?state:undefined,stage=workshopConstructionStage(current),key=current?JSON.stringify([current.parameters,stage.id]):'';
  if(key!==signature){signature=key;building.clear();roofs.length=0;if(current)for(const b of workshopConstructionBoxes(current)){const mesh=box(building,b.id,b.center.x,b.center.y,b.center.z,b.half.x*2,b.half.y*2,b.half.z*2,surfaceColor(b,stage.stageIndex));mesh.userData.constructionStage=stage.id;mesh.userData.temporary=stage.stageIndex<4;if(b.material==='workshop-roof')roofs.push(mesh);decorate(mesh,b,stage.stageIndex);}}
  building.visible=!!current&&root.visible;for(const roof of roofs)roof.visible=!(Math.abs(player.x-WORKSHOP_PARCEL.x)<WORKSHOP_PARCEL.hx+1&&Math.abs(player.z-WORKSHOP_PARCEL.z)<WORKSHOP_PARCEL.hz+1);
  const ratio=stage.ratio;progress.visible=!!current;progress.scale.x=Math.max(.01,ratio*1.4);progress.position.x=WORKSHOP_BOARD.x-.7+ratio*.7;for(let i=0;i<milestones.length;i++){milestones[i]!.visible=!!current;milestones[i]!.material=material(i<=stage.stageIndex?'#dac78a':'#344b45',true);}root.userData.stage=current?.status??'unbuilt';root.userData.constructionStage=stage.id;root.userData.constructionStageLabel=stage.label;root.userData.work=current?.work??0;root.updateMatrixWorld(true);
 }
 return {root,update,dispose(){if(disposed)return;disposed=true;building.clear();board.clear();root.clear();geometry.dispose();for(const m of materials.values())m.dispose();materials.clear();roofs.length=0;root.removeFromParent();}};
}
export const WORKSHOP_CONSTRUCTION_VIEW_ENGINE=Object.freeze({kind:'axiom-workshop-construction-view',create:createWorkshopConstructionView,Projection:WorkshopConstructionProjection,obstacles:workshopConstructionObstacles});
