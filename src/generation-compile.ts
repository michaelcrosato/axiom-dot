import {generateValley} from './valley.ts';
import {generateDungeonPlan} from './dungeon-plan.ts';
import {generateDungeon,DUNGEON_SPAWN} from './dungeon.ts';
import {compileWorkshop} from './building.ts';
import {generationManifest,validGenerationInput,type GenerationInput,type GenerationPlan} from './generation-protocol.ts';
/** Fixed trusted recipes only. Never accepts saved plans, a registry, or executable hooks. */
export function compileGeneration(input:GenerationInput):GenerationPlan {
 if(!validGenerationInput(input))throw new RangeError('Invalid generation request');
 const {kind,seed}=input,manifest=generationManifest(kind);
 if(kind==='connected')return {kind,seed,manifest,valley:generateValley(seed),dungeon:generateDungeonPlan(seed)};
 const workshop=compileWorkshop(seed);if(!workshop.plan.valid)throw Error('The pinned workshop recipe failed validation');
 return kind==='legacy'?{kind,seed,manifest,dungeon:{...generateDungeon(seed),spawn:DUNGEON_SPAWN,bound:48},workshop}:{kind,seed,manifest,workshop};
}
