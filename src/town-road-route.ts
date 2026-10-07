import type {TownPlan} from './starting-town.ts';
import {townNavigationClear} from './town-navigation.ts';
type Point={x:number;z:number};
const graphs=new WeakMap<TownPlan,{nodes:Point[];edges:{to:number;cost:number}[][];approaches:Map<string,number[]>}>();
/** Bounded road visibility graph. Endpoints connect only by swept clear approaches.
 * Cached immutable geometry; resident bodies remain the achieved-motion solver's job. */
export function townRoadRoute(plan:TownPlan,from:Point,to:Point):Point[]|null {
 const clear=(a:Point,b:Point)=>townNavigationClear(plan,a,b);
 if(Math.hypot(to.x-from.x,to.z-from.z)<1e-7)return [];
 if(Math.hypot(to.x-from.x,to.z-from.z)<=4&&clear(from,to))return [{...to}];
 let graph=graphs.get(plan);
 if(!graph){
  const segments=(plan.streets??[]).flatMap(street=>street.points.slice(1).map((b,i)=>({a:street.points[i]!,b,cuts:[0,1]})));
  // Insert real junctions where polylines cross. No all-visible shortcut may cut
  // through a resident's forecourt simply because its standing body is absent.
  for(let i=0;i<segments.length;i++)for(let j=0;j<i;j++){
   const a=segments[i]!,b=segments[j]!,dx=a.b.x-a.a.x,dz=a.b.z-a.a.z,ex=b.b.x-b.a.x,ez=b.b.z-b.a.z,det=dx*ez-dz*ex;
   if(Math.abs(det)<1e-8)continue;const qx=b.a.x-a.a.x,qz=b.a.z-a.a.z,t=(qx*ez-qz*ex)/det,u=(qx*dz-qz*dx)/det;
   if(t>=-1e-8&&t<=1+1e-8&&u>=-1e-8&&u<=1+1e-8){a.cuts.push(Math.max(0,Math.min(1,t)));b.cuts.push(Math.max(0,Math.min(1,u)));}
  }
  const nodes:Point[]=[],edges:{to:number;cost:number}[][]=[];
  const node=(p:Point)=>{const i=nodes.findIndex(q=>Math.hypot(q.x-p.x,q.z-p.z)<1e-6);if(i>=0)return i;nodes.push(p);edges.push([]);return nodes.length-1;};
  for(const s of segments){const cuts=[...new Set(s.cuts)].sort((a,b)=>a-b);for(let i=1;i<cuts.length;i++){
   const point=(t:number)=>({x:s.a.x+(s.b.x-s.a.x)*t,z:s.a.z+(s.b.z-s.a.z)*t}),a=point(cuts[i-1]!),b=point(cuts[i]!);if(!clear(a,b))continue;
   const ia=node(a),ib=node(b),cost=Math.hypot(a.x-b.x,a.z-b.z);if(ia===ib)continue;edges[ia]!.push({to:ib,cost});edges[ib]!.push({to:ia,cost});
  }}
  graph={nodes,edges,approaches:new Map()};graphs.set(plan,graph);
 }
 const {nodes,edges,approaches}=graph;
 const approach=(p:Point)=>{const key=p.x+':'+p.z,known=approaches.get(key);if(known)return known;const result=nodes.map(q=>clear(p,q)?Math.hypot(p.x-q.x,p.z-q.z):Infinity),nearest=Math.min(...result);for(let i=0;i<result.length;i++)if(result[i]!>nearest+.05)result[i]=Infinity;if(approaches.size>=1024)approaches.delete(approaches.keys().next().value!);approaches.set(key,result);return result;};
 const dist=[...approach(from)],prev=nodes.map(()=>-1),closed=new Set<number>(),finish=approach(to);
 let end=-1,best=Infinity;
 for(let step=0;step<nodes.length;step++){
  let at=-1,min=Infinity;for(let i=0;i<nodes.length;i++)if(!closed.has(i)&&dist[i]!<min){min=dist[i]!;at=i;}
  if(at<0||min>=best)break;closed.add(at);if(min+finish[at]!<best){best=min+finish[at]!;end=at;}
  for(const e of edges[at]!)if(min+e.cost<dist[e.to]!-1e-8){dist[e.to]=min+e.cost;prev[e.to]=at;}
 }
 if(end<0)return null;const out:Point[]=[{...to}];for(let at=end;at>=0;at=prev[at]!)out.unshift({...nodes[at]!});
 // Only collinear road segments may be compacted. This preserves lane bends.
 let p=from;const path:Point[]=[];for(let i=0;i<out.length;i++){let j=i;while(j+1<out.length){const a=out[j]!,b=out[j+1]!,cross=(a.x-p.x)*(b.z-a.z)-(a.z-p.z)*(b.x-a.x);if(Math.abs(cross)>1e-6||!clear(p,b))break;j++;}if(Math.hypot(p.x-out[j]!.x,p.z-out[j]!.z)>1e-7){p=out[j]!;path.push(p);}i=j;}return path.length<=32?path:null;
}
