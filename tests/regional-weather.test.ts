import test from 'node:test';
import assert from 'node:assert/strict';
import {regionalWeatherAt,regionalWeatherRainUnits,REGIONAL_WEATHER_PERIOD_TICKS,REGIONAL_WEATHER_STEP,REGIONAL_WEATHER_MAX_TICKS} from '../src/regional-weather.ts';
import {regionalCacheStats} from '../src/regional-world.ts';

const seeds=[0,1,42,73129,0xffff_ffff];
const locations=[{x:0,z:0},{x:-300,z:160},{x:-710,z:590},{x:1160,z:-1170},{x:0,z:1000},{x:1200,z:1200}];
const weather=(seed:number,tick:number,x=1160,z=-1170)=>regionalWeatherAt(seed,x,z,tick);
const units=(seed:number,start:number,end:number,x=1160,z=-1170)=>regionalWeatherRainUnits(seed,x,z,start,end);
function boundaries(seed:number){
 const ticks=[0];
 while(ticks.at(-1)!<REGIONAL_WEATHER_PERIOD_TICKS)ticks.push(weather(seed,ticks.at(-1)!).nextChangeTick);
 return ticks;
}

test('seeded seasons have finite opening rain, at least 1800s drought, recovery, and final dry phase',()=>{
 assert.equal(REGIONAL_WEATHER_PERIOD_TICKS,10_000);
 assert.equal(REGIONAL_WEATHER_PERIOD_TICKS*REGIONAL_WEATHER_STEP,2500);
 const patterns=new Set<string>();
 for(const seed of seeds){
  const ticks=boundaries(seed);assert.equal(ticks.length,7);patterns.add(JSON.stringify(ticks));
  const opening=weather(seed,0),dry=weather(seed,ticks[1]!),recovery=weather(seed,ticks[2]!),clearing=weather(seed,ticks[5]!);
  assert.equal(opening.front,'opening');assert.ok(opening.intensity>=1.5);
  assert.ok(opening.secondsUntilChange>=160&&opening.secondsUntilChange<=220);
  assert.equal(dry.front,'drought');assert.equal(dry.intensity,0);assert.equal(dry.drySeconds,0);
  assert.ok(dry.secondsUntilChange>=2000&&dry.secondsUntilChange<=2040);assert.equal(dry.nextCondition,'rain');
  assert.equal(weather(seed,ticks[2]!-1).drySeconds,dry.secondsUntilChange-.25);
  assert.equal(recovery.front,'recovery');assert.equal(recovery.drySeconds,0);
  assert.equal(recovery.frontStartTick,ticks[2]);assert.equal(recovery.frontEndTick,ticks[5]);
  assert.equal(clearing.front,'clearing');assert.equal(clearing.intensity,0);assert.ok(clearing.secondsUntilChange>=20);
  assert.equal(clearing.nextChangeTick,REGIONAL_WEATHER_PERIOD_TICKS);
  assert.equal(clearing.nextIntensity,opening.intensity);
 }
 assert.ok(patterns.size>=4,'world seeds must materially change the front schedule');
});

test('regional exposure changes intensity while all positions share front boundaries',()=>{
 for(const seed of seeds){
  const ticks=boundaries(seed),zones=new Set<string>(),intensities=new Set<number>(),conditions=new Set<string>();
  for(const {x,z} of locations){
   zones.add(regionalWeatherAt(seed,x,z,0).zoneId);
   for(const tick of ticks.slice(0,-1)){
    const at=regionalWeatherAt(seed,x,z,tick),neighbor=regionalWeatherAt(seed,x+.1,z+.1,tick);
    assert.deepEqual(at,neighbor,'neighbors inside one climate footprint share the same weather');
    assert.equal(at.nextChangeTick,weather(seed,tick).nextChangeTick);
    assert.equal(at.frontStartTick,weather(seed,tick).frontStartTick);
    assert.equal(at.frontEndTick,weather(seed,tick).frontEndTick);
    intensities.add(at.intensity);conditions.add(at.phase);
   }
  }
  assert.equal(zones.size,6);
  assert.deepEqual([...intensities].sort((a,b)=>a-b),[0,.5,1,1.5,2]);
  assert.deepEqual([...conditions].sort(),['drizzle','dry','rain','storm']);
  assert.equal(regionalWeatherAt(seed,-710,590,0).intensity,2);
  assert.equal(regionalWeatherAt(seed,1160,-1170,0).intensity,1.5);
 }
});

test('snapshot boundary semantics and supply tick t minus one are half-open and exact',()=>{
 for(const seed of seeds){
  for(const tick of boundaries(seed).slice(1)){
   const previous=weather(seed,tick-1),next=weather(seed,tick);
   assert.equal(previous.secondsUntilChange,.25);assert.equal(previous.nextChangeTick,tick);
   assert.equal(previous.nextIntensity,next.intensity);assert.equal(previous.nextCondition,next.phase);
   assert.equal(units(seed,tick-1,tick),previous.intensity,'supply tick t uses weather index t-1');
   assert.equal(units(seed,tick,tick+1),next.intensity);
   assert.equal(units(seed,tick-1,tick+1),previous.intensity+next.intensity);
   assert.equal(units(seed,tick,tick),0);
  }
 }
});

test('exact integral agrees with every direct tick and prefix over full sampled seasons',()=>{
 for(const seed of [0,73129])for(const {x,z} of [locations[2]!,locations[3]!]){
  let sum=0;
  for(let tick=0;tick<REGIONAL_WEATHER_PERIOD_TICKS;tick++){
   const intensity=regionalWeatherAt(seed,x,z,tick).intensity;
   assert.equal(regionalWeatherRainUnits(seed,x,z,tick,tick+1),intensity);
   sum+=intensity;
   assert.equal(regionalWeatherRainUnits(seed,x,z,0,tick+1),sum);
  }
  assert.equal(regionalWeatherRainUnits(seed,x,z,0,REGIONAL_WEATHER_PERIOD_TICKS),sum);
 }
});

test('billion-tick integral is exact, bounded, additive, and repeats without clock state',()=>{
 for(const seed of seeds){
  const period=REGIONAL_WEATHER_PERIOD_TICKS,max=REGIONAL_WEATHER_MAX_TICKS,cycle=units(seed,0,period);
  assert.equal(units(seed,0,max),cycle*(max/period));
  for(const [start,end] of [[999_999_600,max],[12345,999_998_765],[0,max],[period-5,period+15]]){
   const split=Math.floor((start!+end!)/2);
   assert.equal(units(seed,start!,end!),units(seed,start!,split)+units(seed,split,end!));
  }
  for(const tick of [0,639,800,8000,9999]){
   const first=weather(seed,tick),far=weather(seed,max-period+tick);
   assert.deepEqual({...far,nextChangeTick:far.nextChangeTick-max+period,frontStartTick:far.frontStartTick-max+period,frontEndTick:far.frontEndTick-max+period},first);
  }
  const last=weather(seed,max);assert.equal(last.cycleSeconds,0);assert.equal(last.front,'opening');
  const before=weather(seed,123);weather(42,9);units(1,0,max);assert.deepEqual(weather(seed,123),before);
 }
});

test('weather queries never compile macro worlds, terrain, or features',()=>{
 const before=regionalCacheStats();
 for(const seed of seeds)for(const {x,z} of locations){regionalWeatherAt(seed,x,z,999_999_999);regionalWeatherRainUnits(seed,x,z,0,1_000_000_000);}
 assert.deepEqual(regionalCacheStats(),before);
});

test('invalid seeds, coordinates, ticks, and reversed intervals reject rather than alias worlds',()=>{
 for(const seed of [-1,1.5,0x1_0000_0000,NaN,Infinity]){
  assert.throws(()=>weather(seed,0),RangeError);assert.throws(()=>units(seed,0,1),RangeError);
 }
 for(const tick of [-1,.5,NaN,Infinity,1_000_000_001]){
  assert.throws(()=>weather(0,tick),RangeError);assert.throws(()=>units(0,tick,1),RangeError);assert.throws(()=>units(0,0,tick),RangeError);
 }
 for(const bad of [NaN,Infinity,-Infinity]){
  assert.throws(()=>regionalWeatherAt(0,bad,0,0),RangeError);assert.throws(()=>regionalWeatherAt(0,0,bad,0),RangeError);
  assert.throws(()=>regionalWeatherRainUnits(0,bad,0,0,1),RangeError);assert.throws(()=>regionalWeatherRainUnits(0,0,bad,0,1),RangeError);
 }
 assert.throws(()=>units(0,2,1),RangeError);
});


test('bounded schedule-cache churn and mutated snapshots cannot alter deterministic weather',()=>{
 const expected=weather(73129,123),total=units(73129,0,1_000_000_000),mutable=weather(73129,123);
 mutable.intensity=0;mutable.front='clearing';
 for(let seed=100;seed<170;seed++)for(const {x,z} of locations){regionalWeatherAt(seed,x,z,123);regionalWeatherRainUnits(seed,x,z,0,10000);}
 assert.deepEqual(weather(73129,123),expected);assert.equal(units(73129,0,1_000_000_000),total);
 // Even a previously cached forecast still validates the original inputs.
 assert.throws(()=>regionalWeatherAt(73129,NaN,-1170,123),RangeError);
 assert.throws(()=>regionalWeatherRainUnits(73129,1160,Infinity,0,1),RangeError);
});
