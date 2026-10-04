import {compileRestorationBody} from './restoration-body.ts';
import {restorationMachinePosition,type RestorationState,type RestorationPlan} from './restoration.ts';
import type {WildernessObstacle} from './wilderness-geometry.ts';
/** One bounded conservative convex proxy, identical in Rapier and shared-world movement. */
export function restorationBodyObstacle(state:RestorationState|undefined,plan:RestorationPlan):WildernessObstacle|null{
 if(!state?.machine)return null;const point=restorationMachinePosition(state,plan);if(!point)return null;const body=compileRestorationBody(state.machine.recipe),radius=body.bounds.radius,outer=radius/Math.cos(Math.PI/16),hy=(body.bounds.maxY-body.bounds.minY)/2+.015,y=point.y+(body.bounds.maxY+body.bounds.minY)/2;
 const convexVertices:number[]=[],convexPlanes:{x:number;y:number;z:number;d:number}[]=[];
 for(const height of [-hy,hy])for(let i=0;i<16;i++){const angle=i*Math.PI/8;convexVertices.push(Math.cos(angle)*outer,height,Math.sin(angle)*outer);}
 for(let i=0;i<16;i++){const angle=(i+.5)*Math.PI/8;convexPlanes.push({x:Math.cos(angle),y:0,z:Math.sin(angle),d:radius});}convexPlanes.push({x:0,y:1,z:0,d:hy},{x:0,y:-1,z:0,d:hy});
 return {featureId:'restoration-automaton',x:point.x,y,z:point.z,hx:outer,hy,hz:outer,convexVertices,convexPlanes};
}
