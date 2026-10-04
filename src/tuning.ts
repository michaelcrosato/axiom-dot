/** Versioned, session-only laboratory controls. Never stored in a campaign save. */
export const LAB_TUNING_VERSION=2;
const field=(label:string,min:number,max:number,step:number,value:number,group:string,unit:string,description:string,consumer:string,effect:'apply'|'reset'='apply')=>({label,min,max,step,default:value,group,unit,description,consumer,effect});
export const TUNING_FIELDS={
 speedScale:field('Top speed',.4,1.6,.05,1,'Movement','×','Scales walk, jog, run and sprint in the isolated course.','locomotion.stepMotor'),
 acceleration:field('Acceleration',8,45,1,22,'Movement','m/s²','How quickly horizontal movement gains speed.','locomotion.stepMotor'),
 braking:field('Braking',8,55,1,30,'Movement','m/s²','How quickly movement stops after release.','locomotion.stepMotor'),
 reversal:field('Direction reversal',12,65,1,40,'Movement','m/s²','Deceleration while pushing opposite to travel.','locomotion.stepMotor'),
 airControl:field('Air control',.1,1,.05,.6,'Movement','fraction','Horizontal steering available while airborne.','locomotion.stepMotor'),
 turnRate:field('Facing response',3,18,.5,10,'Movement','rad/s','How quickly movement turns gameplay facing.','main.stepFacing'),
 slideDuration:field('Slide duration',.25,1.1,.05,.68,'Movement','s','Maximum momentum-slide duration.','locomotion.stepMotor'),
 slideFriction:field('Slide drag',3,14,.1,7.2,'Movement','m/s²','Rate of speed loss during a slide.','locomotion.stepMotor'),
 jumpSpeed:field('Jump launch',4,9,.2,6.6,'Jump & camera','m/s','Initial vertical launch speed; test ceiling clearance too.','physics.worker jump'),
 gravity:field('Gravity',12,28,1,18,'Jump & camera','m/s²','Downward acceleration; affects apex and airtime.','physics.worker gravity'),
 cameraFollow:field('Camera follow response',3,24,1,12,'Jump & camera','1/s','Higher values follow the player more tightly.','main camera follow'),
 cameraLead:field('Camera velocity lead',0,.35,.01,.12,'Jump & camera','s','Look-ahead in the current movement direction.','main camera lead'),
 hitstopScale:field('Visual impact hold',0,1.5,.1,1,'Feedback','×','Pose-only contact hold. Never changes simulation time. Reduced motion disables it.','main consumeCombat'),
 shake:field('Impact shake',0,.16,.01,.04,'Feedback','m','Camera contact shake. Reduced motion disables it.','main camera shake'),
 comboTempo:field('Combo duration',.65,1.5,.05,1,'Combat','×','Scales preparation, contact and recovery. Lower is faster. An active strike keeps its committed timing.','main combatTuning'),
 comboBuffer:field('Late combo buffer',.08,.4,.02,.30,'Combat','s','Window for queuing the next strike.','main combatTuning'),
 knockback:field('Target recoil',0,1.5,.1,1,'Feedback','×','Visual target recoil, not rigid-body force.','main combatTuning'),
 staminaRegen:field('Stamina regeneration',8,60,2,24,'Combat','/s','Idle regeneration after the existing delay.','main combatTuning'),
 staffDamage:field('Player staff damage',.25,2,.05,1,'Combat','×','Scales actual equipped staff hit damage; each strike is capped at 100 HP.','main combatTuning'),
 staminaCost:field('Staff stamina cost',.25,2,.05,1,'Combat','×','Scales the actual cost charged when each staff stage begins.','main combatTuning'),
 enemyDamage:field('Sentry damage',.1,3,.1,1,'Combat','×','Scales each real sentry contact: 12 HP at 1×. Guard and collision still decide whether it lands. Live sentry only.','live-sentry-practice → advanceEncounters','reset'),
} as const;
export type TuningKey=keyof typeof TUNING_FIELDS;
export type LabTuning={[K in TuningKey]:number};
export const DEFAULT_TUNING=Object.freeze(Object.fromEntries(Object.entries(TUNING_FIELDS).map(([k,v])=>[k,v.default])) as LabTuning);
export function sanitizeTuning(value:unknown):LabTuning{const v=(value&&typeof value==='object'?value:{}) as Partial<LabTuning>;return Object.fromEntries(Object.entries(TUNING_FIELDS).map(([k,d])=>[k,typeof v[k as TuningKey]==='number'&&Number.isFinite(v[k as TuningKey])?Math.max(d.min,Math.min(d.max,v[k as TuningKey]!)):d.default])) as LabTuning;}
/** Portable input is strict. Runtime sanitization remains tolerant for old defaults. */
export function validateLabTuning(value:unknown):LabTuning{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Tuning must be an object');
 const v=value as Record<string,unknown>,keys=Object.keys(TUNING_FIELDS);
 if(Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!Object.hasOwn(TUNING_FIELDS,k)))throw Error('Unknown or missing tuning fields');
 for(const key of keys){const d=TUNING_FIELDS[key as TuningKey],n=v[key];if(typeof n!=='number'||!Number.isFinite(n)||n<d.min||n>d.max)throw Error(`${d.label} must be ${d.min}–${d.max} ${d.unit}`);}
 return {...v} as LabTuning;
}
export function resetTuningGroup(tuning:LabTuning,group:string):LabTuning{return Object.fromEntries(Object.entries(TUNING_FIELDS).map(([k,d])=>[k,d.group===group?d.default:tuning[k as TuningKey]])) as LabTuning;}
