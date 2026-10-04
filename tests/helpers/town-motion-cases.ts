import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTownView} from '../../src/town-view.ts';
import {createTownLife,advanceTownLife} from '../../src/town-life.ts';
import {townLifePoses} from '../../src/town-life-runtime.ts';
import {TOWN_CENTER} from '../../src/starting-town.ts';
import {townPathClear} from '../../src/town-crowd.ts';
import type {TownResidentPose} from '../../src/town-residents.ts';
export const motionRoot=(view:ReturnType<typeof createTownView>,i:number)=>{const a=(view.root.children[1] as any).instanceMatrix.array;return{x:a[i*16+12] as number,z:a[i*16+14] as number};};
const distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
/** Deliberately synthetic, unowned transport exercises the retained compatibility
 * projector. Production authority replay is covered separately. */
const legacyTransport=(life:ReturnType<typeof createTownLife>)=>townLifePoses(life)!.map(({authoritativeMotion,contactResolved,motionPath,...pose})=>pose);
export function steadyLifeMotion(factory= createTownView,hz=60,online=false){
 const view=factory(73129),life=createTownLife(73129),start={x:TOWN_CENTER.x-12,z:TOWN_CENTER.z+10};let input=legacyTransport(life),lastSource=-1,last=start;const speeds:number[]=[];let maxFrame=0,maxLag=0;
 try{for(let f=0;f<=hz*8;f++){const now=f/hz,source=Math.floor((now+1e-8)*2)/2;if(source!==lastSource){input=input.map(p=>({...p}));input[0]={...input[0]!,...start,x:start.x+source*1.8,facing:Math.PI/2,speed:1.8,moving:true,distance:source*1.8};lastSource=source;}
 view.update(online?Math.floor(now*4)/4:now,TOWN_CENTER,()=>true,true,undefined,f===0,f?1/hz:0,[],online,input);const root=motionRoot(view,0),step=distance(root,last);if(f>hz*2){speeds.push(step*hz);maxFrame=Math.max(maxFrame,step);maxLag=Math.max(maxLag,distance(root,input[0]!));assert(distance(root,view.poses[0]!)<.00003,'actual torso matrix follows reported root');}last=root;}
 assert(Math.min(...speeds)>1.6,'A steady 2 Hz traveler must not brake between updates');assert(Math.max(...speeds)<2,'A steady 2 Hz traveler must not surge');assert(maxLag<1.1);return {hz,online,minSpeed:Math.min(...speeds),maxSpeed:Math.max(...speeds),maxFrame,maxLag};
 }finally{view.dispose();}
}
export function crossingLifeMotion(factory=createTownView,hz=60,online=false,actor=false){
 const view=factory(73129),start=legacyTransport(createTownLife(73129));let input:TownResidentPose[]=start.map(p=>({...p})),source=-1,last=[{x:TOWN_CENTER.x-12,z:TOWN_CENTER.z+10},{x:TOWN_CENTER.x+12,z:TOWN_CENTER.z+10}],maxFrame=0,maxLag=0,minSpacing=Infinity,reversals=0;
 const actors=actor?[{id:'local',x:TOWN_CENTER.x,z:TOWN_CENTER.z+10,feetY:6}]:[];
 try{for(let f=0;f<=13*hz;f++){const t=f/hz,step=Math.floor((t+1e-8)*2)/2;if(step!==source){input=input.map(p=>({...p}));for(let i=0;i<2;i++)input[i]={...input[i]!,x:TOWN_CENTER.x+(i?12:-12)+(i?-1:1)*step*1.8,z:TOWN_CENTER.z+10,facing:(i?-1:1)*Math.PI/2,moving:true,speed:1.8,distance:step*1.8};source=step;}
 view.update(online?Math.floor(t*4)/4:t,TOWN_CENTER,()=>true,true,undefined,!f,f?1/hz:0,actors,online,input);const next=[motionRoot(view,0),motionRoot(view,1)];if(f)for(let i=0;i<2;i++){const p=next[i]!;maxFrame=Math.max(maxFrame,distance(p,last[i]!));maxLag=Math.max(maxLag,distance(p,view.targets[i]!));if((p.x-last[i]!.x)*(i?-1:1)<-.0001)reversals++;assert(townPathClear(view.population.plan,last[i]!,p),'crossing must not cut walls');}minSpacing=Math.min(minSpacing,distance(next[0]!,next[1]!));last=next;
 }
 assert(last[0]!.x>TOWN_CENTER.x+10&&last[1]!.x<TOWN_CENTER.x-10,'both visible bodies actually pass');assert(maxFrame<.25,'no lag-triggered teleport');assert(maxLag<1.7,'no persistent contact deadlock');assert(minSpacing>=.63,'soft body spacing retained');assert.equal(reversals,0);return{hz,online,actor,maxFrame,maxLag,minSpacing,reversals};
 }finally{view.dispose();}
}
export function serviceLifeMotion(factory=createTownView,online=false,west=false){
 // Captured unchanged V11 busy-service saves preserve the original regression
 // geometry even when the new opening/decision distribution changes.
 let life=JSON.parse(readFileSync(new URL('../fixtures/town-motion-v11/'+(west?'175':'150')+'.json',import.meta.url),'utf8')); const before=JSON.stringify(life),view=factory(73129);let maxLag=0,maxFrame=0;view.update(west?175:150,TOWN_CENTER,()=>true,true,undefined,true,0,[],online,townLifePoses(life));assert.equal(JSON.stringify(life),before,'presentation never edits old saves');let last=motionRoot(view,west?67:82);
 let arrivedAt=0;try{for(let f=1;f<=1800;f++){life=advanceTownLife(life,1/30);const t=(west?175:150)+f/30;view.update(online?Math.floor(t*4)/4:t,TOWN_CENTER,()=>true,true,undefined,false,1/30,[],online,townLifePoses(life));const root=motionRoot(view,west?67:82);maxLag=Math.max(maxLag,distance(root,life.residents[west?67:82]!));maxFrame=Math.max(maxFrame,distance(root,last));assert(townPathClear(view.population.plan,last,root));last=root;if(!west&&life.residents[82]!.status==='acting')arrivedAt=arrivedAt||f;else arrivedAt=0;if(f>=900&&(west||arrivedAt&&f-arrivedAt>=60))break;}
 assert(maxLag<2,'departing resident must leave stationary service crowd without a multi-metre authority gap');assert(maxFrame<.3);if(west){assert(last.x<-224&&last.z>-110,'west resident has left the service and followed the road home');assert(distance(last,life.residents[67]!)<1.1,'still walking with bounded interpolation delay');}else assert(distance(last,life.residents[82]!)<.01);return {online,maxLag,maxFrame,finalGap:distance(last,life.residents[west?67:82]!)};
 }finally{view.dispose();}
}
