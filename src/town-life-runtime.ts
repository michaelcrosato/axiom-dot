import {TownCrowd,TOWN_RENDER_TIMING,type TownActor} from './town-crowd.ts';
import {TOWN_LIFE_ENGINE,TOWN_LIFE_STEP,townLifeCommandPosition,type TownLifeCommand,type TownLifeState} from './town-life.ts';
import type {TownResidentPose} from './town-residents.ts';
/** Read-only projection cache follows resident identity, not 60 Hz accumulator objects. */
const projections=new WeakMap<object,readonly TownResidentPose[]>();
export function townLifePoses(life:TownLifeState|undefined):readonly TownResidentPose[]|undefined {
 if(!life)return undefined;let poses=projections.get(life.residents);
 if(!poses){poses=Object.freeze(life.residents.map((_,index)=>{const p=TOWN_LIFE_ENGINE.pose(life,index);return Object.freeze({...p,authoritativeMotion:1 as const,contactResolved:p.contactResolved??false,motionPath:p.motionPath??Object.freeze([{x:p.x,z:p.z,t:0},{x:p.x,z:p.z,t:TOWN_LIFE_STEP}].map(q=>Object.freeze(q)))});}));projections.set(life.residents,poses);}return poses;
}

const crowds=new Map<number,TownCrowd>();
/** Resolve only at eligibility/action boundaries. Actors are local or server-authenticated, never command data. */
export function townLifeInteractionTarget(life:TownLifeState,command:TownLifeCommand,actors:readonly TownActor[]=[]):{x:number;z:number}|undefined {
 if(command.kind!=='encourage-resident')return townLifeCommandPosition(life,command);
 const index=life.residents.findIndex(r=>r.id===command.targetId);if(index<0)return undefined;
 let crowd=crowds.get(life.seed);if(!crowd){crowd=new TownCrowd(life.seed);crowds.set(life.seed,crowd);while(crowds.size>4)crowds.delete(crowds.keys().next().value!);}
 const pose=crowd.sample(0,100,1,actors,townLifePoses(life))[index];return pose?{x:pose.x,z:pose.z}:undefined;
}

/** Presentation follows its own authoritative active-play clock, not regional clocks. */
export function townLifeClock(life:TownLifeState):number{return life.tick*TOWN_LIFE_STEP+life.accumulator;}
/** The gameplay frame cap must not discard crowd presentation time below 20 FPS. */
export function townFrameSeconds(rawFrameMs:number):number{return Number.isFinite(rawFrameMs)?Math.min(TOWN_RENDER_TIMING.maxFrameSeconds,Math.max(0,rawFrameMs/1000)):0;}
/** A genuine connection resume is a lifecycle replacement, unlike a slow frame.
 * No timeout/distance heuristic can turn ordinary rendering lag into a reset. */
export class TownSnapshotContinuity {
 private interrupted=false;private pending=false;
 note(status:string){if(status==='offline'){this.interrupted=false;this.pending=false;}else if(status==='paused'||status==='reconnecting')this.interrupted=true;else if(status==='connected'&&this.interrupted){this.interrupted=false;this.pending=true;}}
 take(authorityGap:number){const value=this.pending&&Number.isFinite(authorityGap)&&authorityGap>TOWN_RENDER_TIMING.resumeGapSeconds;this.pending=false;return value;}
}
