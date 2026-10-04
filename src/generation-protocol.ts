import {GENERATION_MANIFEST,CONNECTED_GENERATION_MANIFEST,type GenerationManifest} from './generation-manifest.ts';
import type {ValleyPlan} from './valley.ts';
import type {DungeonPlan} from './dungeon-plan.ts';
import type {generateDungeon,DUNGEON_SPAWN} from './dungeon.ts';
import type {CompiledWorkshop} from './building.ts';
export type GenerationKind='connected'|'legacy'|'workshop';
export interface GenerationInput {kind:GenerationKind;seed:number}
export type LegacyDungeon=ReturnType<typeof generateDungeon>&{spawn:typeof DUNGEON_SPAWN;bound:number};
export type GenerationPlan=
 |{kind:'connected';seed:number;manifest:GenerationManifest;valley:ValleyPlan;dungeon:DungeonPlan}
 |{kind:'legacy';seed:number;manifest:GenerationManifest;dungeon:LegacyDungeon;workshop:CompiledWorkshop}
 |{kind:'workshop';seed:number;manifest:GenerationManifest;workshop:CompiledWorkshop};
/** The source revision is a build identity, not an authenticity claim about external packets. */
export const GENERATION_SOURCE=JSON.stringify({protocol:1,sourceRevision:(import.meta as ImportMeta & {env?:{VITE_AXIOM_SOURCE_REVISION?:string}}).env?.VITE_AXIOM_SOURCE_REVISION??'not-recorded',legacy:GENERATION_MANIFEST,connected:CONNECTED_GENERATION_MANIFEST});
export const GENERATION_LIMITS=Object.freeze({timeoutMs:5000,maxValues:160000,maxStringUnits:1000000,maxDepth:24,maxArray:40000});
export const generationManifest=(kind:GenerationKind)=>kind==='connected'?CONNECTED_GENERATION_MANIFEST:GENERATION_MANIFEST;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
export function validGenerationInput(v:unknown):v is GenerationInput {return record(v)&&Object.keys(v).length===2&&['connected','legacy','workshop'].includes(v.kind as string)&&Number.isInteger(v.seed)&&Number(v.seed)>=0&&Number(v.seed)<=0xffffffff;}
export function generationAbort():Error {const e=new Error('Generation request aborted');e.name='AbortError';return e;}
/** Bounded data-only validation and re-freeze, never a main-thread recompilation.
 * Only the private, owned Worker channel may supply cache candidates. This is not a
 * validator for imported plans: a matching shape cannot prove deterministic output. */
export function acceptGenerationPlan(value:unknown,input:GenerationInput):GenerationPlan {
 let count=0,strings=0;const seen=new Set<object>();
 function walk(v:unknown,depth:number):void {
  if(++count>GENERATION_LIMITS.maxValues||depth>GENERATION_LIMITS.maxDepth)throw Error('Generation response exceeds data budget');
  if(v===null||typeof v==='boolean')return;
  if(typeof v==='number'){if(!Number.isFinite(v))throw Error('Nonfinite generation value');return;}
  if(typeof v==='string'){strings+=v.length;if(strings>GENERATION_LIMITS.maxStringUnits)throw Error('Generation text exceeds budget');return;}
  if(typeof v!=='object'||!v||seen.has(v))throw Error('Generation response is not plain acyclic data');
  seen.add(v);
  if(Array.isArray(v)){if(v.length>GENERATION_LIMITS.maxArray)throw Error('Generation array exceeds budget');for(const n of v)walk(n,depth+1);}
  else{if(!record(v))throw Error('Generation response is not plain data');const keys=Object.keys(v);if(keys.length>128)throw Error('Generation object exceeds budget');for(const k of keys){if(['__proto__','constructor','prototype'].includes(k))throw Error('Unsafe generation key');strings+=k.length;walk(v[k],depth+1);}}
  seen.delete(v);
 }
 walk(value,0);
 if(!record(value)||value.kind!==input.kind||value.seed!==input.seed||JSON.stringify(value.manifest)!==JSON.stringify(generationManifest(input.kind)))throw Error('Generation identity mismatch');
 const p=value as unknown as GenerationPlan;
 const workshopOK=(w:CompiledWorkshop)=>w&&w.plan?.valid===true&&w.plan.seed===input.seed&&w.plan.recipe.id==='frontier-workshop'&&w.plan.recipe.version===1&&w.plan.nodes.length<=64&&w.plan.operations<=3000;
 if(p.kind==='connected'){
  const v=p.valley,d=p.dungeon;
  if(Object.keys(p).length!==5||v?.seed!==input.seed||v.version!==2||d?.seed!==input.seed||d.version!==2||v.terrain?.vertices.length!==6561*3||v.terrain.indices.length!==38400||v.terrain.bound!==80||v.terrain.step!==2||v.buildings.length!==4||v.objects.length>18||!v.constraints.every(c=>c.ok)||v.budget.operations>v.budget.maxOperations||v.budget.maxOperations!==800000||d.rooms.length>12||d.tiles.length>1100||d.walls.length>1600||d.objects.length!==7||!d.constraints.every(c=>c.ok)||d.budget.operations>20000)throw Error('Invalid connected generation response');
 }else if(p.kind==='legacy'){
  if(Object.keys(p).length!==5||p.dungeon?.bound!==48||p.dungeon.tiles.length>1100||p.dungeon.walls.length>1600||!workshopOK(p.workshop))throw Error('Invalid legacy generation response');
 }else if(Object.keys(p).length!==4||!workshopOK(p.workshop))throw Error('Invalid workshop generation response');
 // Keep the canonical main-module manifest object; clone transport cannot preserve it.
 p.manifest=generationManifest(input.kind);
 function freeze(v:unknown):void {if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const n of Object.values(v))freeze(n);Object.freeze(v);}}
 freeze(p);return p;
}
