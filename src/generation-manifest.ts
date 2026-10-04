import {VALLEY_RECIPE_MANIFEST} from './valley.ts';
import {DUNGEON_RECIPE_MANIFEST} from './dungeon-plan.ts';
import {hashSeed} from './procedural.ts';
import {waterworksRegistry} from './waterworks.ts';
import {workshopRegistry} from './building.ts';
/** Domain manifests pin old terrain/dungeon foundations while new packs are introduced explicitly. */
export const GENERATION_MANIFEST=Object.freeze({
 framework:1,
 domains:Object.freeze({valley:1,dungeon:1,waterworks:1,workshop:1}),
 recipes:Object.freeze({waterworks:'waterworks/assembly@1',workshop:'frontier-workshop@1'}),
 contentHash:hashSeed(JSON.stringify([waterworksRegistry.list(),workshopRegistry.list()])).toString(16).padStart(8,'0'),
});
export const CONNECTED_GENERATION_MANIFEST=Object.freeze({
 framework:1,domains:Object.freeze({valley:2,dungeon:2,waterworks:1,workshop:1}),
 recipes:Object.freeze({...GENERATION_MANIFEST.recipes,valley:'connected-valley@2',dungeon:'connected-vault@2'}),
 contentHash:hashSeed(JSON.stringify([GENERATION_MANIFEST,VALLEY_RECIPE_MANIFEST,DUNGEON_RECIPE_MANIFEST])).toString(16).padStart(8,'0'),
});
export interface GenerationManifest {framework:number;domains:{valley:number;dungeon:number;waterworks:number;workshop:number};recipes:{waterworks:string;workshop:string;valley?:string;dungeon?:string};contentHash:string}
