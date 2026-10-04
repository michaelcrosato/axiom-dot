import {performance} from 'node:perf_hooks';
import {CAMERA_VISIBILITY,zoomAtmosphere,cameraLandscapeFootprint} from '../src/camera-visibility.ts';
import {createRegionalLandscape} from '../src/regional-landscape.ts';
const amount=(d:number,n:number,f:number)=>{const t=Math.max(0,Math.min(1,(d-n)/(f-n)));return t*t*(3-2*t);};
const samples=[17,28,36,42,58].map(zoom=>{const depth=zoom*Math.hypot(1,.88),fog=zoomAtmosphere(zoom,true);return {zoom,cameraTargetDepth:depth,oldFocalFogFraction:amount(depth,45,95),newFocalFogFraction:amount(depth,fog.near,fog.far),newFog:fog};});
const geometry=[];for(const aspect of [9/16,16/9,32/9,4])for(const y of [1,50,70]){const view=createRegionalLandscape(73129),target={x:3,y,z:4},b=cameraLandscapeFootprint(target,aspect),confirmed=new Set<string>();for(let z=-2;z<=2;z++)for(let x=-2;x<=2;x++)confirmed.add(`region:${x}:${z}`);const start=performance.now();view.update(b,confirmed);const cold=performance.now()-start;const steady=performance.now();for(let i=0;i<100;i++)view.update(b,confirmed);geometry.push({aspect,targetY:y,footprint:b,...view.stats,coldGeometryMs:cold,unchanged100UpdatesMs:performance.now()-steady});view.dispose();}
console.log(JSON.stringify({version:1,scope:'Node22 numerical geometry/model checks; no rendered or device validation',camera:CAMERA_VISIBILITY,fogSamples:samples,geometry},null,2));
