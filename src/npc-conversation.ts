/** Deterministic, local dialogue. This module has no timers, storage, network or world effects. */
import type {TownResident, TownRoutinePhase} from './town-residents.ts';

export const CONVERSATION_VERSION = 1 as const;
export const CONVERSATION_MEMORY_MAX_BYTES = 48_000;
export const CONVERSATION_MEMORY_MAX_RESIDENTS = 106;
export const CONVERSATION_TOPICS = ['day','work','home','past','interests','town','hopes','outlook'] as const;
export const CONVERSATION_TONES = ['supportive','skeptical','playful','direct'] as const;
export type ConversationTopic = typeof CONVERSATION_TOPICS[number];
export type ConversationTone = typeof CONVERSATION_TONES[number];
export type ConversationChoiceKind = 'topic'|'followup'|'reaction'|'leave'|'navigation';
export type ConversationBeat = 'main'|'detail'|'reflection';
export interface ConversationChoice {readonly id:string;readonly text:string;readonly kind:ConversationChoiceKind}
/** Live facts are supplied by the authoritative town model, not inferred from dialogue memory. */
export interface ConversationLifeContext {
  readonly present:string;readonly reason:string;readonly mood:string;readonly desire:string;
  readonly social:string;readonly town:string;readonly help:string;
}
export interface ConversationContext {
  readonly seed:number;
  /** Simulation time, never wall time. Invalid times safely use zero. */
  readonly elapsed:number;
  readonly activity?:string;
  readonly life?:ConversationLifeContext;
  readonly status?:string;
  readonly waterAvailable?:boolean;
  readonly workplaceOperational?:boolean;
}
export interface ConversationProfile {
  readonly id:string;readonly name:string;readonly role:string;readonly origin:'town'|'named';
  readonly personality:string;readonly interest:string;readonly homeName:string;readonly workplaceName:string;
  readonly age:number|null;readonly householdKind:'single'|'couple'|'family'|'unspecified';
  readonly relationships:readonly {readonly name:string;readonly kind:string}[];
  readonly history:string;readonly ambition:string;readonly phaseOffset:number;
  readonly routine:readonly TownRoutinePhase[];
}
export interface ConversationResidentMemory {
  readonly residentId:string;
  /** A bounded set of subjects, not progression, approval, trust, points or rewards. */
  readonly topics:readonly ConversationTopic[];
  readonly lastTopic:ConversationTopic|null;
  readonly lastTone:ConversationTone|null;
  readonly lastBeat:ConversationBeat;
}
export interface ConversationMemory {readonly version:1;readonly seed:number;readonly residents:readonly ConversationResidentMemory[]}
export interface ConversationSession {
  readonly version:1;readonly seed:number;readonly residentId:string;readonly gone:boolean;
  /** Ephemeral topic shifts never replay the introduction or alter saved memory. */
  readonly menuShifted:boolean;
  readonly topic:ConversationTopic|null;readonly beat:ConversationBeat;readonly tone:ConversationTone|null;
  /** Opening snapshots stop this visit from pretending to be an earlier conversation. */
  readonly returning:boolean;readonly previousTopic:ConversationTopic|null;readonly previousTone:ConversationTone|null;
}
export interface ConversationView {
  readonly name:string;readonly role:string;readonly subtitle:string;readonly line:string;
  readonly choices:readonly ConversationChoice[];readonly topic:ConversationTopic|null;
  readonly remembered:string|null;readonly canBack:boolean;readonly gone:boolean;
}
export interface ConversationResult {readonly session:ConversationSession;readonly memory:ConversationMemory}

function freeze<T>(value:T):T {
  if(value && typeof value==='object' && !Object.isFrozen(value)) {
    for(const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}
const unsignedSeed=(seed:unknown):seed is number=>typeof seed==='number' && Number.isInteger(seed) && seed>=0 && seed<=0xffffffff;
function requireSeed(seed:number){if(!unsignedSeed(seed))throw new RangeError('Conversation seed must be an unsigned 32-bit integer.');}
function hash(text:string){let result=2166136261;for(let i=0;i<text.length;i++)result=Math.imul(result^text.charCodeAt(i),16777619);return result>>>0;}
const pick=<T>(profile:ConversationProfile,key:string,items:readonly T[]):T=>items[hash(`${profile.id}/${key}`)%items.length]!;
const lowerFirst=(text:string)=>text?text[0]!.toLowerCase()+text.slice(1):text;
const cap=(text:string)=>text?text[0]!.toUpperCase()+text.slice(1):text;
const article=(text:string)=>/^[aeiou]/i.test(text)?'an':'a';
const list=(names:readonly string[])=>names.length<3?names.join(' and '):`${names.slice(0,-1).join(', ')}, and ${names.at(-1)}`;
function ownObject(value:unknown):value is Record<string,unknown>{
  return !!value && typeof value==='object' && !Array.isArray(value) && (Object.getPrototypeOf(value)===Object.prototype || Object.getPrototypeOf(value)===null);
}
function denseArray(value:unknown,max:number):value is unknown[]{return Array.isArray(value)&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,i)=>Object.hasOwn(value,i)).every(Boolean);}
function keys(value:Record<string,unknown>,expected:readonly string[]){return Reflect.ownKeys(value).length===expected.length && expected.every(key=>Object.hasOwn(value,key));}
function validId(id:unknown,seed:number):id is string {
  if(typeof id!=='string'||id.length>100)return false;
  if(id.startsWith(`town-resident:${seed}:`))return new RegExp(`^town-resident:${seed}:(?:0[0-9]{2})$`).test(id);
  return new RegExp(`^causal:1:${seed}/agent/(?:mossbank|highmeadow)/(?:caretaker|carrier|builder)$`).test(id);
}
const topicValue=(value:unknown):value is ConversationTopic=>typeof value==='string' && (CONVERSATION_TOPICS as readonly string[]).includes(value);
const toneValue=(value:unknown):value is ConversationTone=>typeof value==='string' && (CONVERSATION_TONES as readonly string[]).includes(value);
const beatValue=(value:unknown):value is ConversationBeat=>value==='main'||value==='detail'||value==='reflection';

/** Only these local, enum-valued memories can be restored. Extra fields and cross-seed IDs fail closed. */
export function validConversationMemory(value:unknown,seed:number):value is ConversationMemory {
  try {
    if(!unsignedSeed(seed)||!ownObject(value)||!keys(value,['version','seed','residents'])||value.version!==1||value.seed!==seed||!denseArray(value.residents,CONVERSATION_MEMORY_MAX_RESIDENTS))return false;
    const seen=new Set<string>();
    for(const entry of value.residents){
      if(!ownObject(entry)||!keys(entry,['residentId','topics','lastTopic','lastTone','lastBeat'])||!validId(entry.residentId,seed)||seen.has(entry.residentId)||!denseArray(entry.topics,8)||!entry.topics.every(topicValue)||new Set(entry.topics).size!==entry.topics.length||!(entry.lastTopic===null||topicValue(entry.lastTopic))||!(entry.lastTone===null||toneValue(entry.lastTone))||!beatValue(entry.lastBeat))return false;
      if(entry.lastTopic===null?(entry.topics.length!==0||entry.lastTone!==null||entry.lastBeat!=='main'):!entry.topics.includes(entry.lastTopic))return false;
      seen.add(entry.residentId);
    }
    return JSON.stringify(value).length<=CONVERSATION_MEMORY_MAX_BYTES;
  } catch {return false;}
}
export function createConversationMemory(seed:number):ConversationMemory {requireSeed(seed);return freeze({version:1,seed,residents:[]});}
/** Invalid, oversized or obsolete local data is discarded as a whole, never partly trusted. */
export function parseConversationMemory(raw:unknown,seed:number):ConversationMemory {
  requireSeed(seed);
  if(typeof raw!=='string'||raw.length>CONVERSATION_MEMORY_MAX_BYTES)return createConversationMemory(seed);
  try {const value:unknown=JSON.parse(raw);return validConversationMemory(value,seed)?freeze(value):createConversationMemory(seed);}catch{return createConversationMemory(seed);}
}
export function serializeConversationMemory(memory:ConversationMemory):string {
  if(!validConversationMemory(memory,memory.seed))throw new TypeError('Invalid conversation memory.');
  return JSON.stringify(memory);
}

/** Copies the roster's actual household, role, past, ambition and personalized routine. */
export function townConversationProfile(resident:TownResident,roster:readonly TownResident[]):ConversationProfile {
  const start=`${resident.name}, ${resident.age}, `;
  const history=resident.backstory.startsWith(start)?resident.backstory.slice(start.length).split('. ')[0]!:'';
  const ambition=resident.backstory.match(/; their ambition is to ([^.]+)\./)?.[1]??roleWriting(resident.role).goal;
  return freeze({id:resident.id,name:resident.name,role:resident.role,origin:'town',personality:resident.personality,interest:resident.interest,
    homeName:resident.address,workplaceName:`the ${resident.role==='orchard tender'?'orchard':resident.role==='waterworks assistant'?'waterworks':resident.role+' workplace'}`,
    age:resident.age,householdKind:resident.householdKind,relationships:resident.relationships.map(relation=>({name:roster.find(r=>r.id===relation.residentId)?.name??'a housemate',kind:relation.kind})),
    history:history?`I ${history}.`:`I work as ${article(resident.role)} ${resident.role} here in Hearthmere.`,ambition,phaseOffset:resident.phaseOffset,routine:resident.routine.map(phase=>({...phase}))});
}
export interface NamedConversationFacts {readonly id:string;readonly name:string;readonly role:'caretaker'|'carrier'|'builder';readonly homeName:string;readonly workplaceName?:string}
/** Existing causal agents keep their plan identity and known work/home facts. Unrecorded family/history is never invented. */
export function namedConversationProfile(facts:NamedConversationFacts):ConversationProfile {
  const authored={
    caretaker:{personality:'methodical',interest:'repair methods',history:`My work is caring for ${facts.workplaceName??'the workshop'} in ${facts.homeName}.`,ambition:'keep the workshop dependable for the people who use it'},
    carrier:{personality:'observant',interest:'walking routes',history:`I carry water for the households in ${facts.homeName}.`,ambition:'keep water reaching the households that need it'},
    builder:{personality:'practical',interest:'repairable designs',history:`I work on workshop repairs for ${facts.homeName}.`,ambition:'leave the workshops ready for their next working day'},
  }[facts.role];
  return freeze({id:facts.id,name:facts.name,role:facts.role,origin:'named',...authored,homeName:facts.homeName,workplaceName:facts.workplaceName??(facts.role==='carrier'?'the water route':'the local workshops'),age:null,householdKind:'unspecified',relationships:[],phaseOffset:0,routine:[]});
}

const PERSONALITY = {
  thoughtful:{value:'giving an idea time to settle',supportive:'It helps to have someone think it through with me.',skeptical:'That deserves a proper answer, rather than a quick defense.',playful:'I may need a moment to decide how seriously to take that.',direct:'All right. Here is the part I would hold on to.'},
  curious:{value:'asking one more useful question',supportive:'Then perhaps we are curious about the same thing.',skeptical:'What would change your mind? I ask myself that, too.',playful:'Now that raises an entirely different question.',direct:'Fair question. Let us get to the useful part.'},
  cheerful:{value:'finding a little good in an ordinary day',supportive:'Well, that gives the day a lift.',skeptical:'It is not all sunshine. I can admit that.',playful:'Ha! I will give you that one.',direct:'Of course. Let us keep it simple.'},
  patient:{value:'leaving room for people to learn',supportive:'A little encouragement can go a long way.',skeptical:'You do not have to agree with me straight away.',playful:'I can wait while you enjoy that joke.',direct:'We can take this one thing at a time.'},
  practical:{value:'making something useful with what is at hand',supportive:'Good. It is the useful part that matters to me.',skeptical:'It should stand up to a fair test.',playful:'Very good. Does the joke come with a spare pair of hands?',direct:'Here is the plain version.'},
  observant:{value:'noticing the small thing before it becomes a large one',supportive:'You noticed the part I was hoping to explain.',skeptical:'There may be something I have missed.',playful:'I saw that grin before the words arrived.',direct:'The detail to watch is this.'},
  inventive:{value:'trying a small change before throwing everything away',supportive:'That makes me want to try another approach.',skeptical:'A doubt can be a useful design problem.',playful:'Now you are giving me ideas, which may be unwise.',direct:'Let us start with a small, workable version.'},
  easygoing:{value:'leaving a little room in the day',supportive:'I am glad that makes sense to you.',skeptical:'Fair enough. We can see it differently.',playful:'You might be taking my grand plans too seriously.',direct:'Sure. No need to make this complicated.'},
  candid:{value:'saying what I mean without making a show of it',supportive:'I appreciate you saying so.',skeptical:'I will not pretend I have proved the point.',playful:'That was cheeky. Not entirely wrong, either.',direct:'I prefer a straight question.'},
  'quietly enthusiastic':{value:'sticking with a small thing that genuinely interests me',supportive:'I am pleased you see something in it, too.',skeptical:'I may like it more than I can justify.',playful:'I was trying to sound sensible about it.',direct:'There is one part I could happily talk about for hours.'},
  methodical:{value:'checking the small steps instead of guessing',supportive:'Then we have a useful place to begin.',skeptical:'A reasonable objection. I would check it before deciding.',playful:'I had not put that possibility on my list.',direct:'Let us separate the question into its important parts.'},
  welcoming:{value:'making it easier for someone new to join in',supportive:'There is room for that kind of encouragement here.',skeptical:'I would rather hear your doubts than leave you outside the conversation.',playful:'You will fit right in if you keep that up.',direct:'Ask plainly. You do not need an introduction with me.'},
} as const;
const voice=(p:ConversationProfile)=>PERSONALITY[p.personality as keyof typeof PERSONALITY]??PERSONALITY.thoughtful;

type RoleWriting={hard:string;proud:string;step:string;goal:string};
const ROLES:Record<string,RoleWriting>={
  provisioner:{hard:'Keeping everyday supplies understandable matters as much as keeping them in order.',proud:'A new arrival should be able to work out what they need without embarrassment.',step:'I would begin with a short list of the things a newcomer actually uses.',goal:'keep an affordable supply kit ready for every new arrival'},
  smith:{hard:'A repair needs care before it needs force. Rushing is the part I try to resist.',proud:'I like a repair whose purpose I can explain as clearly as its method.',step:'I would start with a safe demonstration and explain each step.',goal:'teach a neighbor to restore a power core safely'},
  salvager:{hard:'It takes patience to tell a useful worn part from one that should stay out of service.',proud:'Finding a sensible second use feels better than keeping a pile of possibilities.',step:'I would sort one small batch by what can actually be repaired.',goal:'give discarded machinery a useful second life'},
  cook:{hard:'A reliable meal needs a clear method, especially when someone else has to make it.',proud:'I like a recipe that works on an ordinary day with ordinary equipment.',step:'I would write down one dependable recipe, then ask someone else to try it.',goal:'collect a town book of reliable one-pot meals'},
  innkeeper:{hard:'People arrive tired. I try to explain things before they have to ask twice.',proud:'A traveler should be able to settle in without having to work everything out alone.',step:'I would start by making the arrival instructions simple and clear.',goal:'make the inn a dependable resting place for valley travelers'},
  apothecary:{hard:'Labels have to be clear. A familiar shelf to me can be confusing to someone new.',proud:'I like it when someone understands the suit-repair supplies well enough to ask a precise question.',step:'I would organize one section of the guide around the questions people actually ask.',goal:'organize a clear guide to the town’s suit-repair supplies'},
  outfitter:{hard:'The part that wears first should also be the part that is easiest to replace.',proud:'I prefer equipment that can be understood and mended.',step:'I would sketch the fastening first; it is no use if a small break ruins the whole pack.',goal:'design a repairable travel pack that lasts for years'},
  gardener:{hard:'It is tempting to hurry a seedling. That does not make it grow any faster.',proud:'I like growth that has had enough care, without being fussed over.',step:'I would choose a small seed bed and agree how we will care for it.',goal:'establish a shared seed bed'},
  courier:{hard:'A route on paper still has to make sense at the actual door.',proud:'A clear route saves the next person a needless wrong turn.',step:'I would walk one row of homes and check each doorway against the map.',goal:'map a reliable delivery route between every household'},
  carpenter:{hard:'A small error at the beginning can follow you through the whole piece.',proud:'I like a joint that sits properly without needing an explanation.',step:'I would settle the bench dimensions before cutting anything.',goal:'build a sturdy bench for the square'},
  weaver:{hard:'Keeping an even tension takes more attention than people expect.',proud:'Useful cloth should feel dependable, not merely look impressive.',step:'I would make a small cloth sample and test how it hangs.',goal:'finish a set of hard-wearing cloth awnings'},
  lamplighter:{hard:'A light should help you see the next part of the way, not dazzle you where you stand.',proud:'I like a walk home that is easy to follow after the light changes.',step:'I would walk the route and note where the next lamp is hard to see.',goal:'keep the evening walk home easy to follow'},
  mason:{hard:'Getting the base right is quiet work, but everything above it depends on it.',proud:'A level doorstep is a small kindness you can use every day.',step:'I would inspect a worn step before deciding what needs replacing.',goal:'restore weathered doorsteps before the next wet season'},
  bookbinder:{hard:'A book has to open comfortably as well as hold together.',proud:'I like giving useful words a form that will survive being read.',step:'I would ask one neighbor which story they want preserved, in their own words.',goal:'bind a collection of neighbors’ stories'},
  potter:{hard:'A bowl needs to feel right in the hand, not just look right on the shelf.',proud:'I like a useful shape that someone reaches for without thinking.',step:'I would settle on one comfortable bowl shape before making a set.',goal:'fire a matching set of community-meal bowls'},
  'orchard tender':{hard:'It is easy to act too quickly when a tree needs time and observation.',proud:'I like caring for something whose progress cannot be hurried.',step:'I would look closely at the neglected trees before deciding where to start.',goal:'revive a neglected patch of fruit trees'},
  'waterworks assistant':{hard:'A familiar reading can tempt you to stop looking properly.',proud:'A check is useful when the next person can understand exactly what was checked.',step:'I would write down the daily checks in the order an apprentice meets them.',goal:'make daily water checks easier for the next apprentice'},
  'market porter':{hard:'A load can look balanced and still pull awkwardly once you move.',proud:'Work goes better when people can see how the loads are shared.',step:'I would ask the other porters which part of sharing loads feels least fair.',goal:'create a fair shared system for moving market loads'},
  repairer:{hard:'Finding the cause matters more than making the symptom disappear for a moment.',proud:'I like a repair the owner can understand and look after.',step:'I would begin with a small mending table and one clearly explained repair.',goal:'open a weekly mending table'},
  surveyor:{hard:'A beautiful map is not much use if a turning is in the wrong place.',proud:'I like directions that still make sense when someone stands on the ground.',step:'I would walk one route and check the distances before drawing the rest.',goal:'draw an accurate walking map of the valley'},
  baker:{hard:'Repeating a good result takes careful attention to the ordinary steps.',proud:'I like a loaf that is useful the next day as well as pleasing when it is fresh.',step:'I would compare how a few small test loaves keep before changing the recipe.',goal:'develop a loaf that keeps well on long journeys'},
  caretaker:{hard:'A workshop needs actual attention. Calling it ready is not the same as caring for it.',proud:'I want the person using the workshop to find it dependable.',step:'I would check what is actually preventing work before making a plan.',goal:'keep the workshop dependable for the people who use it'},
  carrier:{hard:'A useful water route needs a working supply and a safe way home.',proud:'It matters that the water actually reaches the households.',step:'I would check the intake and the route, then the household reserve.',goal:'keep water reaching the households that need it'},
  builder:{hard:'I need to know what is broken and what materials are available before I begin.',proud:'A repair should leave the next worker able to get on with the day.',step:'I would inspect the workshop mechanism and work out what the repair needs.',goal:'leave the workshops ready for their next working day'},
};
function roleWriting(role:string):RoleWriting{return ROLES[role]??{hard:'I try to understand a problem before I decide what to do about it.',proud:'I like doing useful work with care.',step:'I would begin with one small, useful step.',goal:'do useful work for the people here'};}

type InterestWriting={draw:string;start:string};
const INTERESTS:Record<string,InterestWriting>={
  'garden seedlings':{draw:'A seedling makes a small change worth noticing each day.',start:'Start by watching one plant closely. There is more to notice than height.'},
  'old maps':{draw:'An old map lets you compare the place someone described with the place you can walk through.',start:'Pick one familiar route and compare its turns with the marks on a map.'},
  birdsong:{draw:'I like learning to hear separate voices in what first sounds like one morning chorus.',start:'Listen from one spot and try to follow a single repeated call.'},
  'wood carving':{draw:'A small cut can change the whole character of a piece. I like that it asks me to slow down.',start:'Start with a simple shape and a little spare wood. There is no need to begin with a masterpiece.'},
  'local history':{draw:'I enjoy hearing how different people remember the same place.',start:'Ask someone about a familiar place, then listen for what mattered to them.'},
  'bread recipes':{draw:'I like the small differences that make a familiar recipe someone’s own.',start:'Try one straightforward recipe twice before changing it. Then you have something to compare.'},
  stargazing:{draw:'Looking up makes the day feel less crowded.',start:'Choose one clear patch of sky and learn a few shapes you can recognize again.'},
  'river stones':{draw:'The shapes and colors reward a closer look without asking anything of me.',start:'Look at a few stones where they lie and notice what the water has done to their edges.'},
  'mending clothes':{draw:'A neat mend is a small, visible way of making a useful thing last.',start:'Begin with an easy seam and work slowly enough to see each stitch.'},
  'board games':{draw:'I like how a simple rule can make two people think in entirely different ways.',start:'Choose a short game and play once just to understand its choices.'},
  'pottery glazes':{draw:'I like the moment when color changes the way a simple shape feels.',start:'Compare a few small samples in the same light before deciding which color you prefer.'},
  'walking trails':{draw:'A familiar walk never asks me to notice exactly the same thing twice.',start:'Take a short, familiar walk and choose one thing to pay closer attention to.'},
  'seasonal flowers':{draw:'I like having a reason to notice that a season is changing.',start:'Choose one nearby patch to look at now and again. Let the changes be the interesting part.'},
  puzzles:{draw:'A stuck moment can become a useful clue if I stop forcing the first answer.',start:'Begin with a small puzzle and explain your thinking to yourself as you go.'},
  music:{draw:'I like how a rhythm can make an ordinary task feel different.',start:'Find a short tune you enjoy and listen for one repeating part.'},
  'rainwater gardens':{draw:'I like the idea of giving ordinary runoff a useful place to go.',start:'Watch where rainwater already collects before deciding what a garden there would need.'},
  storytelling:{draw:'The details someone chooses can say as much as the events themselves.',start:'Tell a short story about a place you know. Keep the one detail you can really picture.'},
  'kite making':{draw:'I enjoy the balance between making something carefully and letting the wind have its say.',start:'Start with a simple shape and make the two sides as even as you can.'},
  sketching:{draw:'Drawing makes me look at something I would otherwise walk past.',start:'Choose one ordinary object and sketch its outline without worrying about a perfect result.'},
  'community meals':{draw:'I like a table where someone new can join the conversation.',start:'Begin with a simple shared meal and make sure everyone knows they are welcome.'},
  'repair methods':{draw:'I like understanding why a repair works, so the next problem is less of a guess.',start:'Look at one repair and ask what it changes and why.'},
  'walking routes':{draw:'A route makes more sense when you have followed its turns yourself.',start:'Follow a familiar path and notice which landmarks make the return easy.'},
  'repairable designs':{draw:'I appreciate a design that lets a worn part be replaced without starting over.',start:'Look at an everyday object and ask which part would be hardest to replace.'},
};
const interestWriting=(p:ConversationProfile)=>INTERESTS[p.interest]??{draw:`I enjoy the attention that ${p.interest} asks of me.`,start:'Start small and notice which part you actually enjoy.'};

const HOPE_ENDINGS:Record<string,string>={thoughtful:'I want to give the idea enough time to settle.',curious:'I have a few questions to work through before I start.',cheerful:'It gives me something good to look forward to.',patient:'It can begin slowly and still be worth doing.',practical:'I want to begin with the part that will be most useful.',observant:'I am looking closely at what the first step would need.',inventive:'I would like to try a small version and learn from it.',easygoing:'It need not take over every spare moment.',candid:'I am interested, but I have not finished it yet.','quietly enthusiastic':'I have to stop myself going on about it.',methodical:'I want a clear first step before a long list of plans.',welcoming:'I would like other people to feel they can take part.'};
const TOPIC_TITLES:Record<ConversationTopic,string>={day:'your day',work:'your work',home:'home',past:'your past',interests:'your interests',town:'life here',hopes:'your hopes',outlook:'what matters to you'};
function rememberedTopic(profile:ConversationProfile,topic:ConversationTopic,person:'me'|'them'):string {
  if(topic==='interests')return profile.interest;
  if(topic==='outlook')return `what matters to ${person}`;
  return TOPIC_TITLES[topic].replace(/^your /,person==='me'?'my ':'their ');
}
const ACTIVITY_LINES:Record<string,string>={
  'at home':'I am taking care of things at home.',
  'walking to work':'I am on my way to work. A little company suits the walk.',
  working:'I am in the middle of my working day, but I can spare a few words.',
  'keeping shop':'I am on shop duty. There is time for a little conversation.',
  'walking to the square':'I am heading to the square after work.',
  'meeting neighbors':'I am spending a little time with the neighbors in the square.',
  'walking home':'I am on my way home to wind down.',
};
function routinePhase(profile:ConversationProfile,context:ConversationContext):number {
  const elapsed=Number.isFinite(context.elapsed)?context.elapsed:0;
  const local=((elapsed%480+profile.phaseOffset)%480+480)%480;
  return Math.max(0,profile.routine.findIndex(phase=>local>=phase.start&&local<phase.end));
}
function activity(profile:ConversationProfile,context:ConversationContext):string {
  if(context.activity && Object.hasOwn(ACTIVITY_LINES,context.activity))return context.activity;
  if(profile.routine.length)return profile.routine[routinePhase(profile,context)]!.activity;
  return '';
}
function present(profile:ConversationProfile,context:ConversationContext):string {
  if(profile.origin==='town'&&context.life)return context.life.present;
  const a=activity(profile,context);if(a)return ACTIVITY_LINES[a]!;
  const status=context.status??'';
  if(/route threatened|sentry blocks/i.test(status))return 'I am waiting because the route is not safe to use.';
  if(/waiting for.*intake|waiting for.* L|waiting for.*repair.*overflow/i.test(status))return 'I am waiting at the intake. I need a usable supply before I can carry water home.';
  if(/waiting for.*water|water unavailable|need.*water/i.test(status))return 'Water is holding up my work at the moment.';
  if(/waiting for.*reserve capacity/i.test(status))return 'I am waiting for room in the household reserve before I can finish this delivery.';
  if(/collected.*returning home/i.test(status))return 'I have collected water and am returning to the households.';
  if(/delivered water/i.test(status))return 'I have just delivered water to the households.';
  if(/walking to.*deliver/i.test(status))return 'I am on my way to deliver water.';
  if(/walking to.*intake/i.test(status))return 'I am heading toward the intake to collect water.';
  if(/walking to.*repair/i.test(status))return 'I am heading to a workshop that needs repair.';
  if(/walking to.*workplace/i.test(status))return 'I am on my way to the workshop.';
  if(/walking to.*rest|resting|taking.*rest/i.test(status))return 'I am taking a little time to rest.';
  if(/repairing/i.test(status))return 'I am working on a workshop repair.';
  if(/working|providing.*service/i.test(status))return 'I am tending to the workshop.';
  if(context.workplaceOperational===false && profile.role==='caretaker')return 'The workshop is not operational, so my usual work is waiting.';
  if(context.waterAvailable===false)return 'The local water supply is short. That affects how the working day goes.';
  return 'I have a moment between duties. What is on your mind?';
}
function nextActivity(profile:ConversationProfile,context:ConversationContext):string {
  if(profile.origin==='town'&&context.life)return context.life.reason;
  if(profile.routine.length){
    const now=profile.routine[routinePhase(profile,context)]!;
    const current=context.activity?profile.routine.findIndex(p=>p.activity===context.activity):-1;
    const next=profile.routine[((current<0?profile.routine.indexOf(now):current)+1)%profile.routine.length]!;
    const lines:Record<string,string>={
      'at home':`My next stretch is at home, at ${profile.homeName}.`,
      'walking to work':`After this, it will be time to head to my ${profile.role} work.`,
      working:`Next comes my ${profile.role} shift.`,
      'keeping shop':'After the walk, I will be on shop duty.',
      'walking to the square':'When this shift is over, I head to the square.',
      'meeting neighbors':`After the walk, I make time for neighbors and ${profile.interest}.`,
      'walking home':`Then I head back to ${profile.homeName}.`,
    };
    return lines[next.activity]!;
  }
  if(profile.role==='carrier')return 'My work follows the water: collect from a usable intake, then carry it back to the households.';
  if(profile.role==='caretaker')return 'I return to the workshop when the place and the water supply let me work.';
  return 'I look for a workshop repair I can actually carry out. When there is no feasible repair, I rest.';
}
function homeLine(profile:ConversationProfile):string {
  if(profile.householdKind==='unspecified')return `${profile.homeName} is my home settlement. My work keeps me connected to the people there.`;
  if(profile.householdKind==='single')return `I live on my own at ${profile.homeName}. I still make time for neighbors in the square.`;
  if(profile.householdKind==='couple')return `I share ${profile.homeName} with my partner, ${profile.relationships[0]?.name??'my housemate'}. We keep our own names and divide the chores.`;
  const partners=profile.relationships.filter(r=>r.kind==='partner').map(r=>r.name);
  const parents=profile.relationships.filter(r=>r.kind==='parent').map(r=>r.name);
  const children=profile.relationships.filter(r=>r.kind==='adult child').map(r=>r.name);
  const siblings=profile.relationships.filter(r=>r.kind==='sibling').map(r=>r.name);
  const groups=[partners.length?`my partner ${list(partners)}`:'',parents.length?`my ${parents.length===1?'parent':'parents'} ${list(parents)}`:'',children.length?`my adult ${children.length===1?'child':'children'} ${list(children)}`:'',siblings.length?`my adult ${siblings.length===1?'sibling':'siblings'} ${list(siblings)}`:''].filter(Boolean);
  return `I live at ${profile.homeName} with ${groups.join(' and ')}.`;
}
function lesson(profile:ConversationProfile):string {
  const history=profile.history;
  if(/storm-damaged/.test(history))return 'That rebuilding taught me to start with what can be made useful again.';
  if(/traveling repair crew/.test(history))return 'Working with a crew made it clear how much a good explanation can save the next person.';
  if(/apprenticeship along the river/.test(history))return 'Going away gave me something to bring back, as well as a reason to value the familiar places.';
  if(/battered notebook/.test(history))return 'Practical advice lasts longer when you write it so someone else can use it.';
  if(/supplies on the valley road/.test(history))return 'I came to appreciate the ordinary things that keep a journey going.';
  if(/abandoned storeroom/.test(history))return 'It is worth looking twice at a place before deciding it has no more use.';
  if(/lending tools/.test(history))return 'A trade can grow out of people being willing to help and explain things to one another.';
  if(/long winter/.test(history))return 'Making things last asks for thought, not just doing without.';
  if(/followed a sibling/.test(history))return 'Someone can show you a way into the work, but you still have to find your own part in it.';
  if(/visited for the market/.test(history))return 'A place can become familiar through small, ordinary reasons to return.';
  if(/detailed journals/.test(history))return 'Writing something down helps me tell what I actually noticed from what I only assumed.';
  if(/every repair be explained/.test(history))return 'If I cannot explain a repair, I ought to look more closely at what I am doing.';
  return roleWriting(profile.role).proud;
}
function topicLine(profile:ConversationProfile,context:ConversationContext,topic:ConversationTopic,beat:ConversationBeat):string {
  const v=voice(profile),job=roleWriting(profile.role),interest=interestWriting(profile);
  if(profile.origin==='town'&&context.life){const life=context.life;
    if(topic==='day')return beat==='main'?life.present:beat==='detail'?life.reason:life.mood;
    if(topic==='work'&&beat==='detail')return `${job.hard} ${life.town}`;
    if(topic==='home'&&beat==='reflection')return life.social;
    if(topic==='town')return beat==='main'?life.town:beat==='detail'?life.help:life.social;
    if(topic==='hopes')return beat==='main'?`${life.desire} In the longer run, I hope to ${profile.ambition}.`:beat==='detail'?life.reason:life.mood;
    if(topic==='outlook'&&beat==='detail')return `${life.mood} I still care about ${v.value}.`;
  }
  switch(topic){
    case 'day':return beat==='main'?present(profile,context):beat==='detail'?nextActivity(profile,context):`It suits me best when there is room for ${v.value}. ${pick(profile,'day-rhythm',['I do not need every stretch of the day to feel the same.','A brief conversation can change the feel of an ordinary shift.','I like knowing what comes next without rushing toward it.'])}`;
    case 'work':return beat==='main'?`I work as ${article(profile.role)} ${profile.role}${profile.origin==='named'?` in ${profile.homeName}`:''}. I try to bring ${v.value} to it.`:beat==='detail'?job.hard:job.proud;
    case 'home':return beat==='main'?homeLine(profile):beat==='detail'?profile.householdKind==='unspecified'?'I would rather talk about the place than make my household the subject. What I can tell you is how the work here fits together.':profile.householdKind==='single'?`I have the place at ${profile.homeName} to myself. I like having room for ${profile.interest}.`:profile.householdKind==='couple'?`We share the household work at ${profile.homeName}, while keeping our own names and our own trades.`:`Everyone in our household is an adult. We share ${profile.homeName}, but each of us has our own trade and interests.`:profile.origin==='town'?`I like that home at ${profile.homeName} and time with neighbors both have a place in my routine.`:`I like the practical connections in ${profile.homeName}: homes, work, and a water route that has to join them.`;
    case 'past':return beat==='main'?profile.history:beat==='detail'?lesson(profile):profile.origin==='named'?`The part I can speak for is the work I do now: ${lowerFirst(job.proud)}`:`I would still want a place for ${profile.interest} and useful ${profile.role} work. The route here shaped what I notice.`;
    case 'interests':return beat==='main'?`Away from work, I am drawn to ${profile.interest}. ${interest.draw}`:beat==='detail'?interest.draw:interest.start;
    case 'town':return beat==='main'?profile.origin==='town'?`Hearthmere gives me a place for my ${profile.role} work and a home at ${profile.homeName}. ${pick(profile,'town',['I like having neighbors to meet in the square.','I value the ordinary conversations between one errand and the next.','A town feels more familiar once you know who is behind a few doors.'])}`:`In ${profile.homeName}, homes and workshops depend on one another. ${context.waterAvailable===false?'The water shortage makes that especially clear just now.':'My part of that is the '+profile.role+' work.'}`:beat==='detail'?profile.origin==='town'?'The square is a good place to meet neighbors. Market street is useful when you are finding your way around.':`I would start with the homes and local workshops in ${profile.homeName}. For water work, learn the route to the intake as well.`:profile.origin==='town'?`I would like to ${profile.ambition}. That is one small way I could make this place easier to live in.`:`${context.workplaceOperational===false?'Getting the workshop operational would help. ':context.waterAvailable===false?'A usable water supply would help. ':''}${job.proud}`;
    case 'hopes':return beat==='main'?`I hope to ${profile.ambition}. ${HOPE_ENDINGS[profile.personality]??HOPE_ENDINGS.thoughtful}`:beat==='detail'?job.step:`${job.proud} For me, that connects with ${v.value}.`;
    case 'outlook':return beat==='main'?`I care about ${v.value}. ${pick(profile,'outlook',['It gives me a way to decide where to put my attention.','It is a small thing to return to when a day gets complicated.','I do not always manage it, but it is worth trying.'])}`:beat==='detail'?`${job.hard} That is where ${v.value} becomes something I have to practice.`:`I would ask what their experience has taught them. ${v.skeptical}`;
  }
}
function topicQuestion(profile:ConversationProfile,topic:ConversationTopic):string {
  return {day:'How is your day going?',work:'What is your work like?',home:'Who do you share your home with?',past:'What brought you to this part of the valley?',interests:`What do you enjoy when work is over?`,town:'How does life here suit you?',hopes:'Is there something you are hoping to do?',outlook:'What matters most to you?'}[topic];
}
function followups(profile:ConversationProfile,topic:ConversationTopic):readonly [string,string] {
  return {
    day:['What are you doing after this?','Does that rhythm suit you?'],
    work:['What is the hardest part of the job?','What makes a job feel well done?'],
    home:['What is home life like for you?','What do you like about your neighborhood?'],
    past:['What did you take away from that?','Would you make the same choice again?'],
    interests:[`What draws you to ${profile.interest}?`,'How would I try it for myself?'],
    town:['Where would you send someone who is new here?','What could make life here a little better?'],
    hopes:['What would a good first step look like?','What makes that worth pursuing?'],
    outlook:['Has that ever been difficult to stick to?','What would you tell someone who sees it differently?'],
  }[topic] as [string,string];
}
const REACTION_CHOICES:Record<ConversationTopic,Record<ConversationTone,string>>={
  day:{supportive:'I am glad you made room for a conversation.',skeptical:'That rhythm would feel a little repetitive to me.',playful:'So I have become an unscheduled part of your day.',direct:'What is the important thing you need to get to next?'},
  work:{supportive:'That sounds like work worth doing carefully.',skeptical:'I am not sure careful work always gets appreciated.',playful:'It sounds like you have strong opinions about doing it properly.',direct:'What matters most when you are doing the job?'},
  home:{supportive:'It sounds good to have a place that is yours.',skeptical:'Home does not always feel as simple as that.',playful:'I see. Even home comes with its own little routine.',direct:'What should I understand about your home life?'},
  past:{supportive:'I can see why that experience stayed with you.',skeptical:'I wonder if someone else would take a different lesson from it.',playful:'That sounds like the beginning of a much longer story.',direct:'What part of that experience still matters now?'},
  interests:{supportive:'I like how much you notice in something you enjoy.',skeptical:'I am not sure I would have the patience for it.',playful:'You are making a good case for avoiding work for an afternoon.',direct:'What is one simple way I could give it a try?'},
  town:{supportive:'Those everyday connections sound worth looking after.',skeptical:'A town can be harder to belong to than it looks.',playful:'You are giving me the unofficial neighborhood tour.',direct:'Where should I start if I want to understand the place?'},
  hopes:{supportive:'That sounds like a worthwhile thing to work toward.',skeptical:'Is that manageable alongside your ordinary work?',playful:'So your quiet plans are turning into a grand project.',direct:'What is the smallest useful first step?'},
  outlook:{supportive:'I can see the value in looking at things that way.',skeptical:'I do not think that approach works in every situation.',playful:'I suspect you have thought about this more than you let on.',direct:'How does that change what you actually do?'},
};
function reactionLine(profile:ConversationProfile,context:ConversationContext,topic:ConversationTopic,beat:ConversationBeat,tone:ConversationTone):string {
  const v=voice(profile),job=roleWriting(profile.role);
  const detail=topic==='day'?nextActivity(profile,context):topic==='work'?tone==='skeptical'?'Appreciation is welcome, but I still want the work itself to be sound.':job.proud:topic==='home'?profile.householdKind==='unspecified'?`My home settlement is ${profile.homeName}; I prefer to leave family matters private.`:tone==='skeptical'?'That is true. An address tells you where someone lives, not everything it feels like.':profile.householdKind==='single'?`I live on my own at ${profile.homeName}. Quiet time and company both matter to me.`:`Sharing ${profile.homeName} does not mean we all think alike.`:topic==='past'?lesson(profile):topic==='interests'?tone==='skeptical'?'You can give something a short try without deciding it must become your hobby.':tone==='direct'?interestWriting(profile).start:interestWriting(profile).draw:topic==='town'?tone==='skeptical'?'Yes. A familiar face and a useful introduction can help, but they do not settle everything.':topicLine(profile,context,'town','detail'):topic==='hopes'?tone==='skeptical'?'I would need to begin small. An ambition is a direction, not a claim that I have finished the work.':job.step:tone==='skeptical'?'No single habit covers every situation. I would rather adjust it than defend it blindly.':`It means I try to bring ${v.value} into my ${profile.role} work.`;
  // Reaction specificity follows both the selected subject and current follow-up.
  const prefix=beat==='reflection'&&tone==='supportive'?pick(profile,`support-${topic}`,[v.supportive,'I am glad the reason makes sense to you.']):v[tone];
  return `${prefix} ${detail}`;
}
function boundedLine(text:string):string {
  const clean=text.replace(/\s+/g,' ').trim();
  if(clean.length<=240)return clean;
  const end=clean.lastIndexOf('. ',237);if(end>=95)return clean.slice(0,end+1);
  return `${clean.slice(0,237).replace(/\s+\S*$/,'')}…`;
}
function entryFor(memory:ConversationMemory,id:string){return memory.residents.find(entry=>entry.residentId===id);}
function remember(memory:ConversationMemory,id:string,topic:ConversationTopic|null,beat:ConversationBeat='main',tone:ConversationTone|null=null):ConversationMemory {
  const old=entryFor(memory,id);
  const entry:ConversationResidentMemory={residentId:id,topics:topic?[...(old?.topics??[]).filter(t=>t!==topic),topic]:old?.topics??[],lastTopic:topic??old?.lastTopic??null,lastTone:topic?tone:old?.lastTone??null,lastBeat:topic?beat:old?.lastBeat??'main'};
  if(old && JSON.stringify(old)===JSON.stringify(entry))return memory;
  return freeze({version:1,seed:memory.seed,residents:[...memory.residents.filter(item=>item.residentId!==id),entry].slice(-CONVERSATION_MEMORY_MAX_RESIDENTS)});
}
function checkProfile(profile:ConversationProfile,seed:number){requireSeed(seed);if(!validId(profile.id,seed))throw new RangeError('Conversation profile does not belong to this seed.');}
function checkSession(profile:ConversationProfile,context:ConversationContext,session:ConversationSession){
  checkProfile(profile,context.seed);
  if(session.version!==1||session.seed!==context.seed||session.residentId!==profile.id)throw new RangeError('Conversation session does not match this resident and seed.');
}
export function openConversation(profile:ConversationProfile,context:ConversationContext,memory:ConversationMemory):ConversationResult {
  checkProfile(profile,context.seed);
  const safe=validConversationMemory(memory,context.seed)?memory:createConversationMemory(context.seed),old=entryFor(safe,profile.id);
  const session:ConversationSession=freeze({version:1,seed:context.seed,residentId:profile.id,gone:false,menuShifted:false,topic:null,beat:'main',tone:null,returning:!!old,previousTopic:old?.lastTopic??null,previousTone:old?.lastTone??null});
  return {session,memory:remember(safe,profile.id,null)};
}
/** Navigation alone changes neither remembered subjects nor remembered reactions. */
export function backConversation(session:ConversationSession):ConversationSession {
  return session.gone||session.topic===null?session:freeze({...session,topic:null,beat:'main',tone:null,menuShifted:true});
}
/** Invalid/stale IDs are a no-op; only displayed branch IDs and the two UI-owned sentinels are accepted. */
export function chooseConversation(profile:ConversationProfile,context:ConversationContext,session:ConversationSession,memory:ConversationMemory,choiceId:string):ConversationResult {
  checkSession(profile,context,session);
  if(!validConversationMemory(memory,context.seed))return {session,memory:createConversationMemory(context.seed)};
  if(session.gone)return {session,memory};
  if(choiceId==='leave')return {session:freeze({...session,gone:true}),memory};
  if(choiceId==='topics')return {session:backConversation(session),memory};
  const choice=conversationView(profile,context,session,memory).choices.find(item=>item.id===choiceId);
  if(!choice)return {session,memory};
  const parts=choiceId.split(':');
  const topic=parts[1] as ConversationTopic;
  const next:ConversationSession=freeze({...session,topic,beat:choice.kind==='followup'?parts[2] as ConversationBeat:choice.kind==='reaction'?session.beat:'main',tone:choice.kind==='reaction'?parts[2] as ConversationTone:null});
  return {session:next,memory:remember(memory,profile.id,topic,next.beat,next.tone)};
}
export function conversationView(profile:ConversationProfile,context:ConversationContext,session:ConversationSession,memory:ConversationMemory):ConversationView {
  checkSession(profile,context,session);
  const safe=validConversationMemory(memory,context.seed)?memory:createConversationMemory(context.seed);
  const remembered=entryFor(safe,profile.id);
  const topic=session.topic;
  let line:string,choices:ConversationChoice[]=[];
  if(session.gone)line=pick(profile,'goodbye',['Take care on your way. It was good to talk.','I will let you get on. See you around.','Until next time. Look after yourself.']);
  else if(!topic){
    let greeting:string;
    if(session.menuShifted)greeting=pick(profile,'topic-shift',['What else is on your mind?','We can talk about something else. What would you like to know?','There is room for another question. Where shall we go next?']);
    else if(!session.returning)greeting=`I am ${profile.name}.`;
    else if(session.previousTopic)greeting=session.previousTone==='skeptical'?`Last time, you pushed back when we talked about ${rememberedTopic(profile,session.previousTopic,'me')}. I do not mind picking that up again.`:session.previousTone==='playful'?`Good to see you. I remember your joke when we talked about ${rememberedTopic(profile,session.previousTopic,'me')}.`:`Good to see you again. We talked about ${rememberedTopic(profile,session.previousTopic,'me')} last time.`;
    else greeting='Good to see you again. We only had a moment before.';
    line=session.menuShifted?greeting:`${greeting} ${present(profile,context)}`;
    choices=CONVERSATION_TOPICS.map(t=>({id:`topic:${t}`,text:topicQuestion(profile,t),kind:'topic'}));
  }else{
    line=session.tone?reactionLine(profile,context,topic,session.beat,session.tone):topicLine(profile,context,topic,session.beat);
    const follow=followups(profile,topic);
    choices=[{id:`followup:${topic}:detail`,text:follow[0],kind:'followup'},{id:`followup:${topic}:reflection`,text:follow[1],kind:'followup'},...CONVERSATION_TONES.map(tone=>({id:`reaction:${topic}:${tone}`,text:REACTION_CHOICES[topic][tone],kind:'reaction' as const}))];
  }
  return freeze({name:profile.name,role:profile.role,subtitle:`${cap(profile.personality)} ${profile.role} · ${profile.homeName}`,line:boundedLine(line),choices,topic,remembered:remembered?.lastTopic?`You last talked about ${rememberedTopic(profile,remembered.lastTopic,'them')}${remembered.lastTone?`; your response was ${remembered.lastTone}`:''}.`:null,canBack:topic!==null&&!session.gone,gone:session.gone});
}

/** Stable production/emitted verification surface, consumed by the actual game. */
export const CONVERSATION_ENGINE=Object.freeze({kind:'axiom-npc-dialogue',version:CONVERSATION_VERSION,open:openConversation,choose:chooseConversation,view:conversationView,townProfile:townConversationProfile,namedProfile:namedConversationProfile,createMemory:createConversationMemory,back:backConversation});
