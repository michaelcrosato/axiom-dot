import {hashSeed} from './procedural.ts';
/** A separate quadruped family with four two-link supports and semantic contact sockets. */
export interface QuadrupedPlan {version:1;family:'quadruped';seed:number;body:{width:number;length:number;height:number};legs:{id:string;side:-1|1;end:-1|1;upper:number;lower:number;phase:number}[];sockets:{sensor:{x:number;y:number;z:number};emitter:{x:number;y:number;z:number}};limits:{radius:number;maxSpeed:number;maxSlope:number};budget:{joints:number;meshes:number}}
export function compileQuadruped(seed:number):QuadrupedPlan {
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new RangeError('Body seed must be uint32');
 const sample=(key:string)=>hashSeed(`quadruped@1:${seed}:${key}`)/0xffffffff;
 const width=.83+sample('width')*.15,length=1.08+sample('length')*.2,height=.56+sample('height')*.08;
 const legs:QuadrupedPlan['legs']=[];for(const side of [-1,1] as const)for(const end of [-1,1] as const)legs.push({id:`${end===1?'front':'back'}-${side===-1?'left':'right'}`,side,end,upper:.38+sample('upper')*.025,lower:.39+sample('lower')*.025,phase:side===end?0:.5});
 return {version:1,family:'quadruped',seed,body:{width,length,height},legs,sockets:{sensor:{x:0,y:.89,z:length/2+.23},emitter:{x:0,y:.68,z:length/2+.25}},limits:{radius:1.1,maxSpeed:2.3,maxSlope:.9},budget:{joints:9,meshes:17}};
}
export function validateQuadruped(p:QuadrupedPlan):boolean{return p.family==='quadruped'&&p.version===1&&p.legs.length===4&&new Set(p.legs.map(l=>l.id)).size===4&&p.legs.every(l=>l.upper>=.38&&l.upper<=.405&&l.lower>=.39&&l.lower<=.415&&(l.phase===0||l.phase===.5))&&p.body.width>=.83&&p.body.width<=.98&&p.body.length>=1.08&&p.body.length<=1.28&&p.body.height>=.56&&p.body.height<=.64&&[...Object.values(p.sockets.sensor),...Object.values(p.sockets.emitter)].every(Number.isFinite)&&p.sockets.sensor.y===.89&&p.sockets.emitter.y===.68&&p.budget.joints===9;}
export function quadrupedFoot(phase:number,speed:number){if(!Number.isFinite(speed)||speed<=0)return {z:0,y:0,planted:true};const p=((phase%1)+1)%1,stride=Math.min(.5,Math.max(0,speed)*.19);return p<.6?{z:stride*(.5-p/.6),y:0,planted:true}:{z:stride*(-.5+(p-.6)/.4),y:Math.sin((p-.6)/.4*Math.PI)*.16,planted:false};}

export function quadrupedCycleDistance(speed:number){return Math.max(.01,Math.min(.5,Math.max(0,speed)*.19))/.6;}
