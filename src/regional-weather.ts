/** Pure, bounded seasonal approximation, not an unbounded unique forecast.
 * One seed-derived 2,500-active-second season repeats exactly. A wet opening,
 * a 2,000–2,040s drought, recovery rain, and a final dry phase share front timings
 * everywhere; broad climate zones only change the local intensity.
 * No terrain generation, mutable RNG, wall clock, or persisted weather state.
 * Simulation tick t consumes index t - 1; intervals below are [start, end).
 */
export const REGIONAL_WEATHER_PERIOD_TICKS=10_000;
export const REGIONAL_WEATHER_STEP=.25;
export const REGIONAL_WEATHER_MAX_TICKS=1_000_000_000;
export type RegionalWeatherIntensity=0|.5|1|1.5|2;
export type RegionalWeatherCondition='dry'|'drizzle'|'rain'|'storm';
export type RegionalWeatherFront='opening'|'drought'|'recovery'|'clearing';
export type RegionalWeatherZone='valley'|'meadow'|'pine-highlands'|'redstone-uplands'|'river-corridor'|'windward-heath';
export interface RegionalWeatherSnapshot {
 phase:RegionalWeatherCondition;
 intensity:RegionalWeatherIntensity;
 front:RegionalWeatherFront;
 zoneId:RegionalWeatherZone;
 /** Continuous dry time at the start of this tick; zero during precipitation. */
 drySeconds:number;
 secondsUntilChange:number;
 /** Elapsed active seconds within the repeating season, not its duration. */
 cycleSeconds:number;
 periodSeconds:number;
 cycleTick:number;
 nextCondition:RegionalWeatherCondition;
 nextIntensity:RegionalWeatherIntensity;
 nextChangeTick:number;
 /** Absolute boundaries of the broad front (recovery contains three conditions). */
 frontStartTick:number;
 frontEndTick:number;
}
interface Segment {start:number;end:number;intensity:RegionalWeatherIntensity;front:RegionalWeatherFront}
interface Season {zoneId:RegionalWeatherZone;segments:readonly Segment[];recoveryStart:number;recoveryEnd:number}
// A bounded optimization only: eviction or query order cannot alter the forecast.
const schedules=new Map<string,Season>();
const SCHEDULE_CACHE_LIMIT=48;
function validSeed(seed:number){if(!Number.isInteger(seed)||seed<0||seed>0xffff_ffff)throw new RangeError('Weather seed must be uint32');}
function validTick(tick:number){if(!Number.isInteger(tick)||tick<0||tick>REGIONAL_WEATHER_MAX_TICKS)throw new RangeError('Weather tick must be an integer from 0 to 1000000000');}
function hash(seed:number,salt:number){let h=(seed^salt)>>>0;h=Math.imul(h^(h>>>16),0x7feb352d);h=Math.imul(h^(h>>>15),0x846ca68b);return (h^(h>>>16))>>>0;}
/** Climate footprints intentionally approximate geographic exposure; these are
 * not exact terrain-biome borders and never query rivers, height, or chunks. */
function zoneAt(seed:number,x:number,z:number):RegionalWeatherZone {
 if(!Number.isFinite(x)||!Number.isFinite(z))throw new RangeError('Weather coordinates must be finite');
 if(Math.max(Math.abs(x),Math.abs(z))<=80)return 'valley';
 const shift=(hash(seed,0xa718b63d)%49)-24;
 if(Math.abs(x-shift)<=65)return 'river-corridor';
 if(x< -380+shift&&z>180)return 'pine-highlands';
 if(x>350+shift&&z< -260)return 'redstone-uplands';
 if(z>430||x>740+shift)return 'windward-heath';
 return 'meadow';
}
function season(seed:number,x:number,z:number):Season {
 validSeed(seed);
 const zoneId=zoneAt(seed,x,z),key=`${seed}:${zoneId}`,cached=schedules.get(key);
 if(cached){schedules.delete(key);schedules.set(key,cached);return cached;}
 const openingEnd=(160+hash(seed,0x619d08c3)%61)*4;
 const recoveryStart=openingEnd+(2000+hash(seed,0x4d79fe21)%41)*4;
 const recoveryLength=(160+hash(seed,0x920dc7ab)%61)*4,recoveryEnd=recoveryStart+recoveryLength;
 const wet=zoneId==='pine-highlands'||zoneId==='river-corridor'||zoneId==='windward-heath'||
  (zoneId!=='redstone-uplands'&&hash(seed,zoneId==='valley'?0xd421dc3b:0x769741e5)%2===0);
 const coreStart=recoveryStart+recoveryLength/4,tailStart=recoveryStart+3*recoveryLength/4;
 const result:Season={zoneId,recoveryStart,recoveryEnd,segments:[
  {start:0,end:openingEnd,intensity:wet?2:1.5,front:'opening'},
  {start:openingEnd,end:recoveryStart,intensity:0,front:'drought'},
  {start:recoveryStart,end:coreStart,intensity:wet?1.5:1,front:'recovery'},
  {start:coreStart,end:tailStart,intensity:wet?2:1.5,front:'recovery'},
  {start:tailStart,end:recoveryEnd,intensity:wet?1:.5,front:'recovery'},
  {start:recoveryEnd,end:REGIONAL_WEATHER_PERIOD_TICKS,intensity:0,front:'clearing'},
 ]};
 for(const segment of result.segments)Object.freeze(segment);
 Object.freeze(result.segments);Object.freeze(result);
 if(schedules.size>=SCHEDULE_CACHE_LIMIT)schedules.delete(schedules.keys().next().value!);
 schedules.set(key,result);return result;
}
function condition(intensity:RegionalWeatherIntensity):RegionalWeatherCondition {return intensity===0?'dry':intensity===.5?'drizzle':intensity===1?'rain':'storm';}
/** Forecast at the start of an integer quarter-second weather index. */
export function regionalWeatherAt(seed:number,x:number,z:number,tickIndex:number):RegionalWeatherSnapshot {
 validTick(tickIndex);
 const schedule=season(seed,x,z),cycleTick=tickIndex%REGIONAL_WEATHER_PERIOD_TICKS,cycleStart=tickIndex-cycleTick;
 const index=schedule.segments.findIndex(s=>cycleTick<s.end),current=schedule.segments[index]!,next=schedule.segments[(index+1)%schedule.segments.length]!;
 const frontStart=current.front==='recovery'?schedule.recoveryStart:current.start,frontEnd=current.front==='recovery'?schedule.recoveryEnd:current.end;
 return {phase:condition(current.intensity),intensity:current.intensity,front:current.front,zoneId:schedule.zoneId,
  drySeconds:current.intensity===0?(cycleTick-current.start)*REGIONAL_WEATHER_STEP:0,
  secondsUntilChange:(current.end-cycleTick)*REGIONAL_WEATHER_STEP,
  cycleSeconds:cycleTick*REGIONAL_WEATHER_STEP,periodSeconds:REGIONAL_WEATHER_PERIOD_TICKS*REGIONAL_WEATHER_STEP,cycleTick,
  nextCondition:condition(next.intensity),nextIntensity:next.intensity,nextChangeTick:cycleStart+current.end,
  frontStartTick:cycleStart+frontStart,frontEndTick:cycleStart+frontEnd};
}
/** Exact sum of local intensities for integer indices [startTick, endTick).
 * Multiply by .25 and the collector's litres/second rate for potential litres.
 * At most six segment intersections per prefix, regardless of interval length.
 * Half-integer units keep all results exact throughout the billion-tick range.
 */
export function regionalWeatherRainUnits(seed:number,x:number,z:number,startTick:number,endTick:number):number {
 validTick(startTick);validTick(endTick);
 if(endTick<startTick)throw new RangeError('Weather interval end must not precede start');
 const {segments}=season(seed,x,z);
 const cycleUnits=segments.reduce((sum,s)=>sum+(s.end-s.start)*s.intensity,0);
 const prefix=(tick:number)=>{
  const remainder=tick%REGIONAL_WEATHER_PERIOD_TICKS;
  return Math.floor(tick/REGIONAL_WEATHER_PERIOD_TICKS)*cycleUnits+
   segments.reduce((sum,s)=>sum+Math.max(0,Math.min(remainder,s.end)-s.start)*s.intensity,0);
 };
 return prefix(endTick)-prefix(startTick);
}
