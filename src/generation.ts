import {regionalHeight} from './regional-world.ts';
import {generateValley,valleySurfaceHeight,type ValleyPlan} from './valley.ts';
import {generateDungeonPlan} from './dungeon-plan.ts';
import {generateDungeon,DUNGEON_SPAWN} from './dungeon.ts';
import {compileWorkshop,type CompiledWorkshop} from './building.ts';
export {GENERATION_MANIFEST,CONNECTED_GENERATION_MANIFEST,type GenerationManifest} from './generation-manifest.ts';
import {GENERATION_MANIFEST,CONNECTED_GENERATION_MANIFEST,type GenerationManifest} from './generation-manifest.ts';
const plans=new Map<number,ValleyPlan>();
export function worldValley(seed:number):ValleyPlan {let p=plans.get(seed);if(!p){p=generateValley(seed);if(plans.size>=4)plans.clear();plans.set(seed,p);}return p;}
const dungeons=new Map<string,ReturnType<typeof generateDungeonPlan>|(ReturnType<typeof generateDungeon>&{spawn:typeof DUNGEON_SPAWN;bound:number})>();
export function worldDungeon(s:{seed:number;generation:number}){const key=`${s.generation}:${s.seed}`;let d=dungeons.get(key);if(!d){d=s.generation===2?generateDungeonPlan(s.seed):{...generateDungeon(s.seed),spawn:DUNGEON_SPAWN,bound:48};if(dungeons.size>=4)dungeons.clear();dungeons.set(key,d);}return d;}
export function worldHeight(s:{seed:number;generation:number;zone:string;regional?:{version:1}},x:number,z:number){return s.generation===2&&s.zone==='valley'?(s.regional?.version===1&&Math.max(Math.abs(x),Math.abs(z))>80?regionalHeight(s.seed,x,z):valleySurfaceHeight(worldValley(s.seed),x,z)):0;}
export function buildOrigin(s:{seed:number;generation:number}){return s.generation===2?worldValley(s.seed).endpoints.buildOrigin:{x:0,y:0,z:0};}
export function buildPlayer(s:{seed:number;generation:number;player:{x:number;z:number}}){const o=buildOrigin(s);return {x:s.player.x-o.x,z:s.player.z-o.z};}
export function validGenerationManifest(value:unknown):value is GenerationManifest {
 if(!value||typeof value!=='object')return false;
 const m=value as GenerationManifest;
 const expected=m.domains?.valley===2?CONNECTED_GENERATION_MANIFEST:GENERATION_MANIFEST;
 return m.framework===expected.framework&&m.domains?.valley===expected.domains.valley&&m.domains?.dungeon===expected.domains.dungeon&&m.domains?.waterworks===1&&m.domains?.workshop===1&&m.recipes?.waterworks===expected.recipes.waterworks&&m.recipes?.workshop===expected.recipes.workshop&&m.contentHash===expected.contentHash&&(m.domains.valley===1||m.recipes.valley==='connected-valley@2'&&m.recipes.dungeon==='connected-vault@2');
}
let workshopSeed=-1,workshop:CompiledWorkshop|undefined;
export function worldWorkshop(seed:number):CompiledWorkshop {if(seed!==workshopSeed||!workshop){workshop=compileWorkshop(seed);if(!workshop.plan.valid)throw new Error('The pinned workshop recipe failed validation');workshopSeed=seed;}return workshop;}

// Lazy and server-safe: authoritative synchronous consumers never construct a Worker.
import {createGenerationClient,type GenerationClient,type GenerationResult} from './generation-client.ts';
import {generationAbort,type GenerationInput} from './generation-protocol.ts';
let generationClient:GenerationClient|undefined;let preparationEpoch=0;
function client(){return generationClient??=createGenerationClient();}
/** Read-only previews do not populate or evict world caches. Abort on seed/view changes. */
export function previewGeneration(input:GenerationInput,signal?:AbortSignal):Promise<GenerationResult>{return client().request(input,signal?{signal}:{});}
/** Prepare trusted plans before running the unchanged synchronous state/save validators.
 * There is deliberately no exported function accepting a plan to insert into a cache. */
export async function prepareWorldGeneration(identity:{seed:number;generation:1|2},signal?:AbortSignal,timeoutMs?:number):Promise<GenerationResult>{
 if(signal?.aborted)throw generationAbort();
 const {seed,generation}=identity,epoch=preparationEpoch;
 if((generation!==1&&generation!==2)||!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new RangeError('Invalid generation');
 const cachedValley=plans.get(seed),cachedDungeon=dungeons.get(`${generation}:${seed}`);
 if(cachedDungeon&&(generation===2?cachedValley:workshop&&workshopSeed===seed)){
  const plan=generation===2?{kind:'connected' as const,seed,manifest:CONNECTED_GENERATION_MANIFEST,valley:cachedValley!,dungeon:cachedDungeon as ReturnType<typeof generateDungeonPlan>}:{kind:'legacy' as const,seed,manifest:GENERATION_MANIFEST,dungeon:cachedDungeon as ReturnType<typeof generateDungeon>&{spawn:typeof DUNGEON_SPAWN;bound:number},workshop:workshop!};
  return {plan,backend:'cache',fallback:null,timings:{totalMs:0,compileMs:0,validationMs:0,bootMs:0}};
 }
 const result=await client().request({kind:generation===2?'connected':'legacy',seed},{...(signal?{signal}:{}),synchronous:generation===1,...(timeoutMs===undefined?{}:{timeoutMs})});
 if(signal?.aborted||epoch!==preparationEpoch)throw generationAbort();
 const p=result.plan;
 // No await between validation and insertion: all of this identity becomes available together.
 if(p.kind==='connected'){
  if(!plans.has(seed)&&plans.size>=4)plans.clear();
  const key=`2:${seed}`;if(!dungeons.has(key)&&dungeons.size>=4)dungeons.clear();
  if(!plans.has(seed))plans.set(seed,p.valley);if(!dungeons.has(key))dungeons.set(key,p.dungeon);
 }else if(p.kind==='legacy'){
  const key=`1:${seed}`;if(!dungeons.has(key)&&dungeons.size>=4)dungeons.clear();if(!dungeons.has(key))dungeons.set(key,p.dungeon);
  workshopSeed=seed;workshop=p.workshop;
 }
 return result;
}
/** Terminate during page teardown; a later request can lazily start a fresh service. */
export function disposeGeneration(){preparationEpoch++;generationClient?.dispose();generationClient=undefined;}
