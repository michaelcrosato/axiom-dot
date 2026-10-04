import * as THREE from 'three/webgpu';
import {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';
import type {WildernessFeature} from './wilderness';

/** Visible meshes and optional outlines project the same immutable physical feature. */
export function createWildernessView(){
 const entries=new Map<string,{root:THREE.Group;canopy:THREE.Group|null;debug:THREE.Group;age:number}>();
 const materials=new Map<string,THREE.MeshStandardMaterial>();
 const material=(color:string)=>{let m=materials.get(color);if(!m){m=new THREE.MeshStandardMaterial({color,roughness:1,flatShading:true});materials.set(color,m);}return m;};
 let debugEnabled=false;
 const add=(parent:THREE.Object3D,geometry:THREE.BufferGeometry,color:string,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geometry,material(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
 function create(feature:WildernessFeature,depleted:boolean){
  const root=new THREE.Group(),debug=new THREE.Group();root.name=feature.id;root.position.set(feature.x,feature.y,feature.z);debug.name='physical-solid-outline';debug.visible=debugEnabled;root.add(debug);
  let canopy:THREE.Group|null=null;
  if(feature.kind==='tree'){
   const s=feature.treeScale!;add(root,new THREE.BoxGeometry(.35,s*1.6,.35),feature.color,0,s*.8,0);canopy=new THREE.Group();root.add(canopy);
   for(let j=0;j<3;j++)add(canopy,new THREE.ConeGeometry(s*(1.1-j*.22),s*1.7,5),j===0?'#356b57':j===1?'#487c5d':'#588961',0,s*(1.8+j*.65),0);
   // Small cut branch stub is a depletion cue, never a new collision volume.
   if(depleted)add(root,new THREE.BoxGeometry(.08,.10,.025),'#c4ab79',0,.55,.18);
  }else{
   const stone=add(root,new THREE.DodecahedronGeometry(feature.radius!,0),feature.color);stone.scale.set(feature.scale.x,feature.scale.y,feature.scale.z);
   if(depleted){const chip=add(root,new THREE.OctahedronGeometry(.065),'#d2d4b9',0,feature.radius!*feature.scale.y+.01,0);chip.scale.y=.3;}
  }
  for(const solid of feature.solids){
   const geometry=solid.convexVertices?new ConvexGeometry(Array.from({length:solid.convexVertices.length/3},(_,i)=>new THREE.Vector3(...solid.convexVertices!.slice(i*3,i*3+3) as [number,number,number]))):new THREE.BoxGeometry(solid.hx*2,solid.hy*2,solid.hz*2);
   const line=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:'#ffe08c',wireframe:true,depthTest:false,transparent:true,opacity:.65}));line.position.set(solid.x-feature.x,(solid.y??solid.hy)-feature.y,solid.z-feature.z);line.renderOrder=4;debug.add(line);
  }
  entries.set(feature.id,{root,canopy,debug,age:Infinity});return root;
 }
 function forget(id:string,root?:THREE.Object3D){const entry=entries.get(id);if(entry&&(!root||entry.root===root))entries.delete(id);}
 function hit(id:string){const entry=entries.get(id);if(entry)entry.age=0;}
 function update(dt:number,reduced:boolean){for(const entry of entries.values()){entry.age+=dt;if(entry.canopy)entry.canopy.rotation.z=reduced||entry.age>=.45?0:Math.sin(entry.age*36)*(1-entry.age/.45)*.018;}}
 function setDebug(enabled:boolean){debugEnabled=enabled;for(const entry of entries.values())entry.debug.visible=enabled;}
 return {create,forget,hit,update,setDebug,get debugEnabled(){return debugEnabled;},get count(){return entries.size;}};
}
