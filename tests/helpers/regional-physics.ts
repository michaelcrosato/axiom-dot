import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import type {TestContext} from 'node:test';
export const REGION_BOUND=Math.sqrt(10_000_000)/2;
export interface TestCell {key:string;revision:number;obstacles:Record<string,unknown>[];terrain:{vertices:number[];indices:number[];bound:number;step:number};bounds:{minX:number;maxX:number;minZ:number;maxZ:number}}
export interface PhysicsSnapshot {type:'snapshot';epoch:number;step:number;x:number;y:number;z:number;feetY:number;vx:number;vz:number;vy:number;grounded:boolean;crouched:boolean;stance:number;sliding:boolean;streaming?:{activeCells:number;terrainCells:number;cellColliders:number;totalColliders:number;revisionKeys:number;pendingUnloads:number;blocked:boolean;maxCells:number;maxColliders:number;maxHistory:number}}
/** Absolute, border-shared metre coordinates, matching the generation protocol. */
export function terrainCell(cx:number,cz:number,height:(x:number,z:number)=>number=()=>0,revision=1):TestCell{
 const minX=Math.max(-REGION_BOUND,cx*64),maxX=Math.min(REGION_BOUND,(cx+1)*64),minZ=Math.max(-REGION_BOUND,cz*64),maxZ=Math.min(REGION_BOUND,(cz+1)*64),vertices:number[]=[],indices:number[]=[];
 const xs=[minX],zs=[minZ];while(xs.at(-1)!<maxX)xs.push(Math.min(maxX,xs.at(-1)!+2));while(zs.at(-1)!<maxZ)zs.push(Math.min(maxZ,zs.at(-1)!+2));
 for(const z of zs)for(const x of xs)vertices.push(x,height(x,z),z);
 for(let z=0;z<zs.length-1;z++)for(let x=0;x<xs.length-1;x++){const a=z*xs.length+x,b=a+1,c=a+xs.length,d=c+1;indices.push(a,c,b,b,c,d);}
 return {key:`region:${cx}:${cz}`,revision,obstacles:[],terrain:{vertices,indices,bound:REGION_BOUND,step:2},bounds:{minX,maxX,minZ,maxZ}};
}
/** Real production controller + WASM; manual steps are exactly 1/60 second. */
export async function regionalPhysics(t:TestContext,config:Record<string,unknown>={}){
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=m=>parentPort.postMessage(m);parentPort.on('message',async m=>{if(m.type==='test-fail-allocation'){const {default:R}=await import('@dimforge/rapier3d-compat');const original=R.World.prototype.createCollider;let remaining=m.after;R.World.prototype.createCollider=function(...args){if(remaining--===0){R.World.prototype.createCollider=original;throw new Error('Injected native collider allocation failure');}return original.apply(this,args);};parentPort.postMessage({type:'test-fault-ready'});}else self.onmessage({data:m});});import(${JSON.stringify(new URL('../../src/physics.worker.ts',import.meta.url).href)}).then(()=>parentPort.postMessage({type:'boot'}));`,{eval:true,execArgv:['--experimental-strip-types']});
 t.after(()=>worker.terminate());let epoch=0,error:Error|undefined,latest:PhysicsSnapshot|undefined;const messages:any[]=[],snapshots:PhysicsSnapshot[]=[];
 worker.on('error',e=>error=e);worker.on('message',m=>{messages.push(m);if(m.type==='error')error=new Error(m.message);if(m.type==='snapshot'){latest=m;snapshots.push(m);}});
 async function take(type:string,match:(m:any)=>boolean=()=>true){const deadline=Date.now()+15000;for(;;){if(error)throw error;const i=messages.findIndex(m=>m.type===type&&match(m));if(i>=0)return messages.splice(i,1)[0];assert.ok(Date.now()<deadline,`Timed out awaiting ${type}: ${JSON.stringify({latest,messages:messages.filter(m=>m.type!=='snapshot').slice(-8)})}`);await new Promise(r=>setTimeout(r,1));}}
 const send=(m:Record<string,unknown>)=>worker.postMessage({epoch,...m});
 async function tick(ticks=1){const start=snapshots.length;for(let left=ticks;left>0;left-=120){send({type:'step',ticks:Math.min(left,120)});await take('stepped');}return snapshots.slice(start);}
 const input=(values:Record<string,unknown>={})=>send({type:'input',x:0,z:0,...values});
 await take('boot');send({type:'init',x:32,z:32,obstacles:[],streamedTerrain:true,bound:REGION_BOUND,initialCells:[terrainCell(0,0)],manual:true,...config});await take('ready');await tick(5);
 return {send,tick,input,take,messages,get latest(){return latest!;},async zone(next:Record<string,unknown>){epoch++;send({type:'zone',x:32,z:32,obstacles:[],streamedTerrain:true,bound:REGION_BOUND,initialCells:[terrainCell(0,0)],manual:true,...next});await take('ready');await tick(5);}};
}
