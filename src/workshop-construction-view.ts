import * as THREE from 'three/webgpu';
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
 const root=new THREE.Group(),building=new THREE.Group(),board=new THREE.Group();root.name='campaign-workshop';root.add(building,board);const geometry=new THREE.BoxGeometry(1,1,1),materials=new Map<string,THREE.MeshStandardMaterial>();
 const palette:Record<string,string>={'workshop-stone':'#83998b','workshop-plaster':'#dcc99a','workshop-timber':'#997c59','workshop-roof':'#426d65','workshop-metal':'#83a8a0'};
 function material(color:string){let value=materials.get(color);if(!value){value=new THREE.MeshStandardMaterial({color,roughness:.9});materials.set(color,value);}return value;}
 function box(parent:THREE.Group,name:string,x:number,y:number,z:number,w:number,h:number,d:number,color:string){const mesh=new THREE.Mesh(geometry,material(color));mesh.name=name;mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 box(board,'workshop-board-post',WORKSHOP_BOARD.x,6.65,WORKSHOP_BOARD.z+.5,.12,1.3,.12,'#997c59');box(board,'workshop-board',WORKSHOP_BOARD.x,7.15,WORKSHOP_BOARD.z+.5,1.6,.65,.09,'#426d65');
 const progress=box(board,'achieved-work-progress',WORKSHOP_BOARD.x-.7,7.15,WORKSHOP_BOARD.z+.44,.01,.13,.04,'#dac78a');let signature='';const roofs:THREE.Mesh[]=[];
 function disposeBracing(){building.traverse(o=>{if(o instanceof THREE.LineSegments){o.geometry.dispose();(o.material as THREE.Material).dispose();}});}
 function update(state:WorkshopConstructionState|undefined,confirmed:WorkshopConstructionState|undefined,player:{x:number;z:number},terrain:boolean,enabled:boolean){
  root.visible=enabled&&terrain&&Math.hypot(player.x-WORKSHOP_PARCEL.x,player.z-WORKSHOP_PARCEL.z)<100;board.visible=root.visible;
  const current=confirmed&&state&&JSON.stringify(confirmed.parameters)===JSON.stringify(state.parameters)?state:undefined,key=current?JSON.stringify([current.parameters,current.status]):'';
  if(key!==signature){signature=key;disposeBracing();building.clear();roofs.length=0;if(current)for(const b of workshopConstructionBoxes(current)){const mesh=box(building,b.id,b.center.x,b.center.y,b.center.z,b.half.x*2,b.half.y*2,b.half.z*2,current.status==='building'?'#9c8d70':palette[b.material]??'#a9b59b');if(b.material==='workshop-roof')roofs.push(mesh);if(current.status==='building'){const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:'#e4c98c'}));edges.name='construction-bracing';mesh.add(edges);}}}
  building.visible=!!current&&root.visible;for(const roof of roofs)roof.visible=!(Math.abs(player.x-WORKSHOP_PARCEL.x)<WORKSHOP_PARCEL.hx+1&&Math.abs(player.z-WORKSHOP_PARCEL.z)<WORKSHOP_PARCEL.hz+1);
  const ratio=current?current.work/current.workRequired:0;progress.visible=!!current;progress.scale.x=Math.max(.01,ratio*1.4);progress.position.x=WORKSHOP_BOARD.x-.7+ratio*.7;root.userData.stage=current?.status??'unbuilt';root.userData.work=current?.work??0;root.updateMatrixWorld(true);
 }
 return {root,update,dispose(){disposeBracing();geometry.dispose();for(const m of materials.values())m.dispose();root.removeFromParent();}};
}
export const WORKSHOP_CONSTRUCTION_VIEW_ENGINE=Object.freeze({kind:'axiom-workshop-construction-view',create:createWorkshopConstructionView,Projection:WorkshopConstructionProjection,obstacles:workshopConstructionObstacles});
