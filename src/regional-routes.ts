import {regionalPlan,regionalHeight,regionalTownRoads,REGIONAL_MAX_ROAD_GRADE} from './regional-world.ts';
import {worldValley} from './generation.ts';import {valleySurfaceHeight} from './valley.ts';
export interface RegionalRoute {from:string;to:string;roadIds:string[];points:{x:number;y:number;z:number}[];horizontalMetres:number;surfaceMetres:number;maxGrade:number}
/** Actual planned road geometry, including the preserved bridge. It is not an
 * observed controller run: grade/collision delays still need physical measurement. */
export function regionalRoute(seed:number,from:string,to:string):RegionalRoute|null {
 const plan=regionalPlan(seed),valley=worldValley(seed),roads=[...plan.roads];const core=plan.routeGraph.edges.find(e=>!roads.some(r=>r.id===e.id));
 if(core){const ids=['mossbank-bridge','river-crossing','bridge-highmeadow'];const points=ids.flatMap(id=>valley.roads.find(r=>r.id.endsWith('/'+id))?.points??[]);roads.push({...core,width:3.2,points});}
 const nodes=new Set(plan.routeGraph.nodes.map(n=>n.id));if(!nodes.has(from)||!nodes.has(to))return null;
 const lengths=new Map(roads.map(r=>[r.id,r.points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-r.points[i]!.x,p.z-r.points[i]!.z),0)]));
 const distance=new Map([[from,0]]),via=new Map<string,{previous:string;road:typeof roads[number];reverse:boolean}>(),todo=new Set(nodes);
 while(todo.size){const current=[...todo].filter(n=>distance.has(n)).sort((a,b)=>distance.get(a)!-distance.get(b)!)[0];if(current===undefined)break;todo.delete(current);if(current===to)break;for(const road of roads){const reverse=road.to===current,next=reverse?road.from:road.from===current?road.to:null;if(!next||!todo.has(next))continue;const candidate=distance.get(current)!+lengths.get(road.id)!;if(candidate<(distance.get(next)??Infinity)){distance.set(next,candidate);via.set(next,{previous:current,road,reverse});}}}
 if(!distance.has(to))return null;const sections:{road:typeof roads[number];reverse:boolean}[]=[];let cursor=to;while(cursor!==from){const step=via.get(cursor);if(!step)return null;sections.unshift(step);cursor=step.previous;}
 const points:RegionalRoute['points']=[];for(const {road,reverse}of sections){const p=reverse?[...road.points].reverse():road.points;for(let i=1;i<p.length;i++){const a=p[i-1]!,b=p[i]!,n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/2));for(let k=points.length?1:0;k<=n;k++){const t=k/n,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=Math.abs(x)<=80&&Math.abs(z)<=80?valleySurfaceHeight(valley,x,z):regionalHeight(seed,x,z);points.push({x,y,z});}}}
 let horizontalMetres=0,surfaceMetres=0,maxGrade=0;for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,d=Math.hypot(b.x-a.x,b.z-a.z);if(!d)continue;horizontalMetres+=d;surfaceMetres+=Math.hypot(d,b.y-a.y);maxGrade=Math.max(maxGrade,Math.abs(b.y-a.y)/d);}return {from,to,roadIds:sections.map(s=>s.road.id),points,horizontalMetres,surfaceMetres,maxGrade};
}
export interface RegionalTrailGrade {id:string;kind:'trail'|'town';horizontalMetres:number;maxGrade:number;at:{x:number;z:number}}
export interface RegionalTrailGradeAudit {version:1;seed:number;limit:number;spacingMetres:number;trails:readonly RegionalTrailGrade[];steepest:RegionalTrailGrade;violations:readonly string[]}
const gradeAudits=new Map<number,RegionalTrailGradeAudit>();
/** Read-only developer evidence: every planned trail and Hearthmere street, sampled on
 * the committed regional surface (the heights the collision mesh is built from). */
export function regionalTrailGradeAudit(seed:number,spacingMetres=2):RegionalTrailGradeAudit {
 if(!Number.isFinite(spacingMetres)||spacingMetres<.25||spacingMetres>8)throw new RangeError('Grade sample spacing must be 0.25–8 m');
 const cached=spacingMetres===2?gradeAudits.get(seed):undefined;if(cached)return cached;
 const plan=regionalPlan(seed),roads=[...plan.roads.map(road=>({road,kind:'trail' as const})),...regionalTownRoads(seed).map(road=>({road,kind:'town' as const}))];
 const trails=roads.map(({road,kind}):RegionalTrailGrade=>{
  let horizontalMetres=0,maxGrade=0,at={x:road.points[0]!.x,z:road.points[0]!.z};
  for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1]!,b=road.points[i]!,length=Math.hypot(b.x-a.x,b.z-a.z);if(!length)continue;horizontalMetres+=length;
   const steps=Math.ceil(length/spacingMetres);let previous=regionalHeight(seed,a.x,a.z);
   for(let k=1;k<=steps;k++){const t=k/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=regionalHeight(seed,x,z),grade=Math.abs(y-previous)/(length/steps);if(grade>maxGrade){maxGrade=grade;at={x,z};}previous=y;}
  }
  return Object.freeze({id:road.id,kind,horizontalMetres,maxGrade,at:Object.freeze(at)});
 });
 const steepest=trails.reduce((a,b)=>b.maxGrade>a.maxGrade?b:a);
 const audit:RegionalTrailGradeAudit=Object.freeze({version:1 as const,seed,limit:REGIONAL_MAX_ROAD_GRADE,spacingMetres,trails:Object.freeze(trails),steepest,violations:Object.freeze(trails.filter(t=>t.maxGrade>REGIONAL_MAX_ROAD_GRADE).map(t=>t.id))});
 if(spacingMetres===2){if(gradeAudits.size>=4)gradeAudits.delete(gradeAudits.keys().next().value!);gradeAudits.set(seed,audit);}
 return audit;
}
