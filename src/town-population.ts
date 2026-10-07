import {townResidents,townResidentPose} from './town-residents.ts';
import {startingTown} from './starting-town.ts';
export const TOWN_TUNING_FIELDS={
 population:{default:100,min:7,max:100,step:1,unit:'residents',description:'Number in this disposable scenario; the campaign roster stays 100.',effect:'reset'},
 activeBudget:{default:24,min:8,max:48,step:1,unit:'nearby activity samples',description:'Nearest residents receive full work/greeting detail at 10 Hz; others sample activity at 2 Hz with quiet breathing. Walking stays render-rate.',effect:'apply'},
 activityScale:{default:1,min:0,max:2,step:.25,unit:'× routine speed',description:'Shared route schedule speed in the disposable scenario. Zero pauses routines.',effect:'apply'},
 appearanceVariety:{default:1,min:0,max:1,step:1,unit:'off/on silhouettes',description:'Seeded body shapes, clothing layers, hair, headwear and role accessories.',effect:'apply'},
 gaitScale:{default:1,min:0,max:1.25,step:.25,unit:'× gait amplitude',description:'Articulated legs, feet and opposed arms. One is distance-matched stance; other values are diagnostic.',effect:'apply'},
 gestures:{default:1,min:0,max:1,step:1,unit:'off/on idle gestures',description:'Breathing, short greetings and shop/work gestures during routine dwell periods.',effect:'apply'},
 avoidance:{default:1,min:0,max:1,step:.25,unit:'× NPC spacing',description:'Bounded, wall-clipped crowd separation. Player swept contact and minimum body clearance remain enabled; zero disables the extra soft spacing.',effect:'apply'},
} as const;
export type TownTuning={ [K in keyof typeof TOWN_TUNING_FIELDS]:number };
export const DEFAULT_TOWN_TUNING:TownTuning=Object.fromEntries(Object.entries(TOWN_TUNING_FIELDS).map(([k,v])=>[k,v.default])) as TownTuning;
export function validateTownTuning(v:unknown):TownTuning{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==Object.keys(TOWN_TUNING_FIELDS).length)throw Error('Expected all version-2 town settings');for(const [k,f]of Object.entries(TOWN_TUNING_FIELDS)){const n=(v as Record<string,unknown>)[k];if(typeof n!=='number'||!Number.isFinite(n)||n<f.min||n>f.max||Math.abs(n/f.step-Math.round(n/f.step))>1e-8)throw Error('Invalid '+k);}return {...v} as TownTuning;}
/** Coarse activity budget only. Never use these cached samples as collision authority. */
export class TownPopulation{
 readonly residents;readonly plan;readonly poses:ReturnType<typeof townResidentPose>[];private near:number[]=[];private nearAt=-Infinity;private farAt=-Infinity;private sampleClock=-Infinity;activeCount=0;visibleCount=0;updates=0;
 readonly seed:number;
 constructor(seed:number,townLayout?:import('./starting-town.ts').TownLayout){this.seed=seed;this.residents=townResidents(seed);this.plan=startingTown(seed,townLayout);this.poses=this.residents.map(r=>townResidentPose(r,0,this.plan));}
 isActive(index:number){return this.near.includes(index);}
 update(elapsed:number,observer:{x:number;z:number},tuning:TownTuning=DEFAULT_TOWN_TUNING,force=false){
  if(!Number.isFinite(elapsed)||elapsed<0)return false;
  const time=elapsed*tuning.activityScale,reset=force||time<this.sampleClock;this.sampleClock=time;let changed=false;
  if(reset||elapsed-this.nearAt>=.1-1e-9){this.nearAt=elapsed;this.near=this.poses.map((p,i)=>({i,d:Math.hypot(p.x-observer.x,p.z-observer.z)})).filter(p=>p.i<tuning.population&&p.d<44).sort((a,b)=>a.d-b.d||a.i-b.i).slice(0,tuning.activeBudget).map(v=>v.i);for(const i of this.near){this.poses[i]=townResidentPose(this.residents[i]!,time,this.plan);this.updates++;}changed=true;}
  if(reset||elapsed-this.farAt>=.5-1e-9){this.farAt=elapsed;for(let i=0;i<tuning.population;i++)if(!this.near.includes(i)){this.poses[i]=townResidentPose(this.residents[i]!,time,this.plan);this.updates++;}changed=true;}
  this.activeCount=this.near.length;this.visibleCount=this.poses.slice(0,tuning.population).filter(p=>Math.hypot(p.x-observer.x,p.z-observer.z)<90).length;return changed;
 }
}
