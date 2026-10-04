import type {TownResident} from './town-residents.ts';
import type {CrowdPose} from './town-crowd.ts';
export interface LimbPoint{x:number;y:number;z:number}
export interface TownGait{hipY:number;bob:number;lean:number;left:{hip:LimbPoint;knee:LimbPoint;ankle:LimbPoint;planted:boolean};right:{hip:LimbPoint;knee:LimbPoint;ankle:LimbPoint;planted:boolean};leftArm:number;rightArm:number;gesture:string;breath:number}
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
/** Two-link IK with an explicit flat boot. Stance foot travels backward exactly at root speed. */
export function townGait(resident:TownResident,pose:CrowdPose,time:number,gaitScale=1,gestures=1):TownGait{
 const a=resident.appearance,h=resident.height,leg=.62*a.legLength,stepLength=Math.min(a.stride,leg),cycleLength=stepLength*2;
 const still=clamp(1-pose.speed/.18,0,1)*gestures,resting=['resting','receiving care'].includes(pose.activity);
 const hipY=leg*.9+.12-(resting?.075:0)*still;
 const envelope=clamp(pose.speed/.08,0,1),blend=envelope*gaitScale;
 const phase=pose.distance/(cycleLength*h)+(resident.index%7)/7;
 const foot=(side:number,offset:number)=>{const t=((phase+offset)%1+1)%1,planted=t<.5,u=planted?t*2:(t-.5)*2;
  const z=(planted?stepLength*(.5-u):stepLength*(-.5+u))*blend;
  const lift=(planted?0:Math.sin(Math.PI*u)**2*.115)*blend;
  const hip={x:side*.15*a.build,y:hipY,z:0},ankle={x:hip.x,y:.12+lift,z};
  const dy=ankle.y-hip.y,dz=ankle.z-hip.z,d=Math.hypot(dy,dz),length=leg*.58,k=Math.sqrt(Math.max(0,length*length-d*d/4));
  // Positive z knee flexion; exact shared joint endpoints are used by the renderer.
  const knee={x:hip.x,y:(hip.y+ankle.y)/2+(d>0?dz/d:0)*k,z:(hip.z+ankle.z)/2+(d>0?dy/-d:1)*k};
  return {hip,knee,ankle,planted};};
 const walk=Math.sin(phase*Math.PI*2)*.48*a.swing*blend;
 const idlePhase=time*.9+a.idle,working=['working','keeping shop'].includes(pose.activity),meeting=pose.activity==='meeting neighbors';
 const ease=(x:number)=>{const t=clamp(x,0,1);return t*t*(3-2*t);},window=(t:number,length:number)=>t<length?ease(t/.3)*ease((length-t)/.3):0;
 const rest=1-ease(pose.speed/.12),greetAmount=meeting?rest*window(((time+resident.index*1.7)%11+11)%11,2.4):0,workAmount=working?rest*window(((time+resident.index)%8+8)%8,3):0,greeting=greetAmount>0,work=workAmount>0;
 // Stationary life actions have persistent, distinct poses. A person eating,
 // washing or resting should not look like a frozen walking agent.
 let left=0,right=0,lean=0;const cycle=time*2.4+a.idle;
 switch(pose.activity){
  case'eating':left=.75;right=1.25+Math.sin(cycle)*.35;break;
  case'washing':left=1.0+Math.sin(cycle*1.8)*.36;right=1.0-Math.sin(cycle*1.8)*.36;lean=.10;break;
  case'resting':left=.22;right=.22;lean=.10;break;
  case'receiving care':left=.6;right=.35;lean=.07;break;
  case'relaxing':left=.72+Math.sin(cycle*.45)*.24;right=.90+Math.sin(cycle*.45)*.26;break;
  case'gardening':left=.6+Math.sin(cycle)*.48;right=.8+Math.sin(cycle)*.52;lean=.22+.055*Math.sin(cycle);break;
  case'drawing water':left=.5+Math.sin(cycle)*.48;right=1+Math.sin(cycle)*.60;lean=.13;break;
  case'cooking':left=.80;right=.95+Math.sin(cycle*1.5)*.55;lean=.10;break;
  case'crafting':left=.85;right=.9+Math.sin(cycle*1.6)*.62;lean=.12;break;
  case'repairing':left=.85;right=1.05+Math.sin(cycle*1.6)*.64;lean=.16;break;
 }
 const gesture=still>.1&&['eating','washing','resting','relaxing','gardening','drawing water','cooking','crafting','repairing','receiving care'].includes(pose.activity)?pose.activity:greeting?'greeting':work?'working':pose.yielding?'yielding':pose.moving?'walking':'resting';
 return {hipY:hipY*h,bob:(Math.sin(phase*Math.PI*4)**2*.018*blend)*h,lean:Math.min(.055,pose.speed*.022)*blend+lean*still,left:foot(-1,0),right:foot(1,.5),leftArm:-walk+left*still,rightArm:walk+right*still+((-1.9+Math.sin(time*8)*.15)*greetAmount+(-.6+Math.sin(time*4)*.22)*workAmount)*gestures,gesture,breath:Math.sin(idlePhase)*.009*(1-blend)*gestures};
}
