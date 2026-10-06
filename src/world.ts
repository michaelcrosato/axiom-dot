import {applyRestorationCare,validRestorationCare,immutableRestorationCare,type RestorationCareState,type RestorationCareCommand} from './restoration-care.ts';
import {applyWorkshopConstruction,advanceWorkshopConstruction,validWorkshopConstruction,immutableWorkshopConstruction,workshopConstructionBoxes,workshopConstructionPosition,type WorkshopConstructionState,type WorkshopConstructionCommand} from './workshop-construction.ts';
import {RESTORATION_ENGINE,createRestoration,advanceRestoration,applyRestorationCommand,validRestoration,immutableRestoration,restorationPlayerCost,restorationPlan,type RestorationState,type RestorationCommand,type HabitatActor} from './restoration.ts';
import {habitatSiteDescriptors} from './habitat-sites.ts';
import {TOWN_DIRECTOR_ENGINE,createTownDirector,advanceTownDirector,applyTownDirectorCommand,noteTownDirectorContribution,validTownDirector,immutableTownDirector,TOWN_DIRECTOR_DEFAULTS,type TownDirectorState,type TownDirectorCommand} from './town-director.ts';
import {townLifeInteractionTarget} from './town-life-runtime.ts';
import type {TownActor} from './town-crowd.ts';
import {createTownLifeOpening,advanceTownLife,advanceTownLifeWithWorkshopWork,validTownLife,immutableTownLife,applyTownLifeCommand,townLifePlayerCost,type TownLifeState,type TownLifeCommand} from './town-life.ts';
import {createTownState,validTownState,townBalance,purchaseTown,TOWN_SPAWN,type TownState,type TownCommand} from './starting-town.ts';
import {REGIONAL_FOOD_MAX_TICKS,regionalFoodCost,createRegionalFood,advanceRegionalFood,applyRegionalFoodCommand,observeRegionalFoodTrade,validRegionalFood,immutableRegionalFood,type RegionalFoodState,type RegionalFoodCommand} from './regional-food.ts';
import {createRegionalTrade,advanceRegionalTrade,applyRegionalTradeCommand,validRegionalTrade,immutableRegionalTrade,regionalTradeObstacles,type RegionalTradeState,type RegionalTradeCommand} from './regional-trade.ts';
import {validTraversal,traversalBodies,type TraversalState} from './traversal-world.ts';
import {createRegionalSupply,advanceRegionalSupply,applyRegionalSupplyCommand,validRegionalSupply,immutableRegionalSupply,regionalSupplyObstacles,type RegionalSupplyState,type RegionalSupplyCommand} from './regional-supply.ts';
import {gatherWilderness,immutableWildernessState,validWildernessState,validWildernessGatherAction,type WildernessState,type WildernessGatherContext,type WildernessQueryObstacle} from './wilderness-state.ts';
import {wildernessFeatureById} from './wilderness.ts';
import {REGION_BOUND} from './regional-world.ts';
import {createCommonsTrade,applyCommonsTrade,validCommonsTrade,commonsTradeExports,type CommonsTradeCommand} from './commons-trade.ts';
import {createWaterRequests,applyWaterRequestCommand,type WaterRequestCommand} from './water-requests.ts';
import {createCaveSupply,caveSupplyCost,caveSupplyContext,applyCaveSupplyCommand,advanceCaveSettlement,validCaveSupply,type CaveSupplyState,type CaveSupplyCommand} from './cave-supply.ts';
import {createEcologyState,advanceEcology,applyEcologyCommand,validEcology,ecologyCost,type EcologyState,type EcologyCommand} from './ecology.ts';
import {createEconomyState,advanceEconomy,applyEconomyCommand,validEconomy,economyCost,economyRecoverableScrap,type EconomyState,type EconomyCommand} from './economy.ts';
import {naturalCave,caveReturnNearby} from './natural-cave.ts';
import {createCaveWater,advanceCaveWater,applyCaveWaterCommand,validCaveWater,caveWaterCost,safeCavePosition,type CaveWaterState,type CaveWaterCommand} from './cave-water.ts';
import {createEncounters,advanceEncounters,hitEncounter,validEncounters,type Encounters,type EncounterContext,type EncounterEvent} from './encounters.ts';
import {emptyEquipment,validEquipment,equipmentCost,refitEquipment,assembleEquipment,type EquipmentState,type EquipmentRecipeInput} from './equipment.ts';
import {createCausalState,reconcileCausal,advanceCausal,applyCausalCommand,noteCausalWorldAction,validCausal,type CausalState,type CausalCommand,type CausalContext} from './causal.ts';
import {GENERATION_MANIFEST,CONNECTED_GENERATION_MANIFEST,worldValley,worldDungeon,worldHeight,buildPlayer,buildOrigin,validGenerationManifest,worldWorkshop,type GenerationManifest} from './generation.ts';
import {dungeonRestoreClear} from './dungeon-plan.ts';
import {safeWorkshopSpawn,restoreClear,RESTORE_CAPSULE_RADIUS} from './building.ts';
import {emptySettlement,emptyJobs,advanceSettlement,acceptCommission,claimCommission,validSettlement,validJobs,JOBS,type Settlement,type Jobs,type JobId} from './settlement.ts';
import {emptyWaterworks,build,flow,supplyWorking,validMachine,validLegacyMachine,migrateLegacyMachine,safeMachineSpawn,machineCosts,machineObstacles,type Waterworks,type BuildCommand} from './waterworks.ts';
import {generateDungeon,CAVE_ENTRANCE,CAVE_RETURN,DUNGEON_SPAWN} from './dungeon.ts';
/** Deterministic, renderer-independent simulation. All transitions are immutable. */
export type ObjectKind = 'scrap' | 'core' | 'water' | 'enemy' | 'pump' | 'settlement' | 'rock' | 'entrance' | 'exit';
export interface WorldObject { id: string; kind: ObjectKind; x: number; z: number; y?:number; label: string }
export interface State {
  /** Separate save flavor; the generation-2 core and all of its ledgers stay pinned. */
  regional?:{version:1};
  wilderness?:WildernessState;
  town?:TownState;
  /** Additive active-play autonomy; absent historical saves stay valid until explicitly enabled. */
  townLife?:TownLifeState;
  /** Bounded factual town opportunities; never a source of items or currency. */
  townDirector?:TownDirectorState;
  restoration?:RestorationState;
  restorationCare?:RestorationCareState;
  workshopConstruction?:WorkshopConstructionState;
  frontierSupply?:RegionalSupplyState;
  frontierTrade?:RegionalTradeState;
  frontierFood?:RegionalFoodState;
  traversal?:TraversalState;
  encounters?:Encounters;
  caveWater?:CaveWaterState;
  caveSupply?:CaveSupplyState;
  economy?:EconomyState;
  ecology?:EcologyState;
  causal?:CausalState;
  equipment?:EquipmentState;
  schemaVersion: 6; generationManifest:GenerationManifest; waterworks: Waterworks; settlement: Settlement; jobs: Jobs; generation: 1 | 2; seed: number; zone: 'valley' | 'dungeon' | 'cave';
  player: { x: number; z: number; hp: number };
  inventory: { scrap: number; core: number; water: number };
  collected: string[]; defeated: string[];
  waterRestored: boolean; jobAccepted: boolean; revision: number; events: string[];
}
export type Action =
  | {type:'restoration-care';command:RestorationCareCommand}
  | {type:'workshop-construction';command:WorkshopConstructionCommand}
  | {type:'restoration';command:RestorationCommand}
  | {type:'town-director';command:TownDirectorCommand}
  | {type:'town-life';command:TownLifeCommand}
  | {type:'town-purchase';command:TownCommand}
  | {type:'visit-town'}
  | {type:'regional-food';command:RegionalFoodCommand}
  | {type:'regional-trade';command:RegionalTradeCommand}
  | {type:'regional-supply';command:RegionalSupplyCommand}
  | {type:'gather-wilderness';id:string}
  | {type:'commons-trade';command:CommonsTradeCommand}
  | {type:'ecology';command:EcologyCommand}
  | {type:'economy';command:EconomyCommand}
  | {type:'enter-cave'}
  | {type:'cave-water';command:CaveWaterCommand}
  | {type:'cave-supply';command:CaveSupplyCommand}
  | {type:'refit-equipment'; seed:number|null}
  | {type:'assemble-equipment';recipe:EquipmentRecipeInput}
  | { type: 'causal'; command:CausalCommand }
  | { type: 'water-request'; command:WaterRequestCommand }
  | { type: 'accept-commission'; id: JobId }
  | { type: 'claim-commission' }
  | { type: 'build'; command: BuildCommand }
  | { type: 'move'; x: number; z: number }
  | { type: 'collect'; id: string }
  | { type: 'attack'; id: string }
  | { type: 'repair' | 'repair-pump' | 'deliver' | 'deliver-water' | 'accept' | 'accept-job' }
  | { type: 'tick'; dt: number }
  | { type: 'enter' | 'exit' | 'respawn' };
export const WORLD_BOUND = 48;
export const INTERACTION_DISTANCE = 3.5;
export const PUMP_POSITION = Object.freeze({ x: 0, z: 16 });
export const SETTLEMENT_POSITION = Object.freeze({ x: -16, z: -4 });
const AUTHORED: readonly WorldObject[] = [
  ...[-8,-11,-14,-17].map((x,i)=>({id:`build-scrap-${i}`,kind:'scrap' as const,x,z:13,label:'Waterworks salvage'})),
  {id:'cave',kind:'entrance',...CAVE_ENTRANCE,label:'Enter the Echo Vault'},
  { id: 'scrap-1', kind: 'scrap', x: -9, z: 8, label: 'Salvage cache' },
  { id: 'scrap-2', kind: 'scrap', x: -5, z: 0, label: 'Machine scrap' },
  { id: 'scrap-3', kind: 'scrap', x: 7, z: -6, label: 'Alloy fragments' },
  { id: 'water-1', kind: 'water', x: 11, z: 6, label: 'Sealed water canister' },
  { id: 'water-2', kind: 'water', x: 15, z: 10, label: 'Sealed water canister' },
  { id: 'water-3', kind: 'water', x: 18, z: 4, label: 'Sealed water canister' },
  { id: 'core-1', kind: 'core', x: 7, z: 15, label: 'Power core' },
  { id: 'sentry-1', kind: 'enemy', x: 5, z: 12, label: 'Rogue sentry' },
  { id: 'sentry-2', kind: 'enemy', x: -12, z: -13, label: 'Rogue sentry' },
  { id: 'pump', kind: 'pump', ...PUMP_POSITION, label: 'Valley water pump' },
  { id: 'settlement', kind: 'settlement', ...SETTLEMENT_POSITION, label: 'Mossbank settlement' },
];
function seedOK(seed: unknown): seed is number { return typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff; }
export function generateObjects(seed: number): WorldObject[] {
  if (!seedOK(seed)) throw new RangeError('Seed must be an unsigned 32-bit integer');
  let n = seed >>> 0;
  const random = () => { n = (Math.imul(1664525, n) + 1013904223) >>> 0; return n / 4294967296; };
  const result = AUTHORED.map(object => ({ ...object }));
  for (let i = 0; i < 22; i++) {
    // Decorative objects only: routes, supplies, and quest solutions are seed-stable.
    const angle = (i / 22) * Math.PI * 2;
    const radius = 26 + random() * 13;
    result.push({ id: `rock-${i}`, kind: 'rock', x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, label: 'Basalt outcrop' });
  }
  return result;
}
export const OBJECTS: readonly WorldObject[] = Object.freeze(generateObjects(1).map(object => Object.freeze(object)));
export function createState(seed = 1): State {
  if (!seedOK(seed)) throw new RangeError('Seed must be an unsigned 32-bit integer');
  return { equipment:emptyEquipment(), schemaVersion: 6, generationManifest:GENERATION_MANIFEST, waterworks:emptyWaterworks(), settlement:emptySettlement(), jobs:emptyJobs(), generation: 1, seed, zone: 'valley', player: { x: -13, z: 12, hp: 100 },
    inventory: { scrap: 0, core: 0, water: 0 }, collected: [], defeated: [], waterRestored: false,
    jobAccepted: false, revision: 0, events: ['Field architect deployed. Mossbank needs water. Repair the pump or deliver three canisters.'] };
}
/** Old worlds remain generation 1; entering generation 2 is an explicit new-world action. */
export function createConnectedState(seed=73129):State {const s=createState(seed),plan=worldValley(seed);const next:State={...s,generation:2,generationManifest:CONNECTED_GENERATION_MANIFEST,player:{x:plan.endpoints.spawn.x,z:plan.endpoints.spawn.z,hp:100},events:['Field architect deployed. Survey the connected valley, its settlements and the Echo Vault.']};next.causal=reconcileCausal(createCausalState(seed),causalContext(next));return next;}
/** Explicit new-world flavor. Never applied as a migration to an existing save. */
export function createRegionalState(seed=73129):State {return {...createConnectedState(seed),regional:{version:1},town:createTownState(),player:{x:TOWN_SPAWN.x,z:TOWN_SPAWN.z,hp:100},events:['Welcome to Hearthmere. Meet 100 townspeople, browse seven businesses, then follow the east road to Mossbank and the 10 km² frontier.']};}
export function worldEndpoints(s:Pick<State,'generation'|'seed'>){return s.generation===2?worldValley(s.seed).endpoints:{spawn:{x:-13,z:12},entrance:CAVE_ENTRANCE,return:CAVE_RETURN,pump:PUMP_POSITION,settlement:SETTLEMENT_POSITION,buildOrigin:{x:0,y:0,z:0}};}
export function worldObjects(s:Pick<State,'generation'|'seed'>):readonly WorldObject[]{return s.generation===2?worldValley(s.seed).objects:generateObjects(s.seed);}
export function worldBound(s:Pick<State,'generation'|'seed'|'regional'>&{zone?:State['zone']}){return s.zone==='cave'?naturalCave(s.seed).bound:s.generation===2?(s.zone==='dungeon'?worldDungeon(s).bound:s.regional?.version===1?REGION_BOUND:worldValley(s.seed).terrain.bound):WORLD_BOUND;}
export function dungeonSpawn(s:Pick<State,'generation'|'seed'>){return s.generation===2?worldDungeon(s).spawn:DUNGEON_SPAWN;}
export function machineWorldObstacles(s:Pick<State,'generation'|'seed'|'waterworks'>){const origin=buildOrigin(s);return machineObstacles(s.waterworks).map(o=>({...o,x:o.x+origin.x,z:o.z+origin.z,y:o.hy+origin.y}));}
function safeWorldSpawn(s:State,point:{x:number;z:number}){const origin=buildOrigin(s),local=safeMachineSpawn(s.waterworks,{x:point.x-origin.x,z:point.z-origin.z});let safe={x:local.x+origin.x,z:local.z+origin.z};if(s.generation===1)return safeWorkshopSpawn(worldWorkshop(s.seed),safe);for(const building of worldValley(s.seed).buildings){const blocked=!restoreClear(building.plan.shapes,safe,building.elevation);if(blocked)safe={...building.spawn};}if(s.workshopConstruction&&!restoreClear(workshopConstructionBoxes(s.workshopConstruction),safe,6))safe={...workshopConstructionPosition()};return safe;}

function record(state: State, message: string, patch: Partial<State> = {}): State {
  return { ...state, ...patch, revision: state.revision + 1, events: [...state.events, message].slice(-20) };
}
function nearby(state: State, position: { x: number; z: number; y?:number }): boolean {
  return Math.hypot(state.player.x - position.x, state.player.z - position.z,worldHeight(state,state.player.x,state.player.z)-(position.y??worldHeight(state,position.x,position.z))) <= INTERACTION_DISTANCE;
}
let cachedSeed=-1;let cachedDungeon:readonly WorldObject[]=[];
export function activeObjects(state:State):readonly WorldObject[]{
 if(state.zone==='cave')return naturalCave(state.seed).objects;
 if(state.generation===2)return state.zone==='valley'?worldValley(state.seed).objects:worldDungeon(state).objects;
 if(state.zone==='valley')return AUTHORED;
 if(cachedSeed!==state.seed){cachedSeed=state.seed;cachedDungeon=Object.freeze(generateDungeon(state.seed).objects.map(o=>Object.freeze(o)));}
 return cachedDungeon;
}
function applyWorldAction(state: State, action: Action,restorationActors:readonly HabitatActor[]=[]): State {
  switch (action.type) {
    case 'visit-town': {
      if(!state.regional||state.zone!=='valley'||state.player.hp<=0)return state;
      return record(state,'Arrived in Hearthmere. Your supplies and campaign progress are retained.',{town:state.town??createTownState(),player:{...state.player,x:TOWN_SPAWN.x,z:TOWN_SPAWN.z}});
    }
    case 'restoration': {
      if(!state.regional||!state.restoration)return state;const result=applyRestorationCommand(state.restoration,worldRestorationPlan(state.seed),{...state,actors:restorationActors},action.command);
      return result.state===state.restoration?state:record(state,result.message,{restoration:result.state,inventory:result.inventory,player:{...state.player,hp:result.hp}});
    }
    case 'town-director': {
      if(!state.townDirector||!state.townLife)return state;const townDirector=applyTownDirectorCommand(state.townDirector,state.townLife,{seed:state.seed,zone:state.zone,player:state.player},action.command);
      return townDirector?record(state,action.command.kind==='accept'?'Accepted a real town request. Help through the existing local actions.':'Declined the town request. The underlying need remains.',{townDirector}):state;
    }
    case 'town-life': return commitTownLife(state,action.command);
    case 'restoration-care': return commitRestorationCare(state,action.command);
    case 'workshop-construction': return commitWorkshopConstruction(state,action.command,restorationActors);
    case 'town-purchase': {
      if(!state.regional||!state.town)return state;const result=purchaseTown(state.town,state,action.command);if(!result)return state;
      return record(state,result.message,{town:result.town,inventory:result.inventory,player:{...state.player,hp:result.hp}});
    }
    case 'regional-food': return commitRegionalFood(state,action.command);
    case 'regional-trade': {
      if(!state.frontierTrade||!state.regional||state.generation!==2)return state;
      const result=applyRegionalTradeCommand(state.frontierTrade,{...state,feetY:worldHeight(state,state.player.x,state.player.z),grounded:true},action.command);
      if(result.state===state.frontierTrade)return state;
      // The trade command and food's temporal witness share one atomic world
      // commit. A failed observation cannot commit one side of the dependency.
      const next={...state,frontierTrade:result.state},frontierFood=state.frontierFood?observeRegionalFoodTrade(state.frontierFood,next,action.command):undefined;
      if(state.frontierFood&&(!frontierFood||frontierFood===state.frontierFood&&state.frontierFood.ticks<REGIONAL_FOOD_MAX_TICKS))return state;
      return record(state,result.message,{frontierTrade:result.state,...(frontierFood?{frontierFood}:{})});
    }
    case 'regional-supply': {
      if(!state.frontierSupply||!state.regional||state.generation!==2)return state;
      const result=applyRegionalSupplyCommand(state.frontierSupply,state,action.command);
      return result.state===state.frontierSupply?state:record(state,result.message,{frontierSupply:result.state});
    }
    case 'gather-wilderness': return validWildernessGatherAction(action)?commitWildernessGather(state,action.id):state;
    case 'commons-trade': {
      if(state.generation!==2||!state.causal)return state;const result=applyCommonsTrade(state.causal,causalContext(state),action.command);
      return result.state===state.causal?state:record(state,result.message,{causal:result.state,inventory:result.inventory});
    }
    case 'ecology': {
      if(!state.ecology)return state;const result=applyEcologyCommand(state.ecology,state,action.command);
      return result.state===state.ecology?state:record(state,result.message,{ecology:result.state,inventory:result.inventory,player:{...state.player,hp:state.player.hp+result.hpEffect}});
    }
    case 'economy': {
      if(!state.economy||!state.causal)return state;const result=applyEconomyCommand(state.economy,state.causal,causalContext(state),action.command);
      return result.state===state.economy?state:record(state,result.message,{economy:result.state,inventory:result.inventory});
    }
    case 'enter-cave': {
      if(state.zone!=='valley'||state.player.hp<=0||!nearby(state,worldEndpoints(state).entrance))return state;
      const caveWater=state.caveWater??createCaveWater(state.seed),spawn=naturalCave(state.seed).spawn;
      return record(state,'Entered the river cave. Restore drainage to open the flooded narrows.',{zone:'cave',caveWater,...(state.generation===2&&state.causal?{caveSupply:(state.caveSupply===undefined?createCaveSupply(state.seed,caveWater):state.caveSupply)}:{}),player:{...spawn,hp:state.player.hp}});
    }
    case 'cave-supply': {
      if(state.generation!==2||!state.caveSupply||!state.caveWater||!state.causal)return state;
      const result=applyCaveSupplyCommand(state.caveSupply,state.caveWater,{inventory:state.inventory,player:state.player,zone:state.zone,hp:state.player.hp},action.command);
      return result.state===state.caveSupply?state:record(state,result.message,{caveSupply:result.state,inventory:result.inventory});
    }
    case 'cave-water': {
      if(!state.caveWater)return state;const result=applyCaveWaterCommand(state.caveWater,{inventory:state.inventory,player:state.player,zone:state.zone,hp:state.player.hp},action.command);
      return result.state===state.caveWater?state:record(state,result.message,{caveWater:result.state,inventory:result.inventory});
    }
    case 'assemble-equipment': {
      if(state.player.hp<=0||state.zone!=='valley')return state;
      try{const result=assembleEquipment(state.equipment,state.inventory,action.recipe);if(!result||JSON.stringify(result.equipment)===JSON.stringify(state.equipment??emptyEquipment()))return state;
      return record(state,'Edited staff assembled. Previous assembly materials recycled.',result);}catch{return state;}
    }
    case 'refit-equipment': {
      if(state.player.hp<=0||state.zone!=='valley')return state;
      try{const result=refitEquipment(state.equipment,state.inventory,action.seed);if(!result||JSON.stringify(result.equipment)===JSON.stringify(state.equipment??emptyEquipment()))return state;
      return record(state,action.seed===null?'Survey staff restored. Assembly materials recovered.':'Resonant staff assembled. Previous assembly materials recycled.',result);}catch{return state;}
    }
    case 'water-request': {
      if(state.generation!==2||!state.causal)return state;const result=applyWaterRequestCommand(state.causal,causalContext(state),action.command);
      return result.state===state.causal?state:record(state,result.message,{causal:result.state});
    }
    case 'causal': {
      if(state.generation!==2||!state.causal)return state;const result=applyCausalCommand(state.causal,causalContext(state),action.command);
      return result.state===state.causal?state:record(state,result.message,{causal:result.state,inventory:result.inventory});
    }
    case 'accept-commission': {
      if(state.zone!=='valley'||state.player.hp<=0||!nearby(state,worldEndpoints(state).settlement))return state;
      const jobs=acceptCommission(state.jobs,state.settlement,state.waterworks,action.id);
      return jobs===state.jobs?state:record(state,`Accepted commission: ${JOBS.find(j=>j.id===action.id)!.title}.`,{jobs});
    }
    case 'claim-commission': {
      if(state.zone!=='valley'||state.player.hp<=0||!nearby(state,worldEndpoints(state).settlement))return state;
      const jobs=claimCommission(state.jobs,state.settlement,state.waterworks);
      return jobs===state.jobs?state:record(state,`Commission complete. Earned ${jobs.renown-state.jobs.renown} renown. Mossbank remembers your service.`,{jobs});
    }
    case 'build': {
      if(state.player.hp<=0)return state;
      const result=build(state.waterworks,state.inventory,action.command,buildPlayer(state),state.zone);
      if(result.machine===state.waterworks)return state;
      return record(state,result.reason,{waterworks:result.machine,inventory:result.inventory});
    }
    case 'enter':
      if(state.zone!=='valley'||state.player.hp<=0||!nearby(state,worldEndpoints(state).entrance))return state;
      return record(state,'Entered the Echo Vault. Find its caches; the threshold always leads home.',{zone:'dungeon',player:{...dungeonSpawn(state),hp:state.player.hp}});
    case 'exit':
      if(state.player.hp<=0||!(state.zone==='dungeon'&&nearby(state,dungeonSpawn(state))||state.zone==='cave'&&caveReturnNearby(naturalCave(state.seed),state.player)))return state;
      return record(state,'Returned to Verdant Reach. Underground discoveries retained.',{zone:'valley',player:{x:worldEndpoints(state).return.x,z:worldEndpoints(state).return.z,hp:state.player.hp}});
    case 'respawn':
      if(state.player.hp>0)return state;
      return record(state,'Emergency recall to camp. Supplies and cleared routes retained.',{zone:'valley',player:{...safeWorldSpawn(state,worldEndpoints(state).spawn),hp:100}});
    case 'move': {
      if (!Number.isFinite(action.x) || !Number.isFinite(action.z) || state.player.hp <= 0) return state;
      const x = Math.max(-worldBound(state), Math.min(worldBound(state), action.x));
      const z = Math.max(-worldBound(state), Math.min(worldBound(state), action.z));
      if (x === state.player.x && z === state.player.z) return state;
      return { ...state, player: { ...state.player, x, z }, revision: state.revision + 1 };
    }
    case 'collect': {
      const object = activeObjects(state).find(item => item.id === action.id);
      if (!object || !['scrap', 'core', 'water'].includes(object.kind) || state.collected.includes(object.id) || !nearby(state, object) || state.player.hp <= 0) return state;
      const resource = object.kind as keyof State['inventory'];
      return record(state, `Recovered ${resource}. Supplies stored in your field pack.`, {
        inventory: { ...state.inventory, [resource]: state.inventory[resource] + 1 }, collected: [...state.collected, object.id],
      });
    }
    case 'attack': {
      const enemy = encounterObjects(state).find(item => item.id === action.id && item.kind === 'enemy');
      if (!enemy || state.defeated.includes(enemy.id) || !nearby(state, enemy) || state.player.hp <= 0) return state;
      const encounters=state.encounters?hitEncounter(state.encounters,enemy.id,100).state:undefined;
      return record(state, `${enemy.label} disabled. This route will remain clear.`, { defeated: [...state.defeated, enemy.id],...(encounters?{encounters}:{}) });
    }
    case 'accept': case 'accept-job':
      if (state.zone!=='valley' || state.player.hp<=0 || state.jobAccepted || !nearby(state, worldEndpoints(state).settlement)) return state;
      return record(state, 'Accepted: Water for Mossbank. Repair the pump with 3 scrap and 1 core, or deliver 3 water canisters.', { jobAccepted: true });
    case 'repair': case 'repair-pump':
      if (state.zone!=='valley' || state.player.hp<=0 || state.waterRestored || !nearby(state, worldEndpoints(state).pump) || state.inventory.scrap < 3 || state.inventory.core < 1) return state;
      return record(state, 'Pump repaired: 3 scrap and 1 core consumed. Water flows to Mossbank; the settlement is restored.', {
        inventory: { ...state.inventory, scrap: state.inventory.scrap - 3, core: state.inventory.core - 1 }, waterRestored: true,
      });
    case 'deliver': case 'deliver-water':
      if (state.zone!=='valley' || state.player.hp<=0 || state.waterRestored || !nearby(state, worldEndpoints(state).settlement) || state.inventory.water < 3) return state;
      return record(state, 'Delivered 3 water canisters. Mossbank’s reservoir is replenished; the settlement is restored.', {
        inventory: { ...state.inventory, water: state.inventory.water - 3 }, waterRestored: true,
      });
    case 'tick': {
      if (!Number.isFinite(action.dt) || action.dt <= 0 || state.player.hp <= 0) return state;
      const waterworks=state.zone==='valley'?flow(state.waterworks,action.dt):state.waterworks;
      const settlement=state.zone==='valley'?advanceSettlement(state.settlement,waterworks.delivered-state.waterworks.delivered,action.dt):state.settlement;
      const caveWater=state.caveWater?(state.caveSupply?state.caveWater:advanceCaveWater(state.caveWater,action.dt)):undefined,ecology=state.ecology?advanceEcology(state.ecology,action.dt):undefined;
      const next=waterworks===state.waterworks&&settlement===state.settlement&&caveWater===state.caveWater&&ecology===state.ecology?state:{...state,waterworks,settlement,...(caveWater?{caveWater}:{}),...(ecology?{ecology}:{}),revision:state.revision+1};
      const threat = !state.encounters&&activeObjects(state).some(object => object.kind === 'enemy' && !state.defeated.includes(object.id) && Math.hypot(state.player.x - object.x, state.player.z - object.z,worldHeight(state,state.player.x,state.player.z)-(object.y??0)) < 5);
      if (!threat) return next;
      const hp = Math.max(0, state.player.hp - Math.min(action.dt, 1) * 8);
      if (hp === 0) return record(next, 'Suit integrity depleted. Emergency recall requested.', { player: { ...state.player, hp } });
      return { ...next, player: { ...state.player, hp }, revision: next.revision + 1 };
    }
    default: return state;
  }
}
/** Causal resource feasibility counts only finite recoverable stock, never NPC stores as player inventory. */
export function causalContext(state:State):CausalContext {
 const all=allWorldObjects(state),recoverable={...state.inventory},cost=machineCosts(state.waterworks),gear=equipmentCost(state.equipment),caveCost=caveWaterCost(state.caveWater),craftCost=economyCost(state.economy),supplyCost=caveSupplyCost(state.caveSupply);
 const collected={scrap:0,core:0};for(const o of all)if((o.kind==='scrap'||o.kind==='core')&&state.collected.includes(o.id))collected[o.kind]++;
 const restorationCost=restorationPlayerCost(state.restoration),lifeCost=townLifePlayerCost(state.townLife),townNet=townBalance(state.town).net;const historicalPumpRepaired=state.waterRestored&&collected.scrap+commonsTradeExports(state.causal,state.seed)-state.inventory.scrap-cost.scrap-gear.scrap-caveCost.scrap-craftCost.scrap-supplyCost.scrap-(state.causal?.playerSpent.scrap??0)-townNet.scrap-lifeCost.scrap-restorationCost.scrap===3&&collected.core-state.inventory.core-cost.core-gear.core-caveCost.core-(state.causal?.playerSpent.core??0)-townNet.core-lifeCost.core-restorationCost.core===1;
 recoverable.scrap+=cost.scrap+gear.scrap+economyRecoverableScrap(state.economy)+(state.restoration?.machine?Math.max(0,restorationCost.scrap-(state.restoration.spent.scrap??0)-2):0);recoverable.core+=cost.core+gear.core+(state.restoration?.machine?Math.max(0,restorationCost.core-(state.restoration.spent.core??0)):0);
 for(const o of all)if((o.kind==='scrap'||o.kind==='core'||o.kind==='water')&&!state.collected.includes(o.id))recoverable[o.kind]++;
 return {...(state.caveSupply&&state.caveWater?{caveSupply:caveSupplyContext(state.caveSupply,state.caveWater)}:{}),historicalPumpRepaired,seed:state.seed,defeated:state.defeated,inventory:state.inventory,player:state.player,zone:state.zone,networkOverflow:state.settlement.spilled,networkWorking:supplyWorking(state.waterworks),recoverableScrap:recoverable.scrap,recoverableCore:recoverable.core,recoverableWater:recoverable.water};
}
export function applyAction(state:State,action:Action,restorationActors:readonly HabitatActor[]=[{x:state.player.x,z:state.player.z}],restorationOperator:State['player']=state.player):State {
 if(action.type==='tick'&&(!Number.isFinite(action.dt)||action.dt<=0||state.player.hp<=0))return state;
 let next=applyWorldAction(state,action,restorationActors);
 if(action.type==='tick'&&next.restoration){const restoration=advanceRestoration(next.restoration,worldRestorationPlan(next.seed),action.dt,{actors:restorationActors,player:next.zone==='valley'?restorationOperator:{...restorationOperator,hp:0}});if(restoration!==next.restoration)next={...next,restoration,revision:next.revision+1};}
 // Active-play town time is independent of legacy/regional production clocks. No offline catch-up.
 if(action.type==='tick'&&next.townLife){
  let townLife=next.townLife,townDirector=next.townDirector,workshopConstruction=next.workshopConstruction;
  const townActors=restorationActors.map((a,index)=>({id:`world-actor-${index}`,x:a.x,z:a.z,feetY:a.y??6}));
  // Observe every actual half-second town boundary, including coarse room polls.
  // Splitting at both bounded accumulators avoids missed recovery/re-offer facts.
  if((townDirector||workshopConstruction)&&action.dt<=60){let remaining=action.dt;for(let n=0;remaining>1e-10&&n<242;n++){
   const dt=Math.min(remaining,.5-townLife.accumulator,townDirector?.accumulator===undefined ? .5 : .5-townDirector.accumulator);
   if(workshopConstruction?.status==='building'){const receipt=advanceTownLifeWithWorkshopWork(townLife,dt,workshopConstruction.workerId,undefined,townActors);townLife=receipt.life;workshopConstruction=advanceWorkshopConstruction(workshopConstruction,receipt.workSeconds);}
   else townLife=advanceTownLife(townLife,dt,undefined,townActors);
   if(townDirector)townDirector=advanceTownDirector(townDirector,townLife,dt);remaining=Math.max(0,remaining-dt);
  }}
  else townLife=advanceTownLife(townLife,action.dt,undefined,townActors);
  if(townLife!==next.townLife||townDirector!==next.townDirector||workshopConstruction!==next.workshopConstruction)next={...next,townLife,...(townDirector?{townDirector}:{}),...(workshopConstruction?{workshopConstruction}:{}),revision:next.revision+1};
 }
 if(action.type==='tick'&&next.frontierTrade){const frontierTrade=advanceRegionalTrade(next.frontierTrade,action.dt);if(frontierTrade!==next.frontierTrade)next={...next,frontierTrade,revision:next.revision+1};}
 if(action.type==='tick'&&next.frontierSupply){const frontierSupply=advanceRegionalSupply(next.frontierSupply,action.dt);if(frontierSupply!==next.frontierSupply)next={...next,frontierSupply,revision:next.revision+1};}
 // Food observes only accepted supply output after the same bounded active tick.
 if(action.type==='tick'&&next.frontierFood){const frontierFood=advanceRegionalFood(next.frontierFood,action.dt,next);if(frontierFood!==next.frontierFood)next={...next,frontierFood,revision:next.revision+1};}
 // Coupled overlays either commit together or retain the complete prior world.
 // A refused food transition must never strand newer water/freight beside it.
 if(action.type==='tick'&&Object.hasOwn(next,'frontierFood')&&!validRegionalFood(next.frontierFood,next))return state;
 if(state.generation!==2||!state.causal)return next;
 if(action.type==='tick'){
  if(next.caveSupply&&next.caveWater){
   const advanced=advanceCaveSettlement(next.caveWater,next.caveSupply,next.causal!,causalContext(next),action.dt);
   if(advanced.cave===next.caveWater&&advanced.supply===next.caveSupply&&advanced.causal===next.causal)return next;
   next={...next,caveWater:advanced.cave,caveSupply:advanced.supply,causal:advanced.causal};
   const economy=next.economy?advanceEconomy(next.economy,advanced.causal):undefined;
   return {...next,...(economy?{economy}:{}),revision:next.revision+1};
  }
  const causal=advanceCausal(next.causal!,causalContext(next),action.dt),economy=next.economy?advanceEconomy(next.economy,causal):undefined;return causal===next.causal&&economy===next.economy?next:{...next,causal,...(economy?{economy}:{}),revision:next.revision+1};
 }
 if(next===state||action.type==='move')return next;
 let causal=next.causal!;const ctx=causalContext(next);
 if(action.type==='attack')causal=noteCausalWorldAction(causal,ctx,{kind:'defeat',targetId:action.id});
 else if(action.type==='repair'||action.type==='repair-pump')causal=noteCausalWorldAction(causal,ctx,{kind:'source'});
 else if(action.type==='build'&&!supplyWorking(state.waterworks)&&supplyWorking(next.waterworks))causal=noteCausalWorldAction(causal,ctx,{kind:'network'});
 else causal=reconcileCausal(causal,ctx);
 return causal===next.causal?next:{...next,causal};
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function numberIn(value: unknown, min: number, max: number): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max; }
function ids(value: unknown, allowed: string[]): value is string[] {
  return Array.isArray(value) && value.length <= allowed.length && value.every(id => typeof id === 'string' && allowed.includes(id)) && new Set(value).size === value.length;
}
export function validateSave(value: unknown): value is State {
  if (!object(value) || value.schemaVersion !== 6 || (value.generation !== 1 && value.generation !== 2) || !seedOK(value.seed)) return false;
  if(Object.hasOwn(value,'regional')&&(!object(value.regional)||value.generation!==2||value.regional.version!==1||Reflect.ownKeys(value.regional).length!==1||!Object.hasOwn(value.regional,'version')||![Object.prototype,null].includes(Object.getPrototypeOf(value.regional))))return false;
  const regional=value.regional as State['regional'];
  if(Object.hasOwn(value,'townLife')&&(!regional||value.generation!==2||!validTownLife(value.townLife,value.seed)))return false;
  if(Object.hasOwn(value,'workshopConstruction')&&(!regional||!value.townLife||!validWorkshopConstruction(value.workshopConstruction,value.seed)||(value.workshopConstruction as WorkshopConstructionState).materialsPaid!==(value.townLife as TownLifeState).workshopSpent))return false;
  if(!Object.hasOwn(value,'workshopConstruction')&&((value.townLife as TownLifeState|undefined)?.workshopSpent??0)!==0)return false;
  if(Object.hasOwn(value,'restoration')&&(!regional||!validRestoration(value.restoration,worldRestorationPlan(value.seed))))return false;
  if(Object.hasOwn(value,'restorationCare')&&(!regional||!value.restoration||!value.townLife||!validRestorationCare(value.restorationCare,value.restoration as RestorationState,value.townLife as TownLifeState)))return false;
  if(!Object.hasOwn(value,'restorationCare')&&(((value.restoration as RestorationState|undefined)?.sites.some(site=>(site.careExported??0)>0)??false)||((value.townLife as TownLifeState|undefined)?.habitatCare?.received??0)>0))return false;
  if(Object.hasOwn(value,'townDirector')&&(!regional||!value.townLife||!validTownDirector(value.townDirector,value.townLife as TownLifeState)||Object.entries(TOWN_DIRECTOR_DEFAULTS).some(([k,v])=>(value.townDirector as TownDirectorState).tuning[k as keyof typeof TOWN_DIRECTOR_DEFAULTS]!==v)))return false;
  if(Object.hasOwn(value,'town')&&(!regional||value.generation!==2||!validTownState(value.town)))return false;
  if(Object.hasOwn(value,'wilderness')&&!validWildernessState(value.wilderness,{generation:value.generation,seed:value.seed,...(regional?{regional}:{})}))return false;
  if(Object.hasOwn(value,'frontierTrade')&&(!regional||value.generation!==2||!validRegionalTrade(value.frontierTrade,value as unknown as State)))return false;
  if(Object.hasOwn(value,'frontierSupply')&&(!regional||value.generation!==2||!validRegionalSupply(value.frontierSupply,value as unknown as State)))return false;
  if(Object.hasOwn(value,'frontierFood')&&(!regional||value.generation!==2||!validRegionalFood(value.frontierFood,value as unknown as State)))return false;
  if(!validGenerationManifest(value.generationManifest)||value.generationManifest.domains.valley!==value.generation||!validMachine(value.waterworks))return false;
  if(!validSettlement(value.settlement,value.waterworks)||!validJobs(value.jobs,value.settlement,value.waterworks))return false;
  if(value.equipment!==undefined&&!validEquipment(value.equipment))return false;
  if(value.traversal!==undefined&&!validTraversal(value.traversal,{generation:value.generation,seed:value.seed,...(regional?{regional}:{})}))return false;
  if(value.encounters!==undefined&&!validEncounters(value.encounters,encounterSeeds(value as unknown as State),Array.isArray(value.defeated)?value.defeated as string[]:[],(zone,x,z)=>worldHeight({generation:value.generation as number,seed:value.seed as number,zone},x,z)))return false;
  if(value.zone!=='valley'&&value.zone!=='dungeon'&&value.zone!=='cave')return false;
  if(value.caveWater!==undefined&&!validCaveWater(value.caveWater,value.seed))return false;
  if(value.zone==='cave'&&!value.caveWater)return false;
  if(value.caveSupply!==undefined&&(value.generation!==2||!value.caveWater||!value.causal||!validCaveSupply(value.caveSupply,value.seed,value.caveWater as CaveWaterState)))return false;
  if(object(value.causal)&&Object.hasOwn(value.causal,'commonsTrade')&&!validCommonsTrade(value.causal.commonsTrade,value.seed,value.causal as unknown as CausalState))return false;
  const exports=commonsTradeExports(value.causal as CausalState|undefined,value.seed);
  const identity={generation:value.generation as 1|2,seed:value.seed,zone:value.zone as State['zone'],...(regional?{regional}:{})};const all=allWorldObjects(identity);
  const bound=worldBound(identity),available={scrap:0,core:0,water:0};for(const o of all)if(o.kind==='scrap'||o.kind==='core'||o.kind==='water')available[o.kind]++;available.scrap+=exports;const townTotals=townBalance(value.town as TownState|undefined);for(const k of ['scrap','core','water'] as const)available[k]+=townTotals.exported[k];
  const p = value.player, i = value.inventory;
  if (!object(p) || !numberIn(p.x, -bound, bound) || !numberIn(p.z, -bound, bound) || !numberIn(p.hp, 0, 100)) return false;
  if (!object(i) || !(['scrap', 'core', 'water'] as const).every(key => numberIn(i[key], 0, available[key]) && Number.isInteger(i[key]))) return false;
  if (!ids(value.collected, all.filter(o => ['scrap', 'core', 'water'].includes(o.kind)).map(o => o.id)) || !ids(value.defeated, all.filter(o=>o.kind==='enemy').map(o=>o.id))) return false;
  if (typeof value.waterRestored !== 'boolean' || typeof value.jobAccepted !== 'boolean' || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0) return false;
  if (!Array.isArray(value.events) || value.events.length > 20 || !value.events.every(e => typeof e === 'string' && e.length <= 1000)) return false;
  // A save must account for every collected resource and exactly one quest payment.
  const collected = value.collected;
  const totals = { scrap: 0, core: 0, water: 0 };
  for (const id of collected) { const resource = all.find(o => o.id === id)!.kind as keyof typeof totals; totals[resource]++; }
  if(value.generation===1&&value.causal!==undefined)return false;
  if(value.ecology!==undefined&&(value.generation!==2||!validEcology(value.ecology,value.seed)))return false;
  if(value.economy!==undefined&&(!value.causal||!validEconomy(value.economy,value.seed,value.causal as CausalState)))return false;
  if(value.causal!==undefined&&!validCausal(value.causal,causalContext(value as unknown as State)))return false;
  const causalCost=value.causal?(value.causal as CausalState).playerSpent:{scrap:0,core:0,water:0};
  const cost=machineCosts(value.waterworks),gear=equipmentCost(value.equipment as EquipmentState|undefined),caveCost=caveWaterCost(value.caveWater as CaveWaterState|undefined),craftCost=economyCost(value.economy as EconomyState|undefined),gardenCost=ecologyCost(value.ecology as EcologyState|undefined),supplyCost=caveSupplyCost(value.caveSupply as CaveSupplyState|undefined);
  const restorationCost=restorationPlayerCost(value.restoration as RestorationState|undefined),lifeCost=townLifePlayerCost(value.townLife as TownLifeState|undefined);
  const spent = { scrap: totals.scrap + exports - (i.scrap as number)-cost.scrap-gear.scrap-caveCost.scrap-craftCost.scrap-supplyCost.scrap-causalCost.scrap-townTotals.net.scrap-lifeCost.scrap-restorationCost.scrap, core: totals.core - (i.core as number)-cost.core-gear.core-caveCost.core-causalCost.core-townTotals.net.core-lifeCost.core-restorationCost.core, water: totals.water - (i.water as number)-causalCost.water-gardenCost.water-regionalFoodCost(value.frontierFood as RegionalFoodState|undefined).water-townTotals.net.water-lifeCost.water-restorationCost.water };
  return value.waterRestored
    ? (spent.scrap === 3 && spent.core === 1 && spent.water === 0) || (spent.scrap === 0 && spent.core === 0 && spent.water === 3)
    : spent.scrap === 0 && spent.core === 0 && spent.water === 0;
}
export function serializeSave(state: State): string {
  if (!validateSave(state)) throw new Error('Cannot save invalid valley state');
  return JSON.stringify(state);
}
export function parseSave(text: string): State | null {
  try {
    let parsed: unknown = JSON.parse(text);
    if(!object(parsed))return null;
    const legacyValley=parsed.schemaVersion===1;
    if(parsed.schemaVersion===1||parsed.schemaVersion===2)
      parsed={...parsed,schemaVersion:3,waterworks:{parts:[],links:[],stored:0,extracted:0,delivered:0,drained:0},zone:legacyValley?'valley':parsed.zone};
    if(object(parsed)&&parsed.schemaVersion===3){
      if(!validLegacyMachine(parsed.waterworks))return null;
      parsed={...parsed,schemaVersion:4,settlement:emptySettlement(parsed.waterworks.delivered),jobs:emptyJobs()};
    }
    if(object(parsed)&&parsed.schemaVersion===4){
      const waterworks=migrateLegacyMachine(parsed.waterworks);if(!waterworks)return null;
      parsed={...parsed,schemaVersion:5,waterworks};
    }
    if(object(parsed)&&parsed.schemaVersion===5)parsed={...parsed,schemaVersion:6,generationManifest:GENERATION_MANIFEST};
    if(object(parsed)&&Object.hasOwn(parsed,'wilderness'))parsed={...parsed,wilderness:immutableWildernessState(parsed.wilderness,parsed as unknown as State)};
    if(object(parsed)&&Object.hasOwn(parsed,'frontierTrade'))parsed={...parsed,frontierTrade:immutableRegionalTrade(parsed.frontierTrade,parsed as unknown as State)};
    if(object(parsed)&&Object.hasOwn(parsed,'frontierSupply'))parsed={...parsed,frontierSupply:immutableRegionalSupply(parsed.frontierSupply,parsed as unknown as State)};
    if(object(parsed)&&Object.hasOwn(parsed,'frontierFood'))parsed={...parsed,frontierFood:immutableRegionalFood(parsed.frontierFood,parsed as unknown as State)};
    if(object(parsed)&&Object.hasOwn(parsed,'workshopConstruction'))parsed={...parsed,workshopConstruction:immutableWorkshopConstruction(parsed.workshopConstruction,parsed.seed as number)};
    if(object(parsed)&&Object.hasOwn(parsed,'townLife'))parsed={...parsed,townLife:immutableTownLife(parsed.townLife,parsed.seed as number)};
    if(object(parsed)&&Object.hasOwn(parsed,'restoration'))parsed={...parsed,restoration:immutableRestoration(parsed.restoration,worldRestorationPlan(parsed.seed as number))};
    if(object(parsed)&&Object.hasOwn(parsed,'restorationCare'))parsed={...parsed,restorationCare:immutableRestorationCare(parsed.restorationCare,parsed.restoration as RestorationState,parsed.townLife as TownLifeState)};
    if(object(parsed)&&Object.hasOwn(parsed,'townDirector'))parsed={...parsed,townDirector:immutableTownDirector(parsed.townDirector,parsed.townLife as TownLifeState)};
    if(!validateSave(parsed))return null;
    if(parsed.generation===2&&!parsed.causal){
      const totals={scrap:0,core:0};for(const o of allWorldObjects(parsed))if((o.kind==='scrap'||o.kind==='core')&&parsed.collected.includes(o.id))totals[o.kind]++;
      const restorationCost=restorationPlayerCost(parsed.restoration),cost=machineCosts(parsed.waterworks),gear=equipmentCost(parsed.equipment),caveCost=caveWaterCost(parsed.caveWater),craftCost=economyCost(parsed.economy),lifeCost=townLifePlayerCost(parsed.townLife),townNet=townBalance(parsed.town).net,repaired=parsed.waterRestored&&totals.scrap-parsed.inventory.scrap-cost.scrap-gear.scrap-caveCost.scrap-craftCost.scrap-townNet.scrap-lifeCost.scrap-restorationCost.scrap===3&&totals.core-parsed.inventory.core-cost.core-gear.core-caveCost.core-townNet.core-lifeCost.core-restorationCost.core===1;
      const causal=createCausalState(parsed.seed,repaired,parsed.settlement.spilled);causal.networkEverWorking=supplyWorking(parsed.waterworks);
      parsed={...parsed,causal:reconcileCausal(causal,causalContext(parsed))};
    }
    if(object(parsed)&&Object.hasOwn(parsed,'restoration'))parsed={...parsed,restoration:immutableRestoration(parsed.restoration,worldRestorationPlan(parsed.seed as number))};
    if(object(parsed)&&Object.hasOwn(parsed,'townDirector'))parsed={...parsed,townDirector:immutableTownDirector(parsed.townDirector,parsed.townLife as TownLifeState)};
    if(!validateSave(parsed))return null;
    if(parsed.generation===2&&parsed.caveWater&&parsed.caveSupply===undefined)parsed={...parsed,caveSupply:createCaveSupply(parsed.seed,parsed.caveWater)};
    if(object(parsed)&&Object.hasOwn(parsed,'restoration'))parsed={...parsed,restoration:immutableRestoration(parsed.restoration,worldRestorationPlan(parsed.seed as number))};
    if(object(parsed)&&Object.hasOwn(parsed,'townDirector'))parsed={...parsed,townDirector:immutableTownDirector(parsed.townDirector,parsed.townLife as TownLifeState)};
    if(!validateSave(parsed))return null;
    if(legacyValley&&(parsed.collected.some(id=>id.startsWith('dungeon:'))||parsed.defeated.some(id=>id.startsWith('dungeon:'))))return null;
    if(parsed.zone==='dungeon'&&!dungeonRestoreClear(worldDungeon(parsed),parsed.player.x,parsed.player.z,RESTORE_CAPSULE_RADIUS))return {...parsed,player:{...parsed.player,...dungeonSpawn(parsed)}};
    if(parsed.zone==='cave'&&parsed.caveWater){const safe=safeCavePosition(parsed.caveWater,parsed.player);if(safe.x!==parsed.player.x||safe.z!==parsed.player.z)return {...parsed,player:{...parsed.player,...safe}};}
    if(parsed.zone==='valley'){const safe=safeWorldSpawn(parsed,parsed.player);if(safe.x!==parsed.player.x||safe.z!==parsed.player.z)return {...parsed,player:{...parsed.player,...safe}};}
    return parsed;
  } catch { return null; }
}

/** Optional encounter pack never changes pinned terrain, identities or legacy save foundations. */
export function encounterSeeds(s:Pick<State,'generation'|'seed'>){return [...worldObjects(s).filter(o=>o.kind==='enemy').map(o=>({...o,zone:'valley'})),...worldDungeon(s).objects.filter(o=>o.kind==='enemy').map(o=>({...o,zone:'dungeon'}))];}
export function enableEncounters(s:State):State{return s.encounters?s:{...s,encounters:createEncounters(encounterSeeds(s),s.defeated)};}
export function encounterObjects(s:State):readonly WorldObject[]{const objects=activeObjects(s);return !s.encounters?objects:objects.map(o=>{const e=s.encounters!.enemies.find(e=>e.id===o.id);return e?{...o,x:e.x,y:e.y,z:e.z}:o;});}
/** The accepted combo, never a UI click or render pose, calls this boundary. */
export function commitEncounterHit(s:State,id:string,damage:number):State {
 if(!s.encounters)return s;const enemy=s.encounters.enemies.find(e=>e.id===id&&e.zone===s.zone);if(!enemy||!nearby(s,enemy))return s;
 const result=hitEncounter(s.encounters,id,damage);if(result.state===s.encounters)return s;
 let next:State={...s,encounters:result.state,revision:s.revision+1};
 if(result.events.some(e=>e.type==='defeated')){next=record(next,'Sentry disabled. This route will remain clear.',{defeated:[...s.defeated,id]});if(next.causal)next={...next,causal:noteCausalWorldAction(next.causal,causalContext(next),{kind:'defeat',targetId:id})};}
 return next;
}
export function stepWorldEncounters(s:State,dt:number,context:Pick<EncounterContext,'obstacles'>&{playerY?:number}):{state:State;events:EncounterEvent[]} {
 if(!s.encounters||s.player.hp<=0)return {state:s,events:[]};
 const result=advanceEncounters(s.encounters,dt,{zone:s.zone,players:[{...s.player,y:context.playerY??worldHeight(s,s.player.x,s.player.z),id:'solo'}],obstacles:context.obstacles,height:(x,z)=>worldHeight(s,x,z),defeated:s.defeated});
 const damage=result.events.reduce((n,e)=>n+(e.type==='damage'&&e.playerId==='solo'?e.damage:0),0);
 return {state:{...s,encounters:result.state,player:{...s.player,hp:Math.max(0,s.player.hp-damage)},revision:s.revision+1},events:result.events};
}

export function allWorldObjects(s:Pick<State,'generation'|'seed'>):readonly WorldObject[]{return [...worldObjects(s),...worldDungeon(s).objects,...naturalCave(s.seed).objects];}

export function enableEconomy(s:State):State{return s.generation!==2||!s.causal||s.economy?s:{...s,economy:createEconomyState(s.seed,s.causal)};}

/** Optional garden pack starts now, never backfills old elapsed time or replenishes present stock. */
export function enableEcology(s:State):State{return s.generation!==2||s.ecology!==undefined?s:{...s,ecology:createEcologyState(s.seed)};}

/** Add outfall accounting only once; all prior cave output remains an excluded baseline. */
export function enableCaveSupply(s:State):State{return s.generation!==2||!s.causal||!s.caveWater||s.caveSupply!==undefined?s:{...s,caveSupply:createCaveSupply(s.seed,s.caveWater)};}

/** Optional only: absent data is activated once; malformed present data is never reset. */
export function enableCommonsTrade(s:State):State{return s.generation!==2||!s.causal||Object.hasOwn(s.causal,'commonsTrade')?s:{...s,causal:{...s.causal,commonsTrade:createCommonsTrade(s.seed,s.causal)}};}
/** Optional recurring requests observe only new relief/consumption after this baseline. */
export function enableWaterRequests(s:State):State{return s.generation!==2||!s.causal||Object.hasOwn(s.causal,'waterRequests')?s:{...s,causal:{...s.causal,waterRequests:createWaterRequests(s.seed,s.causal)}};}

/** Optional regional pack: pinned macro IDs and earlier valley flavors never move. */
export function enableRegionalSupply(s:State):State{return !s.regional||s.generation!==2||Object.hasOwn(s,'frontierSupply')?s:{...s,frontierSupply:createRegionalSupply(s.seed,2)};}

/** Trade extends a regional save once; existing V31 collectors are never reset. */
export function enableRegionalTrade(s:State,version:1|2=2):State{return !s.regional||s.generation!==2||Object.hasOwn(s,'frontierTrade')?s:{...s,frontierTrade:createRegionalTrade(s.seed,version)};}

/** Food starts with a fresh buffer and current collector baseline only after its
 * existing supply/freight dependencies are available. Present malformed data is
 * retained for strict rejection, never treated as an absent optional pack. */
export function enableRegionalFood(s:State,version:1|2=2):State {
 if(!s.regional||s.generation!==2||Object.hasOwn(s,'frontierFood')||!s.frontierSupply||!s.frontierTrade||!validRegionalTrade(s.frontierTrade,s)||!validRegionalSupply(s.frontierSupply,s))return s;
 return {...s,frontierFood:createRegionalFood(s.seed,s.frontierSupply,s.frontierTrade,version)};
}
/** Physical authority is passed separately, never accepted from action JSON. */
export function commitRegionalFood(s:State,command:RegionalFoodCommand,authority:{feetY?:number;grounded?:boolean}={}):State {
 if(!s.regional||s.generation!==2||!s.frontierFood)return s;
 const result=applyRegionalFoodCommand(s.frontierFood,{...s,feetY:authority.feetY??worldHeight(s,s.player.x,s.player.z),grounded:authority.grounded??true},command);
 return result.state===s.frontierFood?s:record(s,result.message,{frontierFood:result.state,...(command.type==='irrigate-farm'?{inventory:{...s.inventory,water:s.inventory.water-1}}:{})});
}

/** Physics authority is deliberately separate from the serializable action contract. */
export interface WildernessGatherAuthority {feetY?:number;obstacles?:readonly WildernessQueryObstacle[];grounded?:boolean}
export function wildernessGatherContext(s:State,authority:WildernessGatherAuthority={}):WildernessGatherContext {
 const plan=s.generation===2?worldValley(s.seed):undefined;
 const shapes=plan?[...plan.bridges,...plan.foundations,...plan.infrastructure,...plan.buildings.flatMap(building=>building.plan.shapes)]:worldWorkshop(s.seed).plan.shapes;
 const fixed:WildernessQueryObstacle[]=shapes.filter(shape=>shape.solid).map(shape=>({x:shape.center.x,y:shape.center.y,z:shape.center.z,hx:shape.half.x,hy:shape.half.y,hz:shape.half.z}));
 if(!plan)for(const [x,z]of [[-20,-7],[-12,-8],[-23,1],[17,-19],[24,-19],[25,-11]])fixed.push({x:x!,z:z!,hx:1.9,hz:1.7,hy:2});
 const pump=worldEndpoints(s).pump;
 fixed.push({x:pump.x,y:worldHeight({...s,zone:'valley'},pump.x,pump.z)+1.5,z:pump.z,hx:1,hz:1,hy:1.5},...machineWorldObstacles(s),...(s.frontierSupply?regionalSupplyObstacles(s.seed,s.frontierSupply):[]),...(s.frontierTrade?regionalTradeObstacles(s.seed,s.frontierTrade):[]));
 const ground=Number.isFinite(s.player.x)&&Number.isFinite(s.player.z)?worldHeight(s,s.player.x,s.player.z):NaN;
 return {generation:s.generation,seed:s.seed,...(s.regional?{regional:s.regional}:{}),zone:s.zone,player:s.player,...(Object.hasOwn(s,'wilderness')?{wilderness:s.wilderness!}:{}),feetY:authority.feetY??ground,grounded:authority.grounded??true,obstacles:[...fixed,...(authority.obstacles??[])]};
}
/** Solo and co-op commit through the same finite source ledger using their accepted physical pose. */
export function commitWildernessGather(s:State,id:string,authority:WildernessGatherAuthority={}):State {
 if(s.zone!=='valley'||s.player.hp<=0)return s;
 const wilderness=gatherWilderness(wildernessGatherContext(s,authority),id);
 if(!wilderness||wilderness===s.wilderness)return s;
 const feature=wildernessFeatureById(s,id)!;
 const message=feature.kind==='tree'?'Gathered 1 deadwood. The living tree remains.':feature.removable?'Gathered 1 stone. The loose rock has been cleared.':'Gathered 1 stone chip. The outcrop remains.';
 return record(s,message,{wilderness});
}

export function enableStartingTown(s:State):State{
 if(!s.regional)return s;
 if(Object.hasOwn(s,'town')&&!validTownState(s.town)||Object.hasOwn(s,'townLife')&&!validTownLife(s.townLife,s.seed)||Object.hasOwn(s,'townDirector')&&(!s.townLife||!validTownDirector(s.townDirector,s.townLife)))throw RangeError('Invalid existing town state cannot be replaced.');
 const town=Object.hasOwn(s,'town')?s.town!:createTownState(),townLife=Object.hasOwn(s,'townLife')?s.townLife!:createTownLifeOpening(s.seed),townDirector=Object.hasOwn(s,'townDirector')?s.townDirector!:TOWN_DIRECTOR_ENGINE.create(townLife);
 return town===s.town&&townLife===s.townLife&&townDirector===s.townDirector?s:{...s,town,townLife,townDirector};
}

/** Shared intervention authority; only the runtime supplies accepted actor positions. */
export function commitTownLife(state:State,command:TownLifeCommand,actors:readonly TownActor[]=[{id:'solo',x:state.player.x,z:state.player.z,feetY:6}]):State {
 if(!state.regional||!state.townLife)return state;
 const target=townLifeInteractionTarget(state.townLife,command,actors);if(!target)return state;
 const result=applyTownLifeCommand(state.townLife,state,command,target);if(!result)return state;
 const townDirector=state.townDirector?noteTownDirectorContribution(state.townDirector,state.townLife,result.life,command):undefined;
 return record(state,result.message,{townLife:result.life,inventory:result.inventory,...(townDirector?{townDirector}:{})});
}

export function worldRestorationPlan(seed:number){return restorationPlan(seed,habitatSiteDescriptors(seed));}
/** Only absence opts in; current invalid data is rejected by the save validator. */
export function enableRestoration(s:State):State{return !s.regional||Object.hasOwn(s,'restoration')?s:{...s,restoration:RESTORATION_ENGINE.create(worldRestorationPlan(s.seed))};}

/** Reserve all final solids at payment, including durable saved movable bodies. */
export function commitWorkshopConstruction(state:State,command:WorkshopConstructionCommand,actors:readonly HabitatActor[]=[]):State {
 if(!state.regional||!state.townLife)return state;
 const result=applyWorkshopConstruction(state.workshopConstruction,state.townLife,{...state,actors},command);if(!result)return state;
 if(command.kind==='build')for(const body of traversalBodies(state))for(const solid of workshopConstructionBoxes(result.construction).filter(b=>b.solid)){
  if(Math.abs(body.x-solid.center.x)<body.hx+solid.half.x&&Math.abs(body.y-solid.center.y)<body.hy+solid.half.y&&Math.abs(body.z-solid.center.z)<body.hz+solid.half.z)return state;
 }
 return record(state,result.message,{workshopConstruction:result.construction,townLife:result.life,player:{...state.player,hp:result.hp}});
}

/** Host/local motion owns elevation; cargo and conservation remain model-owned. */
export function commitRestorationCare(state:State,command:RestorationCareCommand,feetY=worldHeight(state,state.player.x,state.player.z)):State {
 if(!state.regional||!state.restoration||!state.townLife)return state;
 const result=applyRestorationCare(state.restorationCare,state.restoration,worldRestorationPlan(state.seed),state.townLife,{seed:state.seed,zone:state.zone,player:{...state.player,feetY}},command);
 return result?record(state,result.message,{restorationCare:result.care,restoration:result.restoration,townLife:result.life}):state;
}
