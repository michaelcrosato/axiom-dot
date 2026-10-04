import * as THREE from 'three/webgpu';
import {ecologyPlan,ecologyStage,ecologyWeather,ECOLOGY_RULES,ECOLOGY_WATER_SCALE,type EcologyState} from './ecology.ts';
import {worldValley} from './generation.ts';
import {valleySurfaceHeight} from './valley.ts';
/** Render production plots/crops only. Native scenery is untouched; 3 plots share instanced plant/stake shapes. */
export function createEcologyView(seed:number){
 const plan=ecologyPlan(seed),valley=worldValley(seed),root=new THREE.Group();root.name='bounded-field-ecology';
 const geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[],instances:THREE.InstancedMesh[]=[];
 const geometry=<T extends THREE.BufferGeometry>(g:T)=>{geometries.push(g);return g;};
 const material=(color:string,other:THREE.MeshStandardMaterialParameters={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.88,flatShading:true,...other});materials.push(m);return m;};
 const instanced=(g:THREE.BufferGeometry,m:THREE.Material,count:number)=>{const mesh=new THREE.InstancedMesh(g,m,count);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;root.add(mesh);instances.push(mesh);return mesh;};
 const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),position=new THREE.Vector3(),scale=new THREE.Vector3();
 const place=(mesh:THREE.InstancedMesh,index:number,x:number,y:number,z:number,sx:number,sy:number,sz:number)=>{matrix.compose(position.set(x,y,z),rotation,scale.set(sx,sy,sz));mesh.setMatrixAt(index,matrix);};
 const stakes=instanced(geometry(new THREE.BoxGeometry(.065,.36,.065)),material('#d6c29e'),12);
 const bedMaterials:THREE.MeshStandardMaterial[]=[],soilMeshes:THREE.Mesh[]=[];
 for(const [i,p]of plan.plots.entries()){
  const h=ECOLOGY_RULES.plotHalf,points=[[-h,-h],[h,-h],[-h,h],[h,h]],vertices:number[]=[],indices:number[]=[],subdivisions=8;
  for(let z=0;z<=subdivisions;z++)for(let x=0;x<=subdivisions;x++){const px=p.position.x-h+2*h*x/subdivisions,pz=p.position.z-h+2*h*z/subdivisions;vertices.push(px,valleySurfaceHeight(valley,px,pz)+.022,pz);}
  for(let z=0;z<subdivisions;z++)for(let x=0;x<subdivisions;x++){const a=z*(subdivisions+1)+x,b=a+1,c=a+subdivisions+1,d=c+1;indices.push(a,c,b,b,c,d);}
  const g=geometry(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();const m=material('#65513d'),soil=new THREE.Mesh(g,m);soil.name=p.id;soil.receiveShadow=true;root.add(soil);soilMeshes.push(soil);bedMaterials.push(m);
  for(let j=0;j<4;j++){const [x,z]=points[j]!,px=p.position.x+x!,pz=p.position.z+z!;place(stakes,i*4+j,px,valleySurfaceHeight(valley,px,pz)+.18,pz,1,1,1);}
 }
 stakes.instanceMatrix.needsUpdate=true;
 const stems=instanced(geometry(new THREE.CylinderGeometry(.035,.055,1,5)),material('#65a76a'),15),leaves=instanced(geometry(new THREE.OctahedronGeometry(.23,0)),material('#8fba63'),15),blooms=instanced(geometry(new THREE.IcosahedronGeometry(.15,0)),material('#e3c96e',{emissive:'#527041',emissiveIntensity:.12}),15);
 // Rain is local field feedback, never a renderer-owned simulation or water source.
 const rain=instanced(geometry(new THREE.CylinderGeometry(.01,.01,.25,3)),material('#addcdd',{transparent:true,opacity:.65}),24);rain.castShadow=false;
 for(let i=0;i<24;i++){const p=plan.plots[Math.floor(i/8)]!,j=i%8,angle=j/8*Math.PI*2;place(rain,i,p.position.x+Math.cos(angle)*.8,p.position.y+1+(j%3)*.27,p.position.z+Math.sin(angle)*.8,1,1,1);}rain.instanceMatrix.needsUpdate=true;
 let latest:EcologyState|undefined;
 const wet=new THREE.Color('#3a5144'),dry=new THREE.Color('#806445'),green=new THREE.Color('#85b76b'),purple=new THREE.Color('#a5c4b2');
 return {root,plan,plots:soilMeshes,sync(state:EcologyState|undefined){
  root.visible=!!state;if(!state||state===latest)return;latest=state;
  rain.visible=ecologyWeather(seed,state.tick*ECOLOGY_RULES.step).rainRate>0;
  for(const [i,p]of state.plots.entries()){
   const pp=plan.plots[i]!,stage=ecologyStage(p.crop),fraction=p.crop?p.crop.growth/ECOLOGY_RULES.growthRequired:0,height=stage==='empty'?0:stage==='seeded'?.08:.16+fraction*.8;
   bedMaterials[i]!.color.copy(dry).lerp(wet,p.soilWater/(ECOLOGY_RULES.soilCapacity*ECOLOGY_WATER_SCALE));
   for(let j=0;j<5;j++){
    const id=i*5+j,x=pp.position.x+(j===4?0:(j%2-.5)*1.03),z=pp.position.z+(j===4?0:(Math.floor(j/2)-.5)*1.03),y=valleySurfaceHeight(valley,x,z)+.04;
    place(stems,id,x,y+height*.5,z,height===0?0:1,height,height===0?0:1);place(leaves,id,x,y+height*.72,z,height*.9,height*.45,height*.7);place(blooms,id,x,y+height,z,stage==='ripe'?1:stage==='budding'?.45:0,stage==='ripe'?1:stage==='budding'?.45:0,stage==='ripe'?1:stage==='budding'?.45:0);
    leaves.setColorAt(id,p.crop?.species==='reedmoss'?purple:green);
   }
  }
  for(const mesh of [stems,leaves,blooms])mesh.instanceMatrix.needsUpdate=true;if(leaves.instanceColor)leaves.instanceColor.needsUpdate=true;
 },dispose(){for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const mesh of instances)mesh.dispose();root.clear();}};
}
