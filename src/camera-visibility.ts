/** Camera-space distances: Three's linear fog uses view depth, not horizontal zoom. */
export const CAMERA_VISIBILITY=Object.freeze({minZoom:17,maxZoom:58,fadeStart:28,clearZoom:42,far:512,elevation:.88,sceneryFloor:-32});
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function zoomAtmosphere(zoom:number,regional=false,inside=false,lab=false){
 const t=clamp((zoom-CAMERA_VISIBILITY.fadeStart)/(CAMERA_VISIBILITY.clearZoom-CAMERA_VISIBILITY.fadeStart),0,1),fade=t*t*(3-2*t);
 const near=lab?55:regional&&!inside?45:65,far=lab?100:regional&&!inside?95:135;
 // Keep one linear-fog shader in both render backends. At clearZoom every drawable
 // fragment is before fog.near; this is exactly zero fog, without shader rebuilds.
 return {fade,near:near+(CAMERA_VISIBILITY.far+1-near)*fade,far:far+(CAMERA_VISIBILITY.far+81-far)*fade};
}
export interface CameraFootprint {minX:number;maxX:number;minZ:number;maxZ:number}
/** Conservative footprint down to the scenery floor, including tilt and aspect.
 * Rays above actual terrain still end on the finite scenic water plane. */
export function cameraGroundFootprint(target:{x:number;y:number;z:number},zoom:number,orbit:number,aspect:number,fov=42):CameraFootprint {
 const n=Math.hypot(1,CAMERA_VISIBILITY.elevation),s=Math.sin(orbit),c=Math.cos(orbit),h=CAMERA_VISIBILITY.elevation/n,v=1/n,tan=Math.tan(fov*Math.PI/360),a=Number.isFinite(aspect)&&aspect>0?aspect:1;
 const origin={x:target.x+s*zoom,y:target.y+CAMERA_VISIBILITY.elevation*zoom,z:target.z+c*zoom};
 const xs=[target.x,origin.x],zs=[target.z,origin.z];
 const screenY=(CAMERA_VISIBILITY.sceneryFloor-origin.y+CAMERA_VISIBILITY.far*h)/(CAMERA_VISIBILITY.far*tan*v);
 const ys=screenY>-1&&screenY<1?[-1,screenY,1]:[-1,1];
 for(const x of [-1,1])for(const y of ys){
  const dx=-s*v+x*tan*a*c-y*tan*s*h,dy=-h+y*tan*v,dz=-c*v-x*tan*a*s-y*tan*c*h;
  const depth=Math.min(CAMERA_VISIBILITY.far,Math.max(0,(CAMERA_VISIBILITY.sceneryFloor-origin.y)/dy));
  xs.push(origin.x+dx*depth);zs.push(origin.z+dz*depth);
 }
 return {minX:Math.min(...xs)-4,maxX:Math.max(...xs)+4,minZ:Math.min(...zs)-4,maxZ:Math.max(...zs)+4};
}
/** Reserve all zoom/orbit views up front. Quantized center/height avoids rebuilding
 * terrain on every wheel tick, camera ease, footstep or orbit gesture. */
export function cameraLandscapeFootprint(target:{x:number;y:number;z:number},aspect:number,fov=42):CameraFootprint {
 const anchor={x:0,y:Math.ceil(target.y/16)*16,z:0};let radius=0;
 for(const zoom of [CAMERA_VISIBILITY.minZoom,CAMERA_VISIBILITY.maxZoom]){const b=cameraGroundFootprint(anchor,zoom,0,aspect,fov);radius=Math.max(radius,Math.hypot(Math.max(Math.abs(b.minX),Math.abs(b.maxX)),Math.max(Math.abs(b.minZ),Math.abs(b.maxZ))));}
 radius=Math.ceil(radius/64)*64+64;const x=Math.floor(target.x/64)*64,z=Math.floor(target.z/64)*64;
 return {minX:x-radius,maxX:x+radius,minZ:z-radius,maxZ:z+radius};
}
