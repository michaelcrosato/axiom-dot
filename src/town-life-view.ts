import * as THREE from 'three/webgpu';
import {townLifeFacilities,type TownLifeState} from './town-life.ts';
import {townLifeTaskPoint,townLifeTaskStages} from './town-navigation.ts';
interface Part {facility:number;shape:0|1;x:number;y:number;z:number;w:number;h:number;d:number;color:number;marker?:boolean}
/** Findable open-air stations in two instanced draws. Pads are markers, not hidden colliders. */
export function createTownLifeView(seed:number,townLayout?:import('./starting-town.ts').TownLayout){
 const root=new THREE.Group();root.name='hearthmere-life-services';const facilities=townLifeFacilities(seed,townLayout),parts:Part[]=[];
 for(let i=0;i<facilities.length;i++){
  const f=facilities[i]!,add=(shape:0|1,x:number,y:number,z:number,w:number,h:number,d:number,color:number,marker=false)=>parts.push({facility:i,shape,x:f.x+x,y:6+y,z:f.z+z,w,h,d,color,...(marker?{marker:true}:{})});
  const color=f.kind==='home'?0x9da37b:f.kind==='garden'?0x608255:f.kind==='well'||f.kind==='apothecary'?0x70aaa4:f.kind==='square'?0xbe9e68:0xb28459;
  // The visible grounds come from the same reachable task points as authority.
  // A 24-seat square is no longer represented by one tiny crowded carpet.
  const points=Array.from({length:f.capacity},(_,slot)=>f.actions.flatMap(action=>Array.from({length:townLifeTaskStages(action)},(_,stage)=>townLifeTaskPoint(f,slot,action,stage)))).flat();
  const minX=Math.min(...points.map(p=>p.x-f.x))-.6,maxX=Math.max(...points.map(p=>p.x-f.x))+.6,minZ=Math.min(...points.map(p=>p.z-f.z))-.6,maxZ=Math.max(...points.map(p=>p.z-f.z))+.6;
  add(0,(minX+maxX)/2,.018,(minZ+maxZ)/2,maxX-minX,.036,maxZ-minZ,color);
  add(1,minX-.3,.07,minZ-.2,.24,.08,.24,0x90c4a2,true);
  // Low work objects sit outside the complete traversed task envelope. They
  // describe fetch/work/put-away areas without secretly obstructing navigation.
  if(f.kind==='garden')for(const side of [minX-.45,maxX+.45]){
   add(0,side,.10,(minZ+maxZ)/2,.5,.18,maxZ-minZ,0x665740);
   add(0,side,.25,(minZ+maxZ)/2,.28,.28,Math.max(.3,maxZ-minZ-.6),0x6e964f);
  }
  else if(f.kind==='well'){
   add(1,minX-.8,.4,minZ+.6,.55,.75,.55,0x758f87);add(1,minX-.8,.8,minZ+.6,.46,.025,.46,0x68afa9);
   add(0,minX-.65,.20,maxZ-.3,.5,.4,.5,0x99805d);
  }
  else if(f.kind==='square'||f.kind==='inn')for(const side of [minX-.65,maxX+.65]){
   add(0,side,.42,(minZ+maxZ)/2,.38,.18,Math.min(3.4,maxZ-minZ),0x9a7852);
   for(const z of [(minZ+maxZ)/2-1.1,(minZ+maxZ)/2+1.1])add(0,side,.2,z,.28,.4,.22,0x8b7250);
  }
  else if(f.kind!=='home'){
   add(0,maxX+.55,.7,minZ+.3,.25,1.4,.25,0x8a7252);add(0,maxX+.55,1.3,minZ+.3,.9,.55,.12,color);
   add(0,minX-.6,.35,(minZ+maxZ)/2,.45,.7,Math.min(2.3,maxZ-minZ),f.kind==='apothecary'?0x92b5ad:0x9a7852);
  }

 }
 const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,flatShading:true}),geometries=[new THREE.BoxGeometry(1,1,1),new THREE.CylinderGeometry(1,1,1,10)];
 const meshes=geometries.map((g,i)=>{const m=new THREE.InstancedMesh(g,material,parts.filter(p=>p.shape===i).length);m.count=0;m.frustumCulled=false;root.add(m);return m;});
 const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion(),color=new THREE.Color();let signature='',visibleFacilities=0;
 function update(life:TownLifeState|undefined,confirmed:(x:number,z:number)=>boolean,enabled:boolean){
  root.visible=enabled&&!!life;if(!root.visible||!life)return;
  const visible=facilities.map(f=>confirmed(f.x,f.z)),status=life.facilities.map((f,i)=>f.closedFor>0||f.condition<15?0:f.occupants.length+f.reservations.length>=facilities[i]!.capacity?1:2),next=visible.map((v,i)=>v?status[i]:-1).join(',');if(next===signature)return;signature=next;visibleFacilities=visible.filter(Boolean).length;
  const counts=[0,0];for(const p of parts){if(!visible[p.facility])continue;const m=meshes[p.shape]!,slot=counts[p.shape]!;counts[p.shape]=slot+1;position.set(p.x,p.y,p.z);scale.set(p.w,p.h,p.d);matrix.compose(position,rotation,scale);m.setMatrixAt(slot,matrix);m.setColorAt(slot,color.setHex(p.marker?[0xc16e53,0xd4b55f,0x90c4a2][status[p.facility]!]!:p.color));}
  for(let i=0;i<meshes.length;i++){const m=meshes[i]!;m.count=counts[i]!;m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;}
 }
 return {root,facilities,update,get stats(){return {facilities:facilities.length,visibleFacilities,meshes:2,maximumInstances:parts.length,instances:meshes.reduce((n,m)=>n+m.count,0)};},dispose(){for(const m of meshes){m.geometry.dispose();m.dispose();}material.dispose();root.removeFromParent();}};
}
