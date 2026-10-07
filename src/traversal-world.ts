import {REGION_BOUND} from './regional-world.ts';
import {regionalBodyCenterBound} from './regional-bounds.ts';
import {buildOrigin} from './generation.ts';
import {isFiniteVec3,type MovableBody} from './player-contact.ts';
import {townYards,constrainTownCrate} from './town-yards.ts';
/** Solo prop state is independent of every reward/resource ledger. Old saves omit it. */
export type TraversalState = {version:1;crate:{x:number;y:number;z:number}} | {version:2;crate:{x:number;y:number;z:number};yards:{x:number;y:number;z:number}[]};
export interface TraversalIdentity {generation:number;seed:number;regional?:{version:1}}
export const SURVEY_CRATE_ID='camp-survey-crate';
export const SURVEY_CRATE_HALF=Object.freeze({hx:.56,hy:.65,hz:.56});
export function traversalPlan(identity:TraversalIdentity){
 const o=buildOrigin(identity);
 return {crate:{id:SURVEY_CRATE_ID,x:o.x-23,y:o.y+SURVEY_CRATE_HALF.hy+.02,z:o.z+14.8,...SURVEY_CRATE_HALF},ledge:{x:o.x-23,y:o.y+1.15,z:o.z+9,hx:1.1,hy:1.15,hz:1.1}};
}
export function validTraversal(value:unknown,identity:TraversalIdentity){
 if(!value||typeof value!=='object'||identity.generation!==2)return false;
 const s=value as TraversalState,regional=identity.regional?.version===1;
 // The one survey crate belongs to its saved world, even while the explorer is
 // underground. Its complete box plus collision skin must fit the region.
 const bound=regional?regionalBodyCenterBound(REGION_BOUND,SURVEY_CRATE_HALF.hx):79.4,minY=regional?-256:-20,maxY=regional?256:100;
 const survey=(s.version===1||s.version===2)&&isFiniteVec3(s.crate)&&Math.abs(s.crate.x)<=bound&&Math.abs(s.crate.z)<=bound&&s.crate.y>=minY&&s.crate.y<=maxY;
 if(!survey)return false;if(s.version===1)return true;
 if(!regional||Object.keys(s).sort().join(',')!=='crate,version,yards'||Object.keys(s.crate).sort().join(',')!=='x,y,z'||!Array.isArray(s.yards)||s.yards.length!==3||Object.keys(s.yards).join(',')!=='0,1,2')return false;
 const plan=townYards(identity.seed);
 return s.yards.every((p,i)=>{if(!isFiniteVec3(p)||Object.keys(p).sort().join(',')!=='x,y,z'||p.y<6.55||p.y>6.575)return false;const b=plan.crates[i]!,q=constrainTownCrate(b,p);return Math.abs(q.x-p.x)<.0001&&Math.abs(q.z-p.z)<.0001&&!plan.obstacles.some(o=>Math.abs(p.x-o.x)<b.hx+o.hx+.002&&Math.abs(p.y-o.y)<b.hy+o.hy+.002&&Math.abs(p.z-o.z)<b.hz+o.hz+.002);});
}
export function createTownTraversal(identity:TraversalIdentity):TraversalState{return {version:2,crate:((({x,y,z})=>({x,y,z}))(traversalPlan(identity).crate)),yards:townYards(identity.seed).crates.map(({x,y,z})=>({x,y,z}))};}
export function traversalObstacles(s:TraversalIdentity&{traversal?:TraversalState}){return s.generation!==2?[]:[traversalPlan(s).ledge,...(s.traversal?.version===2?townYards(s.seed).obstacles:[])];}
export function traversalBodies(s:TraversalIdentity&{traversal?:TraversalState}):MovableBody[]{
 if(s.generation!==2)return [];
 const base=traversalPlan(s).crate,saved=s.traversal;
 return [{...base,...(s.traversal?.crate??{})},...(saved?.version===2?townYards(s.seed).crates.map((b,i)=>({...b,...saved.yards[i]})):[])];
}
export function traversalFromBodies(bodies:unknown,identity:TraversalIdentity&{traversal?:TraversalState}):TraversalState|null {
 const v2=identity.traversal?.version===2;
 if(!Array.isArray(bodies)||bodies.length!==(v2?4:1))return null;
 const body=bodies[0] as MovableBody;if(!body||body.id!==SURVEY_CRATE_ID||body.hx!==SURVEY_CRATE_HALF.hx||body.hy!==SURVEY_CRATE_HALF.hy||body.hz!==SURVEY_CRATE_HALF.hz)return null;
 if(v2&&townYards(identity.seed).crates.some((b,i)=>{const p=bodies[i+1];return !p||p.id!==b.id||p.hx!==b.hx||p.hy!==b.hy||p.hz!==b.hz;}))return null;
 const crate={x:body.x,y:body.y,z:body.z};
 const result:TraversalState=v2?{version:2,crate,yards:bodies.slice(1).map(({x,y,z})=>({x,y,z}))}:{version:1,crate};
 return validTraversal(result,identity)?result:null;
}
