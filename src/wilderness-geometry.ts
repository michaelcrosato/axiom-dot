/** Engine-independent convex geometry shared by rendering, Rapier and authority. */
export interface WildernessPoint {x:number;y:number;z:number}
export interface WildernessPlane {x:number;y:number;z:number;d:number}
export type ConvexPlane = WildernessPlane;
export interface WildernessObstacle {x:number;y?:number;z:number;hx:number;hy:number;hz:number;featureId?:string;convexVertices?:readonly number[];convexPlanes?:readonly WildernessPlane[]}
const phi=(1+Math.sqrt(5))/2,inv=1/phi;
// Three DodecahedronGeometry(radius, 0), including its orientation. Vertices are
// normalized before Float32 conversion, just like the renderer's geometry.
const V=[-1,-1,-1,-1,-1,1,-1,1,-1,-1,1,1,1,-1,-1,1,-1,1,1,1,-1,1,1,1,0,-inv,-phi,0,-inv,phi,0,inv,-phi,0,inv,phi,-inv,-phi,0,-inv,phi,0,inv,-phi,0,inv,phi,0,-phi,0,-inv,phi,0,-inv,-phi,0,inv,phi,0,inv];
const F=[3,11,7,3,7,15,3,15,13,7,19,17,7,17,6,7,6,15,17,4,8,17,8,10,17,10,6,8,0,16,8,16,2,8,2,10,0,12,1,0,1,18,0,18,16,6,10,2,6,2,13,6,13,15,2,16,18,2,18,3,2,3,13,18,1,9,18,9,11,18,11,3,4,14,12,4,12,0,4,0,8,11,9,5,11,5,19,11,19,7,19,5,14,19,14,4,19,4,17,1,12,14,1,14,5,1,5,9];
const sub=(a:WildernessPoint,b:WildernessPoint):WildernessPoint=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const dot=(a:WildernessPoint,b:WildernessPoint)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a:WildernessPoint,b:WildernessPoint):WildernessPoint=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const addScaled=(a:WildernessPoint,b:WildernessPoint,t:number):WildernessPoint=>({x:a.x+b.x*t,y:a.y+b.y*t,z:a.z+b.z*t});
const vertex=(vertices:readonly number[],index:number):WildernessPoint=>({x:vertices[index*3]!,y:vertices[index*3+1]!,z:vertices[index*3+2]!});
export function dodecahedronObstacle(featureId:string,x:number,y:number,z:number,radius:number,scale:WildernessPoint):WildernessObstacle {
 const vertices:number[]=[];
 for(let i=0;i<V.length;i+=3){const length=Math.hypot(V[i]!,V[i+1]!,V[i+2]!);vertices.push(Math.fround(V[i]!/length*radius)*scale.x,Math.fround(V[i+1]!/length*radius)*scale.y,Math.fround(V[i+2]!/length*radius)*scale.z);}
 const planes:WildernessPlane[]=[];
 for(let i=0;i<F.length;i+=3){const a=vertex(vertices,F[i]!),b=vertex(vertices,F[i+1]!),c=vertex(vertices,F[i+2]!),normal=cross(sub(b,a),sub(c,a)),length=Math.hypot(normal.x,normal.y,normal.z),n={x:normal.x/length,y:normal.y/length,z:normal.z/length};let d=dot(n,a);if(d<0){n.x=-n.x;n.y=-n.y;n.z=-n.z;d=-d;}if(!planes.some(p=>dot(p,n)>1-1e-10&&Math.abs(p.d-d)<1e-6))planes.push(Object.freeze({...n,d}));}
 const hx=Math.max(...vertices.filter((_,i)=>i%3===0).map(Math.abs)),hy=Math.max(...vertices.filter((_,i)=>i%3===1).map(Math.abs)),hz=Math.max(...vertices.filter((_,i)=>i%3===2).map(Math.abs));
 return Object.freeze({featureId,x,y,z,hx,hy,hz,convexVertices:Object.freeze(vertices),convexPlanes:Object.freeze(planes)});
}
export function obstaclePlanes(o:WildernessObstacle):readonly WildernessPlane[]{return o.convexPlanes??[{x:1,y:0,z:0,d:o.hx},{x:-1,y:0,z:0,d:o.hx},{x:0,y:1,z:0,d:o.hy},{x:0,y:-1,z:0,d:o.hy},{x:0,y:0,z:1,d:o.hz},{x:0,y:0,z:-1,d:o.hz}];}
/** Exact line clipping against the convex hull, optionally expanded by a sphere. */
export function obstacleSegmentIntersects(o:WildernessObstacle,from:WildernessPoint,to:WildernessPoint,padding=0):boolean {
 const a=sub(from,{x:o.x,y:o.y??o.hy,z:o.z}),delta=sub(to,from);let low=0,high=1;
 for(const p of obstaclePlanes(o)){const start=dot(p,a)-p.d-padding,speed=dot(p,delta);if(Math.abs(speed)<1e-12){if(start>1e-8)return false;continue;}const t=-start/speed;if(speed<0)low=Math.max(low,t);else high=Math.min(high,t);if(low>high+1e-9)return false;}
 return high>=0&&low<=1;
}
export const wildernessSegmentClear=(from:WildernessPoint,to:WildernessPoint,obstacles:readonly WildernessObstacle[])=>!obstacles.some(o=>obstacleSegmentIntersects(o,from,to));
// Closest-point regions from Real-Time Collision Detection, avoiding a loose AABB
// for harvesting on sloped rock faces or near a polyhedron's empty corners.
function trianglePoint(p:WildernessPoint,a:WildernessPoint,b:WildernessPoint,c:WildernessPoint):WildernessPoint {
 const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);if(d1<=0&&d2<=0)return a;
 const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return b;
 const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0)return addScaled(a,ab,d1/(d1-d3));
 const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return c;
 const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0)return addScaled(a,ac,d2/(d2-d6));
 const va=d3*d6-d5*d4;if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0)return addScaled(b,sub(c,b),(d4-d3)/((d4-d3)+(d5-d6)));
 const denom=1/(va+vb+vc);return addScaled(addScaled(a,ab,vb*denom),ac,vc*denom);
}
export function nearestObstaclePoint(o:WildernessObstacle,point:WildernessPoint):WildernessPoint&{distance:number}{
 const local=sub(point,{x:o.x,y:o.y??o.hy,z:o.z});let closest:WildernessPoint;
 if(!o.convexVertices)closest={x:Math.max(-o.hx,Math.min(o.hx,local.x)),y:Math.max(-o.hy,Math.min(o.hy,local.y)),z:Math.max(-o.hz,Math.min(o.hz,local.z))};
 else if(obstaclePlanes(o).every(p=>dot(p,local)<=p.d+1e-9))closest=local;
 else{
  closest=vertex(o.convexVertices,0);let distance=Infinity;
  // Catalog convex obstacles use this exact shared dodecahedron topology.
  for(let i=0;i<F.length;i+=3){const next=trianglePoint(local,vertex(o.convexVertices,F[i]!),vertex(o.convexVertices,F[i+1]!),vertex(o.convexVertices,F[i+2]!)),v=sub(local,next),d=dot(v,v);if(d<distance){distance=d;closest=next;}}
 }
 return {x:o.x+closest.x,y:(o.y??o.hy)+closest.y,z:o.z+closest.z,distance:Math.hypot(local.x-closest.x,local.y-closest.y,local.z-closest.z)};
}
