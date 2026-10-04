import {regionalWeatherAt,REGIONAL_WEATHER_PERIOD_TICKS,REGIONAL_WEATHER_STEP} from './regional-weather.ts';
import type {RegionalTradeRoutePlan} from './regional-trade.ts';

/** One immutable midpoint climate sample applies to an entire existing freight
 * corridor. This intentionally bounded approximation does not create new road
 * geometry or promise point-by-point terrain moisture. Rain immediately sets
 * wetness to intensity / 2; each completed 30 dry seconds removes 1/4 wetness.
 * Speeds are 0.9–1.8 m/s. Integer micrometres per quarter tick keep integration
 * exact, independent of frame partition, forecast query order and save reload. */
export const REGIONAL_TRADE_DRYING_TICKS=120;
export const REGIONAL_TRADE_MIN_SPEED=.9;
interface Segment {start:number;end:number;wetness:number;microPerTick:number;condition:'dry'|'wet'|'drying'}
interface Corridor {x:number;z:number;segments:Segment[];cycleMicro:number}
const corridors=new WeakMap<RegionalTradeRoutePlan,Corridor>();
function corridor(seed:number,route:RegionalTradeRoutePlan):Corridor {
 const cached=corridors.get(route);if(cached)return cached;
 let remaining=route.surfaceMetres/2,x=route.points[0]!.x,z=route.points[0]!.z;
 for(let i=1;i<route.points.length;i++){const a=route.points[i-1]!,b=route.points[i]!,length=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);if(remaining<=length){const t=remaining/(length||1);x=a.x+(b.x-a.x)*t;z=a.z+(b.z-a.z)*t;break;}remaining-=length;}
 const segments:Segment[]=[];
 for(let tick=0;tick<REGIONAL_WEATHER_PERIOD_TICKS;){
  const weather=regionalWeatherAt(seed,x,z,tick),dryTicks=Math.round(weather.drySeconds/REGIONAL_WEATHER_STEP),dryStart=tick-dryTicks;
  const lastIntensity=weather.intensity||regionalWeatherAt(seed,x,z,(dryStart-1+REGIONAL_WEATHER_PERIOD_TICKS)%REGIONAL_WEATHER_PERIOD_TICKS).intensity;
  const wetness=weather.intensity?weather.intensity/2:Math.max(0,lastIntensity/2-Math.floor(dryTicks/REGIONAL_TRADE_DRYING_TICKS)/4);
  const end=Math.min(weather.nextChangeTick,weather.intensity||wetness===0?Infinity:dryStart+(Math.floor(dryTicks/REGIONAL_TRADE_DRYING_TICKS)+1)*REGIONAL_TRADE_DRYING_TICKS);
  segments.push({start:tick,end,wetness,microPerTick:Math.round(1.8*(1-wetness/2)*REGIONAL_WEATHER_STEP*1e6),condition:weather.intensity?'wet':wetness?'drying':'dry'});tick=end;
 }
 const result={x,z,segments,cycleMicro:segments.reduce((sum,s)=>sum+(s.end-s.start)*s.microPerTick,0)};corridors.set(route,result);return result;
}
function prefix(c:Corridor,tick:number){const phase=tick%REGIONAL_WEATHER_PERIOD_TICKS;return Math.floor(tick/REGIONAL_WEATHER_PERIOD_TICKS)*c.cycleMicro+c.segments.reduce((sum,s)=>sum+Math.max(0,Math.min(phase,s.end)-s.start)*s.microPerTick,0);}
/** Half-open interval [start,end), at most one bounded season scan per prefix. */
export function regionalTradeWeatherMetres(seed:number,route:RegionalTradeRoutePlan,start:number,end:number):number {
 const c=corridor(seed,route);return (prefix(c,end)-prefix(c,start))/1e6;
}
/** Exact first integer completion tick. The minimum speed proves the binary
 * search bound, including a forecast spanning multiple seasonal boundaries. */
export function regionalTradeWeatherArrival(seed:number,route:RegionalTradeRoutePlan,start:number,metres:number):number {
 const target=Math.max(0,Math.ceil((metres-1e-7)*1e6)),c=corridor(seed,route),base=prefix(c,start);
 let lo=start+1,hi=start+Math.max(1,Math.ceil(target/(REGIONAL_TRADE_MIN_SPEED*REGIONAL_WEATHER_STEP*1e6)));
 while(lo<hi){const mid=Math.floor((lo+hi)/2);if(prefix(c,mid)-base>=target)hi=mid;else lo=mid+1;}return lo;
}
export function regionalTradeRoadWeather(seed:number,route:RegionalTradeRoutePlan,tick:number){
 const c=corridor(seed,route),phase=tick%REGIONAL_WEATHER_PERIOD_TICKS,s=c.segments.find(s=>phase<s.end)!;
 return {wetness:s.wetness,speed:s.microPerTick/(1e6*REGIONAL_WEATHER_STEP),condition:s.condition,nextChangeTick:tick-phase+s.end,exposure:{x:c.x,z:c.z}};
}
