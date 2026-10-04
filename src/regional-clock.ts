/** Only the subquarter phase uses integer picoseconds; whole ticks remain split.
 * This never multiplies the potentially billion-tick clock into a large float.
 * Old saved phases normalize by less than one picosecond on a positive step. */
export interface RegionalClockPoint {ticks:number;remainder:number}
export const REGIONAL_CLOCK_UNITS=1_000_000_000_000;
export const REGIONAL_CLOCK_STEP_UNITS=250_000_000_000;
const units=(seconds:number)=>Math.round(seconds*REGIONAL_CLOCK_UNITS);
// A legacy phase just below .25 must not carry a saved tick during normalization.
const phaseUnits=(seconds:number)=>Math.min(REGIONAL_CLOCK_STEP_UNITS-1,units(seconds));
/** Read-only canonical phase for a new cross-domain clock baseline. */
export function regionalClockNormalize(point:RegionalClockPoint):RegionalClockPoint {return {ticks:point.ticks,remainder:phaseUnits(point.remainder)/REGIONAL_CLOCK_UNITS};}
export function regionalClockDifference(end:RegionalClockPoint,start:RegionalClockPoint):RegionalClockPoint {
 const phase=phaseUnits(end.remainder)-phaseUnits(start.remainder),carry=Math.floor(phase/REGIONAL_CLOCK_STEP_UNITS);
 return {ticks:end.ticks-start.ticks+carry,remainder:(phase-carry*REGIONAL_CLOCK_STEP_UNITS)/REGIONAL_CLOCK_UNITS};
}
export function regionalClockAdd(start:RegionalClockPoint,delta:RegionalClockPoint):RegionalClockPoint {
 if(delta.ticks===0&&phaseUnits(delta.remainder)===0)return {...start};
 const phase=phaseUnits(start.remainder)+phaseUnits(delta.remainder),carry=Math.floor(phase/REGIONAL_CLOCK_STEP_UNITS);
 return {ticks:start.ticks+delta.ticks+carry,remainder:(phase-carry*REGIONAL_CLOCK_STEP_UNITS)/REGIONAL_CLOCK_UNITS};
}
/** Matches the regional models' bounded one-second accepted update. */
export function regionalClockAdvance(start:RegionalClockPoint,dt:number,maxTicks=1_000_000_000):RegionalClockPoint {
 if(!Number.isFinite(dt)||dt<=0||start.ticks>=maxTicks)return {...start};
 const phase=units(Math.min(dt,1)),ticks=Math.floor(phase/REGIONAL_CLOCK_STEP_UNITS),delta={ticks,remainder:(phase-ticks*REGIONAL_CLOCK_STEP_UNITS)/REGIONAL_CLOCK_UNITS},next=regionalClockAdd(start,delta);
 return next.ticks>=maxTicks?{ticks:maxTicks,remainder:0}:next;
}
