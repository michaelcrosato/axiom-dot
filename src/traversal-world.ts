import {REGION_BOUND} from './regional-world.ts';
import {regionalBodyCenterBound} from './regional-bounds.ts';
import {buildOrigin} from './generation.ts';
import {isFiniteVec3,type MovableBody} from './player-contact.ts';
/** Solo prop state is independent of every reward/resource ledger. Old saves omit it. */
export interface TraversalState {version:1;crate:{x:number;y:number;z:number}}
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
 return s.version===1&&isFiniteVec3(s.crate)&&Math.abs(s.crate.x)<=bound&&Math.abs(s.crate.z)<=bound&&s.crate.y>=minY&&s.crate.y<=maxY;
}
export function traversalBodies(s:TraversalIdentity&{traversal?:TraversalState}):MovableBody[]{
 if(s.generation!==2)return [];
 const base=traversalPlan(s).crate;
 return [{...base,...(s.traversal?.crate??{})}];
}
export function traversalFromBodies(bodies:unknown,identity:TraversalIdentity):TraversalState|null {
 if(!Array.isArray(bodies)||bodies.length!==1)return null;
 const body=bodies[0] as MovableBody;if(!body||body.id!==SURVEY_CRATE_ID||body.hx!==SURVEY_CRATE_HALF.hx||body.hy!==SURVEY_CRATE_HALF.hy||body.hz!==SURVEY_CRATE_HALF.hz)return null;
 const result:TraversalState={version:1,crate:{x:body.x,y:body.y,z:body.z}};
 return validTraversal(result,identity)?result:null;
}
