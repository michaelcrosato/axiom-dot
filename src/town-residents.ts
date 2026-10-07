import {townRoadRoute} from './town-road-route.ts';
import type {TownPlan} from './starting-town.ts';
/** Pure, bounded population model. Existing named quest workers are not included. */
import {seedSample} from './procedural.ts';

export const TOWN_RESIDENT_COUNT = 100;
export const TOWN_HOUSEHOLD_VERSION = 1;
export const TOWN_HOUSE_COUNT = 40;
export type TownHouseholdKind = 'single' | 'couple' | 'family';
export type TownRelationshipKind = 'partner' | 'parent' | 'adult child' | 'sibling';
export interface TownRelationship {readonly residentId: string; readonly kind: TownRelationshipKind}
export interface TownHousehold {
  readonly id: string;
  readonly homeIndex: number;
  readonly address: string;
  readonly kind: TownHouseholdKind;
  readonly memberIds: readonly string[];
}
export interface TownRoutinePhase {
  /** Local seconds, before phaseOffset; the complete loop is exactly 480 seconds. */
  readonly start: number;
  readonly end: number;
  readonly activity: TownResidentActivity;
  readonly moving: boolean;
  readonly location: 'home' | 'work' | 'square';
  readonly description: string;
}
export const TOWN_RESIDENT_CYCLE_SECONDS = 480;
export const TOWN_RESIDENT_CACHE_LIMIT = 4;
export const TOWN_RESIDENT_KEEPER_ROLES = Object.freeze([
  'provisioner', 'smith', 'salvager', 'cook', 'innkeeper', 'apothecary', 'outfitter',
] as const);
export type TownResidentRole = typeof TOWN_RESIDENT_KEEPER_ROLES[number]
  | 'gardener' | 'courier' | 'carpenter' | 'weaver' | 'lamplighter' | 'mason'
  | 'bookbinder' | 'potter' | 'orchard tender' | 'waterworks assistant'
  | 'market porter' | 'repairer' | 'surveyor' | 'baker';
export type TownResidentHat = 'none' | 'cap' | 'brim' | 'hood';
export type TownResidentActivity = 'at home' | 'walking to work' | 'working'
  | 'walking to the square' | 'meeting neighbors' | 'walking home' | 'keeping shop'
  | 'eating' | 'resting' | 'washing' | 'relaxing' | 'gardening' | 'drawing water'
  | 'cooking' | 'crafting' | 'repairing' | 'receiving care';
export interface TownResident {
  readonly id: string;
  readonly index: number;
  readonly name: string;
  readonly role: TownResidentRole;
  readonly homeIndex: number;
  readonly workIndex: number;
  readonly address: string;
  readonly age: number;
  readonly householdId: string;
  readonly householdKind: TownHouseholdKind;
  readonly householdRole: 'sole resident' | 'partner' | 'parent' | 'adult child';
  readonly housemateIds: readonly string[];
  readonly relationships: readonly TownRelationship[];
  readonly backstory: string;
  readonly routine: readonly TownRoutinePhase[];
  readonly personality: string;
  readonly interest: string;
  readonly dialogue: readonly [string, string, string];
  readonly colors: Readonly<{tunic: number; skin: number; hair: number}>;
  /** Height multiplier, suitable for the existing resident body mesh. */
  readonly height: number;
  readonly hat: TownResidentHat;
  readonly keeper: boolean;
  readonly appearance: Readonly<{build:number;shoulders:number;legLength:number;coat:'tunic'|'apron'|'longcoat'|'vest';hairStyle:number;accessory:'none'|'satchel'|'pack'|'tool';accent:number;stride:number;swing:number;idle:number}>;
  /** Seconds added before wrapping the fixed 480-second routine. */
  readonly phaseOffset: number;
}
export interface TownResidentPlan {
  readonly layoutVersion?:number;
  readonly homes: readonly {readonly entry: Readonly<{x: number; z: number}>}[];
  readonly shops: readonly {readonly entry: Readonly<{x: number; z: number}>}[];
  readonly center: Readonly<{x: number; z: number}>;
}
export interface TownResidentPose {
  x: number;
  z: number;
  /** Y-axis yaw in radians: zero faces +z. */
  facing: number;
  activity: TownResidentActivity;
  moving: boolean;
  speed?: number;
  distance?: number;
  /** Stable ownership, including migration/temporary unresolved contact. */
  authoritativeMotion?: 1;
  /** Clearance health never changes which movement system owns this body. */
  contactResolved?: boolean;
  /** Accepted root trajectory over the most recent half-second authority step. */
  motionPath?: readonly {x:number;z:number;t:number}[];
}

/** Default rhythm. Inspect resident.routine for the actual personalized schedule. */
export const TOWN_RESIDENT_PHASES = Object.freeze([
  Object.freeze({start: 0, end: 96, activity: 'at home' as const, moving: false}),
  Object.freeze({start: 96, end: 185, activity: 'walking to work' as const, moving: true}),
  Object.freeze({start: 185, end: 305, activity: 'working' as const, moving: false}),
  Object.freeze({start: 305, end: 350, activity: 'walking to the square' as const, moving: true}),
  Object.freeze({start: 350, end: 400, activity: 'meeting neighbors' as const, moving: false}),
  Object.freeze({start: 400, end: 480, activity: 'walking home' as const, moving: true}),
]);

const FIRST_NAMES = [
  'Ada', 'Alden', 'Amara', 'Anika', 'Arlo', 'Beatrice', 'Bren', 'Celia',
  'Dara', 'Dev', 'Elian', 'Emery', 'Farah', 'Felix', 'Hana', 'Idris',
  'Iris', 'Jules', 'Kiran', 'Leona', 'Luca', 'Mae', 'Malik', 'Nadia',
  'Nico', 'Nora', 'Orin', 'Remy', 'Sana', 'Theo', 'Wren', 'Yara',
] as const;
const SURNAMES = [
  'Alder', 'Ashford', 'Bell', 'Birch', 'Brook', 'Calder', 'Cedar', 'Clarke',
  'Dale', 'Ellis', 'Fairway', 'Field', 'Finch', 'Fox', 'Gardner', 'Glen',
  'Hale', 'Hart', 'Hill', 'Lane', 'Marsh', 'Miller', 'Moss', 'North',
  'Oakley', 'Park', 'Reed', 'Rowan', 'Shaw', 'Stone', 'Vale', 'West',
] as const;
const ROLES: readonly TownResidentRole[] = [
  'gardener', 'courier', 'carpenter', 'weaver', 'lamplighter', 'mason',
  'bookbinder', 'potter', 'orchard tender', 'waterworks assistant',
  'market porter', 'repairer', 'surveyor', 'baker',
];
const PERSONALITIES = [
  'thoughtful', 'curious', 'cheerful', 'patient', 'practical', 'observant',
  'inventive', 'easygoing', 'candid', 'quietly enthusiastic', 'methodical', 'welcoming',
] as const;
const INTERESTS = [
  'garden seedlings', 'old maps', 'birdsong', 'wood carving', 'local history',
  'bread recipes', 'stargazing', 'river stones', 'mending clothes', 'board games',
  'pottery glazes', 'walking trails', 'seasonal flowers', 'puzzles', 'music',
  'rainwater gardens', 'storytelling', 'kite making', 'sketching', 'community meals',
] as const;
const GREETINGS = [
  'There is usually something worth noticing on the walk home.',
  'Have you found a favorite corner of town yet?',
  'A little company makes an ordinary morning better.',
  'I like to give a good idea time to settle.',
  'Small repairs make a surprising difference around here.',
  'The town changes a little every time I look closely.',
  'I have been trying a new way of doing things this week.',
  'There is time for a friendly word before the next errand.',
  'A clear question is a good place to begin.',
  'I have something interesting to share when work is done.',
  'I keep a small list so the important things get finished.',
  'If you are new here, the market street is a good place to start.',
] as const;
const KEEPER_LINES = [
  'I keep water canisters and everyday supplies at the provisioner stand.',
  'Bring three pieces of scrap to my forge and we can trade for a core.',
  'I exchange a core for scrap that can go into useful repairs.',
  'Bring water to the cookshop and I can prepare a restorative meal.',
  'The inn offers a place to rest in exchange for scrap.',
  'A core pays for a full recovery at the apothecary.',
  'The staff workbench is here when you want to adjust your equipment.',
] as const;
const TUNICS = [0x557e73, 0x607ca3, 0x866685, 0x9a7253, 0x9a5455, 0x748451, 0x5f7690, 0xae8b4f,
  0x4e847c, 0x737080, 0x976a5a, 0x527b90, 0x9b7f92, 0x6b875d, 0xb08061, 0x667065] as const;
const SKINS = [0xf0d2b5, 0xdfb18c, 0xc9966e, 0xb6815b, 0x9b6b49, 0x80553e, 0x65422f, 0x50362b] as const;
const HAIR = [0x211b18, 0x372820, 0x514035, 0x725242, 0x916c48, 0xac8454, 0xc4a571, 0x8e4d35, 0x77706a, 0xc7c3b8] as const;
const HATS: readonly TownResidentHat[] = ['none', 'cap', 'brim', 'hood'];
const HEIGHTS = [0.91, 0.955, 1, 1.045, 1.09] as const;
const rosterCache = new Map<number, readonly TownResident[]>();
const SAMPLE_OWNER = 'starting-town-residents';
const sample = (seed: number, purpose: string, index = 0) =>
  seedSample(seed, 1, SAMPLE_OWNER, 'roster', purpose, index);

/** Original addresses are retained; two outer rows add twenty real dwellings. */
export function townResidentAddress(homeIndex: number): string {
  if (!Number.isInteger(homeIndex) || homeIndex < 0 || homeIndex >= TOWN_HOUSE_COUNT) {
    throw new RangeError('Town home index must be an integer from 0 through 39.');
  }
  return `${homeIndex + 1} ${['Orchard Row','Lantern Row','Willow Walk','Hearth Lane'][Math.floor(homeIndex / 10)]}`;
}

/** All household members are adults: parent and adult-child roles are reciprocal. */
function householdFor(index: number): {homeIndex:number; kind:TownHouseholdKind; members:number[]; position:number; parents:number} {
  const homeIndex = index < 12 ? index : index < 36 ? 12 + Math.floor((index - 12) / 2)
    : index < 48 ? 24 + Math.floor((index - 36) / 3) : index < 80 ? 28 + Math.floor((index - 48) / 4) : 36 + Math.floor((index - 80) / 5);
  const first = homeIndex < 12 ? homeIndex : homeIndex < 24 ? 12 + (homeIndex - 12) * 2
    : homeIndex < 28 ? 36 + (homeIndex - 24) * 3 : homeIndex < 36 ? 48 + (homeIndex - 28) * 4 : 80 + (homeIndex - 36) * 5;
  const count = homeIndex < 12 ? 1 : homeIndex < 24 ? 2 : homeIndex < 28 ? 3 : homeIndex < 36 ? 4 : 5;
  return {homeIndex, kind: count === 1 ? 'single' : count === 2 ? 'couple' : 'family',
    members: Array.from({length:count}, (_, i) => first + i), position:index - first, parents:count===3?1:2};
}
const HISTORIES = [
  'learned the trade while helping rebuild a storm-damaged waystation',
  'came to Hearthmere with a traveling repair crew and chose to stay',
  'grew up nearby and returned after an apprenticeship along the river',
  'inherited a battered notebook of practical advice from a favorite teacher',
  'spent several seasons maintaining supplies on the valley road',
  'helped turn an abandoned storeroom into a neighborhood workshop',
  'started by lending tools to neighbors and built a trade through those friendships',
  'learned to make scarce materials last during a long winter',
  'followed a sibling into valley work before finding a specialty of their own',
  'first visited for the market and gradually made a home here',
  'kept detailed journals during years of work between settlements',
  'trained with an older craftsperson who insisted that every repair be explained',
] as const;
const ROLE_GOALS: Record<TownResidentRole,string> = {
  provisioner:'keep an affordable supply kit ready for every new arrival', smith:'teach a neighbor to restore a power core safely',
  salvager:'give discarded machinery a useful second life', cook:'collect a town book of reliable one-pot meals',
  innkeeper:'make the inn a dependable resting place for valley travelers', apothecary:'organize a clear guide to the town’s suit-repair supplies',
  outfitter:'design a repairable travel pack that lasts for years', gardener:'establish a shared seed bed', courier:'map a reliable delivery route between every household',
  carpenter:'build a sturdy bench for the square', weaver:'finish a set of hard-wearing cloth awnings', lamplighter:'keep the evening walk home easy to follow',
  mason:'restore weathered doorsteps before the next wet season', bookbinder:'bind a collection of neighbors’ stories', potter:'fire a matching set of community-meal bowls',
  'orchard tender':'revive a neglected patch of fruit trees', 'waterworks assistant':'make daily water checks easier for the next apprentice',
  'market porter':'create a fair shared system for moving market loads', repairer:'open a weekly mending table', surveyor:'draw an accurate walking map of the valley',
  baker:'develop a loaf that keeps well on long journeys',
};
function routineFor(seed:number,index:number,role:TownResidentRole,interest:string,homeNote:string):readonly TownRoutinePhase[] {
  const variation=(key:string,range:number)=>Math.floor(sample(seed,key,index)*(range*2+1))-range;
  const durations=[96+variation('home-duration',5),89+variation('commute-duration',3),
    120+variation('work-duration',5),45+variation('square-duration',2),50+variation('social-duration',3)];
  // Reserve at least 70 seconds for the longest outer-row journey home.
  const overflow=Math.max(0,durations.reduce((a,b)=>a+b,0)-410);
  durations[2]!-=overflow;
  durations.push(TOWN_RESIDENT_CYCLE_SECONDS-durations.reduce((a,b)=>a+b,0));
  const descriptions=[`Rest, breakfast and household tasks ${homeNote}.`,
    `Take the neighborhood streets to ${role} work; notice ideas for ${interest}.`,
    `Work as ${/^[aeiou]/.test(role)?'an':'a'} ${role} and ${ROLE_GOALS[role]}.${role==='lamplighter'?' This is an evening lighting shift.':role==='innkeeper'?' The inn shift begins later to welcome evening travelers.':['baker','cook'].includes(role)?' Food preparation starts before the other trades.':''}`,
    `Finish the shift and walk to the square to exchange news.`,
    `Meet neighbors in the square and share ${interest}.`,
    `Walk back ${homeNote.replace(/^at /,'to ')} to wind down for the next day.`];
  const locations:TownRoutinePhase['location'][]=['home','work','work','square','square','home'];
  let start=0;
  return Object.freeze(durations.map((duration,i)=>{const base=TOWN_RESIDENT_PHASES[i]!,end=start+duration;
    const result=Object.freeze({start,end,activity:i===2&&index<7?'keeping shop' as const:base.activity,
      moving:base.moving,location:locations[i]!,description:descriptions[i]!});start=end;return result;}));
}

/** Returns deeply frozen data; a four-seed LRU bounds strong population retention. */
export function townResidents(seed: number): readonly TownResident[] {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('Town seed must be an unsigned 32-bit integer.');
  }
  const cached = rosterCache.get(seed);
  if (cached) {
    rosterCache.delete(seed);
    rosterCache.set(seed, cached);
    return cached;
  }
  const nameOffset = Math.floor(sample(seed, 'name-offset') * 1024);
  const nameStride = 1 + 2 * Math.floor(sample(seed, 'name-stride') * 512);
  const nameFor = (index:number) => {const code=(nameOffset+index*nameStride)%1024;return `${FIRST_NAMES[code%32]!} ${SURNAMES[Math.floor(code/32)]!}`;};
  const idFor = (index:number) => `town-resident:${seed}:${String(index).padStart(3, '0')}`;
  const visualOffset = Math.floor(sample(seed, 'visual-offset') * 25600);
  const residents: TownResident[] = [];
  for (let index = 0; index < TOWN_RESIDENT_COUNT; index++) {
    const name = nameFor(index);
    // A coprime affine permutation guarantees 100 distinct visual combinations.
    let visual = (visualOffset + index * 137) % 25600;
    const tunic = TUNICS[visual % 16]!; visual = Math.floor(visual / 16);
    const skin = SKINS[visual % 8]!; visual = Math.floor(visual / 8);
    const hair = HAIR[visual % 10]!; visual = Math.floor(visual / 10);
    const hat = HATS[visual % 4]!; visual = Math.floor(visual / 4);
    const height = HEIGHTS[visual % 5]!;
    const keeper = index < 7;
    const workIndex = keeper ? index : (index - 7) % 7;
    const household=householdFor(index),{homeIndex}=household;
    const personalityIndex = Math.floor(sample(seed, 'personality', index) * PERSONALITIES.length);
    const personality = PERSONALITIES[personalityIndex]!;
    const interest = INTERESTS[Math.floor(sample(seed, 'interest', index) * INTERESTS.length)]!;
    const role = keeper ? TOWN_RESIDENT_KEEPER_ROLES[index]!
      : ROLES[Math.floor(sample(seed, 'role', index) * ROLES.length)]!;
    const address = townResidentAddress(homeIndex);
    const housemateIds=Object.freeze(household.members.filter(i=>i!==index).map(idFor));
    const housemateNames=household.members.filter(i=>i!==index).map(nameFor);
    const householdRole=household.kind==='single'?'sole resident':household.kind==='couple'?'partner':household.position<household.parents?'parent':'adult child';
    const relationships=Object.freeze(household.members.filter(i=>i!==index).map(i=>{
      const other=household.members.indexOf(i);
      // `kind` describes what the other resident is to this resident.
      const kind:TownRelationshipKind=household.kind==='couple'?'partner':household.position<household.parents?(other<household.parents?'partner':'adult child'):(other<household.parents?'parent':'sibling');
      return Object.freeze({residentId:idFor(i),kind});
    }));
    const age=household.kind==='family'?(household.position<household.parents?58+Math.floor(sample(seed,'age',index)*11):24+Math.floor(sample(seed,'age',index)*12)):25+Math.floor(sample(seed,'age',index)*43);
    const homeNote=household.kind==='single'?`at ${address}, where I live on my own`:`at ${address} with ${housemateNames.join(', ')}`;
    const history=HISTORIES[Math.floor(sample(seed,'history',index)*HISTORIES.length)]!;
    const familyStory=household.kind==='single'?`${name} lives alone at ${address} and makes time for neighbors in the square.`
      :household.kind==='couple'?`${name} shares ${address} with their partner, ${housemateNames[0]}. They keep their own names and divide the household chores.`
      :household.position<household.parents?`${name} shares ${address} ${household.parents===2?`with their partner ${nameFor(household.members[1-household.position]!)} and their`:'as a single parent with their'} ${household.members.length-household.parents===2?'two':'three'} adult children, ${household.members.slice(household.parents).map(nameFor).join(', ')}.`
      :`${name} lives at ${address} with ${household.parents===1?'parent':'parents'} ${household.members.slice(0,household.parents).map(nameFor).join(' and ')} and adult ${household.members.length-household.parents===2?'sibling':'siblings'} ${household.members.slice(household.parents).filter(i=>i!==index).map(nameFor).join(' and ')}. Everyone has kept the name they use in their own trade.`;
    const backstory=`${name}, ${age}, ${history}. ${familyStory} Their ${personality} approach shapes their work as ${/^[aeiou]/.test(role)?'an':'a'} ${role}; their ambition is to ${ROLE_GOALS[role]}. Away from work, they enjoy ${interest}.`;
    const routine=routineFor(seed,index,role,interest,homeNote);
    // Most households share the town's daylight rhythm. Early food preparation,
    // late inn duty and evening lamplighting have intentional, documented shifts.
    const shift=role==='lamplighter'?-150:role==='innkeeper'?-65:['baker','cook'].includes(role)?25:0;
    const phaseOffset=(shift+(sample(seed,'departure',index)-.5)*12+TOWN_RESIDENT_CYCLE_SECONDS)%TOWN_RESIDENT_CYCLE_SECONDS;
    const dialogue: readonly [string, string, string] = Object.freeze([
      `${GREETINGS[personalityIndex]} My name is ${name}.`,
      keeper ? KEEPER_LINES[workIndex]! : `I work as ${/^[aeiou]/.test(role) ? 'an' : 'a'} ${role}. Lately, I have been learning more about ${interest}.`,
      `I live ${homeNote}. ${keeper?'The stocked service counter stays available when I am off duty.':`I hope to ${ROLE_GOALS[role]}.`}`,
    ]);
    residents.push(Object.freeze({
      id: idFor(index),
      index, name, role, homeIndex, workIndex, address, personality, interest, dialogue,
      age,householdId:`town-household:${seed}:${String(homeIndex).padStart(2,'0')}`,
      householdKind:household.kind,householdRole,housemateIds,relationships,backstory,routine,
      colors: Object.freeze({tunic, skin, hair}), height, hat, keeper,
      appearance: Object.freeze({build: .82 + Math.floor(sample(seed,'build',index)*5)*.11, shoulders:.88 + Math.floor(sample(seed,'shoulders',index)*4)*.09, legLength:.92 + Math.floor(sample(seed,'legs',index)*4)*.055, coat: (['cook','baker','smith','potter','provisioner'].includes(role)?'apron':['weaver','outfitter','bookbinder'].includes(role)?'longcoat':index%3===0?'vest':'tunic') as 'tunic'|'apron'|'longcoat'|'vest', hairStyle:Math.floor(sample(seed,'hairstyle',index)*5), accessory:(['courier','market porter','surveyor'].includes(role)?'pack':['carpenter','mason','repairer','gardener'].includes(role)?'tool':index%3===0?'satchel':'none') as 'none'|'satchel'|'pack'|'tool',accent:TUNICS[(index+5)%TUNICS.length]!,stride:.62+sample(seed,'stride',index)*.22,swing:.8+sample(seed,'swing',index)*.4,idle:sample(seed,'idle',index)*Math.PI*2}),
      phaseOffset,
    }));
  }
  const roster = Object.freeze(residents);
  rosterCache.set(seed, roster);
  while (rosterCache.size > TOWN_RESIDENT_CACHE_LIMIT) rosterCache.delete(rosterCache.keys().next().value!);
  return roster;
}

/** Read-only directory projection; there is one occupied household per actual home. */
export function townHouseholds(seed:number):readonly TownHousehold[] {
  const roster=townResidents(seed);
  return Object.freeze(Array.from({length:TOWN_HOUSE_COUNT},(_,homeIndex)=>{
    const members=roster.filter(r=>r.homeIndex===homeIndex),first=members[0]!;
    return Object.freeze({id:first.householdId,homeIndex,address:first.address,kind:first.householdKind,
      memberIds:Object.freeze(members.map(r=>r.id))});
  }));
}
export function townResidentHouseholdSummary(resident:TownResident,roster:readonly TownResident[]):string {
  if(resident.householdKind==='single')return `Lives alone at ${resident.address}.`;
  return `${resident.householdKind==='couple'?'Couple':'Family'} at ${resident.address}: ${resident.relationships.map(relation=>{
    const other=roster.find(r=>r.id===relation.residentId);
    return `${other?.name??'Unknown resident'} (${relation.kind})`;
  }).join('; ')}.`;
}
/** Shared source for the inspector and actual movement, including shopkeepers. */
export function townResidentRoutinePhase(resident:TownResident,elapsed:number):TownRoutinePhase {
  const time=Number.isFinite(elapsed)?elapsed:0;
  const phase=(((time%TOWN_RESIDENT_CYCLE_SECONDS)+resident.phaseOffset)%TOWN_RESIDENT_CYCLE_SECONDS+TOWN_RESIDENT_CYCLE_SECONDS)%TOWN_RESIDENT_CYCLE_SECONDS;
  return resident.routine.find(p=>phase>=p.start&&phase<p.end)??resident.routine[0]!;
}

type Point = Readonly<{x: number; z: number}>;
interface Route {
  readonly points: readonly Point[];
  readonly lengths: readonly number[];
  readonly length: number;
}
interface Itinerary {
  readonly home: Point;
  readonly work: Point;
  readonly square: Point;
  readonly homeFacing: number;
  readonly squareFacing: number;
  readonly toWork: Route;
  readonly toSquare: Route;
  readonly toHome: Route;
}
// Weak keys do not extend a plan or resident's lifetime. Treat plan coordinates as
// immutable: replace the plan object if the town layout changes.
const itineraries = new WeakMap<TownResidentPlan, WeakMap<TownResident, Itinerary>>();
const WORK_SLOTS = [2, 0, 4, 1, 3, 7, 5, 9, 6, 8, 12, 10, 14, 11, 13] as const;

function validatePlan(plan: TownResidentPlan): void {
  if (!plan || !Number.isFinite(plan.center?.x) || !Number.isFinite(plan.center?.z)
    || !Array.isArray(plan.homes) || plan.homes.length < TOWN_HOUSE_COUNT
    || !Array.isArray(plan.shops) || plan.shops.length < 7) {
    throw new RangeError('Town population needs a finite center, 40 homes, and 7 shops.');
  }
  for (let i = 0; i < TOWN_HOUSE_COUNT + 7; i++) {
    const entry = i < TOWN_HOUSE_COUNT ? plan.homes[i]!.entry : plan.shops[i - TOWN_HOUSE_COUNT]!.entry;
    if (!entry || !Number.isFinite(entry.x) || !Number.isFinite(entry.z)) {
      throw new RangeError('Town entries must have finite coordinates.');
    }
    const dx = Math.abs(entry.x - plan.center.x);
    const dz = Math.abs(entry.z - plan.center.z);
    if (plan.layoutVersion===3 ? dx>44||dz>47.9 : dx > 44 || (i < TOWN_HOUSE_COUNT ? Math.abs(dz - (i < 20 ? 24 : 44)) > 1e-6 : dz > 1e-6)) {
      throw new RangeError('Town entries must meet the horizontal street layout contract.');
    }
  }
}

/** Six or fewer fixed Manhattan waypoints, including both exact dwelling stations. */
function streetRoute(from: Point, fromRoadZ: number, to: Point, toRoadZ: number,
  centerX: number, centerZ: number, resident: TownResident): Route {
  const lane = 0.44 + (resident.index % 7) * 0.03;
  // The northern market row blocks the center trunk. Pick the shorter of the
  // two known outer streets; this is a constant-size decision, not pathfinding.
  const crossesNorth = Math.min(fromRoadZ, toRoadZ) < centerZ - 1e-6
    && Math.abs(fromRoadZ - toRoadZ) > 1e-6;
  let trunk = centerX;
  if (crossesNorth) {
    const west = centerX - 48, east = centerX + 48;
    const westDistance = Math.abs(from.x - west) + Math.abs(to.x - west);
    const eastDistance = Math.abs(from.x - east) + Math.abs(to.x - east);
    trunk = westDistance < eastDistance || (westDistance === eastDistance && resident.index % 2 === 0) ? west : east;
  }
  const firstDirection = Math.sign(trunk - from.x) || 1;
  const lastDirection = Math.sign(to.x - trunk) || firstDirection;
  const verticalDirection = Math.sign(toRoadZ - fromRoadZ) || 1;
  // Outer lane clearance also accommodates lamps on the original road center.
  const trunkX = trunk - verticalDirection * (crossesNorth ? 0.8 + (resident.index % 7) * 0.03 : lane);
  const startZ = fromRoadZ + firstDirection * lane;
  const finishZ = toRoadZ + lastDirection * lane;
  const candidates: Point[] = [from, {x: from.x, z: startZ}, {x: trunkX, z: startZ},
    {x: trunkX, z: finishZ}, {x: to.x, z: finishZ}, to];
  const points: Point[] = [from];
  const lengths: number[] = [];
  let length = 0;
  for (let i = 1; i < candidates.length; i++) {
    const point = candidates[i]!;
    const previous = points[points.length - 1]!;
    const distance = Math.abs(point.x - previous.x) + Math.abs(point.z - previous.z);
    if (distance < 1e-9) continue;
    points.push(Object.freeze(point));
    lengths.push(distance);
    length += distance;
  }
  return Object.freeze({points: Object.freeze(points), lengths: Object.freeze(lengths), length});
}

function itineraryFor(resident: TownResident, plan: TownResidentPlan): Itinerary {
  let residents = itineraries.get(plan);
  if (!residents) {
    validatePlan(plan);
    residents = new WeakMap<TownResident, Itinerary>();
    itineraries.set(plan, residents);
  }
  const cached = residents.get(resident);
  if (cached) return cached;
  const homeEntry = plan.homes[resident.homeIndex]!.entry;
  const workEntry = plan.shops[resident.workIndex]!.entry;
  const homeSide = Math.sign(homeEntry.z - plan.center.z);
  const household=householdFor(resident.index);
  const home = Object.freeze({x: homeEntry.x + (household.position - (household.members.length - 1) / 2) * 0.72,
    z: homeEntry.z + homeSide * 1.3});
  const ordinal = resident.keeper ? 0 : Math.floor((resident.index - 7) / 7) + 1;
  const slot = WORK_SLOTS[ordinal]!;
  // Keep dwellers clear of the central north-south crossing as well as travel lanes.
  const crossingClearance = Math.abs(workEntry.x - plan.center.x) < 3 ? (resident.keeper ? 1.4 : 3.6) : 0;
  const work = Object.freeze({x: workEntry.x + crossingClearance + (slot % 5 - 2) * 0.7,
    z: workEntry.z + 1.4 + Math.floor(slot / 5) * 0.6});
  const squareSlot = resident.index;
  const squareColumn = squareSlot % 50;
  const squareColumnX = (squareColumn < 25 ? squareColumn - 25 : squareColumn - 24) * 1.7;
  const square = Object.freeze({x: plan.center.x + squareColumnX,
    z: plan.center.z - 1.3 - Math.floor(squareSlot / 50) * 0.8});
  const route=(from:Point,roadFrom:number,to:Point,roadTo:number)=>{
    if(plan.layoutVersion!==3)return streetRoute(from,roadFrom,to,roadTo,plan.center.x,plan.center.z,resident);
    const path=townRoadRoute(plan as TownPlan,from,to);if(!path)throw Error('Unreachable organic resident itinerary');
    const points=[from,...path],lengths=path.map((p,i)=>Math.hypot(p.x-points[i]!.x,p.z-points[i]!.z));return {points,lengths,length:lengths.reduce((a,b)=>a+b,0)};
  };
  const itinerary: Itinerary = Object.freeze({
    home, work, square,
    homeFacing: homeSide < 0 ? 0 : Math.PI,
    squareFacing: Math.atan2(plan.center.x - square.x, plan.center.z - square.z),
    toWork: route(home, homeEntry.z, work, plan.center.z),
    toSquare: route(work, plan.center.z, square, plan.center.z),
    toHome: route(square, plan.center.z, home, homeEntry.z),
  });
  residents.set(resident, itinerary);
  return itinerary;
}

function onRoute(route: Route, progress: number, activity: TownResidentActivity, duration:number): TownResidentPose {
  let remaining = route.length * Math.max(0, Math.min(1, progress));
  for (let i = 0; i < route.lengths.length; i++) {
    const length = route.lengths[i]!;
    if (remaining <= length || i === route.lengths.length - 1) {
      const from = route.points[i]!, to = route.points[i + 1]!;
      const fraction = Math.max(0, Math.min(1, remaining / length));
      return {x: from.x + (to.x - from.x) * fraction, z: from.z + (to.z - from.z) * fraction,
        facing: (()=>{const angle=Math.atan2(to.x-from.x,to.z-from.z),easeDistance=Math.min(length/2,route.length/duration*.28);let out=angle;
          if(i>0&&remaining<easeDistance){const prev=route.points[i-1]!,old=Math.atan2(from.x-prev.x,from.z-prev.z),t=.5+.5*remaining/easeDistance;out=old+Math.atan2(Math.sin(angle-old),Math.cos(angle-old))*t;}
          else if(i<route.lengths.length-1&&length-remaining<easeDistance){const next=route.points[i+2]!,angle2=Math.atan2(next.x-to.x,next.z-to.z),t=.5*(1-(length-remaining)/easeDistance);out=angle+Math.atan2(Math.sin(angle2-angle),Math.cos(angle2-angle))*t;}return out;})(), activity, moving: route.length > 0,speed:route.length/duration,distance:route.length*Math.max(0,Math.min(1,progress))};
    }
    remaining -= length;
  }
  const point = route.points[0]!;
  return {x: point.x, z: point.z, facing: 0, activity, moving: false};
}

/**
 * Absolute seconds, never a frame delta. Each personalized six-phase loop is
 * bounded to 480 seconds; keepers follow it too. No per-frame AI state or catch-up.
 * All route endpoints and day wraps are continuous. Market and outer streets are
 * fixed clear bands; dynamic body avoidance remains the crowd kernel's job.
 */
export function townResidentPose(resident: TownResident, elapsed: number, plan: TownResidentPlan): TownResidentPose {
  const itinerary = itineraryFor(resident, plan),stage=townResidentRoutinePhase(resident,elapsed);
  const time=Number.isFinite(elapsed)?elapsed:0;
  const phase=(((time%TOWN_RESIDENT_CYCLE_SECONDS)+resident.phaseOffset)%TOWN_RESIDENT_CYCLE_SECONDS+TOWN_RESIDENT_CYCLE_SECONDS)%TOWN_RESIDENT_CYCLE_SECONDS;
  if(!stage.moving){const point=itinerary[stage.location],facing=stage.location==='home'?itinerary.homeFacing:stage.location==='square'?itinerary.squareFacing:Math.PI;
    return {...point,facing,activity:stage.activity,moving:false};}
  const route=stage.location==='work'?itinerary.toWork:stage.location==='square'?itinerary.toSquare:itinerary.toHome;
  return onRoute(route,(phase-stage.start)/(stage.end-stage.start),stage.activity,stage.end-stage.start);
}
