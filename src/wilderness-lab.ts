import {wildernessFeatures,type WildernessFeature,type WildernessObstacle} from './wilderness.ts';
import {nearestObstaclePoint} from './wilderness-geometry.ts';
export interface WildernessLabSample {x:number;z:number;feetY:number;grounded:boolean;crouched:boolean;step:number}
export interface WildernessLabResult {generation:1|2;iteration:number;name:string;featureId:string;samples:number;minimumClearance:number;maxFeetY:number;final:WildernessLabSample;pass:boolean;reason:string}
export interface WildernessLabReport {version:1;seed:number;iterations:number;sourceRevision:string;scope:string;status:'complete'|'interrupted';runs:WildernessLabResult[];error?:string}
export interface WildernessProbeWorker {postMessage(message:unknown):void;terminate():unknown;onmessage:((event:{data:any})=>void)|null;onerror:((event:unknown)=>void)|null}
function fixture(feature:WildernessFeature,generation:1|2,name:string){
 const base=feature.kind==='tree'?feature.y:feature.source==='decoration'?feature.y-feature.radius!*.35:0;
 return {name,generation,featureId:feature.id,solids:feature.solids.map(o=>({...o,x:o.x-feature.x,z:o.z-feature.z,y:(o.y??o.hy)-base}))};
}
export function wildernessProbeFixtures(seed:number){return ([1,2] as const).flatMap(generation=>{const features=wildernessFeatures({generation,seed}),trees=features.filter(f=>f.kind==='tree').sort((a,b)=>a.treeScale!-b.treeScale!),rocks=features.filter(f=>f.kind==='rock'&&f.source!=='cave-rock').sort((a,b)=>a.radius!-b.radius!);return [fixture(trees[0]!,generation,'Small tree'),fixture(trees.at(-1)!,generation,'Large tree'),fixture(rocks[0]!,generation,'Small stone'),fixture(rocks.at(-1)!,generation,'Large rock')];});}
/** Minimum distance from the capsule's central segment to a convex solid. */
export function wildernessCapsuleClearance(sample:WildernessLabSample,solid:WildernessObstacle){
 const low=sample.feetY+.34,high=low+(sample.crouched?.4:1.5);let a=low,b=high;
 const distance=(y:number)=>nearestObstaclePoint(solid,{x:sample.x,y,z:sample.z}).distance;
 for(let i=0;i<32;i++){const p=a+(b-a)/3,q=b-(b-a)/3;if(distance(p)<=distance(q))b=q;else a=p;}
 return Math.min(distance(low),distance(high),distance((a+b)/2))-.32;
}
/** Independent production worker, disposable geometry and no campaign state/storage access. */
export async function runWildernessLab(seed:number,iterations:number,options:{sourceRevision?:string;signal?:AbortSignal;makeWorker?:()=>WildernessProbeWorker;progress?:(completed:number,total:number)=>void}={}):Promise<WildernessLabReport>{
 const repeats=Math.max(1,Math.min(5,Math.trunc(iterations)||1)),fixtures=wildernessProbeFixtures(seed),report:WildernessLabReport={version:1,seed,iterations:repeats,sourceRevision:options.sourceRevision??'not-recorded',scope:'Real Rapier worker capsules against translated production tree and convex-rock geometry, in isolated flat-ground fixtures. Not a browser visual approval or device frame-rate benchmark.',status:'complete',runs:[]};
 const worker=options.makeWorker?.()??new Worker(new URL('./physics.worker.ts',import.meta.url),{type:'module'});let epoch=0,latest:WildernessLabSample|undefined,samples:WildernessLabSample[]=[];
 let pending:{type:string;resolve:()=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}|undefined;
 const fail=(reason:string)=>{if(pending){clearTimeout(pending.timer);pending.reject(new Error(reason));pending=undefined;}};
 worker.onerror=()=>fail('The isolated physics worker failed');worker.onmessage=({data:m}:{data:any})=>{if(m.epoch!==epoch)return;if(m.type==='snapshot'){latest={x:m.x,z:m.z,feetY:m.feetY,grounded:m.grounded,crouched:m.crouched,step:m.step};samples.push(latest);}if(m.type==='error')fail(m.message??'Physics error');if(pending&&m.type===pending.type){clearTimeout(pending.timer);pending.resolve();pending=undefined;}};
 const abort=()=>fail('Collision probes cancelled');options.signal?.addEventListener('abort',abort);
 const request=(message:Record<string,unknown>,type:string)=>new Promise<void>((resolve,reject)=>{if(options.signal?.aborted){reject(new Error('Collision probes cancelled'));return;}pending={type,resolve,reject,timer:setTimeout(()=>fail('The isolated physics worker did not answer'),10000)};worker.postMessage({...message,epoch});});
 try{for(let iteration=1;iteration<=repeats;iteration++)for(const f of fixtures){
  epoch++;latest=undefined;samples=[];await request({type:epoch===1?'init':'zone',manual:true,x:-5,y:0,z:0,bound:16,obstacles:[],initialCells:[{key:'probe',revision:1,obstacles:f.solids}]},'ready');
  worker.postMessage({type:'input',epoch,x:1,z:0,sprint:true});await request({type:'step',ticks:120},'stepped');await request({type:'step',ticks:40},'stepped');worker.postMessage({type:'input',epoch,x:0,z:0});await request({type:'step',ticks:45},'stepped');
  if(!latest||!samples.length)throw new Error('No collision samples were returned');
  const min=Math.min(...samples.flatMap(s=>f.solids.map(o=>wildernessCapsuleClearance(s,o)))),maxFeetY=Math.max(...samples.map(s=>s.feetY)),solid=f.solids[0]!,last=latest as WildernessLabSample,blocked=last.x<0&&f.solids.some(o=>wildernessCapsuleClearance(last,o)<.08),traversed=last.x>=solid.hx+.28,finite=samples.every(s=>[s.x,s.z,s.feetY].every(Number.isFinite));
  const pass=finite&&min>=-.035&&last.grounded&&(blocked||traversed&&maxFeetY>.025);
  report.runs.push({generation:f.generation,iteration,name:f.name,featureId:f.featureId,samples:samples.length,minimumClearance:min,maxFeetY,final:last,pass,reason:pass?(blocked?'The capsule stopped at the solid surface':'The capsule stepped or climbed over the solid without penetrating it'):'Review capsule clearance, stable grounding or lateral traversal'});options.progress?.(report.runs.length,repeats*fixtures.length);
 }}catch(error){report.status='interrupted';report.error=error instanceof Error?error.message:String(error);}finally{options.signal?.removeEventListener('abort',abort);if(pending)clearTimeout(pending.timer);worker.terminate();}
 return report;
}
