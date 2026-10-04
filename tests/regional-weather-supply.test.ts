import test from 'node:test';
import assert from 'node:assert/strict';
import {regionalSupplyPlan,regionalSupplyLocalSources,createRegionalSupply,advanceRegionalSupply,applyRegionalSupplyCommand,validRegionalSupply,immutableRegionalSupply,regionalSupplyOutpostAt,regionalSupplyWeather,regionalSupplySummary,type RegionalSupplyState} from '../src/regional-supply.ts';
import {immutableWildernessState} from '../src/wilderness-state.ts';
import {createRegionalState,enableRegionalSupply,applyAction,serializeSave,parseSave} from '../src/world.ts';
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
function fixture(seed=73129,index=0,version:1|2=2){
 const p=regionalSupplyPlan(seed).outposts[index]!,local=regionalSupplyLocalSources(seed,p.id),ids=[...local.wood.slice(0,p.cost.wood),...local.stone.slice(0,p.cost.stone)],identity={generation:2 as const,seed,regional:{version:1 as const}},wilderness=immutableWildernessState({version:1,generation:2,seed,harvested:ids,wood:p.cost.wood,stone:p.cost.stone},identity),ctx={...identity,wilderness,zone:'valley',player:{x:p.deliveryPosition.x,z:p.deliveryPosition.z,hp:100},feetY:p.position.y,grounded:true};
 let state=createRegionalSupply(seed,version);for(const type of ['deliver','build'] as const){const prior=state;state=applyRegionalSupplyCommand(state,ctx,{type,outpostId:p.id,expectedRevision:state.revision}).state;assert.notEqual(state,prior);}
 return {state,ctx,p,index};
}
function run(s:RegionalSupplyState,seconds:number,dt=1){for(let i=0;i<Math.round(seconds/dt);i++)s=advanceRegionalSupply(s,dt);return s;}
function balanced(s:RegionalSupplyState){for(const o of s.outposts){assert(Math.abs(o.captured-o.water-o.consumed-o.spilled-o.residents.reduce((n,a)=>n+a.carrying,0))<.00001);assert(o.captured<=o.precipitation+.00001);}}
test('fresh regional worlds enable weather v2 while old supplied saves remain byte-exact',()=>{
 const world=createRegionalState(42),fresh=enableRegionalSupply(world);assert.equal(fresh.frontierSupply!.version,2);assert.equal(fresh.player,world.player);assert.equal(fresh.seed,world.seed);
 const f=fixture(42,0,1),old={...world,wilderness:f.ctx.wilderness,frontierSupply:run(f.state,500)},before=serializeSave(old),loaded=parseSave(before)!;assert(loaded);assert.equal(serializeSave(loaded),before);assert.equal(enableRegionalSupply(loaded),loaded);assert.equal(loaded.frontierSupply!.version,1);assert.equal(regionalSupplyWeather(loaded.frontierSupply!,f.p.id)!.model,'legacy');assert.equal(serializeSave(parseSave(serializeSave(fresh))!),serializeSave(fresh));
});
test('regional rainfall uses partition-independent production clocks and strict save/reload across seeds',()=>{
 for(const seed of [0,42,73129,0xffffffff]){const f=fixture(seed),whole=run(f.state,360),quarters=run(f.state,360,.25),tenths=run(f.state,360,.1);assert.deepEqual(quarters,whole);assert.deepEqual(tenths,whole);balanced(whole);assert(whole.outposts[0]!.consumed>0);assert(validRegionalSupply(clone(whole),f.ctx));const split=immutableRegionalSupply(clone(run(f.state,163)),f.ctx);assert.deepEqual(run(split,197),whole);for(const dt of [0,-1,NaN,Infinity])assert.equal(advanceRegionalSupply(whole,dt),whole);assert.deepEqual(advanceRegionalSupply(whole,1000),advanceRegionalSupply(whole,1));assert(JSON.stringify(whole).length<15000);}
});
test('drought consumes actual reserves, slows thirsty workers and recovery refills without creating water',()=>{
 const f=fixture();let s=f.state,droughtStart:RegionalSupplyState|undefined,shortage:RegionalSupplyState|undefined,recovered:RegionalSupplyState|undefined;let endWet=0;
 for(let second=1;second<=2500;second++){s=advanceRegionalSupply(s,1);balanced(s);const weather=regionalSupplyWeather(s,f.p.id)!,o=s.outposts[0]!;if(weather.phase==='dry'&&!droughtStart&&o.water>1){droughtStart=s;endWet=o.precipitation;}if(droughtStart&&weather.phase==='dry'&&!shortage){assert.equal(o.precipitation,endWet);if(o.water<1&&o.residents.some(a=>a.thirst>=80))shortage=s;}if(shortage&&weather.phase!=='dry'&&o.water>2&&o.consumed>shortage.outposts[0]!.consumed){recovered=s;break;}}
 assert(droughtStart,'initial rain fills real storage');assert(shortage,'long dry spell exhausts drinkable reserve');assert(recovered,'recovery rainfall resumes real drinking');assert.match(regionalSupplySummary(shortage,s.seed,f.p.id,f.ctx.wilderness)!.cause,/Drinking-water shortage/);assert(recovered.outposts[0]!.precipitation>shortage.outposts[0]!.precipitation);assert(validRegionalSupply(clone(shortage),f.ctx));assert(validRegionalSupply(clone(recovered),f.ctx));assert.deepEqual(regionalSupplyOutpostAt(recovered,f.p.id,shortage.ticks),shortage.outposts[0]);
 const later=run(immutableRegionalSupply(clone(shortage),f.ctx),(recovered.ticks-shortage.ticks)*.25);assert.deepEqual(later,recovered);
});
test('weather model and replay caches cannot substitute legacy water history or accept relabeled totals',()=>{
 const old=fixture(73129,0,1),regional=fixture(73129,0,2),a=run(old.state,480),b=run(regional.state,480);assert.notDeepEqual(a.outposts[0],b.outposts[0]);assert(validRegionalSupply(clone(a),old.ctx));assert(validRegionalSupply(clone(b),regional.ctx));assert.equal(validRegionalSupply({...clone(a),version:2},regional.ctx),false);assert.equal(validRegionalSupply({...clone(b),version:1},old.ctx),false);for(const [s,f]of [[a,old],[b,regional]] as const){const historic=run(f.state,60);assert.deepEqual(regionalSupplyOutpostAt(s,f.p.id,historic.ticks),historic.outposts[0]);}
});
test('world-owned clock advances new weather exactly once and save round-trips during drought',()=>{
 const f=fixture(42),world={...createRegionalState(42),wilderness:f.ctx.wilderness,frontierSupply:f.state};let state=world;for(let i=0;i<1800;i++)state=applyAction(state,{type:'tick',dt:1});assert.deepEqual(state.frontierSupply,run(f.state,1800));assert.equal(regionalSupplyWeather(state.frontierSupply!,f.p.id)!.phase,'dry');const raw=serializeSave(state),loaded=parseSave(raw);assert(loaded);assert.equal(serializeSave(loaded),raw);assert.deepEqual(applyAction(loaded,{type:'tick',dt:.25}).frontierSupply,advanceRegionalSupply(state.frontierSupply!,.25));
});
