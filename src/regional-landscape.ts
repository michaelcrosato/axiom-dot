import * as THREE from 'three/webgpu';
import {CHUNK_SIZE,REGION_BOUND,regionalHeight,regionalBiomeAt} from './regional-world.ts';
import {CAMERA_VISIBILITY,type CameraFootprint} from './camera-visibility.ts';
interface Tile {vertices:number[];colors:number[];indices:number[]}
export const LANDSCAPE_LIMITS=Object.freeze({finePatchThreshold:256,maxPatches:1024});
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
/** Render-only terrain, never props, collision packets, movement or save state.
 * 16 m interior LOD, exact 2 m borders match the collision-confirmed terrain. */
export function landscapeTile(seed:number,cx:number,cz:number,size=CHUNK_SIZE,step=16,skirtsOnly=false):Tile {
 const x0=Math.max(-REGION_BOUND,cx*size),x1=Math.min(REGION_BOUND,(cx+1)*size),z0=Math.max(-REGION_BOUND,cz*size),z1=Math.min(REGION_BOUND,(cz+1)*size);
 const vertices:number[]=[],colors:number[]=[],indices:number[]=[],color=new THREE.Color();
 const vertex=(x:number,z:number,y=regionalHeight(seed,x,z))=>{const i=vertices.length/3;vertices.push(x,y,z);color.set(regionalBiomeAt(seed,x,z).color);const tint=.94+.06*Math.sin(x*.077+z*.051+seed);colors.push(color.r*tint,color.g*tint,color.b*tint);return i;};
 const axes=(lo:number,hi:number,step:number)=>{const a=[lo];for(let p=(Math.floor(lo/step)+1)*step;p<hi-1e-8;p+=step)a.push(p);a.push(hi);return a;};
 const xs=axes(x0,x1,step),zs=axes(z0,z1,step);
 for(let j=1;!skirtsOnly&&j<zs.length;j++)for(let i=1;i<xs.length;i++){
  const a=xs[i-1]!,b=xs[i]!,c=zs[j-1]!,d=zs[j]!,center=vertex((a+b)/2,(c+d)/2),ring:number[]=[];
  // Clockwise in XZ produces upward normals. Border samples are canonical 2 m.
  for(const z of (i===1?axes(c,d,2):[c,d]).slice(0,-1))ring.push(vertex(a,z));
  for(const x of (j===zs.length-1?axes(a,b,2):[a,b]).slice(0,-1))ring.push(vertex(x,d));
  for(const z of (i===xs.length-1?axes(c,d,2):[c,d]).reverse().slice(0,-1))ring.push(vertex(b,z));
  for(const x of (j===1?axes(a,b,2):[a,b]).reverse().slice(0,-1))ring.push(vertex(x,c));
  for(let k=0;k<ring.length;k++)indices.push(center,ring[k]!,ring[(k+1)%ring.length]!);
 }
 // The finite playable world ends visibly at water, never at an unrendered void.
 for(const [a,b]of [x0===-REGION_BOUND?[[x0,z0],[x0,z1]]:null,x1===REGION_BOUND?[[x1,z1],[x1,z0]]:null,z0===-REGION_BOUND?[[x1,z0],[x0,z0]]:null,z1===REGION_BOUND?[[x0,z1],[x1,z1]]:null].filter(Boolean) as number[][][]){
  const axis=a![0]===b![0]?1:0,points=axes(Math.min(a![axis]!,b![axis]!),Math.max(a![axis]!,b![axis]!),2);if(a![axis]!>b![axis]!)points.reverse();for(let i=1;i<points.length;i++){const point=(v:number)=>axis===0?[v,a![1]!] as const:[a![0]!,v] as const,p=point(points[i-1]!),q=point(points[i]!),u=vertex(...p),v=vertex(...q),w=vertex(...q,CAMERA_VISIBILITY.sceneryFloor),t=vertex(...p,CAMERA_VISIBILITY.sceneryFloor);indices.push(u,v,w,u,w,t);}
 }
 return {vertices,colors,indices};
}
/** One bounded cached mesh; no per-tile draw calls, shadows, workers or entities. */
export function createRegionalLandscape(seed:number){
 const material=new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1,side:THREE.DoubleSide}),root=new THREE.Mesh(new THREE.BufferGeometry(),material);root.name='regional-scenic-terrain';root.receiveShadow=false;root.castShadow=false;
 const cache=new Map<string,Tile>();let signature='',rebuilds=0,disposed=false;
 return {root,update(footprint:CameraFootprint,confirmed:ReadonlySet<string>){if(disposed)return;
  const loX=Math.floor(clamp(footprint.minX,-REGION_BOUND,REGION_BOUND-1e-6)/CHUNK_SIZE),hiX=Math.floor(clamp(footprint.maxX,-REGION_BOUND,REGION_BOUND-1e-6)/CHUNK_SIZE),loZ=Math.floor(clamp(footprint.minZ,-REGION_BOUND,REGION_BOUND-1e-6)/CHUNK_SIZE),hiZ=Math.floor(clamp(footprint.maxZ,-REGION_BOUND,REGION_BOUND-1e-6)/CHUNK_SIZE);
  const keys:string[]=[],coarse=(hiX-loX+1)*(hiZ-loZ+1)>LANDSCAPE_LIMITS.finePatchThreshold;
  const fine=(cx:number,cz:number)=>{if(!confirmed.has(`region:${cx}:${cz}`))keys.push(`fine:${cx}:${cz}`);else if(cx===-25||cx===24||cz===-25||cz===24)keys.push(`edge:${cx}:${cz}`);};
  if(!coarse){for(let cz=loZ;cz<=hiZ;cz++)for(let cx=loX;cx<=hiX;cx++)fine(cx,cz);}else{
   // Extreme aspect ratios use256m far patches with64m interiors; blocks with
   // committed detail retain16m interiors and exact ownership holes. At most
   //196 coarse blocks +49×15 refinements =931 patches in this finite world.
   for(let bz=Math.floor(loZ/4);bz<=Math.floor(hiZ/4);bz++)for(let bx=Math.floor(loX/4);bx<=Math.floor(hiX/4);bx++){
    let detailed=false;for(let z=bz*4;z<bz*4+4;z++)for(let x=bx*4;x<bx*4+4;x++)if(confirmed.has(`region:${x}:${z}`))detailed=true;
    if(detailed){for(let z=Math.max(loZ,bz*4);z<=Math.min(hiZ,bz*4+3);z++)for(let x=Math.max(loX,bx*4);x<=Math.min(hiX,bx*4+3);x++)fine(x,z);}else keys.push(`coarse:${bx}:${bz}`);
   }
  }
  if(keys.length>LANDSCAPE_LIMITS.maxPatches)throw new Error('Scenic terrain patch budget exceeded');
  const next=keys.join('|');if(next===signature)return;signature=next;const wanted=new Set(keys);for(const key of cache.keys())if(!wanted.has(key))cache.delete(key);
  const vertices:number[]=[],colors:number[]=[],indices:number[]=[];for(const key of keys){let tile=cache.get(key);if(!tile){const [kind,x,z]=key.split(':');tile=landscapeTile(seed,Number(x),Number(z),kind==='coarse'?256:64,kind==='coarse'?64:16,kind==='edge');cache.set(key,tile);}const base=vertices.length/3;for(const n of tile.vertices)vertices.push(n);for(const n of tile.colors)colors.push(n);for(const n of tile.indices)indices.push(base+n);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();root.geometry.dispose();root.geometry=geometry;rebuilds++;
 },dispose(){if(disposed)return;disposed=true;cache.clear();root.geometry.dispose();material.dispose();root.removeFromParent();},get stats(){return {tiles:cache.size,vertices:root.geometry.getAttribute('position')?.count??0,triangles:(root.geometry.index?.count??0)/3,rebuilds,renderOnly:true};}};
}
/** Four vertices ensure a sky-colored hole never replaces unloaded ground.
 * This scenic water is outside gameplay; it adds no traversable world area. */
export function createScenicWater(){const material=new THREE.MeshBasicMaterial({color:'#527e79',side:THREE.DoubleSide}),mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material);mesh.rotation.x=-Math.PI/2;mesh.position.y=CAMERA_VISIBILITY.sceneryFloor;mesh.name='scenic-boundary-water';return {root:mesh,update(b:CameraFootprint){mesh.position.x=(b.minX+b.maxX)/2;mesh.position.z=(b.minZ+b.maxZ)/2;mesh.scale.set(b.maxX-b.minX+128,b.maxZ-b.minZ+128,1);},dispose(){mesh.geometry.dispose();material.dispose();mesh.removeFromParent();}};}
