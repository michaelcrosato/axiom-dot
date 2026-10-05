import test from 'node:test';
import assert from 'node:assert/strict';
import {regionalWeatherAt,regionalWeatherRainUnits,REGIONAL_WEATHER_PERIOD_TICKS,REGIONAL_WEATHER_STEP} from '../src/regional-weather.ts';

// Independent brute-force cross-checks of the public forecast contract. This file
// deliberately does not reuse the held regional-weather review suite.
const seeds=[0,1,73129,0x7fffffff,0xffffffff];
const points=[[0,0],[0,300],[-500,400],[600,-400],[200,600],[300,100]] as const;

test('dry duration, next change and front bounds agree with a direct tick walk across a full season',()=>{
 for(const seed of seeds)for(const [x,z] of points){
  const cycle=Array.from({length:REGIONAL_WEATHER_PERIOD_TICKS},(_,t)=>regionalWeatherAt(seed,x,z,t));
  for(let t=0;t<REGIONAL_WEATHER_PERIOD_TICKS;t+=37){
   const w=cycle[t]!;
   // Continuous dry time at the start of this tick, counting back without crossing a wet tick.
   let dry=0;if(w.intensity===0)for(let k=t-1;k>=0&&cycle[k]!.intensity===0;k--)dry++;
   assert.equal(w.drySeconds,dry*REGIONAL_WEATHER_STEP,`dry ${seed} ${x},${z} @${t}`);
   // The next change is the first tick with a different intensity (wrapping into the next season).
   let change=t+1;while(regionalWeatherAt(seed,x,z,change).intensity===w.intensity)change++;
   assert.equal(w.nextChangeTick,change,`change ${seed} @${t}`);
   assert.equal(w.secondsUntilChange,(change-t)*REGIONAL_WEATHER_STEP);
   assert.equal(w.nextIntensity,regionalWeatherAt(seed,x,z,change).intensity);
   assert.ok(w.frontStartTick<=t&&t<w.frontEndTick,`front ${seed} @${t}`);
   assert.ok(Number.isFinite(w.cycleSeconds)&&w.cycleTick===t);
  }
 }
});

test('rain integral is additive for arbitrary splits and matches per-tick sums across a season boundary',()=>{
 for(const seed of seeds)for(const [x,z] of points){
  const start=REGIONAL_WEATHER_PERIOD_TICKS-1500,end=REGIONAL_WEATHER_PERIOD_TICKS+1500;
  let direct=0;for(let t=start;t<end;t++)direct+=regionalWeatherAt(seed,x,z,t).intensity;
  assert.equal(regionalWeatherRainUnits(seed,x,z,start,end),direct);
  for(const split of [start,start+1,REGIONAL_WEATHER_PERIOD_TICKS,end-1,end])
   assert.equal(regionalWeatherRainUnits(seed,x,z,start,split)+regionalWeatherRainUnits(seed,x,z,split,end),direct);
  assert.equal(regionalWeatherRainUnits(seed,x,z,start,start),0);
 }
});

test('forecast is identical regardless of query order or interleaved seeds',()=>{
 const ticks=[0,1,999,5000,9999,10_000,123_456,999_999_999];
 const forward=ticks.map(t=>JSON.stringify(regionalWeatherAt(73129,600,-400,t)));
 for(let s=0;s<80;s++)regionalWeatherAt(s*7919,s*13-500,s*-11+400,s*101);
 const backward=[...ticks].reverse().map(t=>JSON.stringify(regionalWeatherAt(73129,600,-400,t))).reverse();
 assert.deepEqual(backward,forward);
});
